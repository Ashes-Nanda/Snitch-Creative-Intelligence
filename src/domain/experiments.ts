import { snapshotOf, type InsightSnapshot } from './freshness'
import { attributeNames, describeAttribute, heldConstant, type Insight } from './insights'

export type ProposalStatus = 'draft' | 'needs_review' | 'approved' | 'rejected' | 'completed' | 'not_run'
export type MetricKey = 'ctr' | 'cpa' | 'roas' | 'conversionRate'

export type DecisionType = 'created' | 'submitted' | 'edited' | 'approved' | 'rejected' | 'edits_requested' | 'reopened' | 'outcome_recorded'

export interface Decision {
  type: DecisionType
  from: ProposalStatus | null
  to: ProposalStatus
  at: string
  actor: string
  reason: string | null
}

export interface ProposalSource {
  insight: InsightSnapshot | null
  creativeIds: string[]
  analysisId?: string | null
  opportunityTitle?: string | null
}

export interface Proposal {
  proposalId: string
  title: string
  hypothesis: string
  control: string
  variant: string
  variablesChanged: string[]
  variablesConstant: string[]
  primaryMetric: MetricKey
  guardrailMetrics: MetricKey[]
  successCriteria: string
  notes: string
  /** What the proposal came from. The insight is a snapshot, kept even if the data later changes. */
  source: ProposalSource
  status: ProposalStatus
  outcome: RecordedOutcome | null
  history: Decision[]
}

export type Verdict = 'won' | 'lost' | 'inconclusive' | 'not_run'

export interface OutcomeInput {
  verdict: Verdict
  /** Observed primary-metric values, if the team has them. */
  controlValue: number | null
  variantValue: number | null
  resultSource: string
  notes: string
}

export interface RecordedOutcome extends OutcomeInput {
  /** The system's reading of the entered values. Shown beside the verdict, never instead of it. */
  check: 'favours variant' | 'favours control' | 'no difference' | 'not comparable'
  disagrees: boolean
  recordedAt: string
}

function checkValues(control: number | null, variant: number | null): RecordedOutcome['check'] {
  if (control === null || variant === null) return 'not comparable'
  return variant > control ? 'favours variant' : variant < control ? 'favours control' : 'no difference'
}

export type EditableFields = Partial<
  Pick<
    Proposal,
    'title' | 'hypothesis' | 'control' | 'variant' | 'variablesChanged' | 'variablesConstant' | 'primaryMetric' | 'guardrailMetrics' | 'successCriteria' | 'notes'
  >
>

const requiredFields: [keyof Proposal, string][] = [
  ['title', 'title'],
  ['hypothesis', 'hypothesis'],
  ['control', 'control'],
  ['variant', 'variant'],
  ['successCriteria', 'success criteria'],
  ['guardrailMetrics', 'guardrail metrics'],
]

/** Labels of required fields that are still empty. A proposal can't be submitted or approved until this is empty. */
export function missingFields(p: Proposal): string[] {
  return requiredFields
    .filter(([key]) => {
      const v = p[key]
      return Array.isArray(v) ? v.length === 0 : typeof v === 'string' ? v.trim() === '' : v === null
    })
    .map(([, label]) => label)
}

export type Outcome = { ok: true } | { ok: false; error: string }

export interface Storage {
  load(): string | null
  save(value: string): void
}

export function memoryStorage(initial: string | null = null): Storage {
  let value = initial
  return {
    load: () => value,
    save: (v) => {
      value = v
    },
  }
}

const SYSTEM_ACTOR = 'System (from insight)'

function proposalFor(insight: Insight): Omit<Proposal, 'history' | 'status'> {
  const phrase = describeAttribute[insight.attribute](insight.value)
  return {
    proposalId: `exp:${insight.insightId}`,
    title: `Test ${phrase} on ${insight.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}`,
    hypothesis: `A variant with ${phrase} will achieve a higher CTR than the control, without materially worsening CPA or ROAS.`,
    control: `Current best creative without ${phrase}`,
    variant: `The same creative, changed only to use ${phrase}`,
    variablesChanged: [attributeNames[insight.attribute]],
    variablesConstant: heldConstant[insight.attribute],
    primaryMetric: 'ctr',
    guardrailMetrics: ['cpa', 'roas'],
    successCriteria: 'Variant CTR above control CTR at the end of the test, with CPA and ROAS within 10% of control.',
    notes: '',
    source: {
      insight: snapshotOf(insight),
      creativeIds: [...insight.evidence.group.creativeIds, ...insight.evidence.comparison.creativeIds],
    },
    outcome: null,
  }
}

export interface StoreOptions {
  now?: () => Date
  /** Who is recorded as making decisions. There are no user accounts in the prototype. */
  actor: string
}

function load(storage: Storage): { proposals: Proposal[]; error: string | null } {
  const raw = storage.load()
  if (raw === null) return { proposals: [], error: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    const looksRight = (p: unknown) =>
      !!p && typeof p === 'object' && typeof (p as Proposal).proposalId === 'string' && Array.isArray((p as Proposal).history)
    if (!Array.isArray(parsed) || !parsed.every(looksRight)) throw new Error('unexpected shape')
    return { proposals: parsed as Proposal[], error: null }
  } catch {
    return { proposals: [], error: 'Saved proposals could not be read (they may be from an older version), so the list was reset.' }
  }
}

export function createProposalStore(storage: Storage, { now = () => new Date(), actor }: StoreOptions) {
  const loaded = load(storage)
  let proposals = loaded.proposals

  /** Saves first and only then updates memory, so a failed save never shows as a success. */
  function commit(next: Proposal[]): Outcome {
    try {
      storage.save(JSON.stringify(next))
    } catch {
      return { ok: false, error: 'The decision could not be saved, so nothing changed. Try again.' }
    }
    proposals = next
    return { ok: true }
  }

  function decide(
    id: string,
    type: DecisionType,
    rule: { from: ProposalStatus[]; to: ProposalStatus; refusal: string; needsComplete?: string },
    reason: string | null = null,
    fields: EditableFields = {},
    extra: Partial<Pick<Proposal, 'outcome'>> = {},
  ): Outcome {
    const target = proposals.find((p) => p.proposalId === id)
    if (!target) return { ok: false, error: `Proposal ${id} not found.` }
    if (!rule.from.includes(target.status)) return { ok: false, error: rule.refusal }
    const updated = { ...target, ...fields }
    const missing = missingFields(updated)
    if (rule.needsComplete && missing.length) return { ok: false, error: `Fill in before ${rule.needsComplete}: ${missing.join(', ')}.` }
    const decision: Decision = { type, from: target.status, to: rule.to, at: now().toISOString(), actor, reason: reason?.trim() || null }
    return commit(proposals.map((p) => (p === target ? { ...updated, ...extra, status: rule.to, history: [...p.history, decision] } : p)))
  }

  return {
    loadError: loaded.error,
    list: (): Proposal[] => proposals,

    /** Adds a proposal awaiting review for each insight that doesn't have one yet. */
    syncProposals(insights: Insight[]): Outcome {
      const known = new Set(proposals.map((p) => p.source.insight?.insightId))
      const fresh = insights
        .filter((i) => !known.has(i.insightId))
        .map(
          (i): Proposal => ({
            ...proposalFor(i),
            status: 'needs_review',
            history: [{ type: 'created', from: null, to: 'needs_review', at: now().toISOString(), actor: SYSTEM_ACTOR, reason: null }],
          }),
        )
      return fresh.length === 0 ? { ok: true } : commit([...proposals, ...fresh])
    },

    /**
     * Starts a proposal by hand. `key` identifies the form submission: repeating it returns the
     * existing draft instead of creating another.
     */
    createDraft(
      input: EditableFields & {
        sourceCreativeIds?: string[]
        sourceInsight?: Insight
        sourceAnalysisId?: string | null
        sourceOpportunityTitle?: string | null
      },
      key: string,
    ): { ok: true; proposalId: string } | { ok: false; error: string } {
      const proposalId = `draft:${key}`
      if (proposals.some((p) => p.proposalId === proposalId)) return { ok: true, proposalId }
      const { sourceCreativeIds = [], sourceInsight, sourceAnalysisId, sourceOpportunityTitle, ...fields } = input
      const source: ProposalSource = {
        insight: sourceInsight ? snapshotOf(sourceInsight) : null,
        creativeIds: sourceCreativeIds,
      }
      if (sourceAnalysisId !== undefined) source.analysisId = sourceAnalysisId
      if (sourceOpportunityTitle !== undefined) source.opportunityTitle = sourceOpportunityTitle

      const draft: Proposal = {
        title: '',
        hypothesis: '',
        control: '',
        variant: '',
        variablesChanged: [],
        variablesConstant: [],
        primaryMetric: 'ctr',
        guardrailMetrics: ['cpa', 'roas'],
        successCriteria: '',
        notes: '',
        ...(sourceInsight ? proposalFor(sourceInsight) : {}),
        ...fields,
        proposalId,
        source,
        outcome: null,
        status: 'draft',
        history: [{ type: 'created', from: null, to: 'draft', at: now().toISOString(), actor, reason: null }],
      }
      const saved = commit([...proposals, draft])
      return saved.ok ? { ok: true, proposalId } : saved
    },

    edit: (id: string, fields: EditableFields) =>
      decide(id, 'edited', { from: ['draft', 'needs_review'], to: 'draft', refusal: 'Approved or closed proposals cannot be edited.' }, null, fields),

    submit: (id: string) =>
      decide(id, 'submitted', { from: ['draft'], to: 'needs_review', refusal: 'Only drafts can be submitted for review.', needsComplete: 'submitting' }),

    approve: (id: string, reason?: string) =>
      decide(id, 'approved', { from: ['needs_review'], to: 'approved', refusal: 'Only proposals that need review can be approved.', needsComplete: 'approving' }, reason),

    reject: (id: string, reason: string) =>
      reason.trim()
        ? decide(id, 'rejected', { from: ['needs_review'], to: 'rejected', refusal: 'Only proposals that need review can be rejected.' }, reason)
        : ({ ok: false, error: 'Give a reason for rejecting.' } as const),

    requestEdits: (id: string, reason: string) =>
      reason.trim()
        ? decide(id, 'edits_requested', { from: ['needs_review'], to: 'draft', refusal: 'Only proposals that need review can be sent back for edits.' }, reason)
        : ({ ok: false, error: 'Say what needs to change.' } as const),

    recordOutcome(id: string, input: OutcomeInput): Outcome {
      if (input.verdict === 'not_run' && !input.notes.trim()) return { ok: false, error: 'Say why the test was not run.' }
      if (input.verdict !== 'not_run' && !input.resultSource.trim()) return { ok: false, error: 'Say where the result came from.' }
      const check = input.verdict === 'not_run' ? 'not comparable' : checkValues(input.controlValue, input.variantValue)
      const disagrees = (input.verdict === 'won' && check === 'favours control') || (input.verdict === 'lost' && check === 'favours variant')
      const outcome: RecordedOutcome = { ...input, check, disagrees, recordedAt: now().toISOString() }
      return decide(
        id,
        'outcome_recorded',
        { from: ['approved'], to: input.verdict === 'not_run' ? 'not_run' : 'completed', refusal: 'Outcomes can only be recorded for approved proposals.' },
        input.notes,
        {},
        { outcome },
      )
    },

    reopen: (id: string) => decide(id, 'reopened', { from: ['rejected'], to: 'draft', refusal: 'Only rejected proposals can be reopened.' }),
  }
}
