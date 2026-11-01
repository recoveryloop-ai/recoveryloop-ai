import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";

import "./globals.css";

const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "RecoveryLoop AI", template: "%s · RecoveryLoop" },
  description: "Auditable ecommerce exception recovery with deterministic financial controls.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
