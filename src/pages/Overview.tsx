import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { dateRange, percent, shortDate } from '@/app/format'
import type { Proposal } from '@/domain/experiments'
import { peerComparison, rankCreatives, type AttentionItem, type AttentionKind } from '@/domain/review'
import { AppShell } from '@/components/AppShell'
import { WeeklyLineChart } from '@/components/charts'
import { AnalysisBadge, CreativeThumb, EmptyState, InfoTip, MetricValue, ProposalStatusBadge, StaleBadge, StatusBadge } from '@/components/common'
import { metricOf, metrics, type MetricKey } from '@/components/metricConfig'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Creatives below this spend are not ranked: too little delivery to compare. */
export const MIN_RANKING_SPEND = 2000

const summaryKeys = ['spend', 'conversions', 'ctr', 'roas'] as const
const chartKeys = ['spend', 'conversions', 'ctr', 'roas'] as const

export function Overview() {
  const d = useDashboard()
  const { insightView: view, filters } = d
  if (!view || !filters) return null

  const prev = d.previous?.period ?? null
  const previous = d.previous?.view ?? null

  return (
    <AppShell title="Overview" description={`SNITCH Creative Intelligence · 28 public brand assets · ${dateRange(filters.from, filters.to)}`} filters="period">
      {view.rows.every((r) => r.counts === null) ? (
        <EmptyState
          title="No performance records in this period"
          body="Choose a longer reporting period or include both platforms."
          action={<Button variant="outline" onClick={() => d.setParams({ platform: null, from: null, to: null })}>Reset period and platform</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3.5 py-2 text-xs">
            <span className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Public SNITCH assets:</span>
              <span className="text-muted-foreground">14 product images (verified on snitch.com) + 14 ads (third-party ad directory, partially verified)</span>
            </span>
            <span className="text-muted-foreground">
              Campaign metrics: <span className="font-medium text-foreground">Synthetic demo data</span>
            </span>
          </div>

          <section aria-label="Summary metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryKeys.map((k) => (
              <MetricCard
                key={k}
                metric={k}
                value={metricOf({ counts: view.totals.counts, metrics: view.totals.metrics }, k)}
                previous={previous ? metricOf({ counts: previous.totals.counts, metrics: previous.totals.metrics }, k) : null}
                previousLabel={prev ? dateRange(prev.from, prev.to) : null}
                note={k === 'roas' && view.totals.revenueUntrackedCreativeIds.length > 0 ? `Excludes spend from ${view.totals.revenueUntrackedCreativeIds.join(', ')} (no revenue tracking).` : undefined}
              />
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <RecommendedNextAction />
            <AttentionQueue />
          </div>

          <PerformanceChart />

          <div className="grid gap-4 lg:grid-cols-2">
            <TopCreativesList />
            <RecentExperiments />
          </div>
        </div>
      )}
    </AppShell>
  )
}

function MetricCard({ metric, value, previous, previousLabel, note }: { metric: MetricKey; value: number | null; previous: number | null; previousLabel: string | null; note?: string }) {
  const def = metrics[metric]
  const change = value !== null && previous !== null && previous !== 0 ? (value - previous) / previous : null
  const isPositive = change !== null && change > 0
  const isNegative = change !== null && change < 0

  return (
    <Card size="sm" className="relative overflow-hidden transition-all hover:border-foreground/25">
      <CardHeader className="pb-1.5">
        <div className="flex items-center justify-between">
          <CardDescription className="flex items-center gap-1.5 font-medium">
            {def.label} <InfoTip text={def.help} label={`What is ${def.label}?`} />
          </CardDescription>
          {change !== null && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular',
                isPositive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : isNegative ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-muted text-muted-foreground'
              )}
              title={`Compared with ${previousLabel}`}
            >
              {isPositive ? '+' : ''}{(change * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight mt-1">
          <MetricValue value={value} format={def.format} unavailableReason={def.unavailable} />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground pt-0">
        {change !== null ? (
          <span className="text-[11px] text-muted-foreground">vs previous period</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">No previous period to compare</span>
        )}
        {note && <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-400">{note}</p>}
      </CardContent>
    </Card>
  )
}

const attentionAction: Record<AttentionKind, string> = {
  review_proposal: 'Review proposal',
  investigate_creative: 'Inspect creative',
  insufficient_evidence: 'Inspect why',
  data_quality: 'Open report',
  failed_analysis: 'View creative',
}

function useAttentionLink() {
  const d = useDashboard()
  return (item: AttentionItem): string => {
    switch (item.kind) {
      case 'review_proposal':
        return d.href('experiments', { proposal: item.targetId! })
      case 'investigate_creative':
      case 'failed_analysis':
        return d.href(`creatives/${item.targetId}`)
      case 'insufficient_evidence':
        return d.href('insights', { tab: 'insufficient' })
      case 'data_quality':
        return d.href('data-quality')
    }
  }
}

/** One recommendation, chosen by explicit rules from the attention queue. */
function RecommendedNextAction() {
  const d = useDashboard()
  const link = useAttentionLink()
  const item = d.review?.recommended
  if (!item) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recommended next action</CardTitle>
          <CardDescription>Nothing needs a decision right now. All proposals are reviewed and all creatives meet performance targets.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const proposal = item.kind === 'review_proposal' ? d.experiments.list.find((p) => p.proposalId === item.targetId) : undefined
  const peers = item.kind === 'investigate_creative' && d.insightView ? peerComparison(d.insightView.rows, item.targetId!) : null
  const snapshot = proposal?.source.insight
  const freshness = snapshot ? d.freshnessOf(snapshot) : null

  return (
    <Card className="border-primary/30 shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Recommended Action</span>
            <StatusBadge tone={item.kind === 'review_proposal' ? 'info' : 'warn'}>
              {kindLabel[item.kind]}
            </StatusBadge>
          </div>
          {freshness?.stale && <StaleBadge reason={freshness.reason} />}
        </div>
        <CardTitle className="text-lg font-semibold pt-1">{item.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-foreground/90">{item.detail}</p>
        {snapshot && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Evidence: </span>
            {percent(snapshot.evidence.group.value)} vs {percent(snapshot.evidence.comparison.value)} CTR ({snapshot.evidence.group.creativeIds.length} vs {snapshot.evidence.comparison.creativeIds.length} creatives)
          </div>
        )}
        {peers && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Evidence: </span>
            ROAS {metrics.roas.format(peers.roas.creative ?? 0)} vs {peers.roas.peers === null ? '—' : metrics.roas.format(peers.roas.peers)} platform benchmark ({peers.peerIds.length} peer creatives)
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href={link(item)}>
              {attentionAction[item.kind]} <ArrowRight className="ml-1 size-3.5" aria-hidden />
            </a>
          </Button>
          {snapshot && (
            <Button asChild variant="outline" size="sm">
              <a href={d.href('insights', { insight: snapshot.insightId })}>Inspect evidence</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const kindLabel: Record<AttentionKind, string> = {
  review_proposal: 'Decision needed',
  investigate_creative: 'Investigate',
  insufficient_evidence: 'Insufficient evidence',
  data_quality: 'Data quality',
  failed_analysis: 'Failed analysis',
}

function AttentionQueue() {
  const d = useDashboard()
  const link = useAttentionLink()
  const items = d.review?.attention ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>{items.length === 0 ? 'Nothing needs attention for this selection.' : `${items.length} items, most important first`}</CardDescription>
      </CardHeader>
      {items.length > 0 && (
        <CardContent>
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={`${item.kind}:${item.targetId}`} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                  <span className="mt-1 inline-block">
                    <StatusBadge tone={item.kind === 'review_proposal' ? 'info' : item.kind === 'investigate_creative' ? 'warn' : 'neutral'}>{kindLabel[item.kind]}</StatusBadge>
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a href={link(item)}>{attentionAction[item.kind]}</a>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}

function PerformanceChart() {
  const d = useDashboard()
  const [metric, setMetric] = useState<(typeof chartKeys)[number]>('ctr')
  const view = d.insightView!
  const def = metrics[metric]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{def.label} by week</CardTitle>
        <CardDescription>
          {view.trend.length} reporting weeks · all creatives in view · {def.help}
        </CardDescription>
        <CardAction>
          <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
            <SelectTrigger size="sm" aria-label="Chart metric" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chartKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {metrics[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        {view.trend.length < 2 ? (
          <p className="text-sm text-muted-foreground">A trend needs at least two reporting weeks. Choose a longer period to see one.</p>
        ) : (
          <WeeklyLineChart
            rows={view.trend.map((t) => ({ periodStart: t.periodStart, value: t[metric] }))}
            series={[{ key: 'value', label: def.label }]}
            format={(v) => (v === null ? '—' : def.format(v))}
            caption={`${def.label} per reporting week, ${shortDate(view.trend[0].periodStart)} to ${shortDate(view.trend[view.trend.length - 1].periodStart)}`}
          />
        )}
      </CardContent>
    </Card>
  )
}

function TopCreativesList() {
  const d = useDashboard()
  const ranked = rankCreatives(d.insightView!.rows, 'roas', MIN_RANKING_SPEND).slice(0, 5)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top creatives by ROAS</CardTitle>
        <CardDescription>Top performers with spend ≥ ₹{MIN_RANKING_SPEND.toLocaleString('en-IN')}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <a href={d.href('library', { sort: 'roas:desc' })}>View all</a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No creative has enough spend and revenue data to rank.</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {ranked.map((r) => (
              <li key={r.creative.creativeId}>
                <a href={d.href(`creatives/${r.creative.creativeId}`)} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                  <CreativeThumb creative={r.creative} className="w-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.creative.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {r.creative.platform === 'meta' ? 'Meta' : 'Google'} · {r.creative.format}
                      <AnalysisBadge status={d.analyses.get(r.creative.creativeId)?.status} />
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block font-semibold tabular">{metrics.roas.format(r.metrics.roas!)}</span>
                    <span className="text-xs text-muted-foreground tabular">CTR {r.metrics.ctr === null ? '—' : metrics.ctr.format(r.metrics.ctr)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function latestResult(p: Proposal): string {
  if (!p.outcome) return 'Not recorded'
  if (p.outcome.verdict === 'not_run') return 'Not run'
  return `${p.outcome.verdict[0].toUpperCase()}${p.outcome.verdict.slice(1)}`
}

function RecentExperiments() {
  const d = useDashboard()
  const recent = [...d.experiments.list].sort((a, b) => (b.history.at(-1)?.at ?? '').localeCompare(a.history.at(-1)?.at ?? '')).slice(0, 5)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent experiment activity</CardTitle>
        <CardDescription>Track proposals and test outcomes</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <a href={d.href('experiments')}>View all</a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposals yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {recent.map((p) => (
              <li key={p.proposalId}>
                <a href={d.href('experiments', { proposal: p.proposalId })} className="flex items-center justify-between gap-3 py-2 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.title || 'Untitled draft'}</span>
                    <span className="text-xs text-muted-foreground">Result: {latestResult(p)}</span>
                  </span>
                  <ProposalStatusBadge status={p.status} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
