import { Logger } from '@nestjs/common';
import {
  AiProviderError,
  GeminiProvider,
  resolveAiProvider,
  sanitizeErrorText,
  type AiProviderConfig,
  type AiRetryOptions,
} from './ai-provider';

const KEY = 'AQ.test-secret-key-0123456789abcdefghijklmnop';

function config(over: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    provider: 'gemini',
    geminiApiKey: KEY,
    geminiModel: 'gemini-3.8-flash',
    geminiThinkingBudget: '',
    anthropicApiKey: '',
    anthropicModel: 'claude-sonnet-4-20250514',
    aiGenerateApiUrl: '',
    aiGenerateApiKey: '',
    ...over,
  };
}

function geminiOk(json: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function geminiError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const sleeps: number[] = [];
const retry: AiRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  sleep: (ms) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
};

let fetchMock: jest.SpyInstance;
let logs: string[];

beforeEach(() => {
  sleeps.length = 0;
  logs = [];
  fetchMock = jest.spyOn(global, 'fetch');
  for (const level of ['log', 'warn', 'error'] as const) {
    jest
      .spyOn(Logger.prototype, level)
      .mockImplementation((msg: unknown) => void logs.push(String(msg)));
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

function requestedModels(): string[] {
  return (fetchMock.mock.calls as Array<[string]>).map(([url]) =>
    decodeURIComponent(/models\/([^:]+):generateContent/.exec(String(url))![1]),
  );
}

describe('GeminiProvider', () => {
  it('sends the configured model and keeps the key out of the URL', async () => {
    fetchMock.mockResolvedValueOnce(geminiOk({ ok: true }));
    const provider = new GeminiProvider(config(), retry);

    await expect(provider.generateJson({ prompt: 'hi' })).resolves.toEqual({
      ok: true,
    });

    expect(requestedModels()).toEqual(['gemini-3.8-flash']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain(KEY);
    expect(String(url)).not.toContain('key=');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': KEY });
  });

  it('reports a 404 as model unavailable without trying any other model', async () => {
    fetchMock.mockResolvedValue(
      geminiError(
        404,
        'models/gemini-9-flash is not found for API version v1beta',
      ),
    );
    const provider = new GeminiProvider(
      config({ geminiModel: 'gemini-9-flash' }),
      retry,
    );

    const err: unknown = await provider
      .generateJson({ prompt: 'hi' })
      .catch((e: unknown) => e as AiProviderError);

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({
      kind: 'model_unavailable',
      provider: 'gemini',
      model: 'gemini-9-flash',
      status: 404,
      attempts: 1,
    });
    expect(requestedModels()).toEqual(['gemini-9-flash']);
    expect(sleeps).toEqual([]);
  });

  it('retries a transient 503 on the same model and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        geminiError(503, 'This model is currently experiencing high demand.'),
      )
      .mockResolvedValueOnce(geminiError(429, 'Resource has been exhausted'))
      .mockResolvedValueOnce(geminiOk({ blocks: [] }));
    const provider = new GeminiProvider(config(), retry);

    await expect(provider.generateJson({ prompt: 'hi' })).resolves.toEqual({
      blocks: [],
    });

    expect(requestedModels()).toEqual([
      'gemini-3.8-flash',
      'gemini-3.8-flash',
      'gemini-3.8-flash',
    ]);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('honours Retry-After, capped at maxDelayMs', async () => {
    fetchMock
      .mockResolvedValueOnce(geminiError(429, 'quota', { 'retry-after': '3' }))
      .mockResolvedValueOnce(
        geminiError(429, 'quota', { 'retry-after': '120' }),
      )
      .mockResolvedValueOnce(geminiOk({ ok: 1 }));

    await new GeminiProvider(config(), retry).generateJson({ prompt: 'hi' });

    expect(sleeps).toEqual([3000, 8000]);
  });

  it('gives up after maxAttempts on persistent 503 and reports the attempts', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(geminiError(503, 'high demand')),
    );

    const err: unknown = await new GeminiProvider(config(), retry)
      .generateJson({ prompt: 'hi' })
      .catch((e: unknown) => e as AiProviderError);

    expect(err).toMatchObject({ kind: 'overloaded', status: 503, attempts: 3 });
    expect(requestedModels()).toEqual(Array(3).fill('gemini-3.8-flash'));
  });

  it('does not retry auth or bad-request errors', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        geminiError(400, 'API key not valid. Please pass a valid API key.'),
      ),
    );

    const err: unknown = await new GeminiProvider(config(), retry)
      .generateJson({ prompt: 'hi' })
      .catch((e: unknown) => e as AiProviderError);

    expect(err).toMatchObject({ kind: 'auth', status: 400, attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs provider, model and status but never the API key', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(geminiError(503, `overloaded for key=${KEY}`)),
    );

    await new GeminiProvider(config(), retry)
      .generateJson({ prompt: 'hi' })
      .catch(() => undefined);

    const joined = logs.join('\n');
    expect(joined).toContain('provider=gemini');
    expect(joined).toContain('model=gemini-3.8-flash');
    expect(joined).toContain('status=503');
    expect(joined).not.toContain(KEY);
  });

  it('treats a network failure as a non-retried upstream error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const err: unknown = await new GeminiProvider(config(), retry)
      .generateJson({ prompt: 'hi' })
      .catch((e: unknown) => e as AiProviderError);

    expect(err).toMatchObject({ kind: 'upstream', status: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAiProvider', () => {
  it('uses the provider and model from the given config', () => {
    const provider = resolveAiProvider(
      config({ geminiModel: 'gemini-3.6-flash' }),
    );
    expect(provider?.name).toBe('gemini');
    expect(provider?.model).toBe('gemini-3.6-flash');
  });

  it('returns null when the selected provider has no key', () => {
    expect(resolveAiProvider(config({ geminiApiKey: '' }))).toBeNull();
  });

  it('auto-detects a configured provider when none is selected', () => {
    const provider = resolveAiProvider(
      config({ provider: '', geminiApiKey: '', anthropicApiKey: 'sk-ant-xyz' }),
    );
    expect(provider?.name).toBe('anthropic');
  });
});

describe('sanitizeErrorText', () => {
  it('redacts known secrets, key params and Google key shapes', () => {
    const text = sanitizeErrorText(
      `bad ${KEY} url?key=abc123def&x=1 AIzaSyA1234567890abcdefghijklmnop`,
      [KEY],
    );
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('abc123def');
    expect(text).not.toContain('AIzaSy');
    expect(text).toContain('[redacted]');
  });
});
