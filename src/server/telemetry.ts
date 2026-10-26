// Server-only telemetry for model calls. Records identifiers, counts, timings and costs; never prompts,
// images, model output, headers or keys. A telemetry failure never fails the call it describes.
import { eventIdOf, type CacheHitEvent, type CallEvent, type Origin, type PreflightFailureEvent, type TelemetryLog, type ValidationEvent } from '../domain/telemetry'
import { ProviderError, type CallMeta, type OpenRouterClient, type Usage, type VisionResponse } from './openrouter'

export interface TelemetrySink {
  recordCall(e: CallEvent): Promise<void>
  recordValidation(e: ValidationEvent): Promise<void>
  recordCacheHit(e: CacheHitEvent): Promise<void>
  recordPreflightFailure(e: PreflightFailureEvent): Promise<void>
  read(): Promise<TelemetryLog & { unreadableLines: number }>
}

type Line =
  | { kind: 'call'; event: CallEvent }
  | { kind: 'validation'; event: ValidationEvent }
  | { kind: 'cache_hit'; event: CacheHitEvent }
  | { kind: 'preflight_failure'; event: PreflightFailureEvent }

function parseLog(lines: Line[], unreadableLines: number): TelemetryLog & { unreadableLines: number } {
  return {
    calls: lines.filter((l) => l.kind === 'call').map((l) => l.event as CallEvent),
    validations: lines.filter((l) => l.kind === 'validation').map((l) => l.event as ValidationEvent),
    cacheHits: lines.filter((l) => l.kind === 'cache_hit').map((l) => l.event as CacheHitEvent),
    preflightFailures: lines.filter((l) => l.kind === 'preflight_failure').map((l) => l.event as PreflightFailureEvent),
    unreadableLines,
  }
}

/** File operations the sink needs, passed in so this module carries no Node dependency. */
export interface LogFile {
  append(line: string): Promise<void>
  /** null when the file doesn't exist yet. */
  read(): Promise<string | null>
}

/** Appends one JSON line per event. Duplicates are tolerated on write and removed when summarised. */
export function fileSink(file: LogFile): TelemetrySink {
  const write = (line: Line) => file.append(`${JSON.stringify(line)}\n`)
  return {
    recordCall: (event) => write({ kind: 'call', event }),
    recordValidation: (event) => write({ kind: 'validation', event }),
    recordCacheHit: (event) => write({ kind: 'cache_hit', event }),
    recordPreflightFailure: (event) => write({ kind: 'preflight_failure', event }),
    async read() {
      const text = (await file.read()) ?? ''
      const lines: Line[] = []
      let unreadable = 0
      for (const raw of text.split('\n')) {
        if (!raw.trim()) continue
        try {
          lines.push(JSON.parse(raw))
        } catch {
          unreadable++
        }
      }
      return parseLog(lines, unreadable)
    },
  }
}

export function memorySink(): TelemetrySink & { lines: Line[] } {
  const lines: Line[] = []
  return {
    lines,
    recordCall: async (event) => void lines.push({ kind: 'call', event }),
    recordValidation: async (event) => void lines.push({ kind: 'validation', event }),
    recordCacheHit: async (event) => void lines.push({ kind: 'cache_hit', event }),
    recordPreflightFailure: async (event) => void lines.push({ kind: 'preflight_failure', event }),
    read: async () => parseLog(lines, 0),
  }
}

interface Options {
  sink: TelemetrySink
  now?: () => number
  /** Told about telemetry write failures; the call itself carries on. */
  onSinkError?: (error: unknown) => void
}

async function safely(write: () => Promise<void>, onSinkError: (e: unknown) => void) {
  try {
    await write()
  } catch (e) {
    onSinkError(e)
  }
}

/** Wraps a client so every provider request is recorded once, with its usage, latency and outcome. */
export function instrumentClient(client: OpenRouterClient, { sink, now = Date.now, onSinkError = () => {} }: Options): OpenRouterClient {
  return {
    modelInfo: (model) => client.modelInfo(model),

    async complete(request, meta?: CallMeta) {
      const started = now()
      // A call made without context still costs money, so it's recorded as live and unattributed.
      const m: CallMeta = meta ?? { runId: `unattributed-${started}`, workflow: 'image_analysis', creativeId: '', attempt: 1, origin: 'live' }
      const record = (status: 'ok' | 'error', response: Pick<VisionResponse, 'id' | 'model' | 'provider'> | null, usage: Usage | null, errorKind: string | null) =>
        safely(
          () =>
            sink.recordCall({
              eventId: eventIdOf(m.runId, m.creativeId || null, m.attempt),
              runId: m.runId,
              workflow: m.workflow,
              creativeId: m.creativeId || null,
              attempt: m.attempt,
              origin: m.origin,
              startedAt: new Date(started).toISOString(),
              latencyMs: now() - started,
              status,
              errorKind,
              requestedModel: request.model,
              returnedModel: response?.model ?? null,
              provider: response?.provider ?? null,
              generationId: response?.id ?? null,
              inputTokens: usage?.promptTokens ?? null,
              outputTokens: usage?.completionTokens ?? null,
              cachedInputTokens: usage?.cachedPromptTokens ?? null,
              reportedCostUsd: usage?.cost ?? null,
            }),
          onSinkError,
        )

      let response: VisionResponse
      try {
        response = await client.complete(request, meta)
      } catch (e) {
        const err = e instanceof ProviderError ? e : null
        await record('error', null, err?.usage ?? null, err?.kind ?? 'unknown')
        throw e
      }
      await record('ok', response, response.usage, null)
      return response
    },
  }
}

/** The analysis service's `onValidation` hook, recording whether each successful response passed the schema. */
export function validationRecorder(sink: TelemetrySink, origin: Origin, { now = Date.now, onSinkError = () => {} }: Omit<Options, 'sink'> = {}) {
  return (e: { runId: string; creativeId: string; attempt: number; status: 'valid' | 'invalid'; reasons: string[] }) =>
    void safely(
      () =>
        sink.recordValidation({
          eventId: eventIdOf(e.runId, e.creativeId, e.attempt),
          runId: e.runId,
          creativeId: e.creativeId,
          attempt: e.attempt,
          origin,
          at: new Date(now()).toISOString(),
          status: e.status,
          // Only the count: reasons can quote model output.
          reasonCount: e.reasons.length,
        }),
      onSinkError,
    )
}

/** For the analysis service's cached-result path: a request answered without calling the provider. */
export function cacheHitRecorder(sink: TelemetrySink, origin: Origin, { now = Date.now, onSinkError = () => {} }: Omit<Options, 'sink'> = {}) {
  return (e: { runId: string; creativeId: string }) =>
    void safely(
      () => sink.recordCacheHit({ eventId: `${e.runId}:${e.creativeId}:cache`, runId: e.runId, creativeId: e.creativeId, origin, at: new Date(now()).toISOString() }),
      onSinkError,
    )
}

/** For the analysis service's `onPreflightFailure` hook: an analysis that failed before any provider call. */
export function preflightFailureRecorder(sink: TelemetrySink, origin: Origin, { now = Date.now, onSinkError = () => {} }: Omit<Options, 'sink'> = {}) {
  return (e: { runId: string; creativeId: string; kind: string }) =>
    void safely(
      () =>
        sink.recordPreflightFailure({ eventId: `${e.runId}:${e.creativeId}:preflight`, runId: e.runId, creativeId: e.creativeId, origin, at: new Date(now()).toISOString(), kind: e.kind }),
      onSinkError,
    )
}

interface Req {
  method?: string
  url?: string
}
interface Res {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body: string): void
}

/** Connect-style middleware serving the recorded log read-only at GET /api/telemetry. */
export function telemetryRoutes(sink: TelemetrySink) {
  return async (req: Req, res: Res, next: () => void) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/api/telemetry') return next()
    res.setHeader('Content-Type', 'application/json')
    try {
      res.statusCode = 200
      res.end(JSON.stringify(await sink.read()))
    } catch {
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'The telemetry log could not be read.' }))
    }
  }
}
