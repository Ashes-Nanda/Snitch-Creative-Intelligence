import type { AnalysisState, AnalysisStatus } from './analysis'
import type { Creative, Dataset, PerformanceRecord, Platform } from './ingest'
import { computeMetrics, type Metrics, type RawCounts } from './metrics'

export const sortKeys = ['spend', 'impressions', 'ctr', 'cpa', 'roas', 'conversions'] as const
export type SortKey = (typeof sortKeys)[number]

export interface ViewFilters {
  from: string
  to: string
  platforms: Platform[]
  formats: Creative['format'][]
  products: string[]
  /** Matches creative name, ID, product, and analysed attributes. */
  search: string
  analysisStatuses?: AnalysisStatus[]
  dataAvailability?: 'all' | 'with' | 'without'
  /** Optional: restrict to these creatives (detail and comparison views). */
  creativeIds?: string[]
  sort: { key: SortKey; direction: 'asc' | 'desc' }
}

export interface CreativeRow {
  creative: Creative
  /** null when the creative has no performance records in the period. */
  counts: RawCounts | null
  metrics: Metrics
}

export interface TrendPoint {
  periodStart: string
  spend: number
  conversions: number
  ctr: number | null
  cpa: number | null
  roas: number | null
}

export interface View {
  rows: CreativeRow[]
  trend: TrendPoint[]
  totals: {
    counts: RawCounts
    metrics: Metrics
    /** Creatives whose records lack revenue; their spend is excluded from ROAS. */
    revenueUntrackedCreativeIds: string[]
  }
  count: number
}

const unavailable: Metrics = { ctr: null, cpc: null, cpa: null, roas: null, conversionRate: null }

function sumCounts(records: PerformanceRecord[]): RawCounts {
  return records.reduce<RawCounts>(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      conversions: acc.conversions + r.conversions,
      attributedRevenue: acc.attributedRevenue === null || r.attributedRevenue === null ? null : acc.attributedRevenue + r.attributedRevenue,
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, attributedRevenue: 0 },
  )
}

export function selectView(dataset: Dataset, filters: ViewFilters, analyses?: Map<string, AnalysisState>): View {
  const creatives = dataset.creatives.filter((c) => matches(c, filters, analyses?.get(c.creativeId)))
  const ids = new Set(creatives.map((c) => c.creativeId))
  const records = dataset.performance.filter(
    (p) => ids.has(p.creativeId) && p.reportingStart >= filters.from && p.reportingEnd <= filters.to,
  )

  const byCreative = groupBy(records, (r) => r.creativeId)
  const availability = filters.dataAvailability ?? 'all'
  const rows = creatives
    .map((creative): CreativeRow => {
      const recs = byCreative.get(creative.creativeId)
      if (!recs) return { creative, counts: null, metrics: unavailable }
      const counts = sumCounts(recs)
      return { creative, counts, metrics: computeMetrics(counts) }
    })
    .filter((r) => availability === 'all' || (availability === 'with') === (r.counts !== null))
    .sort(compareRows(filters.sort))

  const byWeek = groupBy(records, (r) => r.reportingStart)
  const trend = [...byWeek.keys()].sort().map((periodStart) => {
    const counts = sumCounts(byWeek.get(periodStart)!)
    const m = aggregateMetrics(byWeek.get(periodStart)!)
    return { periodStart, spend: counts.spend, conversions: counts.conversions, ctr: m.ctr, cpa: m.cpa, roas: m.roas }
  })

  const totalCounts = sumCounts(records)
  return {
    rows,
    trend,
    totals: {
      counts: totalCounts,
      metrics: aggregateMetrics(records),
      revenueUntrackedCreativeIds: [...new Set(records.filter((r) => r.attributedRevenue === null).map((r) => r.creativeId))],
    },
    count: rows.length,
  }
}

/** Like computeMetrics, but ROAS is computed only over records that report revenue. */
function aggregateMetrics(records: PerformanceRecord[]): Metrics {
  const tracked = sumCounts(records.filter((r) => r.attributedRevenue !== null))
  return { ...computeMetrics(sumCounts(records)), roas: computeMetrics(tracked).roas }
}

function searchText(c: Creative, analysis: AnalysisState | undefined): string {
  const parts = [c.name, c.creativeId, c.productId ?? '', c.category ?? '', c.adCopy ?? '', c.assetType ?? '']
  if (analysis?.status === 'complete') {
    const a = analysis.analysis
    parts.push(a.hookType, a.visualStyle, a.ctaType, a.offerType ?? '', a.textDensity)
  }
  return parts.join(' ').toLowerCase()
}

function matches(c: Creative, f: ViewFilters, analysis: AnalysisState | undefined): boolean {
  const q = f.search.trim().toLowerCase()
  return (
    (!f.creativeIds || f.creativeIds.includes(c.creativeId)) &&
    (f.platforms.length === 0 || f.platforms.includes(c.platform)) &&
    (f.formats.length === 0 || f.formats.includes(c.format)) &&
    (f.products.length === 0 || (c.productId !== null && f.products.includes(c.productId))) &&
    (!f.analysisStatuses?.length || f.analysisStatuses.includes(analysis?.status ?? 'pending')) &&
    (q === '' || searchText(c, analysis).includes(q))
  )
}

function sortValue(row: CreativeRow, key: SortKey): number | null {
  if (key === 'spend' || key === 'conversions' || key === 'impressions') return row.counts ? row.counts[key] : null
  return row.metrics[key]
}

/** Unavailable values sort last regardless of direction; ties fall back to creative ID so order is deterministic. */
function compareRows(sort: ViewFilters['sort']) {
  const dir = sort.direction === 'asc' ? 1 : -1
  return (a: CreativeRow, b: CreativeRow) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    const byId = a.creative.creativeId.localeCompare(b.creative.creativeId)
    if (av === null && bv === null) return byId
    if (av === null) return 1
    if (bv === null) return -1
    return (av - bv) * dir || byId
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}
