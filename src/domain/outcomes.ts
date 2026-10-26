import type { Dismissal } from './dismissals'
import type { Proposal, Verdict } from './experiments'
import { rate, type Rate } from './telemetry'

/** System-generated proposals (from an insight) have IDs `exp:<insightId>`; people's drafts are `draft:<key>`. */
export const isRecommendation = (p: Proposal) => p.proposalId.startsWith('exp:')

export interface OutcomeSummary {
  window: { from?: string; to?: string }
  recommendations: {
    generated: number
    accepted: number
    rejected: number
    /** No approve or reject decision yet. Excluded from the acceptance rate, never counted as rejected. */
    undecided: number
    /** Accepted over recommendations with an approve or reject decision. */
    acceptanceRate: Rate
    /** Recommendations a person edited or sent back for edits, over those with any human decision. */
    humanEditRate: Rate
  }
  drafts: {
    started: number
    /** Drafts submitted for review (all required fields filled), over drafts started. */
    submissionRate: Rate
  }
  experiments: {
    approved: number
    /** Approved proposals with a recorded outcome, over approved proposals. Not a measure of business impact. */
    outcomeRecordedRate: Rate
    verdicts: Record<Verdict, number>
    /** Outcomes where the entered values contradict the verdict. */
    verdictDisagreements: number
  }
  dismissedInsights: number
}

const within = (at: string, w: { from?: string; to?: string }) => (!w.from || at >= w.from) && (!w.to || at <= w.to)

/** Workflow signals from recorded decisions. A proposal belongs to the window it was created in. */
export function summarizeOutcomes(allProposals: Proposal[], dismissals: Dismissal[], window: { from?: string; to?: string } = {}): OutcomeSummary {
  const proposals = allProposals.filter((p) => p.history[0] && within(p.history[0].at, window))
  const recs = proposals.filter(isRecommendation)
  const drafts = proposals.filter((p) => !isRecommendation(p))

  // The latest approve or reject decision counts, so a rejected-then-reopened-then-approved proposal is accepted.
  const verdictOf = (p: Proposal) => [...p.history].reverse().find((d) => d.type === 'approved' || d.type === 'rejected')?.type ?? null
  const accepted = recs.filter((p) => verdictOf(p) === 'approved').length
  const rejected = recs.filter((p) => verdictOf(p) === 'rejected').length
  const humanDecided = recs.filter((p) => p.history.some((d) => d.type !== 'created'))
  const edited = humanDecided.filter((p) => p.history.some((d) => d.type === 'edited' || d.type === 'edits_requested'))

  const approved = proposals.filter((p) => p.history.some((d) => d.type === 'approved'))
  const withOutcome = approved.filter((p) => p.outcome !== null)
  const verdicts: Record<Verdict, number> = { won: 0, lost: 0, inconclusive: 0, not_run: 0 }
  for (const p of withOutcome) verdicts[p.outcome!.verdict]++

  return {
    window,
    recommendations: {
      generated: recs.length,
      accepted,
      rejected,
      undecided: recs.length - accepted - rejected,
      acceptanceRate: rate(accepted, accepted + rejected),
      humanEditRate: rate(edited.length, humanDecided.length),
    },
    drafts: {
      started: drafts.length,
      submissionRate: rate(drafts.filter((p) => p.history.some((d) => d.type === 'submitted')).length, drafts.length),
    },
    experiments: {
      approved: approved.length,
      outcomeRecordedRate: rate(withOutcome.length, approved.length),
      verdicts,
      verdictDisagreements: withOutcome.filter((p) => p.outcome!.disagrees).length,
    },
    dismissedInsights: dismissals.filter((d) => within(d.at, window)).length,
  }
}
