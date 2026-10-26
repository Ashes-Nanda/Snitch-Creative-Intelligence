import { describe, expect, test } from 'vitest'
import type { CreativeAnalysis, ProductProminence } from './analysis'
import type { AssetType } from './ingest'
import { MIN_OBSERVED, observedPatterns } from './patterns'

function analysed(id: string, prominence: ProductProminence, offer: string | null = null): CreativeAnalysis {
  return {
    creativeId: id,
    hookType: 'model-first',
    productVisibility: '',
    offerType: offer,
    ctaType: 'none',
    visualStyle: 'studio',
    textDensity: 'low',
    description: '',
    modelVersion: 'mock/vision',
    createdAt: '2026-10-26T18:00:00Z',
    productProminence: prominence,
  }
}

const asset = (id: string, assetType: AssetType) => ({ creativeId: id, assetType })

describe('observedPatterns', () => {
  test('returns insufficient_evidence for a kind with fewer than the minimum analysed creatives', () => {
    const creatives = ['a1', 'a2'].map((id) => asset(id, 'static_ad'))
    const analyses = new Map(creatives.map((c) => [c.creativeId, analysed(c.creativeId, 'dominant')]))
    const result = observedPatterns(creatives, analyses)
    expect(result.kinds.ads).toEqual({ status: 'insufficient_evidence', analysed: 2, needed: MIN_OBSERVED })
    expect(result.hypotheses).toEqual([])
  })

  test('counts observed attribute values with the supporting creative IDs', () => {
    const creatives = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => asset(id, 'product_image'))
    const analyses = new Map(creatives.map((c, i) => [c.creativeId, analysed(c.creativeId, i < 4 ? 'dominant' : 'secondary')]))
    const kind = observedPatterns(creatives, analyses).kinds.productImages
    expect(kind.status).toBe('ok')
    if (kind.status !== 'ok') return
    expect(kind.distributions.prominence).toEqual([
      { value: 'dominant', count: 4, creativeIds: ['p1', 'p2', 'p3', 'p4'] },
      { value: 'secondary', count: 1, creativeIds: ['p5'] },
    ])
  })

  test('raises a testable hypothesis, without performance claims, when ads and product images differ markedly', () => {
    const ads = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => asset(id, 'static_ad'))
    const products = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => asset(id, 'product_image'))
    const analyses = new Map([
      ...ads.map((c, i) => [c.creativeId, analysed(c.creativeId, i < 1 ? 'dominant' : 'secondary', 'Flat 30% off')] as const),
      ...products.map((c) => [c.creativeId, analysed(c.creativeId, 'dominant')] as const),
    ])
    const { hypotheses } = observedPatterns([...ads, ...products], analyses)
    const prominence = hypotheses.find((h) => h.attribute === 'prominence')
    expect(prominence).toMatchObject({
      value: 'dominant',
      ads: { count: 1, total: 5 },
      productImages: { count: 5, total: 5 },
      supportingCreativeIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'p1', 'p2', 'p3', 'p4', 'p5'],
    })
    expect(prominence!.statement).toMatch(/1 of 5 ads .* 5 of 5 product images/)
    expect(prominence!.statement).not.toMatch(/CTR|ROAS|perform|convert|better|improve/i)
    expect(prominence!.limitation).toMatch(/says nothing about performance/i)
  })

  test('creatives without a live analysis are not counted', () => {
    const creatives = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => asset(id, 'static_ad'))
    const analyses = new Map(creatives.slice(0, 4).map((c) => [c.creativeId, analysed(c.creativeId, 'dominant')]))
    expect(observedPatterns(creatives, analyses).kinds.ads).toEqual({ status: 'insufficient_evidence', analysed: 4, needed: MIN_OBSERVED })
  })
})
