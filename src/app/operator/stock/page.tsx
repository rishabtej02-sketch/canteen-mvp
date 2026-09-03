"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Item = {
  id: string | number;
  name: string;
  category: string;
  stock_today: number;
  stock_cap: number;
  is_available: boolean;
};

export default function OperatorStockPage() {
  const supabase = getSupabase();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, category, stock_today, stock_cap, is_available")
      .order("category")
      .order("name");
    setItems((data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("stock-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
    const g: Record<string, Item[]> = {};
    for (const i of filtered) (g[i.category] ??= []).push(i);
    return g;
  }, [items, search]);

  const restock = async (id: string | number, newQty: number) => {
    const key = String(id);
    setSaving(s => ({ ...s, [key]: true }));
    await supabase
      .from("menu_items")
      .update({ stock_today: newQty, stock_cap: Math.max(newQty, 1) })
      .eq("id", id);
    setDrafts(d => ({ ...d, [key]: "" }));
    setSaving(s => ({ ...s, [key]: false }));
  };

  const quickAdd = async (id: string | number, current: number, delta: number) => {
    await supabase.from("menu_items").update({ stock_today: Math.max(current + delta, 0) }).eq("id", id);
  };

  const soldOutCount = items.filter(i => !i.is_available).length;
  const lowCount = items.filter(i => i.is_available && i.stock_cap > 0 && i.stock_today / i.stock_cap < 0.2).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu stock</h1>
          <p className="text-sm text-slate-500">How many of each menu item is left — refills reach students instantly.</p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-900">{items.length}</span> items
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="font-semibold">{lowCount}</span> low
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <span className="font-semibold">{soldOutCount}</span> sold out
          </div>
        </div>
      </div>

      <input
        placeholder="Search item…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-6 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-indigo-400"
      />

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400">Loading…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400">No items match.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="px-4 py-2 text-right">Left / Max</th>
                      <th className="px-4 py-2 text-center">Quick</th>
                      <th className="px-4 py-2 text-right">Restock to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(i => {
                      const key = String(i.id);
                      const soldOut = !i.is_available;
                      const low = !soldOut && i.stock_cap > 0 && i.stock_today / i.stock_cap < 0.2;
                      return (
                        <tr key={key} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={soldOut ? "text-slate-400 line-through" : "font-medium text-slate-900"}>
                                {i.name}
                              </span>
                              {soldOut && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Sold out</span>
                              )}
                              {low && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Low</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {i.stock_today} / {i.stock_cap}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex gap-1">
                              <button
                                onClick={() => quickAdd(i.id, i.stock_today, -1)}
                                disabled={i.stock_today <= 0}
                                className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                              >−</button>
                              <button
                                onClick={() => quickAdd(i.id, i.stock_today, 1)}
                                className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                              >+</button>
                              <button
                                onClick={() => quickAdd(i.id, i.stock_today, 10)}
                                className="h-7 rounded-lg bg-slate-100 px-2 text-xs text-slate-600 hover:bg-slate-200"
                              >+10</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                placeholder={String(i.stock_cap)}
                                value={drafts[key] ?? ""}
                                onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none focus:border-indigo-400"
                              />
                              <button
                                onClick={() => {
                                  const v = parseInt(drafts[key] ?? "", 10);
                                  if (!isNaN(v) && v >= 0) restock(i.id, v);
                                }}
                                disabled={saving[key] || !drafts[key]}
                                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                {saving[key] ? "…" : "Set"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
