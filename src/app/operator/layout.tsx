"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { clearOperator, getOperator, type OperatorSession } from "@/lib/auth";

const NAV = [
  { href: "/operator/prep",      label: "Morning Prep",     icon: "🌅" },
  { href: "/operator/kds",       label: "Kitchen Display",  icon: "🍳" },
  { href: '/operator/kitchen',   label: 'Kitchen Settings', icon: '⚙️' },
  { href: "/operator/stock",     label: "Menu Stock",       icon: "📦" },
  { href: '/operator/inventory', label: 'Ingredients',      icon: '🥕' },
  { href: "/operator/analytics", label: "Analytics",        icon: "📈" },
];

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [op, setOp] = useState<OperatorSession | null | undefined>(undefined);

  useEffect(() => {
    const s = getOperator();
    if (!s) {
      router.replace("/login/operator");
      return;
    }
    setOp(s);
  }, [router]);

  if (op === undefined)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading…
      </div>
    );
  if (op === null) return null;

  const logout = () => {
    clearOperator();
    router.replace("/");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="badge bg-amber-100 text-amber-800">Staff · {op.label}</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`btn text-sm ${
                  pathname?.startsWith(n.href)
                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{n.icon}</span> {n.label}
              </Link>
            ))}
          </nav>
          <button onClick={logout} className="btn-ghost text-xs">
            Log out
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 md:hidden no-scrollbar">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`btn text-sm whitespace-nowrap ${
                pathname?.startsWith(n.href)
                  ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span>{n.icon}</span> {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
