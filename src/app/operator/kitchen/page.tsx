// ============================================================================
// Operator > Kitchen Control
// ============================================================================
// Two augmentation checkpoints wired to the ETA model:
//   1. Kitchen Mode (Normal/Rush/Slow) — live multiplier, flips per surge
//   2. Throughput tuning — daily suggestion after MAPE review, operator decides
//
// All operator decisions logged to model_runs (status='human_override').
//
// HK1 FIX (Session 5): audit insert used inputs/outputs jsonb columns that do
// not exist -> insert threw -> swallowed -> 0 override rows. Real columns:
// model_name, run_at, status, items_scored, duration_ms, notes. Payload now
// serialized into notes.
// ============================================================================
'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getOperator } from '@/lib/auth'

type SpeedMode = 'Normal' | 'Rush' | 'Slow'

interface KitchenSettings {
  speed_mode: SpeedMode
  throughput_per_min: number
  updated_at: string
  updated_by: string | null
}

interface MapeStats {
  order_count: number
  avg_predicted_min: number
  avg_actual_min: number
  mape_pct: number
  suggested_throughput: number | null
}

interface MapeRow {
  predicted: number
  actual: number
}

interface OrderRow {
  placed_at: string
  ready_at: string
  predicted_eta_min: number
}

const MODES: SpeedMode[] = ['Slow', 'Normal', 'Rush']

export default function KitchenPage() {
  const [ks, setKs] = useState<KitchenSettings | null>(null)
  const [stats, setStats] = useState<MapeStats | null>(null)
  const [saving, setSaving] = useState(false)
  const [throughputEdit, setThroughputEdit] = useState<string>('')
  const [ignoredSuggestion, setIgnoredSuggestion] = useState(false)

  // Load + realtime subscribe
  useEffect(() => {
    loadSettings()
    const supabase = getSupabase()
    const channel = supabase
      .channel('kitchen_settings_live')
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'kitchen_settings' },
        () => loadSettings(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Recompute suggestion whenever settings load (needs current throughput)
  useEffect(() => {
    if (ks) loadStats(ks.throughput_per_min)
  }, [ks?.throughput_per_min])

  async function loadSettings() {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('kitchen_settings')
      .select('speed_mode, throughput_per_min, updated_at, updated_by')
      .eq('id', 1)
      .single()
    if (error) {
      console.error('loadSettings error', error)
      return
    }
    if (data) {
      setKs(data as unknown as KitchenSettings)
      setThroughputEdit(String((data as any).throughput_per_min))
    }
  }

  async function loadStats(currentThroughput: number) {
    const supabase = getSupabase()

    // Yesterday's IST window (approx — using local date; good enough for demo)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yStart = new Date(yesterday)
    yStart.setHours(0, 0, 0, 0)
    const yEnd = new Date(yesterday)
    yEnd.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('orders')
      .select('placed_at, ready_at, predicted_eta_min')
      .not('predicted_eta_min', 'is', null)
      .not('ready_at', 'is', null)
      .gte('placed_at', yStart.toISOString())
      .lte('placed_at', yEnd.toISOString())

    if (error) {
      console.error('loadStats error', error)
      return
    }

    if (!data || data.length === 0) {
      setStats({
        order_count: 0,
        avg_predicted_min: 0,
        avg_actual_min: 0,
        mape_pct: 0,
        suggested_throughput: null,
      })
      return
    }

    const rows: MapeRow[] = (data as unknown as OrderRow[])
      .map((r: OrderRow): MapeRow => {
        const actualMin =
          (new Date(r.ready_at).getTime() - new Date(r.placed_at).getTime()) / 60000
        return { predicted: Number(r.predicted_eta_min), actual: actualMin }
      })
      .filter((r: MapeRow) => r.actual > 0 && r.predicted > 0)

    if (rows.length === 0) {
      setStats({
        order_count: 0,
        avg_predicted_min: 0,
        avg_actual_min: 0,
        mape_pct: 0,
        suggested_throughput: null,
      })
      return
    }

    const n = rows.length
    const avgPred = rows.reduce((s: number, r: MapeRow) => s + r.predicted, 0) / n
    const avgAct = rows.reduce((s: number, r: MapeRow) => s + r.actual, 0) / n
    const mape =
      (rows.reduce(
        (s: number, r: MapeRow) => s + Math.abs(r.actual - r.predicted) / r.actual,
        0,
      ) /
        n) *
      100

    // Suggestion: if MAPE > 20%, propose throughput scaled by predicted/actual ratio
    // Under-predicting (actual > predicted) → throughput was overestimated → lower it
    let suggested: number | null = null
    if (mape > 20) {
      const proposal = Math.round(currentThroughput * (avgPred / avgAct) * 10) / 10
      if (proposal !== currentThroughput && proposal > 0) suggested = proposal
    }

    setStats({
      order_count: n,
      avg_predicted_min: Math.round(avgPred * 10) / 10,
      avg_actual_min: Math.round(avgAct * 10) / 10,
      mape_pct: Math.round(mape * 10) / 10,
      suggested_throughput: suggested,
    })
  }

  async function setMode(mode: SpeedMode) {
    if (saving || !ks || ks.speed_mode === mode) return
    setSaving(true)
    const supabase = getSupabase()
    const operator = getOperator()
    const { error } = await supabase
      .from('kitchen_settings')
      .update({
        speed_mode: mode,
        updated_by: operator?.label ?? 'operator',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    if (error) console.error('setMode error', error)
    setSaving(false)
  }

  async function saveThroughput(value: number, source: 'manual' | 'suggestion') {
    if (saving || !isFinite(value) || value <= 0 || !ks) return
    setSaving(true)
    const supabase = getSupabase()
    const operator = getOperator()

    const { error } = await supabase
      .from('kitchen_settings')
      .update({
        throughput_per_min: value,
        updated_by: operator?.label ?? 'operator',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    if (error) {
      console.error('saveThroughput error', error)
      setSaving(false)
      return
    }

    // Audit: operator tuning decision (best-effort)
    // FIX: real model_runs columns only. Decision payload -> notes.
    try {
      await supabase.from('model_runs').insert({
        model_name: 'eta_v1',
        run_at: new Date().toISOString(),
        status: 'human_override',
        items_scored: 0,
        notes: JSON.stringify({
          action: 'throughput_tuning',
          source,
          previous: ks.throughput_per_min,
          new_throughput: value,
          accepted_suggestion: source === 'suggestion',
          mape_yesterday: stats?.mape_pct ?? null,
          suggested: stats?.suggested_throughput ?? null,
        }),
      })
    } catch (e) {
      console.error('audit log failed', e)
    }

    setIgnoredSuggestion(false)
    setSaving(false)
  }

  if (!ks) {
    return <div className="p-6 text-slate-500">Loading kitchen settings…</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Kitchen Control</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your live settings for the wait times students see. Any change here
          reaches their screens within seconds.
        </p>
      </header>

      {/* --- Kitchen Mode --------------------------------------------------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Kitchen Mode</h2>
            <p className="text-xs text-slate-500">
              Adjusts every new wait time. Switch this during a rush or a quiet
              spell — Rush shows longer waits, Slow shows shorter ones.
            </p>
          </div>
          <span className="whitespace-nowrap text-xs text-slate-400">
            updated {new Date(ks.updated_at).toLocaleTimeString()} · by{' '}
            {ks.updated_by ?? '—'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m: SpeedMode) => {
            const active = ks.speed_mode === m
            const mult = m === 'Slow' ? '×0.8' : m === 'Rush' ? '×1.4' : '×1.0'
            const cls = active
              ? m === 'Rush'
                ? 'border-red-400 bg-red-50 text-red-700'
                : m === 'Slow'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-indigo-400 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={saving}
                className={`rounded-xl border-2 p-4 text-center transition ${cls} disabled:opacity-60`}
              >
                <div className="text-lg font-bold">{m}</div>
                <div className="mt-0.5 text-xs opacity-70">{mult}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* --- Throughput ----------------------------------------------------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3">
          <h2 className="font-semibold text-slate-900">Kitchen Speed</h2>
          <p className="text-xs text-slate-500">
            How many orders your kitchen finishes each minute at normal pace.
            This is what wait times are worked out from.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              orders / minute
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={throughputEdit}
              onChange={(e) => setThroughputEdit(e.target.value)}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => saveThroughput(Number(throughputEdit), 'manual')}
            disabled={
              saving ||
              !throughputEdit ||
              Number(throughputEdit) === ks.throughput_per_min
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
          <span className="pb-2 text-sm text-slate-500">
            now: <b>{ks.throughput_per_min}</b> per min
          </span>
        </div>
      </section>

      {/* --- Yesterday's Accuracy + Suggestion ------------------------------ */}
      {stats && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="font-semibold text-slate-900">Yesterday's Accuracy</h2>
            <p className="text-xs text-slate-500">
              How close the wait times we showed were to the real ready time.
              Lower is better — under 20% off is healthy.
            </p>
          </div>

          {stats.order_count === 0 ? (
            <div className="text-sm text-slate-500">
              No completed orders yesterday with an ETA prediction. Come back
              tomorrow.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Orders" value={String(stats.order_count)} />
              <Stat label="Wait we showed" value={`${stats.avg_predicted_min} min`} />
              <Stat label="Real wait" value={`${stats.avg_actual_min} min`} />
              <Stat
                label="Avg off by"
                value={`${stats.mape_pct}%`}
                tone={stats.mape_pct > 20 ? 'bad' : 'good'}
              />
            </div>
          )}

          {stats.suggested_throughput != null && !ignoredSuggestion && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-900">
                Suggestion: change kitchen speed from{' '}
                <b>{ks.throughput_per_min}</b> →{' '}
                <b>{stats.suggested_throughput}</b> per min
              </div>
              <div className="mt-1 text-xs text-amber-800">
                Yesterday's wait times were off by {stats.mape_pct}%. This change
                should make them more accurate. You decide.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    saveThroughput(stats.suggested_throughput!, 'suggestion')
                  }
                  disabled={saving}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setThroughputEdit(String(stats.suggested_throughput))
                  }
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setIgnoredSuggestion(true)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-700"
                >
                  Ignore
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
}) {
  const color =
    tone === 'bad'
      ? 'text-red-600'
      : tone === 'good'
      ? 'text-emerald-600'
      : 'text-slate-900'
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
