import Image from "next/image";
import { CheckCircle2, ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export function NewCategoryCarouselCard({
  category,
  active,
  selected,
  disabled,
  position,
  onActivate,
  onToggle,
}: {
  category: Category;
  active: boolean;
  selected: boolean;
  disabled: boolean;
  position: -2 | -1 | 0 | 1 | 2;
  onActivate: () => void;
  onToggle: () => void;
}) {
  const bannerUrl = getMediaUrl(category.banner?.url);
  const transform = {
    [-2]: "translate-x-[-112%] scale-[.68] -rotate-[7deg]",
    [-1]: "translate-x-[-62%] scale-[.82] -rotate-[4deg]",
    [0]: "translate-x-0 scale-100 rotate-0",
    [1]: "translate-x-[62%] scale-[.82] rotate-[4deg]",
    [2]: "translate-x-[112%] scale-[.68] rotate-[7deg]",
  }[position];

  return (
    <article
      className={cn(
        "absolute left-1/2 top-1/2 h-[20rem] w-[14rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.6rem] border bg-[#22173f] shadow-[0_24px_65px_rgba(0,0,0,.4)] transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none sm:h-[26rem] sm:w-[18rem] lg:h-[30rem] lg:w-[21rem]",
        transform,
        active
          ? "z-30 border-violet-300/55 opacity-100"
          : "z-10 cursor-pointer border-white/10 opacity-55 saturate-50 hover:opacity-80",
        selected &&
          "border-amber-300/70 ring-2 ring-amber-300/30 shadow-[0_0_36px_rgba(245,158,11,.18),0_24px_65px_rgba(0,0,0,.4)]",
      )}
      onClick={() => {
        if (!active) onActivate();
      }}
      aria-hidden={!active}
    >
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt={active ? category.name : ""}
          fill
          unoptimized
          priority={active}
          sizes="(max-width: 640px) 224px, 272px"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,.16),transparent_12rem),linear-gradient(145deg,#332254,#1d1535)] text-white/40">
          <ImageIcon className="size-12" aria-hidden />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#17112d] via-[#17112d]/35 to-transparent" />
      {selected && (
        <span className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-amber-100/60 bg-gradient-to-br from-amber-300 to-amber-500 text-[#2a174b] shadow-[0_6px_20px_rgba(245,158,11,.3)]">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
      )}
      {active && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 text-center">
          <h3 className="text-2xl font-black text-white">{category.name}</h3>
          {category.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-300">
              {category.description}
            </p>
          )}
          <Button
            type="button"
            disabled={disabled && !selected}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-pressed={selected}
            className={cn(
              "mt-5 w-full rounded-xl font-black",
              selected
                ? "border border-amber-200/50 bg-gradient-to-r from-amber-400 to-yellow-300 text-[#2a174b] shadow-[0_8px_22px_rgba(245,158,11,.22)] hover:from-amber-300 hover:to-yellow-200"
                : "bg-primary text-primary-foreground",
            )}
          >
            {selected ? (
              <CheckCircle2 className="ml-2 size-4" aria-hidden />
            ) : (
              <Plus className="ml-2 size-4" aria-hidden />
            )}
            {selected ? "تمت الإضافة" : "إضافة الفئة"}
          </Button>
        </div>
      )}
    </article>
  );
}
