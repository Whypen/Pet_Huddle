type NativeMembershipRefreshRetryOptions = {
  delayMs: number;
  isCurrentSession: () => boolean;
  refresh: () => Promise<void> | void;
};

/** Schedules exactly one session-bound refresh attempt and returns its cleanup. */
export const scheduleNativeMembershipRefreshRetry = ({
  delayMs,
  isCurrentSession,
  refresh,
}: NativeMembershipRefreshRetryOptions) => {
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled || !isCurrentSession()) return;
    void refresh();
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
};
