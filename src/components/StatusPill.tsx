import type { OrderStatus } from "@/types/db";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  preparing: "bg-sky-100 text-sky-700",
  ready: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${STYLES[status]}`}>{status.toUpperCase()}</span>
  );
}
