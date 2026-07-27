import axios from "axios";
import { clearCookies } from "./cookie";
import {
  decryptArrayOfObjects,
  decryptObject,
  eLevel,
  encryptObject,
  getEncodedCookie,
} from "./encryption";

const appStage = import.meta.env.VITE_APP_STAGE || "";

const URL = {
  uatgogagnerurl: import.meta.env[`VITE_APP_${appStage.toUpperCase()}_API_URL`],
};

export const Securitykey = import.meta.env.VITE_APP_ENCRYPT_KEY || "";
export const publicToken = import.meta.env.VITE_APP_PUBLIC_TOKEN || "";

// API HEADER
export const apiHeader = (isFormData: any, encryptionLevel: any = 0) => {
  const token = getEncodedCookie("token") || "";

  if (!isFormData) {
    return {
      headers: {
        "x-token": token,
        "X-Authorization": `Token ${publicToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        elevel: encryptionLevel,
        "Access-Control-Allow-Origin": "*",
      },
    };
  }

  if (isFormData) {
    return {
      headers: {
        "x-token": token,
        "X-Authorization": `Token ${publicToken}`,
        elevel: encryptionLevel,
        "Content-Type": "multipart/form-data",
      },
    };
  }
};

/** Absolute path of the unauthorized screen, respecting the Vite base path. */
const UNAUTHORIZED_PATH = `${(import.meta.env.BASE_URL || "/").replace(
  /\/$/,
  ""
)}/unauthorized`;

/** Wipe the session and land the user on the unauthorized screen. */
function forceUnauthorized() {
  clearCookies();
  sessionStorage.clear();
  localStorage.removeItem("kt-auth-react-v");

  // Already there — don't loop.
  if (location.pathname === UNAUTHORIZED_PATH) return;
  location.replace(UNAUTHORIZED_PATH);
}

/**
 * Check API response for auth errors and force logout if needed.
 * Handles: 400 (token not provided), 401, 403 → unauthorized screen
 */
function handleAuthError(responseData: any): boolean {
  const status = String(responseData?.status);
  if (["401", "403"].includes(status)) {
    forceUnauthorized();
    return true;
  }
  // 400 with token-related message → also logout
  if (
    status === "400" &&
    typeof responseData?.message === "string" &&
    responseData.message.toLowerCase().includes("token")
  ) {
    forceUnauthorized();
    return true;
  }
  return false;
}

/**
 * Same check for transport-level failures — when the server answers with a real
 * HTTP 401/403 instead of a 200 envelope, axios throws and lands here.
 */
function handleHttpAuthError(error: any): boolean {
  const status = String(error?.response?.status);
  if (["401", "403"].includes(status)) {
    forceUnauthorized();
    return true;
  }
  return false;
}

/** Decrypt response data if encrypted */
function decryptResponseData(response: any) {
  const responseData = response.data;
  if (
    String(responseData?.status) === "200" &&
    responseData.elevel != null &&
    responseData.elevel != "0" &&
    typeof responseData.data === "object" &&
    responseData.data != null
  ) {
    response.data.data = Array.isArray(responseData.data)
      ? decryptArrayOfObjects(responseData.data, eLevel[responseData.elevel])
      : decryptObject(responseData.data, eLevel[responseData.elevel]);
  }
}

export const getData = async (api: string, params: any, headers: any) => {
  try {
    const url = `${URL.uatgogagnerurl}${api}`;
    const response = await axios.get(url, {
      params,
      headers: headers["headers"],
    });

    if (String(response?.status) == "200") {
      if (handleAuthError(response.data)) return undefined;
      decryptResponseData(response);
    }

    return response;
  } catch (error: any) {
    handleHttpAuthError(error);
    console.error("Error in getData:", error.message);
    return undefined;
  }
};

export const postData = async (api: string, data: any, headers: any) => {
  try {
    const url = `${URL.uatgogagnerurl}${api}`;

    if (!(data instanceof FormData)) {
      data = encryptObject(data, eLevel[headers.headers.elevel]);
    }

    const response = await axios.post(url, data, headers);

    if (String(response?.status) == "200") {
      if (handleAuthError(response.data)) return undefined;
      decryptResponseData(response);
    }

    return response;
  } catch (error: any) {
    handleHttpAuthError(error);
    console.error("Error in postData:", error.message);
    return undefined;
  }
};

export const patchData = async (api: string, data: any, headers: any) => {
  try {
    const url = `${URL.uatgogagnerurl}${api}`;

    if (!(data instanceof FormData)) {
      data = encryptObject(data, eLevel[headers.headers.elevel]);
    }

    const response = await axios.patch(url, data, headers);

    if (String(response?.status) == "200") {
      if (handleAuthError(response.data)) return undefined;
      decryptResponseData(response);
    }

    return response;
  } catch (error: any) {
    handleHttpAuthError(error);
    console.error("Error in patchData:", error.message);
    return undefined;
  }
};

export const deleteData = async (api: string, data: any, headers: any) => {
  try {
    const url = `${URL.uatgogagnerurl}${api}`;

    const response = await axios.delete(url, {
      data,
      ...headers,
    });

    if (String(response?.status) == "200") {
      if (handleAuthError(response.data)) return undefined;
    }

    return response;
  } catch (error: any) {
    handleHttpAuthError(error);
    console.error("Error in deleteData:", error.message);
    return undefined;
  }
};

export const getDataThirdParty = async (api: string, params: any, headers: any) => {
  try {
    const url = `${api}`;
    const response = await axios.get(url, {
      params,
      headers: headers["headers"],
    });
    return response;
  } catch (error: any) {
    console.error("Error:", error.message);
    return undefined;
  }
};
