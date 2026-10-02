import { useEffect, useRef } from "react";

// How long the app must have been hidden before coming back counts as a
// "resume". After a long background stretch the OS has usually frozen the page
// and the socket is dead while still reporting `connected` — so we treat it
// like a refresh: reconnect and re-read from the API.
export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000;

/**
 * Calls `onResume` when the page becomes visible again after being hidden for
 * at least `afterMs`, or when it is restored from the back/forward cache.
 */
export function useResume(onResume: () => void, afterMs = RESUME_REFRESH_AFTER_MS) {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? Date.now() : null;

    const onVisChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (wasHiddenFor >= afterMs) onResumeRef.current();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onResumeRef.current();
    };

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [afterMs]);
}
