import Link from "next/link";
import { Button } from "@/components/ui/button";

export function QuestionHeader({
  backHref,
  category,
  points,
  backLabel = "العودة للوحة",
}: {
  backHref: string;
  category: string;
  points: number;
  backLabel?: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Button asChild variant="outline" size="lg">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      <div className="flex items-center gap-3 text-lg font-bold md:text-2xl">
        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
          {category}
        </span>
        <span className="rounded-full bg-primary px-4 py-2 text-primary-foreground">
          {points} نقطة
        </span>
      </div>
    </header>
  );
}
