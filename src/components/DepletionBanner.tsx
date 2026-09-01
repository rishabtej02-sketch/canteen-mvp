// ============================================================================
// DepletionBanner — KDS red banner for projected ingredient stockouts
// ============================================================================
// Drop <DepletionBanner /> at the top of the KDS page. Self-contained:
// fetches depletion_alerts, subscribes realtime, renders one card per at-risk
// ingredient. Augmentation checkpoint lives here:
//   - Mark affected sold-out  -> menu_items.is_available = false (next
//     predict-depletion run recomputes with lower burn)
//   - Defer 2h                -> depletion_alerts.deferred_until = now+2h
// Both decisions log to model_runs (depletion_v1, status='human_override').
// ============================================================================
'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getOperator } from '@/lib/auth'

interface AffectedItem { id: number; name: string }

interface DepletionAlert {
  ingredient_id: number
  ingredient_name: string
  projected_empty_at: string | null
  minutes_to_empty: number | null
  burn_per_min: number | null
  severity: 'warning' | 'critical'
  affected_items: AffectedItem[]
  deferred_until: string | null
  updated_at: string
}

const DEFER_HOURS = 2

export default function DepletionBanner() {
  const [alerts, setAlerts] = useState<DepletionAlert[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    load()
    const supabase = getSupabase()
    const channel = supabase
      .channel('depletion_alerts_live')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'depletion_alerts' },
        () => load(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function load() {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('depletion_alerts')
      .select('*')
      .order('severity', { ascending: true })
    if (error) { console.error('depletion load error', error); return }
    const nowIso = new Date().toISOString()
    const visible = (data as unknown as DepletionAlert[]).filter(
      (a: DepletionAlert) => !a.deferred_until || a.deferred_until < nowIso,
    )
    setAlerts(visible)
  }

  async function logOverride(action: string, payload: Record<string, unknown>) {
    const supabase = getSupabase()
    try {
      await supabase.from('model_runs').insert({
        model_name: 'depletion_v1',
        run_at: new Date().toISOString(),
        status: 'human_override',
        items_scored: 0,
        notes: JSON.stringify({ action, ...payload }),
      })
    } catch (e) { console.error('override audit failed', e) }
  }

  async function markSoldOut(a: DepletionAlert) {
    if (busy != null) return
    setBusy(a.ingredient_id)
    const supabase = getSupabase()
    const operator = getOperator()
    const ids = a.affected_items.map((i: AffectedItem) => i.id)
    if (ids.length > 0) {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: false })
        .in('id', ids)
      if (error) console.error('mark sold-out error', error)
    }
    await logOverride('mark_sold_out', {
      ingredient: a.ingredient_name,
      by: operator?.label ?? 'operator',
      affected_item_ids: ids,
      minutes_to_empty: a.minutes_to_empty,
    })
    setBusy(null)
    load()
  }

  async function defer(a: DepletionAlert) {
    if (busy != null) return
    setBusy(a.ingredient_id)
    const supabase = getSupabase()
    const operator = getOperator()
    const until = new Date(Date.now() + DEFER_HOURS * 3600_000).toISOString()
    const { error } = await supabase
      .from('depletion_alerts')
      .update({ deferred_until: until })
      .eq('ingredient_id', a.ingredient_id)
    if (error) console.error('defer error', error)
    await logOverride('defer_alert', {
      ingredient: a.ingredient_name,
      by: operator?.label ?? 'operator',
      deferred_until: until,
    })
    setBusy(null)
    load()
  }

  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((a: DepletionAlert) => {
        const crit = a.severity === 'critical'
        const emptyText = a.projected_empty_at
          ? new Date(a.projected_empty_at).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit',
            })
          : 'soon'
        const n = a.affected_items.length
        return (
          <div
            key={a.ingredient_id}
            className={`rounded-xl border p-4 ${
              crit ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${crit ? 'text-red-800' : 'text-amber-900'}`}>
                  {crit ? '🔴' : '🟠'} {a.ingredient_name} gone ~{emptyText}
                  {a.minutes_to_empty != null && (
                    <span className="font-normal"> · ~{a.minutes_to_empty} min left</span>
                  )}
                </div>
                <div className={`mt-1 text-xs ${crit ? 'text-red-700' : 'text-amber-800'}`}>
                  {n} item{n === 1 ? '' : 's'} affected:{' '}
                  {a.affected_items.map((i: AffectedItem) => i.name).join(', ')}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => markSoldOut(a)}
                  disabled={busy != null}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  Mark {n} sold-out
                </button>
                <button
                  type="button"
                  onClick={() => defer(a)}
                  disabled={busy != null}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 disabled:opacity-60"
                >
                  Defer {DEFER_HOURS}h
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
