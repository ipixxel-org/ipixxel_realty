import { Logger } from '@nestjs/common';

/**
 * Provider-agnostic agent layer.
 *
 * Every provider is an LLM/agent that can turn a prompt into a JSON design
 * document. Which one is used is decided by `AI_PROVIDER` in the environment
 * (auto-detected from whichever key is present when blank):
 *
 *   gemini    -> GEMINI_API_KEY      (Google Gemini)
 *   anthropic -> ANTHROPIC_API_KEY   (Claude)
 *   external  -> AI_GENERATE_API_URL (any custom agent / hosted model)
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

const logger = new Logger('AiProvider');

function env(name: string): string {
  return (process.env[name] || '').trim();
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

function ok(response: Response, provider: string, body: string) {
  if (!response.ok) {
    throw new Error(
      `${provider} request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }
}

class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model = env('GEMINI_MODEL') || 'gemini-3.8-flash';

  isConfigured(): boolean {
    return env('GEMINI_API_KEY').length > 0;
  }

  async generateJson(request: AiJsonRequest): Promise<any> {
    const key = env('GEMINI_API_KEY');
    const configuredModel = this.model;
    const candidates = Array.from(
      new Set([
        configuredModel,
        'gemini-3.8-flash',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
      ]),
    );

    let lastError: Error | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const modelName = candidates[i];
      try {
        return await this.callModel(modelName, key, request);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        // Retry another model when the current one is busy *or* gone (a
        // retired/renamed model returns 404 "not found / no longer available").
        const isRetryable =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('404') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.toLowerCase().includes('not found') ||
          msg.toLowerCase().includes('no longer available');

        if (isRetryable && i < candidates.length - 1) {
          logger.warn(
            `Gemini model "${modelName}" unavailable (${msg.slice(0, 80)}). Retrying with "${candidates[i + 1]}"...`,
          );
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini candidate models failed');
  }

  private async callModel(
    modelName: string,
    key: string,
    request: AiJsonRequest,
  ): Promise<any> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${modelName}:generateContent?key=${key}`;

    const generationConfig: Record<string, unknown> = {
      response_mime_type: 'application/json',
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 8192,
    };

    const budgetRaw = env('GEMINI_THINKING_BUDGET');
    if (budgetRaw !== '' && modelName.includes('2.5')) {
      const budget = Number(budgetRaw);
      if (Number.isFinite(budget)) {
        generationConfig.thinkingConfig = { thinkingBudget: budget };
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(request.system
          ? { systemInstruction: { parts: [{ text: request.system }] } }
          : {}),
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig,
      }),
    });

    const body = await response.text();
    ok(response, `Gemini (${modelName})`, body);

    const data = JSON.parse(body);
    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part?.text || '')
      .join('');
    if (!text) {
      throw new Error(`Gemini (${modelName}) returned no content`);
    }
    return parseJsonLoose(text);
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model = env('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514';

  isConfigured(): boolean {
    return env('ANTHROPIC_API_KEY').length > 0;
  }

  async generateJson(request: AiJsonRequest): Promise<any> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 8192,
        temperature: request.temperature ?? 0.7,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    const body = await response.text();
    ok(response, 'Anthropic', body);

    const data = JSON.parse(body);
    const text: string = (data?.content || [])
      .filter((block: { type?: string }) => block?.type === 'text')
      .map((block: { text?: string }) => block?.text || '')
      .join('\n');
    if (!text) {
      throw new Error('Anthropic returned no content');
    }
    return parseJsonLoose(text);
  }
}

class CustomProvider implements AiProvider {
  readonly name = 'external';
  readonly model = 'custom-agent';

  isConfigured(): boolean {
    return env('AI_GENERATE_API_URL').length > 0;
  }

  async generateJson(request: AiJsonRequest): Promise<any> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const key = env('AI_GENERATE_API_KEY');
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }

    const response = await fetch(env('AI_GENERATE_API_URL'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        system: request.system ?? '',
        prompt: request.prompt,
        response_format: 'json',
      }),
    });

    const body = await response.text();
    ok(response, 'External agent', body);

    const data = parseJsonLoose(body);
    const unwrapped =
      data?.site ?? data?.data ?? data?.result ?? data?.content ?? data;
    return typeof unwrapped === 'string' ? parseJsonLoose(unwrapped) : unwrapped;
  }
}

/**
 * Resolves the active agent from `AI_PROVIDER`, falling back to whichever
 * provider actually has credentials configured. Returns null when no agent is
 * available so callers can surface a real error instead of a static page.
 */
export function resolveAiProvider(): AiProvider | null {
  const registry: Record<string, AiProvider> = {
    gemini: new GeminiProvider(),
    anthropic: new AnthropicProvider(),
    external: new CustomProvider(),
    custom: new CustomProvider(),
  };

  const requested = env('AI_PROVIDER').toLowerCase();
  if (requested) {
    const provider = registry[requested];
    if (!provider) {
      logger.warn(
        `Unknown AI_PROVIDER "${requested}". Falling back to auto-detect.`,
      );
    } else if (provider.isConfigured()) {
      return provider;
    } else {
      logger.warn(`AI_PROVIDER "${requested}" is not configured.`);
      return null;
    }
  }

  return (
    [registry.gemini, registry.anthropic, registry.external].find((p) =>
      p.isConfigured(),
    ) || null
  );
}
