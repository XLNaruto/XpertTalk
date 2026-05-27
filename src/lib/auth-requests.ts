import { apiHeader, postData } from "@/lib/api-helper";

const userType = (import.meta.env.VITE_APP_USER || "employee").toUpperCase();

export async function login(username: string, password: string) {
  return postData(
    "auth/login",
    { username, password, userType, platform: "WEB" },
    apiHeader(false, 0)
  );
}

export async function getUserByToken(apiToken: string) {
  return postData(
    "verify_token",
    { api_token: apiToken },
    apiHeader(false, 0)
  );
}
