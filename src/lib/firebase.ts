import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyArWCjVcd_6WukebmDXNNiT5xnfnmm_-DI",
  authDomain: "xperttalk-2025.firebaseapp.com",
  projectId: "xperttalk-2025",
  storageBucket: "xperttalk-2025.firebasestorage.app",
  messagingSenderId: "549412393867",
  appId: "1:549412393867:web:8e8c44480ebfa7746a558e",
  measurementId: "G-Q7SN5NYT86",
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export const generateToken = async () => {
  const permission = await Notification.requestPermission();
  let token = "";
  if (permission === "granted") {
    try {
      const serviceWorkerRegistration = await navigator.serviceWorker.ready;
      token = await getToken(messaging, {
        vapidKey:
          "BFog9fo16WkUfO37C9jJZB8l0TfN2tVxNY-Y3Mry-7SzXSbsAMOHvN4ZONHX2DErzLI8JuU7ijhm9teY7nY9dP8",
        serviceWorkerRegistration,
      });
    } catch (error) {
      console.error("Error generating FCM token:", error);
    }
  } else {
    console.log("Notification permission not granted");
  }
  return token;
};

export { messaging };
