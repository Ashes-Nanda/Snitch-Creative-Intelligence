import type { ReactNode } from 'react'
import { Activity, BarChart3, Database, FlaskConical, LayoutGrid, Lightbulb, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useDashboard } from '@/app/context'
import { clock, dateRange } from '@/app/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageContainer, StatusBadge } from './common'

const nav = [
  { path: 'overview', label: 'Overview', icon: BarChart3 },
  { path: 'library', label: 'Creative Library', icon: LayoutGrid },
  { path: 'insights', label: 'Insights', icon: Lightbulb },
  { path: 'experiments', label: 'Experiments', icon: FlaskConical },
  { path: 'data-quality', label: 'Data quality', icon: Database },
  { path: 'system-metrics', label: 'System metrics', icon: Activity },
] as const

function AppSidebar() {
  const d = useDashboard()
  const current = d.route.segments[0] === 'creatives' ? 'library' : (d.route.segments[0] ?? 'overview')
  const needsReview = d.experiments.list.filter((p) => p.status === 'needs_review').length
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col px-2 py-1.5 group-data-[collapsible=icon]:hidden">
          <span className="text-sm font-semibold">Creative Intelligence</span>
          <span className="text-xs text-muted-foreground">Demo workspace · weekly review</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.path}>
                <SidebarMenuButton asChild isActive={current === n.path} tooltip={n.label}>
                  <a href={d.href(n.path)} aria-current={current === n.path ? 'page' : undefined}>
                    <n.icon aria-hidden />
                    <span>{n.label}</span>
                  </a>
                </SidebarMenuButton>
                {n.path === 'experiments' && needsReview > 0 && <SidebarMenuBadge aria-label={`${needsReview} need review`}>{needsReview}</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 text-[11px] leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
          Independent prototype. Not affiliated with or endorsed by Snitch.
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}

/** Persistent disclosure that performance figures are synthetic. */
function DemoDataBanner() {
  return (
    <div role="note" className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 md:px-6">
      <strong className="font-semibold">Synthetic performance data.</strong> Campaign metrics are generated for this demo and are not real SNITCH results. Creative images are public SNITCH assets, linked to their sources.
    </div>
  )
}

export function AppShell({
  title,
  description,
  breadcrumb,
  action,
  filters = 'global',
  children,
}: {
  title: string
  description?: string
  breadcrumb?: ReactNode
  action?: ReactNode
  filters?: 'global' | 'period' | 'none'
  children: ReactNode
}) {
  const d = useDashboard()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <DemoDataBanner />
        {d.failure && d.data && (
          <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
            <AlertTitle>Refresh failed at {clock(d.failure.at)}</AlertTitle>
            <AlertDescription>
              {d.failure.message}. Showing the last successful data, loaded {clock(d.data.loadedAt)}.
            </AlertDescription>
          </Alert>
        )}
        <PageContainer className="pt-4">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <SidebarTrigger className="-ml-1 mt-0.5" />
              <div className="min-w-0">
                {breadcrumb}
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DataStatus />
              {action}
            </div>
          </header>
          {filters !== 'none' && <GlobalFilters dimensions={filters === 'global'} />}
          <main className={d.loading && d.data ? 'opacity-60 transition-opacity' : 'transition-opacity'}>{children}</main>
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  )
}

function DataStatus() {
  const d = useDashboard()
  if (!d.data) return null
  return (
    <div className="flex items-center gap-1.5">
      <a href={d.href('data-quality')} className="hidden items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted sm:flex">
        <span className={d.failure ? 'size-2 rounded-full bg-destructive' : 'size-2 rounded-full bg-green-600'} aria-hidden />
        {d.failure ? 'Refresh failed' : 'Loaded'} {clock(d.data.loadedAt)}
        <StatusBadge tone="warn">Synthetic</StatusBadge>
      </a>
      <Button variant="outline" size="sm" onClick={() => void d.refresh()} disabled={d.loading} aria-label="Refresh data">
        <RefreshCw className={d.loading ? 'animate-spin' : undefined} aria-hidden />
        <span className="hidden sm:inline">{d.loading ? 'Refreshing' : 'Refresh'}</span>
      </Button>
    </div>
  )
}

/** Date and platform filters shared by every page; format and product where they apply. */
function GlobalFilters({ dimensions }: { dimensions: boolean }) {
  const d = useDashboard()
  const f = d.filters
  if (!f) return null
  const controls = <FilterControls dimensions={dimensions} />
  return (
    <div className="mb-4">
      <div className="hidden flex-wrap items-center gap-2 md:flex" aria-label="Filters">
        {controls}
        <span className="ml-auto text-xs text-muted-foreground">{dateRange(f.from, f.to)}</span>
      </div>
      <div className="flex items-center justify-between md:hidden">
        <span className="text-xs text-muted-foreground">{dateRange(f.from, f.to)}</span>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal aria-hidden /> Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col items-stretch gap-3 px-4 pb-6">{controls}</div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

function FilterControls({ dimensions }: { dimensions: boolean }) {
  const d = useDashboard()
  const f = d.filters!
  const weeks = d.weeks
  const presets = [1, 2, 4, weeks.length].filter((n, i, a) => n <= weeks.length && a.indexOf(n) === i)
  const presetFor = (n: number) => ({ from: weeks[weeks.length - n].start, to: weeks[weeks.length - 1].end })
  const active = presets.find((n) => presetFor(n).from === f.from && presetFor(n).to === f.to)
  const products = [...new Set(d.data!.dataset.creatives.map((c) => c.productId).filter((p): p is string => !!p))].sort()
  const page = (patch: Record<string, string | null>) => d.setParams({ ...patch, page: null })

  return (
    <>
      <Select value={active ? String(active) : 'custom'} onValueChange={(v) => v !== 'custom' && page(presetFor(Number(v)))}>
        <SelectTrigger size="sm" aria-label="Reporting period" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n === weeks.length ? `All ${n} weeks` : n === 1 ? 'Latest week' : `Last ${n} weeks`}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1 text-sm">
        <input type="date" aria-label="From" value={f.from} min={weeks[0].start} max={f.to} onChange={(e) => e.target.value && page({ from: e.target.value })} className="h-7 rounded-md border bg-background px-2 text-sm" />
        <span className="text-muted-foreground">to</span>
        <input type="date" aria-label="To" value={f.to} min={f.from} max={weeks[weeks.length - 1].end} onChange={(e) => e.target.value && page({ to: e.target.value })} className="h-7 rounded-md border bg-background px-2 text-sm" />
      </div>
      <Separator orientation="vertical" className="hidden h-5 md:block" />
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Platform"
        value={f.platforms.length === 1 ? f.platforms[0] : 'all'}
        onValueChange={(v) => v && page({ platform: v === 'all' ? null : v })}
      >
        <ToggleGroupItem value="all">All platforms</ToggleGroupItem>
        <ToggleGroupItem value="meta">Meta</ToggleGroupItem>
        <ToggleGroupItem value="google">Google</ToggleGroupItem>
      </ToggleGroup>
      {dimensions && (
        <>
          <Select value={f.formats[0] ?? 'all'} onValueChange={(v) => page({ format: v === 'all' ? null : v })}>
            <SelectTrigger size="sm" aria-label="Format" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.products[0] ?? 'all'} onValueChange={(v) => page({ product: v === 'all' ? null : v })}>
            <SelectTrigger size="sm" aria-label="Product" className="w-36 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {products.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </>
  )
}
