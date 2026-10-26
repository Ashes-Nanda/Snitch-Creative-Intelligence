import { describe, expect, test } from 'vitest'
import { createDismissalStore } from './dismissals'
import { memoryStorage } from './experiments'
import type { Insight } from './insights'

const insight = { insightId: 'meta:offer:no offer:ctr', title: 'No visible offer' } as Insight
const opts = { now: () => new Date('2026-10-26T10:00:00Z'), actor: 'You (this browser)' }

describe('insight dismissals', () => {
  test('dismissing needs a reason and keeps a snapshot of the insight', () => {
    const store = createDismissalStore(memoryStorage(), opts)
    expect(store.dismiss(insight, ' ')).toEqual({ ok: false, error: 'Give a reason for dismissing.' })
    expect(store.dismiss(insight, 'Confounded with product-first')).toEqual({ ok: true })
    expect(store.get(insight.insightId)).toEqual({
      insightId: insight.insightId,
      reason: 'Confounded with product-first',
      at: '2026-10-26T10:00:00.000Z',
      actor: 'You (this browser)',
      snapshot: insight,
    })
  })

  test('restoring removes the dismissal; dismissals survive a reload', () => {
    const storage = memoryStorage()
    createDismissalStore(storage, opts).dismiss(insight, 'Not useful')
    const reloaded = createDismissalStore(storage, opts)
    expect(reloaded.get(insight.insightId)?.reason).toBe('Not useful')
    expect(reloaded.restore(insight.insightId)).toEqual({ ok: true })
    expect(createDismissalStore(storage, opts).get(insight.insightId)).toBeUndefined()
  })
})
