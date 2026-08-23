const nativeAuthCallbackPathname = (url: URL) => {
  if (url.protocol === "huddle:") {
    return url.hostname ? `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}` : url.pathname || "/";
  }
  return url.pathname || "/";
};

export const isTrustedNativeAuthCallbackUrl = (url: URL) => {
  if (nativeAuthCallbackPathname(url) !== "/auth/callback") return false;
  if (url.protocol === "huddle:") return true;
  return url.protocol === "https:" && (url.hostname === "huddle.pet" || url.hostname === "www.huddle.pet");
};
