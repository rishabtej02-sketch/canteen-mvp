"use client";

import type { CartLine } from "@/types/db";
import { inr } from "@/lib/format";

export function Cart({
  lines,
  onInc,
  onDec,
  onRemove,
  onCheckout,
  submitting,
}: {
  lines: CartLine[];
  onInc: (id: number) => void;
  onDec: (id: number) => void;
  onRemove: (id: number) => void;
  onCheckout: () => void;
  submitting: boolean;
}) {
  const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const etaBase = Math.max(
    0,
    ...lines.map((l) => l.item.prep_seconds * Math.max(1, Math.ceil(l.qty / 2)))
  );

  return (
    <aside className="card sticky top-4 flex flex-col p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Your cart
      </h2>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Add items from the menu to get started.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100">
            {lines.map((l) => (
              <li
                key={l.item.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.item.name}</div>
                  <div className="text-xs text-slate-500">
                    {inr(l.item.price)} · {inr(l.item.price * l.qty)}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-1">
                  <button
                    className="btn-ghost h-7 w-7 p-0"
                    onClick={() => onDec(l.item.id)}
                    aria-label="decrease"
                  >
                    −
                  </button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button
                    className="btn-ghost h-7 w-7 p-0"
                    onClick={() => onInc(l.item.id)}
                    aria-label="increase"
                  >
                    +
                  </button>
                  <button
                    className="ml-2 text-xs text-slate-400 hover:text-red-500"
                    onClick={() => onRemove(l.item.id)}
                  >
                    remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium">{inr(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Est. wait</span>
              <span className="font-medium">
                {Math.max(1, Math.round(etaBase / 60))} min
              </span>
            </div>
          </div>
          <button
            className="btn-primary mt-4 w-full"
            onClick={onCheckout}
            disabled={submitting}
          >
            {submitting ? "Placing…" : `Place order · ${inr(total)}`}
          </button>
        </>
      )}
    </aside>
  );
}
