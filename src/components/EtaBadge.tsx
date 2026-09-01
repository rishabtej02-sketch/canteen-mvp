// Reusable ETA pill: "~14 min · 3 ahead"
// Use anywhere you need a compact ETA display (cart, order card, etc.)
'use client'

interface Props {
  etaSec: number | null | undefined
  queueDepth?: number | null | undefined
  compact?: boolean
}

export default function EtaBadge({ etaSec, queueDepth, compact = false }: Props) {
  if (etaSec == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        ETA calculating…
      </span>
    )
  }

  const min = Math.max(1, Math.round(etaSec / 60))
  const ahead =
    queueDepth == null ? null :
    queueDepth === 0 ? 'no wait' :
    queueDepth === 1 ? '1 ahead' :
    `${queueDepth} ahead`

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
        ~{min} min
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
      <span aria-hidden>⏱</span>
      <span>~{min} min</span>
      {ahead && <span className="text-indigo-500">· {ahead}</span>}
    </span>
  )
}
