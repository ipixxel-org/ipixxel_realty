import {
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiSettingsService, AI_SECRET_MASK } from './ai-settings.service';
import { AiService } from './ai.service';

const DB_KEY = 'AQ.db-saved-key-0123456789abcdefghijklmnop';

/** Minimal in-memory stand-in for the single "identity"."ai_settings" row. */
function fakePrisma(initial: Record<string, unknown> | null = null) {
  let row = initial;
  return {
    get row() {
      return row;
    },
    $queryRawUnsafe: jest.fn(() => Promise.resolve(row ? [row] : [])),
    $executeRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
      if (/^\s*INSERT INTO "identity"\."ai_settings"/.test(sql)) {
        const [
          provider,
          gemini_api_key,
          gemini_model,
          gemini_thinking_budget,
          anthropic_api_key,
          anthropic_model,
          ai_generate_api_url,
          ai_generate_api_key,
        ] = params;
        row = {
          id: 'default',
          provider,
          gemini_api_key,
          gemini_model,
          gemini_thinking_budget,
          anthropic_api_key,
          anthropic_model,
          ai_generate_api_url,
          ai_generate_api_key,
          updated_at: new Date().toISOString(),
        };
      } else if (/^\s*DELETE FROM "identity"\."ai_settings"/.test(sql)) {
        row = null;
      }
      return Promise.resolve(1);
    }),
  };
}

function geminiOk(json: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    }),
    { status: 200 },
  );
}

function geminiError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
  });
}

const ENV_KEYS = ['AI_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL'];
let savedEnv: Record<string, string | undefined>;
let fetchMock: jest.SpyInstance;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  // Stale .env values that must NOT win over the saved database settings.
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'AIzaStaleEnvKey00000000000000000000000';
  process.env.GEMINI_MODEL = 'gemini-2.0-flash';
  fetchMock = jest.spyOn(global, 'fetch');
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.restoreAllMocks();
});

function requestedModel(callIndex = 0): string {
  const [url] = fetchMock.mock.calls[callIndex] as [string];
  return decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)![1]);
}

function requestedKey(callIndex = 0): string {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return (init.headers as Record<string, string>)['x-goog-api-key'];
}

describe('AiSettingsService', () => {
  it('prefers saved database values over stale environment variables', async () => {
    const prisma = fakePrisma({
      id: 'default',
      provider: 'gemini',
      gemini_api_key: DB_KEY,
      gemini_model: 'gemini-3.8-flash',
    });
    const settings = new AiSettingsService(prisma as never);

    const cfg = await settings.getProviderConfig();

    expect(cfg.provider).toBe('gemini');
    expect(cfg.geminiApiKey).toBe(DB_KEY);
    expect(cfg.geminiModel).toBe('gemini-3.8-flash');
  });

  it('falls back to .env only for fields left blank in the database', async () => {
    const prisma = fakePrisma({
      id: 'default',
      gemini_model: 'gemini-3.7-flash',
    });
    const settings = new AiSettingsService(prisma as never);

    const cfg = await settings.getProviderConfig();

    expect(cfg.geminiModel).toBe('gemini-3.7-flash');
    expect(cfg.geminiApiKey).toBe('AIzaStaleEnvKey00000000000000000000000');
  });

  it('shows admins the same model the generator will use, and masks secrets', async () => {
    const prisma = fakePrisma({
      id: 'default',
      provider: 'gemini',
      gemini_api_key: DB_KEY,
      gemini_model: 'gemini-3.8-flash',
    });
    const settings = new AiSettingsService(prisma as never);

    const view = await settings.getForAdmin();
    const cfg = await settings.getProviderConfig();

    expect(view.geminiModel).toBe(cfg.geminiModel);
    expect(view.geminiApiKey).toBe(AI_SECRET_MASK);
    expect(JSON.stringify(view)).not.toContain(DB_KEY);
  });

  it('applies a saved model to the next request without a restart', async () => {
    const prisma = fakePrisma({
      id: 'default',
      provider: 'gemini',
      gemini_api_key: DB_KEY,
      gemini_model: 'gemini-3.7-flash',
    });
    const settings = new AiSettingsService(prisma as never);
    const ai = new AiService(prisma as never, settings);
    fetchMock.mockImplementation(() =>
      Promise.resolve(geminiOk({ id: 'x', type: 'cta', props: {} })),
    );
    const dto = {
      action: 'rewrite',
      block: { id: 'x', type: 'cta', props: {} },
    } as never;

    await ai.regenerateSection(dto);
    await settings.update({ geminiModel: 'gemini-3.8-flash' });
    await ai.regenerateSection(dto);

    expect(requestedModel(0)).toBe('gemini-3.7-flash');
    expect(requestedModel(1)).toBe('gemini-3.8-flash');
    expect(requestedKey(1)).toBe(DB_KEY);
    expect((await ai.getStatus()).model).toBe('gemini-3.8-flash');
  });

  it('does not write AI settings into process.env', async () => {
    const prisma = fakePrisma();
    const settings = new AiSettingsService(prisma as never);

    await settings.update({
      provider: 'gemini',
      geminiApiKey: DB_KEY,
      geminiModel: 'gemini-3.8-flash',
    });

    expect(process.env.GEMINI_API_KEY).not.toBe(DB_KEY);
    expect(process.env.GEMINI_MODEL).toBe('gemini-2.0-flash');
    expect((await settings.getProviderConfig()).geminiModel).toBe(
      'gemini-3.8-flash',
    );
  });
});

describe('AiService error responses', () => {
  function service(model = 'gemini-3.8-flash') {
    const prisma = fakePrisma({
      id: 'default',
      provider: 'gemini',
      gemini_api_key: DB_KEY,
      gemini_model: model,
    });
    return new AiService(
      prisma as never,
      new AiSettingsService(prisma as never),
    );
  }
  const dto = {
    action: 'rewrite',
    block: { id: 'x', type: 'cta', props: {} },
  } as never;

  async function responseOf(promise: Promise<unknown>) {
    const err = (await promise.catch((e: unknown) => e)) as HttpException;
    return {
      status: err.getStatus(),
      body: err.getResponse() as Record<string, unknown> & { message: string },
    };
  }

  it('returns 503 AI_MODEL_UNAVAILABLE naming the configured model on a 404', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        geminiError(
          404,
          'models/gemini-9-flash is not found for API version v1beta',
        ),
      ),
    );

    const { status, body } = await responseOf(
      service('gemini-9-flash').regenerateSection(dto),
    );

    expect(status).toBe(503);
    expect(body).toMatchObject({
      code: 'AI_MODEL_UNAVAILABLE',
      provider: 'gemini',
      model: 'gemini-9-flash',
      upstreamStatus: 404,
    });
    expect(body.message).toContain('gemini-9-flash');
    expect(body.message).toContain('Integrations');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 503 AI_PROVIDER_BUSY after retrying a persistent 503 on the same model', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      fetchMock.mockImplementation(() =>
        Promise.resolve(geminiError(503, 'high demand')),
      );
      const pending = responseOf(service().regenerateSection(dto));
      await jest.runAllTimersAsync();
      const { status, body } = await pending;

      expect(status).toBe(503);
      expect(body).toMatchObject({
        code: 'AI_PROVIDER_BUSY',
        model: 'gemini-3.8-flash',
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++)
        expect(requestedModel(i)).toBe('gemini-3.8-flash');
    } finally {
      jest.useRealTimers();
    }
  });

  it('never exposes the API key in the error response', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(geminiError(500, `internal error key=${DB_KEY}`)),
    );

    const { status, body } = await responseOf(service().regenerateSection(dto));

    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain(DB_KEY);
  });

  it('returns 503 when no provider is configured', async () => {
    const prisma = fakePrisma({
      id: 'default',
      provider: 'gemini',
      gemini_api_key: '',
    });
    process.env.GEMINI_API_KEY = '';
    const ai = new AiService(
      prisma as never,
      new AiSettingsService(prisma as never),
    );

    await expect(ai.regenerateSection(dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
