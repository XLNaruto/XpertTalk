import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/providers/auth-provider";
import { PrivateRoutes } from "@/routes/private-routes";
import AuthPage from "@/pages/auth-page";
import ChatPage from "@/pages/chat-page";
import { clearCookies } from "@/lib/cookie";
import { useEffect } from "react";

function LogoutPage() {
  const { logout } = useAuth();
  logout();
  clearCookies();
  return <Navigate to="/auth" replace />;
}

export default function AppRoutes() {
  const { auth } = useAuth();

  const { BASE_URL } = import.meta.env;

  console.log = console.warn = console.error = () => {};

  useEffect(() => {
    // Disable context menu (right-click)
    const handleContextMenu = (event: any) => {
      event.preventDefault();
    };

    // Disable developer tools shortcuts and other key combinations
    const handleKeyDown = (event: any) => {
      if (
        event.key === "PrintScreen" || // Disable Print Screen key
        event.key === "F12" || // Disable Developer Tools (F12)
        event.key === "123" || // Disable Developer Tools (F12 alternative keycode)
        (event.ctrlKey && event.shiftKey && event.key === "I") || // Disable Ctrl+Shift+I (Dev Tools)
        (event.ctrlKey && event.shiftKey && event.key === "C") || // Disable Ctrl+Shift+C (Dev Tools)
        (event.ctrlKey && event.shiftKey && event.key === "J") || // Disable Ctrl+Shift+J (Dev Tools)
        (event.ctrlKey && event.keyCode === "U".charCodeAt(0)) || // Disable Ctrl+U (View Source)
        (event.ctrlKey && event.keyCode === "P".charCodeAt(0)) || // Disable Ctrl+P (Print Dialog)
        (event.key === "Cmd" && event.key === "Shift" && event.key === "4") || // Disable macOS Screenshot shortcut (Cmd+Shift+4)
        (event.key === "Cmd" && event.key === "Shift" && event.key === "3") // Disable macOS Screenshot shortcut (Cmd+Shift+3)
      ) {
        event.preventDefault();
      }
    };

    // Add event listeners
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listeners on component unmount
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <BrowserRouter basename={BASE_URL}>
      <Routes>
        <Route
          path="/auth/*"
          element={auth ? <Navigate to="/chats" replace /> : <AuthPage />}
        />
        <Route
          path="/chats"
          element={
            <PrivateRoutes>
              <ChatPage />
            </PrivateRoutes>
          }
        />
        <Route path="/logout" element={<LogoutPage />} />
        <Route
          path="*"
          element={<Navigate to={auth ? "/chats" : "/auth"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
