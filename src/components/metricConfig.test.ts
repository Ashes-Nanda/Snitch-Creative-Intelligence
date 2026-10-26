import { describe, expect, test } from 'vitest'
import { getMetricChangeTone, KPI_NEUTRAL_THRESHOLD, metrics } from './metricConfig'

describe('KPI change semantics and direction', () => {
  test('explicitly defines KPI_NEUTRAL_THRESHOLD as 2%', () => {
    expect(KPI_NEUTRAL_THRESHOLD).toBe(0.02)
  })

  test('keeps Spend strictly neutral regardless of change direction or magnitude', () => {
    expect(metrics.spend.better).toBeNull()
    expect(getMetricChangeTone('spend', 0.25)).toBe('neutral')
    expect(getMetricChangeTone('spend', -0.25)).toBe('neutral')
    expect(getMetricChangeTone('spend', 0.01)).toBe('neutral')
    expect(getMetricChangeTone('spend', -0.01)).toBe('neutral')
  })

  test('keeps changes within ±2% neutral for all metrics', () => {
    // Within threshold: +1.5% and -1.5%
    expect(getMetricChangeTone('roas', 0.015)).toBe('neutral')
    expect(getMetricChangeTone('roas', -0.015)).toBe('neutral')
    expect(getMetricChangeTone('ctr', 0.02)).toBe('neutral')
    expect(getMetricChangeTone('ctr', -0.02)).toBe('neutral')
    expect(getMetricChangeTone('cpa', -0.019)).toBe('neutral')
    expect(getMetricChangeTone('cpa', 0.019)).toBe('neutral')
  })

  test('treats higher-is-better metrics as good when positive and bad when negative beyond threshold', () => {
    expect(metrics.roas.better).toBe('higher')
    expect(getMetricChangeTone('roas', 0.05)).toBe('good')
    expect(getMetricChangeTone('roas', -0.05)).toBe('bad')

    expect(metrics.ctr.better).toBe('higher')
    expect(getMetricChangeTone('ctr', 0.03)).toBe('good')
    expect(getMetricChangeTone('ctr', -0.03)).toBe('bad')

    expect(metrics.conversions.better).toBe('higher')
    expect(getMetricChangeTone('conversions', 0.1)).toBe('good')
    expect(getMetricChangeTone('conversions', -0.1)).toBe('bad')
  })

  test('treats lower-is-better metrics (CPA, CPC) as good when negative and bad when positive beyond threshold', () => {
    expect(metrics.cpa.better).toBe('lower')
    expect(getMetricChangeTone('cpa', -0.08)).toBe('good')
    expect(getMetricChangeTone('cpa', 0.08)).toBe('bad')

    expect(metrics.cpc.better).toBe('lower')
    expect(getMetricChangeTone('cpc', -0.05)).toBe('good')
    expect(getMetricChangeTone('cpc', 0.05)).toBe('bad')
  })

  test('handles null change safely', () => {
    expect(getMetricChangeTone('roas', null)).toBe('neutral')
    expect(getMetricChangeTone('spend', null)).toBe('neutral')
  })
})
