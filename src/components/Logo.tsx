import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2 font-bold tracking-tight"
    >
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-pop">
        <span className="text-lg leading-none">🍽</span>
      </span>
      {!compact && (
        <span className="text-lg text-slate-900">
          Canteen</span>
      )}
    </Link>
  );
}
