import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AnalysisState, CreativeAnalysis } from '@/domain/analysis'
import { createDismissalStore } from '@/domain/dismissals'
import { createProposalStore, type Outcome, type Storage } from '@/domain/experiments'
import type { EvidenceLevel, Freshness } from '@/domain/freshness'
import { reviewSession } from '@/domain/session'
import { fetchAnalysisState, requestAnalysis, requestBatch, type AnalysisServerState, type AnalyzeResult, type LiveAnalysisRecord } from './analysis-client'
import { loadData, type ExportName, type LoadedData } from './data'
import { useRouter } from './router'

const PROPOSALS_KEY = 'ci.proposals.v2'
const DISMISSALS_KEY = 'ci.dismissals.v1'
const ACTOR = 'You (this browser)'

const localStore = (key: string): Storage => ({
  load: () => localStorage.getItem(key),
  save: (v) => localStorage.setItem(key, v),
})

interface DataState {
  data: LoadedData | null
  loading: boolean
  /** Set when the most recent load failed; `data` keeps the last successful load. */
  failure: { at: Date; message: string } | null
}

const noAnalyses = new Map<string, CreativeAnalysis>()
const noOverlaps = new Map<string, string[]>()
const noLevels = new Map<string, EvidenceLevel>()
const alwaysFresh = (): Freshness => ({ stale: false })

export type AnalysisDisplayStatus = 'not_analyzed' | 'processing' | 'completed' | 'failed'

/** Live results win per creative. A failed retry keeps the earlier successful analysis. */
function mergeAnalyses(base: Map<string, AnalysisState>, live: LiveAnalysisRecord[]): Map<string, AnalysisState> {
  const merged = new Map(base)
  for (const r of live) {
    if (!merged.has(r.creativeId)) continue
    if (r.current) merged.set(r.creativeId, { status: 'complete', analysis: r.current })
    else if (r.status === 'failed' && r.lastAttempt?.error)
      merged.set(r.creativeId, { status: 'failed', creativeId: r.creativeId, reasons: [r.lastAttempt.error.message, ...(r.lastAttempt.error.details ?? [])] })
  }
  return merged
}

function useDashboardState() {
  const router = useRouter()
  const { params } = router.route
  const [state, setState] = useState<DataState>({ data: null, loading: true, failure: null })
  const [exportName, setExportName] = useState<ExportName>('current')
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [proposalStore, setProposalStore] = useState(() => createProposalStore(localStore(PROPOSALS_KEY), { actor: ACTOR }))
  const [dismissalStore, setDismissalStore] = useState(() => createDismissalStore(localStore(DISMISSALS_KEY), { actor: ACTOR }))
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [ai, setAi] = useState<AnalysisServerState>({ available: false, configured: false, model: null, problem: null, records: [] })
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set())

  const refreshAnalyses = useCallback(async () => setAi(await fetchAnalysisState()), [])
  useEffect(() => {
    void refreshAnalyses()
  }, [refreshAnalyses])

  /** Runs analysis for some creatives. Each request is user-triggered; nothing runs on page load. */
  const runAnalysis = useCallback(
    async (ids: string[], force = false): Promise<AnalyzeResult[]> => {
      setInFlight((s) => new Set([...s, ...ids]))
      try {
        if (ids.length === 1) return [await requestAnalysis(ids[0], force)]
        const batch = await requestBatch(ids)
        return 'error' in batch ? ids.map(() => ({ ok: false as const, error: batch.error, record: null })) : batch.results
      } finally {
        setInFlight((s) => new Set([...s].filter((id) => !ids.includes(id))))
        await refreshAnalyses()
      }
    },
    [refreshAnalyses],
  )

  const load = useCallback(async (name: ExportName, fail: boolean) => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await loadData(name, fail)
      setState({ data, loading: false, failure: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, failure: { at: new Date(), message: e instanceof Error ? e.message : String(e) } }))
    }
  }, [])

  useEffect(() => {
    void load('current', false)
  }, [load])

  const data = state.data
  const weeks = useMemo(() => data?.weeks ?? [], [data])
  const proposals = proposalStore.list()
  const dismissalList = dismissalStore.all()

  const analyses = useMemo(() => (data ? mergeAnalyses(data.analyses, ai.records) : new Map<string, AnalysisState>()), [data, ai.records])
  const liveRecords = useMemo(() => new Map(ai.records.map((r) => [r.creativeId, r])), [ai.records])

  const session = useMemo(
    () => (data ? reviewSession({ dataset: data.dataset, analyses, weeks, params, proposals }) : null),
    [data, analyses, weeks, params, proposals],
  )

  const proposalsToSync = session?.proposalsToSync
  useEffect(() => {
    if (!proposalsToSync) return
    const before = proposalStore.list()
    proposalStore.syncProposals(proposalsToSync)
    if (proposalStore.list() !== before) bump()
  }, [proposalsToSync, proposalStore, bump])

  const act = useCallback(
    <T extends unknown[], R extends Outcome | { ok: true; proposalId: string }>(fn: (...args: T) => R) =>
      (...args: T): R => {
        const outcome = fn(...args)
        bump()
        return outcome
      },
    [bump],
  )

  const experiments = {
    list: proposals,
    loadError: proposalStore.loadError,
    createDraft: act(proposalStore.createDraft),
    edit: act(proposalStore.edit),
    submit: act(proposalStore.submit),
    approve: act(proposalStore.approve),
    reject: act(proposalStore.reject),
    requestEdits: act(proposalStore.requestEdits),
    reopen: act(proposalStore.reopen),
    recordOutcome: act(proposalStore.recordOutcome),
  }

  const dismissals = {
    get: dismissalStore.get,
    all: dismissalList,
    loadError: dismissalStore.loadError,
    dismiss: act(dismissalStore.dismiss),
    restore: act(dismissalStore.restore),
  }

  const resetDemo = useCallback(() => {
    localStorage.removeItem(PROPOSALS_KEY)
    localStorage.removeItem(DISMISSALS_KEY)
    setProposalStore(createProposalStore(localStore(PROPOSALS_KEY), { actor: ACTOR }))
    setDismissalStore(createDismissalStore(localStore(DISMISSALS_KEY), { actor: ACTOR }))
  }, [])

  return {
    ...state,
    ...router,
    refresh: () => load(exportName, simulateFailure),
    exportName,
    switchExport: (name: ExportName) => {
      setExportName(name)
      void load(name, false)
    },
    simulateFailure,
    setSimulateFailure,
    weeks,
    filters: session?.filters ?? null,
    view: session?.view ?? null,
    insightView: session?.insightView ?? null,
    previous: session?.previous ?? null,
    completedAnalyses: session?.completedAnalyses ?? noAnalyses,
    insights: session?.insights ?? [],
    suppressed: session?.suppressed ?? [],
    overlaps: session?.overlaps ?? noOverlaps,
    levels: session?.levels ?? noLevels,
    freshnessOf: session?.freshnessOf ?? alwaysFresh,
    review: session?.review ?? null,
    experiments,
    dismissals,
    resetDemo,
    /** Merged analysis state for every creative: the single source of truth for pages. */
    analyses,
    ai: { available: ai.available, configured: ai.configured, model: ai.model, problem: ai.problem },
    liveRecord: (id: string) => liveRecords.get(id),
    analysisStatus: (id: string): AnalysisDisplayStatus => {
      if (inFlight.has(id) || liveRecords.get(id)?.status === 'processing') return 'processing'
      const a = analyses.get(id)
      return a?.status === 'complete' ? 'completed' : a?.status === 'failed' ? 'failed' : 'not_analyzed'
    },
    runAnalysis,
    refreshAnalyses,
  }
}

export type Dashboard = ReturnType<typeof useDashboardState>

const DashboardContext = createContext<Dashboard | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const value = useDashboardState()
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): Dashboard {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider')
  return ctx
}
