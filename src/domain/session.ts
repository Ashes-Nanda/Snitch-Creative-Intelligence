import type { AnalysisState, AnalysisStatus, CreativeAnalysis } from './analysis'
import type { Proposal } from './experiments'
import { checkFreshness, evidenceLevels, type EvidenceLevel, type Freshness, type InsightSnapshot } from './freshness'
import { platforms, type Creative, type Dataset } from './ingest'
import { findOverlaps, generateInsights, recommendable, type Insight, type SuppressedPattern } from './insights'
import { buildReview, previousPeriod, type Review } from './review'
import { selectView, sortKeys, type SortKey, type View, type ViewFilters } from './view'

export interface SessionInput {
  dataset: Dataset
  /** Every creative has an entry: complete, failed, or pending. */
  analyses: Map<string, AnalysisState>
  weeks: { start: string; end: string }[]
  /** The URL's query parameters. Unrecognised values are ignored, never trusted. */
  params: URLSearchParams
  proposals: Proposal[]
}

export interface ReviewSession {
  filters: ViewFilters
  /** The Creative Library: every filter, search and sort applied. */
  view: View
  /** The shared filters only (period, platform, format, product): what insights, the Overview and the attention queue use. */
  insightView: View
  /** The same scope for the equal-length run of weeks just before the period, if there is one. */
  previous: { period: { from: string; to: string }; view: View } | null
  completedAnalyses: Map<string, CreativeAnalysis>
  insights: Insight[]
  suppressed: SuppressedPattern[]
  overlaps: Map<string, string[]>
  levels: Map<string, EvidenceLevel>
  /** Judged against insights regenerated for the snapshot's own period with no other filters, generated once per period. */
  freshnessOf: (snapshot: InsightSnapshot) => Freshness
  review: Review
  /** Recommendable insights across every reporting week: each should have a proposal. */
  proposalsToSync: Insight[]
}

/** Without filters, the review covers the latest this-many reporting weeks. */
export const DEFAULT_PERIOD_WEEKS = 4

const formats: Creative['format'][] = ['image', 'video', 'carousel']
const analysisStatuses: AnalysisStatus[] = ['complete', 'failed', 'pending']
const isoDate = /^\d{4}-\d{2}-\d{2}$/

/** Everything the current review shows, derived from loaded data, the URL's filters and saved decisions. null when there are no reporting weeks. */
export function reviewSession({ dataset, analyses, weeks, params, proposals }: SessionInput): ReviewSession | null {
  if (weeks.length === 0) return null
  const filters = readFilters(params, weeks)

  const completedAnalyses = new Map<string, CreativeAnalysis>()
  analyses.forEach((a, id) => {
    if (a.status === 'complete') completedAnalyses.set(id, a.analysis)
  })

  const sharedOnly = (f: ViewFilters): ViewFilters => ({ ...f, search: '', analysisStatuses: [], dataAvailability: 'all' })
  const periodOnly = (from: string, to: string): ViewFilters => ({ ...sharedOnly(filters), from, to, platforms: [], formats: [], products: [] })

  const insightsCache = new Map<string, Insight[]>()
  /** Insights for a period with no other filters: the basis for proposals and for staleness checks. */
  const insightsForPeriod = (from: string, to: string): Insight[] => {
    const key = `${from}:${to}`
    let found = insightsCache.get(key)
    if (!found) {
      found = generateInsights(selectView(dataset, periodOnly(from, to)).rows, completedAnalyses, { from, to }).insights
      insightsCache.set(key, found)
    }
    return found
  }

  const view = selectView(dataset, filters, analyses)
  const insightView = selectView(dataset, sharedOnly(filters))
  const { insights, suppressed } = generateInsights(insightView.rows, completedAnalyses, { from: filters.from, to: filters.to })
  const prev = previousPeriod(weeks, filters.from, filters.to)

  return {
    filters,
    view,
    insightView,
    previous: prev ? { period: prev, view: selectView(dataset, sharedOnly({ ...filters, ...prev })) } : null,
    completedAnalyses,
    insights,
    suppressed,
    overlaps: findOverlaps(insights),
    levels: evidenceLevels(insights),
    freshnessOf: (snapshot) => checkFreshness(snapshot, insightsForPeriod(snapshot.period.from, snapshot.period.to)),
    review: buildReview({ rows: insightView.rows, proposals, suppressed, quality: dataset.quality, analyses }),
    // Proposals come from the full dataset, so they don't churn as the user filters.
    proposalsToSync: recommendable(insightsForPeriod(weeks[0].start, weeks[weeks.length - 1].end)),
  }
}

function readFilters(params: URLSearchParams, weeks: { start: string; end: string }[]): ViewFilters {
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? []
  const known = <T extends string>(key: string, allowed: readonly T[]) => list(key).filter((v): v is T => (allowed as readonly string[]).includes(v))
  const date = (key: string, fallback: string) => {
    const v = params.get(key)
    return v && isoDate.test(v) ? v : fallback
  }
  const [sortKey, sortDirection] = (params.get('sort') ?? '').split(':')
  const availability = params.get('data')

  return {
    from: date('from', weeks[Math.max(0, weeks.length - DEFAULT_PERIOD_WEEKS)].start),
    to: date('to', weeks[weeks.length - 1].end),
    platforms: known('platform', platforms),
    formats: known('format', formats),
    products: list('product'),
    search: params.get('q') ?? '',
    analysisStatuses: known('analysis', analysisStatuses),
    dataAvailability: availability === 'with' || availability === 'without' ? availability : 'all',
    sort: (sortKeys as readonly string[]).includes(sortKey)
      ? { key: sortKey as SortKey, direction: sortDirection === 'asc' ? 'asc' : 'desc' }
      : { key: 'spend', direction: 'desc' },
  }
}
