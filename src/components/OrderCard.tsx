"use client";

import { StatusPill } from "./StatusPill";
import { inr, fmtTime, secsAgo, secsToMin, initials, shortId } from "@/lib/format";
import type { OrderStatus, OrderWithItems } from "@/types/db";

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

const ACTION_LABEL: Record<OrderStatus, string | null> = {
  pending: "Start preparing",
  preparing: "Mark ready",
  ready: "Mark picked up",
  completed: null,
  cancelled: null,
};

const AGE_TINT: [number, string][] = [
  [900, "ring-rose-300 shadow-[0_0_0_3px_rgba(244,63,94,0.10)]"],
  [600, "ring-amber-300"],
  [0,   "ring-slate-200/70"],
];

export function OrderCard({
  order,
  onAdvance,
  onCancel,
  busy,
}: {
  order: OrderWithItems;
  onAdvance: (o: OrderWithItems, next: OrderStatus) => void;
  onCancel: (o: OrderWithItems) => void;
  busy: boolean;
}) {
  const next = NEXT_STATUS[order.status];
  const label = ACTION_LABEL[order.status];
  const age = secsAgo(order.placed_at);
  const tint = AGE_TINT.find(([sec]) => age >= sec)?.[1] ?? "ring-slate-200/70";
  const canCancel = ["pending", "preparing"].includes(order.status);

  return (
    <div className={`card flex h-full flex-col p-4 ring-1 ${tint} animate-fade-up`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
            {initials(order.profiles?.full_name ?? "S")}
          </div>
          <div>
            <div
              className="text-xs uppercase tracking-wide text-slate-500"
              title={`Order ${order.id}`}
            >
              Order #{shortId(order.id)}
            </div>
            <div className="text-sm font-semibold text-slate-800">
              {order.profiles?.full_name ?? "Student"}
            </div>
          </div>
        </div>
        <StatusPill status={order.status} animated />
      </div>

      <ul className="mt-3 flex-1 space-y-1 text-sm">
        {order.order_items?.map((li) => (
          <li key={li.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className="mr-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
                {li.quantity}×
              </span>
              {li.menu_items?.name ?? `Item ${li.item_id}`}
            </span>
            <span className="whitespace-nowrap text-slate-500">
              {inr(li.quantity * (li.unit_price ?? 0))}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>{fmtTime(order.placed_at)}</span>
        <span className="font-medium">⏱ {secsToMin(age)}</span>
        <span className="font-bold text-slate-900">{inr(order.total_amount)}</span>
      </div>

      {(next || canCancel) && (
        <div className="mt-3 flex gap-2">
          {next && label && (
            <button
              className="btn-primary flex-1"
              disabled={busy}
              onClick={() => onAdvance(order, next)}
            >
              {label}
            </button>
          )}
          {canCancel && (
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => onCancel(order)}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
