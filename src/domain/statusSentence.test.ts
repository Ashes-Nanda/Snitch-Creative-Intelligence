import { describe, expect, test } from 'vitest'
import type { AnalysisState } from './analysis'
import type { Review } from './review'
import { dateRange } from '../app/format'
import { buildOverviewStatus } from './statusSentence'

describe('buildOverviewStatus', () => {
  const defaultCurrent = { from: '2026-10-12', to: '2026-10-25' }
  const defaultPrevious = { from: '2026-09-28', to: '2026-10-11' }

  const makeAnalyses = (completeCount: number, totalCount: number): Map<string, AnalysisState> => {
    const map = new Map<string, AnalysisState>()
    for (let i = 1; i <= totalCount; i++) {
      const id = `cr-${String(i).padStart(3, '0')}`
      if (i <= completeCount) {
        map.set(id, {
          status: 'complete',
          analysis: {
            creativeId: id,
            hookType: 'model-first',
            productVisibility: 'prominent',
            offerType: null,
            ctaType: 'none',
            visualStyle: 'studio',
            textDensity: 'low',
            description: 'Test creative',
            modelVersion: 'test-v1',
            createdAt: '2026-10-26T00:00:00.000Z',
          },
        })
      } else {
        map.set(id, { status: 'unattempted' })
      }
    }
    return map
  }

  test('includes comparison dates and review findings when previous period exists', () => {
    const review: Review = {
      attention: [
        { kind: 'review_proposal', targetId: 'p1', title: 'Review proposal: P1', detail: 'detail' },
        { kind: 'investigate_creative', targetId: 'cr-006', title: 'Investigate cr-006', detail: 'detail' },
      ],
      recommended: { kind: 'review_proposal', targetId: 'p1', title: 'Review proposal: P1', detail: 'detail' },
    }
    const analyses = makeAnalyses(14, 28)

    const status = buildOverviewStatus({
      currentPeriod: defaultCurrent,
      previousPeriod: defaultPrevious,
      review,
      analyses,
    })

    expect(status).toContain(`${dateRange(defaultCurrent.from, defaultCurrent.to)} vs ${dateRange(defaultPrevious.from, defaultPrevious.to)}`)
    expect(status).toContain('1 proposal awaiting review')
    expect(status).toContain('1 creative flagged for investigation')
    expect(status).toContain('14 of 28 creatives analyzed')
    expect(status).not.toContain('business is healthy')
    expect(status).not.toContain('on track')
  })

  test('communicates honestly when no previous period exists', () => {
    const review: Review = {
      attention: [],
      recommended: null,
    }
    const analyses = makeAnalyses(5, 10)

    const status = buildOverviewStatus({
      currentPeriod: { from: '2026-09-14', to: '2026-09-27' },
      previousPeriod: null,
      review,
      analyses,
    })

    expect(status).toContain(`${dateRange('2026-09-14', '2026-09-27')} (no prior comparison period)`)
    expect(status).toContain('no creatives flagged and no proposals awaiting review')
    expect(status).toContain('5 of 10 creatives analyzed')
  })

  test('honestly highlights insufficient evidence and untracked revenue', () => {
    const review: Review = {
      attention: [
        { kind: 'insufficient_evidence', targetId: 'meta:offer:sale', title: 'Not enough evidence', detail: 'detail' },
      ],
      recommended: null,
    }
    const analyses = makeAnalyses(14, 28)

    const status = buildOverviewStatus({
      currentPeriod: defaultCurrent,
      previousPeriod: defaultPrevious,
      review,
      analyses,
      untrackedRevenueCount: 2,
    })

    expect(status).toContain('1 pattern lacks sufficient evidence')
    expect(status).toContain('2 creatives without revenue tracking')
  })
})
