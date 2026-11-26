import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md border border-brand-mist bg-brand-wash", className)}
      {...props}
    />
  )
}

export { Skeleton }
