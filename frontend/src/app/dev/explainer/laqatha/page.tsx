import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  LaqathaExplainer,
  SAMPLE_LAQATHA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

export const metadata: Metadata = {
  title: "معاينة — شرح القطها",
  robots: { index: false, follow: false },
};

export default function LaqathaExplainerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main
      dir="rtl"
      className="mx-auto w-full max-w-6xl space-y-4 px-2 py-3 sm:px-6 sm:py-5"
    >
      <header className="hidden space-y-1 sm:block">
        <p className="text-xs font-black text-muted-foreground">
          معاينة تطوير · مثال غير تنافسي
        </p>
        <h1 className="text-2xl font-black">شرح القطها</h1>
      </header>
      <section className="surface-card p-2 sm:p-5">
        <LaqathaExplainer
          scenario={SAMPLE_LAQATHA_TUTORIAL_SCENARIO}
          mode="preview"
        />
      </section>
    </main>
  );
}
