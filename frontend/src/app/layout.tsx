import type { Metadata } from "next";
import { Readex_Pro } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { Layout } from "@/components/layout";
import "./globals.css";

const displayFont = localFont({
  src: "./fonts/NotoKufiArabic/NotoKufiArabic-Variable.ttf",
  weight: "600 700",
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
