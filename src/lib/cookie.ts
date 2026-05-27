/* eslint-disable no-useless-escape */

export function getCookie(name: any) {
  const userStage = import.meta.env.VITE_APP_USER || "employee";
  name = userStage == "employee" ? "xlc-" + name : "xlca-" + name;
  if (typeof window === "undefined") {
    return undefined;
  }

  const cookieMatch = document.cookie.match(
    new RegExp(
      "(?:^|; )" +
        name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") +
        "=([^;]*)"
    )
  );

  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;
}

export function setCookie(name: any, value: any, cookieOptions: any) {
  const userStage = import.meta.env.VITE_APP_USER || "employee";
  name = userStage == "employee" ? "xlc-" + name : "xlca-" + name;

  const options = {
    path: "/",
    ...cookieOptions,
  };

  if (options.expires instanceof Date) {
    options.expires = options.expires.toUTCString();
  }

  let updatedCookie =
    encodeURIComponent(name) + "=" + encodeURIComponent(value);

  for (const optionKey in options) {
    updatedCookie += "; " + optionKey;
    const optionValue = options[optionKey];
    if (optionValue !== true) {
      updatedCookie += "=" + optionValue;
    }
  }

  document.cookie = updatedCookie;
}

export function setCookieForOneYear(name: any, value: any) {
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  setCookie(name, value, { expires: oneYearFromNow });
}

export function deleteCookie(name: any) {
  setCookie(name, "", { "max-age": -1 });
}

export function clearCookies() {
  const userStage = import.meta.env.VITE_APP_USER || "employee";

  const cookies = document.cookie.split(";");
  cookies.forEach((cookie) => {
    let cookieName = cookie.split("=")[0].trim();
    if (cookieName.startsWith(userStage == "employee" ? "xlc-" : "xlca-")) {
      cookieName = decodeURIComponent(cookieName);
      setCookie(
        cookieName.replace(userStage == "employee" ? "xlc-" : "xlca-", ""),
        "",
        { "max-age": -1 }
      );
    }
  });
}
