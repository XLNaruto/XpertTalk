import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MessageListSkeleton() {
  // Alternate sent/received to mimic a chat conversation
  const rows = [
    { sent: false, width: "w-[45%]", height: "h-14" },
    { sent: false, width: "w-[35%]", height: "h-10" },
    { sent: true, width: "w-[40%]", height: "h-12" },
    { sent: false, width: "w-[50%]", height: "h-16" },
    { sent: true, width: "w-[30%]", height: "h-10" },
    { sent: true, width: "w-[45%]", height: "h-14" },
    { sent: false, width: "w-[38%]", height: "h-10" },
    { sent: true, width: "w-[42%]", height: "h-12" },
  ];

  return (
    <div className="flex h-full flex-col justify-end gap-3 p-4 chat-bg">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn("flex", row.sent ? "justify-end" : "justify-start")}
        >
          {!row.sent && (
            <Skeleton className="mr-2 h-8 w-8 shrink-0 rounded-full" />
          )}
          <Skeleton
            className={cn("rounded-2xl", row.width, row.height)}
          />
        </div>
      ))}
    </div>
  );
}
