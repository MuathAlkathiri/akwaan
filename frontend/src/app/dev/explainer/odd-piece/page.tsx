import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  OddPieceExplainer,
  SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

export const metadata: Metadata = {
  title: "معاينة — القطعة الدخيلة",
  robots: { index: false, follow: false },
};

export default function OddPieceExplainerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-[100] min-h-[100dvh] overflow-hidden bg-background p-3 sm:p-8"
    >
      <section className="mx-auto flex h-full w-full max-w-6xl items-center">
        <OddPieceExplainer
          scenario={SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO}
          compact
          mode="preview"
        />
      </section>
    </main>
  );
}
