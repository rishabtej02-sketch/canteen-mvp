// supabase/functions/forecast-daily/index.ts  (v2 - paginated)
// Runs daily at 06:00 IST via pg_cron.
// Model: exponential smoothing (alpha=0.3) + day-of-week multiplier.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const MODEL_VERSION = "exp_smooth_v1";
const ALPHA = 0.15;
const HISTORY_DAYS = 90;
const PAGE = 1000;

interface DailyPoint { date: string; qty: number; dow: number; }

function forecastFor(history: DailyPoint[], targetDow: number): number {
  if (history.length === 0) return 0;
  let level = history[0].qty;
  for (let i = 1; i < history.length; i++) {
    level = ALPHA * history[i].qty + (1 - ALPHA) * level;
  }
  const sameDow = history.filter(h => h.dow === targetDow);
  if (sameDow.length === 0) return Math.round(level);
  const overallAvg = history.reduce((s, h) => s + h.qty, 0) / history.length;
  const sameDowAvg = sameDow.reduce((s, h) => s + h.qty, 0) / sameDow.length;
  const mult = overallAvg > 0 ? sameDowAvg / overallAvg : 1;
  return Math.max(0, Math.round(level * mult));
}

serve(async (_req) => {
  const started = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: items, error: iErr } = await supabase
      .from("menu_items")
      .select("id, name, category");
    if (iErr) throw iErr;

    const cutoff = new Date(Date.now() - HISTORY_DAYS * 86400 * 1000).toISOString();

    // Paginate — Postgrest caps at 1000 rows/request
    const allRows: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("order_items")
        .select("item_id, quantity, order:orders!inner(placed_at, status)")
        .gte("order.placed_at", cutoff)
        .eq("order.status", "completed")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break; // safety cap
    }

    // Bucket per (item, date)
    const byItem: Record<string, Record<string, number>> = {};
    for (const r of allRows) {
      const orderInfo = Array.isArray(r.order) ? r.order[0] : r.order;
      if (!orderInfo?.placed_at) continue;
      const d = orderInfo.placed_at.slice(0, 10);
      const key = String(r.item_id);
      byItem[key] ??= {};
      byItem[key][d] = (byItem[key][d] || 0) + Number(r.quantity || 0);
    }

    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 1);
    const targetDate = target.toISOString().slice(0, 10);
    const targetDow = target.getUTCDay();

    // Category fallback (for cold-start items)
    const categoryAvgs: Record<string, number[]> = {};
    for (const item of items ?? []) {
      const hist = byItem[String(item.id)];
      if (!hist) continue;
      const daily = Object.values(hist);
      const avg = daily.reduce((s, v) => s + v, 0) / daily.length;
      const cat = String(item.category || "").toLowerCase();
      categoryAvgs[cat] ??= [];
      categoryAvgs[cat].push(avg);
    }
    const catFallback: Record<string, number> = {};
    for (const [cat, arr] of Object.entries(categoryAvgs)) {
      catFallback[cat] = arr.reduce((s, v) => s + v, 0) / arr.length;
    }

    const forecasts: any[] = [];
    let coldStarts = 0;
    // Build full date range [cutoff .. today] so missing days count as 0
    const dateRange: string[] = [];
    {
      const start = new Date(cutoff);
      const end = new Date();
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        dateRange.push(d.toISOString().slice(0, 10));
      }
    }

    for (const item of items ?? []) {
      const hist = byItem[String(item.id)] ?? {};
      const points: DailyPoint[] = dateRange.map((date) => ({
        date,
        qty: hist[date] ?? 0,
        dow: new Date(date + "T00:00:00Z").getUTCDay(),
      }));

      let predicted: number;
      if (points.length < 5) {
        const cat = String(item.category || "").toLowerCase();
        predicted = Math.round(catFallback[cat] || 20);
        coldStarts++;
      } else {
        predicted = forecastFor(points, targetDow);
      }

      forecasts.push({
        item_id: item.id,
        forecast_date: targetDate,
        predicted_qty: predicted,
        model_version: MODEL_VERSION,
      });
    }

    const { error: uErr } = await supabase
      .from("daily_forecasts")
      .upsert(forecasts, { onConflict: "item_id,forecast_date,model_version" });
    if (uErr) throw uErr;

    const duration = Date.now() - started;
    await supabase.from("model_runs").insert({
      model_name: "forecast-daily",
      status: "success",
      items_scored: forecasts.length,
      duration_ms: duration,
      notes: `target=${targetDate} history_days=${HISTORY_DAYS} rows_read=${allRows.length} cold_starts=${coldStarts}`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        items_scored: forecasts.length,
        target: targetDate,
        rows_read: allRows.length,
        cold_starts: coldStarts,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("model_runs").insert({
      model_name: "forecast-daily",
      status: "failed",
      duration_ms: Date.now() - started,
      notes: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
