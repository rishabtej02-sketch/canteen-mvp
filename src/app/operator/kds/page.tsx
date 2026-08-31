"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";
import { inr } from "@/lib/format";
import type { OrderStatus, OrderWithItems } from "@/types/db";

const TABS: OrderStatus[] = ["pending", "preparing", "ready", "completed"];
const TAB_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function KdsPage() {
  const supabase = getSupabase();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, profiles(full_name, email), order_items(*, menu_items(name))"
      )
      .in("status", ["pending", "preparing", "ready", "completed"])
      .order("placed_at", { ascending: true })
      .limit(120);
    if (error) setErr(error.message);
    setOrders((data ?? []) as unknown as OrderWithItems[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const counts = useMemo(() => {
    const c: Record<OrderStatus, number> = {
      pending: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0,
    };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const todaysRevenue = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return orders
      .filter(
        (o) =>
          o.status !== "cancelled" &&
          o.placed_at &&
          new Date(o.placed_at).getTime() >= start.getTime()
      )
      .reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  }, [orders]);

  const visible = orders.filter((o) => o.status === tab);

  const advance = async (o: OrderWithItems, next: OrderStatus) => {
    setBusyId(o.id);
    setErr(null);
    const patch: Record<string, unknown> = { status: next };
    if (next === "ready") patch.ready_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) setErr(error.message);
    setBusyId(null);
  };

  const cancel = async (o: OrderWithItems) => {
    setBusyId(o.id);
    setErr(null);
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", o.id);
    if (error) setErr(error.message);
    setBusyId(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
          <p className="text-sm text-slate-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse-dot align-middle" />
            Live via Supabase Realtime · advances one tap at a time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="stat px-4 py-2">
            <div className="stat-label">Today revenue</div>
            <div className="text-lg font-bold text-slate-900">{inr(todaysRevenue)}</div>
          </div>
          <div className="stat px-4 py-2">
            <div className="stat-label">Active</div>
            <div className="text-lg font-bold text-slate-900">
              {counts.pending + counts.preparing + counts.ready}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`btn ${
              tab === s
                ? "bg-gradient-brand text-white shadow-pop"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {TAB_LABEL[s]}
            <span
              className={`ml-1 rounded-full px-1.5 text-[10px] ${
                tab === s ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={tab === "pending" ? "🎉" : "🍳"}
          title={`Nothing in "${TAB_LABEL[tab]}"`}
          message={
            tab === "pending"
              ? "You are all caught up. New orders will appear here instantly."
              : "Move something forward from another tab."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advance}
              onCancel={cancel}
              busy={busyId === o.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
