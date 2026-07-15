// Firebase config — merged into VitePWA service worker via importScripts
const firebaseConfig = {
  apiKey: "AIzaSyArWCjVcd_6WukebmDXNNiT5xnfnmm_-DI",
  authDomain: "xperttalk-2025.firebaseapp.com",
  projectId: "xperttalk-2025",
  storageBucket: "xperttalk-2025.firebasestorage.app",
  messagingSenderId: "549412393867",
  appId: "1:549412393867:web:8e8c44480ebfa7746a558e",
  measurementId: "G-Q7SN5NYT86",
};

firebase.initializeApp(firebaseConfig);
// NOTE: We intentionally do NOT call firebase.messaging() here. Doing so
// registers the Firebase SDK's built-in push handler, which auto-displays any
// payload containing a `notification` field — producing a second, iconless
// notification on top of the custom one shown by our `push` listener below.
// Token generation is unaffected: the client passes its own
// serviceWorkerRegistration to getToken(), so it doesn't rely on this SW
// initializing messaging.

// Derive the app base from the SW scope so icon URLs work regardless of the
// Vite `base` prefix (e.g. /xpertlabuat/front/xperttalk/). A leading "/" would
// resolve to the origin root and 404 under the base path.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const ICON_URL = `${BASE}/media/logos/xperttalk-logo-128.png`;
const BADGE_URL = `${BASE}/media/logos/xperttalk-logo-48.png`;

// Universal push handler — works on all platforms including Linux alt-tab.
// This fires for EVERY push, regardless of whether the page is focused or not.
// If a tab IS focused and visible, we skip to let the foreground onMessage
// handler show a toast instead (avoids duplicate notifications).
self.addEventListener("push", (event) => {
  const pushPayload = event.data?.json() || {};
  console.log("[firebase-sw] Push notification received:", pushPayload);
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const hasFocusedClient = clientList.some(
          (client) => client.visibilityState === "visible" && client.focused
        );

        // If a tab is focused AND visible, let the foreground handler show a toast.
        if (hasFocusedClient) {
          return;
        }

        // No focused tab — show notification from SW.
        // FCM splits the payload: title/body live in `notification`,
        // while app-specific fields (talkId, etc.) live in `data`.
        const payload = pushPayload;
        const notification = payload.notification || {};
        const data = payload.data || {};
        console.log("[firebase-sw] showNotification data:", JSON.stringify(data), data);
        const title = notification.title || data.title || "New Message";
        const options = {
          body: notification.body || data.body || "",
          icon: ICON_URL,
          badge: BADGE_URL,
          vibrate: [100, 50, 100],
          tag: "xperttalk-" + (data.talkId || Date.now()),
          renotify: true,
          data: data,
        };
        return self.registration.showNotification(title, options);
      })
  );
});

// Unicode-safe base64 encode (btoa alone breaks on non-Latin1 chars).
function encodeFcmData(data) {
  const json = JSON.stringify(data || {});
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return encodeURIComponent(btoa(bin));
}

// Handle notification click — focus an open app (and switch chat live) or open
// the app/PWA at the right conversation.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  console.log("[firebase-sw] notificationclick data:", JSON.stringify(data), data);
  // Deep-link URL used only when no app window is open. The client reads the
  // `fcm` param (base64 JSON) to select the chat on load.
  const target = `${BASE}/chats?fcm=${encodeFcmData(data)}`;
  console.log("[firebase-sw] notificationclick target:", target);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        console.log(
          "[firebase-sw] BASE:",
          BASE,
          "| clients:",
          clientList.map((c) => ({ url: c.url, focused: c.focused, vis: c.visibilityState }))
        );
        // Reuse an already-open app window: focus it and tell the running app
        // to switch to this chat — no full reload, preserves socket/state.
        const appClient = clientList.find((c) => c.url.includes(BASE));
        if (appClient) {
          console.log("[firebase-sw] branch=postMessage OPEN_CHAT ->", appClient.url);
          return appClient.focus().then((c) => {
            (c || appClient).postMessage({ type: "OPEN_CHAT", data });
            console.log("[firebase-sw] posted OPEN_CHAT");
          });
        }
        // Nothing open — launch the app/PWA at the deep-linked chat.
        console.log("[firebase-sw] branch=openWindow ->", target);
        if (clients.openWindow) {
          return clients.openWindow(target);
        }
      })
  );
});
