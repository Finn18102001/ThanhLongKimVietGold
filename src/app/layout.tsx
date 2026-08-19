import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { BRAND_FAVICON, BRAND_LOGO_MARK } from "@/shared/brand/assets";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Thăng Long Kim Việt · Quản lý quầy",
    template: "%s · TLKV POS",
  },
  description: "Hệ thống quản lý bán hàng tại quầy",
  applicationName: "Thăng Long Kim Việt",
  icons: {
    icon: [
      { url: BRAND_FAVICON, sizes: "48x48", type: "image/png" },
      { url: BRAND_LOGO_MARK, sizes: "512x512", type: "image/png" },
    ],
    apple: BRAND_LOGO_MARK,
    shortcut: BRAND_FAVICON,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${beVietnam.variable} ${geistMono.variable} ${beVietnam.className} min-h-full antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
