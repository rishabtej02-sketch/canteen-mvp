"use client";

import { StatusPill } from "./StatusPill";
import { inr, fmtTime, secsAgo, secsToMin } from "@/lib/format";
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

  return (
    <div className="card flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Order #{order.id}
          </div>
          <div className="text-sm font-semibold text-slate-800">
            {order.profiles?.full_name ?? "Student"}
          </div>
        </div>
        <StatusPill status={order.status} />
      </div>

      <ul className="mt-3 flex-1 space-y-1 text-sm">
        {order.order_items?.map((li) => (
          <li key={li.id} className="flex justify-between">
            <span>
              <span className="font-medium">{li.quantity}×</span>{" "}
              {li.menu_items?.name ?? `Item ${li.item_id}`}
            </span>
            <span className="text-slate-500">
              {inr(li.quantity * li.unit_price)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>Placed {fmtTime(order.placed_at)}</span>
        <span>Waiting {secsToMin(age)}</span>
        <span className="font-semibold text-slate-800">
          {inr(order.total_amount)}
        </span>
      </div>

      {(next || order.status !== "cancelled") && (
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
          {["pending", "preparing"].includes(order.status) && (
            <button
              className="btn-ghost ring-1 ring-slate-200"
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
