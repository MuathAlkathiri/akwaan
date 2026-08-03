import Image from "next/image";
import { ImageIcon, type LucideIcon } from "lucide-react";

import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";

interface ContentThumbnailProps {
  url?: string;
  icon?: LucideIcon;
  size?: "sm" | "lg";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<ContentThumbnailProps["size"]>, string> = {
  sm: "size-11",
  lg: "size-16",
};

// Shared image-or-placeholder thumbnail reused by world/scope/challenge
// cards and the world header, so the same visual treatment (rounded frame,
// dashed empty state) never has to be re-implemented per entity.
export function ContentThumbnail({
  url,
  icon: Icon = ImageIcon,
  size = "sm",
  className,
}: ContentThumbnailProps) {
  const resolvedUrl = url ? getMediaUrl(url) : undefined;
  const sizeClass = SIZE_CLASS[size];

  if (resolvedUrl) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-lg border",
          sizeClass,
          className,
        )}
      >
        <Image src={resolvedUrl} alt="" fill unoptimized className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-dashed bg-muted/40 text-muted-foreground",
        sizeClass,
        className,
      )}
    >
      <Icon className={size === "lg" ? "size-6" : "size-4"} aria-hidden />
    </div>
  );
}
