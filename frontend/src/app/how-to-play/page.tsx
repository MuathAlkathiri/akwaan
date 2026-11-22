import type { Metadata } from "next";
import { HowToPlayPage } from "@/features/how-to-play";

export const metadata: Metadata = {
  title: "كيف تلعب",
  description:
    "دليل أكوان من الصفر: وش تحتاجون، كيف ينضم اللاعبون بمسح رمز واحد، كيف تتكوّن المباراة من 3 عوالم و12 تحدي، وكيف تُحسب النقاط.",
};

export default function HowToPlay() {
  return <HowToPlayPage />;
}
