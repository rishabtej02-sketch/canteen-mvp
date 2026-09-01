// Live countdown for an active order. Ticks every second.
// Displays big remaining time + range + reason text.
'use client'

import { useEffect, useState } from 'react'
import { computeCountdown } from '@/lib/eta'

interface Props {
  placedAt: string
  etaSeconds: number | null | undefined
  readyAt: string | null | undefined
  etaLowerMin?: number | null | undefined
  etaUpperMin?: number | null | undefined
  reason?: string | null | undefined
}

export default function EtaCountdown({
  placedAt,
  etaSeconds,
  readyAt,
  etaLowerMin,
  etaUpperMin,
  reason,
}: Props) {
  // Force re-render every second to update the countdown.
  const [, setTick] = useState(0)

  useEffect(() => {
    if (readyAt) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [readyAt])

  if (etaSeconds == null && !readyAt) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-500">ETA calculating…</div>
      </div>
    )
  }

  const { text, isOverdue } = computeCountdown(
    placedAt,
    etaSeconds ?? 0,
    readyAt ?? null,
  )

  const isReady = !!readyAt
  const ring = isReady
    ? 'border-emerald-300 bg-emerald-50'
    : isOverdue
    ? 'border-amber-300 bg-amber-50'
    : 'border-indigo-200 bg-indigo-50'
  const label = isReady
    ? 'text-emerald-700'
    : isOverdue
    ? 'text-amber-700'
    : 'text-indigo-700'

  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className={`text-3xl font-bold ${label}`}>{text}</div>
        {!isReady && etaLowerMin != null && etaUpperMin != null && (
          <div className="text-xs text-slate-500">
            range: {etaLowerMin}–{etaUpperMin} min
          </div>
        )}
      </div>
      {!isReady && reason && (
        <div className="mt-1 text-xs text-slate-600">{reason}</div>
      )}
    </div>
  )
}
