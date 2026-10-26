import type { AnalysisState } from './analysis'
import type { Proposal } from './experiments'
import type { Platform, QualityReport } from './ingest'
import { attributeNames, type SuppressedPattern } from './insights'
import { computeMetrics, type RawCounts } from './metrics'
import type { CreativeRow } from './view'

export type AttentionKind = 'review_proposal' | 'investigate_creative' | 'insufficient_evidence' | 'data_quality' | 'failed_analysis'

export interface AttentionItem {
  kind: AttentionKind
  /** What the item points at: a proposal ID, creative ID, or pattern key. null for the data-quality report. */
  targetId: string | null
  title: string
  detail: string
}

/** Only these kinds can become the recommended next action. */
const recommendable: AttentionKind[] = ['review_proposal', 'investigate_creative']

/** A creative needs investigation when its ROAS is at least this far below its platform's pooled ROAS. */
export const INVESTIGATE_ROAS_GAP = 0.25

type MeasuredRow = CreativeRow & { counts: RawCounts }

export interface ReviewInput {
  rows: CreativeRow[]
  proposals: Proposal[]
  suppressed: SuppressedPattern[]
  quality: QualityReport
  analyses: Map<string, AnalysisState>
}

export interface Review {
  attention: AttentionItem[]
  recommended: AttentionItem | null
}

/** Builds the prioritised attention queue for the current view, and picks the recommended next action. */
export function buildReview({ rows, proposals, suppressed, quality, analyses }: ReviewInput): Review {
  const attention: AttentionItem[] = [
    ...proposals
      .filter((p) => p.status === 'needs_review')
      .map((p): AttentionItem => ({ kind: 'review_proposal', targetId: p.proposalId, title: `Review proposal: ${p.title}`, detail: 'A proposal is waiting for an approve, reject or request-edits decision.' })),
    ...needsInvestigation(rows.filter((r): r is MeasuredRow => r.counts !== null)),
    ...suppressed.map(
      (s): AttentionItem => ({
        kind: 'insufficient_evidence',
        targetId: `${s.platform}:${s.attribute}:${s.value}`,
        title: `Not enough evidence yet: ${attributeNames[s.attribute]} “${s.value}” on ${platformLabel[s.platform]}`,
        detail: s.reason,
      }),
    ),
    ...dataQualityItem(quality),
    ...[...analyses.values()]
      .filter((a) => a.status === 'failed')
      .map((a): AttentionItem => ({ kind: 'failed_analysis', targetId: a.creativeId, title: `Analysis failed for ${a.creativeId}`, detail: 'Its attributes are hidden and it is left out of insights.' })),
  ]
  return { attention, recommended: attention.find((a) => recommendable.includes(a.kind)) ?? null }
}

const platformLabel: Record<Platform, string> = { meta: 'Meta Ads', google: 'Google Ads' }

function needsInvestigation(rows: MeasuredRow[]): AttentionItem[] {
  const items: { item: AttentionItem; spend: number }[] = []
  for (const platform of ['meta', 'google'] as const) {
    const own = rows.filter((r) => r.creative.platform === platform)
    if (own.length === 0) continue
    const medianSpend = median(own.map((r) => r.counts.spend))
    const tracked = own.filter((r) => r.counts.attributedRevenue !== null)
    const pooled = computeMetrics({
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: tracked.reduce((s, r) => s + r.counts.spend, 0),
      attributedRevenue: tracked.reduce((s, r) => s + (r.counts.attributedRevenue ?? 0), 0),
    }).roas
    if (pooled === null) continue
    for (const r of own) {
      const roas = r.metrics.roas
      if (roas === null || r.counts.spend < medianSpend || roas > pooled * (1 - INVESTIGATE_ROAS_GAP)) continue
      items.push({
        spend: r.counts.spend,
        item: {
          kind: 'investigate_creative',
          targetId: r.creative.creativeId,
          title: `Investigate ${r.creative.name}`,
          detail: `ROAS ${roas.toFixed(2)}× is ${Math.round((1 - roas / pooled) * 100)}% below the ${platformLabel[platform]} average (${pooled.toFixed(2)}×) on above-median spend.`,
        },
      })
    }
  }
  return items.sort((a, b) => b.spend - a.spend).map((x) => x.item)
}

function dataQualityItem(q: QualityReport): AttentionItem[] {
  const count = q.invalid.length + q.duplicates.length + q.creativesWithoutPerformance.length + q.performanceWithoutCreative.length
  if (count === 0) return []
  return [{ kind: 'data_quality', targetId: null, title: `${count} data-quality issue${count === 1 ? '' : 's'} in the latest import`, detail: 'Some records were rejected, duplicated or left unmatched.' }]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export type RankMetric = 'ctr' | 'cpa' | 'roas' | 'conversionRate'
const lowerIsBetter: RankMetric[] = ['cpa']

/** Creatives ranked best-first on a metric. Creatives below `minSpend` or with the metric unavailable are not ranked. */
export function rankCreatives(rows: CreativeRow[], metric: RankMetric, minSpend: number): CreativeRow[] {
  const dir = lowerIsBetter.includes(metric) ? 1 : -1
  return rows
    .filter((r) => r.counts !== null && r.counts.spend >= minSpend && r.metrics[metric] !== null)
    .sort((a, b) => (a.metrics[metric]! - b.metrics[metric]!) * dir || a.creative.creativeId.localeCompare(b.creative.creativeId))
}

/** The equal-length run of whole reporting weeks just before the period, or null if there isn't one. */
export function previousPeriod(weeks: { start: string; end: string }[], from: string, to: string): { from: string; to: string } | null {
  const startIdx = weeks.findIndex((w) => w.start === from)
  const endIdx = weeks.findIndex((w) => w.end === to)
  if (startIdx < 0 || endIdx < startIdx) return null
  const span = endIdx - startIdx + 1
  if (startIdx - span < 0) return null
  return { from: weeks[startIdx - span].start, to: weeks[startIdx - 1].end }
}

export interface PeerComparison {
  platform: Platform
  /** The other creatives on the same platform with performance in the period. */
  peerIds: string[]
  ctr: { creative: number | null; peers: number | null }
  roas: { creative: number | null; peers: number | null }
}

/** How one creative compares with the pooled values of the other creatives on its platform. */
export function peerComparison(rows: CreativeRow[], creativeId: string): PeerComparison | null {
  const self = rows.find((r) => r.creative.creativeId === creativeId)
  if (!self || self.counts === null) return null
  const peers = rows.filter((r): r is MeasuredRow => r.counts !== null && r.creative.platform === self.creative.platform && r.creative.creativeId !== creativeId)
  if (peers.length === 0) return null
  const sum = (rs: MeasuredRow[], k: 'impressions' | 'clicks' | 'spend') => rs.reduce((s, r) => s + r.counts[k], 0)
  const tracked = peers.filter((r) => r.counts.attributedRevenue !== null)
  const pooled = computeMetrics({
    impressions: sum(peers, 'impressions'),
    clicks: sum(peers, 'clicks'),
    conversions: 0,
    spend: sum(tracked, 'spend'),
    attributedRevenue: tracked.reduce((s, r) => s + (r.counts.attributedRevenue ?? 0), 0),
  })
  return {
    platform: self.creative.platform,
    peerIds: peers.map((r) => r.creative.creativeId),
    ctr: { creative: self.metrics.ctr, peers: pooled.ctr },
    roas: { creative: self.metrics.roas, peers: pooled.roas },
  }
}
