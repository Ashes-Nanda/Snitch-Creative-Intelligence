import { describe, expect, test } from 'vitest'
import { createOpenRouterClient, ProviderError } from './openrouter'

// All responses here are mocked; no request leaves the test process.
type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init }
    calls.push(call)
    return respond(call)
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const request = { model: 'anthropic/claude-sonnet-5.5', prompt: 'Describe', imageDataUrl: 'data:image/jpeg;base64,AAAA', schema: { type: 'object' }, signal: new AbortController().signal }

describe('OpenRouter client', () => {
  test('sends the image as a data URL with a strict JSON-schema response format', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ id: 'gen-1', model: 'anthropic/claude-sonnet-5.5', choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.0042 } }),
    )
    const client = createOpenRouterClient({ apiKey: 'sk-test', fetch })
    const res = await client.complete(request)

    expect(res).toEqual({
      id: 'gen-1',
      model: 'anthropic/claude-sonnet-5.5',
      provider: null,
      text: '{"a":1}',
      usage: { promptTokens: 900, completionTokens: 120, cost: 0.0042, cachedPromptTokens: null },
    })
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.model).toBe('anthropic/claude-sonnet-5.5')
    expect(body.usage).toEqual({ include: true })
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'creative_analysis', strict: true, schema: { type: 'object' } } })
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Describe' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ])
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  test.each([
    [401, 'auth', false],
    [402, 'credits', false],
    [429, 'rate_limited', true],
    [408, 'timeout', true],
    [502, 'provider', true],
    [503, 'provider', true],
  ])('maps HTTP %i to a %s error (transient: %s)', async (status, kind, transient) => {
    const { fetch } = fakeFetch(() => json({ error: { code: status, message: 'nope' } }, status, { 'retry-after': '7' }))
    const err = await createOpenRouterClient({ apiKey: 'k', fetch })
      .complete(request)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({ kind, transient, status })
    if (status === 429) expect(err.retryAfterSeconds).toBe(7)
  })

  test('reports an unknown model as model_unavailable', async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: 400, message: 'foo/bar is not a valid model ID' } }, 400))
    const err = await createOpenRouterClient({ apiKey: 'k', fetch })
      .complete({ ...request, model: 'foo/bar' })
      .catch((e) => e)
    expect(err).toMatchObject({ kind: 'model_unavailable', transient: false })
  })

  test('treats a 200 response without message content as an invalid response', async () => {
    const { fetch } = fakeFetch(() => json({ choices: [] }))
    const err = await createOpenRouterClient({ apiKey: 'k', fetch })
      .complete(request)
      .catch((e) => e)
    expect(err).toMatchObject({ kind: 'invalid_response' })
  })

  test('error messages never include the API key', async () => {
    const { fetch } = fakeFetch(() => json({ error: { message: 'bad key sk-secret-123' } }, 401))
    const err = await createOpenRouterClient({ apiKey: 'sk-secret-123', fetch })
      .complete(request)
      .catch((e) => e)
    expect(String(err.message)).not.toContain('sk-secret-123')
  })

  test('reads model capabilities from the models list', async () => {
    const { fetch } = fakeFetch(() =>
      json({
        data: [
          { id: 'vision/model', architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['structured_outputs'] },
          { id: 'text/model', architecture: { input_modalities: ['text'] }, supported_parameters: [] },
        ],
      }),
    )
    const client = createOpenRouterClient({ apiKey: 'k', fetch })
    expect(await client.modelInfo('vision/model')).toEqual({ id: 'vision/model', acceptsImages: true, structuredOutputs: true })
    expect(await client.modelInfo('text/model')).toEqual({ id: 'text/model', acceptsImages: false, structuredOutputs: false })
    expect(await client.modelInfo('missing/model')).toBeNull()
  })

  test('returns the serving provider and cached prompt tokens when reported', async () => {
    const { fetch } = fakeFetch(() =>
      json({ id: 'g', model: 'm', provider: 'Anthropic', choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.1, prompt_tokens_details: { cached_tokens: 4 } } }),
    )
    const res = await createOpenRouterClient({ apiKey: 'k', fetch }).complete(request)
    expect(res.provider).toBe('Anthropic')
    expect(res.usage.cachedPromptTokens).toBe(4)
  })

  test('keeps billed usage on an invalid (empty) response', async () => {
    const { fetch } = fakeFetch(() => json({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 50, completion_tokens: 0, cost: 0.002 } }))
    const err = await createOpenRouterClient({ apiKey: 'k', fetch })
      .complete(request)
      .catch((e) => e)
    expect(err).toMatchObject({ kind: 'invalid_response', usage: { promptTokens: 50, completionTokens: 0, cost: 0.002, cachedPromptTokens: null } })
  })
})
