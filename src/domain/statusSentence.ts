import { dateRange } from '../app/format'
import type { AnalysisState } from './analysis'
import type { Review } from './review'

export interface OverviewStatusInput {
  currentPeriod: { from: string; to: string }
  previousPeriod: { from: string; to: string } | null
  review: Review | null
  analyses: Map<string, AnalysisState>
  untrackedRevenueCount?: number
}

/**
 * Builds a dynamic status sentence for the Overview dashboard.
 * Derived from the reporting period, comparison period, review findings,
 * and analysis completion status. Avoids unsupported claims and honestly
 * communicates data gaps.
 */
export function buildOverviewStatus({
  currentPeriod,
  previousPeriod,
  review,
  analyses,
  untrackedRevenueCount = 0,
}: OverviewStatusInput): string {
  // 1. Comparison dates
  const dateClause = previousPeriod
    ? `${dateRange(currentPeriod.from, currentPeriod.to)} vs ${dateRange(previousPeriod.from, previousPeriod.to)}`
    : `${dateRange(currentPeriod.from, currentPeriod.to)} (no prior comparison period)`

  // 2. Review findings
  const attention = review?.attention ?? []
  const proposalsNeedingReview = attention.filter((a) => a.kind === 'review_proposal').length
  const creativesInvestigate = attention.filter((a) => a.kind === 'investigate_creative').length
  const insufficientEvidence = attention.filter((a) => a.kind === 'insufficient_evidence').length
  const dataQualityIssues = attention.filter((a) => a.kind === 'data_quality').length

  const findingsParts: string[] = []
  if (proposalsNeedingReview > 0) {
    findingsParts.push(`${proposalsNeedingReview} proposal${proposalsNeedingReview === 1 ? '' : 's'} awaiting review`)
  }
  if (creativesInvestigate > 0) {
    findingsParts.push(`${creativesInvestigate} creative${creativesInvestigate === 1 ? '' : 's'} flagged for investigation`)
  }
  if (insufficientEvidence > 0 && proposalsNeedingReview === 0 && creativesInvestigate === 0) {
    findingsParts.push(`${insufficientEvidence} pattern${insufficientEvidence === 1 ? '' : 's'} ${insufficientEvidence === 1 ? 'lacks' : 'lack'} sufficient evidence`)
  }
  if (dataQualityIssues > 0 && findingsParts.length === 0) {
    findingsParts.push(`${dataQualityIssues} data-quality issue${dataQualityIssues === 1 ? '' : 's'}`)
  }

  let findingsClause: string
  if (findingsParts.length > 0) {
    findingsClause = findingsParts.join(', ')
  } else if (attention.length === 0) {
    findingsClause = 'no creatives flagged and no proposals awaiting review'
  } else {
    findingsClause = `${attention.length} item${attention.length === 1 ? '' : 's'} requiring attention`
  }

  // 3. Analysis status
  const totalAnalyses = analyses.size
  const completedAnalyses = [...analyses.values()].filter((a) => a.status === 'complete').length
  let analysisClause = ''
  if (totalAnalyses > 0) {
    analysisClause = `${completedAnalyses} of ${totalAnalyses} creatives analyzed`
  }

  // 4. Honesty caveats (e.g. untracked revenue)
  const caveat =
    untrackedRevenueCount > 0
      ? ` (${untrackedRevenueCount} creative${untrackedRevenueCount === 1 ? '' : 's'} without revenue tracking)`
      : ''

  if (analysisClause) {
    return `${dateClause}: ${findingsClause} · ${analysisClause}${caveat}.`
  }
  return `${dateClause}: ${findingsClause}${caveat}.`
}
