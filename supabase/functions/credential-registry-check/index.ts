import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, x-supabase-client-platform, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RateBucket = {
  count: number;
  windowStart: number;
};

type CheckStart = {
  credential_id?: string;
  check_id?: string;
  source_id?: string;
  source_key?: string;
  status?: string;
};

type CredentialRecord = {
  id: string;
  user_id: string;
  credential_type: string;
  country_region: string;
  legal_name: string;
  license_number_hmac: string | null;
  license_number_masked: string | null;
};

type SourceRecord = {
  id: string;
  source_key: string;
  source_name: string;
  source_type: string;
  source_url: string | null;
  usage_caveat: string | null;
};

type AdapterResult = {
  status: "certificate_matched" | "organization_matched" | "registry_matched" | "unable_to_verify";
  matchResult: Record<string, unknown>;
  matchedFields: string[];
  confidence: "none" | "low" | "medium" | "high";
  rawResultRedacted: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
};

type VetRegistryCandidate = {
  name: string;
  identifier: string;
  statusText: string;
  sourceRecordType: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const IP_RATE_LIMIT_MAX = 40;
const USER_RATE_LIMIT_MAX = 10;
const CREDENTIAL_RATE_LIMIT_MAX = 1;
const MAX_BODY_BYTES = 8_000;
const ACNC_RESOURCE_ID = "8fb32972-24e9-4c95-885e-7140be51be8a";
const VSBHK_REGISTER_URL = "https://www.vsbhk.org.hk/js/vsro/vsro.json";
const RCVS_VET_URL = "https://findavet.rcvs.org.uk/find-a-vet-surgeon/";
const RCVS_NURSE_URL = "https://findavet.rcvs.org.uk/find-a-vet-nurse/";
const MYCERTIS_VERIFY_URL = "https://www.mycertis.com/verify?alternative=true";
const RED_CROSS_CERTIFICATE_PAGE_URL = "https://www.redcross.org/take-a-class/digital-certificate";
const RED_CROSS_CERTIFICATE_SEARCH_URL =
  "https://www.redcross.org/on/demandware.store/Sites-RedCross-Site/default/Certificates-SearchCertificates";
const rateBuckets = new Map<string, RateBucket>();

const cleanEnv = (value: string | undefined | null): string => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1).trim();
  }
  return cleaned;
};

const getClientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const isWithinRateLimit = (key: string, max: number): { ok: boolean; resetAt?: number } => {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count <= max) return { ok: true };
  return { ok: false, resetAt: bucket.windowStart + RATE_LIMIT_WINDOW_MS };
};

const enforceBodySize = (req: Request): boolean => {
  const rawLength = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(rawLength) || rawLength <= 0) return true;
  return rawLength <= MAX_BODY_BYTES;
};

const isJwt = (value: string): boolean => value.split(".").length === 3;

const decodePayload = (value: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(atob(value.split(".")[1]));
  } catch {
    return null;
  }
};

const isUserToken = (value: string): boolean => {
  if (!isJwt(value)) return false;
  const payload = decodePayload(value);
  const role = String(payload?.role || "").trim().toLowerCase();
  return Boolean(payload?.sub) && role !== "anon" && role !== "service_role";
};

const resolveSupabaseServiceKey = (): string =>
  cleanEnv(Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY")) ||
  cleanEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const extractToken = (req: Request, body: Record<string, unknown>): string => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
  const bodyToken = String(body.access_token || "").trim();
  const candidates = [
    bodyToken,
    huddleToken.replace(/^Bearer\s+/i, "").trim(),
    authHeader.replace(/^Bearer\s+/i, "").trim(),
  ];

  return candidates.find(isUserToken) || "";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const safeErrorCode = (message: string): string => {
  const normalized = message.toLowerCase();
  if (normalized.includes("unsupported_credential_source")) return "unsupported_credential_source";
  if (normalized.includes("credential_check_rate_limited")) return "credential_check_rate_limited";
  if (normalized.includes("credential_not_found")) return "credential_not_found";
  if (normalized.includes("not_authenticated")) return "not_authenticated";
  return "credential_check_failed";
};

const normalizeMatchText = (value: unknown): string =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeIdentifier = (value: unknown): string => String(value || "").replace(/\D/g, "");

const normalizeRegistryIdentifier = (value: unknown): string =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"');

const normalizePersonName = (value: unknown): string =>
  normalizeMatchText(value)
    .replace(/^(DR|MR|MRS|MISS|MS|PROF|PROFESSOR|SIR|DAME)\s+/i, "")
    .replace(/\s+(MRCVS|FRCVS|HONFRCVS|RVN|REVN)$/i, "")
    .trim();

const sourceNameCandidates = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  const candidates = new Set<string>([normalizePersonName(raw)]);
  const commaParts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    candidates.add(normalizePersonName(`${commaParts.slice(1).join(" ")} ${commaParts[0]}`));
  }
  return [...candidates].filter(Boolean);
};

const hasRequiredLookupIdentifier = (lookupIdentifier: string): boolean =>
  normalizeRegistryIdentifier(lookupIdentifier).length >= 4;

const cookieHeaderFromResponse = (response: Response): string => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return cookies
    .flatMap((cookie) => cookie.split(/,(?=[^;,]+=)/g))
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
};

const buildUnableToVerify = (
  outcome: string,
  errorCode: string,
  errorMessage: string,
  extra: Record<string, unknown> = {},
): AdapterResult => ({
  status: "unable_to_verify",
  matchResult: { outcome, ...extra },
  matchedFields: [],
  confidence: "none",
  rawResultRedacted: { stored: "redacted", outcome },
  errorCode,
  errorMessage,
});

const acncCharityStatusIsRegistered = (value: unknown): boolean => {
  const normalized = normalizeMatchText(value);
  return normalized === "REGISTERED" || normalized === "REGISTERED CHARITY";
};

const identifierMatchesHmac = async (
  supabase: ReturnType<typeof createClient>,
  expectedHmac: string | null,
  candidateIdentifier: string,
): Promise<boolean | null> => {
  if (!expectedHmac || !candidateIdentifier) return false;

  const { data, error } = await supabase.rpc(
    "credential_identifier_matches_hmac",
    {
      p_expected_hmac: expectedHmac,
      p_candidate_identifier: candidateIdentifier,
    },
  );

  if (error) return null;
  return data === true;
};

const runAcncAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
): Promise<AdapterResult> => {
  const expectedName = normalizeMatchText(credential.legal_name);
  if (!expectedName || !credential.license_number_hmac) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "ACNC matching requires legal name and ABN.",
    );
  }

  const baseUrl = cleanEnv(Deno.env.get("ACNC_DATASTORE_SEARCH_URL")) ||
    "https://data.gov.au/data/api/3/action/datastore_search";
  const url = new URL(baseUrl);
  url.searchParams.set("resource_id", ACNC_RESOURCE_ID);
  url.searchParams.set("q", credential.legal_name);
  url.searchParams.set("limit", "10");

  let payload: Record<string, unknown>;
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "ACNC Charity Register data source was unavailable.",
        { http_status: response.status },
      );
    }
    payload = await response.json() as Record<string, unknown>;
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "ACNC Charity Register data source was unavailable.",
    );
  }

  const result = payload.result as Record<string, unknown> | undefined;
  const records = Array.isArray(result?.records) ? result.records as Record<string, unknown>[] : null;
  if (!records) {
    return buildUnableToVerify(
      "malformed",
      "malformed_source_response",
      "ACNC Charity Register response could not be read.",
    );
  }

  for (const record of records.slice(0, 10)) {
    const candidateName = normalizeMatchText(record.Charity_Legal_Name);
    if (candidateName !== expectedName) continue;

    const candidateAbn = normalizeIdentifier(record.ABN);
    if (!candidateAbn) continue;

    const { data: hmacMatches, error: hmacError } = await supabase.rpc(
      "credential_identifier_matches_hmac",
      {
        p_expected_hmac: credential.license_number_hmac,
        p_candidate_identifier: candidateAbn,
      },
    );

    if (hmacError) {
      return buildUnableToVerify(
        "source_unavailable",
        "hmac_compare_failed",
        "Credential identifier comparison could not be completed.",
      );
    }

    if (hmacMatches !== true) continue;

    const statusValue = record.Charity_Status;
    if (!acncCharityStatusIsRegistered(statusValue)) {
      return buildUnableToVerify(
        "not_matched",
        "organization_not_registered",
        "ACNC record was found, but the organization is not currently registered.",
        { status_present: Boolean(statusValue) },
      );
    }

    return {
      status: "organization_matched",
      matchResult: {
        outcome: "matched",
        source: "ACNC Charity Register",
        source_record_status: String(statusValue || ""),
      },
      matchedFields: ["legal_name", "abn", "charity_status"],
      confidence: "high",
      rawResultRedacted: {
        stored: "redacted",
        source: "acnc_registered_charities",
        matched: true,
        fields_seen: Object.keys(record).filter((key) =>
          ["ABN", "Charity_Legal_Name", "Charity_Status", "Registration_Date"].includes(key)
        ),
      },
      errorCode: null,
      errorMessage: null,
    };
  }

  return buildUnableToVerify(
    "not_matched",
    "no_matching_acnc_record",
    "No ACNC Charity Register record matched the submitted legal name and ABN.",
    { candidate_count: records.length },
  );
};

const runIrsEoBmfAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
): Promise<AdapterResult> => {
  const expectedName = normalizeMatchText(credential.legal_name);
  if (!expectedName || !credential.license_number_hmac) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "IRS EO BMF matching requires legal organization name and EIN.",
    );
  }

  const { data: candidates, error } = await supabase
    .from("credential_irs_eo_bmf_index")
    .select("organization_name,organization_name_normalized,subsection_code,deductibility_code,foundation_code,source_region,source_posting_date")
    .eq("active", true)
    .eq("ein_hmac", credential.license_number_hmac)
    .limit(5);

  if (error) {
    return buildUnableToVerify(
      "source_unavailable",
      "irs_index_unavailable",
      "IRS EO BMF indexed data could not be queried.",
    );
  }

  const records = Array.isArray(candidates) ? candidates as Record<string, unknown>[] : [];
  for (const record of records) {
    const candidateName = normalizeMatchText(record.organization_name_normalized || record.organization_name);
    if (candidateName !== expectedName) continue;

    return {
      status: "organization_matched",
      matchResult: {
        outcome: "matched",
        source: "IRS Exempt Organizations Business Master File Extract",
        source_record_status: "present",
      },
      matchedFields: ["legal_name", "ein", "source_record_presence"],
      confidence: "high",
      rawResultRedacted: {
        stored: "redacted",
        source: "irs_eo_bmf",
        matched: true,
        fields_seen: [
          "EIN",
          "NAME",
          "SUBSECTION",
          "DEDUCTIBILITY",
          "FOUNDATION",
        ],
        source_posting_date_present: Boolean(record.source_posting_date),
      },
      errorCode: null,
      errorMessage: null,
    };
  }

  return buildUnableToVerify(
    "not_matched",
    "no_matching_irs_eo_bmf_record",
    "No indexed IRS EO BMF record matched the submitted legal name and EIN.",
    { candidate_count: records.length },
  );
};

const runVsbhkVetAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
  lookupIdentifier: string,
): Promise<AdapterResult> => {
  const expectedName = normalizePersonName(credential.legal_name);
  const expectedIdentifier = normalizeRegistryIdentifier(lookupIdentifier);
  if (!expectedName || !credential.license_number_hmac || !hasRequiredLookupIdentifier(lookupIdentifier)) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "VSBHK matching requires legal name and registration number.",
    );
  }

  let payload: Record<string, unknown>;
  try {
    const response = await fetch(VSBHK_REGISTER_URL, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "VSBHK registered veterinary surgeons list was unavailable.",
        { http_status: response.status },
      );
    }
    payload = await response.json() as Record<string, unknown>;
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "VSBHK registered veterinary surgeons list was unavailable.",
    );
  }

  const records = Array.isArray(payload.data) ? payload.data as Record<string, unknown>[] : null;
  if (!records) {
    return buildUnableToVerify(
      "malformed",
      "malformed_source_response",
      "VSBHK registered veterinary surgeons list could not be read.",
    );
  }

  const candidates = records.filter((record) =>
    normalizeRegistryIdentifier(record.REGID) === expectedIdentifier
  );
  if (candidates.length !== 1) {
    return buildUnableToVerify(
      candidates.length > 1 ? "ambiguous" : "not_matched",
      candidates.length > 1 ? "ambiguous_source_result" : "no_matching_vsbhk_record",
      "No single VSBHK record matched the submitted registration number.",
      { candidate_count: candidates.length },
    );
  }

  const record = candidates[0];
  const nameMatches = sourceNameCandidates(record.name_eng).includes(expectedName);
  if (!nameMatches) {
    return buildUnableToVerify(
      "not_matched",
      "name_mismatch",
      "VSBHK record was found, but the legal name did not match.",
    );
  }

  const hmacMatches = await identifierMatchesHmac(
    supabase,
    credential.license_number_hmac,
    String(record.REGID || ""),
  );
  if (hmacMatches === null) {
    return buildUnableToVerify(
      "source_unavailable",
      "hmac_compare_failed",
      "Credential identifier comparison could not be completed.",
    );
  }
  if (!hmacMatches) {
    return buildUnableToVerify(
      "not_matched",
      "registration_number_mismatch",
      "VSBHK record was found, but the registration number did not match the submitted credential.",
    );
  }

  return {
    status: "registry_matched",
    matchResult: {
      outcome: "matched",
      source: "VSBHK Registered Veterinary Surgeons List",
      source_record_status: "valid_practising_certificate_list_presence",
    },
    matchedFields: ["legal_name", "registration_number", "valid_practising_certificate_list_presence"],
    confidence: "high",
    rawResultRedacted: {
      stored: "redacted",
      source: "vsbhk_registered_veterinary_surgeons",
      matched: true,
      fields_seen: ["REGID", "name_eng", "LAST_MODIFYDATE"],
      last_modify_date_present: Boolean(record.LAST_MODIFYDATE),
    },
    errorCode: null,
    errorMessage: null,
  };
};

const parseRcvsCandidates = (html: string, expectedKind: "surgeon" | "nurse"): VetRegistryCandidate[] | null => {
  if (!html.includes('id="results"') && !/Veterinary (Surgeons|Nurses) found/i.test(html)) return null;

  const itemClass = expectedKind === "surgeon" ? "item--surgeon" : "item--nurse";
  const itemRegex = new RegExp(`<div class="item item--fav ${itemClass}"[\\s\\S]*?(?=<div class="item item--fav|<nav class="pagination|<div class="pagination|</main>|$)`, "gi");
  const items = html.match(itemRegex) || [];

  return items.map((item) => {
    const titleMatch = item.match(/<h2 class="item-title">([\s\S]*?)<\/h2>/i);
    const titleText = normalizePersonName(decodeHtmlEntities(stripHtml(titleMatch?.[1] || "")));
    const refMatch = item.match(/Reference number:<\/span>\s*(?:<span>)?\s*([A-Za-z0-9-]+)/i);
    const statusMatch = item.match(/Registration category:<\/span>\s*(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>|<\/li>)/i);
    const qualificationsMatch = item.match(/<span class="item-qualifications">([\s\S]*?)<\/span>/i);
    return {
      name: titleText,
      identifier: normalizeRegistryIdentifier(refMatch?.[1] || ""),
      statusText: normalizeMatchText(decodeHtmlEntities(stripHtml(statusMatch?.[1] || ""))),
      sourceRecordType: normalizeMatchText(decodeHtmlEntities(stripHtml(qualificationsMatch?.[1] || ""))),
    };
  }).filter((candidate) => candidate.name || candidate.identifier || candidate.statusText || candidate.sourceRecordType);
};

const rcvsStatusIsEligible = (statusText: string): boolean =>
  statusText.includes("UK PRACTISING") ||
  statusText.includes("PRACTISING OUTSIDE THE UK") ||
  statusText.includes("TEMPORARY REGISTRATION");

const rcvsRecordTypeMatches = (candidate: VetRegistryCandidate, expectedKind: "surgeon" | "nurse"): boolean => {
  if (expectedKind === "surgeon") {
    return candidate.sourceRecordType.includes("MRCVS") || candidate.sourceRecordType.includes("FRCVS");
  }
  return candidate.sourceRecordType.includes("RVN") || candidate.sourceRecordType.includes("REVN");
};

const runRcvsAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
  lookupIdentifier: string,
  expectedKind: "surgeon" | "nurse",
): Promise<AdapterResult> => {
  const expectedName = normalizePersonName(credential.legal_name);
  const expectedIdentifier = normalizeRegistryIdentifier(lookupIdentifier);
  if (!expectedName || !credential.license_number_hmac || !hasRequiredLookupIdentifier(lookupIdentifier)) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "RCVS matching requires legal name and reference number.",
    );
  }

  const baseUrl = expectedKind === "surgeon" ? RCVS_VET_URL : RCVS_NURSE_URL;
  const url = new URL(baseUrl);
  url.searchParams.set("filter-choice", "reference");
  url.searchParams.set("filter-keyword", expectedIdentifier);
  url.searchParams.set("filter-searchtype", expectedKind);

  let html = "";
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "text/html" },
    });
    if (!response.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "RCVS Find a Vet source was unavailable.",
        { http_status: response.status },
      );
    }
    html = await response.text();
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "RCVS Find a Vet source was unavailable.",
    );
  }

  const candidates = parseRcvsCandidates(html, expectedKind);
  if (!candidates) {
    return buildUnableToVerify(
      "malformed",
      "malformed_source_response",
      "RCVS Find a Vet response could not be read.",
    );
  }

  const identifierMatches = candidates.filter((candidate) => candidate.identifier === expectedIdentifier);
  if (identifierMatches.length !== 1) {
    return buildUnableToVerify(
      identifierMatches.length > 1 ? "ambiguous" : "not_matched",
      identifierMatches.length > 1 ? "ambiguous_source_result" : "no_matching_rcvs_record",
      "No single RCVS record matched the submitted reference number.",
      { candidate_count: identifierMatches.length },
    );
  }

  const candidate = identifierMatches[0];
  if (candidate.name !== expectedName) {
    return buildUnableToVerify(
      "not_matched",
      "name_mismatch",
      "RCVS record was found, but the legal name did not match.",
    );
  }

  if (!rcvsRecordTypeMatches(candidate, expectedKind)) {
    return buildUnableToVerify(
      "not_matched",
      "record_type_mismatch",
      "RCVS record type did not match the submitted credential type.",
    );
  }

  if (expectedKind === "surgeon" && !rcvsStatusIsEligible(candidate.statusText)) {
    return buildUnableToVerify(
      "not_matched",
      "not_eligible_to_practise",
      "RCVS record was found, but eligible practising status was not exposed.",
    );
  }

  const hmacMatches = await identifierMatchesHmac(
    supabase,
    credential.license_number_hmac,
    candidate.identifier,
  );
  if (hmacMatches === null) {
    return buildUnableToVerify(
      "source_unavailable",
      "hmac_compare_failed",
      "Credential identifier comparison could not be completed.",
    );
  }
  if (!hmacMatches) {
    return buildUnableToVerify(
      "not_matched",
      "reference_number_mismatch",
      "RCVS record was found, but the reference number did not match the submitted credential.",
    );
  }

  return {
    status: "registry_matched",
    matchResult: {
      outcome: "matched",
      source: expectedKind === "surgeon" ? "RCVS Find a Vet Surgeon" : "RCVS Find a Vet Nurse",
      source_record_status: candidate.statusText || "register_result",
    },
    matchedFields: expectedKind === "surgeon"
      ? ["legal_name", "reference_number", "vet_surgeon_register_result", "eligible_status"]
      : ["legal_name", "reference_number", "vet_nurse_register_result"],
    confidence: "high",
    rawResultRedacted: {
      stored: "redacted",
      source: expectedKind === "surgeon" ? "rcvs_find_a_vet_surgeon" : "rcvs_find_a_vet_nurse",
      matched: true,
      fields_seen: ["name", "reference_number", "registration_category", "designation"],
      status_present: Boolean(candidate.statusText),
    },
    errorCode: null,
    errorMessage: null,
  };
};

const myCertisResultIsMatched = (html: string): boolean => {
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

const myCertisResultIsNotMatched = (html: string): boolean => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  return (
    text.includes("INVALID SECURITY TOKEN") ||
    text.includes("VALIDATION SUMMARY ERRORS") ||
    text.includes("UNABLE TO VERIFY") ||
    text.includes("NOT FOUND") ||
    text.includes("NO CERTIFICATE")
  );
};

const redCrossResultIsMatched = (html: string): boolean => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  if (!text) return false;
  if (text.includes("SORRY WE DID NOT FIND A CERTIFICATE")) return false;
  if (text.includes("NO CERTIFICATE RESULT")) return false;
  return (
    html.includes("certificate-heading-list") ||
    html.includes("eachcert") ||
    html.includes("certpdfurl") ||
    text.includes("CERTIFICATE ID") ||
    text.includes("DATE COMPLETED")
  );
};

const redCrossResultIsNotMatched = (html: string): boolean => {
  const text = normalizeMatchText(decodeHtmlEntities(stripHtml(html)));
  return text.includes("SORRY WE DID NOT FIND A CERTIFICATE") || text.includes("NO CERTIFICATE RESULT");
};

const runRedCrossAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
  lookupIdentifier: string,
): Promise<AdapterResult> => {
  if (!credential.license_number_hmac || !hasRequiredLookupIdentifier(lookupIdentifier)) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "Red Cross matching requires certificate ID.",
    );
  }

  const hmacMatches = await identifierMatchesHmac(
    supabase,
    credential.license_number_hmac,
    lookupIdentifier,
  );
  if (hmacMatches === null) {
    return buildUnableToVerify(
      "source_unavailable",
      "hmac_compare_failed",
      "Credential identifier comparison could not be completed.",
    );
  }
  if (!hmacMatches) {
    return buildUnableToVerify(
      "not_matched",
      "certificate_id_mismatch",
      "Submitted certificate ID did not match the saved credential.",
    );
  }

  let cookieHeader = "";
  try {
    const pageResponse = await fetch(RED_CROSS_CERTIFICATE_PAGE_URL, {
      method: "GET",
      headers: { accept: "text/html" },
    });
    if (!pageResponse.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "Red Cross certificate lookup source was unavailable.",
        { http_status: pageResponse.status },
      );
    }
    const pageHtml = await pageResponse.text();
    if (!pageHtml.includes("Certificates-SearchCertificates") || !pageHtml.includes("dwfrm_certificate_certnumber")) {
      return buildUnableToVerify(
        "malformed",
        "malformed_source_response",
        "Red Cross certificate lookup form could not be read.",
      );
    }
    cookieHeader = cookieHeaderFromResponse(pageResponse);
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "Red Cross certificate lookup source was unavailable.",
    );
  }

  const url = new URL(RED_CROSS_CERTIFICATE_SEARCH_URL);
  url.searchParams.set("certnumber", lookupIdentifier);
  url.searchParams.set("format", "ajax");

  let resultHtml = "";
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "text/html",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: RED_CROSS_CERTIFICATE_PAGE_URL,
      },
    });
    if (!response.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "Red Cross certificate lookup source was unavailable.",
        { http_status: response.status },
      );
    }
    resultHtml = await response.text();
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "Red Cross certificate lookup source was unavailable.",
    );
  }

  if (redCrossResultIsMatched(resultHtml)) {
    return {
      status: "certificate_matched",
      matchResult: {
        outcome: "matched",
        source: "Red Cross certificate lookup",
        source_record_status: "certificate_lookup_result",
      },
      matchedFields: ["certificate_id", "certificate_result"],
      confidence: "high",
      rawResultRedacted: {
        stored: "redacted",
        source: "red_cross_certificate_lookup",
        matched: true,
        fields_seen: ["certificate_id", "certificate_result"],
      },
      errorCode: null,
      errorMessage: null,
    };
  }

  if (redCrossResultIsNotMatched(resultHtml)) {
    return buildUnableToVerify(
      "not_matched",
      "no_matching_red_cross_certificate",
      "No Red Cross certificate matched the submitted certificate ID.",
    );
  }

  return buildUnableToVerify(
    "malformed",
    "malformed_source_response",
    "Red Cross certificate lookup response could not be read.",
  );
};

const runCityGuildsAdapter = async (
  supabase: ReturnType<typeof createClient>,
  credential: CredentialRecord,
  lookupIdentifier: string,
): Promise<AdapterResult> => {
  const expectedName = normalizePersonName(credential.legal_name);
  if (!expectedName || !credential.license_number_hmac || !hasRequiredLookupIdentifier(lookupIdentifier)) {
    return buildUnableToVerify(
      "not_matched",
      "missing_required_lookup_input",
      "City & Guilds matching requires learner name and certificate authentication code.",
    );
  }

  const hmacMatches = await identifierMatchesHmac(
    supabase,
    credential.license_number_hmac,
    lookupIdentifier,
  );
  if (hmacMatches === null) {
    return buildUnableToVerify(
      "source_unavailable",
      "hmac_compare_failed",
      "Credential identifier comparison could not be completed.",
    );
  }
  if (!hmacMatches) {
    return buildUnableToVerify(
      "not_matched",
      "authentication_code_mismatch",
      "Submitted authentication code did not match the saved credential.",
    );
  }

  let html = "";
  let cookieHeader = "";
  let token = "";
  try {
    const formResponse = await fetch(MYCERTIS_VERIFY_URL, {
      method: "GET",
      headers: { accept: "text/html" },
    });
    if (!formResponse.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "City & Guilds certificate verification source was unavailable.",
        { http_status: formResponse.status },
      );
    }
    cookieHeader = cookieHeaderFromResponse(formResponse);
    html = await formResponse.text();
    token = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] || "";
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "City & Guilds certificate verification source was unavailable.",
    );
  }

  if (!html.includes('name="Name"') || !html.includes('name="SecurityToken"') || !token) {
    return buildUnableToVerify(
      "malformed",
      "malformed_source_response",
      "City & Guilds certificate verification form could not be read.",
    );
  }

  const body = new URLSearchParams();
  body.set("__RequestVerificationToken", token);
  body.set("Name", credential.legal_name);
  body.set("SecurityToken", lookupIdentifier);
  body.append("TermsAndConditions", "true");
  body.append("TermsAndConditions", "false");

  let resultHtml = "";
  try {
    const verifyResponse = await fetch(MYCERTIS_VERIFY_URL, {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: MYCERTIS_VERIFY_URL,
      },
      body,
    });
    if (!verifyResponse.ok) {
      return buildUnableToVerify(
        "source_unavailable",
        "source_unavailable",
        "City & Guilds certificate verification source was unavailable.",
        { http_status: verifyResponse.status },
      );
    }
    resultHtml = await verifyResponse.text();
  } catch {
    return buildUnableToVerify(
      "source_unavailable",
      "source_unavailable",
      "City & Guilds certificate verification source was unavailable.",
    );
  }

  if (myCertisResultIsMatched(resultHtml)) {
    return {
      status: "certificate_matched",
      matchResult: {
        outcome: "matched",
        source: "City & Guilds certificate verification",
        source_record_status: "certificate_verified",
      },
      matchedFields: ["learner_name", "authentication_code", "certificate_result"],
      confidence: "high",
      rawResultRedacted: {
        stored: "redacted",
        source: "city_guilds_mycertis",
        matched: true,
        fields_seen: ["Name", "SecurityToken", "verification_result"],
      },
      errorCode: null,
      errorMessage: null,
    };
  }

  if (myCertisResultIsNotMatched(resultHtml)) {
    return buildUnableToVerify(
      "not_matched",
      "no_matching_city_guilds_certificate",
      "No City & Guilds certificate matched the submitted learner name and authentication code.",
    );
  }

  return buildUnableToVerify(
    "malformed",
    "malformed_source_response",
    "City & Guilds certificate verification response could not be read.",
  );
};

const runSourceAdapter = async (
  supabase: ReturnType<typeof createClient>,
  source: SourceRecord,
  credential: CredentialRecord,
  lookupIdentifier: string,
): Promise<AdapterResult> => {
  switch (source.source_key) {
    case "acnc_registered_charities":
      return runAcncAdapter(supabase, credential);
    case "irs_eo_bmf":
      return runIrsEoBmfAdapter(supabase, credential);
    case "vsbhk_registered_veterinary_surgeons":
      return runVsbhkVetAdapter(supabase, credential, lookupIdentifier);
    case "rcvs_find_a_vet_surgeon":
      return runRcvsAdapter(supabase, credential, lookupIdentifier, "surgeon");
    case "rcvs_find_a_vet_nurse":
      return runRcvsAdapter(supabase, credential, lookupIdentifier, "nurse");
    case "city_guilds_mycertis":
      return runCityGuildsAdapter(supabase, credential, lookupIdentifier);
    case "red_cross_certificate_lookup":
      return runRedCrossAdapter(supabase, credential, lookupIdentifier);
    default:
      return buildUnableToVerify(
        "source_unavailable",
        "adapter_not_configured",
        "Automated source adapter is not configured for this source.",
      );
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const clientIp = getClientIp(req);

  try {
    if (!enforceBodySize(req)) {
      return Response.json({ error: "Request body too large" }, { status: 413, headers: corsHeaders });
    }

    const ipRate = isWithinRateLimit(`credential-registry-check:ip:${clientIp}`, IP_RATE_LIMIT_MAX);
    if (!ipRate.ok) {
      const wait = Math.max(1, Math.ceil(((ipRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[credential-registry-check] ip rate limited");
      return Response.json(
        { error: "Too many requests", code: "ip_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
    }

    const parsedBody = await req.json().catch(() => null);
    if (!parsedBody || Array.isArray(parsedBody) || typeof parsedBody !== "object") {
      return Response.json(
        { error: "One credential per request is required", code: "bulk_lookup_rejected" },
        { status: 400, headers: corsHeaders },
      );
    }

    const body = parsedBody as Record<string, unknown>;
    if (Array.isArray(body.credential_id) || Array.isArray(body.credential_ids)) {
      return Response.json(
        { error: "Bulk credential lookup is not supported", code: "bulk_lookup_rejected" },
        { status: 400, headers: corsHeaders },
      );
    }

    const credentialId = body.credential_id;
    const lookupIdentifier = String(body.lookup_identifier || body.reference_number || body.registration_number || "")
      .trim();
    if (!isUuid(credentialId)) {
      return Response.json(
        { error: "credential_id must be a UUID", code: "invalid_credential_id" },
        { status: 400, headers: corsHeaders },
      );
    }

    const token = extractToken(req, body);
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = cleanEnv(Deno.env.get("SUPABASE_URL"));
    const serviceKey = resolveSupabaseServiceKey();
    if (!supabaseUrl || !serviceKey) {
      return Response.json(
        { error: "Credential check service is not configured", code: "server_not_configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const userId = authData.user.id;
    const userRate = isWithinRateLimit(`credential-registry-check:user:${userId}`, USER_RATE_LIMIT_MAX);
    if (!userRate.ok) {
      const wait = Math.max(1, Math.ceil(((userRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[credential-registry-check] user rate limited");
      return Response.json(
        { error: "Too many requests", code: "user_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
    }

    const credentialRate = isWithinRateLimit(
      `credential-registry-check:credential:${userId}:${credentialId}`,
      CREDENTIAL_RATE_LIMIT_MAX,
    );
    if (!credentialRate.ok) {
      const wait = Math.max(1, Math.ceil(((credentialRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[credential-registry-check] credential rate limited");
      return Response.json(
        { error: "Too many requests", code: "credential_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
    }

    const authedClient = createClient(supabaseUrl, cleanEnv(Deno.env.get("SUPABASE_ANON_KEY")), {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: checkStartData, error: checkStartError } = await authedClient.rpc(
      "check_professional_credential_registry",
      { p_credential_id: credentialId },
    );

    if (checkStartError) {
      const code = safeErrorCode(checkStartError.message);
      const status = code === "unsupported_credential_source" ? 400 : code === "credential_check_rate_limited" ? 429 : 400;
      return Response.json(
        { error: "Credential cannot be checked online", code },
        { status, headers: corsHeaders },
      );
    }

    const checkStart = (checkStartData || {}) as CheckStart;
    if (!isUuid(checkStart.check_id)) {
      return Response.json(
        { error: "Credential check did not start", code: "check_start_failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!isUuid(checkStart.source_id)) {
      return Response.json(
        { error: "Credential check source was not resolved", code: "check_source_missing" },
        { status: 500, headers: corsHeaders },
      );
    }

    const { data: credential, error: credentialError } = await supabase
      .from("professional_credentials")
      .select("id,user_id,credential_type,country_region,legal_name,license_number_hmac,license_number_masked")
      .eq("id", credentialId)
      .eq("user_id", userId)
      .maybeSingle();

    if (credentialError || !credential) {
      return Response.json(
        { error: "Credential could not be loaded", code: "credential_load_failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    const { data: source, error: sourceError } = await supabase
      .from("credential_registry_sources")
      .select("id,source_key,source_name,source_type,source_url,usage_caveat")
      .eq("id", checkStart.source_id)
      .eq("active", true)
      .maybeSingle();

    if (sourceError || !source) {
      return Response.json(
        { error: "Credential source could not be loaded", code: "source_load_failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    const edgeFunctionRunId = crypto.randomUUID();
    const adapterResult = await runSourceAdapter(
      supabase,
      source as SourceRecord,
      credential as CredentialRecord,
      lookupIdentifier,
    );

    const { data: finishData, error: finishError } = await supabase.rpc(
      "finish_professional_credential_check",
      {
        p_check_id: checkStart.check_id,
        p_status_after: adapterResult.status,
        p_match_result: adapterResult.matchResult,
        p_matched_fields: adapterResult.matchedFields,
        p_confidence: adapterResult.confidence,
        p_raw_result_redacted: adapterResult.rawResultRedacted,
        p_error_code: adapterResult.errorCode,
        p_error_message: adapterResult.errorMessage,
        p_edge_function_run_id: edgeFunctionRunId,
      },
    );

    if (finishError) {
      console.warn("[credential-registry-check] finish failed", { code: safeErrorCode(finishError.message) });
      return Response.json(
        { error: "Credential check could not be completed", code: "check_finish_failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        credential_id: credentialId,
        check_id: checkStart.check_id,
        status: adapterResult.status,
        public_label: adapterResult.status === "organization_matched"
          ? "Organization matched"
          : adapterResult.status === "certificate_matched"
            ? "Certificate matched"
          : adapterResult.status === "registry_matched"
            ? "Registry matched"
            : "Unable to verify online",
        result: finishData,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.warn("[credential-registry-check] unhandled error", {
      code: error instanceof Error ? safeErrorCode(error.message) : "unknown",
    });
    return Response.json(
      { error: "Credential check failed", code: "credential_check_failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
