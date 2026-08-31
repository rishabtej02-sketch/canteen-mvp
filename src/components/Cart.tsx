"use client";

import type { CartLine } from "@/types/db";
import { inr, prepMinutes } from "@/lib/format";
import { CategoryIcon } from "./CategoryIcon";

export function Cart({
  lines,
  onInc,
  onDec,
  onRemove,
  onCheckout,
  submitting,
  disabled,
  disabledReason,
}: {
  lines: CartLine[];
  onInc: (id: import("@/types/db").RowId) => void;
  onDec: (id: import("@/types/db").RowId) => void;
  onRemove: (id: import("@/types/db").RowId) => void;
  onCheckout: () => void;
  submitting: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const items = lines.reduce((s, l) => s + l.qty, 0);
  const etaMin = lines.length
    ? Math.max(
        1,
        ...lines.map(
          (l) => prepMinutes(l.item.prep_seconds) * Math.max(1, Math.ceil(l.qty / 2))
        )
      )
    : 0;

  return (
    <aside className="card sticky top-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">Your cart</div>
        <div className="badge bg-brand-100 text-brand-700">{items} items</div>
      </div>

      <div className="max-h-[45vh] overflow-y-auto p-2">
        {lines.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-500">
            🛒 Nothing added yet. Tap “Add to cart” on any item.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.item.id} className="flex items-center gap-3 p-2">
                <CategoryIcon category={l.item.category} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{l.item.name}</div>
                  <div className="text-xs text-slate-500">
                    {inr(l.item.price)} · {inr(l.item.price * l.qty)}
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                  <button
                    className="h-7 w-7 rounded-md text-slate-700 hover:bg-white"
                    onClick={() => onDec(l.item.id)}
                    aria-label="decrease"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                  <button
                    className="h-7 w-7 rounded-md text-slate-700 hover:bg-white"
                    onClick={() => onInc(l.item.id)}
                    aria-label="increase"
                  >
                    +
                  </button>
                </div>
                <button
                  className="text-xs text-slate-400 hover:text-rose-500"
                  onClick={() => onRemove(l.item.id)}
                  aria-label="remove"
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-semibold">{inr(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Est. wait</span>
          <span className="font-semibold">{lines.length ? `${etaMin} min` : "—"}</span>
        </div>
        {disabled && disabledReason && (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {disabledReason}
          </div>
        )}
        <button
          className="btn-primary w-full"
          onClick={onCheckout}
          disabled={submitting || !lines.length || disabled}
        >
          {submitting ? "Placing…" : `Place order · ${inr(subtotal)}`}
        </button>
      </div>
    </aside>
  );
}
