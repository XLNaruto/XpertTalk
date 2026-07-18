import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

/**
 * Full-screen animated overlay shown whenever the internet connection is lost.
 * Mounts once at the app root — no props required.
 */
export function OfflineOverlay() {
  const isOnline = useOnlineStatus();
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Keep the node mounted through the fade-out transition.
  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      setRetrying(false);
      return;
    }
    const t = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(t);
  }, [isOnline]);

  if (!visible) return null;

  const handleRetry = () => {
    setRetrying(true);
    // Give the spinner a beat, then reload to re-establish sockets/queries.
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="No internet connection"
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center px-6",
        "bg-background/80 backdrop-blur-xl transition-opacity duration-500",
        isOnline ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
    >
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl offline-float" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl offline-float [animation-delay:1.5s]" />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center offline-card-in">
        {/* Radar / signal animation */}
        <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="offline-ring absolute inset-0 rounded-full border-2 border-primary/40"
              style={{ animationDelay: `${i * 0.8}s` }}
            />
          ))}

          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-card shadow-2xl ring-1 ring-border">
            <span className="absolute inset-0 rounded-full bg-primary/10 offline-pulse-slow" />
            <WifiOff className="relative h-10 w-10 text-primary offline-shake" />
          </div>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          You&apos;re offline
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We can&apos;t reach the internet right now. Check your connection —
          we&apos;ll reconnect you automatically the moment you&apos;re back.
        </p>

        {/* Bouncing dots — "waiting" indicator */}
        <div className="mt-6 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-primary offline-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>

        <button
          onClick={handleRetry}
          disabled={retrying}
          className={cn(
            "mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium",
            "bg-primary text-primary-foreground shadow-lg transition-all",
            "hover:brightness-110 active:scale-95 disabled:opacity-70"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} />
          {retrying ? "Reconnecting…" : "Try again"}
        </button>
      </div>
    </div>
  );
}
