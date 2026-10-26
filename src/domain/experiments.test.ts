import { describe, expect, test } from 'vitest'
import { createProposalStore, memoryStorage, type Storage } from './experiments'
import type { Insight } from './insights'

const insight: Insight = {
  insightId: 'meta:hookType:product-first:ctr',
  platform: 'meta',
  attribute: 'hookType',
  value: 'product-first',
  metric: 'ctr',
  title: 'Creatives with a product-first opening hook have a higher CTR on Meta Ads',
  finding: '4 creatives …',
  evidence: {
    group: { label: 'product-first', creativeIds: ['a', 'b', 'c', 'd'], impressions: 40000, clicks: 1200, value: 3 },
    comparison: { label: 'not product-first', creativeIds: ['w', 'x', 'y', 'z'], impressions: 40000, clicks: 600, value: 1.5 },
    relativeDifference: 1,
  },
  interpretation: 'Using a product-first opening hook may help attract clicks.',
  limitation: 'This is a correlation …',
  nextStep: 'Test a product-first opening hook …',
  period: { from: '2026-10-05', to: '2026-10-18' },
}

const clock = () => {
  let t = Date.UTC(2026, 9, 26, 9, 0)
  return () => new Date((t += 60_000))
}

function storeWith(storage: Storage = memoryStorage()) {
  return createProposalStore(storage, { now: clock(), actor: 'You (this browser)' })
}

function proposedFromInsight() {
  const store = storeWith()
  store.syncProposals([insight])
  return { store, id: store.list()[0].proposalId }
}

describe('proposals from insights', () => {
  test('each insight yields one proposal awaiting review, carrying a snapshot of its evidence', () => {
    const store = storeWith()
    store.syncProposals([insight])
    store.syncProposals([insight])

    expect(store.list()).toHaveLength(1)
    const p = store.list()[0]
    expect(p).toMatchObject({ status: 'needs_review', primaryMetric: 'ctr', guardrailMetrics: ['cpa', 'roas'], outcome: null })
    expect(p.source.insight?.evidence.group.creativeIds).toEqual(['a', 'b', 'c', 'd'])
    expect(p.source.creativeIds).toEqual(['a', 'b', 'c', 'd', 'w', 'x', 'y', 'z'])
    expect(p.successCriteria).toMatch(/CTR/)
    expect(p.history).toEqual([
      { type: 'created', from: null, to: 'needs_review', at: '2026-10-26T09:01:00.000Z', actor: 'System (from insight)', reason: null },
    ])
  })
})

describe('review decisions', () => {
  test('approving records who approved, when, and why', () => {
    const { store, id } = proposedFromInsight()
    expect(store.approve(id, 'Strong CTR gap, cheap to test')).toEqual({ ok: true })
    const p = store.list()[0]
    expect(p.status).toBe('approved')
    expect(p.history.at(-1)).toEqual({
      type: 'approved',
      from: 'needs_review',
      to: 'approved',
      at: '2026-10-26T09:02:00.000Z',
      actor: 'You (this browser)',
      reason: 'Strong CTR gap, cheap to test',
    })
  })

  test('rejecting requires a reason', () => {
    const { store, id } = proposedFromInsight()
    expect(store.reject(id, '  ')).toEqual({ ok: false, error: 'Give a reason for rejecting.' })
    expect(store.reject(id, 'Confounded with studio style')).toEqual({ ok: true })
    expect(store.list()[0].status).toBe('rejected')
  })

  test('requesting edits sends the proposal back to draft with the reason recorded', () => {
    const { store, id } = proposedFromInsight()
    expect(store.requestEdits(id, 'Tighten success criteria')).toEqual({ ok: true })
    const p = store.list()[0]
    expect(p.status).toBe('draft')
    expect(p.history.at(-1)).toMatchObject({ type: 'edits_requested', from: 'needs_review', to: 'draft', reason: 'Tighten success criteria' })
  })

  test('a rejected proposal can be reopened as a draft without losing its history', () => {
    const { store, id } = proposedFromInsight()
    store.reject(id, 'Not now')
    expect(store.reopen(id)).toEqual({ ok: true })
    expect(store.list()[0].status).toBe('draft')
    expect(store.list()[0].history.map((h) => h.type)).toEqual(['created', 'rejected', 'reopened'])
  })

  test('decisions out of order are refused and change nothing', () => {
    const { store, id } = proposedFromInsight()
    store.approve(id)
    expect(store.reject(id, 'too late')).toEqual({ ok: false, error: 'Only proposals that need review can be rejected.' })
    expect(store.approve(id)).toEqual({ ok: false, error: 'Only proposals that need review can be approved.' })
    expect(store.reopen(id)).toEqual({ ok: false, error: 'Only rejected proposals can be reopened.' })
    expect(store.list()[0].history).toHaveLength(2)
    expect(store.approve('nope')).toEqual({ ok: false, error: 'Proposal nope not found.' })
  })
})

describe('drafts', () => {
  test('a draft can start incomplete, but cannot be submitted until required fields are filled', () => {
    const store = storeWith()
    const created = store.createDraft({ title: 'Try UGC opener', sourceCreativeIds: ['cr-014'] }, 'form-1')
    expect(created).toEqual({ ok: true, proposalId: expect.any(String) })
    const id = (created as { proposalId: string }).proposalId

    expect(store.submit(id)).toEqual({
      ok: false,
      error: 'Fill in before submitting: hypothesis, control, variant, success criteria.',
    })

    expect(
      store.edit(id, {
        hypothesis: 'A UGC opener lifts CTR.',
        control: 'cr-002 as is',
        variant: 'cr-002 with a creator opener',
        successCriteria: 'Variant CTR above control after 7 days.',
      }),
    ).toEqual({ ok: true })
    expect(store.submit(id)).toEqual({ ok: true })

    const p = store.list()[0]
    expect(p.status).toBe('needs_review')
    expect(p.source).toEqual({ insight: null, creativeIds: ['cr-014'] })
    expect(p.history.map((h) => h.type)).toEqual(['created', 'edited', 'submitted'])
  })

  test('submitting the same form twice creates one draft', () => {
    const store = storeWith()
    const first = store.createDraft({ title: 'A' }, 'form-1')
    const second = store.createDraft({ title: 'A' }, 'form-1')
    expect(second).toEqual(first)
    expect(store.list()).toHaveLength(1)
  })

  test('editing a proposal under review returns it to draft; approved proposals cannot be edited', () => {
    const { store, id } = proposedFromInsight()
    expect(store.edit(id, { hypothesis: 'Sharper hypothesis' })).toEqual({ ok: true })
    expect(store.list()[0]).toMatchObject({ status: 'draft', hypothesis: 'Sharper hypothesis' })

    store.submit(id)
    store.approve(id)
    expect(store.edit(id, { hypothesis: 'x' })).toEqual({ ok: false, error: 'Approved or closed proposals cannot be edited.' })
  })
})

describe('outcomes', () => {
  function approved() {
    const { store, id } = proposedFromInsight()
    store.approve(id)
    return { store, id }
  }

  test('a won outcome completes the proposal and keeps the observed values and their source', () => {
    const { store, id } = approved()
    expect(
      store.recordOutcome(id, { verdict: 'won', controlValue: 1.12, variantValue: 1.41, resultSource: 'Meta Ads Manager export, 3 Nov', notes: 'CPA held' }),
    ).toEqual({ ok: true })
    const p = store.list()[0]
    expect(p.status).toBe('completed')
    expect(p.outcome).toMatchObject({ verdict: 'won', controlValue: 1.12, variantValue: 1.41, check: 'favours variant', disagrees: false })
    expect(p.history.at(-1)).toMatchObject({ type: 'outcome_recorded', from: 'approved', to: 'completed' })
  })

  test('the system flags, but does not override, a verdict that disagrees with the entered values', () => {
    const { store, id } = approved()
    store.recordOutcome(id, { verdict: 'won', controlValue: 1.5, variantValue: 1.2, resultSource: 'export', notes: '' })
    expect(store.list()[0].outcome).toMatchObject({ verdict: 'won', check: 'favours control', disagrees: true })
  })

  test('a result without both values cannot be checked', () => {
    const { store, id } = approved()
    store.recordOutcome(id, { verdict: 'inconclusive', controlValue: null, variantValue: null, resultSource: 'call with agency', notes: '' })
    expect(store.list()[0].outcome).toMatchObject({ check: 'not comparable', disagrees: false })
  })

  test('marking a proposal not run needs a reason and records no result', () => {
    const { store, id } = approved()
    expect(store.recordOutcome(id, { verdict: 'not_run', controlValue: null, variantValue: null, resultSource: '', notes: '' })).toEqual({
      ok: false,
      error: 'Say why the test was not run.',
    })
    expect(store.recordOutcome(id, { verdict: 'not_run', controlValue: null, variantValue: null, resultSource: '', notes: 'Budget moved to sale' })).toEqual({ ok: true })
    expect(store.list()[0]).toMatchObject({ status: 'not_run', outcome: { verdict: 'not_run', notes: 'Budget moved to sale' } })
  })

  test('a won, lost or inconclusive verdict needs a result source', () => {
    const { store, id } = approved()
    expect(store.recordOutcome(id, { verdict: 'lost', controlValue: 2, variantValue: 1, resultSource: ' ', notes: '' })).toEqual({
      ok: false,
      error: 'Say where the result came from.',
    })
  })

  test('an outcome can only be recorded for an approved proposal', () => {
    const { store, id } = proposedFromInsight()
    expect(store.recordOutcome(id, { verdict: 'won', controlValue: 1, variantValue: 2, resultSource: 'x', notes: '' })).toEqual({
      ok: false,
      error: 'Outcomes can only be recorded for approved proposals.',
    })
  })
})

describe('persistence', () => {
  test('decisions and history survive a reload from the same storage', () => {
    const storage = memoryStorage()
    const first = storeWith(storage)
    first.syncProposals([insight])
    const id = first.list()[0].proposalId
    first.approve(id, 'Go')

    const reloaded = storeWith(storage)
    reloaded.syncProposals([insight])
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0].status).toBe('approved')
    expect(reloaded.list()[0].history.map((h) => h.type)).toEqual(['created', 'approved'])
  })

  test('a failed save reports the failure and leaves the proposal unchanged', () => {
    let failing = false
    const inner = memoryStorage()
    const flaky: Storage = {
      load: inner.load,
      save: (v) => {
        if (failing) throw new Error('QuotaExceededError')
        inner.save(v)
      },
    }
    const store = storeWith(flaky)
    store.syncProposals([insight])
    const id = store.list()[0].proposalId

    failing = true
    expect(store.approve(id)).toEqual({ ok: false, error: 'The decision could not be saved, so nothing changed. Try again.' })
    expect(store.list()[0].status).toBe('needs_review')
    expect(storeWith(inner).list()[0].status).toBe('needs_review')
  })

  test('unreadable or older-format storage starts empty and says why', () => {
    expect(storeWith(memoryStorage('{not json')).loadError).toMatch(/could not be read/i)
    const old = storeWith(memoryStorage(JSON.stringify([{ experimentId: 'exp:x', approvalStatus: 'approved' }])))
    expect(old.list()).toEqual([])
    expect(old.loadError).toMatch(/could not be read/i)
  })
})
