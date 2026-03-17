interface RestrictedBannerProps {
  expiresAt?: string | null;
}

export function RestrictedBanner({ expiresAt }: RestrictedBannerProps) {
  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(expiresAt)
      )
    : null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 px-4 py-2 text-center text-xs font-medium text-white">
      Your account is restricted.
      {expiryLabel ? ` Access restores on ${expiryLabel}.` : ""}{" "}
      <a
        href="mailto:support@huddle.pet?subject=Account%20Restricted%20%E2%80%94%20Appeal"
        className="underline"
      >
        Contact support
      </a>
    </div>
  );
}
