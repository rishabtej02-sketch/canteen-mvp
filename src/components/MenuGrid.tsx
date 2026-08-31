"use client";

import { useEffect, useRef, useState } from "react";
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
  qtyInCart: (id: import("@/types/db").RowId) => number;
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

  const [active, setActive] = useState<string>(cats[0] ?? "");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const catsKey = cats.join("|");

  // Auto-highlight the category currently in view.
  useEffect(() => {
    if (!cats.length) return;
    setActive((prev) => (cats.includes(prev) ? prev : cats[0]));

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const cat = (visible[0].target as HTMLElement).dataset.cat;
          if (cat) setActive(cat);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    cats.forEach((c) => {
      const el = sectionRefs.current[c];
      if (el) io.observe(el);
    });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catsKey]);

  const jumpTo = (cat: string) => {
    const el = sectionRefs.current[cat];
    if (!el) return;
    setActive(cat);
    const y = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  if (!cats.length) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        No items match &ldquo;{filter}&rdquo;.
      </div>
    );
  }

  return (
    <div>
      {/* Sticky category bar */}
      <div className="sticky top-14 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white/85 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        {cats.map((c) => {
          const isActive = c === active;
          return (
            <button
              key={c}
              onClick={() => jumpTo(c)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-gradient-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <CategoryIcon category={c} size={20} />
              <span>{CATEGORY_LABEL[c] ?? c}</span>
              <span
                className={`text-[11px] ${
                  isActive ? "text-white/80" : "text-slate-400"
                }`}
              >
                {byCat[c].length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-8">
        {cats.map((cat) => (
          <section
            key={cat}
            data-cat={cat}
            ref={(el) => {
              sectionRefs.current[cat] = el;
            }}
            className="scroll-mt-24"
          >
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
    </div>
  );
}
