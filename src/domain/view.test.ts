import { describe, expect, test } from 'vitest'
import { ingestDataset } from './ingest'
import type { AnalysisState, CreativeAnalysis } from './analysis'
import { selectView, type ViewFilters } from './view'

const sampleAnalysis: CreativeAnalysis = {
  creativeId: '',
  hookType: 'lifestyle',
  productVisibility: 'visible',
  offerType: null,
  ctaType: 'shop-now',
  visualStyle: 'studio',
  textDensity: 'low',
  description: '',
  modelVersion: 'fixture-v1',
  createdAt: '2026-10-20T09:00:00Z',
}

const creative = (id: string, platform: string, extra: Record<string, unknown> = {}) => ({
  creative_id: id,
  name: `Creative ${id}`,
  platform,
  asset_url: `/assets/${id}.jpg`,
  format: 'image',
  product_id: 'shirts',
  data_origin: 'synthetic',
  ...extra,
})

const week = (creativeId: string, platform: string, start: string, end: string, clicks: number, spend: number) => ({
  creative_id: creativeId,
  platform,
  reporting_start: start,
  reporting_end: end,
  impressions: 1000,
  clicks,
  spend,
  conversions: 2,
  attributed_revenue: spend * 2,
  attribution_model: '7-day click',
  data_origin: 'simulated',
})

const dataset = ingestDataset({
  creatives: [
    creative('m1', 'meta'),
    creative('m2', 'meta', { format: 'video', name: 'Linen summer reel' }),
    creative('g1', 'google'),
  ],
  performance: [
    week('m1', 'meta', '2026-10-05', '2026-10-11', 30, 100),
    week('m1', 'meta', '2026-10-12', '2026-10-18', 10, 100),
    week('m2', 'meta', '2026-10-05', '2026-10-11', 0, 0),
    week('g1', 'google', '2026-10-05', '2026-10-11', 50, 200),
  ],
})

const all: ViewFilters = {
  from: '2026-10-05',
  to: '2026-10-18',
  platforms: [],
  formats: [],
  products: [],
  search: '',
  sort: { key: 'spend', direction: 'desc' },
}

describe('selectView', () => {
  test('a platform filter narrows rows and totals together', () => {
    const view = selectView(dataset, { ...all, platforms: ['meta'] })

    expect(view.rows.map((r) => r.creative.creativeId).sort()).toEqual(['m1', 'm2'])
    expect(view.totals.counts.spend).toBe(200)
    expect(view.totals.counts.clicks).toBe(40)
    expect(view.totals.metrics.ctr).toBeCloseTo(1.3333, 3)
    expect(view.count).toBe(2)
  })

  test('the reporting period excludes records outside it from rows, totals and trend', () => {
    const view = selectView(dataset, { ...all, from: '2026-10-12', to: '2026-10-18' })

    expect(view.rows.filter((r) => r.counts).map((r) => r.creative.creativeId)).toEqual(['m1'])
    expect(view.totals.counts.spend).toBe(100)
    expect(view.trend).toEqual([
      { periodStart: '2026-10-12', spend: 100, conversions: 2, ctr: 1, cpa: 50, roas: 2 },
    ])
  })

  test('the trend has one point per reporting week across all filtered creatives', () => {
    const view = selectView(dataset, all)
    expect(view.trend.map((t) => [t.periodStart, t.spend])).toEqual([
      ['2026-10-05', 300],
      ['2026-10-12', 100],
    ])
  })

  test('total ROAS covers only records with revenue tracking, and names the creatives left out', () => {
    const withUntracked = ingestDataset({
      creatives: [creative('m1', 'meta'), creative('g9', 'google')],
      performance: [
        week('m1', 'meta', '2026-10-05', '2026-10-11', 30, 100), // revenue 200
        { ...week('g9', 'google', '2026-10-05', '2026-10-11', 10, 300), attributed_revenue: null },
      ],
    })
    const view = selectView(withUntracked, all)

    expect(view.totals.counts.spend).toBe(400)
    expect(view.totals.metrics.roas).toBe(2)
    expect(view.totals.revenueUntrackedCreativeIds).toEqual(['g9'])
  })

  test('a creative-id filter gives one creative its own weekly trend', () => {
    const view = selectView(dataset, { ...all, creativeIds: ['m1'] })
    expect(view.trend.map((t) => [t.periodStart, t.ctr])).toEqual([
      ['2026-10-05', 3],
      ['2026-10-12', 1],
    ])
  })

  test('format and search filters apply to rows and totals', () => {
    expect(selectView(dataset, { ...all, formats: ['video'] }).rows.map((r) => r.creative.creativeId)).toEqual(['m2'])
    const searched = selectView(dataset, { ...all, search: 'linen' })
    expect(searched.rows.map((r) => r.creative.creativeId)).toEqual(['m2'])
    expect(searched.totals.counts.spend).toBe(0)
    expect(selectView(dataset, { ...all, search: 'G1' }).rows.map((r) => r.creative.creativeId)).toEqual(['g1'])
  })

  test('sorts rows by the chosen metric with N/A values always last', () => {
    const asc = selectView(dataset, { ...all, sort: { key: 'ctr', direction: 'asc' } })
    // CTR: m2 = 0%, m1 = 40/2000 = 2%, g1 = 50/1000 = 5%
    expect(asc.rows.map((r) => r.creative.creativeId)).toEqual(['m2', 'm1', 'g1'])

    const byCpa = selectView(dataset, { ...all, sort: { key: 'cpa', direction: 'desc' } })
    // CPA: m1 = 200/4 = 50, g1 = 200/2 = 100, m2 = 0/2 = 0
    expect(byCpa.rows.map((r) => r.creative.creativeId)).toEqual(['g1', 'm1', 'm2'])

    const byRoas = selectView(dataset, { ...all, sort: { key: 'roas', direction: 'asc' } })
    // m2 spent nothing, so ROAS is N/A and must sort last even ascending
    expect(byRoas.rows.at(-1)!.creative.creativeId).toBe('m2')
  })

  test('creatives with no records in the period still appear, with unavailable metrics', () => {
    const view = selectView(dataset, { ...all, from: '2026-10-12', to: '2026-10-18' })
    const m2 = view.rows.find((r) => r.creative.creativeId === 'm2')!
    expect(m2.counts).toBeNull()
    expect(m2.metrics).toEqual({ ctr: null, cpc: null, cpa: null, roas: null, conversionRate: null })
    expect(view.count).toBe(3)
    expect(view.totals.counts.spend).toBe(100)
  })

  test('a data-availability filter separates creatives with and without records', () => {
    const period = { ...all, from: '2026-10-12', to: '2026-10-18' }
    expect(selectView(dataset, { ...period, dataAvailability: 'with' }).rows.map((r) => r.creative.creativeId)).toEqual(['m1'])
    expect(selectView(dataset, { ...period, dataAvailability: 'without' }).rows.map((r) => r.creative.creativeId).sort()).toEqual(['g1', 'm2'])
  })

  test('rows with equal sort values are ordered by creative ID', () => {
    const tied = ingestDataset({
      creatives: [creative('b', 'meta'), creative('c', 'meta'), creative('a', 'meta')],
      performance: ['b', 'c', 'a'].map((id) => week(id, 'meta', '2026-10-05', '2026-10-11', 10, 100)),
    })
    expect(selectView(tied, all).rows.map((r) => r.creative.creativeId)).toEqual(['a', 'b', 'c'])
    expect(selectView(tied, { ...all, sort: { key: 'spend', direction: 'asc' } }).rows.map((r) => r.creative.creativeId)).toEqual(['a', 'b', 'c'])
  })

  test('search also matches product and analysed attributes; analysis status can be filtered', () => {
    const analyses = new Map<string, AnalysisState>([
      ['m1', { status: 'complete', analysis: { ...sampleAnalysis, creativeId: 'm1', hookType: 'product-first' } }],
      ['m2', { status: 'failed', creativeId: 'm2', reasons: ['bad'] }],
      ['g1', { status: 'pending', creativeId: 'g1' }],
    ])
    expect(selectView(dataset, { ...all, search: 'product-first' }, analyses).rows.map((r) => r.creative.creativeId)).toEqual(['m1'])
    expect(selectView(dataset, { ...all, search: 'shirts' }, analyses).count).toBe(3)
    expect(selectView(dataset, { ...all, analysisStatuses: ['failed', 'pending'] }, analyses).rows.map((r) => r.creative.creativeId).sort()).toEqual(['g1', 'm2'])
  })
})
