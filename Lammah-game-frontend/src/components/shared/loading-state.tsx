import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="جاري التحميل"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-4 rounded-lg border bg-card p-6">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
      <span className="sr-only">جاري التحميل...</span>
    </div>
  );
}
