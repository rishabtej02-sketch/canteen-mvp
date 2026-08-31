"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getStudent } from "@/lib/auth";
import { StatusPill } from "@/components/StatusPill";
import { OrderProgress } from "@/components/OrderProgress";
import { SpendChart } from "@/components/SpendChart";
import { EmptyState } from "@/components/EmptyState";
import { inr, fmtDateTime, fmtDayHeading, shortId } from "@/lib/format";
import type { OrderWithItems } from "@/types/db";

const RANGE_DAYS = 14;
const PAGE_SIZE = 20;

export default function StudentOrdersPage() {
  const supabase = getSupabase();
  const me = getStudent();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "active" | "past">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!me) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, menu_items(name))")
        .eq("student_id", me.id)
        .order("placed_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) setErr(error.message);
      setOrders((data ?? []) as unknown as OrderWithItems[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, me?.id]);

  // Reset to page 1 whenever the tab filter changes.
  useEffect(() => {
    setPage(1);
  }, [tab]);

  const stats = useMemo(() => {
    const totalSpend = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const nOrders = orders.length;
    const now = Date.now();
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const spendThisMonth = orders
      .filter((o) => {
        if (o.status === "cancelled" || !o.placed_at) return false;
        const d = new Date(o.placed_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const itemsCount = orders.reduce(
      (s, o) =>
        s + (o.order_items ?? []).reduce((a, li) => a + (li.quantity ?? 0), 0),
      0
    );

    // Spend per day for the last N days (local time buckets).
    const dayKey = (t: number) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };
    const buckets: Record<string, { label: string; value: number }> = {};
    for (let i = RANGE_DAYS - 1; i >= 0; i--) {
      const t = now - i * 86400 * 1000;
      const k = dayKey(t);
      const d = new Date(t);
      buckets[k] = {
        label: d.toLocaleDateString("en-IN", { day: "2-digit" }),
        value: 0,
      };
    }
    for (const o of orders) {
      if (o.status === "cancelled" || !o.placed_at) continue;
      const t = new Date(o.placed_at).getTime();
      // Skip future-dated or rows outside window.
      if (t > now) continue;
      if (now - t > RANGE_DAYS * 86400 * 1000) continue;
      const k = dayKey(t);
      if (buckets[k]) buckets[k].value += Number(o.total_amount ?? 0);
    }
    const points = Object.values(buckets);

    // Top items.
    const itemMap: Record<string, { name: string; qty: number; spend: number }> = {};
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      for (const li of o.order_items ?? []) {
        const name = li.menu_items?.name ?? `Item ${li.item_id}`;
        itemMap[name] ||= { name, qty: 0, spend: 0 };
        itemMap[name].qty += li.quantity ?? 0;
        itemMap[name].spend += (li.quantity ?? 0) * Number(li.unit_price ?? 0);
      }
    }
    const topItems = Object.values(itemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { totalSpend, spendThisMonth, nOrders, itemsCount, points, topItems };
  }, [orders]);

  const filtered = orders.filter((o) => {
    if (tab === "active") return ["pending", "preparing", "ready"].includes(o.status);
    if (tab === "past") return ["completed", "cancelled"].includes(o.status);
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Group the currently-paged rows by day heading for a cleaner list.
  const grouped = useMemo(() => {
    const out: { key: string; label: string; rows: OrderWithItems[] }[] = [];
    for (const o of paged) {
      const label = fmtDayHeading(o.placed_at);
      const last = out[out.length - 1];
      if (last && last.label === label) {
        last.rows.push(o);
      } else {
        out.push({ key: label + "-" + out.length, label, rows: [o] });
      }
    }
    return out;
  }, [paged]);

  if (!me) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My orders &amp; spend</h1>
        <p className="text-sm text-slate-500">
          Every order you&apos;ve placed, plus how much you&apos;re spending in the canteen.
        </p>
      </div>

      {/* stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat animate-fade-up">
          <div className="stat-label">Total spend</div>
          <div className="stat-value">{inr(stats.totalSpend)}</div>
          <div className="stat-sub">Lifetime · excludes cancellations</div>
        </div>
        <div className="stat animate-fade-up">
          <div className="stat-label">This month</div>
          <div className="stat-value">{inr(stats.spendThisMonth)}</div>
          <div className="stat-sub">
            {new Date().toLocaleDateString("en-IN", { month: "long" })}
          </div>
        </div>
        <div className="stat animate-fade-up">
          <div className="stat-label">Orders</div>
          <div className="stat-value">{stats.nOrders}</div>
          <div className="stat-sub">{stats.itemsCount} items total</div>
        </div>
        <div className="stat animate-fade-up">
          <div className="stat-label">Avg per order</div>
          <div className="stat-value">
            {inr(stats.nOrders ? stats.totalSpend / stats.nOrders : 0)}
          </div>
          <div className="stat-sub">Across all orders</div>
        </div>
      </div>

      {/* chart + top items */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5 animate-fade-up">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Spend · last 14 days</div>
            <div className="text-xs text-slate-500">Bars = ₹ per day</div>
          </div>
          <SpendChart points={stats.points} />
        </div>
        <div className="card p-5 animate-fade-up">
          <div className="mb-2 text-sm font-semibold">Top items</div>
          {stats.topItems.length === 0 ? (
            <div className="text-sm text-slate-500">No orders yet.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.topItems.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-slate-400">#{i + 1}</span>
                    <span className="truncate font-medium">{t.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {t.qty}× · {inr(t.spend)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* history */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Order history
          </h2>
          <div className="flex gap-1">
            {(["all", "active", "past"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`btn text-xs ${
                  tab === t
                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t === "all" ? "All" : t === "active" ? "In progress" : "Past"}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-20 animate-pulse bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No orders here"
            message={tab === "all" ? "Place your first order from the Menu." : `Nothing in "${tab}".`}
          />
        ) : (
          <>
            <div className="space-y-5">
              {grouped.map((g) => (
                <div key={g.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {g.label}
                    </div>
                    <div className="h-px flex-1 bg-slate-200" />
                    <div className="text-xs text-slate-400">
                      {g.rows.length} {g.rows.length === 1 ? "order" : "orders"}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {g.rows.map((o) => {
                      const totalQty = (o.order_items ?? []).reduce(
                        (a, li) => a + (li.quantity ?? 0),
                        0
                      );
                      return (
                        <li key={o.id} className="card p-4 animate-fade-up">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 px-2 text-sm font-bold tracking-wide text-brand-700 ring-1 ring-brand-100"
                                title={`Order ${o.id}`}
                              >
                                #{shortId(o.id)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {fmtDateTime(o.placed_at)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {(o.order_items ?? []).length} lines · {totalQty} items
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <StatusPill status={o.status} animated />
                              <div className="text-base font-bold text-slate-900">
                                {inr(o.total_amount)}
                              </div>
                            </div>
                          </div>
                          <ul className="mt-3 flex flex-wrap gap-1 text-xs text-slate-600">
                            {(o.order_items ?? []).slice(0, 8).map((li) => (
                              <li
                                key={li.id}
                                className="rounded-full bg-slate-100 px-2 py-0.5"
                              >
                                {li.quantity}× {li.menu_items?.name ?? `Item ${li.item_id}`}
                              </li>
                            ))}
                            {(o.order_items ?? []).length > 8 && (
                              <li className="text-slate-400">
                                +{(o.order_items ?? []).length - 8} more
                              </li>
                            )}
                          </ul>
                          {["pending", "preparing", "ready"].includes(o.status) && (
                            <div className="mt-3">
                              <OrderProgress status={o.status} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  Page {currentPage} of {pageCount} · {filtered.length} orders
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="btn text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={currentPage >= pageCount}
                    className="btn text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
