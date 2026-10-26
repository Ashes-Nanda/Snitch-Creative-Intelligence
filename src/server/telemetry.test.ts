import { describe, expect, test } from 'vitest'
import { ProviderError, type OpenRouterClient, type VisionRequest, type VisionResponse } from './openrouter'
import { cacheHitRecorder, fileSink, instrumentClient, memorySink, preflightFailureRecorder, telemetryRoutes, validationRecorder, type TelemetrySink } from './telemetry'

// All provider responses are mocked; nothing leaves the test process.
const request: VisionRequest = { model: 'vendor/model-a', prompt: 'SECRET PROMPT', imageDataUrl: 'data:image/jpeg;base64,SECRETIMAGE', schema: {}, signal: new AbortController().signal }
const meta = { runId: 'run-1', workflow: 'image_analysis' as const, creativeId: 'cr-001', attempt: 1, origin: 'test' as const }

const ok: VisionResponse = {
  id: 'gen-9',
  model: 'vendor/model-a-20261001',
  provider: 'VendorCloud',
  text: '{"model":"output"}',
  usage: { promptTokens: 1200, completionTokens: 300, cost: 0.0051, cachedPromptTokens: 100 },
}

function fakeClient(respond: () => Promise<VisionResponse>): OpenRouterClient {
  return { complete: () => respond(), modelInfo: async () => null }
}

const tick = (times: number[]) => {
  let i = 0
  return () => times[Math.min(i++, times.length - 1)]
}

describe('instrumentClient', () => {
  test('records provider-reported usage, cost, model, provider and latency for a successful call', async () => {
    const sink = memorySink()
    const client = instrumentClient(fakeClient(async () => ok), { sink, now: tick([1_000, 3_500]) })
    expect(await client.complete(request, meta)).toBe(ok)
    expect(sink.lines).toEqual([
      {
        kind: 'call',
        event: {
          eventId: 'run-1:cr-001:1',
          runId: 'run-1',
          workflow: 'image_analysis',
          creativeId: 'cr-001',
          attempt: 1,
          origin: 'test',
          startedAt: new Date(1_000).toISOString(),
          latencyMs: 2_500,
          status: 'ok',
          errorKind: null,
          requestedModel: 'vendor/model-a',
          returnedModel: 'vendor/model-a-20261001',
          provider: 'VendorCloud',
          generationId: 'gen-9',
          inputTokens: 1200,
          outputTokens: 300,
          cachedInputTokens: 100,
          reportedCostUsd: 0.0051,
        },
      },
    ])
  })

  test('never records the prompt, the image or the model’s output', async () => {
    const sink = memorySink()
    await instrumentClient(fakeClient(async () => ok), { sink }).complete(request, meta)
    const written = JSON.stringify(sink.lines)
    expect(written).not.toContain('SECRET')
    expect(written).not.toContain('"output"')
  })

  test('records missing usage as null, not zero', async () => {
    const sink = memorySink()
    const bare = { ...ok, provider: null, usage: { promptTokens: null, completionTokens: null, cost: null, cachedPromptTokens: null } }
    await instrumentClient(fakeClient(async () => bare), { sink }).complete(request, meta)
    expect(sink.lines[0].event).toMatchObject({ inputTokens: null, outputTokens: null, reportedCostUsd: null, provider: null })
  })

  test('records a failed call with its error kind and any usage the provider charged, then rethrows', async () => {
    const sink = memorySink()
    const charged = new ProviderError('invalid_response', 'The model returned no content.', false, 200, undefined, { promptTokens: 900, completionTokens: 0, cost: 0.002, cachedPromptTokens: null })
    const client = instrumentClient(
      fakeClient(async () => {
        throw charged
      }),
      { sink },
    )
    await expect(client.complete(request, meta)).rejects.toBe(charged)
    expect(sink.lines[0].event).toMatchObject({ status: 'error', errorKind: 'invalid_response', inputTokens: 900, reportedCostUsd: 0.002, returnedModel: null })
  })

  test('each retry is its own event, keyed by attempt', async () => {
    const sink = memorySink()
    const client = instrumentClient(fakeClient(async () => ok), { sink })
    await client.complete(request, { ...meta, attempt: 1 })
    await client.complete(request, { ...meta, attempt: 2 })
    expect(sink.lines.map((l) => l.event.eventId)).toEqual(['run-1:cr-001:1', 'run-1:cr-001:2'])
  })

  test('a broken telemetry sink never breaks the call', async () => {
    const errors: unknown[] = []
    const broken: TelemetrySink = {
      recordCall: async () => {
        throw new Error('disk full')
      },
      recordValidation: () => {
        throw new Error('disk full')
      },
      recordCacheHit: async () => {
        throw new Error('disk full')
      },
      recordPreflightFailure: async () => {
        throw new Error('disk full')
      },
      read: async () => ({ calls: [], validations: [], cacheHits: [], preflightFailures: [], unreadableLines: 0 }),
    }
    const client = instrumentClient(fakeClient(async () => ok), { sink: broken, onSinkError: (e) => errors.push(e) })
    expect(await client.complete(request, meta)).toBe(ok)
    expect(() => validationRecorder(broken, 'test', { onSinkError: (e) => errors.push(e) })({ runId: 'r', creativeId: 'c', attempt: 1, status: 'valid', reasons: [] })).not.toThrow()
    expect(errors).toHaveLength(2)
  })

  test('a call made without context is still recorded, as live and unattributed', async () => {
    const sink = memorySink()
    await instrumentClient(fakeClient(async () => ok), { sink, now: () => 42 }).complete(request)
    expect(sink.lines[0].event).toMatchObject({ runId: 'unattributed-42', creativeId: null, origin: 'live', attempt: 1 })
  })
})

describe('validation, cache-hit and preflight recorders', () => {
  test('record the outcome and a count of reasons, never the reasons themselves', async () => {
    const sink = memorySink()
    validationRecorder(sink, 'live', { now: () => 0 })({ runId: 'r', creativeId: 'c', attempt: 2, status: 'invalid', reasons: ['summary: quoted model text'] })
    cacheHitRecorder(sink, 'live', { now: () => 0 })({ runId: 'r', creativeId: 'd' })
    preflightFailureRecorder(sink, 'live', { now: () => 0 })({ runId: 'r', creativeId: 'e', kind: 'image_unavailable' })
    await Promise.resolve()
    expect(sink.lines).toEqual([
      { kind: 'validation', event: { eventId: 'r:c:2', runId: 'r', creativeId: 'c', attempt: 2, origin: 'live', at: new Date(0).toISOString(), status: 'invalid', reasonCount: 1 } },
      { kind: 'cache_hit', event: { eventId: 'r:d:cache', runId: 'r', creativeId: 'd', origin: 'live', at: new Date(0).toISOString() } },
      { kind: 'preflight_failure', event: { eventId: 'r:e:preflight', runId: 'r', creativeId: 'e', origin: 'live', at: new Date(0).toISOString(), kind: 'image_unavailable' } },
    ])
  })
})

describe('fileSink', () => {
  test('appends JSON lines and reads them back, skipping unreadable ones', async () => {
    let text = ''
    const sink = fileSink({ append: async (l) => void (text += l), read: async () => text || null })
    expect(await sink.read()).toEqual({ calls: [], validations: [], cacheHits: [], preflightFailures: [], unreadableLines: 0 })
    await instrumentClient(fakeClient(async () => ok), { sink }).complete(request, meta)
    text += '{not json\n'
    const log = await sink.read()
    expect(log.calls).toHaveLength(1)
    expect(log.unreadableLines).toBe(1)
  })
})

describe('telemetryRoutes', () => {
  function response() {
    const res = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader: (k: string, v: string) => void (res.headers[k] = v), end: (b: string) => void (res.body = b) }
    return res
  }

  test('serves the log at GET /api/telemetry and passes everything else on', async () => {
    const sink = memorySink()
    const handle = telemetryRoutes(sink)
    const res = response()
    await handle({ method: 'GET', url: '/api/telemetry?x=1' }, res, () => {})
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ calls: [] })

    let passed = 0
    await handle({ method: 'POST', url: '/api/telemetry' }, response(), () => passed++)
    await handle({ method: 'GET', url: '/api/analysis' }, response(), () => passed++)
    expect(passed).toBe(2)
  })
})
