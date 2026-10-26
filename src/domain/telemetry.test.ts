import { describe, expect, test } from 'vitest'
import { costOf, eventIdOf, summarizeCalls, type CallEvent, type PriceTable, type TelemetryLog, type ValidationEvent } from './telemetry'

const prices: PriceTable = {
  'vendor/model-a': { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3, source: 'test price sheet', effectiveDate: '2026-10-01' },
}

function call(over: Partial<CallEvent> & { runId: string; creativeId: string; attempt: number }): CallEvent {
  return {
    eventId: eventIdOf(over.runId, over.creativeId, over.attempt),
    workflow: 'image_analysis',
    origin: 'live',
    startedAt: '2026-10-26T10:00:00.000Z',
    latencyMs: 2000,
    status: 'ok',
    errorKind: null,
    requestedModel: 'vendor/model-a',
    returnedModel: 'vendor/model-a',
    provider: 'VendorCloud',
    generationId: 'gen-1',
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: null,
    reportedCostUsd: 0.01,
    ...over,
  }
}

function valid(runId: string, creativeId: string, attempt: number, status: 'valid' | 'invalid' = 'valid', origin: 'live' | 'test' = 'live'): ValidationEvent {
  return { eventId: eventIdOf(runId, creativeId, attempt), runId, creativeId, attempt, origin, at: '2026-10-26T10:00:03.000Z', status, reasonCount: status === 'valid' ? 0 : 2 }
}

const log = (calls: CallEvent[], validations: ValidationEvent[] = [], cacheHits: TelemetryLog['cacheHits'] = [], preflightFailures: TelemetryLog['preflightFailures'] = []): TelemetryLog => ({
  calls,
  validations,
  cacheHits,
  preflightFailures,
})
const live = { origin: 'live' as const }

describe('costOf', () => {
  test('uses the provider-reported cost when there is one', () => {
    expect(costOf(call({ runId: 'r', creativeId: 'c', attempt: 1, reportedCostUsd: 0.0042 }), prices)).toEqual({ usd: 0.0042, basis: 'reported' })
  })

  test('estimates from tokens and the returned model’s sourced price when cost is not reported', () => {
    // 800 uncached × $3 + 200 cached × $0.30 + 200 output × $15, per million tokens
    const c = costOf(call({ runId: 'r', creativeId: 'c', attempt: 1, reportedCostUsd: null, cachedInputTokens: 200 }), prices)
    expect(c.basis).toBe('estimated')
    expect(c.usd).toBeCloseTo((800 * 3 + 200 * 0.3 + 200 * 15) / 1e6, 12)
    expect(c.source).toBe('test price sheet (effective 2026-10-01)')
  })

  test('prices by the model that actually served the request, not the one requested', () => {
    const e = call({ runId: 'r', creativeId: 'c', attempt: 1, reportedCostUsd: null, requestedModel: 'vendor/model-a', returnedModel: 'vendor/other' })
    expect(costOf(e, prices)).toEqual({ usd: null, basis: 'unavailable' })
  })

  test('is unavailable, not zero, when tokens are missing', () => {
    expect(costOf(call({ runId: 'r', creativeId: 'c', attempt: 1, reportedCostUsd: null, inputTokens: null }), prices)).toEqual({ usd: null, basis: 'unavailable' })
  })

  test('is unavailable when no price is configured for the model', () => {
    expect(costOf(call({ runId: 'r', creativeId: 'c', attempt: 1, reportedCostUsd: null }), {})).toEqual({ usd: null, basis: 'unavailable' })
  })
})

describe('summarizeCalls', () => {
  test('counts one analysis per creative per run, however many retries it took', () => {
    const s = summarizeCalls(
      log(
        [
          call({ runId: 'r1', creativeId: 'a', attempt: 1, status: 'error', errorKind: 'rate_limited', reportedCostUsd: null, inputTokens: null, outputTokens: null }),
          call({ runId: 'r1', creativeId: 'a', attempt: 2 }),
          call({ runId: 'r1', creativeId: 'b', attempt: 1 }),
        ],
        [valid('r1', 'a', 2), valid('r1', 'b', 1, 'invalid')],
      ),
      live,
      prices,
    )
    expect(s.requests).toMatchObject({ total: 3, ok: 2, error: 1, byErrorKind: { rate_limited: 1 } })
    expect(s.analyses.attempted).toBe(2)
    expect(s.analyses.succeeded).toBe(1)
    expect(s.analyses.completionRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
    expect(s.analyses.invalidOutputRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
    expect(s.retries.retriedRequests).toBe(1)
    // a failed then recovered; b's first response was invalid but it was never retried
    expect(s.retries.recoveryRate).toEqual({ value: 1, numerator: 1, denominator: 1 })
  })

  test('an HTTP success that fails validation is not a successful analysis', () => {
    const s = summarizeCalls(log([call({ runId: 'r', creativeId: 'a', attempt: 1 })], [valid('r', 'a', 1, 'invalid')]), live, prices)
    expect(s.requests.ok).toBe(1)
    expect(s.analyses.succeeded).toBe(0)
    expect(s.cost.perSuccessfulAnalysis).toBeNull()
  })

  test('a failed request the provider charged for counts towards cost but not success', () => {
    const s = summarizeCalls(
      log(
        [call({ runId: 'r', creativeId: 'a', attempt: 1, status: 'error', errorKind: 'invalid_response', reportedCostUsd: 0.02 }), call({ runId: 'r', creativeId: 'b', attempt: 1, reportedCostUsd: 0.01 })],
        [valid('r', 'b', 1)],
      ),
      live,
      prices,
    )
    expect(s.cost.total.value).toBeCloseTo(0.03)
    expect(s.analyses.succeeded).toBe(1)
    expect(s.cost.perSuccessfulAnalysis).toBeCloseTo(0.03)
    expect(s.cost.perAttemptedAnalysis).toBeCloseTo(0.015)
  })

  test('recording the same attempt twice counts it once', () => {
    const e = call({ runId: 'r', creativeId: 'a', attempt: 1 })
    const s = summarizeCalls(log([e, { ...e }], [valid('r', 'a', 1), valid('r', 'a', 1)]), live, prices)
    expect(s.requests.total).toBe(1)
    expect(s.cost.total.value).toBeCloseTo(0.01)
  })

  test('reports token and cost coverage instead of treating missing values as zero', () => {
    const s = summarizeCalls(
      log([call({ runId: 'r', creativeId: 'a', attempt: 1 }), call({ runId: 'r', creativeId: 'b', attempt: 1, reportedCostUsd: null, inputTokens: null, outputTokens: null, returnedModel: 'vendor/unpriced' })]),
      live,
      prices,
    )
    expect(s.tokens.input).toEqual({ value: 1000, known: 1, of: 2 })
    expect(s.cost.coverage).toEqual({ reported: 1, estimated: 0, unavailable: 1 })
    expect(s.cost.complete).toBe(false)
  })

  test('shows no totals at all when nothing reported them', () => {
    const s = summarizeCalls(log([call({ runId: 'r', creativeId: 'a', attempt: 1, reportedCostUsd: null, inputTokens: null, outputTokens: null })]), live, {})
    expect(s.tokens.input.value).toBeNull()
    expect(s.cost.total.value).toBeNull()
    expect(s.latencyMs.median).toBe(2000)
  })

  test('aggregates every call in a run into one workflow summary', () => {
    const s = summarizeCalls(
      log(
        [
          call({ runId: 'r1', creativeId: 'a', attempt: 1, startedAt: '2026-10-26T10:00:00.000Z', latencyMs: 3000 }),
          call({ runId: 'r1', creativeId: 'b', attempt: 1, startedAt: '2026-10-26T10:00:01.000Z', latencyMs: 4000 }),
          call({ runId: 'r2', creativeId: 'a', attempt: 1, startedAt: '2026-10-26T11:00:00.000Z' }),
        ],
        [valid('r1', 'a', 1), valid('r1', 'b', 1)],
      ),
      live,
      prices,
    )
    const r1 = s.runs.find((r) => r.runId === 'r1')!
    expect(r1).toMatchObject({ requests: 2, systemElapsedMs: 5000, creativesAttempted: 2, creativesSucceeded: 2 })
    expect(r1.inputTokens.value).toBe(2000)
    expect(r1.cost.value).toBeCloseTo(0.02)
    expect(s.cost.perRun).toMatchObject({ n: 2, median: 0.015 })
  })

  test('keeps test events out of live figures and live events out of test figures', () => {
    const l = log([call({ runId: 'r', creativeId: 'a', attempt: 1 }), call({ runId: 't', creativeId: 'a', attempt: 1, origin: 'test' })], [valid('r', 'a', 1), valid('t', 'a', 1, 'valid', 'test')])
    expect(summarizeCalls(l, live, prices).requests.total).toBe(1)
    expect(summarizeCalls(l, { origin: 'test' }, prices).analyses.succeeded).toBe(1)
  })

  test('filters to the measurement window', () => {
    const s = summarizeCalls(log([call({ runId: 'r', creativeId: 'a', attempt: 1, startedAt: '2026-09-01T00:00:00.000Z' })]), { ...live, from: '2026-10-01T00:00:00.000Z' }, prices)
    expect(s.requests.total).toBe(0)
    expect(s.analyses.completionRate.value).toBeNull()
  })

  test('cache hit rate counts stored answers against all analysis requests', () => {
    const s = summarizeCalls(
      log([call({ runId: 'r', creativeId: 'a', attempt: 1 })], [valid('r', 'a', 1)], [{ eventId: 'r:b:cache', runId: 'r', creativeId: 'b', origin: 'live', at: '2026-10-26T10:00:00.000Z' }]),
      live,
      prices,
    )
    expect(s.cacheHitRate).toEqual({ value: 0.5, numerator: 1, denominator: 2 })
  })

  test('an analysis that failed before any call is attempted, unsuccessful and free', () => {
    const s = summarizeCalls(
      log([call({ runId: 'r', creativeId: 'a', attempt: 1 })], [valid('r', 'a', 1)], [], [
        { eventId: 'r:b:preflight', runId: 'r', creativeId: 'b', origin: 'live', at: '2026-10-26T10:00:05.000Z', kind: 'image_unavailable' },
        { eventId: 'q:c:preflight', runId: 'q', creativeId: 'c', origin: 'live', at: '2026-10-26T10:05:00.000Z', kind: 'image_unavailable' },
      ]),
      live,
      prices,
    )
    expect(s.requests.total).toBe(1)
    expect(s.analyses.attempted).toBe(3)
    expect(s.analyses.failedBeforeCall).toEqual({ total: 2, byKind: { image_unavailable: 2 } })
    expect(s.analyses.completionRate).toEqual({ value: 1 / 3, numerator: 1, denominator: 3 })
    expect(s.cost.perAttemptedAnalysis).toBeCloseTo(0.01 / 3)
    expect(s.runs.find((r) => r.runId === 'r')).toMatchObject({ requests: 1, creativesAttempted: 2, creativesSucceeded: 1 })
    expect(s.runs.find((r) => r.runId === 'q')).toMatchObject({ requests: 0, systemElapsedMs: 0, creativesAttempted: 1, creativesSucceeded: 0 })
  })

  test('lists the models that actually served requests', () => {
    const s = summarizeCalls(log([call({ runId: 'r', creativeId: 'a', attempt: 1, returnedModel: 'vendor/model-a-2026', provider: 'Other' })]), live, prices)
    expect(s.models).toEqual([{ requested: 'vendor/model-a', returned: 'vendor/model-a-2026', provider: 'Other', requests: 1 }])
  })
})
