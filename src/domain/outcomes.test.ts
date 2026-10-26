import { describe, expect, test } from 'vitest'
import { createProposalStore, memoryStorage, type Proposal } from './experiments'
import { summarizeOutcomes } from './outcomes'

const insight = (value: string) =>
  ({
    insightId: `meta:hookType:${value}:ctr`,
    platform: 'meta',
    attribute: 'hookType',
    value,
    metric: 'ctr',
    title: '',
    finding: '',
    evidence: { group: { label: value, creativeIds: ['a', 'b', 'c'], impressions: 1, clicks: 1, value: 1 }, comparison: { label: '', creativeIds: ['d', 'e', 'f'], impressions: 1, clicks: 1, value: 1 }, relativeDifference: 0.5 },
    interpretation: '',
    limitation: '',
    nextStep: '',
    period: { from: '2026-10-01', to: '2026-10-25' },
  }) as const

function store() {
  const s = createProposalStore(memoryStorage(), { actor: 'Tester', now: () => new Date('2026-10-26T10:00:00Z') })
  s.syncProposals(['product-first', 'lifestyle', 'offer-first', 'text-first'].map(insight) as never)
  return s
}
const id = (v: string) => `exp:meta:hookType:${v}:ctr`

describe('summarizeOutcomes', () => {
  test('acceptance rate leaves undecided recommendations out of the denominator', () => {
    const s = store()
    s.approve(id('product-first'))
    s.reject(id('lifestyle'), 'Already tested')
    const o = summarizeOutcomes(s.list(), [])
    expect(o.recommendations).toMatchObject({ generated: 4, accepted: 1, rejected: 1, undecided: 2 })
    expect(o.recommendations.acceptanceRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
  })

  test('a rejected recommendation reopened and approved counts as accepted', () => {
    const s = store()
    s.reject(id('product-first'), 'Not now')
    s.reopen(id('product-first'))
    s.submit(id('product-first'))
    s.approve(id('product-first'))
    expect(summarizeOutcomes(s.list(), []).recommendations).toMatchObject({ accepted: 1, rejected: 0 })
  })

  test('edit rate is over recommendations a person acted on', () => {
    const s = store()
    s.requestEdits(id('product-first'), 'Tighten the hypothesis')
    s.approve(id('lifestyle'))
    expect(summarizeOutcomes(s.list(), []).recommendations.humanEditRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
  })

  test('generated or approved proposals are not completed experiments; only recorded outcomes are', () => {
    const s = store()
    s.approve(id('product-first'))
    s.approve(id('lifestyle'))
    s.recordOutcome(id('product-first'), { verdict: 'won', controlValue: 1.0, variantValue: 0.8, resultSource: 'Meta export', notes: '' })
    const o = summarizeOutcomes(s.list(), [])
    expect(o.experiments.approved).toBe(2)
    expect(o.experiments.outcomeRecordedRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
    expect(o.experiments.verdicts.won).toBe(1)
    expect(o.experiments.verdictDisagreements).toBe(1)
  })

  test('reports no rate, not zero, when nothing has been decided', () => {
    const o = summarizeOutcomes(store().list(), [])
    expect(o.recommendations.acceptanceRate.value).toBeNull()
    expect(o.experiments.outcomeRecordedRate.value).toBeNull()
  })

  test('counts hand-started drafts separately, with how many were submitted', () => {
    const s = store()
    const a = s.createDraft({ title: 'T', hypothesis: 'H', control: 'C', variant: 'V', successCriteria: 'S' }, 'k1')
    s.createDraft({ title: 'Half done' }, 'k2')
    if (a.ok) s.submit(a.proposalId)
    const o = summarizeOutcomes(s.list(), [])
    expect(o.recommendations.generated).toBe(4)
    expect(o.drafts.started).toBe(2)
    expect(o.drafts.submissionRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
  })

  test('only counts proposals created inside the window', () => {
    const p = store().list()
    expect(summarizeOutcomes(p as Proposal[], [], { from: '2026-10-27T00:00:00Z' }).recommendations.generated).toBe(0)
  })
})
