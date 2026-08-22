type MaybeString = string | string[] | undefined;
type RequestShape = { headers?: Record<string, MaybeString> };
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};

export default function handler(req: RequestShape, res: ResponseShape) {
  const userAgent = String(req.headers?.["user-agent"] || "").toLowerCase();
  const fallback = "https://huddle.pet/waitlist";
  const iosStoreUrl = String(process.env.HUDDLE_IOS_DOWNLOAD_URL || "").trim() || fallback;
  const androidStoreUrl = String(process.env.HUDDLE_ANDROID_DOWNLOAD_URL || "").trim() || fallback;
  const destination = /android/.test(userAgent) ? androidStoreUrl : iosStoreUrl;
  res.setHeader("Location", destination);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(307).send("");
}
