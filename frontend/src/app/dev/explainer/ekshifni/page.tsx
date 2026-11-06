import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  EkshifniExplainer,
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

export const metadata: Metadata = {
  title: "معاينة — شرح اكشفني",
  robots: { index: false, follow: false },
};

export default function EkshifniExplainerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-[9999] overflow-hidden bg-background p-3 sm:p-6"
    >
      <div className="mx-auto w-full max-w-6xl">
        <EkshifniExplainer
          scenario={SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO}
          compact
          mode="preview"
        />
      </div>
    </main>
  );
}
