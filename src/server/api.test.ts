import { describe, expect, test } from 'vitest'
import { createAnalysisService, memoryAnalysisStore } from './analysis-service'
import { handleAnalysisRequest, MAX_BATCH } from './api'
import type { CallMeta, OpenRouterClient, VisionResponse } from './openrouter'

// MOCK provider: these tests never call OpenRouter.
const output = JSON.stringify({
  observations: {
    format_composition: 'Single image',
    garments: [],
    product_prominence: 'secondary',
    people: 'none',
    background: 'Text panel',
    visual_style: 'graphic',
    visible_text: ['SALE'],
    offer_text: 'SALE',
    cta_text: null,
    text_density: 'high',
  },
  classification: { hook_type: 'offer-first', cta_type: 'none' },
  interpretations: { creative_angle: 'Promotion', rationale: 'Large SALE text' },
  uncertain: [],
  summary: 'A text panel reading SALE.',
})

function setup(config = { apiKey: 'k' as string | undefined, model: 'mock/vision' as string | undefined }) {
  const metas: (CallMeta | undefined)[] = []
  const client: OpenRouterClient = {
    async complete(_req, meta): Promise<VisionResponse> {
      metas.push(meta)
      return { id: 'mock-1', model: 'mock/vision', provider: null, text: output, usage: { promptTokens: 1, completionTokens: 1, cost: 0, cachedPromptTokens: null } }
    },
    modelInfo: async () => ({ id: 'mock/vision', acceptsImages: true, structuredOutputs: true }),
  }
  const service = createAnalysisService({
    config,
    client,
    store: memoryAnalysisStore(),
    fetchImage: async () => ({ ok: true, contentType: 'image/webp', bytes: new Uint8Array([1]) }),
    log: () => {},
  })
  const creatives = new Map(
    ['cr-001', 'cr-002', 'cr-003'].map((id) => [id, { creativeId: id, assetUrl: `https://img.example.com/${id}.webp`, name: id, assetType: 'static_ad' }]),
  )
  return { service, creatives, metas, lookup: async (id: string) => creatives.get(id) ?? null }
}

describe('analysis API', () => {
  test('GET lists configuration status and records without exposing the key', async () => {
    const { service, lookup } = setup()
    const res = await handleAnalysisRequest({ method: 'GET', path: '/api/analysis', body: null }, { service, lookup })
    expect(res).toEqual({ status: 200, body: { configured: true, model: 'mock/vision', problem: null, records: [] } })
    expect(JSON.stringify(res)).not.toContain('"k"')
  })

  test('POST analyses a known creative by ID', async () => {
    const { service, lookup } = setup()
    const res = await handleAnalysisRequest({ method: 'POST', path: '/api/analysis/cr-001', body: {} }, { service, lookup })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, cached: false, record: { creativeId: 'cr-001', status: 'completed' } })
  })

  test('unknown creatives are rejected; the server never analyses a URL supplied by the browser', async () => {
    const { service, lookup } = setup()
    const res = await handleAnalysisRequest({ method: 'POST', path: '/api/analysis/cr-999', body: { assetUrl: 'http://169.254.169.254/' } }, { service, lookup })
    expect(res).toEqual({ status: 404, body: { ok: false, error: { kind: 'not_found', message: 'No creative with ID cr-999.' } } })
  })

  test('missing configuration returns 503 with a clear message', async () => {
    const { service, lookup } = setup({ apiKey: undefined, model: 'mock/vision' })
    const res = await handleAnalysisRequest({ method: 'POST', path: '/api/analysis/cr-001', body: {} }, { service, lookup })
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ ok: false, error: { kind: 'config', message: 'OPENROUTER_API_KEY is not set on the server.' } })
  })

  test('a batch runs sequentially under one run ID and is capped', async () => {
    const { service, lookup, metas } = setup()
    const res = await handleAnalysisRequest({ method: 'POST', path: '/api/analysis/batch', body: { ids: ['cr-001', 'cr-002', 'cr-404'] } }, { service, lookup })
    expect(res.status).toBe(200)
    expect((res.body as { results: { creativeId: string; ok: boolean }[] }).results.map((r) => [r.creativeId, r.ok])).toEqual([
      ['cr-001', true],
      ['cr-002', true],
      ['cr-404', false],
    ])
    expect(new Set(metas.map((m) => m?.runId)).size).toBe(1)

    const tooMany = await handleAnalysisRequest({ method: 'POST', path: '/api/analysis/batch', body: { ids: Array.from({ length: MAX_BATCH + 1 }, (_, i) => `cr-${i}`) } }, { service, lookup })
    expect(tooMany.status).toBe(400)
  })
})
