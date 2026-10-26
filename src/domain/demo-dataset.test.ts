import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseAnalysis, type AnalysisState } from './analysis'
import { checkFreshness, snapshotOf } from './freshness'
import { ingestDataset, type Dataset } from './ingest'
import { reviewSession } from './session'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8'))
const period = { from: '2026-08-31', to: '2026-10-25' }

function insightsFor(dataset: Dataset, rawAnalyses: Record<string, unknown>) {
  const analyses = new Map<string, AnalysisState>(dataset.creatives.map((c) => [c.creativeId, parseAnalysis(c.creativeId, rawAnalyses[c.creativeId] ?? null)]))
  const weeks = [...new Map(dataset.performance.map((p) => [p.reportingStart, p.reportingEnd]))].map(([start, end]) => ({ start, end }))
  return reviewSession({ dataset, analyses, weeks, params: new URLSearchParams(period), proposals: [] })!.insights
}

describe('demo dataset', () => {
  const dataset = ingestDataset(read('dataset.json'))

  test('loads 20–100 creatives across both platforms', () => {
    expect(dataset.creatives.length).toBeGreaterThanOrEqual(20)
    expect(dataset.creatives.length).toBeLessThanOrEqual(100)
    expect(new Set(dataset.creatives.map((c) => c.platform))).toEqual(new Set(['meta', 'google']))
  })

  test('surfaces every planted data problem', () => {
    expect(dataset.quality.invalid.map((i) => i.id)).toEqual(['cr-029', 'pf-bad-clicks'])
    expect(dataset.quality.duplicates).toHaveLength(1)
    expect(dataset.quality.performanceWithoutCreative).toEqual(['pf-orphan'])
    expect(dataset.quality.creativesWithoutPerformance).toEqual(['cr-028'])
  })

  test('produces at least one evidence-backed insight for the full period', () => {
    expect(insightsFor(dataset, read('analyses.json')).map((i) => i.insightId)).toContain('meta:hookType:product-first:ctr')
  })

  test('the next-week export makes the saved product-first snapshot stale', () => {
    const saved = snapshotOf(insightsFor(dataset, read('analyses.json')).find((i) => i.insightId === 'meta:hookType:product-first:ctr')!)
    const next = insightsFor(ingestDataset(read('dataset-next.json')), read('analyses-next.json'))
    expect(checkFreshness(saved, next)).toMatchObject({ stale: true })
  })
})
