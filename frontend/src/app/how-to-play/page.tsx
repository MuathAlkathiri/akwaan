import type { Metadata } from "next";
import { HowToPlayPage } from "@/features/how-to-play";

export const metadata: Metadata = {
  title: "كيف تلعب أكوان؟",
  description: "شاشة وحدة تجمعكم، وجوال كل لاعب يصير أداة اللعب",
};

export default function HowToPlay() {
  return <HowToPlayPage />;
}
