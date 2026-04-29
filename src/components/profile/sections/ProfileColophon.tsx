type ProfileColophonProps = {
  memberSince?: string | null;
  memberNumber?: number | null;
};

const formatMemberSince = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en", { month: "short", year: "numeric" });
};

export function ProfileColophon({ memberSince, memberNumber }: ProfileColophonProps) {
  const since = formatMemberSince(memberSince);
  const parts = [
    typeof memberNumber === "number" && memberNumber > 0 ? `#${memberNumber}` : null,
    since ? `With huddle since ${since}` : "With huddle",
  ].filter(Boolean);

  return (
    <footer className="px-5 py-8 text-center">
      <p className="type-meta text-[var(--fg-1)]">{parts.join(" · ")}</p>
    </footer>
  );
}
