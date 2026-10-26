import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseAnalysis, type AnalysisState } from './analysis'
import type { Proposal } from './experiments'
import { snapshotOf } from './freshness'
import { ingestDataset } from './ingest'
import { reviewSession, type SessionInput } from './session'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8'))

/** Loads a demo export the way the app does. */
function demo(datasetFile: string, analysesFile: string): Omit<SessionInput, 'params' | 'proposals'> {
  const dataset = ingestDataset(read(datasetFile))
  const raw = read(analysesFile)
  const analyses = new Map<string, AnalysisState>(
    dataset.creatives.map((c) => [c.creativeId, raw[c.creativeId] === undefined ? { status: 'pending', creativeId: c.creativeId } : parseAnalysis(c.creativeId, raw[c.creativeId])]),
  )
  const weeks = [...new Map(dataset.performance.map((p) => [p.reportingStart, p.reportingEnd]))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, end]) => ({ start, end }))
  return { dataset, analyses, weeks }
}

const current = demo('dataset.json', 'analyses.json')
const next = demo('dataset-next.json', 'analyses-next.json')
const { weeks } = current
const fullPeriod = `from=${weeks[0].start}&to=${weeks[weeks.length - 1].end}`

function session(query = '', base = current, proposals: Proposal[] = []) {
  return reviewSession({ ...base, params: new URLSearchParams(query), proposals })!
}

describe('reviewSession', () => {
  test('is null when there are no reporting weeks', () => {
    expect(reviewSession({ ...current, weeks: [], params: new URLSearchParams(), proposals: [] })).toBeNull()
  })

  test('defaults to the latest four reporting weeks', () => {
    const { filters } = session()
    expect(filters.from).toBe(weeks[weeks.length - 4].start)
    expect(filters.to).toBe(weeks[weeks.length - 1].end)
  })

  test('ignores URL values it does not recognise', () => {
    const { filters } = session('from=last-week&platform=meta,tiktok&format=gif&analysis=nope&data=maybe&sort=bogus:asc')
    expect(filters).toMatchObject({
      from: weeks[weeks.length - 4].start,
      platforms: ['meta'],
      formats: [],
      analysisStatuses: [],
      dataAvailability: 'all',
      sort: { key: 'spend', direction: 'desc' },
    })
  })

  test('keeps a valid date that is not a week boundary', () => {
    expect(session('from=2026-09-03').filters.from).toBe('2026-09-03')
  })

  test('library search narrows the library view but not insights or the attention queue', () => {
    const plain = session(fullPeriod)
    const searched = session(`${fullPeriod}&q=no-creative-matches-this`)
    expect(searched.view.count).toBe(0)
    expect(searched.insights).toEqual(plain.insights)
    expect(searched.review).toEqual(plain.review)
  })

  test('analysis-status and data filters apply to the library only, in the current and the previous period alike', () => {
    const plain = session()
    const filtered = session('analysis=failed&data=without')
    expect(filtered.view.count).toBeLessThan(plain.view.count)
    expect(filtered.insightView).toEqual(plain.insightView)
    expect(plain.previous).not.toBeNull()
    expect(filtered.previous).toEqual(plain.previous)
  })

  test('the previous period is the equal-length run of weeks just before', () => {
    expect(session().previous!.period).toEqual({ from: weeks[weeks.length - 8].start, to: weeks[weeks.length - 5].end })
  })

  test('proposals to sync come from every reporting week, whatever the filters', () => {
    const ids = (s: ReturnType<typeof session>) => s.proposalsToSync.map((i) => i.insightId)
    expect(ids(session())).toContain('meta:hookType:product-first:ctr')
    expect(ids(session(`platform=google&from=${weeks[weeks.length - 1].start}`))).toEqual(ids(session()))
  })

  test('freshness is judged against the snapshot’s own period, not the current filters', () => {
    const saved = snapshotOf(session(fullPeriod).insights.find((i) => i.insightId === 'meta:hookType:product-first:ctr')!)
    // Filtering to Google hides the insight from the view, but the data still reproduces it.
    const googleOnly = session('platform=google')
    expect(googleOnly.insights.some((i) => i.insightId === saved.insightId)).toBe(false)
    expect(googleOnly.freshnessOf(saved)).toEqual({ stale: false })
    // The next-week export changes the data behind it.
    expect(session('', next).freshnessOf(saved)).toMatchObject({ stale: true })
  })

  test('a proposal needing review becomes the recommended next action', () => {
    const waiting = { proposalId: 'p1', title: 'Test', status: 'needs_review' } as Proposal
    expect(session('', current, [waiting]).review.recommended).toMatchObject({ kind: 'review_proposal', targetId: 'p1' })
  })
})
