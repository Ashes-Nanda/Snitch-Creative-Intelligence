const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('en-IN')

/** Shown for an unavailable metric: never zero. */
export const NA = '—'

export function money(v: number | null): string {
  return v === null ? NA : inr.format(v)
}

export function percent(v: number | null, digits = 2): string {
  return v === null ? NA : `${v.toFixed(digits)}%`
}

export function times(v: number | null): string {
  return v === null ? NA : `${v.toFixed(2)}×`
}

export function count(v: number): string {
  return integer.format(v)
}

export function compactNumber(v: number): string {
  return compact.format(v)
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function dateRange(from: string, to: string): string {
  return `${shortDate(from)} – ${shortDate(to)}`
}

export function clock(d: Date): string {
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
