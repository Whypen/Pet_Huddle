// Care Agreement PDF builder — pure + testable (no network, no Supabase here).
// index.ts fetches data/fonts/signatures and hands them in. Kept separate so the
// layout + crash-safety can be unit-tested offline against adversarial input.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import * as fontkitModule from "https://esm.sh/@pdf-lib/fontkit@1.1.1?target=deno";

// esm.sh exposes the module on `default` at runtime, but the bundled .d.ts has no
// default export — resolve safely so both runtime and `deno check` are happy.
const fontkit = ((fontkitModule as { default?: unknown }).default ?? fontkitModule) as Parameters<PDFDocument["registerFontkit"]>[0];

// Brand tokens (mirrors app/src/theme/huddleDesignTokens.ts so the document stays on-system).
const BRAND_BLUE = rgb(0x21 / 255, 0x45 / 255, 0xcf / 255); // #2145CF
const TEXT = rgb(0x42 / 255, 0x49 / 255, 0x65 / 255); // #424965
const MUTED = rgb(0.49, 0.5, 0.56); // opaque stand-in for mutedText rgba(74,73,101,0.55)
const CANVAS_W = 595.28;
const CANVAS_H = 841.89;
const MARGIN = 48;
const BAND_H = 52;
const SECTION_GAP = 28;
const HAIRLINE = rgb(0.84, 0.86, 0.9);
const LIABILITY_BOX_FILL = rgb(0.92, 0.95, 1);
const LIABILITY_BOX_BORDER = rgb(0.78, 0.84, 0.98);
const WHITE = rgb(1, 1, 1);
const SIG_RULE = rgb(0.55, 0.57, 0.64);
const FOOT_RESERVE = 72; // keep clear at page bottom for the disclaimer line

const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: "A$", CAD: "C$", EUR: "€", GBP: "£", HKD: "HK$", JPY: "¥", SGD: "SG$", USD: "US$",
};

export const clean = (value: unknown) => String(value ?? "").trim();

const petSpeciesWithSize = (species: unknown, dogSize: unknown) => {
  const raw = clean(species);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const normalized = lower === "cats" || lower === "cat"
    ? "Cat"
    : lower === "dogs" || lower === "dog"
      ? "Dog"
      : raw.replace(/\b\w/g, (char) => char.toUpperCase());
  const size = clean(dogSize);
  return normalized === "Dog" && size ? `Dog (${size})` : normalized;
};

export const money = (currency: unknown, minor: unknown) => {
  const code = clean(currency).toUpperCase();
  const amount = Number(minor);
  const symbol = CURRENCY_SYMBOLS[code] || (code ? `${code} ` : "");
  if (!Number.isFinite(amount)) return "-";
  const value = code === "JPY" ? amount : amount / 100;
  return `${symbol}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
};

const majorMoney = (currency: unknown, major: unknown) => {
  const amount = Number(major);
  if (!Number.isFinite(amount)) return "-";
  return money(currency, Math.round(amount * 100));
};

const minorAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const majorAmount = (value: unknown) => {
  const amount = Number(clean(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const fixedOffsetMatch = (offset: string) => offset.match(/^UTC([+-])(\d{2}):(\d{2})$/);

// Shift a Date by a fixed UTC offset string (e.g. "UTC+08:00") and format its
// date/time parts against the UTC calendar of the *shifted* instant -- this is how
// a fixed-offset zone (as opposed to an IANA zone) has to be rendered, since
// Intl.DateTimeFormat has no concept of a raw "+08:00" zone identifier.
const fixedOffsetParts = (date: Date, offset: string) => {
  const match = fixedOffsetMatch(offset);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const minutes = sign * (Number(match[2]) * 60 + Number(match[3]));
  const shifted = new Date(date.getTime() + minutes * 60_000);
  const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(shifted);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(shifted);
  return { day, time };
};

const resolvedZone = (timeZone?: string | null) => (timeZone && timeZone.trim() ? timeZone.trim() : "UTC");

// The short "(UTC)" / "(UTC+08:00)" / "(Asia/Hong_Kong)" suffix, shared by the Date
// row and the Time row so a start/end range only states its zone once, not twice.
export const tzLabel = (timeZone?: string | null) => {
  const zone = resolvedZone(timeZone);
  return zone === "UTC" ? "UTC" : zone;
};

const dateTimeParts = (value: unknown, timeZone?: string | null): { day: string; time: string } | null => {
  const raw = clean(value);
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const zone = resolvedZone(timeZone);
  const fixedOffset = fixedOffsetParts(dt, zone);
  if (fixedOffset) return fixedOffset;
  try {
    return {
      day: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: zone }).format(dt),
      time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(dt),
    };
  } catch {
    return {
      day: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(dt),
      time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(dt),
    };
  }
};

// Render an instant in a stated zone with an explicit label so an agreed start/end
// time is never silently shown in the wrong timezone.
export const fmtDate = (value: unknown, timeZone?: string | null) => {
  const parts = dateTimeParts(value, timeZone);
  if (!parts) return clean(value) || "-";
  return `${parts.day}, ${parts.time} (${tzLabel(timeZone)})`;
};

// Date-only, no time and no zone label -- used for the "Date" row so it isn't a
// duplicate of the "Time" row.
export const fmtDateOnly = (value: unknown, timeZone?: string | null) => {
  const parts = dateTimeParts(value, timeZone);
  return parts ? parts.day : clean(value) || "-";
};

// Time-only (24h), no date and no zone label -- the caller appends the zone once
// for the whole start-end range instead of repeating it on both ends.
export const fmtTimeOnly = (value: unknown, timeZone?: string | null) => {
  const parts = dateTimeParts(value, timeZone);
  return parts ? parts.time : "?";
};

// Replace any glyph the active font cannot encode so drawText never throws on
// non-Latin names / emoji. Latin & extended-Latin pass through (esp. with Noto).
const makeSanitizer = (font: PDFFont) => {
  const cache = new Map<string, string>();
  return (value: unknown): string => {
    const str = String(value ?? "");
    if (!str) return "";
    const cached = cache.get(str);
    if (cached !== undefined) return cached;
    let safe: string;
    try {
      font.widthOfTextAtSize(str, 10);
      safe = str;
    } catch {
      let out = "";
      for (const ch of str) {
        try {
          font.widthOfTextAtSize(ch, 10);
          out += ch;
        } catch {
          out += /\s/.test(ch) ? " " : "?";
        }
      }
      safe = out;
    }
    cache.set(str, safe);
    return safe;
  };
};

type Sanitize = (value: unknown) => string;

// Wrap by real font metrics (not character count) and hard-break overlong tokens
// so nothing ever overruns the text column.
const wrapByWidth = (font: PDFFont, sanitize: Sanitize, text: string, size: number, maxWidth: number): string[] => {
  const cleaned = sanitize(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return ["-"];
  const rows: string[] = [];
  let row = "";
  const pushWord = (word: string) => {
    let chunk = word;
    while (font.widthOfTextAtSize(chunk, size) > maxWidth && chunk.length > 1) {
      let cut = chunk.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > maxWidth) cut -= 1;
      rows.push(chunk.slice(0, cut));
      chunk = chunk.slice(cut);
    }
    return chunk;
  };
  for (const word of cleaned.split(" ")) {
    const next = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && row) {
      rows.push(row);
      row = font.widthOfTextAtSize(word, size) > maxWidth ? pushWord(word) : word;
    } else {
      row = next;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : ["-"];
};

export type CareAgreementPdfInput = {
  agreementVersion: string;
  reference: string;
  generatedAt: string;
  ownerName: string;
  providerName: string;
  petName: string;
  ownerSignedAt: string;
  providerSignedAt: string;
  snapshot: Record<string, unknown>;
  ownerSignaturePng: Uint8Array;
  providerSignaturePng: Uint8Array;
  logoPng?: Uint8Array | null;
  viewerRole?: "owner" | "carer" | null;
  timeZone?: string | null;
  cancellationPolicyText?: string | null;
  carerContactNumber?: string | null;
  fonts?: { regular?: Uint8Array | null; bold?: Uint8Array | null };
};

const OWNER_PAID_CANCELLATION =
  "72 hours or more before the start - full refund to your original payment method.\n" +
  "24 to 72 hours before the start - 50% refund; Huddle retains the remaining 50%.\n" +
  "Less than 24 hours before the start - no refund.";

const OWNER_VOLUNTEER_CANCELLATION =
  "No payment is involved, but a confirmed booking remains a commitment.\n" +
  "Repeated or last-minute cancellations or no-shows may restrict your access to bookings, the same as on a paid booking.";

const CARER_PAID_CANCELLATION =
  "More than 24 hours before care - cancellation is recorded and may affect how often your profile appears.\n" +
  "Within 24 hours - Care access may be restricted while Huddle reviews.\n" +
  "Confirmed no-shows or serious reliability issues may suspend Care access. A cancellation trust penalty affects marketplace ranking, not an undisclosed cash deduction; any payout amount or deduction is shown before acceptance.";

const CARER_VOLUNTEER_CANCELLATION =
  "No payment is involved, but a confirmed booking is still a commitment.\n" +
  "Repeated or last-minute cancellations or no-shows may restrict how often your profile appears, the same as on a paid booking.";

const OWNER_NO_START_POLICY =
  "Care must start, or a no-start issue must be reported, before the scheduled end time. If it does not, the system cancels the booking and disables PIN and check-in actions.\n" +
  "Huddle decides any refund, retained amount, payout, and trust consequence from the reports and platform records. A paid outcome may include a full refund, no refund, a reserved-time carer payout, a retained amount, or review. The 50% retained amount applies only to the applicable owner-requested self-cancellation tier and is not a fixed system no-start result. No-payment bookings have no financial movement. Silence does not guarantee a refund.";

const CARER_NO_START_POLICY =
  "Care must start, or you must submit one no-start report, before the scheduled end time. If it does not, the system cancels the booking and disables PIN and check-in actions.\n" +
  "Huddle decides any payout and trust consequence from the reports and platform records. The outcome may include no payout, a reserved-time payout, or review. A report may pause payment handling, and no payout, resolution time, or other outcome is guaranteed while it is reviewed. No-payment bookings have no financial movement.";

const PLATFORM_LIABILITY =
  "This Care Agreement is a direct agreement between the Owner and the Care Provider. Huddle operates the " +
  "platform as a facilitator - discovery, booking, payments, messaging, and safety tooling - and is not the direct care provider, " +
  "not an employer or agent of the Care Provider, and not a party to the care itself. The Care Provider acts " +
  "as an independent party responsible for the care delivered. To the fullest extent permitted by law, Huddle " +
  "is not liable for the acts, omissions, or outcomes of the care arranged through the platform.";

const objectValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
export const arrayText = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean).join(", ") : clean(value);
export const combinedTaskText = (...values: unknown[]) => values.map(arrayText).filter(Boolean).join(", ");
export const requestedDateText = (request: Record<string, unknown>, snapshot: Record<string, unknown>) => {
  const dates = Array.isArray(request.requestedDates) ? request.requestedDates.map(clean).filter(Boolean) : [];
  return dates.length ? dates.join(", ") : clean(request.requestedDate) || clean(snapshot.requestedDate);
};
export const timeRangeText = (request: Record<string, unknown>, snapshot: Record<string, unknown>) => {
  const start = clean(request.startTime) || clean(snapshot.startTime);
  const end = clean(request.endTime) || clean(snapshot.endTime);
  return start || end ? `${start || "?"} - ${end || "?"}` : "";
};
export const careUpdatePreferenceText = (value: unknown) => {
  const raw = clean(value);
  if (!raw || raw === "No preference" || raw === "Update as needed" || raw === "Update as needed (Default)" || raw === "Optional") return "Optional";
  if (raw === "Photos please" || raw === "Photo updates" || raw === "Photo") return "Photo";
  if (raw === "Daily update" || raw === "Daily summary" || raw === "Summary") return "Summary";
  if (raw === "Every visit" || raw === "Notes + photos" || raw === "Photo + summary") return "Photo + summary";
  return "Optional";
};
export const locationText = (request: Record<string, unknown>, quote: Record<string, unknown>, snapshot: Record<string, unknown>) => {
  // Matches the in-app "Setting" row exactly (RequestQuoteSummaryCard in
  // NativeServiceChatScreen.tsx): quote's location overrides request's, and the
  // frozen `handoffMethod` snapshot field is only a last-resort fallback for the
  // rare case neither live card has location data.
  const styles = Array.isArray(quote.locationStyles) && quote.locationStyles.length
    ? quote.locationStyles.map(clean).filter(Boolean).join(", ")
    : Array.isArray(request.locationStyles) ? request.locationStyles.map(clean).filter(Boolean).join(", ") : "";
  const area = clean(quote.locationArea) || clean(request.locationArea) || clean(snapshot.locationArea);
  return [styles, area].filter(Boolean).join(" - ") || clean(snapshot.handoffMethod) || clean(snapshot.locationSummary) || clean(snapshot.locationAddress) || clean(snapshot.location);
};
const comparableLocationText = (value: unknown) => clean(value).toLowerCase().replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim();
const userEnteredHandoffLocation = (value: unknown, request: Record<string, unknown>, quote: Record<string, unknown>, snapshot: Record<string, unknown>) => {
  const raw = clean(value);
  if (!raw) return "";
  const normalized = comparableLocationText(raw);
  const styles = Array.isArray(request.locationStyles) ? request.locationStyles.map(clean).filter(Boolean) : [];
  const area = clean(request.locationArea) || clean(snapshot.locationArea);
  const defaultValues = [
    area,
    styles.join(" / "),
    styles.join(", "),
    [styles.join(" / "), area].filter(Boolean).join(" - "),
    [styles.join(", "), area].filter(Boolean).join(" - "),
    [styles.join(" / "), area].filter(Boolean).join(" — "),
    [styles.join(", "), area].filter(Boolean).join(" — "),
    locationText(request, quote, snapshot),
  ].map(comparableLocationText).filter(Boolean);
  return defaultValues.includes(normalized) ? "" : raw;
};
// Platform fee rates must mirror create-service-payment/index.ts (REQUESTER_FEE_RATE,
// PROVIDER_FEE_RATE) exactly, since this is the receipt for the same charge.
const REQUESTER_FEE_RATE = 0;
const PROVIDER_FEE_RATE = 0.1;

// Care Scope (quote_card, falling back to request_card) is the single source of
// truth for the agreed rate — never the frozen booking_snapshot.price object,
// which can go stale relative to a later Care Scope edit and show a different
// number than the in-app Care Scope card (the "$10 vs $11" bug).
const paymentAmounts = (snapshot: Record<string, unknown>, quote: Record<string, unknown>, request: Record<string, unknown>) => {
  const price = objectValue(snapshot.price);
  const currency = clean(quote.currency) || clean(request.suggestedCurrency) || clean(price.currency);
  const base = majorAmount(quote.finalPrice) || majorAmount(request.suggestedPrice);
  if (!base) return { currency, finalRate: "Voluntary / no charge", ownerPays: "Voluntary / no charge", carerReceives: "Voluntary / no charge" };
  return {
    currency,
    finalRate: majorMoney(currency, base),
    ownerPays: majorMoney(currency, base * (1 + REQUESTER_FEE_RATE)),
    carerReceives: majorMoney(currency, base * (1 - PROVIDER_FEE_RATE)),
  };
};

export async function buildCareAgreementPdf(input: CareAgreementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Standard font first so the fonts are always assigned; paired with the glyph
  // sanitiser below it never throws. Override with the Unicode font when supplied.
  let font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  let boldFont: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  if (input.fonts?.regular) {
    try {
      doc.registerFontkit(fontkit);
      font = await doc.embedFont(input.fonts.regular, { subset: true });
      // Bold text here is all ASCII (titles + field labels), so keep crisp Helvetica-Bold
      // unless a dedicated bold Unicode face is supplied. CJK body values use the regular face.
      if (input.fonts.bold) boldFont = await doc.embedFont(input.fonts.bold, { subset: true });
    } catch {
      // Keep the standard font — a missing/corrupt Unicode font can never block the document.
    }
  }
  const sanitize = makeSanitizer(font);
  const sanitizeBold = makeSanitizer(boldFont);
  const snapshot = input.snapshot || {};
  const scopeVersion = clean(snapshot.scopeVersionId || snapshot.scope_version_id || snapshot.scopeVersion);
  const scopeHash = clean(snapshot.scopeHash || snapshot.scope_hash);

  doc.setTitle("Care Agreement");
  doc.setSubject(
    [
      clean(input.reference) ? `reference:${clean(input.reference)}` : "",
      scopeVersion ? `scope_version:${scopeVersion}` : "",
      scopeHash ? `scope_hash:${scopeHash}` : "",
    ].filter(Boolean).join(" | "),
  );

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (input.logoPng) {
    try { logo = await doc.embedPng(input.logoPng); } catch { logo = null; }
  }

  let page: PDFPage = doc.addPage([CANVAS_W, CANVAS_H]);
  let y = 0;

  // Running header: blue band with the document title (left) and white Huddle wordmark (right).
  const drawBand = () => {
    page.drawRectangle({ x: 0, y: CANVAS_H - BAND_H, width: CANVAS_W, height: BAND_H, color: BRAND_BLUE });
    page.drawText("Care Agreement", { x: MARGIN, y: CANVAS_H - BAND_H + 19, size: 17, font: boldFont, color: WHITE });
    if (logo) {
      const lh = 34;
      const lw = lh * (logo.width / logo.height);
      page.drawImage(logo, { x: CANVAS_W - MARGIN - lw, y: CANVAS_H - BAND_H + (BAND_H - lh) / 2, width: lw, height: lh });
    } else {
      const wordmark = "huddle";
      const size = 18;
      const width = boldFont.widthOfTextAtSize(wordmark, size);
      page.drawText(wordmark, { x: CANVAS_W - MARGIN - width, y: CANVAS_H - BAND_H + 18, size, font: boldFont, color: WHITE });
    }
    y = CANVAS_H - BAND_H - 30;
  };
  drawBand();

  const ensure = (needed: number) => {
    if (y - needed < FOOT_RESERVE) {
      page = doc.addPage([CANVAS_W, CANVAS_H]);
      drawBand();
    }
  };

  const section = (title: string, keepWith = 70) => {
    ensure(keepWith);
    y -= SECTION_GAP;
    page.drawText(sanitizeBold(title), { x: MARGIN, y, size: 12, font: boldFont, color: BRAND_BLUE });
    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: CANVAS_W - MARGIN, y },
      thickness: 0.6,
      color: HAIRLINE,
    });
    y -= 22;
  };

  const valueColX = 168;
  const valueWidth = CANVAS_W - valueColX - MARGIN;
  const field = (label: string, value: unknown) => {
    const rows = wrapByWidth(font, sanitize, clean(value) || "-", 9, valueWidth);
    ensure(Math.max(22, rows.length * 15 + 8));
    page.drawText(`${sanitizeBold(label)}:`, { x: MARGIN, y, size: 9, font: boldFont, color: MUTED });
    rows.forEach((row, index) => {
      page.drawText(row, { x: valueColX, y: y - index * 15, size: 9, font, color: TEXT });
    });
    y -= Math.max(22, rows.length * 15 + 8);
  };
  // Care Scope fields are optional per-booking; an empty one is not a document
  // defect and shouldn't render as a bare "label: -" row.
  const fieldIfPresent = (label: string, value: unknown) => {
    if (!clean(value)) return;
    field(label, value);
  };

  // Money rows read larger and bold so the Payment section reads like a receipt
  // line instead of blending into the same plain label:value list as every other
  // field in the document.
  const moneyField = (label: string, value: unknown) => {
    ensure(26);
    page.drawText(`${sanitizeBold(label)}:`, { x: MARGIN, y, size: 9.5, font: boldFont, color: MUTED });
    page.drawText(sanitizeBold(clean(value) || "-"), { x: valueColX, y, size: 12, font: boldFont, color: TEXT });
    y -= 26;
  };

  const toPolicyLines = (text: string) => text
    .split(/\n|(?<=\.)\s+(?=\d|Less|More|24)/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  // The paid-booking refund tiers and the no-payment/volunteer commitment are two
  // distinct policies that both apply to any given viewer -- a booking can carry a
  // price today and be edited to $0 tomorrow, so both must always be shown.
  const paidPolicyLines = toPolicyLines(
    input.viewerRole === "carer" ? CARER_PAID_CANCELLATION : clean(input.cancellationPolicyText) || OWNER_PAID_CANCELLATION,
  );
  const volunteerPolicyLines = toPolicyLines(
    input.viewerRole === "carer" ? CARER_VOLUNTEER_CANCELLATION : OWNER_VOLUNTEER_CANCELLATION,
  );
  const noStartPolicyLines = toPolicyLines(input.viewerRole === "carer" ? CARER_NO_START_POLICY : OWNER_NO_START_POLICY);

  const finalPolicyBox = () => {
    const maxWidth = CANVAS_W - MARGIN * 2 - 32;
    const bodySize = 8.2;
    const bodyLeading = 15;
    const policyRowGap = 15;
    const platformRows = wrapByWidth(font, sanitize, PLATFORM_LIABILITY, bodySize, maxWidth);
    const paidRowsByLine = paidPolicyLines.map((line) => wrapByWidth(font, sanitize, line, bodySize, maxWidth - 12));
    const volunteerRowsByLine = volunteerPolicyLines.map((line) => wrapByWidth(font, sanitize, line, bodySize, maxWidth - 12));
    const noStartRowsByLine = noStartPolicyLines.map((line) => wrapByWidth(font, sanitize, line, bodySize, maxWidth - 12));
    // Each bullet must reserve its own wrapped height, not a flat per-bullet gap --
    // otherwise a bullet that wraps to 2+ lines overlaps the next bullet's text.
    const policyRowHeight = (rows: string[]) => Math.max(policyRowGap, rows.length * bodyLeading);
    const policyBlockHeight = (rowsByLine: string[][]) => 28 + rowsByLine.reduce((sum, rows) => sum + policyRowHeight(rows), 0);
    const boxH = 44 + platformRows.length * bodyLeading + policyBlockHeight(paidRowsByLine) + policyBlockHeight(volunteerRowsByLine) + policyBlockHeight(noStartRowsByLine);
    const boxBottom = 74;
    const boxTop = boxBottom + boxH;
    if (y < boxTop + 28) {
      page = doc.addPage([CANVAS_W, CANVAS_H]);
      drawBand();
    }
    page.drawRectangle({
      x: MARGIN,
      y: boxBottom,
      width: CANVAS_W - MARGIN * 2,
      height: boxH,
      color: LIABILITY_BOX_FILL,
      borderColor: LIABILITY_BOX_BORDER,
      borderWidth: 0.8,
    });
    let boxY = boxTop - 22;
    page.drawText(sanitizeBold("Platform role & responsibility"), { x: MARGIN + 16, y: boxY, size: 10, font: boldFont, color: BRAND_BLUE });
    boxY -= 18;
    platformRows.forEach((row) => {
      page.drawText(row, { x: MARGIN + 16, y: boxY, size: bodySize, font, color: TEXT });
      boxY -= bodyLeading;
    });
    const drawPolicyBlock = (heading: string, rowsByLine: string[][]) => {
      boxY -= 10;
      page.drawText(sanitizeBold(heading), { x: MARGIN + 16, y: boxY, size: 10, font: boldFont, color: BRAND_BLUE });
      boxY -= 18;
      rowsByLine.forEach((rows) => {
        page.drawText("-", { x: MARGIN + 16, y: boxY, size: bodySize, font, color: TEXT });
        rows.forEach((row, index) => {
          page.drawText(row, { x: MARGIN + 28, y: boxY - index * bodyLeading, size: bodySize, font, color: TEXT });
        });
        boxY -= policyRowHeight(rows);
      });
    };
    drawPolicyBlock(input.viewerRole === "carer" ? "Cancellation policy (paid bookings)" : "Cancellation & refunds (paid bookings)", paidRowsByLine);
    drawPolicyBlock("Cancellation policy (no-payment bookings)", volunteerRowsByLine);
    drawPolicyBlock("No-start policy", noStartRowsByLine);
  };

  section("Parties", 78);
  field("Owner", input.ownerName || "Owner");
  field("Care provider", input.providerName || "Care provider");

  const requestCard = objectValue(snapshot.requestCard);
  const quoteCard = objectValue(snapshot.quoteCard);
  const careDetails = objectValue(snapshot.careDetails);
  const vet = objectValue(careDetails.emergencyVetAuthorization || snapshot.emergencyVetAuthorization);
  const scopeTasks = combinedTaskText(quoteCard.scopeTasks || requestCard.scopeTasks || snapshot.scopeTasks, quoteCard.otherTasks || requestCard.otherTasks || snapshot.otherTasks);
  const serviceText = arrayText(quoteCard.serviceTypes || requestCard.serviceTypes || snapshot.serviceTypes) || clean(quoteCard.serviceType) || clean(requestCard.serviceType) || clean(snapshot.serviceType);
  const petRows = Array.isArray(requestCard.pets) ? requestCard.pets as Record<string, unknown>[] : [];
  const firstPet = objectValue(petRows[0]);
  const petSpecies = petSpeciesWithSize(
    firstPet.petSpecies || firstPet.petType || requestCard.petSpecies || requestCard.petType || snapshot.petSpecies,
    firstPet.dogSize || requestCard.dogSize || snapshot.dogSize,
  );
  const petText = [
    input.petName || firstPet.petName || snapshot.petName || snapshot.petId,
    petSpecies,
    firstPet.petBreed || snapshot.petBreed,
  ].map((item) => clean(item)).filter(Boolean).join(" - ");
  const handoffLocation = userEnteredHandoffLocation(careDetails.handoffLocation, requestCard, quoteCard, snapshot) || userEnteredHandoffLocation(snapshot.handoffLocation, requestCard, quoteCard, snapshot);
  const payment = paymentAmounts(snapshot, quoteCard, requestCard);
  const termsAcceptedAt = clean(snapshot.agreedAt) || clean(input.providerSignedAt) || clean(input.ownerSignedAt) || clean(input.generatedAt);

  section("Confirmed care scope", 88);
  field("Service", serviceText);
  field("Pet", petText);
  field("Date", requestedDateText(requestCard, snapshot) || fmtDateOnly(snapshot.startAt, input.timeZone));
  field("Time", timeRangeText(requestCard, snapshot) || `${fmtTimeOnly(snapshot.startAt, input.timeZone)} - ${fmtTimeOnly(snapshot.endAt, input.timeZone)} (${tzLabel(input.timeZone)})`);
  field("Location", locationText(requestCard, quoteCard, snapshot));
  fieldIfPresent("Care tasks", scopeTasks);
  fieldIfPresent("Walk frequency", quoteCard.scopeFrequency || requestCard.scopeFrequency || snapshot.scopeFrequency);
  field("Care updates", careUpdatePreferenceText(requestCard.updatePreference || quoteCard.updatePreference || snapshot.updatePreference));

  section("Safety & instructions", 92);
  const ownerContact = careDetails.ownerContact || careDetails.owner_contact || careDetails.contact || snapshot.ownerContact || snapshot.owner_contact || snapshot.contact;
  // Directional: the Carer needs the Owner's contact + emergency contact to reach
  // someone during care; the Owner needs the Carer's own contact (from the
  // Carer's profile, not the shared care-details form) to reach them.
  if (input.viewerRole === "carer") {
    field("Owner contact", ownerContact);
    field("Emergency contact", careDetails.emergencyContact || snapshot.emergencyContact);
  } else {
    field("Carer contact", input.carerContactNumber || "Not provided");
  }
  fieldIfPresent("Hand-off location", handoffLocation);
  fieldIfPresent("Care instructions", careDetails.careInstructions || snapshot.careInstructions);
  fieldIfPresent("Medication / allergies", careDetails.medicationAllergyNotes || snapshot.medicationAllergyNotes);
  fieldIfPresent("Behaviour / escape risk", careDetails.behaviorEscapeRisk || snapshot.behaviorEscapeRisk);
  field(
    "Emergency vet",
    vet.authorized === true
      ? `Authorized up to ${money(vet.currency, vet.capMinor)} - the Owner authorizes the Care Provider to seek emergency veterinary treatment up to this limit if the Owner is unreachable.`
      : "Not authorized - the Owner will stay reachable for emergency veterinary decisions.",
  );
  fieldIfPresent("Emergency vet contact", careDetails.emergencyVetContact || snapshot.emergencyVetContact);

  section("Payment", 58);
  moneyField("Agreed rate", payment.finalRate);
  if (input.viewerRole === "carer") {
    moneyField("You receive", payment.carerReceives);
  } else {
    moneyField("You pay", payment.ownerPays);
  }

  section("Agreement confirmation", 78);
  field(
    "Booking terms",
    `Both parties accepted the Huddle Booking Terms at ${fmtDate(termsAcceptedAt, input.timeZone)}.`,
  );

  // Signatures — keep the label + both images + dates together on one page.
  section("Signatures", 190);
  const ownerPng = await doc.embedPng(input.ownerSignaturePng);
  const providerPng = await doc.embedPng(input.providerSignaturePng);
  page.drawText(sanitizeBold("Owner"), { x: MARGIN, y, size: 10, font: boldFont, color: MUTED });
  page.drawText(sanitizeBold("Care provider"), { x: 320, y, size: 10, font: boldFont, color: MUTED });
  y -= 34;
  const boxW = 220;
  const boxH = 82;
  const placeSignature = (png: { width: number; height: number }, boxX: number) => {
    const scale = Math.min(boxW / png.width, boxH / png.height, 1);
    const w = png.width * scale;
    const h = png.height * scale;
    page.drawImage(png as Parameters<typeof page.drawImage>[0], {
      x: boxX + (boxW - w) / 2,
      y: y - h,
      width: w,
      height: h,
    });
  };
  placeSignature(ownerPng, MARGIN);
  placeSignature(providerPng, 320);
  y -= boxH + 20;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + boxW, y }, thickness: 0.7, color: SIG_RULE });
  page.drawLine({ start: { x: 320, y }, end: { x: 320 + boxW, y }, thickness: 0.7, color: SIG_RULE });
  y -= 18;
  page.drawText(sanitize(input.ownerName || "Owner"), { x: MARGIN, y, size: 9.5, font, color: TEXT });
  page.drawText(sanitize(input.providerName || "Care provider"), { x: 320, y, size: 9.5, font, color: TEXT });
  y -= 18;
  page.drawText(`Signed ${fmtDate(input.ownerSignedAt, input.timeZone)}`, { x: MARGIN, y, size: 8.5, font, color: MUTED });
  page.drawText(`Signed ${fmtDate(input.providerSignedAt, input.timeZone)}`, { x: 320, y, size: 8.5, font, color: MUTED });
  y -= 34;

  finalPolicyBox();

  // Footer disclaimer on every page.
  const footer =
    "Electronic signatures and confirmation records are retained as evidence of intent and to support dispute resolution " +
    "alongside the booking-terms consent record, to the fullest extent permitted by law.";
  const pages = doc.getPages();
  pages.forEach((p, pageIndex) => {
    if (pageIndex !== pages.length - 1) return;
    const rows = wrapByWidth(font, sanitize, footer, 7.5, CANVAS_W - MARGIN * 2);
    rows.forEach((row, index) => {
      p.drawText(row, { x: MARGIN, y: 40 - index * 10, size: 7.5, font, color: MUTED });
    });
  });

  return await doc.save();
}
