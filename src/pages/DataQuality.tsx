import { useState } from 'react'
import { useDashboard } from '@/app/context'
import { clock, dateRange } from '@/app/format'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog, ProvenanceBadge, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function DataQuality() {
  const d = useDashboard()
  const [confirmReset, setConfirmReset] = useState(false)
  if (!d.data) return null
  const { quality } = d.data.dataset
  const analyses = [...d.analyses.values()]
  const failed = analyses.filter((a) => a.status === 'failed')
  const pending = analyses.filter((a) => a.status === 'pending')
  const weeks = d.weeks
  const issueCount = quality.invalid.length + quality.duplicates.length + quality.creativesWithoutPerformance.length + quality.performanceWithoutCreative.length

  return (
    <AppShell title="Data quality" description="Where the numbers come from, and what was rejected on the way in." filters="none">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Performance</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                <ProvenanceBadge kind="synthetic-performance" /> {d.data.source.label}
              </dd>
              <dt className="text-muted-foreground">Creative assets</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                <ProvenanceBadge kind="public-asset" />
                <span>28 public SNITCH assets: 14 product images verified on snitch.com, 14 ads from a third-party ad directory (partially verified)</span>
              </dd>
              <dt className="text-muted-foreground">Brand provenance</dt>
              <dd>Product images: official SNITCH product pages (snitch.com). Ads: zooptrack ad directory; not confirmed in the Meta Ad Library</dd>
              <dt className="text-muted-foreground">Creative analysis</dt>
              <dd>
                <ProvenanceBadge kind="ai" />
              </dd>
              <dt className="text-muted-foreground">Last successful load</dt>
              <dd>{clock(d.data.loadedAt)}</dd>
              <dt className="text-muted-foreground">Reporting weeks</dt>
              <dd>
                {weeks.length} ({dateRange(weeks[0].start, weeks[weeks.length - 1].end)})
              </dd>
              <dt className="text-muted-foreground">Records processed</dt>
              <dd>{quality.recordsProcessed}</dd>
              <dt className="text-muted-foreground">Attribution</dt>
              <dd>Meta: 7-day click, 1-day view. Google: data-driven. Kept per platform, never merged.</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demo controls</CardTitle>
            <CardDescription>For showing how the dashboard behaves when data changes or fails.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 text-sm">
            <fieldset>
              <legend className="mb-2 font-medium">Export</legend>
              <RadioGroup value={d.exportName} onValueChange={(v) => d.switchExport(v as 'current' | 'next')} className="flex flex-col gap-2">
                <Label className="flex items-start gap-2 font-normal">
                  <RadioGroupItem value="current" className="mt-0.5" />
                  <span>
                    Week ending 25 Oct <span className="block text-xs text-muted-foreground">The original demo export.</span>
                  </span>
                </Label>
                <Label className="flex items-start gap-2 font-normal">
                  <RadioGroupItem value="next" className="mt-0.5" />
                  <span>
                    Week ending 1 Nov
                    <span className="block text-xs text-muted-foreground">Adds a week of synthetic performance. Saved insight snapshots that the new data no longer reproduces become stale.</span>
                  </span>
                </Label>
              </RadioGroup>
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label className="flex items-start gap-2 font-normal">
                <Checkbox checked={d.simulateFailure} onCheckedChange={(c) => d.setSimulateFailure(!!c)} className="mt-0.5" />
                <span>
                  Simulate a failed refresh
                  <span className="block text-xs text-muted-foreground">The next refresh fails. The dashboard should keep the last good data and warn you.</span>
                </span>
              </Label>
              <Button variant="outline" size="sm" className="self-start" onClick={() => void d.refresh()} disabled={d.loading}>
                {d.loading ? 'Refreshing…' : 'Refresh now'}
              </Button>
            </div>
            <div className="border-t pt-4">
              <p className="mb-2">Clear saved proposals, decisions and dismissals in this browser.</p>
              <Button variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>
                Reset demo…
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Data-quality report <StatusBadge tone={issueCount + failed.length ? 'warn' : 'good'}>{issueCount + failed.length} issues</StatusBadge>
            </CardTitle>
            <CardDescription>Rejected and unmatched records are excluded from every metric. Nothing is merged silently.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Issues title="Invalid records (excluded)">
              {quality.invalid.map((i) => (
                <li key={`${i.kind}-${i.index}`}>
                  <strong>
                    {i.kind} #{i.index}
                    {i.id ? ` (${i.id})` : ''}
                  </strong>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {i.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </Issues>
            <Issues title="Duplicates (first kept, rest dropped)">
              {quality.duplicates.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </Issues>
            <Issues title="Creatives with no performance data">
              {quality.creativesWithoutPerformance.map((x) => (
                <li key={x}>
                  <a href={d.href(`creatives/${x}`)} className="underline-offset-2 hover:underline">
                    {x}
                  </a>
                </li>
              ))}
            </Issues>
            <Issues title="Performance with no matching creative (excluded)">
              {quality.performanceWithoutCreative.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </Issues>
            <Issues title="Failed creative analyses">
              {failed.map((a) =>
                a.status === 'failed' ? (
                  <li key={a.creativeId}>
                    <a href={d.href(`creatives/${a.creativeId}`)} className="font-medium underline-offset-2 hover:underline">
                      {a.creativeId}
                    </a>
                    <ul className="ml-4 list-disc text-muted-foreground">
                      {a.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ) : null,
              )}
            </Issues>
            <Issues title="Analyses not yet run">
              {pending.map((a) => (
                <li key={a.creativeId}>{a.creativeId}</li>
              ))}
            </Issues>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description="This clears every saved proposal, decision and dismissal in this browser. It can’t be undone."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          d.resetDemo()
          return { ok: true }
        }}
      />
    </AppShell>
  )
}

function Issues({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : <ul className="flex flex-col gap-1.5 text-sm">{children}</ul>}
    </div>
  )
}
