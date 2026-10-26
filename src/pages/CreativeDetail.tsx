import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FlaskConical,
  GitCompare,
  HelpCircle,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useDashboard } from '@/app/context'
import { count, dateRange, money, shortDate } from '@/app/format'
import {
  getCreativeIntelligence,
  type CreativeIntelligence,
  type ExperimentOpportunity,
} from '@/domain/analysis'
import type { MetricKey as ExperimentMetricKey } from '@/domain/experiments'
import type { Creative, VerificationStatus } from '@/domain/ingest'
import { peerComparison } from '@/domain/review'
import { selectView } from '@/domain/view'
import { AppShell } from '@/components/AppShell'
import { WeeklyLineChart } from '@/components/charts'
import { AnalysisControl } from '@/components/AnalysisControl'
import { CreativeThumb, EmptyState, InfoTip, MetricValue, ProvenanceBadge, StatusBadge } from '@/components/common'
import { metricOf, metrics, type MetricKey } from '@/components/metricConfig'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const summaryMetrics: MetricKey[] = ['spend', 'impressions', 'clicks', 'ctr', 'conversions', 'cpc', 'cpa', 'revenue', 'roas']

export function CreativeDetail({ id }: { id: string }) {
  const d = useDashboard()
  const [showEvidence, setShowEvidence] = useState(false)
  const [showVisualEvidence, setShowVisualEvidence] = useState(false)
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
        <EmptyState
          title={`No creative with ID ${id}`}
          body="It may have been rejected by validation. Check the data-quality report."
          action={
            <Button asChild variant="outline">
              <a href={d.href('data-quality')}>Open data quality</a>
            </Button>
          }
        />
      </AppShell>
    )
  }

  const base = { ...f, platforms: [], formats: [], products: [], search: '', analysisStatuses: [], dataAvailability: 'all' as const }
  const own = selectView(data.dataset, { ...base, creativeIds: [id] })
  const row = own.rows[0]
  const records = data.dataset.performance.filter((p) => p.creativeId === id).sort((a, b) => a.reportingStart.localeCompare(b.reportingStart))
  const inPeriod = records.filter((p) => p.reportingStart >= f.from && p.reportingEnd <= f.to)
  const analysisState = d.analyses.get(id)
  const live = d.liveRecord(id)
  const peers = d.insightView ? peerComparison(d.insightView.rows, id) : null
  const related = d.insights.filter((i) => i.evidence.group.creativeIds.includes(id) || i.evidence.comparison.creativeIds.includes(id))
  const asGroup = related.filter((i) => i.evidence.group.creativeIds.includes(id))
  const qualityNotes = [
    ...data.dataset.quality.invalid.filter((i) => i.id === id).map((i) => `Rejected record: ${i.problems.join('; ')}`),
    ...data.dataset.quality.duplicates.filter((x) => x.includes(`:${id}:`) || x === `creative ${id}`).map((x) => `Duplicate dropped: ${x}`),
  ]

  const intel: CreativeIntelligence | null =
    analysisState?.status === 'complete' ? getCreativeIntelligence(analysisState.analysis) : null

  const handleDraftOpportunity = (opp: ExperimentOpportunity) => {
    const primaryKey: ExperimentMetricKey = (['ctr', 'cpa', 'roas', 'conversionRate'].includes(opp.primary_metric)
      ? opp.primary_metric
      : 'ctr') as ExperimentMetricKey
    const guardrailKeys: ExperimentMetricKey[] = (opp.guardrail_metrics.filter((m) =>
      ['ctr', 'cpa', 'roas', 'conversionRate'].includes(m),
    ) as ExperimentMetricKey[]) || ['cpa', 'roas']
    const result = d.experiments.createDraft(
      {
        title: opp.title,
        hypothesis: opp.hypothesis,
        control: opp.control,
        variant: opp.variant,
        variablesChanged: [opp.variable_to_test],
        variablesConstant: ['visual_asset', 'audience', 'placement', 'budget'],
        primaryMetric: primaryKey,
        guardrailMetrics: guardrailKeys,
        successCriteria: `Observe whether ${opp.variant} achieves target improvement in ${primaryKey.toUpperCase()} compared with ${opp.control} without regressing guardrail metrics (${guardrailKeys.join(', ')}).`,
        notes: `Source: Creative Intelligence Analysis (${creative.creativeId})\nVariable: ${opp.variable_to_test}\nEvidence basis: ${opp.evidence_basis}\nRationale: ${opp.rationale}\nLimitations: ${opp.limitations}`,
        sourceCreativeIds: [id],
        sourceAnalysisId: id,
        sourceOpportunityTitle: opp.title,
      },
      `opp:${id}:${opp.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    )
    if (result.ok) {
      d.navigate('experiments', { proposal: result.proposalId, edit: '1' })
    }
  }

  const draftGeneralExperiment = () => {
    if (intel && intel.experiment_opportunities.length > 0) {
      handleDraftOpportunity(intel.experiment_opportunities[0])
      return
    }
    const insight = asGroup[0]
    const result = d.experiments.createDraft(
      insight
        ? { sourceInsight: insight, sourceCreativeIds: [id], title: `Test from ${creative.name}` }
        : { title: `Test from ${creative.name}`, sourceCreativeIds: [id] },
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
          <Button size="sm" onClick={draftGeneralExperiment}>
            <FlaskConical aria-hidden /> Draft experiment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Top Asset & Meta Overview */}
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
          </div>
        </div>

        {/* Creative Intelligence Analysis Section */}
        <section aria-label="Creative Intelligence Analysis" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Creative Intelligence Analysis</h2>
              <p className="text-xs text-muted-foreground">
                Structured creative classification, messaging breakdown, testable hypotheses, and evidence boundaries.
              </p>
            </div>
            <ProvenanceBadge kind="ai" />
          </div>

          {/* Pending State */}
          {(!analysisState || analysisState.status === 'pending') && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Sparkles className="size-8 text-muted-foreground" aria-hidden />
                <div className="max-w-md">
                  <h3 className="font-semibold">Analysis not run yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run the creative intelligence analysis to extract structured visual hooks, messaging hierarchy, value propositions, and controlled experiment hypotheses.
                  </p>
                </div>
                <AnalysisControl creativeId={id} />
              </CardContent>
            </Card>
          )}

          {/* Failed State */}
          {analysisState?.status === 'failed' && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>The creative intelligence analysis failed validation</span>
              </div>
              <p className="text-xs text-red-800">
                The vision model output could not be validated against the Creative Intelligence schema. No partial guesses are retained.
              </p>
              <ul className="list-disc pl-5 text-xs text-red-800">
                {analysisState.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="mt-2">
                <AnalysisControl creativeId={id} />
              </div>
            </div>
          )}

          {/* Complete Analysis View */}
          {analysisState?.status === 'complete' && intel && (
            <div className="flex flex-col gap-6">
              {live?.lastAttempt?.outcome === 'failed' && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  The latest re-analysis attempt failed ({live.lastAttempt.error?.message}). Presenting the earlier validated result.
                </p>
              )}

              {/* 1. Creative at a glance */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">1. Creative at a glance</CardTitle>
                    <StatusBadge tone="neutral">Schema {intel.schema_version}</StatusBadge>
                  </div>
                  <CardDescription>Factual overview distinguishing visible elements from copy claims</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <p className="text-base leading-relaxed text-foreground font-medium">{intel.summary}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <StatusBadge tone="info">Visual hook: {intel.attributes.visual_hook}</StatusBadge>
                    <StatusBadge tone="good">Message hook: {intel.attributes.message_hook}</StatusBadge>
                    <StatusBadge tone="neutral">Style: {intel.attributes.visual_style}</StatusBadge>
                    {intel.message_breakdown.campaign_context && (
                      <StatusBadge tone="neutral">Campaign: {intel.message_breakdown.campaign_context}</StatusBadge>
                    )}
                    {intel.message_breakdown.value_proposition && (
                      <StatusBadge tone="neutral">Value prop: {intel.message_breakdown.value_proposition}</StatusBadge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 2. Message breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">2. Message breakdown</CardTitle>
                  <CardDescription>Structured analysis of communicated copy, value propositions, and stated claims</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary message</dt>
                      <dd className="mt-0.5 font-medium">{intel.message_breakdown.primary_message}</dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible value proposition</dt>
                      <dd className="mt-0.5">
                        {intel.message_breakdown.value_proposition ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{intel.message_breakdown.value_proposition}</span>
                            <span className="text-[11px] text-muted-foreground">Value claim, not a promotional discount</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Absent</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Promotional offer</dt>
                      <dd className="mt-0.5">
                        {intel.message_breakdown.promotional_offer ? (
                          <span className="font-semibold text-emerald-700">{intel.message_breakdown.promotional_offer}</span>
                        ) : (
                          <span className="text-muted-foreground">Absent (no discount or pricing offer stated)</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Campaign context</dt>
                      <dd className="mt-0.5">
                        {intel.message_breakdown.campaign_context ?? <span className="text-muted-foreground">None stated</span>}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Call to action (CTA)</dt>
                      <dd className="mt-0.5">
                        {intel.message_breakdown.cta_text ? (
                          <span className="font-medium">“{intel.message_breakdown.cta_text}”</span>
                        ) : (
                          <span className="text-muted-foreground">Absent</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supporting message</dt>
                      <dd className="mt-0.5">
                        {intel.message_breakdown.supporting_message ?? <span className="text-muted-foreground">None</span>}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</dt>
                      <dd className="mt-0.5 font-medium">{intel.message_breakdown.product_or_service_category}</dd>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Message hierarchy</dt>
                      <dd className="mt-0.5 text-muted-foreground">{intel.message_breakdown.message_hierarchy}</dd>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible text in image (verbatim)</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {intel.message_breakdown.visible_text.length > 0 ? (
                          intel.message_breakdown.visible_text.map((t, i) => (
                            <span key={i} className="rounded border bg-muted/50 px-2 py-0.5 text-xs font-mono">
                              “{t}”
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">None visible</span>
                        )}
                      </dd>
                    </div>

                    {intel.message_breakdown.claims_requiring_external_verification.length > 0 && (
                      <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950">
                        <dt className="flex items-center gap-1.5 font-semibold text-amber-900 uppercase tracking-wide text-[11px]">
                          <ShieldAlert className="size-3.5" aria-hidden />
                          Claims requiring external data verification
                        </dt>
                        <dd className="mt-1">
                          <ul className="list-disc pl-5 space-y-0.5">
                            {intel.message_breakdown.claims_requiring_external_verification.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* 3. Creative attributes */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">3. Standardized creative attributes</CardTitle>
                  <CardDescription>Consistent cross-creative taxonomy. Visual and message hooks are classified independently.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <AttributeBlock
                      label="Visual hook"
                      value={intel.attributes.visual_hook}
                      help="Primary visual focal point leading the creative"
                    />
                    <AttributeBlock
                      label="Message hook"
                      value={intel.attributes.message_hook}
                      help="Primary theme or angle of the copy (classified independently)"
                    />
                    <AttributeBlock
                      label="Visual style"
                      value={intel.attributes.visual_style}
                      help="Creative production style"
                    />
                    <AttributeBlock
                      label="Product prominence"
                      value={intel.attributes.product_prominence}
                      help="How prominent the product is in the frame"
                    />
                    <AttributeBlock
                      label="People count"
                      value={intel.attributes.people_count === 'unknown' ? 'Unknown' : String(intel.attributes.people_count)}
                      help="Number of people visually identifiable"
                    />
                    <AttributeBlock
                      label="Text density"
                      value={intel.attributes.text_density}
                      help="Relative density of text across the asset"
                    />
                    <AttributeBlock
                      label="CTA presence"
                      value={intel.attributes.cta_presence}
                      help="Whether an explicit call to action is present"
                    />
                    <AttributeBlock
                      label="Offer presence"
                      value={intel.attributes.offer_presence}
                      help="Whether an explicit discount or pricing offer is present"
                    />
                  </div>

                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Creative concept</dt>
                      <dd className="mt-1 font-medium">{intel.attributes.creative_concept}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visual hierarchy</dt>
                      <dd className="mt-1 text-muted-foreground">{intel.attributes.visual_hierarchy}</dd>
                    </div>
                  </div>

                  {intel.attributes.key_visual_elements.length > 0 && (
                    <div className="pt-1">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Key visual elements</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {intel.attributes.key_visual_elements.map((el, i) => (
                          <span key={i} className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                            {el}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 4. Experiment opportunities */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">4. Experiment opportunities</CardTitle>
                      <CardDescription>Testable hypotheses for growth. Labeled as hypotheses, not performance guarantees.</CardDescription>
                    </div>
                    <StatusBadge tone="neutral">{intel.experiment_opportunities.length} proposed</StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  {intel.experiment_opportunities.length === 0 ? (
                    <p className="text-muted-foreground">
                      No controlled experiment opportunities proposed for this creative.{' '}
                      {intel.experiment_explanation ?? 'Available visual evidence does not support an isolated variable test without confounding factors.'}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {intel.experiment_opportunities.map((opp, idx) => (
                        <div key={idx} className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FlaskConical className="size-4 text-primary" aria-hidden />
                              <h4 className="font-semibold">{opp.title}</h4>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge tone="info">Hypothesis, not a fact</StatusBadge>
                              <StatusBadge tone="neutral">{opp.status}</StatusBadge>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Observation</span>
                              <p className="text-foreground">{opp.observation}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Hypothesis</span>
                              <p className="font-medium text-foreground">{opp.hypothesis}</p>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 text-xs rounded border bg-background p-3">
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground">Control treatment</span>
                              <p className="mt-0.5 text-foreground">{opp.control}</p>
                            </div>
                            <div>
                              <span className="text-[11px] font-semibold text-primary">Proposed variant</span>
                              <p className="mt-0.5 text-foreground">{opp.variant}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs">
                            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                              <span>
                                Variable to test: <strong className="text-foreground">{opp.variable_to_test}</strong>
                              </span>
                              <span>
                                Primary metric: <strong className="text-foreground uppercase">{opp.primary_metric}</strong>
                              </span>
                              <span>
                                Guardrails: <strong className="text-foreground uppercase">{opp.guardrail_metrics.join(', ')}</strong>
                              </span>
                              <span>
                                Basis: <strong>{opp.evidence_basis}</strong>
                              </span>
                            </div>
                            <Button size="sm" onClick={() => handleDraftOpportunity(opp)}>
                              <FlaskConical className="size-3.5" aria-hidden />
                              Draft this experiment
                            </Button>
                          </div>

                          {opp.limitations && (
                            <p className="text-[11px] text-muted-foreground">
                              <strong>Limitations & confounders:</strong> {opp.limitations}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 5. Performance evidence */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">5. Performance evidence</CardTitle>
                      <CardDescription>Deterministic campaign metrics and platform peer benchmarks</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProvenanceBadge kind="synthetic-performance" />
                      <span className="text-xs text-muted-foreground">Synthetic demo data, not SNITCH results</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 text-sm">
                  {!row || !row.counts ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                      <p className="font-semibold">Performance evidence unavailable</p>
                      <p className="mt-1">
                        This analysis describes the visual and messaging properties of the creative and does not establish whether it performs well.
                        No performance records exist for this creative in the selected reporting period.
                      </p>
                    </div>
                  ) : (
                    <>
                      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                        {summaryMetrics.map((k) => (
                          <div key={k} className="rounded-lg border px-2.5 py-2 bg-card">
                            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              {metrics[k].label} <InfoTip text={metrics[k].help} label={`What is ${metrics[k].label}?`} />
                            </dt>
                            <dd className="text-sm font-semibold">
                              <MetricValue
                                value={row ? metricOf(row, k) : null}
                                format={metrics[k].format}
                                unavailableReason={row?.counts ? metrics[k].unavailable : 'No performance records in this period.'}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Panel label="Observation" tag="Measured performance">
                          {row?.counts
                            ? `${metrics.ctr.label} ${row.metrics.ctr === null ? '—' : metrics.ctr.format(row.metrics.ctr)} and ROAS ${row.metrics.roas === null ? '— (no revenue tracking)' : metrics.roas.format(row.metrics.roas)} on ${money(row.counts.spend)} spend over ${inPeriod.length} reporting week${inPeriod.length === 1 ? '' : 's'}.`
                            : 'No performance records in this period.'}
                        </Panel>

                        <Panel label="Peer benchmark" tag="Platform comparison">
                          {peers
                            ? `Compared with ${peers.peerIds.length} other ${creative.platform === 'meta' ? 'Meta' : 'Google'} creatives in this period: CTR ${fmt('ctr', peers.ctr.creative)} vs ${fmt('ctr', peers.ctr.peers)}, ROAS ${fmt('roas', peers.roas.creative)} vs ${fmt('roas', peers.roas.peers)}.`
                            : 'No benchmark data available for this platform and period.'}
                        </Panel>
                      </div>

                      {own.trend.length >= 2 && (
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">CTR trend by week</p>
                          <WeeklyLineChart
                            rows={own.trend.map((t) => ({ periodStart: t.periodStart, ctr: t.ctr }))}
                            series={[{ key: 'ctr', label: 'CTR' }]}
                            format={(v) => (v === null ? '—' : metrics.ctr.format(v))}
                            height={160}
                            caption={`Weekly CTR trend for ${creative.name}`}
                          />
                        </div>
                      )}

                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEvidence((v) => !v)}
                          aria-expanded={showEvidence}
                        >
                          {showEvidence ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}{' '}
                          {showEvidence ? 'Hide weekly performance table' : 'View weekly performance table'}
                        </Button>

                        {showEvidence && (
                          <div className="mt-4 flex flex-col gap-3 text-xs">
                            <div className="overflow-x-auto rounded border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Week of</TableHead>
                                    <TableHead className="text-right">Impressions</TableHead>
                                    <TableHead className="text-right">Clicks</TableHead>
                                    <TableHead className="text-right">Spend</TableHead>
                                    <TableHead className="text-right">Conversions</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                    <TableHead>Period status</TableHead>
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
                            <p className="text-muted-foreground">
                              Unavailable values are excluded and never treated as zero. Correlation does not imply causality.
                            </p>
                            {qualityNotes.length > 0 && (
                              <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                                {qualityNotes.map((n, i) => (
                                  <li key={i}>{n}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* 6. Evidence and uncertainty */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">6. Evidence and uncertainty</CardTitle>
                  <CardDescription>Strict boundary between verified observations, cautious interpretations, and unknowns</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
                        Direct visual observations
                      </h4>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-foreground">
                        {intel.evidence_and_uncertainty.observations.map((obs, i) => (
                          <li key={i}>{obs}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
                        <Lightbulb className="size-3.5 text-amber-600" aria-hidden />
                        AI interpretations (not facts)
                      </h4>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-foreground">
                        {intel.evidence_and_uncertainty.interpretations.map((interp, i) => (
                          <li key={i}>{interp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 pt-2 border-t">
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <HelpCircle className="size-3.5" aria-hidden />
                        Uncertainties & missing inputs
                      </h4>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                        {intel.evidence_and_uncertainty.uncertainties.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <ShieldAlert className="size-3.5" aria-hidden />
                        Analysis limitations
                      </h4>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                        {intel.evidence_and_uncertainty.analysis_limitations.map((lim, i) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 7. Visual evidence (Collapsible) */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">7. Visual evidence & provenance</CardTitle>
                      <CardDescription>Detailed visual observations, garments table, background, and model execution telemetry</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowVisualEvidence((v) => !v)}
                      aria-expanded={showVisualEvidence}
                    >
                      {showVisualEvidence ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}{' '}
                      {showVisualEvidence ? 'Hide visual evidence' : 'View visual evidence'}
                    </Button>
                  </div>
                </CardHeader>
                {showVisualEvidence && (
                  <CardContent className="flex flex-col gap-4 text-sm border-t pt-4">
                    {intel.visual_evidence && (
                      <div className="flex flex-col gap-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Composition & framing</h4>
                          <p className="text-xs text-foreground">{intel.visual_evidence.format_composition ?? 'Not specified'}</p>
                        </div>

                        {intel.visual_evidence.garments && intel.visual_evidence.garments.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Identified garments</h4>
                            <div className="overflow-x-auto rounded border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Colour</TableHead>
                                    <TableHead>Pattern</TableHead>
                                    <TableHead>Visible details</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {intel.visual_evidence.garments.map((g, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="font-medium capitalize">{g.type}</TableCell>
                                      <TableCell>{g.colour ?? '—'}</TableCell>
                                      <TableCell>{g.pattern ?? '—'}</TableCell>
                                      <TableCell>{g.details ?? '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {intel.visual_evidence.background && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Background setting</h4>
                            <p className="text-xs text-foreground">{intel.visual_evidence.background}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Telemetry and Provenance Footer */}
                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex flex-col gap-1 border">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">Model telemetry:</span>
                        <span>Model: {analysisState.analysis.modelVersion}</span>
                        <span>·</span>
                        <span>Analysed: {shortDate(analysisState.analysis.createdAt.slice(0, 10))} {analysisState.analysis.createdAt.slice(11, 16)} UTC</span>
                        {live?.lastAttempt && (
                          <>
                            <span>·</span>
                            <span>Latency: {(live.lastAttempt.durationMs / 1000).toFixed(1)}s</span>
                            {live.lastAttempt.usage && (
                              <>
                                <span>·</span>
                                <span>Tokens: {live.lastAttempt.usage.promptTokens ?? '?'} in / {live.lastAttempt.usage.completionTokens ?? '?'} out</span>
                                {live.lastAttempt.usage.cost !== null && (
                                  <>
                                    <span>·</span>
                                    <span>Cost: ${live.lastAttempt.usage.cost.toFixed(4)}</span>
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/80">
                        Visual analysis and performance analysis are separate capabilities. No audience intent, conversion probability, or sales performance is inferred from image content alone.
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function AttributeBlock({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-1">
      <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label} <InfoTip text={help} label={label} />
      </dt>
      <dd className="text-sm font-semibold text-foreground capitalize">{value.replace(/_/g, ' ')}</dd>
    </div>
  )
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
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Public facts {isAd ? '(ad directory)' : '(product page)'}
      </p>
      <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1.5">
        {row('Category', creative.category)}
        {!isAd && row('Listed price', creative.price !== null && creative.price !== undefined ? `₹${creative.price.toLocaleString('en-IN')} (when checked; prices change)` : null)}
        {!isAd && creative.attributes && Object.keys(creative.attributes).length > 0 && row('Stated on page', Object.entries(creative.attributes).map(([k, v]) => `${k}: ${v}`).join(' · '))}
        {isAd && row('Ad copy', creative.adCopy ? `“${creative.adCopy}”` : null)}
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
      <p className="mt-2 text-xs text-muted-foreground">
        Public sources don’t reveal spend, impressions, clicks, conversions or ROAS. Any such numbers on this page are synthetic.
      </p>
    </section>
  )
}

function fmt(k: 'ctr' | 'roas', v: number | null): string {
  return v === null ? '—' : metrics[k].format(v)
}
