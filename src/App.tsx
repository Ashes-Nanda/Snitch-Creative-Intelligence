import { useEffect } from 'react'
import { DashboardProvider, useDashboard } from '@/app/context'
import { ErrorState, LoadingSkeleton } from '@/components/common'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CreativeDetail } from '@/pages/CreativeDetail'
import { DataQuality } from '@/pages/DataQuality'
import { Experiments } from '@/pages/Experiments'
import { Insights } from '@/pages/Insights'
import { Library } from '@/pages/Library'
import { Overview } from '@/pages/Overview'
import { SystemMetrics } from '@/pages/SystemMetrics'

function Routes() {
  const d = useDashboard()
  const path = d.route.segments.join('/')
  // A new page starts at the top; parameter changes on the same page keep the scroll position.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  if (!d.data || !d.filters) {
    if (d.loading) return <LoadingSkeleton />
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState title="The dataset couldn’t be loaded" body={d.failure?.message ?? 'No data is available.'} onRetry={() => void d.refresh()} />
      </div>
    )
  }

  const [page, id] = d.route.segments
  switch (page) {
    case 'library':
      return <Library />
    case 'creatives':
      return <CreativeDetail key={id} id={id ?? ''} />
    case 'insights':
      return <Insights />
    case 'experiments':
      return <Experiments />
    case 'data-quality':
      return <DataQuality />
    case 'system-metrics':
      return <SystemMetrics />
    default:
      return <Overview />
  }
}

export default function App() {
  return (
    <TooltipProvider>
      <DashboardProvider>
        <Routes />
      </DashboardProvider>
    </TooltipProvider>
  )
}
