import type { CreativeAnalysis } from './analysis'
import type { Platform } from './ingest'
import type { RawCounts } from './metrics'
import type { CreativeRow } from './view'

export type Attribute = 'hookType' | 'visualStyle' | 'offer' | 'prominence'

/** undefined means the analysis doesn't record this attribute, so the creative sits out that comparison. */
const attributeValue: Record<Attribute, (a: CreativeAnalysis) => string | undefined> = {
  hookType: (a) => a.hookType,
  visualStyle: (a) => a.visualStyle,
  offer: (a) => (a.offerType ? 'with offer' : 'no offer'),
  prominence: (a) => a.productProminence,
}

export interface GroupEvidence {
  label: string
  creativeIds: string[]
  impressions: number
  clicks: number
  value: number
}

export interface Insight {
  insightId: string
  platform: Platform
  attribute: Attribute
  value: string
  metric: 'ctr'
  title: string
  finding: string
  evidence: { group: GroupEvidence; comparison: GroupEvidence; relativeDifference: number }
  interpretation: string
  limitation: string
  nextStep: string
  period: { from: string; to: string }
}

export interface SuppressedPattern {
  platform: Platform
  attribute: Attribute
  value: string
  reason: string
}

/** Below these, a difference is treated as noise rather than a pattern. */
export const MIN_CREATIVES_PER_GROUP = 3
export const MIN_RELATIVE_DIFFERENCE = 0.15

export const attributeNames: Record<Attribute, string> = {
  hookType: 'opening hook',
  visualStyle: 'visual style',
  offer: 'offer',
  prominence: 'product prominence',
}

export const describeAttribute: Record<Attribute, (value: string) => string> = {
  hookType: (v) => `a ${v} opening hook`,
  visualStyle: (v) => `a ${v} visual style`,
  offer: (v) => (v === 'with offer' ? 'a visible offer' : 'no visible offer'),
  prominence: (v) => `the product shown ${v === 'not_visible' ? 'not at all' : `as ${v}`} in the frame`,
}
export const heldConstant: Record<Attribute, string[]> = {
  hookType: ['product', 'offer', 'audience', 'placement', 'budget'],
  visualStyle: ['product', 'opening hook', 'offer', 'audience', 'placement', 'budget'],
  offer: ['product', 'opening hook', 'visual style', 'audience', 'placement', 'budget'],
  prominence: ['product', 'offer', 'visual style', 'audience', 'placement', 'budget'],
}
const platformLabels: Record<Platform, string> = { meta: 'Meta Ads', google: 'Google Ads' }

/** A row with performance in the period: the only kind that can be compared. */
type MeasuredRow = CreativeRow & { counts: RawCounts }

function pooledCtr(rows: MeasuredRow[], label: string): GroupEvidence | null {
  const impressions = rows.reduce((s, r) => s + r.counts.impressions, 0)
  const clicks = rows.reduce((s, r) => s + r.counts.clicks, 0)
  if (impressions === 0) return null
  return { label, creativeIds: rows.map((r) => r.creative.creativeId), impressions, clicks, value: (clicks / impressions) * 100 }
}

export function generateInsights(
  rows: CreativeRow[],
  analyses: Map<string, CreativeAnalysis>,
  period: { from: string; to: string },
): { insights: Insight[]; suppressed: SuppressedPattern[] } {
  const insights: Insight[] = []
  const suppressed: SuppressedPattern[] = []
  // Platforms define and attribute metrics differently, so comparisons never cross them.
  for (const platform of ['meta', 'google'] as const) {
    const analysed = rows.filter(
      (r): r is MeasuredRow => r.counts !== null && r.creative.platform === platform && analyses.has(r.creative.creativeId),
    )
    for (const attribute of Object.keys(attributeValue) as Attribute[]) {
      const valueOf = (r: MeasuredRow) => attributeValue[attribute](analyses.get(r.creative.creativeId)!)
      const withValue = analysed.filter((r) => valueOf(r) !== undefined)
      for (const value of new Set(withValue.map(valueOf) as string[])) {
        const outcome = compareGroup(
          { platform, attribute, value, period },
          withValue.filter((r) => valueOf(r) === value),
          withValue.filter((r) => valueOf(r) !== value),
        )
        if (outcome?.kind === 'insight') insights.push(outcome.insight)
        if (outcome?.kind === 'suppressed') suppressed.push(outcome.pattern)
      }
    }
  }
  return { insights, suppressed }
}

interface Candidate {
  platform: Platform
  attribute: Attribute
  value: string
  period: { from: string; to: string }
}

function compareGroup(
  c: Candidate,
  inGroup: MeasuredRow[],
  rest: MeasuredRow[],
): { kind: 'insight'; insight: Insight } | { kind: 'suppressed'; pattern: SuppressedPattern } | null {
  if (rest.length === 0) return null
  const group = pooledCtr(inGroup, c.value)
  const comparison = pooledCtr(rest, `not ${c.value}`)
  if (!group || !comparison || comparison.value === 0) return null
  const relativeDifference = (group.value - comparison.value) / comparison.value
  if (relativeDifference < MIN_RELATIVE_DIFFERENCE) return null

  const smallest = Math.min(inGroup.length, rest.length)
  if (smallest < MIN_CREATIVES_PER_GROUP) {
    const which = inGroup.length < MIN_CREATIVES_PER_GROUP ? 'group' : 'comparison group'
    return {
      kind: 'suppressed',
      pattern: {
        platform: c.platform,
        attribute: c.attribute,
        value: c.value,
        reason: `Only ${smallest} creatives in the ${which}; at least ${MIN_CREATIVES_PER_GROUP} are needed.`,
      },
    }
  }

  const phrase = describeAttribute[c.attribute](c.value)
  return {
    kind: 'insight',
    insight: {
      insightId: `${c.platform}:${c.attribute}:${c.value}:ctr`,
      platform: c.platform,
      attribute: c.attribute,
      value: c.value,
      metric: 'ctr',
      title: `Creatives with ${phrase} have a higher CTR on ${platformLabels[c.platform]}`,
      finding: `${inGroup.length} creatives with ${phrase} averaged ${group.value.toFixed(2)}% CTR versus ${comparison.value.toFixed(2)}% for the other ${rest.length} analysed creatives (${Math.round(relativeDifference * 100)}% higher).`,
      evidence: { group, comparison, relativeDifference },
      interpretation: `Using ${phrase} may help attract clicks.`,
      limitation: `This is a correlation across ${inGroup.length + rest.length} creatives, not a causal result. Differences in audience, placement, spend or campaign objective may explain it.`,
      nextStep: `Test ${phrase} against the current control while keeping ${heldConstant[c.attribute].join(', ')} constant.`,
      period: c.period,
    },
  }
}

/** Share of the smaller group that must also be in the other group for two insights to count as confounded. */
export const OVERLAP_THRESHOLD = 0.75

/**
 * Maps each insight to the other insights (same platform) whose creative groups largely coincide.
 * When attributes always appear together, this data cannot tell which one, if either, matters.
 */
export function findOverlaps(insights: Insight[]): Map<string, string[]> {
  const overlaps = new Map<string, string[]>()
  for (const a of insights) {
    const aIds = new Set(a.evidence.group.creativeIds)
    const matches = insights.filter((b) => {
      if (b === a || b.platform !== a.platform) return false
      const shared = b.evidence.group.creativeIds.filter((id) => aIds.has(id)).length
      return shared / Math.min(aIds.size, b.evidence.group.creativeIds.length) >= OVERLAP_THRESHOLD
    })
    if (matches.length) overlaps.set(a.insightId, matches.map((b) => b.insightId))
  }
  return overlaps
}

/**
 * Insights worth proposing a test for: an insight is held back when an overlapping
 * insight shows a larger difference, since testing both would test the same creatives twice.
 */
export function recommendable(insights: Insight[]): Insight[] {
  const overlaps = findOverlaps(insights)
  const byId = new Map(insights.map((i) => [i.insightId, i]))
  return insights.filter((i) =>
    (overlaps.get(i.insightId) ?? []).every((otherId) => byId.get(otherId)!.evidence.relativeDifference < i.evidence.relativeDifference),
  )
}
