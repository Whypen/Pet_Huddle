#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "legal", "legal-documents.json");
const checkOnly = process.argv.includes("--check");

const { documents } = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const routeToFile = {
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/community-guidelines": "community-guidelines.html",
  "/cookies": "cookies.html",
  "/privacy-choices": "privacy-choices.html",
  "/collection-notice": "collection-notice.html",
  "/service-provider-agreement": "service-provider-agreement.html",
  "/booking-terms": "service-requester-agreement.html",
};

const routeToBrandFile = {
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/community-guidelines": "community-guidelines.html",
  "/cookies": "cookies.html",
  "/privacy-choices": "privacy-choices.html",
  "/collection-notice": "collection-notice.html",
  "/service-provider-agreement": "service-provider-agreement.html",
  "/booking-terms": "booking-terms.html",
};

const requiredPaths = Object.keys(routeToFile);
const seenPaths = new Set(documents.map((document) => document.path));
const missing = requiredPaths.filter((item) => !seenPaths.has(item));
const unexpected = documents.map((document) => document.path).filter((item) => !requiredPaths.includes(item));
if (missing.length || unexpected.length) {
  throw new Error(`Legal document paths are invalid. Missing: ${missing.join(", ") || "none"}. Unexpected: ${unexpected.join(", ") || "none"}.`);
}

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const routeLinks = [
  ["Privacy Policy", "/privacy"],
  ["Privacy Choices", "/privacy-choices"],
  ["Terms of Service", "/terms"],
  ["Community Guidelines", "/community-guidelines"],
  ["Cookies and Similar Technologies Notice", "/cookies"],
  ["Care Service Carer Agreement", "/service-provider-agreement"],
  ["Care Service Booking Terms", "/booking-terms"],
];

function linkify(text, hrefPrefix = "") {
  let value = escapeHtml(text);
  value = value.replaceAll("support@huddle.pet", '<a href="mailto:support@huddle.pet">support@huddle.pet</a>');
  for (const [label, route] of routeLinks) {
    const escapedLabel = escapeHtml(label);
    value = value.replaceAll(escapedLabel, `<a href="${hrefPrefix}${route}">${escapedLabel}</a>`);
  }
  value = value.replace(/\bHUDDLE\b/g, '<strong class="brand-name">HUDDLE</strong>');
  return value;
}

const commonStyle = `
:root{--ink:#424965;--heading:#1a1f36;--muted:#8d93a6;--line:rgba(66,73,101,.12);--accent:#2145cf;--canvas:#fff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--canvas);color:var(--ink);font-family:'Urbanist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.7}
.wrap{max-width:760px;margin:0 auto;padding:32px 24px 72px}
h1{margin:0 0 10px;color:var(--heading);font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-.02em}
h2{margin:28px 0 8px;color:var(--heading);font-size:17px;line-height:1.4;font-weight:700}
p,li{margin:0 0 12px;color:var(--ink);font-size:15px;line-height:1.7}
strong.brand-name{font-weight:800}
ul{margin:10px 0 12px;padding-left:22px}
.meta{margin:36px 0 0;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.5}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
@media(max-width:640px){.wrap{padding:24px 18px 56px}h1{font-size:24px}h2{font-size:16px}p,li{font-size:14px}}
`;

function renderHtml(document, hrefPrefix = "") {
  const sections = document.sections.map((section) => {
    const body = section.body.map((paragraph) => `<p>${linkify(paragraph, hrefPrefix)}</p>`).join("\n");
    const bullets = section.bullets?.length
      ? `<ul>${section.bullets.map((bullet) => `<li>${linkify(bullet, hrefPrefix)}</li>`).join("\n")}</ul>`
      : "";
    return `<section>\n<h2>${escapeHtml(section.title)}</h2>\n${body}\n${bullets}\n</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.title)} | HUDDLE</title>
  <meta name="description" content="${escapeHtml(document.title)}">
  <style>${commonStyle}</style>
</head>
<body>
  <main class="wrap">
    <h1>${escapeHtml(document.title)}</h1>
    ${document.intro.map((paragraph) => `<p>${linkify(paragraph, hrefPrefix)}</p>`).join("\n    ")}
    ${sections}
    <p class="meta">Updated: ${escapeHtml(document.effectiveDate)}</p>
  </main>
</body>
</html>
`;
}

function renderBrandHtml(document) {
  const sections = document.sections.map((section) => {
    const body = section.body.map((paragraph) => `<p>${linkify(paragraph, "/legal")}</p>`).join("\n");
    const bullets = section.bullets?.length
      ? `<ul>${section.bullets.map((bullet) => `<li>${linkify(bullet, "/legal")}</li>`).join("\n")}</ul>`
      : "";
    return `<h2>${escapeHtml(section.title)}</h2>\n${body}\n${bullets}`;
  }).join("\n\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(document.title)} · HUDDLE</title>
<meta name="description" content="${escapeHtml(document.title)}">
<meta name="theme-color" content="#2145CF">
<link rel="canonical" href="https://huddle.pet/legal${escapeHtml(document.path)}">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/favicon.png">
<link rel="stylesheet" href="/brandweb/huddle.css">
</head>
<body data-page="legal" data-nav="solid">
<div class="page-hero"><div class="container"><div class="eyebrow">Legal</div><h1>${escapeHtml(document.title)}</h1></div></div>
<section class="s cream"><div class="container"><div class="prose">
${document.intro.map((paragraph) => `<p>${linkify(paragraph, "/legal")}</p>`).join("\n")}
${sections}
<p class="meta">Updated: ${escapeHtml(document.effectiveDate)}</p>
</div></div></section>
<script src="/brandweb/huddle-shell.js"></script>
</body>
</html>
`;
}

function renderNative() {
  const json = JSON.stringify(documents, null, 2);
  return `// GENERATED FROM legal/legal-documents.json. DO NOT EDIT THIS FILE.\n\nexport type NativeLegalSection = {\n  title: string;\n  body: string[];\n  bullets?: string[];\n};\n\nexport type NativeLegalPageContent = {\n  path: string;\n  title: string;\n  effectiveDate: string;\n  intro: string[];\n  sections: NativeLegalSection[];\n};\n\nconst DOCUMENTS: NativeLegalPageContent[] = ${json};\n\nexport const NATIVE_LEGAL_PAGES: Record<string, NativeLegalPageContent> = Object.fromEntries(\n  DOCUMENTS.map((document) => [document.path, document]),\n);\n\nexport const getNativeLegalPage = (path: string) => NATIVE_LEGAL_PAGES[path] || null;\n`;
}

function renderIndex() {
  const links = documents.map((document) => `      <li><a href="${routeToFile[document.path]}">${escapeHtml(document.title)}</a></li>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Legal | HUDDLE</title>
  <meta name="description" content="HUDDLE legal information">
  <style>${commonStyle}</style>
</head>
<body>
  <main class="wrap">
    <h1>Legal</h1>
    <p>Read the terms and policies that apply to HUDDLE.</p>
    <ul>
${links}
    </ul>
    <p class="meta">Updated: ${escapeHtml(documents.map((document) => document.effectiveDate).sort().at(-1) || "")}</p>
  </main>
</body>
</html>
`;
}

const outputs = new Map([
  ...documents.map((document) => [path.join(root, "src", "legal", routeToFile[document.path]), renderHtml(document)]),
  ...documents.map((document) => [path.join(root, "public", "legal", routeToFile[document.path]), renderHtml(document, "/legal")]),
  ...documents.map((document) => [path.join(root, "public", "brandweb", routeToBrandFile[document.path]), renderBrandHtml(document)]),
  [path.join(root, "src", "legal", "index.html"), renderIndex()],
  [path.join(root, "public", "legal", "index.html"), renderIndex()],
  [path.join(root, "app", "src", "content", "nativeLegalPages.ts"), renderNative()],
]);

const stale = [];
for (const [outputPath, output] of outputs) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
  if (current === output) continue;
  stale.push(path.relative(root, outputPath));
  if (!checkOnly) fs.writeFileSync(outputPath, output);
}

if (checkOnly && stale.length) {
  console.error(`Legal generated files are stale:\n${stale.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else if (!checkOnly) {
  console.log(stale.length ? `Generated ${stale.length} legal artifact(s).` : "Legal artifacts are current.");
}
