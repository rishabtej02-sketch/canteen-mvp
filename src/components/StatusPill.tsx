import type { OrderStatus } from "@/types/db";

const STYLES: Record<OrderStatus, string> = {
  pending:    "bg-amber-100 text-amber-800",
  preparing:  "bg-sky-100 text-sky-800",
  ready:      "bg-emerald-100 text-emerald-800",
  completed:  "bg-slate-100 text-slate-600",
  cancelled:  "bg-rose-100 text-rose-700",
};

const LABEL: Record<OrderStatus, string> = {
  pending:   "New",
  preparing: "Preparing",
  ready:     "Ready",
  completed: "Picked up",
  cancelled: "Cancelled",
};

export function StatusPill({
  status,
  animated = false,
}: {
  status: OrderStatus;
  animated?: boolean;
}) {
  return (
    <span className={`badge ${STYLES[status]}`}>
      {animated && ["pending", "preparing", "ready"].includes(status) && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />
      )}
      {LABEL[status]}
    </span>
  );
}
