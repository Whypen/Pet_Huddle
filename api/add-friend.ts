type MaybeString = string | string[] | undefined;
type RequestShape = {
  query?: Record<string, MaybeString>;
};
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};

export const renderAddFriendPage = (rawCode: MaybeString, rawInvite?: MaybeString) => {
  const inputCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const inputInvite = Array.isArray(rawInvite) ? rawInvite[0] : rawInvite;
  const code = String(inputCode || "").replace(/\D/g, "").slice(0, 6);
  // Single-use invite tokens take precedence: they connect on open, while a bare
  // code still has to be accepted by the person who owns it.
  const invite = /^[0-9a-f]{64}$/.test(String(inputInvite || "").trim().toLowerCase())
    ? String(inputInvite).trim().toLowerCase()
    : "";
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : code ? `?code=${encodeURIComponent(code)}` : "";
  const pageUrl = `https://huddle.pet/add-friend${query}`;
  const appUrl = `huddle://add-friend${query}`;
  const title = "Add me on huddle";
  const description = invite
    ? "Open huddle to connect."
    : code ? `Open huddle to connect using code ${code}.` : "Open huddle to connect with your pet people.";
  return { appUrl, code, description, invite, pageUrl, title };
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export default function handler(req: RequestShape, res: ResponseShape) {
  const { appUrl, description, pageUrl, title } = renderAddFriendPage(req.query?.code, req.query?.invite);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="huddle" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="https://huddle.pet/huddle-icon-512-v5.png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="https://huddle.pet/huddle-icon-512-v5.png" />
    <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font-family:system-ui,sans-serif;color:#27304d}.card{text-align:center;padding:32px}.logo{width:96px;height:96px;border-radius:22px}.title{font-size:24px;font-weight:750;margin:18px 0 6px}.copy{color:#727991;margin:0 0 22px}.open{display:inline-block;padding:13px 22px;border-radius:12px;background:#2145cf;color:#fff;text-decoration:none;font-weight:700}</style>
  </head>
  <body>
    <main class="card">
      <img class="logo" src="/huddle-icon-512-v5.png" alt="huddle" />
      <div class="title">${escapeHtml(title)}</div>
      <p class="copy">${escapeHtml(description)}</p>
      <a class="open" href="${escapeHtml(appUrl)}">Open huddle</a>
      <p><a href="/api/open-app">Get huddle</a></p>
    </main>
  </body>
</html>`);
}
