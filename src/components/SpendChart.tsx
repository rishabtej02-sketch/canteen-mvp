"use client";

import { inr } from "@/lib/format";

/**
 * Tiny dependency-free bar chart of spend per day.
 * points: [{ label, value }]
 */
export function SpendChart({
  points,
  height = 140,
}: {
  points: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="w-full">
      <div
        className="flex items-end gap-2 pb-2"
        style={{ height }}
        aria-label="Daily spend"
      >
        {points.map((p, i) => {
          const h = Math.round((p.value / max) * (height - 30));
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-brand transition-all"
                style={{ height: `${h}px`, minHeight: p.value > 0 ? 4 : 2, opacity: p.value ? 1 : 0.15 }}
                title={inr(p.value)}
              />
              <div className="text-[10px] text-slate-500">{p.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
