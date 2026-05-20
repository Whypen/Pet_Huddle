export type PetReminder = {
  id: string;
  pet_id: string;
  due_date: string; // YYYY-MM-DD
  kind: string | null;
  reason: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function computeAgeYears(dobISO: string | null | undefined, now = new Date()): number | null {
  if (!dobISO) return null;
  const birth = new Date(dobISO);
  if (Number.isNaN(birth.getTime())) return null;
  const today = startOfDay(now);
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
  return years < 0 ? 0 : years;
}

export type NextEvent = {
  date: Date;
  reasons: string[];
};

function nextBirthdayFromDob(dobISO: string, now = new Date()): Date | null {
  const dob = new Date(dobISO);
  if (Number.isNaN(dob.getTime())) return null;
  const today = startOfDay(now);
  const next = new Date(today);
  next.setMonth(dob.getMonth());
  next.setDate(dob.getDate());
  if (startOfDay(next).getTime() < today.getTime()) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function formatEventDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

export function computeNextEvent(
  petDobISO: string | null | undefined,
  reminders: PetReminder[],
  now = new Date(),
): NextEvent | null {
  const today = startOfDay(now);
  const candidates: { date: Date; reason: string }[] = [];

  if (petDobISO) {
    const b = nextBirthdayFromDob(petDobISO, today);
    if (b) candidates.push({ date: b, reason: "Birthday" });
  }

  for (const r of reminders) {
    const d = new Date(r.due_date);
    if (Number.isNaN(d.getTime())) continue;
    const dd = startOfDay(d);
    if (dd.getTime() < today.getTime()) continue;
    const reason = r.reason?.trim() || r.kind?.trim() || "Reminder";
    candidates.push({ date: dd, reason });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = candidates[0].date.getTime();
  const reasons = candidates.filter((c) => c.date.getTime() === firstDate).map((c) => c.reason);
  return { date: candidates[0].date, reasons: Array.from(new Set(reasons)) };
}

export function formatNextEventLabel(ev: NextEvent | null): string {
  if (!ev) return "—";
  const reasons = ev.reasons.length ? ev.reasons.join(", ") : "Reminder";
  return `${formatEventDate(ev.date)}, ${reasons}`;
}

