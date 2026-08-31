"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { SpendChart } from "@/components/SpendChart";
import { EmptyState } from "@/components/EmptyState";
import { inr, prepMinutes } from "@/lib/format";
import type { OrderWithItems } from "@/types/db";

const DAYS = 14;

export default function AnalyticsPage() {
  const supabase = getSupabase();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - DAYS);
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, menu_items(name, prep_seconds, category))")
        .gte("placed_at", since.toISOString())
        .order("placed_at", { ascending: false })
        .limit(1000);
      if (error) setErr(error.message);
      setOrders((data ?? []) as unknown as OrderWithItems[]);
      setLoading(false);
    })();
  }, [supabase]);

  const stats = useMemo(() => {
    const now = Date.now();
    const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

    const nonCancelled = orders.filter((o) => o.status !== "cancelled");
    const todays = nonCancelled.filter(
      (o) => o.placed_at && new Date(o.placed_at).getTime() >= startOfToday
    );
    const revToday   = todays.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const revRange   = nonCancelled.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const nToday     = todays.length;
    const nRange     = nonCancelled.length;
    const cancelled  = orders.length - nonCancelled.length;
    const avgTicket  = nRange ? revRange / nRange : 0;

    // spend per day
    const dayKey = (t: number) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };
    const buckets: Record<string, { label: string; value: number }> = {};
    for (let i = DAYS - 1; i >= 0; i--) {
      const t = now - i * 86400 * 1000;
      const k = dayKey(t);
      const d = new Date(t);
      buckets[k] = {
        label: d.toLocaleDateString("en-IN", { day: "2-digit" }),
        value: 0,
      };
    }
    for (const o of nonCancelled) {
      if (!o.placed_at) continue;
      const k = dayKey(new Date(o.placed_at).getTime());
      if (buckets[k]) buckets[k].value += Number(o.total_amount ?? 0);
    }
    const points = Object.values(buckets);

    // top items
    const itemMap: Record<string, { name: string; qty: number; rev: number }> = {};
    for (const o of nonCancelled) {
      for (const li of o.order_items ?? []) {
        const name = li.menu_items?.name ?? `Item ${li.item_id}`;
        itemMap[name] ||= { name, qty: 0, rev: 0 };
        itemMap[name].qty += li.quantity ?? 0;
        itemMap[name].rev += (li.quantity ?? 0) * Number(li.unit_price ?? 0);
      }
    }
    const topItems = Object.values(itemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    // hour-of-day heat
    const hours = Array.from({ length: 24 }, () => 0);
    for (const o of nonCancelled) {
      if (!o.placed_at) continue;
      const h = new Date(o.placed_at).getHours();
      hours[h] += 1;
    }
    const peakHour = hours.indexOf(Math.max(...hours));

    // avg prep from menu items in orders
    const preps = orders
      .flatMap((o) => o.order_items ?? [])
      .map((li) => prepMinutes(li.menu_items?.prep_seconds));
    const avgPrep = preps.length ? preps.reduce((a, b) => a + b, 0) / preps.length : 0;

    return {
      revToday, revRange, nToday, nRange, cancelled, avgTicket,
      points, topItems, hours, peakHour, avgPrep,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-slate-500">Last {DAYS} days of activity.</p>
      </div>

      {err && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat"><div className="stat-label">Today revenue</div>
          <div className="stat-value">{inr(stats.revToday)}</div>
          <div className="stat-sub">{stats.nToday} orders</div></div>
        <div className="stat"><div className="stat-label">{DAYS}-day revenue</div>
          <div className="stat-value">{inr(stats.revRange)}</div>
          <div className="stat-sub">{stats.nRange} orders</div></div>
        <div className="stat"><div className="stat-label">Avg ticket</div>
          <div className="stat-value">{inr(stats.avgTicket)}</div>
          <div className="stat-sub">per order</div></div>
        <div className="stat"><div className="stat-label">Cancelled</div>
          <div className="stat-value">{stats.cancelled}</div>
          <div className="stat-sub">peak hour: {String(stats.peakHour).padStart(2,"0")}:00</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Daily revenue</div>
            <div className="text-xs text-slate-500">Bars = ₹ per day</div>
          </div>
          {loading ? (
            <div className="h-36 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <SpendChart points={stats.points} />
          )}
        </div>
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold">Top items</div>
          {stats.topItems.length === 0 ? (
            <EmptyState icon="📈" title="No data yet" />
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.topItems.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-slate-400">#{i + 1}</span>
                    <span className="truncate font-medium">{t.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {t.qty}× · {inr(t.rev)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-2 text-sm font-semibold">Orders by hour</div>
        <div className="flex items-end gap-1" style={{ height: 100 }}>
          {stats.hours.map((h, i) => {
            const max = Math.max(1, ...stats.hours);
            const height = Math.round((h / max) * 90);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${i === stats.peakHour ? "bg-accent-500" : "bg-brand-500"}`}
                  style={{ height: Math.max(2, height) }}
                  title={`${i}:00 · ${h}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Peak: <b className="text-slate-800">{String(stats.peakHour).padStart(2,"0")}:00</b> ·
          avg prep ~<b className="text-slate-800">{stats.avgPrep.toFixed(1)} min</b>
        </div>
      </div>
    </div>
  );
}
