const STAY_LOGGED_IN_KEY = "huddle_stay_logged_in";

function clearSupabaseAuthTokens() {
  Object.keys(localStorage).forEach((key) => {
    if (key.includes("auth-token") && key.startsWith("sb-")) {
      localStorage.removeItem(key);
    }
    if (key.includes("supabase.auth.token")) {
      localStorage.removeItem(key);
    }
  });
}

function clearAuthTokensIfSessionOnly() {
  try {
    if (localStorage.getItem(STAY_LOGGED_IN_KEY) !== "false") return;
  } catch {
    return;
  }
  clearSupabaseAuthTokens();
}

export function enablePersistentSession() {
  localStorage.setItem(STAY_LOGGED_IN_KEY, "true");
  window.removeEventListener("beforeunload", clearAuthTokensIfSessionOnly);
  window.removeEventListener("pagehide", clearAuthTokensIfSessionOnly);
}

export function enableSessionOnlyAuth() {
  localStorage.setItem(STAY_LOGGED_IN_KEY, "false");
  window.removeEventListener("beforeunload", clearAuthTokensIfSessionOnly);
  window.removeEventListener("pagehide", clearAuthTokensIfSessionOnly);
  window.addEventListener("beforeunload", clearAuthTokensIfSessionOnly);
  window.addEventListener("pagehide", clearAuthTokensIfSessionOnly);
}

