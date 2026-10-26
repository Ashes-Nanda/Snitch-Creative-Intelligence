// Server-only HTTP layer for creative analysis, mounted into the Vite dev/preview server.
// The OpenRouter key is read from the server environment and never sent to the browser.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { createAnalysisService, type AnalysisRecord, type AnalysisService, type AnalysisStore, type CreativeToAnalyse, type ImageFetcher } from './analysis-service'
import { createOpenRouterClient } from './openrouter'
import { cacheHitRecorder, fileSink, instrumentClient, preflightFailureRecorder, telemetryRoutes, validationRecorder } from './telemetry'

export const MAX_BATCH = 10

type Lookup = (creativeId: string) => Promise<CreativeToAnalyse | null>
interface Result {
  status: number
  body: unknown
}

const statusFor: Record<string, number> = {
  config: 503,
  not_found: 404,
  image_unavailable: 422,
  rate_limited: 429,
  credits: 402,
  timeout: 504,
  persist: 500,
}

/** Pure request handling, so routing and status codes can be tested without a server. */
export async function handleAnalysisRequest(
  req: { method: string; path: string; body: unknown },
  { service, lookup }: { service: AnalysisService; lookup: Lookup },
): Promise<Result> {
  if (req.method === 'GET' && req.path === '/api/analysis') {
    return { status: 200, body: { ...service.status(), records: service.records() } }
  }

  if (req.method === 'POST' && req.path === '/api/analysis/batch') {
    const ids = (req.body as { ids?: unknown })?.ids
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return { status: 400, body: { ok: false, error: { kind: 'bad_request', message: 'Send { ids: string[] }.' } } }
    if (ids.length > MAX_BATCH) return { status: 400, body: { ok: false, error: { kind: 'bad_request', message: `At most ${MAX_BATCH} creatives per batch.` } } }
    const runId = randomUUID()
    const results = []
    // Sequential on purpose: predictable cost and no burst against rate limits.
    for (const id of ids as string[]) {
      const creative = await lookup(id)
      if (!creative) {
        results.push({ creativeId: id, ok: false, error: { kind: 'not_found', message: `No creative with ID ${id}.` } })
        continue
      }
      const outcome = await service.analyze(creative, { runId })
      results.push({ creativeId: id, ...outcome })
    }
    return { status: 200, body: { runId, results } }
  }

  const single = req.path.match(/^\/api\/analysis\/([\w-]+)$/)
  if (req.method === 'POST' && single) {
    const creative = await lookup(single[1])
    if (!creative) return { status: 404, body: { ok: false, error: { kind: 'not_found', message: `No creative with ID ${single[1]}.` } } }
    const force = (req.body as { force?: unknown })?.force === true
    const outcome = await service.analyze(creative, { force, runId: randomUUID() })
    return { status: outcome.ok ? 200 : (statusFor[outcome.error.kind] ?? 502), body: outcome }
  }

  return { status: 404, body: { ok: false, error: { kind: 'not_found', message: 'Unknown analysis route.' } } }
}

/** JSON file store with atomic writes. Results are keyed by stable creative ID. */
export function fileAnalysisStore(path: string): AnalysisStore {
  return {
    load() {
      if (!existsSync(path)) return {}
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as Record<string, AnalysisRecord>
      } catch {
        // Keep the unreadable file for inspection rather than overwriting it.
        renameSync(path, `${path}.unreadable-${Date.now()}`)
        console.warn('[analysis] stored results were unreadable and were set aside')
        return {}
      }
    },
    save(records) {
      mkdirSync(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      writeFileSync(tmp, JSON.stringify(records, null, 2))
      renameSync(tmp, path)
    },
  }
}

/** Fetches an image for analysis. Nothing is written to disk; the bytes are only forwarded to the model. */
export const fetchImageForAnalysis: ImageFetcher = async (url) => {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (CreativeIntelligencePrototype)' }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return { ok: false, reason: `Image URL returned ${res.status}` }
    const contentType = res.headers.get('content-type') ?? 'unknown'
    const length = Number(res.headers.get('content-length'))
    if (length > 5 * 1024 * 1024) return { ok: false, reason: 'Image is larger than 5 MB.' }
    return { ok: true, contentType, bytes: new Uint8Array(await res.arrayBuffer()) }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === 'TimeoutError' ? 'Image download timed out' : 'Image could not be downloaded' }
  }
}

/** Creatives the server may analyse: only those in the dataset, by ID. */
function datasetLookup(datasetPath: string): Lookup {
  return async (id) => {
    const data = JSON.parse(readFileSync(datasetPath, 'utf8')) as { creatives: { creative_id: string; asset_url: string; name: string; asset_type?: string }[] }
    const c = data.creatives.find((x) => x.creative_id === id && typeof x.asset_url === 'string' && /^https:\/\//.test(x.asset_url))
    return c ? { creativeId: c.creative_id, assetUrl: c.asset_url, name: c.name, assetType: c.asset_type ?? 'unknown' } : null
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve(null)
      }
    })
  })
}

/** Connect-style middleware for /api/analysis and the read-only GET /api/telemetry. */
export function createAnalysisMiddleware({ env, root }: { env: Record<string, string | undefined>; root: string }) {
  const apiKey = env.OPENROUTER_API_KEY || undefined
  const model = env.OPENROUTER_MODEL || undefined
  const origin = 'live' as const

  // Call telemetry: identifiers, counts, timings and cost only. Never prompts, images, output or headers.
  const logPath = `${root}/.telemetry/llm-calls.jsonl`
  const sink = fileSink({
    append: async (line) => {
      await mkdir(`${root}/.telemetry`, { recursive: true })
      await appendFile(logPath, line)
    },
    read: () => readFile(logPath, 'utf8').catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : Promise.reject(e))),
  })
  const onSinkError = (e: unknown) => console.warn('[telemetry] write failed', e instanceof Error ? e.message : e)

  const service = createAnalysisService({
    config: { apiKey, model },
    client: instrumentClient(createOpenRouterClient({ apiKey: apiKey ?? '' }), { sink, onSinkError }),
    store: fileAnalysisStore(`${root}/data/ai-analyses.json`),
    fetchImage: fetchImageForAnalysis,
    origin,
    onValidation: validationRecorder(sink, origin, { onSinkError }),
    onCacheHit: cacheHitRecorder(sink, origin, { onSinkError }),
    onPreflightFailure: preflightFailureRecorder(sink, origin, { onSinkError }),
  })
  const lookup = datasetLookup(`${root}/public/data/dataset.json`)
  const telemetry = telemetryRoutes(sink)

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/api/telemetry') return telemetry(req, res, next)
    if (!path.startsWith('/api/analysis')) return next()
    const body = req.method === 'POST' ? await readBody(req) : null
    let result: Result
    try {
      result = await handleAnalysisRequest({ method: req.method ?? 'GET', path, body }, { service, lookup })
    } catch {
      result = { status: 500, body: { ok: false, error: { kind: 'server', message: 'The analysis server hit an unexpected error.' } } }
    }
    res.statusCode = result.status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(result.body))
  }
}
