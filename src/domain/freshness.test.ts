import { describe, expect, test } from 'vitest'
import { checkFreshness, evidenceLevels, snapshotOf } from './freshness'
import type { Insight } from './insights'

function insight(id: string, group: string[], comparison: string[], relativeDifference = 0.5): Insight {
  return {
    insightId: id,
    platform: 'meta',
    attribute: 'hookType',
    value: 'product-first',
    metric: 'ctr',
    title: id,
    finding: '',
    evidence: {
      group: { label: 'g', creativeIds: group, impressions: 1, clicks: 1, value: 3 },
      comparison: { label: 'c', creativeIds: comparison, impressions: 1, clicks: 1, value: 2 },
      relativeDifference,
    },
    interpretation: '',
    limitation: '',
    nextStep: '',
    period: { from: '2026-10-05', to: '2026-10-18' },
  }
}

describe('evidenceLevels', () => {
  test('a confounded insight is only a hypothesis; an unconfounded one is supported within the dataset', () => {
    const levels = evidenceLevels([
      insight('pf', ['a', 'b', 'c', 'd'], ['w', 'x']),
      insight('studio', ['a', 'b', 'c'], ['d', 'w', 'x']),
      insight('offer', ['w', 'x', 'y'], ['a', 'b']),
    ])
    expect(Object.fromEntries(levels)).toEqual({ pf: 'hypothesis', studio: 'hypothesis', offer: 'supported' })
  })
})

describe('checkFreshness', () => {
  const saved = snapshotOf(insight('pf', ['a', 'b', 'c'], ['w', 'x', 'y']))

  test('a snapshot the current data reproduces is current', () => {
    expect(checkFreshness(saved, [insight('pf', ['c', 'b', 'a'], ['y', 'x', 'w'], 0.4)])).toEqual({ stale: false })
  })

  test('a snapshot whose insight no longer appears is stale', () => {
    expect(checkFreshness(saved, [])).toEqual({ stale: true, reason: 'The current data no longer shows this pattern.' })
  })

  test('a snapshot whose creative groups changed is stale', () => {
    expect(checkFreshness(saved, [insight('pf', ['a', 'b', 'c', 'd'], ['w', 'x', 'y'])])).toEqual({
      stale: true,
      reason: 'The creatives behind this pattern have changed (added: d).',
    })
  })
})
