import type { Metadata } from "next";
import { Noto_Kufi_Arabic, Readex_Pro } from "next/font/google";
import { Providers } from "./providers";
import { Layout } from "@/components/layout";
import { THEME_BOOTSTRAP_SCRIPT } from "@/providers/theme-provider";
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
      // The script below writes `class` and `data-theme-surface` onto this element
      // before React hydrates, which is the whole point of running it early — and is
      // by definition a mismatch with the server's markup. Suppressed on this element
      // only, and only for its attributes; nothing inside it is exempt.
      suppressHydrationWarning
    >
      <head>
        {/* Applies a stored dark preference before the first paint, so a viewer who
            opted into dark never sees the light room flash first. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
