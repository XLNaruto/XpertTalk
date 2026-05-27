import { Navigate } from "react-router-dom";
import { useAuth } from "@/providers/auth-provider";
import type { PropsWithChildren } from "react";

export function PrivateRoutes({ children }: PropsWithChildren) {
  const { auth } = useAuth();

  if (!auth) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
