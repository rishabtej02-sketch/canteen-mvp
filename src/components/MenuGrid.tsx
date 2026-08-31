"use client";

import type { MenuItem } from "@/types/db";
import { inr } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  mains: "Mains",
  snacks: "Snacks",
  beverages: "Beverages",
  desserts: "Desserts",
};

export function MenuGrid({
  items,
  onAdd,
}: {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
}) {
  const byCat = items.reduce<Record<string, MenuItem[]>>((acc, i) => {
    (acc[i.category] ||= []).push(i);
    return acc;
  }, {});

  const order = ["mains", "snacks", "beverages", "desserts"];

  return (
    <div className="space-y-6">
      {order
        .filter((c) => byCat[c]?.length)
        .map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byCat[cat].map((it) => (
                <div key={it.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {it.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        ~{Math.round(it.prep_seconds / 60)} min prep
                      </div>
                    </div>
                    <div className="text-right font-semibold text-brand-600">
                      {inr(it.price)}
                    </div>
                  </div>
                  <button
                    disabled={!it.is_available}
                    onClick={() => onAdd(it)}
                    className="btn-primary mt-4 self-end"
                  >
                    {it.is_available ? "Add" : "Sold out"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
