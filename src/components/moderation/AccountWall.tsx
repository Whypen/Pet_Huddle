import restrictedImg from "@/assets/Notifications/Restricted.jpg";

interface AccountWallProps {
  status: "suspended" | "removed";
  expiresAt?: string | null;
}

export function AccountWall({ status, expiresAt }: AccountWallProps) {
  const isRemoved = status === "removed";
  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(expiresAt))
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center">
      <img
        src={restrictedImg}
        alt=""
        className="mb-6 h-48 w-48 object-contain opacity-80"
      />
      <h1 className="text-xl font-bold text-brandText mb-2">
        {isRemoved ? "Account removed" : "Account suspended"}
      </h1>
      <p className="text-sm text-muted-foreground mb-1 max-w-xs">
        {isRemoved
          ? "Your account has been permanently removed for violating community guidelines."
          : "Your account has been temporarily suspended for violating community guidelines."}
      </p>
      {expiryLabel && !isRemoved && (
        <p className="text-xs text-muted-foreground mb-4">
          Suspension lifts on {expiryLabel}.
        </p>
      )}
      <a
        href={`mailto:support@huddle.pet?subject=${encodeURIComponent(
          isRemoved
            ? "Account Removed — Appeal"
            : "Account Suspended — Appeal"
        )}`}
        className="mt-4 rounded-full bg-brandBlue px-6 py-3 text-sm font-semibold text-white"
      >
        Contact Support
      </a>
    </div>
  );
}
