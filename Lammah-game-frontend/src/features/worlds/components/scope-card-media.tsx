"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import type { PlayableScope } from "../types";

/** Canonical Scope artwork shared by browse and selectable card variants. */
export function ScopeCardMedia({
  scope,
  className,
  children,
}: {
  scope: PlayableScope;
  className?: string;
  children?: React.ReactNode;
}) {
  const imageUrl = getMediaUrl(scope.image?.url);

  return (
    <span
      data-testid="scope-card-media"
      data-has-artwork={imageUrl ? "true" : "false"}
      className={cn(
        "relative -mx-px -mt-px mb-px block h-40 w-[calc(100%+2px)] shrink-0 overflow-hidden bg-secondary sm:h-44",
        className,
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover object-center transition duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <span
          data-testid="scope-artwork-pending"
          className="absolute inset-0 grid place-items-center bg-secondary bg-[radial-gradient(hsl(var(--foreground)/0.07)_1px,transparent_1px)] [background-size:14px_14px]"
        >
          <span className="flex flex-col items-center gap-1.5 text-disabled-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="text-[0.7rem] font-bold">الصورة قيد الإعداد</span>
          </span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/25 to-transparent" />
      {children}
    </span>
  );
}
