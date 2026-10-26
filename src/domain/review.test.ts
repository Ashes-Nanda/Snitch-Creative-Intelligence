import { describe, expect, test } from 'vitest'
import type { AnalysisState } from './analysis'
import type { Proposal } from './experiments'
import type { Creative, QualityReport } from './ingest'
import type { SuppressedPattern } from './insights'
import { computeMetrics } from './metrics'
import { buildReview, peerComparison, previousPeriod, rankCreatives, remainingAttentionItems } from './review'
import type { CreativeRow } from './view'

function row(id: string, platform: Creative['platform'], spend: number, revenue: number | null, clicks = 100): CreativeRow {
  const counts = { impressions: 10000, clicks, spend, conversions: 10, attributedRevenue: revenue }
  return {
    creative: { creativeId: id, name: id, platform, assetUrl: '', format: 'image', productId: null, publishedAt: null, dataOrigin: 'synthetic', sourceNote: null },
    counts,
    metrics: computeMetrics(counts),
  }
}

const cleanQuality: QualityReport = { recordsProcessed: 10, invalid: [], duplicates: [], creativesWithoutPerformance: [], performanceWithoutCreative: [] }

const proposal = (id: string, status: Proposal['status']) => ({ proposalId: id, title: `Proposal ${id}`, status }) as Proposal

function review(overrides: Partial<Parameters<typeof buildReview>[0]> = {}) {
  return buildReview({
    rows: [],
    proposals: [],
    suppressed: [],
    quality: cleanQuality,
    analyses: new Map(),
    ...overrides,
  })
}

describe('needs investigation', () => {
  test('flags creatives with at least median platform spend and ROAS 25%+ below the peer pooled ROAS (excluding self)', () => {
    // Meta peer pooled ROAS excluding m4 = (4000+3000+2000) / (1000+1000+1000) = 3.00×.
    // 75% of peer ROAS = 2.25×.
    // Median spend = 1000. m4 has spend 1000 and ROAS 0.50×.
    // Percentage below: (1 - 0.50 / 3.00) * 100 = 83.33% -> 83%.
    const rows = [row('m1', 'meta', 1000, 4000), row('m2', 'meta', 1000, 3000), row('m3', 'meta', 1000, 2000), row('m4', 'meta', 1000, 500)]
    const items = review({ rows }).attention.filter((a) => a.kind === 'investigate_creative')
    expect(items.map((a) => a.targetId)).toEqual(['m4'])
    expect(items[0].detail).toBe(
      'ROAS 0.50× is 83% below the Meta Ads peer benchmark (3.00×) on above-median spend. Flagging rule: ROAS ≥25% below peer benchmark on above-median spend.',
    )
  })

  test('ignores low-spend creatives and creatives without revenue tracking', () => {
    // Median spend = 1000. low (spend 100) is below median; untracked has no ROAS.
    const rows = [row('a', 'meta', 1000, 3000), row('b', 'meta', 1000, 3000), row('low', 'meta', 100, 10), row('untracked', 'meta', 5000, null)]
    expect(review({ rows }).attention.filter((a) => a.kind === 'investigate_creative')).toEqual([])
  })

  test('compares each creative only with its own platform', () => {
    // Google creatives have low ROAS overall; none is 25% below Google's own pooled ROAS.
    const rows = [row('m1', 'meta', 1000, 5000), row('m2', 'meta', 1000, 5000), row('g1', 'google', 1000, 1000), row('g2', 'google', 1000, 1000)]
    expect(review({ rows }).attention.filter((a) => a.kind === 'investigate_creative')).toEqual([])
  })
})

describe('attention queue', () => {
  test('orders items: proposals to review, creatives to investigate, insufficient evidence, data quality, failed analyses', () => {
    const rows = [row('m1', 'meta', 1000, 4000), row('m2', 'meta', 1000, 3000), row('m3', 'meta', 1000, 2000), row('m4', 'meta', 1000, 500)]
    const suppressed: SuppressedPattern[] = [{ platform: 'meta', attribute: 'offer', value: 'with offer', reason: 'Only 2 creatives in the group; at least 3 are needed.' }]
    const analyses = new Map<string, AnalysisState>([['m9', { status: 'failed', creativeId: 'm9', reasons: ['hook_type: bad'] }]])
    const quality = { ...cleanQuality, duplicates: ['performance x'] }
    const { attention } = review({
      rows,
      suppressed,
      analyses,
      quality,
      proposals: [proposal('p1', 'needs_review'), proposal('p2', 'approved')],
    })
    expect(attention.map((a) => [a.kind, a.targetId])).toEqual([
      ['review_proposal', 'p1'],
      ['investigate_creative', 'm4'],
      ['insufficient_evidence', 'meta:offer:with offer'],
      ['data_quality', null],
      ['failed_analysis', 'm9'],
    ])
  })

  test('the recommended next action is the top proposal or creative, never a data-quality item', () => {
    const quality = { ...cleanQuality, invalid: [{ kind: 'creative' as const, index: 0, id: 'x', problems: ['name'] }] }
    expect(review({ quality }).recommended).toBeNull()
    expect(review({ quality, proposals: [proposal('p1', 'needs_review')] }).recommended?.targetId).toBe('p1')
  })

  test('remainingAttentionItems excludes the recommended item to prevent duplicate display', () => {
    const attention = [
      { kind: 'review_proposal' as const, targetId: 'p1', title: 'Proposal 1', detail: 'detail' },
      { kind: 'investigate_creative' as const, targetId: 'm4', title: 'Creative m4', detail: 'detail' },
    ]
    const recommended = attention[0]
    const remaining = remainingAttentionItems(attention, recommended)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].targetId).toBe('m4')

    // When no recommendation exists, all attention items remain
    expect(remainingAttentionItems(attention, null)).toEqual(attention)
  })
})

describe('rankCreatives', () => {
  test('ranks by the metric in its better direction, excluding low spend and unavailable values', () => {
    const rows = [row('a', 'meta', 3000, 6000), row('b', 'meta', 3000, 9000), row('c', 'meta', 500, 99000), row('d', 'meta', 3000, null)]
    expect(rankCreatives(rows, 'roas', 2000).map((r) => r.creative.creativeId)).toEqual(['b', 'a'])
    // CPA = spend / 10 conversions: a and b both 300; lower is better, tie broken by ID
    expect(rankCreatives(rows, 'cpa', 2000).map((r) => r.creative.creativeId)).toEqual(['a', 'b', 'd'])
  })
})

describe('previousPeriod', () => {
  const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].map((start) => ({
    start,
    end: new Date(Date.parse(start) + 6 * 86400000).toISOString().slice(0, 10),
  }))

  test('is the same number of whole weeks immediately before the period', () => {
    expect(previousPeriod(weeks, '2026-10-12', '2026-10-25')).toEqual({ from: '2026-09-28', to: '2026-10-11' })
  })

  test('is unavailable when there is not enough history or the period is not whole weeks', () => {
    expect(previousPeriod(weeks, '2026-10-05', '2026-10-25')).toBeNull()
    expect(previousPeriod(weeks, '2026-10-13', '2026-10-25')).toBeNull()
  })
})

describe('peerComparison', () => {
  test('compares a creative with the pooled values of the other creatives on its platform', () => {
    // Others on Meta: CTR = 200 / 20000 = 1%; ROAS = 6000 / 2000 = 3×. Google rows are ignored.
    const rows = [row('m1', 'meta', 1000, 1000, 300), row('m2', 'meta', 1000, 3000), row('m3', 'meta', 1000, 3000), row('g1', 'google', 1000, 9000)]
    expect(peerComparison(rows, 'm1')).toEqual({
      platform: 'meta',
      peerIds: ['m2', 'm3'],
      ctr: { creative: 3, peers: 1 },
      roas: { creative: 1, peers: 3 },
    })
  })

  test('is unavailable when the creative has no performance or no peers', () => {
    expect(peerComparison([row('m1', 'meta', 1000, 1000)], 'm1')).toBeNull()
    expect(peerComparison([{ ...row('m1', 'meta', 0, 0), counts: null }, row('m2', 'meta', 1000, 1000)], 'm1')).toBeNull()
  })
})
