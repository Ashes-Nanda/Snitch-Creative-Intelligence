import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, FlaskConical, GitCompare } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { count, dateRange, money, shortDate } from '@/app/format'
import type { AnalysisState } from '@/domain/analysis'
import type { Creative, VerificationStatus } from '@/domain/ingest'
import type { LiveAnalysisRecord } from '@/app/analysis-client'
import { describeAttribute } from '@/domain/insights'
import { peerComparison } from '@/domain/review'
import { selectView } from '@/domain/view'
import { AppShell } from '@/components/AppShell'
import { WeeklyLineChart } from '@/components/charts'
import { AnalysisControl } from '@/components/AnalysisControl'
import { CreativeThumb, EmptyState, EvidenceBadge, InfoTip, MetricValue, ProvenanceBadge, StatusBadge } from '@/components/common'
import { metricOf, metrics, type MetricKey } from '@/components/metricConfig'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const summary: MetricKey[] = ['spend', 'impressions', 'clicks', 'ctr', 'conversions', 'cpc', 'cpa', 'revenue', 'roas']

export function CreativeDetail({ id }: { id: string }) {
  const d = useDashboard()
  const [showEvidence, setShowEvidence] = useState(false)
  // One draft per page visit: repeated clicks open the same draft instead of creating duplicates.
  const [draftKey] = useState(() => `${id}:${crypto.randomUUID()}`)
  const data = d.data!
  const f = d.filters!
  const creative = data.dataset.creatives.find((c) => c.creativeId === id)
  const back = d.route.params.get('back')
  const libraryHref = back ? `#${back.replace(/[?&]preview=[^&]*/, '')}` : d.href('library')

  const breadcrumb = (
    <Breadcrumb className="mb-1">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={libraryHref}>Creative Library</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{creative?.name ?? id}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )

  if (!creative) {
    return (
      <AppShell title="Creative not found" breadcrumb={breadcrumb} filters="none">
        <EmptyState title={`No creative with ID ${id}`} body="It may have been rejected by validation. Check the data-quality report." action={<Button asChild variant="outline"><a href={d.href('data-quality')}>Open data quality</a></Button>} />
      </AppShell>
    )
  }

  const base = { ...f, platforms: [], formats: [], products: [], search: '', analysisStatuses: [], dataAvailability: 'all' as const }
  const own = selectView(data.dataset, { ...base, creativeIds: [id] })
  const row = own.rows[0]
  const records = data.dataset.performance.filter((p) => p.creativeId === id).sort((a, b) => a.reportingStart.localeCompare(b.reportingStart))
  const inPeriod = records.filter((p) => p.reportingStart >= f.from && p.reportingEnd <= f.to)
  const analysis = d.analyses.get(id)
  const live = d.liveRecord(id)
  const peers = d.insightView ? peerComparison(d.insightView.rows, id) : null
  const related = d.insights.filter((i) => i.evidence.group.creativeIds.includes(id) || i.evidence.comparison.creativeIds.includes(id))
  const asGroup = related.filter((i) => i.evidence.group.creativeIds.includes(id))
  const qualityNotes = [
    ...data.dataset.quality.invalid.filter((i) => i.id === id).map((i) => `Rejected record: ${i.problems.join('; ')}`),
    ...data.dataset.quality.duplicates.filter((x) => x.includes(`:${id}:`) || x === `creative ${id}`).map((x) => `Duplicate dropped: ${x}`),
  ]

  const draftExperiment = () => {
    const insight = asGroup[0]
    const result = d.experiments.createDraft(
      insight ? { sourceInsight: insight, sourceCreativeIds: [id], title: `Test from ${creative.name}` } : { title: `Test from ${creative.name}`, sourceCreativeIds: [id] },
      draftKey,
    )
    if (result.ok) d.navigate('experiments', { proposal: result.proposalId, edit: '1' })
  }

  return (
    <AppShell
      title={creative.name}
      description={`${creative.creativeId} · ${creative.platform === 'meta' ? 'Meta Ads' : 'Google Ads'} · ${creative.format} · ${dateRange(f.from, f.to)}`}
      breadcrumb={breadcrumb}
      filters="period"
      action={
        <>
          <Button variant="outline" size="sm" onClick={() => d.navigate('library', { compare: id })}>
            <GitCompare aria-hidden /> Compare
          </Button>
          <Button size="sm" onClick={draftExperiment}>
            <FlaskConical aria-hidden /> Draft experiment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <CreativeThumb creative={creative} className="w-full" />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <ProvenanceBadge kind={creative.dataOrigin === 'public' ? 'public-asset' : 'synthetic-asset'} />
              <StatusBadge tone="neutral">{creative.assetType === 'product_image' ? 'Product image (snitch.com)' : 'Public ad (third-party directory)'}</StatusBadge>
              {creative.source && <VerificationBadge status={creative.source.verificationStatus} />}
              <AnalysisControl creativeId={id} />
            </div>
            <PublicFacts creative={creative} />
            <p className="-mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Campaign metrics <ProvenanceBadge kind="synthetic-performance" />
              <span className="normal-case tracking-normal">Synthetic demo data, not SNITCH results</span>
            </p>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {summary.map((k) => (
                <div key={k} className="rounded-lg border px-2.5 py-2">
                  <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {metrics[k].label} <InfoTip text={metrics[k].help} label={`What is ${metrics[k].label}?`} />
                  </dt>
                  <dd className="text-sm font-semibold">
                    <MetricValue value={row ? metricOf(row, k) : null} format={metrics[k].format} unavailableReason={row?.counts ? metrics[k].unavailable : 'No performance records in this period.'} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Performance analysis</CardTitle>
            <CardDescription>Measured performance compared against platform peer benchmarks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <Panel label="Observation" tag="Synthetic demo data">
              {row?.counts
                ? `${metrics.ctr.label} ${row.metrics.ctr === null ? '—' : metrics.ctr.format(row.metrics.ctr)} and ROAS ${row.metrics.roas === null ? '— (no revenue tracking)' : metrics.roas.format(row.metrics.roas)} on ${money(row.counts.spend)} spend over ${inPeriod.length} reporting week${inPeriod.length === 1 ? '' : 's'}.`
                : 'No performance records in this period.'}
            </Panel>
            <Panel label="Peer benchmark" tag="Synthetic demo data">
              {peers
                ? `Compared with ${peers.peerIds.length} other ${creative.platform === 'meta' ? 'Meta' : 'Google'} creatives: CTR ${fmt('ctr', peers.ctr.creative)} vs ${fmt('ctr', peers.ctr.peers)}, ROAS ${fmt('roas', peers.roas.creative)} vs ${fmt('roas', peers.roas.peers)}.`
                : 'No benchmark data available for this platform and period.'}
            </Panel>
            <Panel label="Hypothesis" tag="Patterns">
              {asGroup.length ? (
                <ul className="flex flex-col gap-1.5">
                  {asGroup.map((i) => (
                    <li key={i.insightId} className="flex flex-wrap items-center gap-1.5">
                      <a href={d.href('insights', { insight: i.insightId })} className="underline-offset-2 hover:underline">
                        {describeAttribute[i.attribute](i.value)[0].toUpperCase() + describeAttribute[i.attribute](i.value).slice(1)} may help CTR
                      </a>
                      <EvidenceBadge level={d.levels.get(i.insightId)!} />
                    </li>
                  ))}
                </ul>
              ) : (
                'No distinct pattern in this period singles out this creative’s attributes.'
              )}
            </Panel>
            <Panel label="Context">
              Audience targeting, placement, and campaign objective are external variables; observe trends in combination with testing.
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>The records, formulas and exclusions behind the numbers above.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => setShowEvidence((v) => !v)} aria-expanded={showEvidence}>
              {showEvidence ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} {showEvidence ? 'Hide evidence' : 'View evidence'}
            </Button>
            {showEvidence && (
              <div className="mt-4 flex flex-col gap-4 text-sm">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week of</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Conversions</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead>In period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="tabular">
                      {records.map((p) => {
                        const included = p.reportingStart >= f.from && p.reportingEnd <= f.to
                        return (
                          <TableRow key={p.performanceId} className={included ? undefined : 'text-muted-foreground'}>
                            <TableCell>{shortDate(p.reportingStart)}</TableCell>
                            <TableCell className="text-right">{count(p.impressions)}</TableCell>
                            <TableCell className="text-right">{count(p.clicks)}</TableCell>
                            <TableCell className="text-right">{money(p.spend)}</TableCell>
                            <TableCell className="text-right">{count(p.conversions)}</TableCell>
                            <TableCell className="text-right">{p.attributedRevenue === null ? '—' : money(p.attributedRevenue)}</TableCell>
                            <TableCell>{included ? 'Included' : 'Outside period'}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                  <li>Formulas: {metrics.ctr.help} {metrics.cpa.help} {metrics.roas.help}</li>
                  <li>
                    Comparison group: {peers ? `the ${peers.peerIds.length} other creatives on the same platform with data in the period (${peers.peerIds.join(', ')}).` : 'none available.'}
                  </li>
                  <li>Unavailable values are excluded, never treated as zero.</li>
                  {qualityNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Creative attributes <ProvenanceBadge kind="ai" />
              </CardTitle>
              <CardDescription>Observable properties only. Audience intent is not inferred.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <AnalysisPanel creativeId={id} analysis={analysis} live={live} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                CTR by week <ProvenanceBadge kind="synthetic-performance" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {own.trend.length >= 2 ? (
                <WeeklyLineChart
                  rows={own.trend.map((t) => ({ periodStart: t.periodStart, ctr: t.ctr }))}
                  series={[{ key: 'ctr', label: 'CTR' }]}
                  format={(v) => (v === null ? '—' : metrics.ctr.format(v))}
                  height={180}
                  caption={`Weekly CTR for ${creative.name}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">A trend needs at least two weeks of records in the period; this creative has {own.trend.length}.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

function fmt(k: 'ctr' | 'roas', v: number | null): string {
  return v === null ? '—' : metrics[k].format(v)
}

function Panel({ label, tag, children }: { label: string; tag?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {tag && <span className="rounded border px-1 py-px text-[10px] normal-case tracking-normal">{tag}</span>}
      </p>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

const verificationMeta: Record<VerificationStatus, { label: string; tone: 'good' | 'info' | 'neutral' | 'bad'; help: string }> = {
  verified: { label: 'Verified at source', tone: 'good', help: 'Checked against the official source page.' },
  partially_verified: { label: 'Partially verified', tone: 'info', help: 'Seen at a third-party source; not confirmed at the official source.' },
  unverified: { label: 'Unverified', tone: 'neutral', help: 'Not yet checked against its source.' },
  unavailable: { label: 'Source unavailable', tone: 'bad', help: 'The asset or source could not be reached when last checked.' },
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const m = verificationMeta[status]
  return (
    <StatusBadge tone={m.tone} title={m.help}>
      {m.label}
    </StatusBadge>
  )
}

/** Facts from the public source only. Anything not confirmed there is shown as unknown, never filled in. */
function PublicFacts({ creative }: { creative: Creative }) {
  const src = creative.source
  const isAd = creative.assetType !== 'product_image'
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? <span className="text-muted-foreground">Not available</span>}</dd>
    </>
  )
  return (
    <section aria-label="Public facts" className="rounded-lg border p-3 text-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Public facts {isAd ? '(ad directory)' : '(product page)'}</p>
      <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1.5">
        {row('Category', creative.category)}
        {!isAd && row('Listed price', creative.price !== null && creative.price !== undefined ? `₹${creative.price.toLocaleString('en-IN')} (when checked; prices change)` : null)}
        {!isAd && creative.attributes && Object.keys(creative.attributes).length > 0 && row('Stated on page', Object.entries(creative.attributes).map(([k, v]) => `${k}: ${v}`).join(' · '))}
        {isAd && row('Ad copy', creative.adCopy ? `“${creative.adCopy}”` : null)}
        {isAd && row('Ad ID / start date', null)}
        {row(
          'Source',
          src ? (
            <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              {src.sourceType === 'official_product_page' ? 'snitch.com product page' : src.sourceType === 'third_party_ad_directory' ? 'zooptrack ad directory' : src.sourceType.replace(/_/g, ' ')}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null,
        )}
        {row('Checked', src?.retrievedAt ? shortDate(src.retrievedAt.slice(0, 10)) : null)}
        {row('Asset', <a href={creative.assetUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Original image ↗</a>)}
      </dl>
      {src?.notes && src.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          {src.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Public sources don’t reveal spend, impressions, clicks, conversions or ROAS. Any such numbers on this page are synthetic.</p>
    </section>
  )
}

function AnalysisPanel({ creativeId, analysis, live }: { creativeId: string; analysis: AnalysisState | undefined; live: LiveAnalysisRecord | undefined }) {
  const attempt = live?.lastAttempt
  if (!analysis || analysis.status === 'pending') {
    return (
      <div className="flex flex-col gap-2 text-muted-foreground">
        <p>Not analysed yet. Run the analysis to see what a vision model can observe in this image.</p>
        <AnalysisControl creativeId={creativeId} />
      </div>
    )
  }
  if (analysis.status === 'failed') {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
        <p>The analysis failed, so no attributes are shown and this creative is left out of insights. Its asset and source are unaffected.</p>
        <ul className="list-disc pl-5 text-xs">
          {analysis.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <AnalysisControl creativeId={creativeId} />
      </div>
    )
  }

  const a = analysis.analysis
  const v = a.vision
  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value === null || value === '' || (Array.isArray(value) && value.length === 0) ? <span className="text-muted-foreground">None visible</span> : value}</dd>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      {attempt?.outcome === 'failed' && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> The latest re-analysis failed ({attempt.error?.message}). Showing the earlier successful result.
        </p>
      )}
      <p>{a.description}</p>
      {v ? (
        <>
          <section>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observed in the image (AI-observed)</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {fact('Composition', v.observations.format_composition)}
              {fact('Product prominence', v.observations.product_prominence.replace('_', ' '))}
              {fact('People', v.observations.people)}
              {fact('Visual style', v.observations.visual_style)}
              {fact('Background', v.observations.background)}
              {fact('Text density', v.observations.text_density)}
              {fact('Visible text', v.observations.visible_text.map((t) => `“${t}”`).join(', '))}
              {fact('Offer wording', v.observations.offer_text)}
              {fact('CTA wording', v.observations.cta_text)}
              {fact('Opening hook (classified)', a.hookType)}
            </dl>
            {v.observations.garments.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {v.observations.garments.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium capitalize">{g.type}</span>
                    {[g.colour, g.pattern, g.details].filter(Boolean).length > 0 && <span className="text-muted-foreground">: {[g.colour, g.pattern, g.details].filter(Boolean).join('; ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-900">AI interpretation, not a fact</h4>
            <p>{v.interpretations.creative_angle}</p>
            <p className="mt-1 text-xs text-muted-foreground">Based on: {v.interpretations.rationale}</p>
          </section>
          <section>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Uncertain or not visible</h4>
            {v.uncertain.length ? (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {v.uncertain.map((u) => (
                  <li key={u.attribute}>
                    <span className="font-medium text-foreground">{u.attribute}</span>: {u.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">The model listed nothing as uncertain.</p>
            )}
          </section>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">This result has no structured detail.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Model {a.modelVersion} via OpenRouter · analysed {a.createdAt.slice(0, 16).replace('T', ' ')} UTC
        {attempt?.outcome === 'completed' && attempt.usage && (
          <>
            {' '}
            · {attempt.durationMs ? `${(attempt.durationMs / 1000).toFixed(1)}s` : ''} · {attempt.usage.promptTokens ?? '?'} in / {attempt.usage.completionTokens ?? '?'} out tokens
            {attempt.usage.cost !== null && ` · $${attempt.usage.cost.toFixed(4)}`}
          </>
        )}
        . No performance, audience or sales is inferred from the image.
      </p>
    </div>
  )
}
