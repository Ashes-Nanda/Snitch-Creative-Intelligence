import { useCallback, useEffect, useState } from 'react'

/** Query parameters that scope every page, carried across navigation. */
export const GLOBAL_PARAMS = ['from', 'to', 'platform', 'format', 'product'] as const

export interface Route {
  /** Path segments, e.g. ['creatives', 'cr-001']. */
  segments: string[]
  params: URLSearchParams
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/overview'
  const [path, query = ''] = raw.split('?')
  return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) }
}

function write(segments: string[], params: URLSearchParams, replace: boolean) {
  const query = params.toString()
  const hash = `#/${segments.join('/')}${query ? `?${query}` : ''}`
  if (replace) window.history.replaceState(null, '', hash)
  else window.history.pushState(null, '', hash)
}

/** Hash routing with the URL as the single source of truth for page, filters and selection. */
export function useRouter() {
  const [route, setRoute] = useState<Route>(read)

  useEffect(() => {
    const sync = () => setRoute(read())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  /** Goes to a page, keeping global filters. `params` adds page-specific parameters. */
  const navigate = useCallback((path: string, params: Record<string, string> = {}) => {
    const current = read().params
    const next = new URLSearchParams()
    for (const k of GLOBAL_PARAMS) {
      const v = current.get(k)
      if (v) next.set(k, v)
    }
    for (const [k, v] of Object.entries(params)) if (v) next.set(k, v)
    write(path.split('/').filter(Boolean), next, false)
    setRoute(read())
  }, [])

  /** Updates parameters on the current page without adding a history entry. Empty values are removed. */
  const setParams = useCallback((patch: Record<string, string | null | undefined>) => {
    const current = read()
    const next = new URLSearchParams(current.params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    write(current.segments, next, true)
    setRoute(read())
  }, [])

  /** An href for a link that keeps global filters. */
  const href = useCallback(
    (path: string, params: Record<string, string> = {}) => {
      const next = new URLSearchParams()
      for (const k of GLOBAL_PARAMS) {
        const v = route.params.get(k)
        if (v) next.set(k, v)
      }
      for (const [k, v] of Object.entries(params)) if (v) next.set(k, v)
      const q = next.toString()
      return `#/${path.replace(/^\//, '')}${q ? `?${q}` : ''}`
    },
    [route],
  )

  return { route, navigate, setParams, href }
}
