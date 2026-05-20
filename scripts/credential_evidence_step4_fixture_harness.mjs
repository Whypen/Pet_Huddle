const normalizeMatchText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
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

const hasRequiredLookupIdentifier = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .length >= 4;

const cityGuildsResultIsMatched = (html) => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  if (!text) return false;
  if (text.includes("INVALID SECURITY TOKEN")) return false;
  if (text.includes("VALIDATION SUMMARY ERRORS")) return false;
  if (text.includes("UNABLE TO VERIFY")) return false;
  if (text.includes("NOT FOUND")) return false;
  return (
    text.includes("CERTIFICATE HAS BEEN VERIFIED") ||
    text.includes("CERTIFICATE VERIFIED") ||
    text.includes("VERIFIED CERTIFICATE") ||
    text.includes("AUTHENTIC CERTIFICATE")
  );
};

const cityGuildsResultIsNotMatched = (html) => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  return (
    text.includes("INVALID SECURITY TOKEN") ||
    text.includes("VALIDATION SUMMARY ERRORS") ||
    text.includes("UNABLE TO VERIFY") ||
    text.includes("NOT FOUND") ||
    text.includes("NO CERTIFICATE")
  );
};

const matchCityGuildsFixture = ({ learnerName, authenticationCode }, html) => {
  if (!normalizeMatchText(learnerName) || !hasRequiredLookupIdentifier(authenticationCode)) return "unable_to_verify";
  if (cityGuildsResultIsMatched(html)) return "certificate_matched";
  if (cityGuildsResultIsNotMatched(html)) return "unable_to_verify";
  return "unable_to_verify";
};

const redCrossResultIsMatched = (html) => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  if (!text) return false;
  if (text.includes("SORRY WE DID NOT FIND A CERTIFICATE")) return false;
  if (text.includes("NO CERTIFICATE RESULT")) return false;
  return (
    String(html || "").includes("certificate-heading-list") ||
    String(html || "").includes("eachcert") ||
    String(html || "").includes("certpdfurl") ||
    text.includes("CERTIFICATE ID") ||
    text.includes("DATE COMPLETED")
  );
};

const redCrossResultIsNotMatched = (html) => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  return text.includes("SORRY WE DID NOT FIND A CERTIFICATE") || text.includes("NO CERTIFICATE RESULT");
};

const matchRedCrossFixture = ({ certificateId }, html) => {
  if (!hasRequiredLookupIdentifier(certificateId)) return "unable_to_verify";
  if (redCrossResultIsMatched(html)) return "certificate_matched";
  if (redCrossResultIsNotMatched(html)) return "unable_to_verify";
  return "unable_to_verify";
};

const verifiedHtml = `
  <main>
    <h2>Verify a City & Guilds certificate</h2>
    <p>Certificate has been verified</p>
    <dl><dt>Name</dt><dd>Huddle Groomer</dd></dl>
  </main>`;

const invalidHtml = `
  <form action="/verify?alternative=true" method="post">
    <div class="validation-summary-errors"><ul><li>Invalid security token</li></ul></div>
    <input id="Name" name="Name" value="Huddle Groomer" />
    <input class="input-validation-error" id="SecurityToken" name="SecurityToken" value="00000000000000000000" />
  </form>`;

const malformedHtml = "<html><body>Unexpected response</body></html>";
const redCrossVerifiedHtml = `
  <div class="certificate-heading-list">
    <input class="eachcert" type="checkbox" />
    <input class="certpdfurl" value="CERT12345|Jane|Smith|01/01/2026|Pet First Aid" />
    <span>Certificate ID</span>
  </div>`;
const redCrossInvalidHtml = `
  <div class="empty-certificate-result">
    <span class="no-certificate-result"> Sorry, we did not find a certificate for </span>
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
    name: "City & Guilds exact learner name and authentication code matches",
    expected: "certificate_matched",
    actual: matchCityGuildsFixture(
      { learnerName: "Huddle Groomer", authenticationCode: "ABCD1234EFGH5678IJKL" },
      verifiedHtml,
    ),
  },
  {
    name: "City & Guilds invalid authentication code does not match",
    expected: "unable_to_verify",
    actual: matchCityGuildsFixture(
      { learnerName: "Huddle Groomer", authenticationCode: "00000000000000000000" },
      invalidHtml,
    ),
  },
  {
    name: "City & Guilds missing authentication code is weak lookup and blocked",
    expected: "unable_to_verify",
    actual: matchCityGuildsFixture({ learnerName: "Huddle Groomer", authenticationCode: "" }, verifiedHtml),
  },
  {
    name: "City & Guilds malformed response does not match",
    expected: "unable_to_verify",
    actual: matchCityGuildsFixture(
      { learnerName: "Huddle Groomer", authenticationCode: "ABCD1234EFGH5678IJKL" },
      malformedHtml,
    ),
  },
  {
    name: "Red Cross certificate ID matches lookup result",
    expected: "certificate_matched",
    actual: matchRedCrossFixture({ certificateId: "CERT12345" }, redCrossVerifiedHtml),
  },
  {
    name: "Red Cross no-match result does not match",
    expected: "unable_to_verify",
    actual: matchRedCrossFixture({ certificateId: "000000000000" }, redCrossInvalidHtml),
  },
  {
    name: "Red Cross missing certificate ID is weak lookup and blocked",
    expected: "unable_to_verify",
    actual: matchRedCrossFixture({ certificateId: "" }, redCrossVerifiedHtml),
  },
  {
    name: "Red Cross malformed response does not match",
    expected: "unable_to_verify",
    actual: matchRedCrossFixture({ certificateId: "CERT12345" }, malformedHtml),
  },
  {
    name: "Edge supports certificate_matched label",
    expected: true,
    actual: (await import("node:fs"))
      .readFileSync("supabase/functions/credential-registry-check/index.ts", "utf8")
      .includes('"Certificate matched"'),
  },
  {
    name: "raw result redaction marker is present in Edge Function",
    expected: true,
    actual: (await import("node:fs"))
      .readFileSync("supabase/functions/credential-registry-check/index.ts", "utf8")
      .includes('stored: "redacted"'),
  },
  {
    name: "public copy stays narrow",
    expected: true,
    actual: !forbiddenPublicCopyPattern.test(
      (await import("node:fs")).readFileSync("supabase/functions/credential-registry-check/index.ts", "utf8"),
    ),
  },
];

const probeCityGuildsShape = async () => {
  const response = await fetch("https://www.mycertis.com/verify?alternative=true", {
    headers: { accept: "text/html" },
  });
  if (!response.ok) return false;
  const html = await response.text();
  return html.includes('action="/verify?alternative=true"') &&
    html.includes('name="__RequestVerificationToken"') &&
    html.includes('name="Name"') &&
    html.includes('name="SecurityToken"') &&
    html.includes('name="TermsAndConditions"');
};

const probeRedCrossShape = async () => {
  const response = await fetch("https://www.redcross.org/take-a-class/digital-certificate", {
    headers: { accept: "text/html" },
  });
  const html = await response.text().catch(() => "");
  if (!response.ok || /Access Denied/i.test(html)) return false;
  const searchEndpointPresent = html.includes("Certificates-SearchCertificates") &&
    html.includes("dwfrm_certificate_certnumber");
  if (!searchEndpointPresent) return false;

  const search = new URL("https://www.redcross.org/on/demandware.store/Sites-RedCross-Site/default/Certificates-SearchCertificates");
  search.searchParams.set("certnumber", "000000000000");
  search.searchParams.set("format", "ajax");
  const searchResponse = await fetch(search.toString(), {
    headers: {
      accept: "text/html",
      referer: "https://www.redcross.org/take-a-class/digital-certificate",
    },
  });
  const searchHtml = await searchResponse.text().catch(() => "");
  return searchResponse.ok && redCrossResultIsNotMatched(searchHtml);
};

cases.push(
  {
    name: "City & Guilds source shape supports server-side verification form",
    expected: true,
    actual: await probeCityGuildsShape().catch(() => false),
  },
  {
    name: "Red Cross source shape supports certificate ID lookup endpoint",
    expected: true,
    actual: await probeRedCrossShape().catch(() => false),
  },
);

let failed = false;
for (const testCase of cases) {
  const passed = testCase.actual === testCase.expected;
  console.log(`${passed ? "PASS" : "FAIL"} ${testCase.name}`);
  if (!passed) failed = true;
}

if (failed) process.exitCode = 1;
