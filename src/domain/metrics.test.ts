import { describe, expect, test } from 'vitest'
import { computeMetrics } from './metrics'

describe('computeMetrics', () => {
  test('derives CTR, CPC, CPA, ROAS and conversion rate from raw counts', () => {
    const m = computeMetrics({
      impressions: 20000,
      clicks: 400,
      spend: 1000,
      conversions: 20,
      attributedRevenue: 3500,
    })
    expect(m).toEqual({ ctr: 2, cpc: 2.5, cpa: 50, roas: 3.5, conversionRate: 5 })
  })

  test('returns null (N/A) instead of zero or Infinity when a denominator is zero', () => {
    const m = computeMetrics({
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      attributedRevenue: 0,
    })
    expect(m).toEqual({ ctr: null, cpc: null, cpa: null, roas: null, conversionRate: null })
  })

  test('returns null ROAS when attributed revenue was not reported', () => {
    const m = computeMetrics({
      impressions: 1000,
      clicks: 10,
      spend: 100,
      conversions: 2,
      attributedRevenue: null,
    })
    expect(m.roas).toBeNull()
    expect(m.cpa).toBe(50)
  })
})
