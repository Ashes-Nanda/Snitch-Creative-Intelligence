import { describe, expect, test } from 'vitest'
import { createAnalysisService, memoryAnalysisStore, type ImageFetcher } from './analysis-service'
import { ProviderError, type CallMeta, type OpenRouterClient, type VisionRequest, type VisionResponse } from './openrouter'

// Every provider response below is a MOCK. Mocked records carry model "mock/vision" and ids starting "mock-",
// so they can never be mistaken for a live OpenRouter result.
const MOCK_MODEL = 'mock/vision'

const validOutput = JSON.stringify({
  observations: {
    format_composition: 'Single product photo on a plain background',
    garments: [{ type: 'jeans', colour: 'mid blue', pattern: null, details: 'faded wash' }],
    product_prominence: 'dominant',
    people: 'one',
    background: 'Plain white studio backdrop',
    visual_style: 'studio',
    visible_text: [],
    offer_text: null,
    cta_text: null,
    text_density: 'none',
  },
  classification: { hook_type: 'product-first', cta_type: 'none' },
  interpretations: { creative_angle: 'Fit-focused catalogue shot', rationale: 'Full-length framing on the garment' },
  uncertain: [{ attribute: 'fabric', reason: 'Not determinable from the image' }],
  summary: 'Model wearing mid-blue jeans against a white backdrop.',
})

type Step = VisionResponse | ProviderError | 'hang'

function mockClient(steps: Step[], model = { id: MOCK_MODEL, acceptsImages: true, structuredOutputs: true } as const) {
  const calls: VisionRequest[] = []
  const metas: (CallMeta | undefined)[] = []
  let i = 0
  const client: OpenRouterClient = {
    async complete(req, meta) {
      calls.push(req)
      metas.push(meta)
      const step = steps[Math.min(i++, steps.length - 1)]
      if (step === 'hang') return new Promise<VisionResponse>(() => {})
      if (step instanceof ProviderError) throw step
      return step
    },
    async modelInfo(id) {
      return model && id === model.id ? { ...model } : null
    },
  }
  return { client, calls, metas }
}

const ok = (text = validOutput, n = 1): VisionResponse => ({ id: `mock-${n}`, model: MOCK_MODEL, provider: 'MockProvider', text, usage: { promptTokens: 1000, completionTokens: 200, cost: 0.004, cachedPromptTokens: null } })

const goodImage: ImageFetcher = async () => ({ ok: true, contentType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) })

const creative = { creativeId: 'cr-015', assetUrl: 'https://cdn.example.com/jeans.jpg', name: 'Jeans', assetType: 'product_image' as const }

let clock = Date.UTC(2026, 9, 26, 18, 0)
const now = () => new Date((clock += 1000))

function service(opts: Partial<Parameters<typeof createAnalysisService>[0]> & { client: OpenRouterClient }) {
  const sleeps: number[] = []
  const svc = createAnalysisService({
    config: { apiKey: 'sk-test', model: MOCK_MODEL },
    store: memoryAnalysisStore(),
    fetchImage: goodImage,
    now,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    timeoutMs: 20,
    maxAttempts: 3,
    log: () => {},
    ...opts,
  })
  return { svc, sleeps }
}

describe('analysis service', () => {
  test('without an API key it reports a configuration error and calls nothing', async () => {
    const { client, calls } = mockClient([ok()])
    const { svc } = service({ client, config: { apiKey: undefined, model: MOCK_MODEL } })
    expect(svc.status()).toEqual({ configured: false, model: MOCK_MODEL, problem: 'OPENROUTER_API_KEY is not set on the server.' })
    const res = await svc.analyze(creative)
    expect(res).toMatchObject({ ok: false, error: { kind: 'config' } })
    expect(calls).toHaveLength(0)
    expect(svc.records()).toEqual([])
  })

  test('without a model it reports a configuration error', async () => {
    const { client } = mockClient([ok()])
    const { svc } = service({ client, config: { apiKey: 'k', model: undefined } })
    expect(svc.status().problem).toBe('OPENROUTER_MODEL is not set on the server.')
  })

  test('a successful analysis is validated, persisted against the creative ID, and carries model, timing and cost', async () => {
    const { client } = mockClient([ok()])
    const store = memoryAnalysisStore()
    const { svc } = service({ client, store })
    const res = await svc.analyze(creative)

    expect(res.ok).toBe(true)
    const record = store.load()['cr-015']
    expect(record).toMatchObject({ creativeId: 'cr-015', assetUrl: creative.assetUrl, status: 'completed' })
    expect(record.current).toMatchObject({ creativeId: 'cr-015', hookType: 'product-first', productProminence: 'dominant', modelVersion: MOCK_MODEL })
    expect(record.lastAttempt).toMatchObject({ outcome: 'completed', model: MOCK_MODEL, attempts: 1, responseId: 'mock-1', usage: { promptTokens: 1000, completionTokens: 200, cost: 0.004, cachedPromptTokens: null } })
    expect(record.lastAttempt?.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('reuses a completed analysis for an unchanged asset and model unless forced', async () => {
    const { client, calls } = mockClient([ok(), ok(validOutput, 2)])
    const { svc } = service({ client })
    await svc.analyze(creative)
    const again = await svc.analyze(creative)
    expect(again).toMatchObject({ ok: true, cached: true })
    expect(calls).toHaveLength(1)
    await svc.analyze(creative, { force: true })
    expect(calls).toHaveLength(2)
    expect(svc.records()).toHaveLength(1)
  })

  test('re-analyses when the asset URL changed', async () => {
    const { client, calls } = mockClient([ok()])
    const { svc } = service({ client })
    await svc.analyze(creative)
    await svc.analyze({ ...creative, assetUrl: 'https://cdn.example.com/jeans-v2.jpg' })
    expect(calls).toHaveLength(2)
  })

  test('concurrent requests for the same creative share one provider call', async () => {
    const { client, calls } = mockClient([ok()])
    const { svc } = service({ client })
    const [a, b] = await Promise.all([svc.analyze(creative), svc.analyze(creative)])
    expect(calls).toHaveLength(1)
    expect(a).toEqual(b)
  })

  test('shows the creative as processing while a request is in flight', async () => {
    let release!: (r: VisionResponse) => void
    const client: OpenRouterClient = {
      complete: () => new Promise((r) => (release = r)),
      modelInfo: async () => ({ id: MOCK_MODEL, acceptsImages: true, structuredOutputs: true }),
    }
    const { svc } = service({ client, timeoutMs: 5000 })
    const pending = svc.analyze(creative)
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.records()).toEqual([expect.objectContaining({ creativeId: 'cr-015', status: 'processing' })])
    release(ok())
    await pending
    expect(svc.records()[0].status).toBe('completed')
  })

  test('an inaccessible image fails without calling the model', async () => {
    const { client, calls } = mockClient([ok()])
    const { svc } = service({ client, fetchImage: async () => ({ ok: false, reason: 'Image URL returned 404' }) })
    const res = await svc.analyze(creative)
    expect(res).toMatchObject({ ok: false, error: { kind: 'image_unavailable', message: 'Image URL returned 404' } })
    expect(calls).toHaveLength(0)
    expect(svc.records()[0]).toMatchObject({ status: 'failed', current: null, lastAttempt: { outcome: 'failed', error: { kind: 'image_unavailable' } } })
  })

  test('rejects unsupported image formats and oversized images before calling the model', async () => {
    const { client, calls } = mockClient([ok()])
    const svg = service({ client, fetchImage: async () => ({ ok: true, contentType: 'image/svg+xml', bytes: new Uint8Array(3) }) }).svc
    expect(await svg.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'image_unavailable', message: 'Unsupported image format: image/svg+xml' } })
    const huge = service({ client, fetchImage: async () => ({ ok: true, contentType: 'image/png', bytes: new Uint8Array(6 * 1024 * 1024) }) }).svc
    expect(await huge.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'image_unavailable' } })
    expect(calls).toHaveLength(0)
  })

  test('retries a rate-limited request, honouring Retry-After, then succeeds', async () => {
    const { client, calls } = mockClient([new ProviderError('rate_limited', 'slow down', true, 429, 3), ok()])
    const { svc, sleeps } = service({ client })
    const res = await svc.analyze(creative)
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(sleeps).toEqual([3000])
    expect(svc.records()[0].lastAttempt?.attempts).toBe(2)
  })

  test('gives up after the bounded number of attempts on repeated timeouts', async () => {
    const { client, calls } = mockClient(['hang'])
    const { svc } = service({ client, maxAttempts: 2 })
    const res = await svc.analyze(creative)
    expect(calls).toHaveLength(2)
    expect(res).toMatchObject({ ok: false, error: { kind: 'timeout' } })
  })

  test('does not retry non-transient errors such as exhausted credits', async () => {
    const { client, calls } = mockClient([new ProviderError('credits', 'no credits', false, 402)])
    const { svc } = service({ client })
    expect(await svc.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'credits' } })
    expect(calls).toHaveLength(1)
  })

  test('malformed model output fails validation and is not retried', async () => {
    const { client, calls } = mockClient([ok('Sure! Here is the analysis: a man in jeans.')])
    const { svc } = service({ client })
    const res = await svc.analyze(creative)
    expect(res).toMatchObject({ ok: false, error: { kind: 'invalid_response' } })
    expect(calls).toHaveLength(1)
    expect(svc.records()[0].lastAttempt?.error?.details).toEqual(['output: response was not valid JSON'])
  })

  test('refuses a model that cannot take images, and an unknown model', async () => {
    const textOnly = mockClient([ok()], { id: MOCK_MODEL, acceptsImages: false, structuredOutputs: true } as never)
    expect(await service({ client: textOnly.client }).svc.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'unsupported_model' } })
    expect(textOnly.calls).toHaveLength(0)

    const unknown = mockClient([ok()], null as never)
    expect(await service({ client: unknown.client }).svc.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'model_unavailable' } })
  })

  test('a retry after a failure completes and replaces the failure without adding a record', async () => {
    const { client } = mockClient([new ProviderError('credits', 'no credits', false, 402), ok()])
    const { svc } = service({ client })
    await svc.analyze(creative)
    expect(svc.records()[0].status).toBe('failed')
    const retry = await svc.analyze(creative)
    expect(retry.ok).toBe(true)
    expect(svc.records()).toHaveLength(1)
    expect(svc.records()[0]).toMatchObject({ status: 'completed', lastAttempt: { outcome: 'completed' } })
  })

  test('a failed re-analysis keeps the earlier successful result', async () => {
    const { client } = mockClient([ok(), new ProviderError('provider', 'down', false, 500)])
    const { svc } = service({ client })
    await svc.analyze(creative)
    const res = await svc.analyze(creative, { force: true })
    expect(res.ok).toBe(false)
    const record = svc.records()[0]
    expect(record.status).toBe('completed')
    expect(record.current?.hookType).toBe('product-first')
    expect(record.lastAttempt).toMatchObject({ outcome: 'failed', error: { kind: 'provider' } })
  })

  test('results survive a restart through the store', async () => {
    const store = memoryAnalysisStore()
    await service({ client: mockClient([ok()]).client, store }).svc.analyze(creative)
    const { client, calls } = mockClient([ok()])
    const restarted = service({ client, store }).svc
    expect(restarted.records()[0].status).toBe('completed')
    expect((await restarted.analyze(creative)).cached).toBe(true)
    expect(calls).toHaveLength(0)
  })

  test('a store write failure is reported and nothing is shown as saved', async () => {
    const store = { load: () => ({}), save: () => { throw new Error('disk full') } }
    const { svc } = service({ client: mockClient([ok()]).client, store })
    expect(await svc.analyze(creative)).toMatchObject({ ok: false, error: { kind: 'persist' } })
    expect(svc.records()).toEqual([])
  })

  test('logs outcome metadata but never the API key', async () => {
    const lines: string[] = []
    const { svc } = service({ client: mockClient([ok()]).client, config: { apiKey: 'sk-very-secret', model: MOCK_MODEL }, log: (entry) => lines.push(JSON.stringify(entry)) })
    await svc.analyze(creative)
    expect(lines.join('\n')).toContain('"outcome":"completed"')
    expect(lines.join('\n')).not.toContain('sk-very-secret')
  })

  test('tells the client which run, creative and attempt each call belongs to', async () => {
    const { client, metas } = mockClient([new ProviderError('rate_limited', 'slow', true, 429, 1), ok()])
    const { svc } = service({ client, origin: 'test' })
    await svc.analyze(creative, { runId: 'run-1' })
    expect(metas).toEqual([
      { runId: 'run-1', workflow: 'image_analysis', creativeId: 'cr-015', attempt: 1, origin: 'test' },
      { runId: 'run-1', workflow: 'image_analysis', creativeId: 'cr-015', attempt: 2, origin: 'test' },
    ])
  })

  test('reports each validation outcome to an optional hook', async () => {
    const seen: unknown[] = []
    const { client } = mockClient([ok('not json'), ok()])
    const { svc } = service({ client, onValidation: (e) => seen.push(e) })
    await svc.analyze(creative, { runId: 'r' })
    await svc.analyze(creative, { runId: 'r2' })
    expect(seen).toEqual([
      { runId: 'r', creativeId: 'cr-015', attempt: 1, status: 'invalid', reasons: ['output: response was not valid JSON'] },
      { runId: 'r2', creativeId: 'cr-015', attempt: 1, status: 'valid', reasons: [] },
    ])
  })

  test('keeps billed usage when the model returned an empty answer', async () => {
    const usage = { promptTokens: 900, completionTokens: 0, cost: 0.003, cachedPromptTokens: null }
    const { client } = mockClient([new ProviderError('invalid_response', 'empty', false, 200, undefined, usage)])
    const { svc } = service({ client })
    await svc.analyze(creative)
    expect(svc.records()[0].lastAttempt?.usage).toEqual(usage)
  })

  test('reports a reused (cached) result to an optional hook, since no provider call is made', async () => {
    const hits: unknown[] = []
    const { client } = mockClient([ok()])
    const { svc } = service({ client, onCacheHit: (e) => hits.push(e) })
    await svc.analyze(creative, { runId: 'a' })
    await svc.analyze(creative, { runId: 'b' })
    expect(hits).toEqual([{ runId: 'b', creativeId: 'cr-015' }])
  })

  test('reports failures that happen before any model call to an optional hook', async () => {
    const seen: unknown[] = []
    const { client, calls } = mockClient([ok()])
    const { svc } = service({ client, fetchImage: async () => ({ ok: false, reason: 'Image URL returned 404' }), onPreflightFailure: (e) => seen.push(e) })
    await svc.analyze(creative, { runId: 'r' })
    expect(calls).toHaveLength(0)
    expect(seen).toEqual([{ runId: 'r', creativeId: 'cr-015', kind: 'image_unavailable' }])
  })

  test('does not report preflight failure once the model has been called', async () => {
    const seen: unknown[] = []
    const { client } = mockClient([new ProviderError('credits', 'no', false, 402)])
    const { svc } = service({ client, onPreflightFailure: (e) => seen.push(e) })
    await svc.analyze(creative, { runId: 'r' })
    expect(seen).toEqual([])
  })
})
