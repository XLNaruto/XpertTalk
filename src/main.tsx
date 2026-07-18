import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "./index.css";
import { AuthProvider, AuthInit } from "@/providers/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "@/routes/app-routes";
import { OfflineOverlay } from "@/components/shared/offline-overlay";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <AuthInit>
          <TooltipProvider>
            <AppRoutes />
            <Toaster />
            <OfflineOverlay />
          </TooltipProvider>
        </AuthInit>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
