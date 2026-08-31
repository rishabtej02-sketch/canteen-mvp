"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { MenuGrid } from "@/components/MenuGrid";
import { Cart } from "@/components/Cart";
import { StatusPill } from "@/components/StatusPill";
import { OrderProgress } from "@/components/OrderProgress";
import { EmptyState } from "@/components/EmptyState";
import { getStudent } from "@/lib/auth";
import { inr, fmtTime, shortId } from "@/lib/format";
import type { CartLine, MenuItem, OrderRow } from "@/types/db";

const LS_CART = "canteen.cart.v2";

export default function StudentMenuPage() {
  const supabase = getSupabase();
  const me = getStudent();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // load menu
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("category")
        .order("name");
      if (error) setErr(error.message);
      setItems((data ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, [supabase]);

  // hydrate cart per-user
  useEffect(() => {
    if (!me) return;
    try {
      const raw = localStorage.getItem(`${LS_CART}:${me.id}`);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me) return;
    localStorage.setItem(`${LS_CART}:${me.id}`, JSON.stringify(lines));
  }, [lines, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // active orders + realtime
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("student_id", me.id)
        .in("status", ["pending", "preparing", "ready"])
        .order("placed_at", { ascending: false });
      if (!cancelled) setActive((data ?? []) as OrderRow[]);
    };
    load();
    const channel = supabase
      .channel(`student:${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `student_id=eq.${me.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = useCallback((item: MenuItem) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx === -1) return [...prev, { item, qty: 1 }];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
      return copy;
    });
    setToast(`Added ${item.name}`);
    setTimeout(() => setToast(null), 1400);
  }, []);

  const inc = (id: import("@/types/db").RowId) =>
    setLines((p) => p.map((l) => (l.item.id === id ? { ...l, qty: l.qty + 1 } : l)));
  const dec = (id: import("@/types/db").RowId) =>
    setLines((p) =>
      p
        .map((l) => (l.item.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  const remove = (id: import("@/types/db").RowId) => setLines((p) => p.filter((l) => l.item.id !== id));

  const qtyInCart = (id: import("@/types/db").RowId) => lines.find((l) => l.item.id === id)?.qty ?? 0;

  const checkout = async () => {
    if (!me || !lines.length) return;
    setErr(null);
    setSubmitting(true);
    try {
      const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
      const eta = Math.max(
        60,
        ...lines.map((l) => (Number(l.item.prep_seconds) || 300) * Math.max(1, Math.ceil(l.qty / 2)))
      );
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .insert({
          student_id: me.id,
          status: "pending",
          total_amount: total,
          eta_seconds: eta,
        })
        .select()
        .single();
      if (e1 || !order) throw e1 ?? new Error("Order insert failed");
      const rows = lines.map((l) => ({
        order_id: order.id,
        item_id: l.item.id,
        quantity: l.qty,
        unit_price: l.item.price,
      }));
      const { error: e2 } = await supabase.from("order_items").insert(rows);
      if (e2) throw e2;
      setLines([]);
      setToast("Order placed 🎉");
      setTimeout(() => setToast(null), 1800);
    } catch (e) {
      setErr((e as Error).message || "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  const hasActive = active.length > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Today&apos;s menu</h1>
          <p className="text-sm text-slate-500">
            Tap add, place the order, and pick up when it&apos;s ready.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <input
            className="input"
            placeholder="🔎 Search items…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {hasActive && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Active orders
            </h2>
            <Link href="/student/orders" className="link text-xs">
              View all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((o) => (
              <div key={o.id} className="card p-4 animate-fade-up">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold" title={`Order ${o.id}`}>
                    Order #{shortId(o.id)}
                  </div>
                  <StatusPill status={o.status} animated />
                </div>
                <OrderProgress status={o.status} />
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Placed {fmtTime(o.placed_at)}</span>
                  <span className="font-bold text-slate-900">{inr(o.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {err && (
            <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {err}
            </div>
          )}
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card h-32 animate-pulse bg-slate-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="🍽"
              title="No menu items yet"
              message="Run sql/migration.sql in Supabase, then seed some items."
            />
          ) : (
            <MenuGrid items={items} onAdd={addToCart} qtyInCart={qtyInCart} filter={filter} />
          )}
        </div>
        <Cart
          lines={lines}
          onInc={inc}
          onDec={dec}
          onRemove={remove}
          onCheckout={checkout}
          submitting={submitting}
          disabled={!me}
          disabledReason={!me ? "Sign in to place an order" : undefined}
        />
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-pop animate-fade-up">
          {toast}
        </div>
      )}
    </div>
  );
}
