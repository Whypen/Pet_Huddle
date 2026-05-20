const STAY_LOGGED_IN_KEY = "huddle_stay_logged_in";

export function enablePersistentSession() {
  localStorage.setItem(STAY_LOGGED_IN_KEY, "true");
}

export function enableSessionOnlyAuth() {
  localStorage.setItem(STAY_LOGGED_IN_KEY, "false");
}
