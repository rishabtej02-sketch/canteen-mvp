// ============================================================================
// Operator > Inventory  (Phase 4 surface)
// ============================================================================
// Live view of every ingredient: current stock, projected burn rate, when it
// runs out today, and a status pill. Merges `ingredients` (stock) with
// `depletion_alerts` (burn/ETA, only present for at-risk items).
//
// Augmentation checkpoint: operator restocks an ingredient -> updates stock,
// logs a human_override to model_runs (depletion_v1), and re-invokes
// predict-depletion so burn + alerts recompute immediately.
// ============================================================================
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getOperator } from '@/lib/auth'

interface Ingredient {
  id: number
  name: string
  unit: string
  stock_qty: number
  reorder_threshold: number
  updated_at: string
}

interface Alert {
  ingredient_id: number
  burn_per_min: number | null
  minutes_to_empty: number | null
  projected_empty_at: string | null
  severity: 'warning' | 'critical'
  affected_items: { id: number; name: string }[]
}

type Status = 'critical' | 'warning' | 'low' | 'healthy'

interface Row extends Ingredient {
  burn_per_min: number | null
  minutes_to_empty: number | null
  projected_empty_at: string | null
  affected_count: number
  status: Status
}

const STATUS_RANK: Record<Status, number> = { critical: 0, warning: 1, low: 2, healthy: 3 }

export default function InventoryPage() {
  const supabase = getSupabase()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [edit, setEdit] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [ing, al] = await Promise.all([
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('depletion_alerts').select('*'),
    ])
    if (ing.error) console.error('ingredients load', ing.error)
    if (al.error) console.error('alerts load', al.error)
    setIngredients((ing.data ?? []) as unknown as Ingredient[])
    setAlerts((al.data ?? []) as unknown as Alert[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('inventory_live')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'ingredients' }, () => load())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'depletion_alerts' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  const rows: Row[] = useMemo(() => {
    const alertById = new Map<number, Alert>()
    for (const a of alerts) alertById.set(Number(a.ingredient_id), a)
    return ingredients
      .map((ing: Ingredient): Row => {
        const a = alertById.get(Number(ing.id))
        let status: Status = 'healthy'
        if (a) status = a.severity === 'critical' ? 'critical' : 'warning'
        else if (Number(ing.stock_qty) <= Number(ing.reorder_threshold)) status = 'low'
        return {
          ...ing,
          burn_per_min: a?.burn_per_min ?? null,
          minutes_to_empty: a?.minutes_to_empty ?? null,
          projected_empty_at: a?.projected_empty_at ?? null,
          affected_count: a?.affected_items?.length ?? 0,
          status,
        }
      })
      .sort((x: Row, y: Row) => STATUS_RANK[x.status] - STATUS_RANK[y.status] || x.name.localeCompare(y.name))
  }, [ingredients, alerts])

  const atRisk = rows.filter((r: Row) => r.status === 'critical' || r.status === 'warning').length

  async function restock(r: Row) {
    const raw = edit[r.id]
    const value = Number(raw)
    if (busy != null || raw == null || raw === '' || !isFinite(value) || value < 0) return
    setBusy(r.id)
    const operator = getOperator()

    const { error } = await supabase
      .from('ingredients')
      .update({ stock_qty: value, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) { console.error('restock error', error); setBusy(null); return }

    // Augmentation audit
    try {
      await supabase.from('model_runs').insert({
        model_name: 'depletion_v1',
        run_at: new Date().toISOString(),
        status: 'human_override',
        items_scored: 0,
        notes: JSON.stringify({
          action: 'restock',
          ingredient: r.name,
          by: operator?.label ?? 'operator',
          previous: r.stock_qty,
          new_stock: value,
        }),
      })
    } catch (e) { console.error('restock audit failed', e) }

    // Recompute burn/alerts immediately
    try { await supabase.functions.invoke('predict-depletion', { body: {} }) }
    catch (e) { console.error('re-invoke failed', e) }

    setEdit((prev) => { const n = { ...prev }; delete n[r.id]; return n })
    setBusy(null)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-slate-500">
            Live ingredient stock and projected run-out. Burn rates come from
            today&apos;s forecast + live orders, refreshed every 15 min.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="stat px-4 py-2">
            <div className="stat-label">Ingredients</div>
            <div className="text-lg font-bold text-slate-900">{ingredients.length}</div>
          </div>
          <div className="stat px-4 py-2">
            <div className="stat-label">At risk</div>
            <div className={`text-lg font-bold ${atRisk > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {atRisk}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card h-64 animate-pulse bg-slate-100" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Ingredient</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Burn / min</th>
                <th className="px-4 py-3">Runs out</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Restock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: Row) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.stock_qty} <span className="text-xs text-slate-400">{r.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.burn_per_min != null ? `${r.burn_per_min} ${r.unit}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.projected_empty_at
                      ? new Date(r.projected_empty_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                    {r.minutes_to_empty != null && (
                      <span className="ml-1 text-xs text-slate-400">(~{r.minutes_to_empty}m)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} affected={r.affected_count} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder={String(r.stock_qty)}
                        value={edit[r.id] ?? ''}
                        onChange={(e) => setEdit((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => restock(r)}
                        disabled={busy != null || !edit[r.id]}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                      >
                        {busy === r.id ? '…' : 'Set'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status, affected }: { status: Status; affected: number }) {
  const map: Record<Status, { label: string; cls: string }> = {
    critical: { label: `🔴 Critical`, cls: 'bg-red-100 text-red-700' },
    warning: { label: `🟠 Low soon`, cls: 'bg-amber-100 text-amber-700' },
    low: { label: `🟡 Below reorder`, cls: 'bg-yellow-100 text-yellow-700' },
    healthy: { label: `🟢 Healthy`, cls: 'bg-emerald-100 text-emerald-700' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
      {(status === 'critical' || status === 'warning') && affected > 0 && (
        <span className="ml-1 opacity-70">· {affected} items</span>
      )}
    </span>
  )
}
