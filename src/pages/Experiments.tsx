import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { clock, dateRange, percent } from '@/app/format'
import { missingFields, type EditableFields, type MetricKey, type OutcomeInput, type Proposal, type ProposalStatus, type Verdict } from '@/domain/experiments'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog, EmptyState, ProposalStatusBadge, proposalStatusMeta, ProvenanceBadge, StaleBadge } from '@/components/common'
import { metrics } from '@/components/metricConfig'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

const tabs: (ProposalStatus | 'all')[] = ['needs_review', 'draft', 'approved', 'completed', 'not_run', 'rejected', 'all']
const metricKeys: MetricKey[] = ['ctr', 'cpa', 'roas', 'conversionRate']

const nextAction: Record<ProposalStatus, string> = {
  draft: 'Complete and submit',
  needs_review: 'Approve, reject or request edits',
  approved: 'Record outcome',
  rejected: 'Reopen or leave',
  completed: 'None',
  not_run: 'None',
}

function sourceLabel(p: Proposal): string {
  if (p.source.insight) return p.source.insight.title
  if (p.source.creativeIds.length) return `From creative ${p.source.creativeIds.join(', ')}`
  return 'Manual proposal'
}

const checkText = {
  'favours variant': 'the entered values favour the variant',
  'favours control': 'the entered values favour the control',
  'no difference': 'the entered values show no difference',
  'not comparable': 'the entered values can’t be compared',
} as const

const lastUpdated = (p: Proposal) => p.history.at(-1)?.at ?? ''

export function Experiments() {
  const d = useDashboard()
  const [creating, setCreating] = useState(false)
  const tab = (d.route.params.get('tab') as ProposalStatus | 'all' | null) ?? 'needs_review'
  const list = d.experiments.list
  const shown = [...(tab === 'all' ? list : list.filter((p) => p.status === tab))].sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a)))

  return (
    <AppShell
      title="Experiments"
      description="Track, review, and decide on creative test proposals."
      filters="none"
      action={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden /> New proposal
        </Button>
      }
    >
      {d.experiments.loadError && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{d.experiments.loadError}</p>}
      <Tabs value={tab} onValueChange={(v) => d.setParams({ tab: v === 'needs_review' ? null : v })} className="mb-4 max-w-full overflow-x-auto">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t === 'all' ? 'All' : proposalStatusMeta[t].label} ({t === 'all' ? list.length : list.filter((p) => p.status === t).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <EmptyState
          title={tab === 'needs_review' ? 'Nothing needs review' : 'No proposals here'}
          body="Proposals appear when an insight clears the evidence bar, or when you draft one from an insight, a creative, or New proposal."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proposal</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.proposalId}>
                  <TableCell className="max-w-sm whitespace-normal">
                    <button type="button" onClick={() => d.setParams({ proposal: p.proposalId })} className="text-left font-medium hover:underline">
                      {p.title || 'Untitled draft'}
                    </button>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{p.hypothesis || 'No hypothesis yet'}</p>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={sourceLabel(p)}>
                    {sourceLabel(p)}
                  </TableCell>
                  <TableCell>{metrics[p.primaryMetric].label}</TableCell>
                  <TableCell>
                    <ProposalStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{lastUpdated(p) ? clock(new Date(lastUpdated(p))) : '—'}</TableCell>
                  <TableCell className="text-xs">{nextAction[p.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewProposalDialog open={creating} onOpenChange={setCreating} />
      <ExperimentReviewSheet />
    </AppShell>
  )
}

function NewProposalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const d = useDashboard()
  const [key, setKey] = useState(() => crypto.randomUUID())
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setKey(crypto.randomUUID())
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New proposal</DialogTitle>
          <DialogDescription>Saved as a draft. It can be incomplete now, but needs every required field before review.</DialogDescription>
        </DialogHeader>
        <ProposalForm
          initial={{}}
          submitLabel="Save draft"
          onCancel={() => onOpenChange(false)}
          onSave={(fields) => {
            const result = d.experiments.createDraft(fields, key)
            if (!result.ok) return result
            onOpenChange(false)
            d.setParams({ proposal: result.proposalId, tab: 'draft' })
            return { ok: true }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ExperimentReviewSheet() {
  const d = useDashboard()
  const id = d.route.params.get('proposal')
  const p = id ? d.experiments.list.find((x) => x.proposalId === id) : undefined
  const editing = d.route.params.get('edit') === '1'
  const [recording, setRecording] = useState(false)
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject' | 'requestEdits' | 'reopen'>(null)
  const [error, setError] = useState<string | null>(null)
  const freshness = p?.source.insight ? d.freshnessOf(p.source.insight) : null
  const close = () => {
    setRecording(false)
    setError(null)
    d.setParams({ proposal: null, edit: null })
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && close()}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {!p ? (
          <SheetHeader>
            <SheetTitle>Proposal not found</SheetTitle>
            <SheetDescription>It may have been cleared by a demo reset.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 leading-snug">{p.title || 'Untitled draft'}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5">
                <ProposalStatusBadge status={p.status} />
                {freshness?.stale && <StaleBadge reason={freshness.reason} />}
                <span>Proposal record only: nothing here runs a campaign.</span>
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-8 text-sm">
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                  {error}
                </p>
              )}
              {freshness?.stale && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  The source insight is stale: {freshness.reason} The evidence below is the snapshot saved when the proposal was created.
                </p>
              )}

              {editing && (p.status === 'draft' || p.status === 'needs_review') ? (
                <>
                  {p.status === 'needs_review' && <p className="text-xs text-muted-foreground">Saving changes returns this proposal to Draft; submit it again for review.</p>}
                  <ProposalForm
                    key={p.proposalId}
                    initial={p}
                    submitLabel="Save changes"
                    onCancel={() => d.setParams({ edit: null })}
                    onSave={(fields) => {
                      const r = d.experiments.edit(p.proposalId, fields)
                      if (r.ok) d.setParams({ edit: null })
                      return r
                    }}
                  />
                </>
              ) : recording ? (
                <OutcomeForm
                  proposal={p}
                  onCancel={() => setRecording(false)}
                  onSave={(input) => {
                    const r = d.experiments.recordOutcome(p.proposalId, input)
                    if (r.ok) setRecording(false)
                    return r
                  }}
                />
              ) : (
                <>
                  <ProposalDetails p={p} />
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {p.status === 'draft' && (
                      <>
                        <Button
                          onClick={() => {
                            const r = d.experiments.submit(p.proposalId)
                            setError(r.ok ? null : r.error)
                          }}
                        >
                          Submit for review
                        </Button>
                        <Button variant="outline" onClick={() => d.setParams({ edit: '1' })}>
                          Edit
                        </Button>
                      </>
                    )}
                    {p.status === 'needs_review' && (
                      <>
                        <Button onClick={() => setConfirm('approve')}>Approve proposal</Button>
                        <Button variant="destructive" onClick={() => setConfirm('reject')}>
                          Reject
                        </Button>
                        <Button variant="outline" onClick={() => setConfirm('requestEdits')}>
                          Request edits
                        </Button>
                        <Button variant="ghost" onClick={() => d.setParams({ edit: '1' })}>
                          Edit
                        </Button>
                      </>
                    )}
                    {p.status === 'approved' && <Button onClick={() => setRecording(true)}>Record outcome</Button>}
                    {p.status === 'rejected' && (
                      <Button variant="outline" onClick={() => setConfirm('reopen')}>
                        Reopen as draft
                      </Button>
                    )}
                    {p.status === 'draft' && missingFields(p).length > 0 && (
                      <p className="w-full text-xs text-muted-foreground">Required before review: {missingFields(p).join(', ')}.</p>
                    )}
                  </div>
                  <DecisionHistory p={p} />
                </>
              )}
            </div>

            <ConfirmDialog
              open={confirm === 'approve'}
              onOpenChange={(o) => !o && setConfirm(null)}
              title="Approve this proposal?"
              description="This records the team’s acceptance of the proposal. It does not launch an ad, change a budget or modify any Meta or Google campaign."
              confirmLabel="Approve"
              reason={{ label: 'Rationale', required: false }}
              onConfirm={(r) => d.experiments.approve(p.proposalId, r)}
            />
            <ConfirmDialog
              open={confirm === 'reject'}
              onOpenChange={(o) => !o && setConfirm(null)}
              title="Reject this proposal?"
              description="It stays on record with your reason, and can be reopened as a draft later."
              confirmLabel="Reject"
              destructive
              reason={{ label: 'Reason', required: true }}
              onConfirm={(r) => d.experiments.reject(p.proposalId, r)}
            />
            <ConfirmDialog
              open={confirm === 'requestEdits'}
              onOpenChange={(o) => !o && setConfirm(null)}
              title="Request edits?"
              description="The proposal goes back to Draft with your note."
              confirmLabel="Request edits"
              reason={{ label: 'What needs to change', required: true }}
              onConfirm={(r) => d.experiments.requestEdits(p.proposalId, r)}
            />
            <ConfirmDialog
              open={confirm === 'reopen'}
              onOpenChange={(o) => !o && setConfirm(null)}
              title="Reopen as a draft?"
              description="The rejection stays in the decision history."
              confirmLabel="Reopen"
              onConfirm={() => d.experiments.reopen(p.proposalId)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ProposalDetails({ p }: { p: Proposal }) {
  const d = useDashboard()
  const snap = p.source.insight
  const field = (label: string, value: React.ReactNode, wide = false) => (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 leading-relaxed">{value || <span className="text-muted-foreground">Not set</span>}</dd>
    </div>
  )
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {field('Hypothesis', p.hypothesis, true)}
      {field(
        'Source',
        snap ? (
          <>
            <a href={d.href('insights', { insight: snap.insightId })} className="underline-offset-2 hover:underline">
              {snap.title}
            </a>
            <span className="block text-xs text-muted-foreground">
              Snapshot: {percent(snap.evidence.group.value)} vs {percent(snap.evidence.comparison.value)} CTR, n = {snap.evidence.group.creativeIds.length} vs {snap.evidence.comparison.creativeIds.length},{' '}
              {dateRange(snap.period.from, snap.period.to)}. <ProvenanceBadge kind="demo-finding" />
            </span>
          </>
        ) : (
          sourceLabel(p)
        ),
        true,
      )}
      {p.source.creativeIds.length > 0 &&
        field(
          'Creatives',
          <span className="flex flex-wrap gap-1">
            {p.source.creativeIds.map((id) => (
              <a key={id} href={d.href(`creatives/${id}`)} className="rounded border px-1.5 py-0.5 text-xs hover:underline">
                {id}
              </a>
            ))}
          </span>,
          true,
        )}
      {field('Control', p.control)}
      {field('Variant', p.variant)}
      {field('Variable to change', p.variablesChanged.join(', '))}
      {field('Keep constant', p.variablesConstant.join(', '))}
      {field('Primary metric', `${metrics[p.primaryMetric].label}: ${metrics[p.primaryMetric].help}`)}
      {field('Guardrails (must not worsen materially)', p.guardrailMetrics.map((g) => metrics[g].label).join(', '))}
      {field('Success criteria', p.successCriteria, true)}
      {p.notes && field('Notes', p.notes, true)}
      {p.outcome &&
        field(
          'Outcome',
          <>
            <strong className="capitalize">{p.outcome.verdict.replace('_', ' ')}</strong>
            {p.outcome.verdict !== 'not_run' && (
              <span className="block text-xs text-muted-foreground">
                Control {p.outcome.controlValue ?? '—'} → variant {p.outcome.variantValue ?? '—'} · source: {p.outcome.resultSource}
              </span>
            )}
            {p.outcome.verdict !== 'not_run' && (
              <span className="block text-xs">
                System check: {checkText[p.outcome.check]}.
                {p.outcome.disagrees && <strong className="text-amber-800"> This disagrees with the recorded verdict.</strong>}
              </span>
            )}
            {p.outcome.notes && <span className="mt-1 block">“{p.outcome.notes}”</span>}
          </>,
          true,
        )}
    </dl>
  )
}

function DecisionHistory({ p }: { p: Proposal }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Decision history</h3>
      <ol className="flex flex-col gap-2 border-l pl-4">
        {[...p.history].reverse().map((h, i) => (
          <li key={i} className="text-xs">
            <span className="font-medium capitalize">{h.type.replace('_', ' ')}</span>
            {h.from && (
              <span className="text-muted-foreground">
                {' '}
                · {proposalStatusMeta[h.from].label} → {proposalStatusMeta[h.to].label}
              </span>
            )}
            <span className="block text-muted-foreground">
              {h.actor}, {clock(new Date(h.at))}
            </span>
            {h.reason && <span className="block">“{h.reason}”</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

type FormResult = { ok: true } | { ok: false; error: string }

function ProposalForm({ initial, submitLabel, onSave, onCancel }: { initial: Partial<Proposal>; submitLabel: string; onSave: (f: EditableFields) => FormResult; onCancel: () => void }) {
  const [f, setF] = useState({
    title: initial.title ?? '',
    hypothesis: initial.hypothesis ?? '',
    control: initial.control ?? '',
    variant: initial.variant ?? '',
    variablesChanged: (initial.variablesChanged ?? []).join(', '),
    variablesConstant: (initial.variablesConstant ?? []).join(', '),
    primaryMetric: initial.primaryMetric ?? ('ctr' as MetricKey),
    guardrailMetrics: initial.guardrailMetrics ?? (['cpa', 'roas'] as MetricKey[]),
    successCriteria: initial.successCriteria ?? '',
    notes: initial.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const text = (key: 'title' | 'hypothesis' | 'control' | 'variant' | 'variablesChanged' | 'variablesConstant' | 'successCriteria' | 'notes', label: string, multiline = false, required = true) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`f-${key}`}>
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {multiline ? (
        <Textarea id={`f-${key}`} rows={3} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      ) : (
        <Input id={`f-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      )}
    </div>
  )
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const r = onSave({ ...f, variablesChanged: list(f.variablesChanged), variablesConstant: list(f.variablesConstant) })
        setError(r.ok ? null : r.error)
      }}
    >
      {text('title', 'Name')}
      {text('hypothesis', 'Hypothesis', true)}
      <div className="grid gap-3 sm:grid-cols-2">
        {text('control', 'Control')}
        {text('variant', 'Variant')}
        {text('variablesChanged', 'Variable to change', false, false)}
        {text('variablesConstant', 'Keep constant (comma-separated)', false, false)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-metric">Primary metric</Label>
          <Select value={f.primaryMetric} onValueChange={(v) => setF({ ...f, primaryMetric: v as MetricKey })}>
            <SelectTrigger id="f-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metricKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {metrics[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Guardrail metrics</legend>
          <div className="flex flex-wrap gap-3">
            {metricKeys
              .filter((k) => k !== f.primaryMetric)
              .map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={f.guardrailMetrics.includes(k)}
                    onCheckedChange={(c) => setF({ ...f, guardrailMetrics: c ? [...f.guardrailMetrics, k] : f.guardrailMetrics.filter((g) => g !== k) })}
                  />
                  {metrics[k].label}
                </label>
              ))}
          </div>
        </fieldset>
      </div>
      {text('successCriteria', 'Success criteria', true)}
      {text('notes', 'Notes', true, false)}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function OutcomeForm({ proposal, onSave, onCancel }: { proposal: Proposal; onSave: (i: OutcomeInput) => FormResult; onCancel: () => void }) {
  const [verdict, setVerdict] = useState<Verdict>('inconclusive')
  const [control, setControl] = useState('')
  const [variant, setVariant] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const notRun = verdict === 'not_run'
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const r = onSave({ verdict, controlValue: notRun ? null : num(control), variantValue: notRun ? null : num(variant), resultSource: notRun ? '' : source, notes })
        setError(r.ok ? null : r.error)
      }}
    >
      <p className="text-muted-foreground">Record what happened outside this tool. Don’t enter results you don’t have; choose “Not run” if the test didn’t happen.</p>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Outcome</legend>
        <RadioGroup value={verdict} onValueChange={(v) => setVerdict(v as Verdict)} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['won', 'lost', 'inconclusive', 'not_run'] as Verdict[]).map((v) => (
            <Label key={v} className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal capitalize">
              <RadioGroupItem value={v} /> {v.replace('_', ' ')}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      {!notRun && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="o-control">
                Control {metrics[proposal.primaryMetric].label} <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="o-control" type="number" step="any" min="0" value={control} onChange={(e) => setControl(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="o-variant">
                Variant {metrics[proposal.primaryMetric].label} <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="o-variant" type="number" step="any" min="0" value={variant} onChange={(e) => setVariant(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="o-source">Result source</Label>
            <Input id="o-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Meta Ads Manager export, 3 Nov" />
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="o-notes">
          {notRun ? 'Why wasn’t it run?' : 'Interpretation and notes'}
          {!notRun && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        <Textarea id="o-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Recorded with today’s date as your decision. The system will compare the values you enter with the hypothesis, but your verdict stands.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Save outcome</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
