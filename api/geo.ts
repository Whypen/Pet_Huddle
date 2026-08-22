/**
 * /api/geo — coarse location for pre-filling the District field at signup.
 *
 * Vercel already terminates every request and attaches these headers, so this
 * reads what the edge has and hands back the city/region/country. Nothing new
 * sees the visitor's IP, and the IP itself is never returned, logged or stored —
 * which is the whole reason for doing it this way rather than calling out to a
 * geolocation vendor.
 *
 * Absent headers (local dev, or an edge that didn't resolve it) are not an
 * error: the response is simply empty and the field stays blank for the person
 * to type. Signup must never block on this.
 *
 * Header values are percent-encoded by Vercel so non-ASCII city names survive
 * the transport — "Z%C3%BCrich" has to be decoded back to "Zürich".
 */

type MaybeString = string | string[] | undefined;
type RequestShape = { headers?: Record<string, MaybeString> };
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

const readHeader = (req: RequestShape, name: string): string => {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return decodeURIComponent(text);
  } catch {
    // A malformed escape sequence is not worth failing the request over.
    return text;
  }
};

export default function handler(req: RequestShape, res: ResponseShape) {
  const city = readHeader(req, "x-vercel-ip-city");
  const region = readHeader(req, "x-vercel-ip-country-region");
  const country = readHeader(req, "x-vercel-ip-country");

  // Per-visitor and short-lived. `private` keeps it out of any shared cache —
  // one visitor's city must never be served to another.
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(200).json({ city, region, country });
}
