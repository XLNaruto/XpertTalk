import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string;
  name?: string;
  size?: "default" | "sm" | "lg";
  online?: boolean;
  className?: string;
}

export function UserAvatar({
  src,
  name,
  size = "default",
  online,
  className,
}: UserAvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

    

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <Avatar size={size}>
        {src && (
          <AvatarImage src={src} alt={name} className="object-cover" />
        )}
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-card",
            size === "sm" ? "h-2 w-2" : size === "lg" ? "h-3 w-3" : "h-2.5 w-2.5",
            online
              ? "bg-emerald-400 online-pulse"
              : "bg-orange-400"
          )}
        />
      )}
    </div>
  );
}
