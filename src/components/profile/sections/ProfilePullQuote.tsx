type ProfilePullQuoteProps = {
  bio: string;
};

export function ProfilePullQuote({ bio }: ProfilePullQuoteProps) {
  const text = bio.trim();
  if (!text) return null;

  return (
    <section className="px-5 py-7">
      <p className="mx-auto max-w-[340px] whitespace-pre-wrap text-[17px] font-medium italic leading-relaxed text-[var(--fg-1)]">
        {text}
      </p>
    </section>
  );
}
