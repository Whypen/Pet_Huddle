/**
 * `/get` — the one download URL for the whole of huddle.
 *
 * Every "Get the app" control on brandweb, every QR code, and the legacy
 * `/threads`, `/profile`, `/carerprofile` and bare `/share` routes point here.
 * Store URLs live in env and are resolved server-side, so there is exactly one
 * place they can be wrong and no client JS is required for the button to work.
 *
 * PHONES REDIRECT, DESKTOPS GET A PAGE.
 * A phone is one tap from installing, so it goes straight to the store. A
 * desktop cannot install anything, and bouncing it to an App Store web page is
 * a dead end — it renders a real page instead: a QR to carry the install to a
 * phone, and the web door for someone who wants huddle right now, on the
 * machine they are already sitting at.
 */

import { renderQrSvg } from "./_alertPage.js";
import { escapeHtml } from "./_shareHtml.js";

type MaybeString = string | string[] | undefined;
type RequestShape = { headers?: Record<string, MaybeString> };
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};

/** Phones and tablets install apps. Everything else gets the desktop page. */
const isMobileUserAgent = (userAgent: string): boolean =>
  /android|iphone|ipad|ipod|windows phone|mobile/i.test(userAgent);

const renderGetPage = (input: {
  iosStoreUrl: string;
  androidStoreUrl: string;
  qrSvg: string | null;
}): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Get huddle</title>
    <meta name="description" content="Install huddle on iPhone or Android, or open huddle in your browser. The web shows you what is happening near you. The app tells you the moment it does." />
    <link rel="canonical" href="https://huddle.pet/get" />
    <meta property="og:title" content="Get huddle" />
    <meta property="og:description" content="Install huddle on iPhone or Android, or open huddle in your browser." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://huddle.pet/get" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/favicon.png" />
    <link rel="stylesheet" href="/brandweb/huddle.css" />
    <style>
      body { background: var(--cream); }
      .get-wrap { min-height: 100vh; display: grid; place-items: center; padding: 40px 20px; }
      .get-card {
        width: min(560px, 100%); background: var(--white); border-radius: 26px;
        padding: 44px 40px; box-shadow: 0 30px 70px -30px rgba(20,46,153,.28);
        border: 1px solid rgba(33,69,207,.08); text-align: center;
      }
      .get-logo { height: 30px; width: auto; margin: 0 auto 26px; display: block; }
      .get-title {
        margin: 0 0 10px; font-size: clamp(28px, 5vw, 38px); font-weight: 800;
        letter-spacing: -.035em; line-height: 1.04; color: var(--ink);
      }
      .get-title .accent { color: var(--coral); }
      .get-sub {
        margin: 0 auto 30px; max-width: 38ch; font-size: 16px; line-height: 1.5;
        font-weight: 500; color: var(--fg1);
      }
      .get-qr { display: flex; justify-content: center; margin-bottom: 14px; }
      .get-qr svg { width: 168px; height: 168px; border-radius: 14px; }
      .get-qr-label {
        margin: 0 0 26px; font-size: 13.5px; font-weight: 600; color: rgba(66,73,101,.68);
      }
      .get-badges { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      .get-badges img { height: 46px; width: auto; }
      .get-rule {
        display: flex; align-items: center; gap: 14px; margin: 30px 0 22px;
        font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
        color: rgba(66,73,101,.45);
      }
      .get-rule::before, .get-rule::after {
        content: ""; flex: 1; height: 1px; background: rgba(33,69,207,.12);
      }
      .get-web {
        display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
        border: 1.5px solid var(--blue); color: var(--blue); background: transparent;
        padding: 13px 24px; font-size: 15px; font-weight: 700; letter-spacing: -.01em;
        transition: background .2s var(--ease), color .2s var(--ease);
      }
      .get-web:hover { background: var(--blue); color: var(--white); }
      .get-foot { margin: 24px 0 0; font-size: 13px; font-weight: 500; color: rgba(66,73,101,.6); }
      .get-foot a { color: var(--blue); font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="get-wrap">
      <div class="get-card">
        <img class="get-logo" src="/brandweb/wm-blue.png" alt="huddle" />
        <h1 class="get-title">Every pet deserves <span class="accent">better.</span></h1>
        <p class="get-sub">The app tells you the moment a pet goes missing near you — not the next time you happen to check.</p>

        ${input.qrSvg ? `<div class="get-qr">${input.qrSvg}</div>` : ""}
        <p class="get-qr-label">Scan to install huddle on your phone</p>

        <div class="get-badges">
          <a href="${escapeHtml(input.iosStoreUrl)}" aria-label="Download on the App Store">
            <img src="/brandweb/badge-appstore.svg" alt="Download on the App Store" />
          </a>
          <a href="${escapeHtml(input.androidStoreUrl)}" aria-label="Get it on Google Play">
            <img src="/brandweb/badge-googleplay.png" alt="Get it on Google Play" />
          </a>
        </div>

        <p class="get-rule">or</p>
        <a class="get-web" href="/social">Open huddle on the web →</a>
        <p class="get-foot">See what is happening near you right now — nothing to install. <a href="/">What is huddle?</a></p>
      </div>
    </main>
  </body>
</html>`;

export default async function handler(req: RequestShape, res: ResponseShape) {
  const userAgent = String(req.headers?.["user-agent"] || "");
  const fallback = "https://huddle.pet/waitlist";
  const iosStoreUrl = String(process.env.HUDDLE_IOS_DOWNLOAD_URL || "").trim() || fallback;
  const androidStoreUrl = String(process.env.HUDDLE_ANDROID_DOWNLOAD_URL || "").trim() || fallback;

  if (isMobileUserAgent(userAgent)) {
    const destination = /android/i.test(userAgent) ? androidStoreUrl : iosStoreUrl;
    res.setHeader("Location", destination);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(307).send("");
    return;
  }

  const qrSvg = await renderQrSvg("https://huddle.pet/get");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
  res.status(200).send(renderGetPage({ iosStoreUrl, androidStoreUrl, qrSvg }));
}
