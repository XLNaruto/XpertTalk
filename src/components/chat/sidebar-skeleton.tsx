import { Skeleton } from "@/components/ui/skeleton";

export function SidebarSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-border/50 bg-sidebar-background">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Search skeleton */}
      <div className="px-4 pb-3">
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>

      {/* Section header */}
      <div className="px-5 py-2">
        <Skeleton className="h-3 w-16 rounded" />
      </div>

      {/* Chat list skeleton items */}
      <div className="flex-1 space-y-1 px-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[60%] rounded" />
              <Skeleton className="h-3 w-[80%] rounded" />
            </div>
            <Skeleton className="h-3 w-8 rounded" />
          </div>
        ))}
      </div>

      {/* User bar skeleton */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
