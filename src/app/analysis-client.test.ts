import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchAnalysisState } from './analysis-client'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })

const record = { creativeId: 'cr-001', assetUrl: 'x', status: 'completed', current: null, lastAttempt: null }
const snapshot = { generatedAt: '2026-10-27T00:00:00Z', models: ['vendor/vision'], analysedFrom: '2026-10-26T17:45:00Z', analysedTo: '2026-10-26T18:10:00Z', records: [record] }

function serve(routes: Record<string, () => Response>) {
  vi.stubGlobal('fetch', async (url: string) => (routes[String(url)] ?? (() => new Response('', { status: 404 })))())
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchAnalysisState', () => {
  test('uses the live analysis server when it answers', async () => {
    serve({ '/api/analysis': () => json({ configured: true, model: 'vendor/vision', problem: null, records: [record] }), '/data/ai-analyses-snapshot.json': () => json(snapshot) })
    expect(await fetchAnalysisState()).toMatchObject({ available: true, configured: true, snapshot: null, records: [record] })
  })

  test('falls back to the recorded snapshot on a static deployment, with analysis turned off', async () => {
    serve({ '/api/analysis': () => new Response('', { status: 404 }), '/data/ai-analyses-snapshot.json': () => json(snapshot) })
    const state = await fetchAnalysisState()
    expect(state).toMatchObject({ available: false, configured: false, model: 'vendor/vision', records: [record] })
    expect(state.snapshot).toEqual({ models: ['vendor/vision'], analysedFrom: snapshot.analysedFrom, analysedTo: snapshot.analysedTo })
  })

  test('a dev server answering with the HTML shell is not a server or a snapshot', async () => {
    serve({ '/api/analysis': html, '/data/ai-analyses-snapshot.json': html })
    expect(await fetchAnalysisState()).toMatchObject({ available: false, records: [], snapshot: null })
  })

  test('shows no analyses when neither the server nor the snapshot is there', async () => {
    serve({})
    const state = await fetchAnalysisState()
    expect(state).toMatchObject({ available: false, records: [], snapshot: null })
    expect(state.problem).toContain('not running')
  })
})
