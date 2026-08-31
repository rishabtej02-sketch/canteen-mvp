"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { clearStudent, getStudent, type StudentSession } from "@/lib/auth";
import { initials } from "@/lib/format";

const NAV = [
  { href: "/student/menu",   label: "Menu",       icon: "🍽" },
  { href: "/student/orders", label: "My orders",  icon: "🧾" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<StudentSession | null | undefined>(undefined);

  useEffect(() => {
    const s = getStudent();
    if (!s) {
      router.replace("/login/student");
      return;
    }
    setMe(s);
  }, [router]);

  if (me === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (me === null) return null;

  const logout = () => {
    clearStudent();
    router.replace("/");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
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
          <div className="flex items-center gap-2">
            <div className="hidden text-right md:block">
              <div className="text-xs text-slate-500">Signed in as</div>
              <div className="text-sm font-semibold">
                {me.full_name ?? me.email}
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
              {initials(me.full_name ?? me.email)}
            </div>
            <button onClick={logout} className="btn-ghost text-xs">Log out</button>
          </div>
        </div>
        {/* mobile nav */}
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden no-scrollbar">
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
