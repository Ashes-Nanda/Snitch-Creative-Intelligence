import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compactNumber, NA, shortDate } from '@/app/format'
import { Button } from '@/components/ui/button'

export const seriesColors = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)']

interface Series {
  key: string
  label: string
}

type Row = Record<string, string | number | null>

/**
 * A line chart for one to three series over reporting weeks.
 * Values are never colour-only: ≥2 series get a legend, and every chart has a table view.
 */
export function WeeklyLineChart({
  rows,
  series,
  format,
  height = 220,
  caption,
}: {
  rows: Row[]
  series: Series[]
  format: (v: number | null) => string
  height?: number
  caption: string
}) {
  const [asTable, setAsTable] = useState(false)

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
            {series.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: seriesColors[i] }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'View as table'}
        </Button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Week of</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-4 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.periodStart)} className="border-t border-border">
                  <td className="py-1 pr-4">{shortDate(String(r.periodStart))}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-4 text-right">
                      {format(r[s.key] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={caption}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="periodStart"
                tickFormatter={shortDate}
                stroke="var(--color-axis)"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                width={56}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? compactNumber(v) : format(v))}
                stroke="var(--color-axis)"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ stroke: 'var(--color-axis)', strokeWidth: 1 }} content={(p) => <TooltipBody active={p.active} payload={p.payload} label={p.label} series={series} format={format} />} />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={seriesColors[i]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2, fill: seriesColors[i] }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  )
}

function TooltipBody({
  active,
  payload,
  label,
  series,
  format,
}: {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  label?: unknown
  series: Series[]
  format: (v: number | null) => string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">Week of {shortDate(String(label))}</p>
      {series.map((s, i) => {
        const v = row[s.key] as number | null | undefined
        return (
          <p key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded" style={{ background: seriesColors[i] }} aria-hidden />
            <strong className="tabular font-semibold text-foreground">{v === undefined ? NA : format(v)}</strong>
            {series.length > 1 && <span className="text-muted-foreground">{s.label}</span>}
          </p>
        )
      })}
    </div>
  )
}

/** Two horizontal bars: the insight group against its comparison group. */
export function GroupComparison({
  group,
  comparison,
  format,
}: {
  group: { label: string; value: number; n: number }
  comparison: { label: string; value: number; n: number }
  format: (v: number) => string
}) {
  const max = Math.max(group.value, comparison.value) || 1
  const bar = (b: typeof group, colour: string) => (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3 text-xs" title={`${b.label}: ${format(b.value)} (${b.n} creatives)`}>
      <span className="truncate text-muted-foreground">
        {b.label} <span className="text-muted-foreground">· n={b.n}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 rounded-r" style={{ width: `${(b.value / max) * 80}%`, background: colour }} />
        <strong className="tabular font-semibold">{format(b.value)}</strong>
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {bar(group, 'var(--color-series-1)')}
      {bar(comparison, 'var(--color-axis)')}
    </div>
  )
}
