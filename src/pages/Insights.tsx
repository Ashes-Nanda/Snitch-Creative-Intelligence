import { useState } from 'react'
import { Info, TrendingUp } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { clock, count, dateRange, percent } from '@/app/format'
import { attributeNames, MIN_CREATIVES_PER_GROUP, MIN_RELATIVE_DIFFERENCE, OVERLAP_THRESHOLD, type Insight } from '@/domain/insights'
import { AnalysisConfigNotice } from '@/components/AnalysisControl'
import { AppShell } from '@/components/AppShell'
import { observedPatterns, type ObservedHypothesis } from '@/domain/patterns'
import { GroupComparison } from '@/components/charts'
import { ConfirmDialog, EmptyState, EvidenceBadge, ProposalStatusBadge, ProvenanceBadge, StaleBadge, StatusBadge } from '@/components/common'
import { metrics } from '@/components/metricConfig'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const platformName = { meta: 'Meta Ads', google: 'Google Ads' } as const

export function Insights() {
  const d = useDashboard()
  if (!d.insightView || !d.filters) return null
  const tab = d.route.params.get('tab') ?? 'patterns'
  const open = d.insights.filter((i) => !d.dismissals.get(i.insightId))

  return (
    <AppShell title="Insights" description="What the public creatives show, and patterns worth testing. Observations, AI interpretations and synthetic performance are kept apart.">
      <AnalysisConfigNotice />
      <ObservedPatternsSection />
      <h2 className="mb-2 mt-6 flex flex-wrap items-center gap-2 text-base font-semibold">
        Performance patterns <ProvenanceBadge kind="synthetic-performance" /> <ProvenanceBadge kind="demo-finding" />
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        These compare synthetic demo metrics (not real SNITCH results) across AI-analysed creatives. They exist to show the workflow and say nothing about real campaigns.
      </p>
      <Tabs value={tab} onValueChange={(v) => d.setParams({ tab: v === 'patterns' ? null : v })} className="mb-4">
        <TabsList>
          <TabsTrigger value="patterns">Patterns ({open.length})</TabsTrigger>
          <TabsTrigger value="insufficient">Insufficient evidence ({d.suppressed.length})</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed ({d.dismissals.all.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>Patterns compare CTR within a single platform (minimum {MIN_CREATIVES_PER_GROUP} creatives per group and &ge; {MIN_RELATIVE_DIFFERENCE * 100}% difference).</span>
      </div>

      {tab === 'patterns' &&
        (open.length === 0 ? (
          <EmptyState title="No pattern clears the evidence bar for this selection" body="That is a valid result. Try a longer reporting period, or see what was held back under Insufficient evidence." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map((i) => (
              <InsightCard key={i.insightId} insight={i} />
            ))}
          </div>
        ))}

      {tab === 'insufficient' &&
        (d.suppressed.length === 0 ? (
          <EmptyState title="Nothing held back" body="Every candidate pattern either cleared the evidence bar or showed no meaningful difference." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.suppressed.map((s) => (
              <Card key={`${s.platform}:${s.attribute}:${s.value}`} size="sm">
                <CardHeader>
                  <CardTitle>
                    {attributeNames[s.attribute]}: “{s.value}” on {platformName[s.platform]}
                  </CardTitle>
                  <CardAction>
                    <EvidenceBadge level="insufficient" />
                  </CardAction>
                  <CardDescription>{s.reason}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Next step: collect more evidence. Run more creatives with this attribute before drawing a conclusion.</CardContent>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'dismissed' && <DismissedList />}

      <InsightDetailSheet />
    </AppShell>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const d = useDashboard()
  const [dismissing, setDismissing] = useState(false)
  const [draftKey] = useState(() => `${insight.insightId}:${crypto.randomUUID()}`)
  const proposal = d.experiments.list.find((p) => p.source.insight?.insightId === insight.insightId)
  const level = d.levels.get(insight.insightId)!
  const { group, comparison } = insight.evidence
  const overlapping = (d.overlaps.get(insight.insightId) ?? []).map((id) => d.insights.find((i) => i.insightId === id)?.title).filter(Boolean)
  const relativePercent = Math.round(insight.evidence.relativeDifference * 100)

  const draft = () => {
    const result = d.experiments.createDraft({ sourceInsight: insight }, draftKey)
    if (result.ok) d.navigate('experiments', { proposal: result.proposalId, edit: '1' })
  }

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold leading-snug">{insight.title}</CardTitle>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="size-3" aria-hidden />
              +{relativePercent}% CTR
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <EvidenceBadge level={level} />
            <StatusBadge tone="neutral">
              n = {group.creativeIds.length} vs {comparison.creativeIds.length} creatives
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 text-sm">
          <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Performance: </span>
            <span className="font-medium text-foreground">{percent(group.value)}</span> vs {percent(comparison.value)} baseline CTR ({dateRange(insight.period.from, insight.period.to)})
          </div>
          {overlapping.length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-400">
              Note: creatives overlap with “{overlapping.join('”, “')}”.
            </p>
          )}
        </CardContent>
      </div>
      <CardFooter className="flex flex-wrap gap-2">
        {proposal ? (
          <Button asChild>
            <a href={d.href('experiments', { proposal: proposal.proposalId })}>View proposal</a>
          </Button>
        ) : (
          <Button onClick={draft}>Draft experiment</Button>
        )}
        <Button variant="outline" onClick={() => d.setParams({ insight: insight.insightId })}>
          Inspect evidence
        </Button>
        {proposal && <ProposalStatusBadge status={proposal.status} />}
        <Button variant="ghost" className="ml-auto" onClick={() => setDismissing(true)}>
          Dismiss
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={dismissing}
        onOpenChange={setDismissing}
        title="Dismiss this insight?"
        description="It moves to the Dismissed tab with your reason. Nothing is deleted, and you can restore it."
        confirmLabel="Dismiss"
        reason={{ label: 'Reason', required: true, placeholder: 'e.g. Confounded with product-first; not worth a separate test' }}
        onConfirm={(reason) => d.dismissals.dismiss(insight, reason)}
      />
    </Card>
  )
}

function DismissedList() {
  const d = useDashboard()
  const all = d.dismissals.all
  if (all.length === 0) return <EmptyState title="Nothing dismissed" body="Dismissed insights appear here with the reason, and can be restored." />
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {all.map((x) => {
        const freshness = d.freshnessOf(x.snapshot)
        return (
          <Card key={x.insightId} size="sm">
            <CardHeader>
              <CardTitle>{x.snapshot.title}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                <StatusBadge tone="neutral">Dismissed</StatusBadge>
                {freshness.stale && <StaleBadge reason={freshness.reason} />}
                <ProvenanceBadge kind="human" />
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <p>“{x.reason}”</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {x.actor}, {clock(new Date(x.at))}. Snapshot from {dateRange(x.snapshot.period.from, x.snapshot.period.to)}.
                {freshness.stale && ` ${freshness.reason}`}
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => d.dismissals.restore(x.insightId)}>
                Restore
              </Button>
              <Button variant="ghost" size="sm" onClick={() => d.setParams({ insight: x.insightId })}>
                Inspect evidence
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

/** Full evidence for one insight. Falls back to a saved snapshot when the current filters don't produce it. */
function InsightDetailSheet() {
  const d = useDashboard()
  const id = d.route.params.get('insight')
  const live = id ? d.insights.find((i) => i.insightId === id) : undefined
  const saved = id ? (d.experiments.list.find((p) => p.source.insight?.insightId === id)?.source.insight ?? d.dismissals.get(id)?.snapshot) : undefined
  const insight = live ?? saved
  const freshness = !live && saved ? d.freshnessOf(saved) : null
  const creatives = new Map(d.data!.dataset.creatives.map((c) => [c.creativeId, c]))
  const inView = new Set(d.insightView?.rows.map((r) => r.creative.creativeId))
  const excluded = [...inView].filter((cid) => {
    const r = d.insightView!.rows.find((x) => x.creative.creativeId === cid)!
    return insight && r.creative.platform === insight.platform && (!d.completedAnalyses.has(cid) || r.counts === null)
  })

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && d.setParams({ insight: null })}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {!insight ? (
          <SheetHeader>
            <SheetTitle>Insight not available</SheetTitle>
            <SheetDescription>This pattern doesn’t appear with the current filters, and no saved snapshot exists.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="leading-snug">{insight.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5">
                {live ? <EvidenceBadge level={d.levels.get(insight.insightId)!} /> : <StatusBadge tone="neutral">Saved snapshot</StatusBadge>}
                {freshness?.stale && <StaleBadge reason={freshness.reason} />}
                <ProvenanceBadge kind="demo-finding" />
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
              {!live && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Showing the evidence as it was saved. {freshness?.stale ? freshness.reason : 'It isn’t produced by the current filters; widen the period to see it live.'}
                </p>
              )}
              <section>
                <h3 className="mb-2 font-medium">Comparison</h3>
                <GroupComparison
                  group={{ label: insight.evidence.group.label, value: insight.evidence.group.value, n: insight.evidence.group.creativeIds.length }}
                  comparison={{ label: insight.evidence.comparison.label, value: insight.evidence.comparison.value, n: insight.evidence.comparison.creativeIds.length }}
                  format={(v) => percent(v)}
                />
                <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Group A</dt>
                  <dd>
                    Analysed {platformName[insight.platform]} creatives whose {attributeNames[insight.attribute]} is “{insight.value}”: {count(insight.evidence.group.clicks)} clicks / {count(insight.evidence.group.impressions)} impressions
                  </dd>
                  <dt className="text-muted-foreground">Group B</dt>
                  <dd>
                    All other analysed {platformName[insight.platform]} creatives: {count(insight.evidence.comparison.clicks)} clicks / {count(insight.evidence.comparison.impressions)} impressions
                  </dd>
                  <dt className="text-muted-foreground">Difference</dt>
                  <dd>{Math.round(insight.evidence.relativeDifference * 100)}% higher pooled CTR in group A</dd>
                  <dt className="text-muted-foreground">Period</dt>
                  <dd>{dateRange(insight.period.from, insight.period.to)}</dd>
                </dl>
              </section>
              <section>
                <h3 className="mb-2 font-medium">Records included</h3>
                <div className="flex flex-wrap gap-1">
                  {insight.evidence.group.creativeIds.map((cid) => (
                    <a key={cid} href={d.href(`creatives/${cid}`)} title={creatives.get(cid)?.name} className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-900 hover:underline">
                      A · {cid}
                    </a>
                  ))}
                  {insight.evidence.comparison.creativeIds.map((cid) => (
                    <a key={cid} href={d.href(`creatives/${cid}`)} title={creatives.get(cid)?.name} className="rounded-md border px-1.5 py-0.5 text-xs hover:underline">
                      B · {cid}
                    </a>
                  ))}
                </div>
                {live && excluded.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Excluded (not analysed, analysis failed, or no data in the period): {excluded.join(', ')}.</p>}
              </section>
              <section>
                <h3 className="mb-1 font-medium">Method</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                  <li>{metrics.ctr.help} Pooled: total clicks over total impressions in each group, so larger creatives weigh more.</li>
                  <li>
                    Reported only when each group has ≥ {MIN_CREATIVES_PER_GROUP} creatives and group A is ≥ {MIN_RELATIVE_DIFFERENCE * 100}% higher. Two patterns are confounded when ≥ {OVERLAP_THRESHOLD * 100}% of the smaller group is shared.
                  </li>
                  <li>Missing data: creatives without a completed analysis or without records in the period are left out; missing values are never treated as zero.</li>
                  <li>Attributes come from fixture analysis (manual-fixture-v1), not a live model.</li>
                </ul>
              </section>
              <section>
                <h3 className="mb-1 font-medium">Limitations</h3>
                <p className="text-muted-foreground">{insight.limitation} Based on synthetic data: a demo-only finding, not a result about real Snitch campaigns.</p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Patterns in how the public creatives look, from AI image analysis. No performance data involved. */
function ObservedPatternsSection() {
  const d = useDashboard()
  const creatives = d.data!.dataset.creatives
  const result = observedPatterns(creatives, d.completedAnalyses)
  const live = creatives.filter((c) => d.completedAnalyses.get(c.creativeId)?.vision).length
  return (
    <section aria-labelledby="observed-heading" className="mb-2">
      <h2 id="observed-heading" className="mb-1 flex flex-wrap items-center gap-2 text-base font-semibold">
        Observed in public creatives <ProvenanceBadge kind="public-asset" /> <ProvenanceBadge kind="ai" />
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        How the real SNITCH ads and product images look, according to AI image analysis ({live} of {creatives.length} analysed). This describes the creatives only; it says nothing about how they performed.
      </p>
      <div className="mb-3 grid gap-3 md:grid-cols-2">
        {(['ads', 'productImages'] as const).map((k) => {
          const s = result.kinds[k]
          const name = k === 'ads' ? 'Public ads' : 'Product images'
          return (
            <Card key={k} size="sm">
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>
                  {s.status === 'ok' ? (
                    `${s.analysed} analysed`
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <EvidenceBadge level="insufficient" /> {s.analysed} of the {s.needed} needed are analysed. Analyse more in the Creative Library.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              {s.status === 'ok' && (
                <CardContent className="grid grid-cols-2 gap-3 text-xs">
                  {(['prominence', 'visualStyle', 'hookType', 'offer'] as const).map((attr) => (
                    <div key={attr}>
                      <p className="mb-1 font-medium text-muted-foreground">{{ prominence: 'Product prominence', visualStyle: 'Visual style', hookType: 'Opening hook', offer: 'Offer wording' }[attr]}</p>
                      <ul>
                        {s.distributions[attr].map((v) => (
                          <li key={v.value} title={v.creativeIds.join(', ')}>
                            {v.value.replace('_', ' ')}: <span className="tabular">{v.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
      {result.hypotheses.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {result.hypotheses.map((h) => (
            <ObservedHypothesisCard key={h.attribute} h={h} />
          ))}
        </div>
      )}
    </section>
  )
}

function ObservedHypothesisCard({ h }: { h: ObservedHypothesis }) {
  const d = useDashboard()
  const [draftKey] = useState(() => `observed:${h.attribute}:${crypto.randomUUID()}`)
  const draft = () => {
    const result = d.experiments.createDraft(
      {
        title: `Test ${h.attribute === 'prominence' ? 'product prominence' : h.attribute} in ads`,
        hypothesis: `${h.statement} An ad variant that changes only this may perform differently; this is untested.`,
        sourceCreativeIds: h.supportingCreativeIds,
        notes: `${h.limitation}`,
      },
      draftKey,
    )
    if (result.ok) d.navigate('experiments', { proposal: result.proposalId, edit: '1' })
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="leading-snug">{h.statement}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5 pt-1">
          <StatusBadge tone="neutral">Observation</StatusBadge>
          <ProvenanceBadge kind="ai" />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-medium">Hypothesis:</span> {h.nextStep}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Limitation:</span> {h.limitation}
        </p>
        <div className="flex flex-wrap gap-1">
          {h.supportingCreativeIds.map((id) => (
            <a key={id} href={d.href(`creatives/${id}`)} className="rounded-md border px-1.5 py-0.5 text-xs hover:underline">
              {id}
            </a>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={draft}>Draft experiment</Button>
      </CardFooter>
    </Card>
  )
}
