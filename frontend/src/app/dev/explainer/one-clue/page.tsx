import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  OneClueExplainer,
  SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

export const metadata: Metadata = {
  title: "معاينة — شرح بدليل واحد",
  robots: { index: false, follow: false },
};

export default function OneClueExplainerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main dir="rtl" className="mx-auto w-full max-w-6xl p-3 sm:p-6">
      <OneClueExplainer
        scenario={SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO}
        compact
        mode="preview"
      />
    </main>
  );
}
