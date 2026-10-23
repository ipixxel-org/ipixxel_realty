import { Logger } from '@nestjs/common';

/**
 * Provider-agnostic agent layer.
 *
 * Every provider is an LLM/agent that can turn a prompt into a JSON design
 * document. The active provider, its credentials and its model come from
 * {@link AiProviderConfig}, which AiSettingsService resolves per request from
 * the Super Admin AI settings (database), with .env only as the fallback for
 * blank fields:
 *
 *   gemini    -> geminiApiKey + geminiModel        (Google Gemini)
 *   anthropic -> anthropicApiKey + anthropicModel  (Claude)
 *   external  -> aiGenerateApiUrl                  (any custom agent / hosted model)
 *
 * The configured model is the only model ever called. A 404 from it is
 * reported as "model unavailable" — never silently swapped for another model.
 * Only transient upstream failures (HTTP 429 / 503) are retried, against the
 * same model.
 */

export interface AiJsonRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  generateJson(request: AiJsonRequest): Promise<any>;
}

/** Effective AI settings for one request (see AiSettingsService). */
export interface AiProviderConfig {
  provider: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiThinkingBudget: string;
  anthropicApiKey: string;
  anthropicModel: string;
  aiGenerateApiUrl: string;
  aiGenerateApiKey: string;
}

export type AiProviderErrorKind =
  | 'model_unavailable'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'bad_request'
  | 'invalid_response'
  | 'upstream';

/**
 * Upstream failure with enough context for logs and for AiService to pick an
 * HTTP response. `message` is already sanitized — it never contains secrets.
 */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    readonly provider: string,
    readonly model: string,
    /** Upstream HTTP status, or null when there was no HTTP response. */
    readonly status: number | null,
    message: string,
    readonly attempts = 1,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }

  get transient(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'overloaded';
  }
}

export interface AiRetryOptions {
  /** Total attempts for a transient (429 / 503) failure, including the first. */
  maxAttempts: number;
  /** First backoff delay; doubles per retry. */
  baseDelayMs: number;
  /** Upper bound for any single wait, including a server Retry-After. */
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_OPTIONS: AiRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const logger = new Logger('AiProvider');

const MAX_ERROR_LENGTH = 300;

/**
 * Strip anything credential-like from upstream text before it reaches a log
 * line or an API response: the known secrets themselves, `key=` query
 * parameters and Google API key shapes.
 */
export function sanitizeErrorText(
  text: string,
  secrets: string[] = [],
): string {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && secret.length >= 6)
      out = out.split(secret).join('[redacted]');
  }
  out = out
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/\bAQ\.[0-9A-Za-z_.-]{20,}/g, '[redacted]')
    .replace(/\bsk-[0-9A-Za-z_-]{16,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > MAX_ERROR_LENGTH
    ? `${out.slice(0, MAX_ERROR_LENGTH)}…`
    : out;
}

/** Google/Anthropic error bodies carry the human message at error.message. */
function upstreamMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown };
      message?: unknown;
    } | null;
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // not JSON — fall through to the raw text
  }
  return body;
}

function classifyStatus(status: number, message: string): AiProviderErrorKind {
  if (status === 404) return 'model_unavailable';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 503 || status === 529) return 'overloaded';
  // Gemini answers an invalid key with 400 "API key not valid".
  if (status === 400 && /api[ _-]?key/i.test(message)) return 'auth';
  if (status === 400) return 'bad_request';
  return 'upstream';
}

function upstreamError(
  provider: string,
  model: string,
  response: Response,
  body: string,
  secrets: string[],
): AiProviderError {
  const message = sanitizeErrorText(upstreamMessage(body), secrets);
  return new AiProviderError(
    classifyStatus(response.status, message),
    provider,
    model,
    response.status,
    message || `HTTP ${response.status}`,
  );
}

function networkError(
  provider: string,
  model: string,
  err: unknown,
  secrets: string[],
): AiProviderError {
  const message = err instanceof Error ? err.message : String(err);
  return new AiProviderError(
    'upstream',
    provider,
    model,
    null,
    sanitizeErrorText(`Network error: ${message}`, secrets),
  );
}

/** Seconds from a Retry-After header, when present and numeric. */
function retryAfterMs(response: Response | undefined): number | null {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

export function stripCodeFences(text: string): string {
  const trimmed = (text || '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseJsonLoose(text: string): any {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw err;
  }
}

function parseJsonOrFail(text: string, provider: string, model: string): any {
  try {
    return parseJsonLoose(text);
  } catch {
    throw new AiProviderError(
      'invalid_response',
      provider,
      model,
      200,
      `${provider} (${model}) returned a response that is not valid JSON`,
    );
  }
}

/**
 * Runs one model call, retrying transient failures (429 / 503 / 529) against
 * the same model with exponential backoff (or the server's Retry-After).
 * Every failure is logged with provider, model and status — never the key.
 */
async function withTransientRetry<T>(
  provider: { name: string; model: string },
  retry: AiRetryOptions,
  call: (onResponse: (res: Response) => void) => Promise<T>,
): Promise<T> {
  const maxAttempts = Math.max(1, retry.maxAttempts);
  for (let attempt = 1; ; attempt++) {
    let lastResponse: Response | undefined;
    try {
      return await call((res) => {
        lastResponse = res;
      });
    } catch (err: unknown) {
      if (!(err instanceof AiProviderError)) throw err;
      logger.warn(
        `AI request failed provider=${provider.name} model=${provider.model} ` +
          `status=${err.status ?? 'none'} kind=${err.kind} ` +
          `attempt=${attempt}/${maxAttempts} message="${err.message}"`,
      );
      if (!err.transient || attempt >= maxAttempts) {
        throw new AiProviderError(
          err.kind,
          err.provider,
          err.model,
          err.status,
          err.message,
          attempt,
        );
      }
      const backoff = retry.baseDelayMs * 2 ** (attempt - 1);
      const wait = Math.min(
        retryAfterMs(lastResponse) ?? backoff,
        retry.maxDelayMs,
      );
      await retry.sleep(wait);
    }
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;

  constructor(
    private readonly config: AiProviderConfig,
    private readonly retry: AiRetryOptions = DEFAULT_RETRY_OPTIONS,
  ) {
    this.model = config.geminiModel.trim();
  }

  isConfigured(): boolean {
    return this.config.geminiApiKey.trim().length > 0 && this.model.length > 0;
  }

  generateJson(request: AiJsonRequest): Promise<any> {
    return withTransientRetry(this, this.retry, (onResponse) =>
      this.callModel(request, onResponse),
    );
  }

  private async callModel(
    request: AiJsonRequest,
    onResponse: (res: Response) => void,
  ): Promise<any> {
    const key = this.config.geminiApiKey.trim();
    const secrets = [key];
    // Key goes in a header, not the URL, so it can't leak via URL logging.
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.model)}:generateContent`;

    const generationConfig: Record<string, unknown> = {
      response_mime_type: 'application/json',
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 8192,
    };

    const budgetRaw = this.config.geminiThinkingBudget.trim();
    if (budgetRaw !== '' && this.model.includes('2.5')) {
      const budget = Number(budgetRaw);
      if (Number.isFinite(budget)) {
        generationConfig.thinkingConfig = { thinkingBudget: budget };
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          ...(request.system
            ? { systemInstruction: { parts: [{ text: request.system }] } }
            : {}),
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig,
        }),
      });
    } catch (err: unknown) {
      throw networkError(this.name, this.model, err, secrets);
    }
    onResponse(response);

    const body = await response.text();
    if (!response.ok) {
      throw upstreamError(this.name, this.model, response, body, secrets);
    }

    const data = parseJsonOrFail(body, this.name, this.model);
    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part?.text || '')
      .join('');
    if (!text) {
      throw new AiProviderError(
        'invalid_response',
        this.name,
        this.model,
        response.status,
        `Gemini (${this.model}) returned no content`,
      );
    }
    return parseJsonOrFail(text, this.name, this.model);
  }
}

/**
 * Output budget for one Claude call. Newer Claude models think before
 * answering and those thinking tokens count against max_tokens, so a full
 * page needs more room than the visible JSON alone.
 */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16000;

/**
 * Models that answered "`temperature` is deprecated / not supported" — newer
 * Claude models (e.g. claude-sonnet-5-5) reject the parameter with HTTP 400.
 * Remembered per process so only the first request pays for the retry.
 */
const anthropicNoTemperature = new Set<string>();

function rejectsTemperature(err: AiProviderError): boolean {
  return err.status === 400 && /\btemperature\b/i.test(err.message);
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(
    private readonly config: AiProviderConfig,
    private readonly retry: AiRetryOptions = DEFAULT_RETRY_OPTIONS,
  ) {
    this.model = config.anthropicModel.trim();
  }

  isConfigured(): boolean {
    return (
      this.config.anthropicApiKey.trim().length > 0 && this.model.length > 0
    );
  }

  generateJson(request: AiJsonRequest): Promise<any> {
    return withTransientRetry(this, this.retry, async (onResponse) => {
      const sendTemperature =
        request.temperature !== undefined &&
        !anthropicNoTemperature.has(this.model);
      try {
        return await this.callModel(request, sendTemperature, onResponse);
      } catch (err: unknown) {
        if (
          !sendTemperature ||
          !(err instanceof AiProviderError) ||
          !rejectsTemperature(err)
        ) {
          throw err;
        }
        anthropicNoTemperature.add(this.model);
        logger.log(
          `Model ${this.model} does not accept temperature; retrying without it`,
        );
        return this.callModel(request, false, onResponse);
      }
    });
  }

  private async callModel(
    request: AiJsonRequest,
    sendTemperature: boolean,
    onResponse: (res: Response) => void,
  ): Promise<unknown> {
    const key = this.config.anthropicApiKey.trim();
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
          ...(sendTemperature ? { temperature: request.temperature } : {}),
          ...(request.system ? { system: request.system } : {}),
          messages: [{ role: 'user', content: request.prompt }],
        }),
      });
    } catch (err: unknown) {
      throw networkError(this.name, this.model, err, [key]);
    }
    onResponse(response);

    const body = await response.text();
    if (!response.ok) {
      throw upstreamError(this.name, this.model, response, body, [key]);
    }

    const data = parseJsonOrFail(body, this.name, this.model) as {
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
    } | null;
    if (data?.stop_reason === 'max_tokens') {
      throw new AiProviderError(
        'invalid_response',
        this.name,
        this.model,
        response.status,
        `Claude (${this.model}) ran out of output space before finishing the page. ` +
          'Try a shorter prompt or fewer sections.',
      );
    }
    const text = (data?.content || [])
      .filter((block) => block?.type === 'text')
      .map((block) => block?.text || '')
      .join('\n');
    if (!text) {
      throw new AiProviderError(
        'invalid_response',
        this.name,
        this.model,
        response.status,
        'Anthropic returned no content',
      );
    }
    return parseJsonOrFail(text, this.name, this.model);
  }
}

export class CustomProvider implements AiProvider {
  readonly name = 'external';
  readonly model = 'custom-agent';

  constructor(private readonly config: AiProviderConfig) {}

  isConfigured(): boolean {
    return this.config.aiGenerateApiUrl.trim().length > 0;
  }

  async generateJson(request: AiJsonRequest): Promise<any> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const key = this.config.aiGenerateApiKey.trim();
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }

    let response: Response;
    try {
      response = await fetch(this.config.aiGenerateApiUrl.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          system: request.system ?? '',
          prompt: request.prompt,
          response_format: 'json',
        }),
      });
    } catch (err: unknown) {
      throw networkError(this.name, this.model, err, [key]);
    }

    const body = await response.text();
    if (!response.ok) {
      throw upstreamError(this.name, this.model, response, body, [key]);
    }

    const data = parseJsonOrFail(body, this.name, this.model);
    const unwrapped =
      data?.site ?? data?.data ?? data?.result ?? data?.content ?? data;
    return typeof unwrapped === 'string'
      ? parseJsonOrFail(unwrapped, this.name, this.model)
      : unwrapped;
  }
}

/**
 * Picks the agent named by `config.provider`, or — when that is blank —
 * whichever provider actually has credentials. Returns null when no agent is
 * available so callers can surface a real error instead of a static page.
 */
export function resolveAiProvider(
  config: AiProviderConfig,
  retry: AiRetryOptions = DEFAULT_RETRY_OPTIONS,
): AiProvider | null {
  const registry: Record<string, AiProvider> = {
    gemini: new GeminiProvider(config, retry),
    anthropic: new AnthropicProvider(config, retry),
    external: new CustomProvider(config),
    custom: new CustomProvider(config),
  };

  const requested = config.provider.trim().toLowerCase();
  if (requested) {
    const provider = registry[requested];
    if (!provider) {
      logger.warn(
        `Unknown AI provider "${requested}". Falling back to auto-detect.`,
      );
    } else if (provider.isConfigured()) {
      return provider;
    } else {
      logger.warn(`AI provider "${requested}" is not configured.`);
      return null;
    }
  }

  return (
    [registry.gemini, registry.anthropic, registry.external].find((p) =>
      p.isConfigured(),
    ) || null
  );
}
