import type { OrderStatus } from "@/types/db";

const STEPS: { key: OrderStatus; label: string; emoji: string }[] = [
  { key: "pending",   label: "Placed",    emoji: "📥" },
  { key: "preparing", label: "Preparing", emoji: "🍳" },
  { key: "ready",     label: "Ready",     emoji: "🔔" },
  { key: "completed", label: "Picked",    emoji: "✅" },
];

export function OrderProgress({ status }: { status: OrderStatus }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  if (status === "cancelled")
    return (
      <div className="text-xs font-semibold text-rose-700">
        Order cancelled
      </div>
    );
  const activeIdx = Math.max(0, idx);
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ring-1 ${
                done
                  ? "bg-brand-600 text-white ring-brand-600"
                  : current
                  ? "bg-white text-brand-700 ring-brand-500 shadow-pop"
                  : "bg-slate-100 text-slate-400 ring-slate-200"
              }`}
              title={s.label}
            >
              {s.emoji}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-6 rounded ${
                  i < activeIdx ? "bg-brand-500" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
