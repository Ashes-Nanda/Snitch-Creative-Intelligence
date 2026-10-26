/**
 * Measurement of LLM calls: what each call used and cost, and whether the analysis it served succeeded.
 * Events hold identifiers and numbers only, never prompts, images, responses or credentials.
 */

/** `test` covers mocked, scripted or practice runs; it is never mixed into live figures. */
export type Origin = 'live' | 'test'
export type Workflow = 'image_analysis'

/** One request to a model provider. A retry is a separate event with a higher attempt number. */
export interface CallEvent {
  /** `${runId}:${creativeId}:${attempt}`: recording the same attempt twice keeps one event. */
  eventId: string
  /** One user-triggered task, e.g. "analyse these 6 creatives". */
  runId: string
  workflow: Workflow
  creativeId: string | null
  /** 1 for the first request, 2 for the first retry, and so on. */
  attempt: number
  origin: Origin
  startedAt: string
  latencyMs: number
  status: 'ok' | 'error'
  errorKind: string | null
  requestedModel: string
  /** As returned by the provider; null when the response didn't say. */
  returnedModel: string | null
  /** The upstream provider that served the request, when reported. */
  provider: string | null
  generationId: string | null
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  /** Provider-reported charge in USD. null when not reported, never 0 by default. */
  reportedCostUsd: number | null
}

/** Whether a successful response passed schema validation: HTTP success alone is not a completed analysis. */
export interface ValidationEvent {
  eventId: string
  runId: string
  creativeId: string
  attempt: number
  origin: Origin
  at: string
  status: 'valid' | 'invalid'
  reasonCount: number
}

/** A request answered from a stored analysis (same asset and model) without calling the provider. */
export interface CacheHitEvent {
  eventId: string
  runId: string
  creativeId: string
  origin: Origin
  at: string
}

/** An analysis that failed before any provider call, e.g. the image couldn't be fetched or the model can't read images. */
export interface PreflightFailureEvent {
  eventId: string
  runId: string
  creativeId: string
  origin: Origin
  at: string
  kind: string
}

/** Everything the telemetry log holds. */
export interface TelemetryLog {
  calls: CallEvent[]
  validations: ValidationEvent[]
  cacheHits: CacheHitEvent[]
  preflightFailures: PreflightFailureEvent[]
}

export const eventIdOf = (runId: string, creativeId: string | null, attempt: number) => `${runId}:${creativeId ?? '-'}:${attempt}`

/** USD per million tokens for one model, with where the figure came from. */
export interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
  /** Omit when the provider doesn't discount cached input; cached tokens are then priced as input. */
  cachedInputPerMTok?: number
  source: string
  effectiveDate: string
}
export type PriceTable = Record<string, ModelPrice>

export type CostBasis = 'reported' | 'estimated' | 'unavailable'
export interface Cost {
  usd: number | null
  basis: CostBasis
  /** Price source for an estimate. */
  source?: string
}

/** Provider-reported cost wins; otherwise an estimate from tokens and a sourced price; otherwise unavailable. */
export function costOf(e: CallEvent, prices: PriceTable): Cost {
  if (e.reportedCostUsd !== null) return { usd: e.reportedCostUsd, basis: 'reported' }
  const price = prices[e.returnedModel ?? e.requestedModel]
  if (!price || e.inputTokens === null || e.outputTokens === null) return { usd: null, basis: 'unavailable' }
  const cached = Math.min(e.cachedInputTokens ?? 0, e.inputTokens)
  const usd =
    ((e.inputTokens - cached) * price.inputPerMTok + cached * (price.cachedInputPerMTok ?? price.inputPerMTok) + e.outputTokens * price.outputPerMTok) / 1_000_000
  return { usd, basis: 'estimated', source: `${price.source} (effective ${price.effectiveDate})` }
}

export interface Window {
  /** Inclusive ISO timestamps; omit for all recorded events. */
  from?: string
  to?: string
  origin: Origin
}

/** Keeps the last record of each event ID, so a retried write or a double submission counts once. */
export function dedupe<T extends { eventId: string }>(events: T[]): T[] {
  return [...new Map(events.map((e) => [e.eventId, e])).values()]
}

function within(at: string, w: Window): boolean {
  return (!w.from || at >= w.from) && (!w.to || at <= w.to)
}

/** A value with the count it was computed from. `value` is null when the denominator is zero. */
export interface Rate {
  value: number | null
  numerator: number
  denominator: number
}
export const rate = (numerator: number, denominator: number): Rate => ({ value: denominator === 0 ? null : numerator / denominator, numerator, denominator })

export interface Distribution {
  n: number
  mean: number | null
  median: number | null
}
export function distribution(values: number[]): Distribution {
  if (values.length === 0) return { n: 0, mean: null, median: null }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return {
    n: values.length,
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
  }
}

/** A summed amount with how many of the events behind it actually reported the value. */
export interface Total {
  /** Sum over events that reported it; null when none did. */
  value: number | null
  known: number
  of: number
}
function total(values: (number | null)[]): Total {
  const known = values.filter((v): v is number => v !== null)
  return { value: known.length ? known.reduce((s, v) => s + v, 0) : null, known: known.length, of: values.length }
}

export interface RunSummary {
  runId: string
  workflow: Workflow
  startedAt: string
  requests: number
  /** From the first request's start to the last request's end; 0 when no request was made. Automated processing time, not human time. */
  systemElapsedMs: number
  creativesAttempted: number
  creativesSucceeded: number
  inputTokens: Total
  outputTokens: Total
  cost: Total
}

export interface CallSummary {
  window: Window
  requests: { total: number; ok: number; error: number; byErrorKind: Record<string, number> }
  /** Distinct (run, creative) pairs: one analysis however many retries it took, including ones that failed before any call. */
  analyses: {
    attempted: number
    /** Analyses that failed before reaching the model, by failure kind. They cost nothing. */
    failedBeforeCall: { total: number; byKind: Record<string, number> }
    succeeded: number
    completionRate: Rate
    /** Responses that arrived but failed schema validation, over all validated responses. */
    invalidOutputRate: Rate
  }
  retries: {
    retriedRequests: number
    /** Analyses whose first request failed and that later produced a valid result, over analyses whose first request failed and were retried. */
    recoveryRate: Rate
  }
  tokens: { input: Total; output: Total; cachedInput: Total; perRequest: Distribution }
  /** Analysis requests answered from a stored result, over all analysis requests (stored or new). */
  cacheHitRate: Rate
  latencyMs: Distribution
  cost: {
    total: Total
    coverage: Record<CostBasis, number>
    /** Recorded cost over analyses that produced a valid result. Includes the cost of failed attempts. */
    perSuccessfulAnalysis: number | null
    perAttemptedAnalysis: number | null
    perRun: Distribution
    /** True when every request has a reported or estimated cost, so the totals are not lower bounds. */
    complete: boolean
  }
  /** Which models actually served requests, by returned identifier where available. */
  models: { requested: string; returned: string | null; provider: string | null; requests: number }[]
  runs: RunSummary[]
}

export function summarizeCalls(log: TelemetryLog, window: Window, prices: PriceTable): CallSummary {
  const calls = dedupe(log.calls).filter((e) => e.origin === window.origin && within(e.startedAt, window))
  const validations = dedupe(log.validations).filter((v) => v.origin === window.origin && within(v.at, window))
  const cacheHits = dedupe(log.cacheHits).filter((c) => c.origin === window.origin && within(c.at, window))
  const preflight = dedupe(log.preflightFailures ?? []).filter((p) => p.origin === window.origin && within(p.at, window))
  const costs = new Map(calls.map((e) => [e.eventId, costOf(e, prices)]))
  const pair = (runId: string, creativeId: string | null) => `${runId}:${creativeId ?? '-'}`

  const attemptedPairs = new Set([...calls.map((e) => pair(e.runId, e.creativeId)), ...preflight.map((p) => pair(p.runId, p.creativeId))])
  const preflightByKind: Record<string, number> = {}
  for (const p of preflight) preflightByKind[p.kind] = (preflightByKind[p.kind] ?? 0) + 1
  const succeededPairs = new Set(validations.filter((v) => v.status === 'valid').map((v) => pair(v.runId, v.creativeId)))
  const succeeded = [...succeededPairs].filter((p) => attemptedPairs.has(p)).length

  // An analysis "failed initially" when its first request errored or its first response was invalid.
  const firstFailed = new Set<string>()
  for (const e of calls) if (e.attempt === 1 && e.status === 'error') firstFailed.add(pair(e.runId, e.creativeId))
  for (const v of validations) if (v.attempt === 1 && v.status === 'invalid') firstFailed.add(pair(v.runId, v.creativeId))
  const retriedPairs = new Set(calls.filter((e) => e.attempt > 1).map((e) => pair(e.runId, e.creativeId)))
  const failedThenRetried = [...firstFailed].filter((p) => retriedPairs.has(p))

  const byErrorKind: Record<string, number> = {}
  for (const e of calls) if (e.status === 'error') byErrorKind[e.errorKind ?? 'unknown'] = (byErrorKind[e.errorKind ?? 'unknown'] ?? 0) + 1

  const coverage: Record<CostBasis, number> = { reported: 0, estimated: 0, unavailable: 0 }
  for (const c of costs.values()) coverage[c.basis]++
  const costTotal = total(calls.map((e) => costs.get(e.eventId)!.usd))

  const models = new Map<string, CallSummary['models'][number]>()
  for (const e of calls) {
    const key = `${e.requestedModel}|${e.returnedModel}|${e.provider}`
    const m = models.get(key) ?? { requested: e.requestedModel, returned: e.returnedModel, provider: e.provider, requests: 0 }
    m.requests++
    models.set(key, m)
  }

  const byRun = new Map<string, CallEvent[]>()
  for (const e of calls) byRun.set(e.runId, [...(byRun.get(e.runId) ?? []), e])
  for (const p of preflight) if (!byRun.has(p.runId)) byRun.set(p.runId, [])
  const runs = [...byRun].map(([runId, rs]): RunSummary => {
    const pre = preflight.filter((p) => p.runId === runId)
    const starts = rs.length ? rs.map((e) => Date.parse(e.startedAt)) : pre.map((p) => Date.parse(p.at))
    const ends = rs.map((e) => Date.parse(e.startedAt) + e.latencyMs)
    const runPairs = new Set([...rs.map((e) => pair(e.runId, e.creativeId)), ...pre.map((p) => pair(p.runId, p.creativeId))])
    return {
      runId,
      workflow: rs[0]?.workflow ?? 'image_analysis',
      startedAt: new Date(Math.min(...starts)).toISOString(),
      requests: rs.length,
      systemElapsedMs: rs.length ? Math.max(...ends) - Math.min(...starts) : 0,
      creativesAttempted: runPairs.size,
      creativesSucceeded: [...runPairs].filter((p) => succeededPairs.has(p)).length,
      inputTokens: total(rs.map((e) => e.inputTokens)),
      outputTokens: total(rs.map((e) => e.outputTokens)),
      cost: total(rs.map((e) => costs.get(e.eventId)!.usd)),
    }
  })

  return {
    window,
    requests: { total: calls.length, ok: calls.filter((e) => e.status === 'ok').length, error: calls.filter((e) => e.status === 'error').length, byErrorKind },
    analyses: {
      attempted: attemptedPairs.size,
      failedBeforeCall: { total: preflight.length, byKind: preflightByKind },
      succeeded,
      completionRate: rate(succeeded, attemptedPairs.size),
      invalidOutputRate: rate(validations.filter((v) => v.status === 'invalid').length, validations.length),
    },
    retries: {
      retriedRequests: calls.filter((e) => e.attempt > 1).length,
      recoveryRate: rate(failedThenRetried.filter((p) => succeededPairs.has(p)).length, failedThenRetried.length),
    },
    tokens: {
      input: total(calls.map((e) => e.inputTokens)),
      output: total(calls.map((e) => e.outputTokens)),
      cachedInput: total(calls.map((e) => e.cachedInputTokens)),
      perRequest: distribution(calls.filter((e) => e.inputTokens !== null && e.outputTokens !== null).map((e) => e.inputTokens! + e.outputTokens!)),
    },
    cacheHitRate: rate(cacheHits.length, cacheHits.length + attemptedPairs.size),
    latencyMs: distribution(calls.filter((e) => e.status === 'ok').map((e) => e.latencyMs)),
    cost: {
      total: costTotal,
      coverage,
      perSuccessfulAnalysis: costTotal.value !== null && succeeded > 0 ? costTotal.value / succeeded : null,
      perAttemptedAnalysis: costTotal.value !== null && attemptedPairs.size > 0 ? costTotal.value / attemptedPairs.size : null,
      perRun: distribution(runs.filter((r) => r.cost.known === r.cost.of && r.cost.value !== null).map((r) => r.cost.value!)),
      complete: coverage.unavailable === 0,
    },
    models: [...models.values()],
    runs,
  }
}
