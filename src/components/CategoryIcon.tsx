import type { ItemCategory } from "@/types/db";

const MAP: Record<string, { emoji: string; bg: string; ring: string }> = {
  mains:     { emoji: "🍛", bg: "bg-amber-50",   ring: "ring-amber-200" },
  snacks:    { emoji: "🥪", bg: "bg-rose-50",    ring: "ring-rose-200" },
  beverages: { emoji: "🥤", bg: "bg-sky-50",     ring: "ring-sky-200" },
  desserts:  { emoji: "🍰", bg: "bg-fuchsia-50", ring: "ring-fuchsia-200" },
};

export function CategoryIcon({
  category,
  size = 44,
}: {
  category: ItemCategory | string;
  size?: number;
}) {
  const m = MAP[category] ?? MAP.mains;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl ${m.bg} ring-1 ${m.ring}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {m.emoji}
    </span>
  );
}

export const CATEGORY_LABEL: Record<string, string> = {
  mains: "Mains",
  snacks: "Snacks",
  beverages: "Beverages",
  desserts: "Desserts",
};

export const CATEGORY_ORDER = ["mains", "snacks", "beverages", "desserts"];
