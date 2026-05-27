import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture at module level so we never miss the event
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(v: boolean) => void>();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  listeners.forEach((fn) => fn(true));
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn(false));
});

export function usePwaInstall() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const [canInstall, setCanInstall] = useState(!isStandalone && !!deferredPrompt);

  useEffect(() => {
    listeners.add(setCanInstall);
    // Sync in case event fired between module load and mount
    if (deferredPrompt && !isStandalone) setCanInstall(true);
    return () => { listeners.delete(setCanInstall); };
  }, [isStandalone]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setCanInstall(false);
    deferredPrompt = null;
  }, []);

  return { canInstall, install };
}
