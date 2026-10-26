import type { Outcome, Storage } from './experiments'
import { snapshotOf, type InsightSnapshot } from './freshness'
import type { Insight } from './insights'

export interface Dismissal {
  insightId: string
  reason: string
  at: string
  actor: string
  /** The insight as it stood when dismissed. */
  snapshot: InsightSnapshot
}

/** Records people's decisions to set insights aside. Dismissed insights are kept, never deleted. */
export function createDismissalStore(storage: Storage, { now = () => new Date(), actor }: { now?: () => Date; actor: string }) {
  let dismissals: Record<string, Dismissal> = {}
  let loadError: string | null = null
  try {
    const raw = storage.load()
    if (raw !== null) dismissals = JSON.parse(raw)
  } catch {
    loadError = 'Saved dismissals could not be read, so they were reset.'
  }

  // Stable between changes, so callers can memoise on it.
  let list = Object.values(dismissals)

  function commit(next: Record<string, Dismissal>): Outcome {
    try {
      storage.save(JSON.stringify(next))
    } catch {
      return { ok: false, error: 'The decision could not be saved, so nothing changed. Try again.' }
    }
    dismissals = next
    list = Object.values(next)
    return { ok: true }
  }

  return {
    loadError,
    get: (insightId: string): Dismissal | undefined => dismissals[insightId],
    all: (): Dismissal[] => list,
    dismiss(insight: Insight, reason: string): Outcome {
      if (!reason.trim()) return { ok: false, error: 'Give a reason for dismissing.' }
      return commit({
        ...dismissals,
        [insight.insightId]: { insightId: insight.insightId, reason: reason.trim(), at: now().toISOString(), actor, snapshot: snapshotOf(insight) },
      })
    },
    restore(insightId: string): Outcome {
      const { [insightId]: _removed, ...rest } = dismissals
      return commit(rest)
    },
  }
}
