import { toAbsoluteUrl } from "@/lib/helpers";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
}

export function AppLogo({ className }: AppLogoProps) {
  return (
    <img
      src={toAbsoluteUrl("media/logos/xperttalk-favilogo.png")}
      alt="XpertTalk"
      className={cn("h-8 w-8 rounded-lg", className)}
    />
  );
}
