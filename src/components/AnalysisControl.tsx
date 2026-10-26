import { useState } from 'react'
import { AlertTriangle, Bot, CircleDashed, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { useDashboard, type AnalysisDisplayStatus } from '@/app/context'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './common'

const meta: Record<AnalysisDisplayStatus, { label: string; tone: 'neutral' | 'info' | 'good' | 'bad'; icon: typeof Bot }> = {
  not_analyzed: { label: 'Not analysed', tone: 'neutral', icon: CircleDashed },
  processing: { label: 'Processing', tone: 'info', icon: Loader2 },
  completed: { label: 'Completed', tone: 'good', icon: Bot },
  failed: { label: 'Failed', tone: 'bad', icon: XCircle },
}

export function AnalysisStatusBadge({ creativeId }: { creativeId: string }) {
  const d = useDashboard()
  const status = d.analysisStatus(creativeId)
  const m = meta[status]
  const lastFailed = status === 'completed' && d.liveRecord(creativeId)?.lastAttempt?.outcome === 'failed'
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge tone={m.tone} icon={m.icon} title={status === 'completed' ? 'AI image analysis completed' : undefined}>
        {m.label}
      </StatusBadge>
      {lastFailed && (
        <StatusBadge tone="warn" icon={AlertTriangle} title="The latest re-analysis failed; the earlier result is kept.">
          Retry failed
        </StatusBadge>
      )}
    </span>
  )
}

/** Status plus a working Analyse / Retry / Re-analyse action, with errors shown inline. */
export function AnalysisControl({ creativeId, size = 'sm' }: { creativeId: string; size?: 'sm' | 'xs' }) {
  const d = useDashboard()
  const [error, setError] = useState<string | null>(null)
  const status = d.analysisStatus(creativeId)
  const record = d.liveRecord(creativeId)
  const shownError = error ?? (status === 'failed' ? (record?.lastAttempt?.error?.message ?? null) : null)
  const disabled = status === 'processing' || !d.ai.available || !d.ai.configured

  const run = async (force: boolean) => {
    setError(null)
    const [result] = await d.runAnalysis([creativeId], force)
    if (!result.ok) setError(result.error.message)
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <AnalysisStatusBadge creativeId={creativeId} />
        {status === 'not_analyzed' && (
          <Button size={size} variant="outline" disabled={disabled} onClick={() => void run(false)} title={d.ai.problem ?? undefined}>
            <Sparkles aria-hidden /> Analyse
          </Button>
        )}
        {status === 'failed' && (
          <Button size={size} variant="outline" disabled={disabled} onClick={() => void run(true)} title={d.ai.problem ?? undefined}>
            <RefreshCw aria-hidden /> Retry
          </Button>
        )}
        {status === 'completed' && size === 'sm' && (
          <Button size={size} variant="ghost" disabled={disabled} onClick={() => void run(true)} title="Run the analysis again (uses model credits)">
            <RefreshCw aria-hidden /> Re-analyse
          </Button>
        )}
      </span>
      {shownError && (
        <span role="alert" className="max-w-xs text-xs text-destructive">
          {shownError}
        </span>
      )}
    </span>
  )
}

/** Explains why analysis can't run, when it can't. Renders nothing when it can. */
export function AnalysisConfigNotice() {
  const d = useDashboard()
  if (d.ai.available && d.ai.configured) return null
  return (
    <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      AI image analysis is unavailable: {d.ai.problem ?? 'the analysis server is not configured.'} Everything else keeps working.
    </p>
  )
}
