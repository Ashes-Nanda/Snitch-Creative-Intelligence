import { describe, expect, test } from 'vitest'
import type { CreativeAnalysis } from './analysis'
import type { Creative } from './ingest'
import { findOverlaps, generateInsights, recommendable } from './insights'
import { computeMetrics } from './metrics'
import type { CreativeRow } from './view'

function row(id: string, platform: Creative['platform'], impressions: number, clicks: number): CreativeRow {
  const counts = { impressions, clicks, spend: 500, conversions: 10, attributedRevenue: 1500 }
  return {
    creative: {
      creativeId: id,
      name: id,
      platform,
      assetUrl: '',
      format: 'image',
      productId: null,
      publishedAt: null,
      dataOrigin: 'synthetic',
      sourceNote: null,
    },
    counts,
    metrics: computeMetrics(counts),
  }
}

function analysis(id: string, hookType: CreativeAnalysis['hookType']): CreativeAnalysis {
  return {
    creativeId: id,
    hookType,
    productVisibility: 'visible',
    offerType: null,
    ctaType: 'shop-now',
    visualStyle: 'studio',
    textDensity: 'low',
    description: '',
    modelVersion: 'fixture-v1',
    createdAt: '2026-10-20T09:00:00Z',
  }
}

const period = { from: '2026-10-05', to: '2026-10-18' }

describe('generateInsights', () => {
  test('reports a CTR pattern with evidence, a limitation and a next step when both groups are large enough', () => {
    // product-first: 4 creatives × 10,000 impressions × 300 clicks → 3.0% CTR
    // others:        4 creatives × 10,000 impressions × 150 clicks → 1.5% CTR
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])

    const { insights } = generateInsights(rows, analyses, period)
    const insight = insights.find((i) => i.attribute === 'hookType' && i.value === 'product-first')

    expect(insight).toBeDefined()
    expect(insight!.platform).toBe('meta')
    expect(insight!.metric).toBe('ctr')
    expect(insight!.evidence.group).toMatchObject({ creativeIds: ['a', 'b', 'c', 'd'], value: 3, impressions: 40000 })
    expect(insight!.evidence.comparison).toMatchObject({ creativeIds: ['w', 'x', 'y', 'z'], value: 1.5 })
    expect(insight!.evidence.relativeDifference).toBeCloseTo(1)
    expect(insight!.limitation).toMatch(/correlation/i)
    expect(insight!.nextStep).toBeTruthy()
    expect(insight!.period).toEqual(period)
  })

  test('suppresses a pattern when a group has too few creatives, and says why', () => {
    const rows = [row('a', 'meta', 10000, 300), row('b', 'meta', 10000, 300), ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150))]
    const analyses = new Map([
      ...['a', 'b'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])

    const { insights, suppressed } = generateInsights(rows, analyses, period)

    expect(insights).toEqual([])
    expect(suppressed).toContainEqual({
      platform: 'meta',
      attribute: 'hookType',
      value: 'product-first',
      reason: 'Only 2 creatives in the group; at least 3 are needed.',
    })
  })

  test('does not report a difference smaller than 15%', () => {
    // 1.6% vs 1.5% CTR is a 6.7% relative difference
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 160)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    expect(generateInsights(rows, analyses, period).insights).toEqual([])
  })

  test('never pools creatives across platforms', () => {
    // high-CTR product-first creatives are all on Google, low-CTR others on Meta
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'google', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    expect(generateInsights(rows, analyses, period).insights).toEqual([])
  })

  test('finds patterns on visual style and offer presence, not just the hook', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, { ...analysis(id, 'lifestyle'), visualStyle: 'street', offerType: '20% off' }] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    const ids = generateInsights(rows, analyses, period).insights.map((i) => i.insightId).sort()
    expect(ids).toEqual(['meta:offer:with offer:ctr', 'meta:visualStyle:street:ctr'])
  })

  test('skips comparisons where a group has no impressions', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 0, 0)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    expect(generateInsights(rows, analyses, period).insights).toEqual([])
  })

  test('creatives without a completed analysis are left out of every comparison', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
      row('unanalysed', 'meta', 10000, 10),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    const insight = generateInsights(rows, analyses, period).insights[0]
    expect(insight.evidence.comparison.creativeIds).not.toContain('unanalysed')
  })

  test('flags insights on the same platform whose groups are mostly the same creatives', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    // a–d are both product-first and street: the two attributes are confounded
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, { ...analysis(id, 'product-first'), visualStyle: 'street' }] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    const { insights } = generateInsights(rows, analyses, period)
    const overlaps = findOverlaps(insights)

    expect(overlaps.get('meta:hookType:product-first:ctr')).toEqual(['meta:visualStyle:street:ctr'])
    expect(overlaps.get('meta:visualStyle:street:ctr')).toEqual(['meta:hookType:product-first:ctr'])
  })

  test('only the strongest insight in a confounded cluster is recommended for testing', () => {
    // a,b,c are product-first AND street; d is product-first only.
    // product-first (a–d): 1200/40000 = 3.0% vs 600/40000 = 1.5%  → +100%
    // street (a–c):         900/30000 = 3.0% vs 900/50000 = 1.8%  → +67%
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c'].map((id) => [id, { ...analysis(id, 'product-first'), visualStyle: 'street' }] as const),
      ['d', analysis('d', 'product-first')] as const,
      ...['w', 'x', 'y', 'z'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    const { insights } = generateInsights(rows, analyses, period)
    expect(insights.map((i) => i.insightId).sort()).toEqual(['meta:hookType:product-first:ctr', 'meta:visualStyle:street:ctr'])
    expect(recommendable(insights).map((i) => i.insightId)).toEqual(['meta:hookType:product-first:ctr'])
  })

  test('creatives with no performance in the period are left out of comparisons', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
      { ...row('empty', 'meta', 0, 0), counts: null },
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, analysis(id, 'product-first')] as const),
      ...['w', 'x', 'y', 'z', 'empty'].map((id) => [id, analysis(id, 'lifestyle')] as const),
    ])
    const insight = generateInsights(rows, analyses, period).insights[0]
    expect(insight.evidence.comparison.creativeIds).toEqual(['w', 'x', 'y', 'z'])
  })

  test('compares product prominence from live image analysis, skipping creatives without that attribute', () => {
    const rows = [
      ...['a', 'b', 'c', 'd'].map((id) => row(id, 'meta', 10000, 300)),
      ...['w', 'x', 'y', 'z'].map((id) => row(id, 'meta', 10000, 150)),
      row('legacy', 'meta', 10000, 10),
    ]
    const analyses = new Map([
      ...['a', 'b', 'c', 'd'].map((id) => [id, { ...analysis(id, 'lifestyle'), productProminence: 'dominant' as const }] as const),
      ...['w', 'x', 'y', 'z'].map((id) => [id, { ...analysis(id, 'lifestyle'), productProminence: 'secondary' as const }] as const),
      ['legacy', analysis('legacy', 'lifestyle')] as const,
    ])
    const insight = generateInsights(rows, analyses, period).insights.find((i) => i.insightId === 'meta:prominence:dominant:ctr')
    expect(insight?.evidence.group.creativeIds).toEqual(['a', 'b', 'c', 'd'])
    expect(insight?.evidence.comparison.creativeIds).toEqual(['w', 'x', 'y', 'z'])
  })
})
