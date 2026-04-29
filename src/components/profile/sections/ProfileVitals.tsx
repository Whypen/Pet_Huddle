import type { ComponentType } from "react";

type ProfileVitalsProps = {
  rows: Array<{
    label: string;
    value: string;
    Icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
};

export function ProfileVitals({ rows }: ProfileVitalsProps) {
  if (rows.length === 0) return null;

  return (
    <section className="px-5 py-7">
      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--fg-1)]">Key info</h2>
      <div>
        {rows.map((row) => (
          <div key={row.label} className="grid min-h-14 grid-cols-[44px_1fr] items-center gap-3 border-b border-[rgba(66,73,101,0.10)] py-3 last:border-b-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--fg-1)]" aria-hidden>
              {row.Icon ? <row.Icon className="h-4 w-4" strokeWidth={1.8} /> : null}
            </span>
            <span className="sr-only">{row.label}</span>
            <span className="min-w-0 break-words text-[17px] font-semibold leading-snug text-[var(--fg-1)]">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
