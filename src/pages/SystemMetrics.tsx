import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/app/context'
import { NA } from '@/app/format'
import { AppShell } from '@/components/AppShell'
import { InfoTip, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Storage } from '@/domain/experiments'
import { summarizeOutcomes } from '@/domain/outcomes'
import { modelPrices } from '@/domain/prices'
import { summarizeCalls, type Distribution, type Origin, type Rate, type TelemetryLog, type Total } from '@/domain/telemetry'
import { createTimingStore, timeSaved, type TimedTask } from '@/domain/timing'

const TIMINGS_KEY = 'ci.timings.v1'
const timingStorage: Storage = { load: () => localStorage.getItem(TIMINGS_KEY), save: (v) => localStorage.setItem(TIMINGS_KEY, v) }

const usd = (v: number | null, digits = 4) => (v === null ? NA : `$${v.toFixed(digits)}`)
const int = (v: number | null) => (v === null ? NA : Math.round(v).toLocaleString('en-IN'))
const seconds = (v: number | null) => (v === null ? NA : v < 90 ? `${v.toFixed(1)} s` : `${(v / 60).toFixed(1)} min`)
const rateText = (r: Rate) => (r.value === null ? `${NA} (0 of 0)` : `${(r.value * 100).toFixed(0)}% (${r.numerator} of ${r.denominator})`)
const coverage = (t: Total) => `${t.known} of ${t.of} requests reported it`
const dist = (d: Distribution, f: (v: number | null) => string) => (d.n === 0 ? NA : `median ${f(d.median)} · mean ${f(d.mean)} · n = ${d.n}`)

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label}
        {help && <InfoTip text={help} />}
      </dt>
      <dd className="tabular-nums">{children}</dd>
    </>
  )
}

type LogState = { status: 'loading' } | { status: 'unavailable'; message: string } | { status: 'ready'; log: TelemetryLog & { unreadableLines: number } }

export function SystemMetrics() {
  const d = useDashboard()
  const [origin, setOrigin] = useState<Origin>('live')
  const [log, setLog] = useState<LogState>({ status: 'loading' })

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/telemetry`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('No telemetry endpoint: the app is not running with its analysis server.')
        setLog({ status: 'ready', log: await res.json() })
      })
      .catch((e) => setLog({ status: 'unavailable', message: e instanceof Error ? e.message : String(e) }))
  }, [])

  const calls = useMemo(() => (log.status === 'ready' ? summarizeCalls(log.log, { origin }, modelPrices) : null), [log, origin])
  const period = useMemo(() => {
    if (log.status !== 'ready') return null
    const times = log.log.calls.filter((c) => c.origin === origin).map((c) => c.startedAt).sort()
    return times.length ? `${times[0].slice(0, 16).replace('T', ' ')} – ${times[times.length - 1].slice(0, 16).replace('T', ' ')} UTC` : null
  }, [log, origin])
  const outcomes = summarizeOutcomes(d.experiments.list, d.dismissals.all)

  return (
    <AppShell title="System metrics" description="What the system costs, how reliably it works, and whether it saves time. Figures come only from recorded events." filters="none">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={origin} onValueChange={(v) => v && setOrigin(v as Origin)} aria-label="Event origin">
          <ToggleGroupItem value="live">Live</ToggleGroupItem>
          <ToggleGroupItem value="test">Test and practice</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-muted-foreground">Model-call period: {period ?? 'no calls recorded'}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimeStudy origin={origin} />

        <Card>
          <CardHeader>
            <CardTitle>Cost per model call</CardTitle>
            <CardDescription>Provider-reported cost in USD. A cost the provider didn't report is shown as unavailable, never as zero.</CardDescription>
          </CardHeader>
          <CardContent>
            {log.status !== 'ready' || !calls ? (
              <LogNotice log={log} />
            ) : (
              <dl className="grid grid-cols-[15rem_1fr] gap-y-2 text-sm">
                <Row label="Total recorded cost">
                  {usd(calls.cost.total.value)} {!calls.cost.complete && <StatusBadge tone="warn">lower bound</StatusBadge>}
                </Row>
                <Row label="Cost data" help="Reported: from the provider. Estimated: tokens × a sourced price. Unavailable: neither.">
                  {calls.cost.coverage.reported} reported · {calls.cost.coverage.estimated} estimated · {calls.cost.coverage.unavailable} unavailable
                </Row>
                <Row label="Per successful analysis" help="All recorded cost, including failed attempts, over analyses that passed validation.">
                  {usd(calls.cost.perSuccessfulAnalysis)} ({calls.analyses.succeeded} succeeded)
                </Row>
                <Row label="Per attempted analysis">{usd(calls.cost.perAttemptedAnalysis)} ({calls.analyses.attempted} attempted)</Row>
                <Row label="Per run" help="A run is one user-triggered task. Only runs whose every request has a cost.">{dist(calls.cost.perRun, (v) => usd(v))}</Row>
                <Row label="Input tokens">
                  {int(calls.tokens.input.value)} <span className="text-muted-foreground">({coverage(calls.tokens.input)})</span>
                </Row>
                <Row label="Output tokens">
                  {int(calls.tokens.output.value)} <span className="text-muted-foreground">({coverage(calls.tokens.output)})</span>
                </Row>
                <Row label="Tokens per request">{dist(calls.tokens.perRequest, int)}</Row>
                <Row label="Latency (successful)" help="Model processing time. Not human time, and not time saved.">
                  {dist(calls.latencyMs, (v) => seconds(v === null ? null : v / 1000))}
                </Row>
                <Row label="Models served">
                  {calls.models.length === 0
                    ? NA
                    : calls.models.map((m) => `${m.requested} → ${m.returned ?? 'not reported'}${m.provider ? ` via ${m.provider}` : ''} (${m.requests})`).join('; ')}
                </Row>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reliability</CardTitle>
            <CardDescription>An analysis succeeds only when the model's answer passes schema validation, not when the request returns.</CardDescription>
          </CardHeader>
          <CardContent>
            {log.status !== 'ready' || !calls ? (
              <LogNotice log={log} />
            ) : (
              <dl className="grid grid-cols-[15rem_1fr] gap-y-2 text-sm">
                <Row label="Requests">
                  {calls.requests.total} ({calls.requests.ok} returned, {calls.requests.error} failed)
                </Row>
                <Row label="Analysis completion" help="Analyses with a valid result over analyses attempted. One analysis = one creative in one run, however many retries.">
                  {rateText(calls.analyses.completionRate)}
                </Row>
                <Row label="Failed before a model call" help="Counted as attempted analyses, at no cost: e.g. the image couldn't be fetched.">
                  {calls.analyses.failedBeforeCall.total === 0
                    ? 'None'
                    : `${calls.analyses.failedBeforeCall.total} (${Object.entries(calls.analyses.failedBeforeCall.byKind)
                        .map(([k, n]) => `${k.replace('_', ' ')}: ${n}`)
                        .join(', ')})`}
                </Row>
                <Row label="Invalid structured output" help="Returned answers that failed the schema, over all validated answers.">
                  {rateText(calls.analyses.invalidOutputRate)}
                </Row>
                <Row label="Retry recovery" help="Analyses whose first request failed and that later succeeded, over those retried.">
                  {rateText(calls.retries.recoveryRate)}
                </Row>
                <Row label="Reused stored results" help="Requests answered from a stored analysis of the same image and model, without a model call.">
                  {rateText(calls.cacheHitRate)}
                </Row>
                <Row label="Failures by kind">
                  {Object.keys(calls.requests.byErrorKind).length === 0
                    ? 'None'
                    : Object.entries(calls.requests.byErrorKind)
                        .map(([k, n]) => `${k.replace('_', ' ')}: ${n}`)
                        .join(', ')}
                </Row>
                {log.log.unreadableLines > 0 && <Row label="Unreadable log lines">{log.log.unreadableLines}</Row>}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow outcomes</CardTitle>
            <CardDescription>From proposals and decisions saved in this browser. Acceptance is a workflow signal, not proof that a test improved results.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[15rem_1fr] gap-y-2 text-sm">
              <Row label="Recommendations generated">{outcomes.recommendations.generated}</Row>
              <Row label="Accepted / rejected / undecided">
                {outcomes.recommendations.accepted} / {outcomes.recommendations.rejected} / {outcomes.recommendations.undecided}
              </Row>
              <Row label="Acceptance rate" help="Approved over recommendations with an approve or reject decision. Undecided ones are left out.">
                {rateText(outcomes.recommendations.acceptanceRate)}
              </Row>
              <Row label="Edited by a person" help="Recommendations edited or sent back for edits, over those a person acted on.">
                {rateText(outcomes.recommendations.humanEditRate)}
              </Row>
              <Row label="Drafts submitted">{rateText(outcomes.drafts.submissionRate)}</Row>
              <Row label="Outcomes recorded" help="Approved proposals with a recorded outcome, over approved proposals.">
                {rateText(outcomes.experiments.outcomeRecordedRate)}
              </Row>
              <Row label="Verdicts">
                won {outcomes.experiments.verdicts.won} · lost {outcomes.experiments.verdicts.lost} · inconclusive {outcomes.experiments.verdicts.inconclusive} · not run {outcomes.experiments.verdicts.not_run}
              </Row>
              <Row label="Insights dismissed">{outcomes.dismissedInsights}</Row>
            </dl>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

function LogNotice({ log }: { log: LogState }) {
  if (log.status === 'loading') return <p className="text-sm text-muted-foreground">Loading the telemetry log…</p>
  if (log.status === 'unavailable') return <p className="text-sm text-muted-foreground">Not currently measured here. {log.message}</p>
  return null
}

function TimeStudy({ origin }: { origin: Origin }) {
  const [store] = useState(() => createTimingStore(timingStorage))
  const [, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(store.loadError)
  const [mode, setMode] = useState<TimedTask['mode']>('manual')
  const [creatives, setCreatives] = useState('6')
  const [practice, setPractice] = useState(origin === 'test')
  const done = (r: { ok: true } | { ok: false; error: string }) => {
    setError(r.ok ? null : r.error)
    setVersion((v) => v + 1)
  }

  const scopes = timeSaved(store.list(), origin)
  const running = store.list().filter((t) => t.status === 'in_progress')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time saved</CardTitle>
        <CardDescription>
          Median human time for the same task done manually and with the system: select creatives, inspect them, compare evidence and write an experiment proposal. Assisted time includes review and correction.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {scopes.length === 0 ? (
          <p>
            <StatusBadge tone="neutral">Not yet established</StatusBadge> No timed tasks recorded. Time saved needs a measured manual baseline; model latency is not time saved.
          </p>
        ) : (
          scopes.map((s) => (
            <dl key={`${s.deliverable}:${s.creatives}`} className="grid grid-cols-[15rem_1fr] gap-y-1.5">
              <Row label="Task scope">{s.creatives} creatives → one experiment proposal</Row>
              <Row label="Manual (human time)">{dist(s.manual, seconds)}</Row>
              <Row label="Assisted (human time)">{dist(s.assisted, seconds)}</Row>
              <Row label="Assisted (wall clock)" help="Includes waiting on the system. Not human time.">
                {dist(s.assistedElapsed, seconds)}
              </Row>
              <Row label="Time saved">
                {s.result.status === 'established' ? (
                  `${seconds(s.result.savedSeconds)} per task (${s.result.savedPercent.toFixed(0)}% of the manual median)`
                ) : (
                  <>
                    <StatusBadge tone="neutral">Not yet established</StatusBadge> {s.result.reason}
                  </>
                )}
              </Row>
              {(s.abandoned.manual > 0 || s.abandoned.assisted > 0) && (
                <Row label="Abandoned">
                  manual {s.abandoned.manual} · assisted {s.abandoned.assisted}
                </Row>
              )}
            </dl>
          ))
        )}

        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={mode} onValueChange={(v) => v && setMode(v as TimedTask['mode'])} aria-label="Task mode">
            <ToggleGroupItem value="manual">Manual</ToggleGroupItem>
            <ToggleGroupItem value="assisted">Assisted</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-creatives">Creatives</Label>
            <Input id="t-creatives" type="number" min={1} value={creatives} onChange={(e) => setCreatives(e.target.value)} className="h-8 w-20" />
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={practice} onCheckedChange={(v) => setPractice(v === true)} /> Practice run
          </label>
          <Button size="sm" onClick={() => done(store.start({ taskId: crypto.randomUUID(), mode, creatives: Number(creatives), origin: practice ? 'test' : 'live' }))}>
            Start timed task
          </Button>
        </div>

        {running.map((t) => (
          <FinishTask key={t.taskId} task={t} onFinish={(input) => done(store.finish(t.taskId, input))} />
        ))}
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function FinishTask({ task, onFinish }: { task: TimedTask; onFinish: (input: Parameters<ReturnType<typeof createTimingStore>['finish']>[1]) => void }) {
  const [active, setActive] = useState('')
  const [review, setReview] = useState('')
  const [proposal, setProposal] = useState('')
  const minutes = (v: string) => (v.trim() === '' ? null : Number(v))
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/40 p-3">
      <p className="w-full">
        {task.mode === 'manual' ? 'Manual' : 'Assisted'} task, {task.creatives} creatives{task.origin === 'test' ? ' (practice)' : ''}, started {new Date(task.startedAt).toLocaleTimeString()}. When done, enter your own estimate of hands-on minutes.
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`a-${task.taskId}`}>Hands-on minutes</Label>
        <Input id={`a-${task.taskId}`} type="number" min={0} value={active} onChange={(e) => setActive(e.target.value)} className="h-8 w-24" />
      </div>
      {task.mode === 'assisted' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`r-${task.taskId}`}>Review and correction minutes</Label>
          <Input id={`r-${task.taskId}`} type="number" min={0} value={review} onChange={(e) => setReview(e.target.value)} className="h-8 w-24" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`p-${task.taskId}`}>Proposal ID (optional)</Label>
        <Input id={`p-${task.taskId}`} value={proposal} onChange={(e) => setProposal(e.target.value)} className="h-8 w-48" />
      </div>
      <Button size="sm" onClick={() => onFinish({ status: 'completed', activeMinutes: minutes(active), reviewMinutes: minutes(review), proposalId: proposal.trim() || null })}>
        Completed
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onFinish({ status: 'abandoned', activeMinutes: minutes(active), reviewMinutes: minutes(review) })}>
        Abandoned
      </Button>
    </div>
  )
}
