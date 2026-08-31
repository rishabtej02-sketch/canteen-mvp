import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canteen AI — Order-ahead campus canteen",
  description:
    "AI-driven college canteen management: menu ordering, live kitchen display, demand forecasting, dynamic ETAs, and personalized recommendations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
