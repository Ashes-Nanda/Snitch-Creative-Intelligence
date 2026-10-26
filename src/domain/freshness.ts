import { findOverlaps, type Insight } from './insights'

export type EvidenceLevel = 'supported' | 'hypothesis'

/**
 * Evidence level of each insight that cleared the evidence bar. A confounded insight is only a
 * hypothesis: its attribute always appears alongside another, so the data can't single it out.
 * (Patterns that didn't clear the bar are reported separately as insufficient evidence.)
 */
export function evidenceLevels(insights: Insight[]): Map<string, EvidenceLevel> {
  const overlaps = findOverlaps(insights)
  return new Map(insights.map((i) => [i.insightId, overlaps.has(i.insightId) ? 'hypothesis' : 'supported']))
}

/** The evidence as it stood when someone acted on an insight, kept even if the data later changes. */
export type InsightSnapshot = Insight

export function snapshotOf(insight: Insight): InsightSnapshot {
  return structuredClone(insight)
}

export type Freshness = { stale: false } | { stale: true; reason: string }

/**
 * Compares a saved snapshot with the insights produced from the current data.
 * `current` must be generated for the snapshot's own reporting period and with no other filters,
 * so that a difference means the data changed, not the view.
 */
export function checkFreshness(snapshot: InsightSnapshot, current: Insight[]): Freshness {
  const now = current.find((i) => i.insightId === snapshot.insightId)
  if (!now) return { stale: true, reason: 'The current data no longer shows this pattern.' }

  const before = new Set([...snapshot.evidence.group.creativeIds, ...snapshot.evidence.comparison.creativeIds])
  const after = new Set([...now.evidence.group.creativeIds, ...now.evidence.comparison.creativeIds])
  const movedGroup = now.evidence.group.creativeIds.some((id) => !snapshot.evidence.group.creativeIds.includes(id)) ||
    snapshot.evidence.group.creativeIds.some((id) => !now.evidence.group.creativeIds.includes(id))
  const added = [...after].filter((id) => !before.has(id))
  const removed = [...before].filter((id) => !after.has(id))
  if (added.length || removed.length || movedGroup) {
    const parts = [added.length && `added: ${added.join(', ')}`, removed.length && `removed: ${removed.join(', ')}`].filter(Boolean)
    return { stale: true, reason: `The creatives behind this pattern have changed${parts.length ? ` (${parts.join('; ')})` : ''}.` }
  }
  return { stale: false }
}
