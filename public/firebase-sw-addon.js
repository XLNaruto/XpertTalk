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
const messaging = firebase.messaging();

// Universal push handler — works on all platforms including Linux alt-tab.
// This fires for EVERY push, regardless of whether the page is focused or not.
// If a tab IS focused and visible, we skip to let the foreground onMessage
// handler show a toast instead (avoids duplicate notifications).
self.addEventListener("push", (event) => {
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

        // No focused tab — show notification from SW
        const payload = event.data?.json() || {};
        const data = payload.data || payload.notification || {};
        const title = data.title || "New Message";
        const options = {
          body: data.body || "",
          icon: "/media/logos/xperttalk-logo-128.jpg",
          badge: "/media/logos/xperttalk-logo-48.jpg",
          vibrate: [100, 50, 100],
          tag: "xperttalk-" + (data.talkId || Date.now()),
          renotify: true,
          data: data,
        };
        return self.registration.showNotification(title, options);
      })
  );
});

// Handle notification click — open or focus the app
// self.addEventListener("notificationclick", (event) => {
//   event.notification.close();
//   event.waitUntil(
//     clients
//       .matchAll({ type: "window", includeUncontrolled: true })
//       .then((clientList) => {
//         for (const client of clientList) {
//           if (client.url.includes("/chats") && "focus" in client) {
//             return client.focus();
//           }
//         }
//         if (clients.openWindow) {
//           return clients.openWindow("/chats/");
//         }
//       })
//   );
// });
