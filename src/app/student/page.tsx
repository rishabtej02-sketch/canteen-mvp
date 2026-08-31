"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { MenuGrid } from "@/components/MenuGrid";
import { Cart } from "@/components/Cart";
import { StatusPill } from "@/components/StatusPill";
import { inr, fmtTime } from "@/lib/format";
import type { CartLine, MenuItem, OrderRow } from "@/types/db";

const LS_CART = "canteen.cart.v1";
const LS_STUDENT = "canteen.student.id";

export default function StudentPage() {
  const supabase = getSupabase();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [myOrders, setMyOrders] = useState<OrderRow[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // pick / persist a demo student id
  useEffect(() => {
    let sid = localStorage.getItem(LS_STUDENT);
    (async () => {
      if (!sid) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "student")
          .limit(1);
        sid = data?.[0]?.id ?? null;
        if (sid) localStorage.setItem(LS_STUDENT, sid);
      }
      setStudentId(sid);
    })();
  }, [supabase]);

  // hydrate cart
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_CART);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_CART, JSON.stringify(lines));
  }, [lines]);

  // load menu
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) setErr(error.message);
      setItems((data ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, [supabase]);

  // load my recent orders + subscribe
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("student_id", studentId)
        .order("placed_at", { ascending: false })
        .limit(5);
      if (!cancelled) setMyOrders((data ?? []) as OrderRow[]);
    };
    load();
    const channel = supabase
      .channel(`student:${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `student_id=eq.${studentId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, studentId]);

  const addToCart = useCallback((item: MenuItem) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx === -1) return [...prev, { item, qty: 1 }];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
      return copy;
    });
  }, []);
  const inc = (id: number) =>
    setLines((p) =>
      p.map((l) => (l.item.id === id ? { ...l, qty: l.qty + 1 } : l))
    );
  const dec = (id: number) =>
    setLines((p) =>
      p
        .map((l) => (l.item.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  const remove = (id: number) =>
    setLines((p) => p.filter((l) => l.item.id !== id));

  const checkout = async () => {
    if (!lines.length || !studentId) return;
    setErr(null);
    setSubmitting(true);
    try {
      const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
      const eta = Math.max(
        60,
        ...lines.map(
          (l) => l.item.prep_seconds * Math.max(1, Math.ceil(l.qty / 2))
        )
      );
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .insert({
          student_id: studentId,
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
    } catch (e: unknown) {
      setErr((e as Error).message ?? "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  const activeOrders = useMemo(
    () =>
      myOrders.filter((o) =>
        ["pending", "preparing", "ready"].includes(o.status)
      ),
    [myOrders]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {activeOrders.length > 0 && (
          <section className="mb-6 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Your active orders
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeOrders.map((o) => (
                <div
                  key={o.id}
                  className="card flex items-center justify-between p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">Order #{o.id}</div>
                    <div className="text-xs text-slate-500">
                      Placed {fmtTime(o.placed_at)} · {inr(o.total_amount)}
                    </div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        <h1 className="mb-3 text-xl font-bold">Menu</h1>
        {err && (
          <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-slate-500">Loading menu…</div>
        ) : items.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No menu items yet. Seed the database and refresh.
          </div>
        ) : (
          <MenuGrid items={items} onAdd={addToCart} />
        )}
      </div>

      <Cart
        lines={lines}
        onInc={inc}
        onDec={dec}
        onRemove={remove}
        onCheckout={checkout}
        submitting={submitting}
      />
    </div>
  );
}
