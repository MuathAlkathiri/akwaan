import Image from "next/image";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import type { Category } from "@/types";

export function SelectedCategorySlot({
  category,
  index,
  onRemove,
}: {
  category?: Category;
  index: number;
  onRemove: () => void;
}) {
  if (!category) {
    return (
      <div
        className="grid aspect-[3/1] place-items-center rounded-xl border border-dashed border-white/10 bg-white/[0.025] text-white/20"
        aria-label={`مكان فارغ للفئة رقم ${index + 1}`}
      >
        <ImageIcon className="size-4" aria-hidden />
      </div>
    );
  }

  const bannerUrl = getMediaUrl(category.banner?.url);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[#22173f] transition-[aspect-ratio] duration-300 group-hover/sidebar:aspect-[3/1] group-focus-within/sidebar:aspect-[3/1]">
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt=""
          fill
          unoptimized
          sizes="200px"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-l from-primary/25 to-white/[0.03]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#17112d]/70" />
      <Button
        type="button"
        size="icon"
        variant="destructive"
        onClick={onRemove}
        aria-label={`إزالة فئة ${category.name}`}
        className="absolute left-1.5 top-1/2 size-6 -translate-y-1/2 rounded-full opacity-90 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      >
        <X className="size-3" aria-hidden />
      </Button>
      <span className="sr-only">{category.name}</span>
    </div>
  );
}
