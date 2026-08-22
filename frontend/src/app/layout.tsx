import type { Metadata } from "next";
import { Noto_Kufi_Arabic, Readex_Pro } from "next/font/google";
import { Providers } from "./providers";
import { Layout } from "@/components/layout";
import "./globals.css";

const displayFont = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "أكوان",
  description: "أكوان — لعبة جماعية لعوالم وتحديات متنوعة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
