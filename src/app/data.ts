import type { AnalysisState } from '@/domain/analysis'
import { ingestDataset, type Dataset } from '@/domain/ingest'

export type ExportName = 'current' | 'next'

export interface LoadedData {
  dataset: Dataset
  /**
   * Baseline analysis state: every creative starts not analysed. Live image analysis from /api/analysis is merged
   * over this in the app state. The templated fixture analyses are not used: they were never observed from the images.
   */
  analyses: Map<string, AnalysisState>
  source: { type: 'simulated' | 'connected'; label: string; generatedAt: string }
  exportName: ExportName
  loadedAt: Date
  weeks: { start: string; end: string }[]
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  // Dev servers answer missing files with the HTML app shell, so check what actually came back.
  if (!res.headers.get('content-type')?.includes('json')) throw new Error(`${url} did not return data`)
  return res.json()
}

const files: Record<ExportName, { dataset: string }> = {
  current: { dataset: 'dataset.json' },
  next: { dataset: 'dataset-next.json' },
}

/** Loads a demo export. `simulateFailure` points at a missing file so the failed-refresh path can be shown. */
export async function loadData(exportName: ExportName, simulateFailure = false): Promise<LoadedData> {
  const base = import.meta.env.BASE_URL
  const f = files[exportName]
  const raw = (await fetchJson(`${base}data/${simulateFailure ? 'unavailable.json' : f.dataset}`)) as {
    source: LoadedData['source']
    creatives: unknown[]
    performance: unknown[]
  }

  const dataset = ingestDataset(raw)
  const analyses = new Map<string, AnalysisState>()
  for (const c of dataset.creatives) analyses.set(c.creativeId, { status: 'pending', creativeId: c.creativeId })

  const weekKeys = new Map(dataset.performance.map((p) => [p.reportingStart, p.reportingEnd]))
  const weeks = [...weekKeys].sort(([a], [b]) => a.localeCompare(b)).map(([start, end]) => ({ start, end }))

  return { dataset, analyses, source: raw.source, exportName, loadedAt: new Date(), weeks }
}
