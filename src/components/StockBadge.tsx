"use client";

interface Props {
  stock: number;
  cap: number;
}

export default function StockBadge({ stock, cap }: Props) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Sold out
      </span>
    );
  }
  if (cap > 0 && stock / cap < 0.2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse-dot" />
        Only {stock} left
      </span>
    );
  }
  return null;
}
