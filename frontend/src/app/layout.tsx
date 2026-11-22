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

const siteUrl = "https://playakwaan.com";
const siteName = "أكوان";
const siteTitle = "أكوان — لعبة جماعية لعوالم وتحديات";
const siteDescription =
  "أكوان لعبة جماعية للمة والسفرات: شغّلوها على شاشة واحدة وكل واحد يشارك من جواله، واختاروا بين عوالم مختلفة وتحديات متنوعة تضحّك الكل وتخلي المنافسة حماس.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | أكوان",
  },
  description: siteDescription,
  keywords: [
    "لعبة جماعية",
    "ألعاب لمة",
    "تحدي",
    "أكوان",
    "لعبة عائلية",
    "ألعاب جماعية للجوال",
  ],
  alternates: {
    canonical: "/",
  },
  // Proves to Search Console that this site is ours, so the sitemap can be
  // submitted and indexing requested. Google keeps checking for it, so it stays
  // after verification rather than being removed as a one-off.
  verification: {
    google: "L9fXCw9IwWbWZh_kTHGyCDs3eTBv-ouvi2fhdCvGins",
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName,
    url: siteUrl,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
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
