import type { Metadata } from "next";
import { Providers } from "./providers";
import { Layout } from "@/components/layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lammah Quiz Game",
  description: "A quiz party game built with Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
