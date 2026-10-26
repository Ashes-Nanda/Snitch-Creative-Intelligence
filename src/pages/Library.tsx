import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, LayoutGrid, Rows3, X } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { dateRange } from '@/app/format'
import { getCreativeIntelligence, type AnalysisStatus, type CreativeIntelligence } from '@/domain/analysis'
import { selectView, type CreativeRow, type SortKey } from '@/domain/view'
import { AnalysisConfigNotice, AnalysisControl, AnalysisStatusBadge } from '@/components/AnalysisControl'
import { AppShell } from '@/components/AppShell'
import { WeeklyLineChart } from '@/components/charts'
import { CreativeThumb, EmptyState, InfoTip, MetricValue, ProvenanceBadge, StatusBadge } from '@/components/common'
import { metricOf, metrics, type MetricKey } from '@/components/metricConfig'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25
const MAX_COMPARE = 3

const columns: { key: MetricKey; sort?: SortKey }[] = [
  { key: 'spend', sort: 'spend' },
  { key: 'impressions', sort: 'impressions' },
  { key: 'ctr', sort: 'ctr' },
  { key: 'conversions', sort: 'conversions' },
  { key: 'roas', sort: 'roas' },
]

function Metric({ row, k }: { row: CreativeRow; k: MetricKey }) {
  const def = metrics[k]
  return <MetricValue value={metricOf(row, k)} format={def.format} unavailableReason={row.counts ? def.unavailable : 'No performance records in this period.'} />
}

export function Library() {
  const d = useDashboard()
  const { view, filters, route } = d
  if (!view || !filters) return null
  const p = route.params

  const layout = p.get('layout') === 'grid' ? 'grid' : 'table'
  const selected = p.get('compare')?.split(',').filter(Boolean) ?? []
  const comparing = p.get('comparing') === '1' && selected.length >= 2
  const pages = Math.max(1, Math.ceil(view.rows.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, Number(p.get('page') ?? 1)), pages)
  const visible = view.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filtered = !!(filters.search || filters.analysisStatuses?.length || filters.dataAvailability !== 'all' || filters.formats.length || filters.products.length || filters.platforms.length)

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= MAX_COMPARE ? selected : [...selected, id]
    d.setParams({ compare: next.join(','), comparing: next.length >= 2 && comparing ? '1' : null })
  }
  const sortBy = (key: SortKey) =>
    d.setParams({ sort: `${key}:${filters.sort.key === key && filters.sort.direction === 'desc' ? 'asc' : 'desc'}`, page: null })
  const clearFilters = () => d.setParams({ q: null, analysis: null, data: null, format: null, product: null, platform: null, page: null })

  return (
    <AppShell title="Creative Library" description={`${view.count} creatives · ${dateRange(filters.from, filters.to)}`}>
      <AnalysisConfigNotice />
      <BatchAnalysis ids={view.rows.map((r) => r.creative.creativeId)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={filters.search}
          onChange={(e) => d.setParams({ q: e.target.value, page: null })}
          placeholder="Search name, ID, product or attribute…"
          aria-label="Search creatives"
          className="h-8 w-full sm:w-72"
        />
        <Select value={filters.analysisStatuses?.[0] ?? 'all'} onValueChange={(v) => d.setParams({ analysis: v === 'all' ? null : v, page: null })}>
          <SelectTrigger size="sm" aria-label="Analysis status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any analysis status</SelectItem>
            {(['complete', 'failed', 'pending'] as AnalysisStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'complete' ? 'Analysed' : s === 'failed' ? 'Analysis failed' : 'Not analysed'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.dataAvailability ?? 'all'} onValueChange={(v) => d.setParams({ data: v === 'all' ? null : v, page: null })}>
          <SelectTrigger size="sm" aria-label="Data availability" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any data availability</SelectItem>
            <SelectItem value="with">Has performance data</SelectItem>
            <SelectItem value="without">No performance data</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={layout} onValueChange={(v) => v && d.setParams({ layout: v === 'grid' ? 'grid' : null })} className="ml-auto" aria-label="Layout">
          <ToggleGroupItem value="table" aria-label="Table view">
            <Rows3 aria-hidden /> Table
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid aria-hidden /> Grid
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {selected.length > 0 && (
        <div role="region" aria-label="Selection" className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-sm">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <span className="text-xs text-muted-foreground">{selected.length < 2 ? 'Select at least two to compare.' : `Up to ${MAX_COMPARE}.`}</span>
          <Button size="sm" className="ml-auto" disabled={selected.length < 2} onClick={() => d.setParams({ comparing: '1' })}>
            Compare {selected.length >= 2 ? selected.length : ''}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => d.setParams({ compare: null, comparing: null })}>
            <X aria-hidden /> Clear selection
          </Button>
        </div>
      )}

      {comparing && <Compare ids={selected} onClose={() => d.setParams({ comparing: null })} />}

      {view.count === 0 ? (
        <EmptyState
          title="No creatives match these filters"
          body={filters.search ? `Nothing matches “${filters.search}”.` : 'Try a longer period or remove a filter.'}
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : layout === 'grid' ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((r) => (
            <CreativeCard key={r.creative.creativeId} row={r} selected={selected.includes(r.creative.creativeId)} canSelect={selected.length < MAX_COMPARE} onToggle={toggle} />
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select for comparison</span>
                </TableHead>
                <TableHead>Creative</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Format</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.key} className="text-right" aria-sort={filters.sort.key === c.sort ? (filters.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <span className="inline-flex items-center gap-1">
                      <InfoTip text={metrics[c.key].help} label={`What is ${metrics[c.key].label}?`} />
                      <button type="button" onClick={() => sortBy(c.sort!)} className={cn('inline-flex items-center gap-1 hover:text-foreground', filters.sort.key === c.sort && 'text-foreground')}>
                        {metrics[c.key].label}
                        {filters.sort.key !== c.sort ? <ArrowUpDown className="size-3" aria-hidden /> : filters.sort.direction === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                      </button>
                    </span>
                  </TableHead>
                ))}
                <TableHead>Analysis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const id = r.creative.creativeId
                const isSelected = selected.includes(id)
                return (
                  <TableRow key={id} data-state={isSelected ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox checked={isSelected} disabled={!isSelected && selected.length >= MAX_COMPARE} onCheckedChange={() => toggle(id)} aria-label={`Select ${r.creative.name} for comparison`} />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => d.setParams({ preview: id })} className="flex items-center gap-3 text-left">
                        <CreativeThumb creative={r.creative} className="w-9" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium hover:underline">{r.creative.name}</span>
                            {r.creative.assetType === 'product_image' ? (
                              <span className="inline-flex items-center rounded-xs bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground border">Product image</span>
                            ) : (
                              <span className="inline-flex items-center rounded-xs bg-blue-500/10 px-1.5 py-0.2 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">Public ad</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{id}</span>
                            {r.creative.category && <span>· {r.creative.category}</span>}
                            {r.creative.price && <span className="font-semibold text-foreground">₹{r.creative.price.toLocaleString('en-IN')}</span>}
                          </div>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>{r.creative.platform === 'meta' ? 'Meta' : 'Google'}</TableCell>
                    <TableCell className="capitalize">{r.creative.format}</TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="text-right">
                        <Metric row={r} k={c.key} />
                      </TableCell>
                    ))}
                    <TableCell>
                      <AnalysisControl creativeId={id} size="xs" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <ProvenanceBadge kind="synthetic-performance" /> A dash means the metric can’t be calculated; hover it for the reason.
        </span>
        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => d.setParams({ page: page - 1 === 1 ? null : String(page - 1) })}>
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => d.setParams({ page: String(page + 1) })}>
              Next
            </Button>
          </nav>
        )}
      </div>

      <CreativePreviewSheet />
    </AppShell>
  )
}

function CreativeCard({ row, selected, canSelect, onToggle }: { row: CreativeRow; selected: boolean; canSelect: boolean; onToggle: (id: string) => void }) {
  const d = useDashboard()
  const id = row.creative.creativeId
  return (
    <li className={cn('relative flex flex-col gap-2 rounded-xl border p-2', selected && 'ring-2 ring-series-1')}>
      <Checkbox
        checked={selected}
        disabled={!selected && !canSelect}
        onCheckedChange={() => onToggle(id)}
        aria-label={`Select ${row.creative.name} for comparison`}
        className="absolute left-3 top-3 z-10 bg-background"
      />
      <div className="absolute right-3 top-3 z-10">
        {row.creative.assetType === 'product_image' ? (
          <span className="rounded bg-background/90 backdrop-blur-xs px-1.5 py-0.5 text-[10px] font-medium border shadow-xs">Product image</span>
        ) : (
          <span className="rounded bg-blue-600 text-white px-1.5 py-0.5 text-[10px] font-medium shadow-xs">Public ad</span>
        )}
      </div>
      <button type="button" onClick={() => d.setParams({ preview: id })} className="flex flex-col gap-2 text-left">
        <CreativeThumb creative={row.creative} className="w-full" />
        <span className="text-sm font-medium leading-tight">{row.creative.name}</span>
      </button>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{row.creative.platform === 'meta' ? 'Meta' : 'Google'} · {row.creative.category ?? row.creative.format}</span>
        {row.creative.price && <span className="font-semibold text-foreground">₹{row.creative.price.toLocaleString('en-IN')}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-1 text-xs">
        <div>
          <dt className="text-muted-foreground">CTR</dt>
          <dd className="font-medium">
            <Metric row={row} k="ctr" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ROAS</dt>
          <dd className="font-medium">
            <Metric row={row} k="roas" />
          </dd>
        </div>
      </dl>
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge tone="neutral">
          {row.creative.assetType === 'product_image' ? 'Product image' : 'Public ad'}
        </StatusBadge>
        <AnalysisControl creativeId={id} size="xs" />
        {!row.counts && <StatusBadge tone="neutral">No performance data</StatusBadge>}
      </span>
    </li>
  )
}

/** Quick look at a creative without leaving the library. */
function CreativePreviewSheet() {
  const d = useDashboard()
  const id = d.route.params.get('preview')
  const row = id ? d.view?.rows.find((r) => r.creative.creativeId === id) : undefined
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && d.setParams({ preview: null })}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.creative.name}</SheetTitle>
              <SheetDescription>
                {row.creative.creativeId} · {row.creative.platform === 'meta' ? 'Meta Ads' : 'Google Ads'} · {row.creative.format}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4">
              <CreativeThumb creative={row.creative} className="w-full max-w-xs self-center" />
              <div className="flex flex-wrap items-center gap-1.5">
                <ProvenanceBadge kind={row.creative.dataOrigin === 'public' ? 'public-asset' : 'synthetic-asset'} />
                <StatusBadge tone="neutral">
                  {row.creative.assetType === 'product_image' ? 'Product image' : 'Public ad'}
                </StatusBadge>
                <AnalysisStatusBadge creativeId={row.creative.creativeId} />
              </div>
              {row.creative.adCopy && (
                <div className="rounded-lg bg-muted/40 p-2.5 text-xs">
                  <span className="font-semibold text-foreground">Ad copy (as listed in the ad directory): </span>
                  <span className="text-muted-foreground">{row.creative.adCopy}</span>
                </div>
              )}
              {row.creative.source && (
                <div className="text-xs">
                  <a href={row.creative.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                    {row.creative.source.sourceType === 'official_product_page' ? 'View on snitch.com ↗' : 'View in ad directory (zooptrack) ↗'}
                  </a>
                </div>
              )}
              <dl className="grid grid-cols-3 gap-2">
                {(['spend', 'ctr', 'roas', 'impressions', 'conversions', 'cpa'] as MetricKey[]).map((k) => (
                  <div key={k} className="rounded-lg border px-2.5 py-2">
                    <dt className="text-[11px] text-muted-foreground">{metrics[k].label}</dt>
                    <dd className="text-sm font-semibold">
                      <Metric row={row} k={k} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <SheetFooter>
              <Button asChild>
                <a href={d.href(`creatives/${row.creative.creativeId}`, { back: window.location.hash.slice(1) })}>Open details</a>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Compare({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const d = useDashboard()
  const data = d.data!
  const f = d.filters!
  const base = { ...f, platforms: [], formats: [], products: [], search: '', analysisStatuses: [], dataAvailability: 'all' as const }
  const view = selectView(data.dataset, { ...base, creativeIds: ids })
  const rows = ids.map((id) => view.rows.find((r) => r.creative.creativeId === id)).filter((r): r is CreativeRow => !!r)
  const trends = new Map(ids.map((id) => [id, selectView(data.dataset, { ...base, creativeIds: [id] }).trend]))
  const weeks = d.weeks.filter((w) => w.start >= f.from && w.end <= f.to)
  const trendRows = weeks.map((w) => {
    const row: Record<string, string | number | null> = { periodStart: w.start }
    for (const id of ids) row[id] = trends.get(id)!.find((t) => t.periodStart === w.start)?.ctr ?? null
    return row
  })
  const platforms = new Set(rows.map((r) => r.creative.platform))
  const intelAttr = (r: CreativeRow, fn: (ci: CreativeIntelligence) => string) => {
    const a = d.analyses.get(r.creative.creativeId)
    if (a?.status !== 'complete') return a?.status === 'failed' ? 'Analysis failed' : 'Not analysed'
    const ci = getCreativeIntelligence(a.analysis)
    return fn(ci)
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Comparing {rows.length} creatives <ProvenanceBadge kind="synthetic-performance" />
        </CardTitle>
        <CardDescription>{dateRange(f.from, f.to)}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close comparison
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {platforms.size > 1 && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            These creatives run on different platforms. Meta and Google count clicks and attribute revenue differently, so compare with care.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                {rows.map((r) => (
                  <TableHead key={r.creative.creativeId} className="h-auto py-2 align-bottom">
                    <a href={d.href(`creatives/${r.creative.creativeId}`)} className="flex flex-col gap-1">
                      <CreativeThumb creative={r.creative} className="w-16" />
                      <span className="whitespace-normal text-xs">{r.creative.name}</span>
                    </a>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['Platform', (r: CreativeRow) => (r.creative.platform === 'meta' ? 'Meta' : 'Google')],
                ['Visual hook', (r: CreativeRow) => intelAttr(r, (ci) => ci.attributes.visual_hook)],
                ['Message hook', (r: CreativeRow) => intelAttr(r, (ci) => ci.attributes.message_hook)],
                ['Visual style', (r: CreativeRow) => intelAttr(r, (ci) => ci.attributes.visual_style)],
                ['Prominence', (r: CreativeRow) => intelAttr(r, (ci) => ci.attributes.product_prominence)],
                ['Offer', (r: CreativeRow) => intelAttr(r, (ci) => ci.message_breakdown.promotional_offer ?? 'None')],
              ].map(([label, render]) => (
                <TableRow key={label as string}>
                  <TableCell className="text-xs text-muted-foreground">{label as string}</TableCell>
                  {rows.map((r) => (
                    <TableCell key={r.creative.creativeId}>{(render as (r: CreativeRow) => string)(r)}</TableCell>
                  ))}
                </TableRow>
              ))}
              {(['impressions', 'spend', 'ctr', 'cpa', 'roas', 'conversions'] as MetricKey[]).map((k) => (
                <TableRow key={k}>
                  <TableCell className="text-xs text-muted-foreground">{metrics[k].label}</TableCell>
                  {rows.map((r) => (
                    <TableCell key={r.creative.creativeId}>
                      <Metric row={r} k={k} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">CTR by week</p>
            <WeeklyLineChart
              rows={trendRows}
              series={rows.map((r) => ({ key: r.creative.creativeId, label: r.creative.name }))}
              format={(v) => (v === null ? '—' : metrics.ctr.format(v))}
              caption="Weekly CTR for the selected creatives"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const BATCH_SIZE = 5

/** Analyses the next few unanalysed creatives in the current view, one at a time on the server. */
function BatchAnalysis({ ids }: { ids: string[] }) {
  const d = useDashboard()
  const [message, setMessage] = useState<string | null>(null)
  const pending = ids.filter((id) => d.analysisStatus(id) === 'not_analyzed')
  const done = ids.filter((id) => d.analysisStatus(id) === 'completed').length
  const failed = ids.filter((id) => d.analysisStatus(id) === 'failed').length
  const running = ids.some((id) => d.analysisStatus(id) === 'processing')
  const next = pending.slice(0, BATCH_SIZE)

  const run = async () => {
    setMessage(null)
    const results = await d.runAnalysis(next)
    const ok = results.filter((r) => r.ok).length
    setMessage(`${ok} of ${next.length} analysed${ok < next.length ? `; ${next.length - ok} failed (retry them individually)` : ''}.`)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        AI analysis: {done} of {ids.length} completed{failed ? `, ${failed} failed` : ''}.
      </span>
      {next.length > 0 && (
        <Button size="sm" variant="outline" disabled={running || !d.ai.available || !d.ai.configured} onClick={() => void run()}>
          {running ? 'Analysing…' : `Analyse next ${next.length}`}
        </Button>
      )}
      {d.ai.model && <span className="text-xs text-muted-foreground">Model: {d.ai.model}. Each analysis uses OpenRouter credits.</span>}
      {message && <span role="status" className="text-xs">{message}</span>}
    </div>
  )
}
