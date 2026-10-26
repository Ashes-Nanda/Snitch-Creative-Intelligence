// Server-only: controlled, on-demand image analysis. One request per creative at a time; no background loops.
import type { CreativeAnalysis } from '../domain/analysis'
import { parseVisionOutput, visionJsonSchema } from '../domain/vision'
import { ProviderError, type CallMeta, type OpenRouterClient, type ProviderErrorKind, type Usage } from './openrouter'

export type AnalysisErrorKind = ProviderErrorKind | 'persist'

export interface AnalysisError {
  kind: AnalysisErrorKind
  message: string
  /** Validation problems, when the model's output didn't match the schema. */
  details?: string[]
}

export interface AttemptRecord {
  at: string
  outcome: 'completed' | 'failed'
  model: string
  durationMs: number
  /** Provider calls made, including retries. */
  attempts: number
  responseId: string | null
  usage: Usage | null
  error: AnalysisError | null
}

export interface AnalysisRecord {
  creativeId: string
  assetUrl: string
  /** `completed` whenever a successful result exists, even if a later retry failed. */
  status: 'processing' | 'completed' | 'failed'
  /** The latest successful analysis. Kept when a later attempt fails. */
  current: CreativeAnalysis | null
  lastAttempt: AttemptRecord | null
}

export interface AnalysisStore {
  load(): Record<string, AnalysisRecord>
  save(records: Record<string, AnalysisRecord>): void
}

export function memoryAnalysisStore(): AnalysisStore {
  let saved: Record<string, AnalysisRecord> = {}
  return {
    load: () => structuredClone(saved),
    save: (r) => {
      saved = structuredClone(r)
    },
  }
}

export type ImageFetcher = (url: string) => Promise<{ ok: true; contentType: string; bytes: Uint8Array } | { ok: false; reason: string }>

export interface CreativeToAnalyse {
  creativeId: string
  assetUrl: string
  name: string
  assetType: string
}

export type AnalyzeOutcome =
  | { ok: true; cached: boolean; record: AnalysisRecord }
  | { ok: false; cached?: false; error: AnalysisError; record: AnalysisRecord | null }

const SUPPORTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_BACKOFF_MS = 30_000

function prompt(c: CreativeToAnalyse): string {
  const kind = c.assetType === 'product_image' ? 'a product image from the SNITCH (Indian menswear brand) website' : 'a public SNITCH (Indian menswear brand) ad creative'
  return [
    `You are analysing ${kind}. Return JSON matching the schema.`,
    'Rules:',
    '- In "observations", describe only what is visible in this image. Do not guess fabric, price, fit names or brand claims you cannot see.',
    '- Copy visible text verbatim and keep it short. Use null or an empty list when something is absent.',
    '- "interpretations" is your reading of the likely creative angle; base it on visible details and say which.',
    '- List anything you cannot establish from the image in "uncertain" (for example fabric, exact colour under lighting, video content beyond this frame).',
    '- Do not infer audience demographics, performance, sales or any business outcome.',
  ].join('\n')
}

export function createAnalysisService({
  config,
  client,
  store,
  fetchImage,
  now = () => new Date(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 60_000,
  maxAttempts = 3,
  log = (entry) => console.info('[analysis]', JSON.stringify(entry)),
  origin = 'live',
  onValidation,
  onCacheHit,
  onPreflightFailure,
}: {
  config: { apiKey: string | undefined; model: string | undefined }
  client: OpenRouterClient
  store: AnalysisStore
  fetchImage: ImageFetcher
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  maxAttempts?: number
  /** Receives outcome metadata only. Never the API key or request headers. */
  log?: (entry: Record<string, unknown>) => void
  /** Whether calls are real ("live") or made by tests ("test"); passed to the client with each call. */
  origin?: CallMeta['origin']
  /** Called after each model answer is validated. */
  onValidation?: (e: { runId: string; creativeId: string; attempt: number; status: 'valid' | 'invalid'; reasons: string[] }) => void
  /** Called when a stored result is reused instead of calling the model. */
  onCacheHit?: (e: { runId: string; creativeId: string }) => void
  /** Called when an analysis fails before any model call (model check, image fetch, format or size). */
  onPreflightFailure?: (e: { runId: string; creativeId: string; kind: AnalysisErrorKind }) => void
}) {
  let records = store.load()
  const inFlight = new Map<string, Promise<AnalyzeOutcome>>()

  function problem(): string | null {
    if (!config.apiKey) return 'OPENROUTER_API_KEY is not set on the server.'
    if (!config.model) return 'OPENROUTER_MODEL is not set on the server.'
    return null
  }

  async function callWithRetries(request: Omit<Parameters<OpenRouterClient['complete']>[0], 'signal'>, meta: Omit<CallMeta, 'attempt'>) {
    let attempts = 0
    for (;;) {
      attempts++
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new ProviderError('timeout', `The analysis request took longer than ${Math.round(timeoutMs / 1000)}s.`, true))
          }, timeoutMs)
        })
        const response = await Promise.race([client.complete({ ...request, signal: controller.signal }, { ...meta, attempt: attempts }), timeout])
        return { response, attempts }
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError('provider', 'Unexpected error calling the model provider.', true)
        if (!err.transient || attempts >= maxAttempts) throw Object.assign(err, { attempts })
        await sleep(Math.min(err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 1000 * 2 ** (attempts - 1), MAX_BACKOFF_MS))
      } finally {
        clearTimeout(timer)
      }
    }
  }

  async function run(creative: CreativeToAnalyse, model: string, runId: string): Promise<AnalyzeOutcome> {
    const started = now()
    const t0 = Date.now()
    const prior = records[creative.creativeId]
    // A changed asset URL invalidates the previous result: it described a different image.
    const priorCurrent = prior && prior.assetUrl === creative.assetUrl ? prior.current : null

    const finish = (attempt: Omit<AttemptRecord, 'at' | 'model' | 'durationMs'>, current: CreativeAnalysis | null): AnalyzeOutcome => {
      const record: AnalysisRecord = {
        creativeId: creative.creativeId,
        assetUrl: creative.assetUrl,
        status: current ? 'completed' : 'failed',
        current,
        lastAttempt: { at: started.toISOString(), model, durationMs: Date.now() - t0, ...attempt },
      }
      const next = { ...records, [creative.creativeId]: record }
      try {
        store.save(next)
      } catch {
        log({ creativeId: creative.creativeId, outcome: 'persist_failed' })
        return { ok: false, error: { kind: 'persist', message: 'The analysis result could not be saved on the server.' }, record: prior ?? null }
      }
      records = next
      log({
        creativeId: creative.creativeId,
        model,
        outcome: attempt.outcome,
        durationMs: record.lastAttempt!.durationMs,
        attempts: attempt.attempts,
        promptTokens: attempt.usage?.promptTokens ?? null,
        completionTokens: attempt.usage?.completionTokens ?? null,
        cost: attempt.usage?.cost ?? null,
        errorKind: attempt.error?.kind ?? null,
      })
      return attempt.error ? { ok: false, error: attempt.error, record } : { ok: true, cached: false, record }
    }
    const fail = (error: AnalysisError, attempts = 0, extra: Partial<AttemptRecord> = {}) => {
      if (attempts === 0) {
        try {
          onPreflightFailure?.({ runId, creativeId: creative.creativeId, kind: error.kind })
        } catch {
          // Observability must never break analysis.
        }
      }
      return finish({ outcome: 'failed', attempts, responseId: null, usage: null, error, ...extra }, priorCurrent)
    }

    try {
      const info = await client.modelInfo(model)
      if (!info) return fail({ kind: 'model_unavailable', message: `OpenRouter has no model “${model}”.` })
      if (!info.acceptsImages) return fail({ kind: 'unsupported_model', message: `Model “${model}” does not accept image input.` })
    } catch (e) {
      return fail({ kind: e instanceof ProviderError ? e.kind : 'provider', message: 'Could not check the model with OpenRouter.' })
    }

    const image = await fetchImage(creative.assetUrl)
    if (!image.ok) return fail({ kind: 'image_unavailable', message: image.reason })
    const type = image.contentType.split(';')[0].trim()
    if (!SUPPORTED_IMAGES.includes(type)) return fail({ kind: 'image_unavailable', message: `Unsupported image format: ${type}` })
    if (image.bytes.byteLength > MAX_IMAGE_BYTES) return fail({ kind: 'image_unavailable', message: 'Image is larger than 5 MB.' })
    const imageDataUrl = `data:${type};base64,${Buffer.from(image.bytes).toString('base64')}`

    let call
    try {
      call = await callWithRetries(
        { model, prompt: prompt(creative), imageDataUrl, schema: visionJsonSchema() },
        { runId, workflow: 'image_analysis', creativeId: creative.creativeId, origin },
      )
    } catch (e) {
      const err = e as ProviderError & { attempts?: number }
      return fail({ kind: err.kind, message: err.message }, err.attempts ?? 1, { usage: err.usage ?? null })
    }

    const parsed = parseVisionOutput(creative.creativeId, call.response.text, { model: call.response.model, createdAt: now().toISOString() })
    const usage = call.response.usage
    try {
      onValidation?.({
        runId,
        creativeId: creative.creativeId,
        attempt: call.attempts,
        status: parsed.status === 'complete' ? 'valid' : 'invalid',
        reasons: parsed.status === 'failed' ? parsed.reasons : [],
      })
    } catch {
      // Observability must never break analysis.
    }
    if (parsed.status === 'failed') {
      return fail({ kind: 'invalid_response', message: 'The model’s answer did not match the analysis schema.', details: parsed.reasons }, call.attempts, {
        responseId: call.response.id,
        usage,
      })
    }
    return finish({ outcome: 'completed', attempts: call.attempts, responseId: call.response.id, usage, error: null }, parsed.analysis)
  }

  return {
    status(): { configured: boolean; model: string | null; problem: string | null } {
      return { configured: problem() === null, model: config.model ?? null, problem: problem() }
    },

    /** Every stored record, with in-flight creatives shown as processing. */
    records(): AnalysisRecord[] {
      const out = new Map(Object.entries(records).map(([id, r]) => [id, r]))
      for (const id of inFlight.keys()) {
        const r = out.get(id)
        out.set(id, r ? { ...r, status: 'processing' } : { creativeId: id, assetUrl: '', status: 'processing', current: null, lastAttempt: null })
      }
      return [...out.values()]
    },

    /**
     * Analyses one creative. Reuses a completed result for the same asset and model unless `force` is set,
     * and shares a single provider call between concurrent requests for the same creative.
     */
    analyze(creative: CreativeToAnalyse, { force = false, runId = `run-${now().getTime()}` }: { force?: boolean; runId?: string } = {}): Promise<AnalyzeOutcome> {
      const missing = problem()
      if (missing) return Promise.resolve({ ok: false, error: { kind: 'config', message: missing }, record: records[creative.creativeId] ?? null })
      const running = inFlight.get(creative.creativeId)
      if (running) return running
      const existing = records[creative.creativeId]
      if (!force && existing?.current && existing.assetUrl === creative.assetUrl && existing.current.modelVersion === config.model) {
        try {
          onCacheHit?.({ runId, creativeId: creative.creativeId })
        } catch {
          // Observability must never break analysis.
        }
        return Promise.resolve({ ok: true, cached: true, record: existing })
      }
      const job = run(creative, config.model!, runId).finally(() => inFlight.delete(creative.creativeId))
      inFlight.set(creative.creativeId, job)
      return job
    },
  }
}

export type AnalysisService = ReturnType<typeof createAnalysisService>
