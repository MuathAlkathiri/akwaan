import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  LaTahriqhaExplainer,
  SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

export const metadata: Metadata = {
  title: "معاينة — شرح لا تحرقها",
  robots: { index: false, follow: false },
};

export default function LaTahriqhaExplainerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-[9999] w-full overflow-hidden bg-background p-3 sm:p-6"
    >
      <header className="hidden space-y-1 sm:block">
        <p className="text-xs font-black text-muted-foreground">
          معاينة تطوير · مثال غير تنافسي
        </p>
        <h1 className="text-2xl font-black">شرح لا تحرقها</h1>
      </header>
      <section className="mx-auto h-full w-full max-w-6xl overflow-hidden p-0 sm:p-2">
        <LaTahriqhaExplainer
          scenario={SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO}
          compact
          mode="preview"
        />
      </section>
    </main>
  );
}
