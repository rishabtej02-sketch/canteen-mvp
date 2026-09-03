"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getOperator } from "@/lib/auth";

type Row = {
  forecast_id: number;
  item_id: string | number;
  name: string;
  category: string;
  predicted_qty: number;
  accepted_qty: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  actual_qty: number | null;
  stock_today: number;
  stock_cap: number;
};

type ModelRun = {
  id: number;
  model_name: string;
  run_at: string;
  status: string;
  items_scored: number | null;
  notes: string | null;
};

export default function OperatorPrepPage() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<Row[]>([]);
  const [lastRun, setLastRun] = useState<ModelRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accuracy, setAccuracy] = useState<{ mape: number; n: number } | null>(null);

  // Prep screen shows forecasts for TOMORROW — that's what the operator is prepping for.
  const targetDate = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const load = async () => {
    // Today's forecasts joined with menu
    const { data: fdata } = await supabase
      .from("daily_forecasts")
      .select("id, item_id, predicted_qty, accepted_qty, accepted_by, accepted_at, actual_qty, item:menu_items(id, name, category, stock_today, stock_cap)")
      .eq("forecast_date", targetDate)
      .eq("model_version", "exp_smooth_v1");

    const mapped: Row[] = (fdata ?? []).map((f: any) => ({
      forecast_id: f.id,
      item_id: f.item?.id,
      name: f.item?.name ?? "?",
      category: f.item?.category ?? "?",
      predicted_qty: f.predicted_qty,
      accepted_qty: f.accepted_qty,
      accepted_by: f.accepted_by,
      accepted_at: f.accepted_at,
      actual_qty: f.actual_qty,
      stock_today: f.item?.stock_today ?? 0,
      stock_cap: f.item?.stock_cap ?? 0,
    }));

    setRows(mapped);

    // Last model run
    const { data: runs } = await supabase
      .from("model_runs")
      .select("*")
      .eq("model_name", "forecast-daily")
      .order("run_at", { ascending: false })
      .limit(1);
    setLastRun((runs?.[0] as ModelRun) ?? null);

    // MAPE over last 14 days (only rows with actual)
    const cutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);
    const { data: acc } = await supabase
      .from("daily_forecasts")
      .select("predicted_qty, actual_qty")
      .gte("forecast_date", cutoff)
      .not("actual_qty", "is", null);

    if (acc && acc.length > 0) {
      let sum = 0; let n = 0;
      for (const r of acc as any[]) {
        const pred = Number(r.predicted_qty);
        const act = Number(r.actual_qty);
        if (act > 0) { sum += Math.abs(pred - act) / act; n++; }
      }
      setAccuracy(n > 0 ? { mape: (sum / n) * 100, n } : null);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("prep-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_forecasts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {};
    for (const r of rows) (g[r.category] ??= []).push(r);
    return g;
  }, [rows]);

  const accept = async (row: Row, qty: number) => {
    setSaving(s => ({ ...s, [row.forecast_id]: true }));
    const op = getOperator();
    const who = op?.label ?? "operator";

    await supabase.from("daily_forecasts")
      .update({ accepted_qty: qty, accepted_by: who, accepted_at: new Date().toISOString() })
      .eq("id", row.forecast_id);

    await supabase.from("menu_items")
      .update({ stock_today: qty, stock_cap: Math.max(qty, 1) })
      .eq("id", row.item_id);

    setDrafts(d => { const n = { ...d }; delete n[row.forecast_id]; return n; });
    setSaving(s => ({ ...s, [row.forecast_id]: false }));
  };

  const acceptAll = async () => {
    const pending = rows.filter(r => r.accepted_qty === null);
    for (const r of pending) await accept(r, r.predicted_qty);
  };

  const pending = rows.filter(r => r.accepted_qty === null).length;
  const accepted = rows.length - pending;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Morning prep</h1>
          <p className="text-sm text-slate-500">
            AI proposes today's cook quantities. You approve every number.
          </p>
        </div>
        <button
          onClick={acceptAll}
          disabled={pending === 0}
          className="rounded-xl bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-40"
        >
          Accept all {pending > 0 ? `(${pending})` : ""}
        </button>
      </div>

      {/* Model status strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs text-slate-500">Forecast</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Daily demand</div>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs text-slate-500">Last run</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastRun ? new Date(lastRun.run_at).toLocaleString() : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {lastRun?.status === "success" ? `✓ ${lastRun.items_scored} items` : lastRun?.status ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs text-slate-500">14-day accuracy</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {accuracy ? `${(100 - accuracy.mape).toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {accuracy ? `off by ${accuracy.mape.toFixed(1)}% on avg · ${accuracy.n} checks` : "no results yet"}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs text-slate-500">Today</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {accepted} accepted · {pending} pending
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500">
          No suggestions for tomorrow yet — they're prepared automatically every morning at 6:00 AM.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</h2>
              <div className="space-y-2">
                {list.map(r => {
                  const isAccepted = r.accepted_qty !== null;
                  const draft = drafts[r.forecast_id] ?? "";
                  return (
                    <div
                      key={r.forecast_id}
                      className={`rounded-2xl border p-4 transition ${
                        isAccepted ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">
                            AI suggests <span className="font-semibold text-indigo-700">{r.predicted_qty}</span> plates
                            {isAccepted && (
                              <> · accepted <span className="font-semibold text-emerald-700">{r.accepted_qty}</span> by {r.accepted_by}</>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isAccepted ? (
                            <>
                              <button
                                onClick={() => accept(r, r.predicted_qty)}
                                disabled={saving[r.forecast_id]}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                              >
                                Accept {r.predicted_qty}
                              </button>
                              <input
                                type="number"
                                min={0}
                                placeholder="Edit"
                                value={draft}
                                onChange={e => setDrafts(d => ({ ...d, [r.forecast_id]: e.target.value }))}
                                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                              />
                              <button
                                onClick={() => {
                                  const v = parseInt(draft, 10);
                                  if (!isNaN(v) && v >= 0) accept(r, v);
                                }}
                                disabled={saving[r.forecast_id] || !draft}
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                Set
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-emerald-700">
                              ✓ Stock: {r.stock_today}/{r.stock_cap}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Model card link */}
      <div className="mt-8 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
        <details>
          <summary className="cursor-pointer font-semibold text-slate-700">How these numbers are worked out</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p><b>How it works:</b> looks at the last 60 days of orders for each item, leans on recent days more, and adjusts for the day of the week. Brand-new items start from their category's average.</p>
            <p><b>You're in charge:</b> the AI only suggests — you decide. Every number you accept is saved with who approved it and when.</p>
            <p><b>Fair by design:</b> it uses only total order counts — no student details — so nothing personal affects what gets cooked.</p>
            <p><b>What it can't see yet:</b> promos or events, the weather, and brand-new items (those start from the category average).</p>
          </div>
        </details>
      </div>
    </div>
  );
}
