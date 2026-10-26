import { count, money, percent, times } from '@/app/format'
import type { Metrics, RawCounts } from '@/domain/metrics'

export type MetricKey = 'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue' | 'ctr' | 'cpc' | 'cpa' | 'roas' | 'conversionRate'

interface MetricDef {
  label: string
  /** Definition and formula, shown in tooltips. Identical wherever the metric appears. */
  help: string
  format: (v: number) => string
  better: 'higher' | 'lower' | null
  /** Why the value can be unavailable for a single creative or a total. */
  unavailable: string
}

export const metrics: Record<MetricKey, MetricDef> = {
  spend: { label: 'Spend', help: 'Advertising spend reported by the platform.', format: (v) => money(v), better: null, unavailable: 'No performance records in this period.' },
  impressions: { label: 'Impressions', help: 'Times the creative was shown, as counted by the platform.', format: count, better: null, unavailable: 'No performance records in this period.' },
  clicks: { label: 'Clicks', help: 'Clicks as counted by the platform. Meta and Google count clicks differently.', format: count, better: null, unavailable: 'No performance records in this period.' },
  conversions: { label: 'Conversions', help: 'Conversions attributed by the platform under its own attribution setting.', format: count, better: 'higher', unavailable: 'No performance records in this period.' },
  revenue: { label: 'Revenue', help: 'Revenue attributed by the platform under its own attribution setting.', format: (v) => money(v), better: 'higher', unavailable: 'The platform export has no revenue tracking for this creative.' },
  ctr: { label: 'CTR', help: 'Click-through rate = clicks ÷ impressions × 100.', format: (v) => percent(v), better: 'higher', unavailable: 'Needs impressions greater than zero.' },
  cpc: { label: 'CPC', help: 'Cost per click = spend ÷ clicks.', format: (v) => money(v), better: 'lower', unavailable: 'Needs clicks greater than zero.' },
  cpa: { label: 'CPA', help: 'Cost per acquisition = spend ÷ conversions. Lower is better.', format: (v) => money(v), better: 'lower', unavailable: 'Needs conversions greater than zero.' },
  roas: {
    label: 'ROAS',
    help: 'Return on ad spend = attributed revenue ÷ spend. Each platform attributes revenue its own way, so Meta and Google values are not strictly comparable.',
    format: times,
    better: 'higher',
    unavailable: 'Needs spend greater than zero and revenue tracking.',
  },
  conversionRate: { label: 'Conversion rate', help: 'Conversions ÷ clicks × 100.', format: (v) => percent(v), better: 'higher', unavailable: 'Needs clicks greater than zero.' },
}

/** Reads a metric from counts and derived metrics. Counts are unavailable when there are no records. */
export function metricOf(source: { counts: RawCounts | null; metrics: Metrics }, key: MetricKey): number | null {
  const c = source.counts
  switch (key) {
    case 'spend':
    case 'impressions':
    case 'clicks':
    case 'conversions':
      return c ? c[key] : null
    case 'revenue':
      return c ? c.attributedRevenue : null
    default:
      return source.metrics[key]
  }
}

/** Neutral threshold for KPI period-over-period percentage change (±2%). */
export const KPI_NEUTRAL_THRESHOLD = 0.02

export type MetricChangeTone = 'good' | 'bad' | 'neutral'

/**
 * Computes the semantic direction tone (good, bad, neutral) for a KPI metric change.
 * - Spend and metrics with no target (better: null) are kept neutral.
 * - Changes within ±KPI_NEUTRAL_THRESHOLD (±2%) are neutral.
 * - For metrics where higher is better: positive change > 2% is good, negative change < -2% is bad.
 * - For metrics where lower is better (e.g. CPA, CPC): negative change < -2% is good, positive change > 2% is bad.
 */
export function getMetricChangeTone(metricKey: MetricKey, change: number | null): MetricChangeTone {
  if (change === null) return 'neutral'
  const def = metrics[metricKey]
  if (!def || def.better === null) return 'neutral'
  if (Math.abs(change) <= KPI_NEUTRAL_THRESHOLD) return 'neutral'
  if (def.better === 'higher') {
    return change > KPI_NEUTRAL_THRESHOLD ? 'good' : 'bad'
  }
  if (def.better === 'lower') {
    return change < -KPI_NEUTRAL_THRESHOLD ? 'good' : 'bad'
  }
  return 'neutral'
}
