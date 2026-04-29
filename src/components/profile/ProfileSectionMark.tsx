type ProfileSectionMarkProps = {
  label: string;
  sublabel?: string;
};

export function ProfileSectionMark({ label, sublabel }: ProfileSectionMarkProps) {
  return (
    <div className="px-[var(--space-5,24px)] py-[var(--space-5,24px)]">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-extrabold text-[var(--huddle-blue)]">*</span>
        <h2 className="type-h2 uppercase tracking-[0.01em] text-[var(--fg-1)]">{label}</h2>
      </div>
      {sublabel ? (
        <p className="type-helper mt-1 pl-6 italic text-[var(--fg-2)]">{sublabel}</p>
      ) : null}
    </div>
  );
}
