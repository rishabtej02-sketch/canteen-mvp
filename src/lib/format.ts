export const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

export const fmtTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const secsAgo = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)) : 0;

export const secsToMin = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return "0m";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
};

export const prepMinutes = (prep_seconds: unknown) => {
  const n = Number(prep_seconds);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.max(1, Math.round(n / 60));
};

/**
 * Short display id for orders. Works for both UUID and bigint PKs.
 * UUID -> last 4 hex chars uppercased (e.g. "D9F0"), matches how kitchens
 * usually call out orders. Numeric ids -> the number as-is.
 */
export const shortId = (id: unknown): string => {
  if (id === null || id === undefined) return "—";
  const s = String(id);
  if (/^\d+$/.test(s)) return s;
  const hex = s.replace(/-/g, "");
  return hex.slice(-4).toUpperCase() || s.slice(0, 4).toUpperCase();
};

/**
 * Compact "31 Aug · 6:04 pm" for order rows.
 */
export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  return `${date} · ${time}`;
};

/**
 * Just "31 Aug 2026" — used as day-group headings on the orders list.
 */
export const fmtDayHeading = (iso: string | null | undefined) => {
  if (!iso) return "Undated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const initials = (name?: string | null) => {
  if (!name) return "•";
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};
