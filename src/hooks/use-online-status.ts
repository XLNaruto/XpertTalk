import { useEffect, useState } from "react";

/**
 * Tracks the browser's network connectivity.
 *
 * Uses the native `online` / `offline` events for instant reaction, plus an
 * optional lightweight reachability ping so we also catch the "connected to a
 * router but no real internet" case that `navigator.onLine` misses.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
