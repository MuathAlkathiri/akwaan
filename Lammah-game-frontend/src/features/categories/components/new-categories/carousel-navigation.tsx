import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CarouselNavigation({
  onPrevious,
  onNext,
}: {
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-3" dir="rtl">
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={onPrevious}
        aria-label="الفئة السابقة"
        className="rounded-full border-white/15 bg-white/[0.05] focus-visible:ring-[#22C55E]"
      >
        <ChevronRight className="size-5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={onNext}
        aria-label="الفئة التالية"
        className="rounded-full border-white/15 bg-white/[0.05] focus-visible:ring-[#22C55E]"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Button>
    </div>
  );
}
