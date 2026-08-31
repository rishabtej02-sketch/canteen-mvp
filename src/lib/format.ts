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
