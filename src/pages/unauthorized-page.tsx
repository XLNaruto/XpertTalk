import { useNavigate } from "react-router-dom";
import { ShieldAlert, LogIn, Lock } from "lucide-react";
import { AppLogo } from "@/components/shared/app-logo";
import { cn } from "@/lib/utils";

/**
 * Full-screen "you are not authorized" screen.
 * Shown when an unauthenticated / not-permitted visitor hits a protected URL.
 */
export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-label="Access denied"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6"
    >
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-destructive/20 blur-3xl offline-float" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl offline-float [animation-delay:1.5s]" />

      <div className="relative flex w-full max-w-md flex-col items-center text-center offline-card-in">
        <div className="mb-10 flex items-center gap-2.5">
          <AppLogo className="h-10 w-10" />
          <span className="text-xl font-semibold tracking-tight text-foreground">
            XpertTalk
          </span>
        </div>

        {/* Shield + radar rings */}
        <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="offline-ring absolute inset-0 rounded-full border-2 border-destructive/40"
              style={{ animationDelay: `${i * 0.8}s` }}
            />
          ))}

          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-card shadow-2xl ring-1 ring-border">
            <span className="absolute inset-0 rounded-full bg-destructive/10 offline-pulse-slow" />
            <ShieldAlert className="relative h-10 w-10 text-destructive offline-shake" />
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg unauth-lock-in">
              <Lock className="h-4 w-4" />
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Access denied
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium",
              "bg-primary text-primary-foreground shadow-lg transition-all",
              "hover:brightness-110 active:scale-95"
            )}
          >
            <LogIn className="h-4 w-4" />
            Go to login
          </button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          If you believe this is a mistake, contact your administrator.
        </p>
      </div>
    </div>
  );
}
