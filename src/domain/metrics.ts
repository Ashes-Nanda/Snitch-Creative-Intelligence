export interface RawCounts {
  impressions: number
  clicks: number
  spend: number
  conversions: number
  /** null when the source platform did not report revenue */
  attributedRevenue: number | null
}

/** A null metric means N/A: the inputs needed to compute it are missing or zero. */
export interface Metrics {
  ctr: number | null
  cpc: number | null
  cpa: number | null
  roas: number | null
  conversionRate: number | null
}

function ratio(numerator: number | null, denominator: number): number | null {
  if (numerator === null || denominator === 0) return null
  return numerator / denominator
}

function percent(numerator: number, denominator: number): number | null {
  const r = ratio(numerator, denominator)
  return r === null ? null : r * 100
}

export function computeMetrics(c: RawCounts): Metrics {
  return {
    ctr: percent(c.clicks, c.impressions),
    cpc: ratio(c.spend, c.clicks),
    cpa: ratio(c.spend, c.conversions),
    roas: ratio(c.attributedRevenue, c.spend),
    conversionRate: percent(c.conversions, c.clicks),
  }
}
