import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canteen MVP",
  description: "AI-driven college canteen management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold text-brand-600"
            >
              <span className="inline-block h-8 w-8 rounded-lg bg-brand-500" />
              Canteen MVP
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/student" className="btn-ghost">
                Student
              </Link>
              <Link href="/operator" className="btn-ghost">
                Operator KDS
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500">
          Canteen MVP · Next.js + Supabase
        </footer>
      </body>
    </html>
  );
}
