const normalizeMatchText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeRegistryIdentifier = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();

const stripHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"');

const normalizePersonName = (value) =>
  normalizeMatchText(value)
    .replace(/^(DR|MR|MRS|MISS|MS|PROF|PROFESSOR|SIR|DAME)\s+/i, "")
    .replace(/\s+(MRCVS|FRCVS|HONFRCVS|RVN|REVN)$/i, "")
    .trim();

const sourceNameCandidates = (value) => {
  const raw = String(value || "").trim();
  const candidates = new Set([normalizePersonName(raw)]);
  const commaParts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) candidates.add(normalizePersonName(`${commaParts.slice(1).join(" ")} ${commaParts[0]}`));
  return [...candidates].filter(Boolean);
};

const matchVsbhkFixture = ({ legalName, registrationNumber }, records) => {
  const expectedName = normalizePersonName(legalName);
  const expectedNumber = normalizeRegistryIdentifier(registrationNumber);
  if (!expectedName || expectedNumber.length < 4) return "unable_to_verify";
  if (!Array.isArray(records)) return "unable_to_verify";

  const candidates = records.filter((record) => normalizeRegistryIdentifier(record.REGID) === expectedNumber);
  if (candidates.length !== 1) return "unable_to_verify";
  return sourceNameCandidates(candidates[0].name_eng).includes(expectedName)
    ? "registry_matched"
    : "unable_to_verify";
};

const parseRcvsCandidates = (html, expectedKind) => {
  if (!String(html || "").includes('id="results"') && !/Veterinary (Surgeons|Nurses) found/i.test(String(html || ""))) {
    return null;
  }
  const itemClass = expectedKind === "surgeon" ? "item--surgeon" : "item--nurse";
  const itemRegex = new RegExp(`<div class="item item--fav ${itemClass}"[\\s\\S]*?(?=<div class="item item--fav|<nav class="pagination|<div class="pagination|</main>|$)`, "gi");
  const items = String(html || "").match(itemRegex) || [];

  return items.map((item) => {
    const titleMatch = item.match(/<h2 class="item-title">([\s\S]*?)<\/h2>/i);
    const refMatch = item.match(/Reference number:<\/span>\s*(?:<span>)?\s*([A-Za-z0-9-]+)/i);
    const statusMatch = item.match(/Registration category:<\/span>\s*(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>|<\/li>)/i);
    const qualificationsMatch = item.match(/<span class="item-qualifications">([\s\S]*?)<\/span>/i);
    return {
      name: normalizePersonName(decodeHtmlEntities(stripHtml(titleMatch?.[1] || ""))),
      identifier: normalizeRegistryIdentifier(refMatch?.[1] || ""),
      statusText: normalizeMatchText(decodeHtmlEntities(stripHtml(statusMatch?.[1] || ""))),
      sourceRecordType: normalizeMatchText(decodeHtmlEntities(stripHtml(qualificationsMatch?.[1] || ""))),
    };
  }).filter((candidate) => candidate.name || candidate.identifier || candidate.statusText || candidate.sourceRecordType);
};

const rcvsStatusIsEligible = (statusText) =>
  statusText.includes("UK PRACTISING") ||
  statusText.includes("PRACTISING OUTSIDE THE UK") ||
  statusText.includes("TEMPORARY REGISTRATION");

const rcvsRecordTypeMatches = (candidate, expectedKind) => {
  if (expectedKind === "surgeon") return candidate.sourceRecordType.includes("MRCVS") || candidate.sourceRecordType.includes("FRCVS");
  return candidate.sourceRecordType.includes("RVN") || candidate.sourceRecordType.includes("REVN");
};

const matchRcvsFixture = ({ legalName, referenceNumber }, html, expectedKind) => {
  const expectedName = normalizePersonName(legalName);
  const expectedNumber = normalizeRegistryIdentifier(referenceNumber);
  if (!expectedName || expectedNumber.length < 4) return "unable_to_verify";

  const candidates = parseRcvsCandidates(html, expectedKind);
  if (!candidates) return "unable_to_verify";
  const matches = candidates.filter((candidate) => candidate.identifier === expectedNumber);
  if (matches.length !== 1) return "unable_to_verify";
  const candidate = matches[0];
  if (candidate.name !== expectedName) return "unable_to_verify";
  if (!rcvsRecordTypeMatches(candidate, expectedKind)) return "unable_to_verify";
  if (expectedKind === "surgeon" && !rcvsStatusIsEligible(candidate.statusText)) return "unable_to_verify";
  return "registry_matched";
};

const rcvsSurgeonHtml = `
<h1 class="page-title">1 Veterinary Surgeon found matching "7123451"</h1>
<div class="items items--fav" id="results">
  <div class="item item--fav item--surgeon" id="item7123451">
    <h2 class="item-title"><a>Miss Irina <strong>Andrei</strong></a></h2>
    <span class="item-qualifications">MRCVS</span>
    <ul>
      <li><span class="bold">Registration category:</span> <a>UK Practising</a></li>
      <li><span class="right"><span class="bold">Reference number:</span><span>7123451</span></span></li>
    </ul>
  </div>
</div>`;

const rcvsNurseHtml = `
<h1 class="page-title">1 Veterinary Nurse found matching "6123457"</h1>
<div class="items items--fav" id="results">
  <div class="item item--fav item--nurse" id="item6123457">
    <h2 class="item-title"><a>Mrs Marie Claire <strong>Hatch</strong></a></h2>
    <span class="item-qualifications">RVN</span>
    <ul>
      <li><span class="bold">Reference number:</span> 6123457</li>
      <li><span class="bold">Registration date:</span> 04/02/2000</li>
    </ul>
  </div>
</div>`;

const ambiguousRcvsHtml = `
<h1 class="page-title">2 Veterinary Surgeons found matching "7123451"</h1>
<div class="items items--fav" id="results">
  <div class="item item--fav item--surgeon"><h2 class="item-title"><a>Miss Irina <strong>Andrei</strong></a></h2><span class="item-qualifications">MRCVS</span><ul><li><span class="bold">Registration category:</span> <a>UK Practising</a></li><li><span class="bold">Reference number:</span><span>7123451</span></li></ul></div>
  <div class="item item--fav item--surgeon"><h2 class="item-title"><a>Dr Irina <strong>Andrei</strong></a></h2><span class="item-qualifications">MRCVS</span><ul><li><span class="bold">Registration category:</span> <a>UK Practising</a></li><li><span class="bold">Reference number:</span><span>7123451</span></li></ul></div>
</div>`;

const forbiddenPublicCopyPattern = new RegExp([
  ["Verified", "Professional"].join(" "),
  ["Globally", "verified"].join(" "),
  ["Huddle", "guarantees"].join(" "),
  ["Licensed", "everywhere"].join(" "),
  ["Background", "checked"].join(" "),
].join("|"), "i");

const cases = [
  {
    name: "VSBHK exact legal name and registration number matches",
    expected: "registry_matched",
    actual: matchVsbhkFixture(
      { legalName: "Matthew John Adams", registrationNumber: "R001652" },
      [{ REGID: "R001652", name_eng: "ADAMS, Matthew John", LAST_MODIFYDATE: "2026-05-15 09:40:12" }],
    ),
  },
  {
    name: "VSBHK name mismatch does not match",
    expected: "unable_to_verify",
    actual: matchVsbhkFixture(
      { legalName: "Other Person", registrationNumber: "R001652" },
      [{ REGID: "R001652", name_eng: "ADAMS, Matthew John" }],
    ),
  },
  {
    name: "VSBHK number mismatch does not match",
    expected: "unable_to_verify",
    actual: matchVsbhkFixture(
      { legalName: "Matthew John Adams", registrationNumber: "R999999" },
      [{ REGID: "R001652", name_eng: "ADAMS, Matthew John" }],
    ),
  },
  {
    name: "VSBHK ambiguous duplicated registration does not match",
    expected: "unable_to_verify",
    actual: matchVsbhkFixture(
      { legalName: "Matthew John Adams", registrationNumber: "R001652" },
      [{ REGID: "R001652", name_eng: "ADAMS, Matthew John" }, { REGID: "R001652", name_eng: "ADAMS, Matthew John" }],
    ),
  },
  {
    name: "VSBHK malformed JSON does not match",
    expected: "unable_to_verify",
    actual: matchVsbhkFixture({ legalName: "Matthew John Adams", registrationNumber: "R001652" }, null),
  },
  {
    name: "RCVS vet exact legal name and reference matches eligible result",
    expected: "registry_matched",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "7123451" }, rcvsSurgeonHtml, "surgeon"),
  },
  {
    name: "RCVS vet name mismatch does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Other Person", referenceNumber: "7123451" }, rcvsSurgeonHtml, "surgeon"),
  },
  {
    name: "RCVS vet number mismatch does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "7999999" }, rcvsSurgeonHtml, "surgeon"),
  },
  {
    name: "RCVS vet ambiguous duplicate reference does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "7123451" }, ambiguousRcvsHtml, "surgeon"),
  },
  {
    name: "RCVS vet not found does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "7123451" }, '<h1>0 Veterinary Surgeons found</h1><div id="results"></div>', "surgeon"),
  },
  {
    name: "RCVS vet malformed HTML does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "7123451" }, "<html></html>", "surgeon"),
  },
  {
    name: "RCVS vet weak name-only lookup is blocked",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Irina Andrei", referenceNumber: "" }, rcvsSurgeonHtml, "surgeon"),
  },
  {
    name: "RCVS vet nurse exact legal name and reference matches register result",
    expected: "registry_matched",
    actual: matchRcvsFixture({ legalName: "Marie Claire Hatch", referenceNumber: "6123457" }, rcvsNurseHtml, "nurse"),
  },
  {
    name: "RCVS vet nurse wrong record type does not match",
    expected: "unable_to_verify",
    actual: matchRcvsFixture({ legalName: "Marie Claire Hatch", referenceNumber: "6123457" }, rcvsNurseHtml.replace("RVN", "MRCVS"), "nurse"),
  },
  {
    name: "raw result redaction marker is present in Edge Function",
    expected: true,
    actual: (await import("node:fs")).readFileSync("supabase/functions/credential-registry-check/index.ts", "utf8").includes('stored: "redacted"'),
  },
  {
    name: "public copy stays narrow",
    expected: true,
    actual: !forbiddenPublicCopyPattern.test(
      (await import("node:fs")).readFileSync("supabase/functions/credential-registry-check/index.ts", "utf8"),
    ),
  },
];

const probeSourceShapes = async () => {
  const probes = [
    {
      name: "VSBHK source shape",
      run: async () => {
        const response = await fetch("https://www.vsbhk.org.hk/js/vsro/vsro.json", { headers: { accept: "application/json" } });
        if (!response.ok) return false;
        const payload = await response.json();
        const first = Array.isArray(payload.data) ? payload.data[0] : null;
        return Boolean(first?.REGID && first?.name_eng && Object.prototype.hasOwnProperty.call(first, "LAST_MODIFYDATE"));
      },
    },
    {
      name: "RCVS vet source shape",
      run: async () => {
        const response = await fetch("https://findavet.rcvs.org.uk/find-a-vet-surgeon/");
        if (!response.ok) return false;
        const html = await response.text();
        return html.includes('name="filter-choice"') &&
          html.includes('value="reference"') &&
          html.includes('name="filter-searchtype" value="surgeon"');
      },
    },
    {
      name: "RCVS vet nurse source shape",
      run: async () => {
        const response = await fetch("https://findavet.rcvs.org.uk/find-a-vet-nurse/");
        if (!response.ok) return false;
        const html = await response.text();
        return html.includes('name="filter-choice"') &&
          html.includes('value="reference"') &&
          html.includes('name="filter-searchtype" value="nurse"');
      },
    },
  ];

  const results = [];
  for (const probe of probes) {
    try {
      results.push({ name: probe.name, actual: await probe.run(), expected: true });
    } catch {
      results.push({ name: probe.name, actual: false, expected: true });
    }
  }
  return results;
};

let failed = false;
for (const testCase of [...cases, ...(await probeSourceShapes())]) {
  const passed = testCase.actual === testCase.expected;
  console.log(`${passed ? "PASS" : "FAIL"} ${testCase.name}`);
  if (!passed) failed = true;
}

if (failed) process.exitCode = 1;
