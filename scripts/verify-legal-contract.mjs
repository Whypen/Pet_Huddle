#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "legal", "legal-documents.json"), "utf8"));
const documents = source.documents;

const expectedPaths = [
  "/privacy",
  "/terms",
  "/privacy-choices",
  "/cookies",
  "/community-guidelines",
  "/collection-notice",
  "/service-provider-agreement",
  "/booking-terms",
];

const paths = documents.map((document) => document.path);
if (paths.length !== expectedPaths.length || expectedPaths.some((expected) => !paths.includes(expected))) {
  throw new Error("Canonical legal documents do not include the full approved legal set.");
}

const dates = new Set(documents.map((document) => document.effectiveDate));
if (dates.size !== 1) {
  throw new Error("Canonical legal documents must use one effective date.");
}

const flattened = documents.map((document) => JSON.stringify(document)).join("\n");
for (const forbidden of [/Hong Kong/i, /\bHK\b/i, /Operated by huddle/i, /\/nativeprivacychoices/i]) {
  if (forbidden.test(flattened)) {
    throw new Error(`Forbidden legal copy found: ${forbidden}.`);
  }
}
if (/\bhuddle\b(?!\.pet)/.test(flattened)) {
  throw new Error("Canonical legal copy must use the registered HUDDLE brand name outside email addresses.");
}

const requiredCoverage = {
  "/privacy": [
    "messaging, social feed, map, care marketplace",
    "3. How HUDDLE uses information",
    "Authenticate accounts and support sign-in methods",
    "4. When HUDDLE shares information",
    "Supabase — database",
    "Stripe — payment processing",
    "Mapbox — map tile rendering",
    "Expo — push notification delivery",
    "Automated systems and safety review",
    "Meta Platform Data",
    "does not permanently store personal data received through Meta APIs",
  ],
  "/terms": ["Social, Discover, Groups, and Map", "individual arbitration"],
  "/community-guidelines": ["Consent and meaningful interactions", "Care marketplace conduct"],
  "/service-provider-agreement": ["Independent carer status", "Stripe Connect", "Start PIN"],
  "/booking-terms": ["confirmed Care Scope and booking record", "Start PIN and handoff", "Trust & Safety review"],
  "/collection-notice": ["Personal Information Collection Notice", "2. Why HUDDLE collects it"],
};

for (const [documentPath, phrases] of Object.entries(requiredCoverage)) {
  const document = documents.find((item) => item.path === documentPath);
  const text = JSON.stringify(document);
  for (const phrase of phrases) {
    if (!text.includes(phrase)) {
      throw new Error(`${documentPath} is missing required coverage: ${phrase}`);
    }
  }
}

const outputFileByPath = {
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/privacy-choices": "privacy-choices.html",
  "/cookies": "cookies.html",
  "/community-guidelines": "community-guidelines.html",
  "/collection-notice": "collection-notice.html",
  "/service-provider-agreement": "service-provider-agreement.html",
  "/booking-terms": "service-requester-agreement.html",
};
const brandOutputFileByPath = {
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/privacy-choices": "privacy-choices.html",
  "/cookies": "cookies.html",
  "/community-guidelines": "community-guidelines.html",
  "/collection-notice": "collection-notice.html",
  "/service-provider-agreement": "service-provider-agreement.html",
  "/booking-terms": "booking-terms.html",
};
const publicOutputFileByPath = outputFileByPath;
const canonicalPublicPathByDocumentPath = Object.fromEntries(
  Object.entries(brandOutputFileByPath).map(([documentPath, fileName]) => [documentPath, `/legal/${fileName.replace(/\.html$/, "")}`]),
);
const publicRuntimePaths = fs.readFileSync(path.join(root, "src", "routes", "publicRuntimePaths.ts"), "utf8");
const publicAuthRoutes = fs.readFileSync(path.join(root, "src", "routes", "PublicAuthRoutes.tsx"), "utf8");
const nativeLegalRoutes = fs.readFileSync(path.join(root, "app", "src", "navigation", "RootNavigator.tsx"), "utf8");
const vercelConfig = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const nativeOutput = fs.readFileSync(path.join(root, "app", "src", "content", "nativeLegalPages.ts"), "utf8");
const nativeAuthRenderer = fs.readFileSync(path.join(root, "app", "src", "screens", "NativeAuthScreen.tsx"), "utf8");
const nativeSignupRenderer = fs.readFileSync(path.join(root, "app", "src", "screens", "NativeSignupScreen.tsx"), "utf8");
const nativeLegalRenderer = fs.readFileSync(path.join(root, "app", "src", "screens", "NativeLegalPage.tsx"), "utf8");
const nativeCarerAgreementRenderer = fs.readFileSync(path.join(root, "app", "src", "screens", "NativeCarerProfileScreen.tsx"), "utf8");
const nativeServiceAgreementRenderer = fs.readFileSync(path.join(root, "app", "src", "screens", "NativeServiceChatScreen.tsx"), "utf8");
const htmlToText = (value) => value
  .replace(/<[^>]+>/g, "")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#039;", "'");

for (const document of documents) {
  const canonicalPublicPath = canonicalPublicPathByDocumentPath[document.path];
  if (!publicRuntimePaths.includes(`\"${document.path}\"`)) {
    throw new Error(`Public runtime routing is missing ${document.path}.`);
  }
  if (!publicAuthRoutes.includes(`path=\"${document.path}\"`)) {
    throw new Error(`Public legal route is missing ${document.path}.`);
  }
  if (!nativeLegalRoutes.includes(`\"${document.path}\"`)) {
    throw new Error(`Native legal routing is missing ${document.path}.`);
  }
  if (!vercelConfig.includes(`\"src\": \"^${canonicalPublicPath}/?$\"`)) {
    throw new Error(`Public canonical route is missing ${canonicalPublicPath}.`);
  }
  const webOutput = fs.readFileSync(path.join(root, "src", "legal", outputFileByPath[document.path]), "utf8");
  const webText = htmlToText(webOutput);
  const publicOutput = fs.readFileSync(path.join(root, "public", "legal", publicOutputFileByPath[document.path]), "utf8");
  const publicText = htmlToText(publicOutput);
  const brandOutput = fs.readFileSync(path.join(root, "public", "brandweb", brandOutputFileByPath[document.path]), "utf8");
  const brandText = htmlToText(brandOutput);
  if (!webOutput.includes("Updated: ") || !publicOutput.includes("Updated: ") || !brandOutput.includes("Updated: ")) {
    throw new Error(`Legal output date label is not synchronized for ${document.path}.`);
  }
  for (const [label, output] of [["Brand", brandOutput], ["Public", publicOutput]]) {
    if (/href="\/(privacy|terms|privacy-choices|cookies|community-guidelines|collection-notice|service-provider-agreement|booking-terms)(?:["#?])/i.test(output)) {
      throw new Error(`${label} legal links must use /legal/ canonical routes for ${document.path}.`);
    }
  }
  const phrases = [
    document.title,
    document.effectiveDate,
    ...document.intro,
    ...document.sections.flatMap((section) => [section.title, ...section.body, ...(section.bullets || [])]),
  ];
  for (const phrase of phrases) {
    const nativeLiteral = JSON.stringify(phrase).slice(1, -1);
    if (!nativeOutput.includes(nativeLiteral)) {
      throw new Error(`Native legal output is not synchronized for ${document.path}.`);
    }
    if (!webText.includes(phrase)) {
      throw new Error(`Web legal output is not synchronized for ${document.path}.`);
    }
    if (!publicText.includes(phrase)) {
      throw new Error(`Public legal output is not synchronized for ${document.path}.`);
    }
    if (!brandText.includes(phrase)) {
      throw new Error(`Public legal output is not synchronized for ${document.path}.`);
    }
  }
}

for (const [documentPath, outputFile] of Object.entries(publicOutputFileByPath)) {
  const legacyPath = `/legal/${outputFile}`;
  const canonicalPublicPath = canonicalPublicPathByDocumentPath[documentPath];
  const legacyRoutePattern = `\"src\": \"^${legacyPath.replaceAll(".", "\\\\.")}$\"`;
  if (!vercelConfig.includes(legacyRoutePattern) || !vercelConfig.includes(`\"Location\": \"${canonicalPublicPath}\"`) || !vercelConfig.includes("\"status\": 308")) {
    throw new Error(`Legacy public legal URL ${legacyPath} must permanently redirect to ${canonicalPublicPath}.`);
  }
}

for (const [label, renderer] of Object.entries({
  NativeAuthScreen: nativeAuthRenderer,
  NativeSignupScreen: nativeSignupRenderer,
  NativeLegalPage: nativeLegalRenderer,
})) {
  if (!renderer.includes("bullets?.map")) {
    throw new Error(`${label} does not render canonical legal bullet lists.`);
  }
}

for (const [label, renderer] of Object.entries({
  NativeCarerProfileScreen: nativeCarerAgreementRenderer,
  NativeServiceChatScreen: nativeServiceAgreementRenderer,
})) {
  if (!renderer.includes("bullets?.map")) {
    throw new Error(`${label} does not render canonical legal bullet lists in care agreement sheets.`);
  }
}

console.log(`Legal contract verified: ${documents.length} canonical documents, web/native output and route parity, date ${[...dates][0]}.`);
