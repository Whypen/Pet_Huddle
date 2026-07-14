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
  throw new Error("Canonical legal documents must use one Date of creation.");
}

const flattened = documents.map((document) => JSON.stringify(document)).join("\n");
for (const forbidden of [/Hong Kong/i, /\bHK\b/i, /Operated by huddle/i, /\/nativeprivacychoices/i]) {
  if (forbidden.test(flattened)) {
    throw new Error(`Forbidden legal copy found: ${forbidden}.`);
  }
}

const requiredCoverage = {
  "/privacy": ["messaging, social feed, map, care marketplace", "Automated systems and safety review"],
  "/terms": ["Social, Discover, Groups, and Map", "individual arbitration"],
  "/community-guidelines": ["Consent and meaningful interactions", "Care marketplace conduct"],
  "/service-provider-agreement": ["Independent carer status", "Stripe Connect", "Start PIN"],
  "/booking-terms": ["confirmed Care Scope and booking record", "Start PIN and handoff", "Trust & Safety review"],
  "/collection-notice": ["Personal Information Collection Notice", "Why huddle collects it"],
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
const publicRuntimePaths = fs.readFileSync(path.join(root, "src", "routes", "publicRuntimePaths.ts"), "utf8");
const publicAuthRoutes = fs.readFileSync(path.join(root, "src", "routes", "PublicAuthRoutes.tsx"), "utf8");
const nativeLegalRoutes = fs.readFileSync(path.join(root, "app", "src", "navigation", "RootNavigator.tsx"), "utf8");
const nativeOutput = fs.readFileSync(path.join(root, "app", "src", "content", "nativeLegalPages.ts"), "utf8");
const htmlToText = (value) => value
  .replace(/<[^>]+>/g, "")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#039;", "'");

for (const document of documents) {
  if (!publicRuntimePaths.includes(`\"${document.path}\"`)) {
    throw new Error(`Public runtime routing is missing ${document.path}.`);
  }
  if (!publicAuthRoutes.includes(`path=\"${document.path}\"`)) {
    throw new Error(`Public legal route is missing ${document.path}.`);
  }
  if (!nativeLegalRoutes.includes(`\"${document.path}\"`)) {
    throw new Error(`Native legal routing is missing ${document.path}.`);
  }
  const webOutput = fs.readFileSync(path.join(root, "src", "legal", outputFileByPath[document.path]), "utf8");
  const webText = htmlToText(webOutput);
  const brandOutput = fs.readFileSync(path.join(root, "public", "brandweb", brandOutputFileByPath[document.path]), "utf8");
  const brandText = htmlToText(brandOutput);
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
    if (!brandText.includes(phrase)) {
      throw new Error(`Public legal output is not synchronized for ${document.path}.`);
    }
  }
}

console.log(`Legal contract verified: ${documents.length} canonical documents, web/native output and route parity, date ${[...dates][0]}.`);
