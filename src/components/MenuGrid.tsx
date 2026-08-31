"use client";

import type { MenuItem } from "@/types/db";
import { inr, prepMinutes } from "@/lib/format";
import {
  CategoryIcon,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "./CategoryIcon";

export function MenuGrid({
  items,
  onAdd,
  qtyInCart,
  filter,
}: {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
  qtyInCart: (id: number) => number;
  filter: string;
}) {
  const filtered = items.filter((i) =>
    !filter ? true : i.name.toLowerCase().includes(filter.toLowerCase())
  );
  const byCat = filtered.reduce<Record<string, MenuItem[]>>((acc, i) => {
    (acc[i.category] ||= []).push(i);
    return acc;
  }, {});
  const cats = CATEGORY_ORDER.filter((c) => byCat[c]?.length);

  if (!cats.length) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        No items match “{filter}”.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {cats.map((cat) => (
        <section key={cat}>
          <div className="mb-3 flex items-center gap-2">
            <CategoryIcon category={cat} size={28} />
            <h2 className="text-base font-bold text-slate-900">
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <span className="text-xs text-slate-400">
              · {byCat[cat].length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byCat[cat].map((it) => {
              const q = qtyInCart(it.id);
              const mins = prepMinutes(it.prep_seconds);
              return (
                <div
                  key={it.id}
                  className="card-hover flex flex-col p-4 animate-fade-up"
                >
                  <div className="flex items-start gap-3">
                    <CategoryIcon category={it.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate font-semibold text-slate-900">
                          {it.name}
                        </div>
                        <div className="whitespace-nowrap font-bold text-brand-700">
                          {inr(it.price)}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>⏱ ~{mins} min</span>
                        {q > 0 && (
                          <span className="badge bg-emerald-100 text-emerald-700">
                            {q} in cart
                          </span>
                        )}
                        {!it.is_available && (
                          <span className="badge bg-rose-100 text-rose-700">
                            Sold out
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!it.is_available}
                    onClick={() => onAdd(it)}
                    className="btn-primary mt-4 w-full"
                  >
                    {it.is_available ? (q > 0 ? "Add another" : "Add to cart") : "Unavailable"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
