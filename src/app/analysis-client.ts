// Browser side of /api/analysis. The API key never passes through here: the server holds it.
import type { CreativeAnalysis } from '@/domain/analysis'

export interface AnalysisErrorInfo {
  kind: string
  message: string
  details?: string[]
}

/** Mirrors the server's AnalysisRecord. */
export interface LiveAnalysisRecord {
  creativeId: string
  assetUrl: string
  status: 'processing' | 'completed' | 'failed'
  current: CreativeAnalysis | null
  lastAttempt: {
    at: string
    outcome: 'completed' | 'failed'
    model: string
    durationMs: number
    attempts: number
    responseId: string | null
    usage: { promptTokens: number | null; completionTokens: number | null; cost: number | null; cachedPromptTokens: number | null } | null
    error: AnalysisErrorInfo | null
  } | null
}

export interface AnalysisServerState {
  /** False when no analysis server is running (for example a static build). */
  available: boolean
  configured: boolean
  model: string | null
  problem: string | null
  records: LiveAnalysisRecord[]
  /** Set when no server answered and recorded results were loaded from the static snapshot instead. */
  snapshot: { models: string[]; analysedFrom: string | null; analysedTo: string | null } | null
}

/** Recorded live analyses, published with a static build by `npm run snapshot:analyses`. */
async function loadSnapshot(): Promise<AnalysisServerState | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/ai-analyses-snapshot.json`, { cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const body = (await res.json()) as { models: string[]; analysedFrom: string | null; analysedTo: string | null; records: LiveAnalysisRecord[] }
    return {
      available: false,
      configured: false,
      model: body.models[0] ?? null,
      problem: 'This deployment shows recorded results. New analyses run only when the app is started locally with its analysis server.',
      records: body.records,
      snapshot: { models: body.models, analysedFrom: body.analysedFrom, analysedTo: body.analysedTo },
    }
  } catch {
    return null
  }
}

export type AnalyzeResult = { ok: true; cached: boolean; record: LiveAnalysisRecord } | { ok: false; error: AnalysisErrorInfo; record: LiveAnalysisRecord | null }

export async function fetchAnalysisState(): Promise<AnalysisServerState> {
  try {
    const res = await fetch('/api/analysis', { cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error()
    return { available: true, snapshot: null, ...(await res.json()) }
  } catch {
    return (
      (await loadSnapshot()) ?? {
        available: false,
        configured: false,
        model: null,
        problem: 'The analysis server is not running. Start the app with npm run dev or npm run preview.',
        records: [],
        snapshot: null,
      }
    )
  }
}

export async function requestAnalysis(creativeId: string, force: boolean): Promise<AnalyzeResult> {
  try {
    const res = await fetch(`/api/analysis/${encodeURIComponent(creativeId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force }),
    })
    return (await res.json()) as AnalyzeResult
  } catch {
    return { ok: false, error: { kind: 'network', message: 'Could not reach the analysis server.' }, record: null }
  }
}

export async function requestBatch(creativeIds: string[]): Promise<{ results: ({ creativeId: string } & AnalyzeResult)[] } | { error: AnalysisErrorInfo }> {
  try {
    const res = await fetch('/api/analysis/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: creativeIds }) })
    const body = await res.json()
    return res.ok ? body : { error: body.error ?? { kind: 'server', message: `Batch failed with HTTP ${res.status}` } }
  } catch {
    return { error: { kind: 'network', message: 'Could not reach the analysis server.' } }
  }
}
