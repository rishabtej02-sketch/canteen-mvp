"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { OrderCard } from "@/components/OrderCard";
import type { OrderStatus, OrderWithItems } from "@/types/db";

const ACTIVE: OrderStatus[] = ["pending", "preparing", "ready"];
const TAB_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function OperatorPage() {
  const supabase = getSupabase();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, profiles(full_name, email), order_items(*, menu_items(name))"
      )
      .in("status", [...ACTIVE, "completed"])
      .order("placed_at", { ascending: true })
      .limit(80);
    if (error) setErr(error.message);
    setOrders((data ?? []) as unknown as OrderWithItems[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("kds")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => load()
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
      pending: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const visible = orders.filter((o) => o.status === tab);

  const advance = async (o: OrderWithItems, next: OrderStatus) => {
    setBusyId(o.id);
    setErr(null);
    const patch: Partial<OrderWithItems> = { status: next };
    if (next === "ready") patch.ready_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", o.id);
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kitchen Display</h1>
          <p className="text-xs text-slate-500">
            Live via Supabase Realtime · updates in ~ms
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["pending", "preparing", "ready", "completed"] as OrderStatus[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`btn ${
                  tab === s
                    ? "bg-brand-500 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {TAB_LABEL[s]}{" "}
                <span className="ml-1 rounded-full bg-black/10 px-1.5 text-[10px]">
                  {counts[s] ?? 0}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading orders…</div>
      ) : visible.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">
          Nothing in “{TAB_LABEL[tab]}”. Place an order from the Student page.
        </div>
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
