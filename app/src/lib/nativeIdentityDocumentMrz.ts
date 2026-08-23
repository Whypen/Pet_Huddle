export type NativePassportMrzResult = {
  ok: true;
  documentCountry: string;
  dob: string;
  documentGender: NativeIdentityDocumentGender | null;
  legalName: string;
  documentNumber: string;
  expiryDate: string;
};

export type NativePassportMrzFailure = {
  ok: false;
  reason: "mrz_checksum_failed" | "mrz_invalid_name" | "mrz_not_found" | "expired_document";
};

export type NativePassportMrzParseResult = NativePassportMrzResult | NativePassportMrzFailure;
export type NativePassportNameRepairSource = "mrz_strong" | "ocr_geometry_label_fields" | "ocr_label_fields" | "ocr_surname_first" | "unrepaired_weak_mrz";
export type NativeIdentityDocumentGender = "Man" | "Woman" | "Others";
export type NativePassportMrzChecksumSummary = {
  composite: boolean;
  dob: boolean;
  documentNumber: boolean;
  expiry: boolean;
  personalNumber: boolean;
};

export type NativePassportMrzCandidateDiagnostic = {
  checksum: NativePassportMrzChecksumSummary;
  firstLen: number;
  firstSourceLabels: string[];
  firstSpanCount: number;
  firstStartsPassport: boolean;
  hasTwoAdjacentStructuredLines: boolean;
  secondLen: number;
  secondSourceLabels: string[];
  secondSpanCount: number;
  scoreBucket: number;
};

type PassportVizNameCandidate = {
  line: string;
  source: NativePassportNameRepairSource;
  strict: boolean;
};

export type NativeIdentityDocumentGeometryTextLine = {
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sourceLabel: string;
};

export type NativePassportGeometryNameDiagnostic = {
  acceptedCandidateCount: number;
  groupCount: number;
  hasWeakMrzName: boolean;
  labelCounts: {
    combinedSurnameGiven: number;
    given: number;
    surname: number;
  };
  mrzTokenCount: number;
  rejectedSamples: Array<{
    reason: "alignment_failed" | "country_token" | "no_surname_match" | "token_count_mismatch" | "weak_token";
    source: "combined_geometry_row" | "field_pair";
    tokenCount: number;
    tokenLengths: number[];
  }>;
  valueLineCount: number;
};

const MRZ_WEIGHTS = [7, 3, 1] as const;
const PASSPORT_VIZ_NAME_LABEL_TOKENS = new Set([
  "GIVEN",
  "GIVENS",
  "NAME",
  "NAMES",
  "SURNAME",
  "FAMILY",
  "LAST",
  "FIRST",
  "FORENAME",
  "FORENAMES",
]);
const PASSPORT_SURNAME_LABEL_PATTERN = /\b(sur\s*name|surname|family\s+name|last\s+name)\b/i;
const PASSPORT_GIVEN_NAME_LABEL_PATTERN = /\b(given\s+name\s*\(?s?\)?|given\s+names?|first\s+name\s*\(?s?\)?|first\s+names?|forenames?)\b/i;
const PASSPORT_FIELD_BOUNDARY_PATTERN = /\b(sur\s*name|surname|family\s+name|last\s+name|given\s+name\s*\(?s?\)?|given\s+names?|first\s+name\s*\(?s?\)?|first\s+names?|forenames?|sex|gender|nationality|date\s+of\s+birth|birth|dob|place\s+of\s+birth|passport\s+no\.?|passport\s+number|document\s+no\.?|document\s+number|date\s+of\s+issue|issue|date\s+of\s+expiry|expiry|authority|signature|holder)\b/i;
const PASSPORT_NON_NAME_FIELD_VALUE_PATTERN = /^(SEX|GENDER|M|F|X|MALE|FEMALE|NATIONALITY|DATE|BIRTH|DOB|PASSPORT|DOCUMENT|EXPIRY|ISSUE|AUTHORITY|SIGNATURE|HOLDER)$/i;
const ISO_ALPHA3_DOCUMENT_TOKENS = new Set([
  "ABW", "AFG", "AGO", "AIA", "ALA", "ALB", "AND", "ARE", "ARG", "ARM", "ASM", "ATA", "ATF", "ATG", "AUS", "AUT", "AZE",
  "BDI", "BEL", "BEN", "BES", "BFA", "BGD", "BGR", "BHR", "BHS", "BIH", "BLM", "BLR", "BLZ", "BMU", "BOL", "BRA",
  "BRB", "BRN", "BTN", "BVT", "BWA", "CAF", "CAN", "CCK", "CHE", "CHL", "CHN", "CIV", "CMR", "COD", "COG", "COK",
  "COL", "COM", "CPV", "CRI", "CUB", "CUW", "CXR", "CYM", "CYP", "CZE", "DEU", "DJI", "DMA", "DNK", "DOM", "DZA",
  "ECU", "EGY", "ERI", "ESH", "ESP", "EST", "ETH", "FIN", "FJI", "FLK", "FRA", "FRO", "FSM", "GAB", "GBR", "GEO",
  "GGY", "GHA", "GIB", "GIN", "GLP", "GMB", "GNB", "GNQ", "GRC", "GRD", "GRL", "GTM", "GUF", "GUM", "GUY", "HKG",
  "HMD", "HND", "HRV", "HTI", "HUN", "IDN", "IMN", "IND", "IOT", "IRL", "IRN", "IRQ", "ISL", "ISR", "ITA", "JAM",
  "JEY", "JOR", "JPN", "KAZ", "KEN", "KGZ", "KHM", "KIR", "KNA", "KOR", "KWT", "LAO", "LBN", "LBR", "LBY", "LCA",
  "LIE", "LKA", "LSO", "LTU", "LUX", "LVA", "MAC", "MAF", "MAR", "MCO", "MDA", "MDG", "MDV", "MEX", "MHL", "MKD",
  "MLI", "MLT", "MMR", "MNE", "MNG", "MNP", "MOZ", "MRT", "MSR", "MTQ", "MUS", "MWI", "MYS", "MYT", "NAM", "NCL",
  "NER", "NFK", "NGA", "NIC", "NIU", "NLD", "NOR", "NPL", "NRU", "NZL", "OMN", "PAK", "PAN", "PCN", "PER", "PHL",
  "PLW", "PNG", "POL", "PRI", "PRK", "PRT", "PRY", "PSE", "PYF", "QAT", "REU", "ROU", "RUS", "RWA", "SAU", "SDN",
  "SEN", "SGP", "SGS", "SHN", "SJM", "SLB", "SLE", "SLV", "SMR", "SOM", "SPM", "SRB", "SSD", "STP", "SUR", "SVK",
  "SVN", "SWE", "SWZ", "SXM", "SYC", "SYR", "TCA", "TCD", "TGO", "THA", "TJK", "TKL", "TKM", "TLS", "TON", "TTO",
  "TUN", "TUR", "TUV", "TWN", "TZA", "UGA", "UKR", "UMI", "URY", "USA", "UZB", "VAT", "VCT", "VEN", "VGB", "VIR",
  "VNM", "VUT", "WLF", "WSM", "YEM", "ZAF", "ZMB", "ZWE",
]);

const MRZ_CHAR_VALUES: Record<string, number> = Object.freeze({
  "<": 0,
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 18,
  J: 19,
  K: 20,
  L: 21,
  M: 22,
  N: 23,
  O: 24,
  P: 25,
  Q: 26,
  R: 27,
  S: 28,
  T: 29,
  U: 30,
  V: 31,
  W: 32,
  X: 33,
  Y: 34,
  Z: 35,
});

export const resolvePassportDocumentCountryFromText = (mrzCountry: string, lines: string[]) => {
  const normalizedCountry = mrzCountry.trim().toUpperCase();
  const normalizedText = lines.join(" ").replace(/\s+/g, " ").trim().toUpperCase();
  if (
    normalizedText.includes("HONG KONG") ||
    normalizedText.includes("HKSAR") ||
    normalizedText.includes("SPECIAL ADMINISTRATIVE REGION")
  ) {
    return "HKG";
  }
  return normalizedCountry;
};

const normalizeMrzLine = (value: string) =>
  value
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[«‹]/g, "<")
    .replace(/[|]/g, "I")
    .replace(/[^A-Z0-9<]/g, "");

const repairPassportLineStart = (value: string) => {
  const normalized = normalizeMrzLine(value);
  if (/^P[A-Z]{3}/.test(normalized)) return `P<${normalized.slice(1)}`;
  return normalized
    .replace(/^(P)[0OQ]/, "$1<")
    .replace(/(P)[0OQ]</, "$1<");
};

const repairMrzCandidate = (value: string) =>
  repairPassportLineStart(value);

const normalizeMrzDigitChar = (value: string) => {
  const char = value.toUpperCase();
  if (/^[0-9]$/.test(char)) return char;
  if (char === "O" || char === "Q" || char === "D") return "0";
  if (char === "I" || char === "L") return "1";
  if (char === "Z") return "2";
  if (char === "S") return "5";
  if (char === "G") return "6";
  if (char === "B") return "8";
  return char;
};

const normalizeMrzDigitField = (value: string) =>
  value.split("").map(normalizeMrzDigitChar).join("");

const getAmbiguousMrzChars = (char: string) => {
  switch (char) {
    case "0":
      return ["0", "O", "Q", "D"];
    case "O":
    case "Q":
    case "D":
      return [char, "0"];
    case "1":
      return ["1", "I", "L"];
    case "I":
    case "L":
      return [char, "1"];
    case "2":
      return ["2", "Z"];
    case "Z":
      return ["Z", "2"];
    case "5":
      return ["5", "S"];
    case "S":
      return ["S", "5"];
    case "6":
      return ["6", "G"];
    case "G":
      return ["G", "6"];
    case "8":
      return ["8", "B"];
    case "B":
      return ["B", "8"];
    default:
      return [char];
  }
};

const getChecksumRepairVariants = (value: string, checkDigit: string, limit = 24) => {
  const variants = new Set<string>([value]);
  const queue = [value];
  for (let index = 0; index < value.length && variants.size < limit; index += 1) {
    const sourceSize = queue.length;
    for (let queueIndex = 0; queueIndex < sourceSize && variants.size < limit; queueIndex += 1) {
      const candidate = queue[queueIndex] ?? value;
      for (const replacement of getAmbiguousMrzChars(candidate[index] ?? "<")) {
        const repaired = `${candidate.slice(0, index)}${replacement}${candidate.slice(index + 1)}`;
        if (!variants.has(repaired)) {
          variants.add(repaired);
          queue.push(repaired);
        }
        if (variants.size >= limit) break;
      }
    }
  }
  return [...variants].filter((candidate) => hasValidChecksum(candidate, checkDigit));
};

const getSecondLineRepairCandidates = (value: string) => {
  const normalized = repairMrzCandidate(value).padEnd(44, "<").slice(0, 44);
  const documentNumberCheck = normalizeMrzDigitChar(normalized.slice(9, 10));
  const dob = normalizeMrzDigitField(normalized.slice(13, 19));
  const dobCheck = normalizeMrzDigitChar(normalized.slice(19, 20));
  const expiryDate = normalizeMrzDigitField(normalized.slice(21, 27));
  const expiryDateCheck = normalizeMrzDigitChar(normalized.slice(27, 28));
  const personalNumberCheck = normalizeMrzDigitChar(normalized.slice(42, 43));
  const compositeCheck = normalizeMrzDigitChar(normalized.slice(43, 44));
  const base = `${normalized.slice(0, 9)}${documentNumberCheck}${normalized.slice(10, 13)}${dob}${dobCheck}${normalized.slice(20, 21)}${expiryDate}${expiryDateCheck}${normalized.slice(28, 42)}${personalNumberCheck}${compositeCheck}`;
  const documentNumberVariants = getChecksumRepairVariants(base.slice(0, 9), documentNumberCheck);
  const personalNumberVariants = getChecksumRepairVariants(base.slice(28, 42), personalNumberCheck);
  const candidates = new Set<string>([base]);
  for (const documentNumber of documentNumberVariants.length ? documentNumberVariants : [base.slice(0, 9)]) {
    for (const personalNumber of personalNumberVariants.length ? personalNumberVariants : [base.slice(28, 42)]) {
      candidates.add(`${documentNumber}${base.slice(9, 28)}${personalNumber}${base.slice(42, 44)}`);
    }
  }
  return [...candidates];
};

const mrzChecksum = (value: string) => {
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "<";
    const numericValue = /^[0-9]$/.test(char) ? Number(char) : MRZ_CHAR_VALUES[char] ?? 0;
    sum += numericValue * MRZ_WEIGHTS[index % MRZ_WEIGHTS.length];
  }
  return String(sum % 10);
};

const hasValidChecksum = (value: string, checkDigit: string) => mrzChecksum(value) === checkDigit;

const summarizePassportMrzSecondLineChecks = (second: string): NativePassportMrzChecksumSummary => {
  const documentNumber = second.slice(0, 9);
  const documentNumberCheck = second.slice(9, 10);
  const dob = second.slice(13, 19);
  const dobCheck = second.slice(19, 20);
  const expiryDate = second.slice(21, 27);
  const expiryDateCheck = second.slice(27, 28);
  const personalNumber = second.slice(28, 42);
  const personalNumberCheck = second.slice(42, 43);
  const compositeCheck = second.slice(43, 44);
  const compositeValue = `${documentNumber}${documentNumberCheck}${dob}${dobCheck}${expiryDate}${expiryDateCheck}${personalNumber}${personalNumberCheck}`;
  return {
    composite: hasValidChecksum(compositeValue, compositeCheck),
    dob: hasValidChecksum(dob, dobCheck),
    documentNumber: hasValidChecksum(documentNumber, documentNumberCheck),
    expiry: hasValidChecksum(expiryDate, expiryDateCheck),
    personalNumber: hasValidChecksum(personalNumber, personalNumberCheck),
  };
};

const normalizeMrzBirthDate = (value: string) => {
  const year = Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const currentYear = new Date().getFullYear() % 100;
  const century = year > currentYear ? 1900 : 2000;
  return `${century + year}-${month}-${day}`;
};

const normalizeMrzExpiryDate = (value: string) => {
  const year = Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const currentFullYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentFullYear / 100) * 100;
  const candidate = currentCentury + year;
  const fullYear = candidate < currentFullYear - 50 ? candidate + 100 : candidate;
  return `${fullYear}-${month}-${day}`;
};

export const normalizeIdentityDocumentGender = (value: string): NativeIdentityDocumentGender | null => {
  const raw = value.trim();
  if (/女/.test(raw)) return "Woman";
  if (/男/.test(raw)) return "Man";
  const normalized = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "M" || normalized === "MALE" || normalized === "MAN") return "Man";
  if (normalized === "F" || normalized === "FEMALE" || normalized === "WOMAN") return "Woman";
  if (normalized === "X" || normalized === "U" || normalized === "UNSPECIFIED" || normalized === "OTHER" || normalized === "OTHERS") return "Others";
  return null;
};

const normalizeMrzGender = (value: string) => normalizeIdentityDocumentGender(value === "<" ? "X" : value);

const normalizeStandaloneIdentityDocumentSexMarker = (value: string): NativeIdentityDocumentGender | null => {
  const raw = value.trim();
  if (raw === "男") return "Man";
  if (raw === "女") return "Woman";
  const normalized = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "M" || normalized === "MALE") return "Man";
  if (normalized === "F" || normalized === "FEMALE") return "Woman";
  if (normalized === "X" || normalized === "U" || normalized === "UNSPECIFIED" || normalized === "OTHER" || normalized === "OTHERS") return "Others";
  return null;
};

const findUniqueStandaloneIdentityDocumentSexMarker = (values: string[]) => {
  const candidates = values
    .map(normalizeStandaloneIdentityDocumentSexMarker)
    .filter((value): value is NativeIdentityDocumentGender => Boolean(value));
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
};

const normalizeMrzName = (value: string) => {
  const [surname = "", givenNames = ""] = value.split("<<");
  const parts = [...surname.split("<"), ...givenNames.split("<")]
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase());
  return parts.join(" ");
};

const normalizePassportNameToken = (value: string) => value.replace(/[^A-Za-z]/g, "").toUpperCase();

const titleCasePassportName = (tokens: string[]) => tokens
  .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
  .join(" ");

const getPassportDisplayNameTokens = (value: string) => value
  .split(/[\s,]+/)
  .map(normalizePassportNameToken)
  .filter(Boolean);

const hasIsoAlpha3DocumentToken = (tokens: string[]) => tokens.some((token) => token.length === 3 && ISO_ALPHA3_DOCUMENT_TOKENS.has(token));

const passportNameHasWeakToken = (value: string) => getPassportDisplayNameTokens(value).some((token) => token.length === 1);
const passportNameNeedsOcrRepair = (value: string) => {
  const tokens = getPassportDisplayNameTokens(value);
  return tokens.length < 2 || tokens.some((token) => token.length === 1);
};

const normalizePassportVizNameCandidate = (value: string, surname: string) => {
  const rawTokens = getPassportDisplayNameTokens(value).filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
  const surnameIndex = rawTokens.indexOf(surname);
  if (surnameIndex < 0) return [];
  return rawTokens.slice(surnameIndex);
};

const normalizePassportVizFieldValue = (value: string, labelPattern: RegExp) => {
  const labelMatch = labelPattern.exec(value);
  const afterLabel = labelMatch ? value.slice(labelMatch.index + labelMatch[0].length) : value;
  const withoutLabel = afterLabel
    .replace(PASSPORT_FIELD_BOUNDARY_PATTERN, " __FIELD_BOUNDARY__ ")
    .split("__FIELD_BOUNDARY__")[0] ?? "";
  const tokens = getPassportDisplayNameTokens(withoutLabel).filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
  if (!tokens.length || tokens.length > 4) return "";
  if (tokens.some((token) => token.length === 1)) return "";
  if (tokens.every((token) => PASSPORT_NON_NAME_FIELD_VALUE_PATTERN.test(token))) return "";
  return tokens.join(" ");
};

const isPassportFieldBoundaryLine = (value: string) => PASSPORT_FIELD_BOUNDARY_PATTERN.test(value);

const isPassportVizNameValue = (value: string) => {
  const tokens = getPassportDisplayNameTokens(value).filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
  if (!tokens.length || tokens.length > 4) return false;
  if (tokens.some((token) => token.length === 1)) return false;
  if (hasIsoAlpha3DocumentToken(tokens)) return false;
  if (tokens.every((token) => PASSPORT_NON_NAME_FIELD_VALUE_PATTERN.test(token))) return false;
  return tokens.every((token) => /^[A-Z]+$/.test(token));
};

const getPassportVizNameValue = (value: string) => {
  if (!isPassportVizNameValue(value)) return "";
  return getPassportDisplayNameTokens(value)
    .filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token))
    .join(" ");
};

const getExactPassportVizNameTokens = (value: string) => {
  if (!isPassportVizNameValue(value)) return [];
  return getPassportDisplayNameTokens(value)
    .filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
};

const getBoxCenter = (line: NativeIdentityDocumentGeometryTextLine) => {
  const box = line.boundingBox;
  if (!box) return null;
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
};

const getSameRowScore = (
  label: NativeIdentityDocumentGeometryTextLine,
  value: NativeIdentityDocumentGeometryTextLine,
) => {
  if (!label.boundingBox || !value.boundingBox) return null;
  const labelCenter = getBoxCenter(label);
  const valueCenter = getBoxCenter(value);
  if (!labelCenter || !valueCenter) return null;
  const verticalTolerance = Math.max(label.boundingBox.height, value.boundingBox.height) * 1.4;
  if (Math.abs(labelCenter.y - valueCenter.y) > verticalTolerance) return null;
  if (value.boundingBox.x < label.boundingBox.x + label.boundingBox.width * 0.35) return null;
  const distance = Math.max(0, value.boundingBox.x - (label.boundingBox.x + label.boundingBox.width));
  return 260 - distance * 120 - Math.abs(labelCenter.y - valueCenter.y) * 180;
};

const getSameColumnScore = (
  label: NativeIdentityDocumentGeometryTextLine,
  value: NativeIdentityDocumentGeometryTextLine,
) => {
  if (!label.boundingBox || !value.boundingBox) return null;
  const labelCenter = getBoxCenter(label);
  const valueCenter = getBoxCenter(value);
  if (!labelCenter || !valueCenter) return null;
  const horizontalTolerance = Math.max(label.boundingBox.width * 1.8, value.boundingBox.width * 0.8, label.boundingBox.height * 4);
  if (Math.abs(labelCenter.x - valueCenter.x) > horizontalTolerance) return null;
  const verticalDistance = Math.abs(labelCenter.y - valueCenter.y);
  if (verticalDistance <= Math.max(label.boundingBox.height, value.boundingBox.height) * 0.8) return null;
  const horizontalDistance = Math.abs(labelCenter.x - valueCenter.x);
  return 220 - verticalDistance * 120 - horizontalDistance * 90;
};

const findGeometryValueNearLabel = (
  lines: NativeIdentityDocumentGeometryTextLine[],
  label: NativeIdentityDocumentGeometryTextLine,
  options: {
    excludedLines?: NativeIdentityDocumentGeometryTextLine[];
    isValue: (line: NativeIdentityDocumentGeometryTextLine) => boolean;
  },
) => {
  return findGeometryValueCandidatesNearLabel(lines, label, options)[0]?.line ?? null;
};

const findGeometryValueCandidatesNearLabel = (
  lines: NativeIdentityDocumentGeometryTextLine[],
  label: NativeIdentityDocumentGeometryTextLine,
  options: {
    excludedLines?: NativeIdentityDocumentGeometryTextLine[];
    isValue: (line: NativeIdentityDocumentGeometryTextLine) => boolean;
    limit?: number;
  },
) => {
  return lines
    .filter((line) => line !== label)
    .filter((line) => !(options.excludedLines ?? []).includes(line))
    .filter((line) => line.sourceLabel === label.sourceLabel)
    .filter((line) => line.boundingBox)
    .filter((line) => !isPassportFieldBoundaryLine(line.text))
    .filter(options.isValue)
    .map((line) => {
      const sameRowScore = getSameRowScore(label, line);
      const sameColumnScore = getSameColumnScore(label, line);
      const score = Math.max(sameRowScore ?? Number.NEGATIVE_INFINITY, sameColumnScore ?? Number.NEGATIVE_INFINITY);
      return Number.isFinite(score) ? { line, score } : null;
    })
    .filter((candidate): candidate is { line: NativeIdentityDocumentGeometryTextLine; score: number } => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit ?? 6);
};

const findPassportVizGeometryValuesNearLabel = (
  lines: NativeIdentityDocumentGeometryTextLine[],
  label: NativeIdentityDocumentGeometryTextLine,
  labelPattern: RegExp,
  excludedLines: NativeIdentityDocumentGeometryTextLine[] = [],
) => {
  const sameLineValue = normalizePassportVizFieldValue(label.text, labelPattern);
  const values = new Set<string>();
  if (sameLineValue) values.add(sameLineValue);
  findGeometryValueCandidatesNearLabel(lines, label, {
    excludedLines,
    limit: 8,
    isValue: (line) => Boolean(getPassportVizNameValue(line.text)),
  }).forEach(({ line }) => {
    const value = getPassportVizNameValue(line.text);
    if (value) values.add(value);
  });
  return [...values];
};

const getPassportVizGeometryFieldNameCandidates = (lines: NativeIdentityDocumentGeometryTextLine[]) => {
  const candidates: string[] = [];
  const grouped = new Map<string, NativeIdentityDocumentGeometryTextLine[]>();
  lines
    .filter((line) => line.boundingBox)
    .forEach((line) => {
      const current = grouped.get(line.sourceLabel) ?? [];
      current.push(line);
      grouped.set(line.sourceLabel, current);
    });

  grouped.forEach((group) => {
    const surnameLabels = group.filter((line) => PASSPORT_SURNAME_LABEL_PATTERN.test(line.text));
    const givenLabels = group.filter((line) => PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line.text));
    for (const surnameLabel of surnameLabels) {
      const surnames = findPassportVizGeometryValuesNearLabel(group, surnameLabel, PASSPORT_SURNAME_LABEL_PATTERN);
      if (!surnames.length) continue;
      for (const givenLabel of givenLabels) {
        for (const surname of surnames) {
          const surnameValueLines = group.filter((line) => getPassportVizNameValue(line.text) === surname);
          const givenNames = findPassportVizGeometryValuesNearLabel(group, givenLabel, PASSPORT_GIVEN_NAME_LABEL_PATTERN, surnameValueLines);
          for (const given of givenNames) {
            candidates.push(`${surname} ${given}`);
          }
        }
      }
    }
  });
  return [...new Set(candidates)];
};

const getPassportVizGeometryCombinedNameCandidates = (
  lines: NativeIdentityDocumentGeometryTextLine[],
  mrzTokens: string[],
) => {
  const candidates: string[] = [];
  const grouped = new Map<string, NativeIdentityDocumentGeometryTextLine[]>();
  lines
    .filter((line) => line.boundingBox)
    .forEach((line) => {
      const current = grouped.get(line.sourceLabel) ?? [];
      current.push(line);
      grouped.set(line.sourceLabel, current);
    });

  grouped.forEach((group) => {
    const labelLines = group.filter((line) => (
      PASSPORT_SURNAME_LABEL_PATTERN.test(line.text) ||
      PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line.text)
    ));
    const hasSurnameLabel = labelLines.some((line) => PASSPORT_SURNAME_LABEL_PATTERN.test(line.text));
    const hasGivenLabel = labelLines.some((line) => PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line.text));
    if (!hasSurnameLabel || !hasGivenLabel || !labelLines.length) return;
    const minLabelY = Math.min(...labelLines.map((line) => line.boundingBox?.y ?? 0));
    const maxLabelY = Math.max(...labelLines.map((line) => (line.boundingBox?.y ?? 0) + (line.boundingBox?.height ?? 0)));
    const maxLabelHeight = Math.max(...labelLines.map((line) => line.boundingBox?.height ?? 0), 0.01);
    const labelLeft = Math.min(...labelLines.map((line) => line.boundingBox?.x ?? 0));
    const labelRight = Math.max(...labelLines.map((line) => (line.boundingBox?.x ?? 0) + (line.boundingBox?.width ?? 0)));
    group
      .filter((line) => !labelLines.includes(line))
      .filter((line) => line.boundingBox)
      .filter((line) => !isPassportFieldBoundaryLine(line.text))
      .filter((line) => Boolean(getPassportVizNameValue(line.text)))
      .forEach((line) => {
        const box = line.boundingBox;
        if (!box) return;
        const lineCenterX = box.x + box.width / 2;
        const lineCenterY = box.y + box.height / 2;
        const belowLabels = lineCenterY > maxLabelY && lineCenterY - maxLabelY <= maxLabelHeight * 8;
        const aboveLabels = lineCenterY < minLabelY && minLabelY - lineCenterY <= maxLabelHeight * 8;
        const sameRowAfterLabels = lineCenterY >= minLabelY - maxLabelHeight && lineCenterY <= maxLabelY + maxLabelHeight;
        const horizontallyNearLabels = lineCenterX >= labelLeft - maxLabelHeight * 4 && lineCenterX <= labelRight + maxLabelHeight * 16;
        if (!(aboveLabels || belowLabels || sameRowAfterLabels) || !horizontallyNearLabels) return;
        const tokens = getPassportDisplayNameTokens(line.text)
          .filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
        if (tokens.length < 2 || tokens.length > 6) return;
        candidates.push(tokens.join(" "));
      });
  });
  return candidates;
};

const buildPassportNameFromSharedSignals = (mrzTokens: string[], candidateTokens: string[]) => {
  if (!mrzTokens.length || !candidateTokens.length) return null;
  if (candidateTokens.length < 2 || candidateTokens.length > 6) return null;
  if (candidateTokens.some((token) => token.length <= 1)) return null;
  if (hasIsoAlpha3DocumentToken(candidateTokens)) return null;

  const output: string[] = [];
  let cursor = 0;
  for (let mrzIndex = 0; mrzIndex < mrzTokens.length; mrzIndex += 1) {
    const mrzToken = mrzTokens[mrzIndex] ?? "";
    if (!mrzToken) return null;

    if (mrzToken.length > 1) {
      const foundAt = candidateTokens.indexOf(mrzToken, cursor);
      if (foundAt < 0) return null;
      output.push(mrzToken);
      cursor = foundAt + 1;
      continue;
    }

    const nextStrongToken = mrzTokens.slice(mrzIndex + 1).find((token) => token.length > 1) ?? "";
    const nextStrongIndex = nextStrongToken ? candidateTokens.indexOf(nextStrongToken, cursor) : candidateTokens.length;
    if (nextStrongIndex < cursor) return null;
    const segment = candidateTokens.slice(cursor, nextStrongIndex);
    const matches = segment
      .map((token, index) => ({ index: cursor + index, token }))
      .filter(({ token }) => token.length > 1 && token.startsWith(mrzToken));
    if (matches.length !== 1) return null;
    output.push(matches[0]?.token ?? "");
    cursor = (matches[0]?.index ?? cursor) + 1;
  }

  return output.length >= 2 && output.every(Boolean) ? output : null;
};

const getPassportGeometryNameRejectReason = (tokens: string[], mrzTokens: string[]) => {
  const mrzSurname = mrzTokens[0] ?? "";
  if (tokens[0] !== mrzSurname) return "no_surname_match" as const;
  if (tokens.length < 2 || tokens.length > 6) return "token_count_mismatch" as const;
  if (tokens.some((token) => token.length <= 1)) return "weak_token" as const;
  if (hasIsoAlpha3DocumentToken(tokens)) return "country_token" as const;
  if (mrzTokens.length === 1) return null;
  return buildPassportNameFromSharedSignals(mrzTokens, tokens) ? null : "alignment_failed" as const;
};

const isPassportGeometryNameMatch = (
  tokens: string[],
  mrzTokens: string[],
  source: "combined_geometry_row" | "field_pair",
) => {
  if (!tokens.length) return false;
  return !getPassportGeometryNameRejectReason(tokens, mrzTokens);
};

export const getPassportGeometryNameDiagnostics = (
  mrzLegalName: string,
  textLines: NativeIdentityDocumentGeometryTextLine[],
): NativePassportGeometryNameDiagnostic => {
  const grouped = new Map<string, NativeIdentityDocumentGeometryTextLine[]>();
  textLines
    .filter((line) => line.boundingBox)
    .forEach((line) => {
      const current = grouped.get(line.sourceLabel) ?? [];
      current.push(line);
      grouped.set(line.sourceLabel, current);
    });
  const mrzTokens = getPassportDisplayNameTokens(mrzLegalName);
  const fieldCandidates = getPassportVizGeometryFieldNameCandidates(textLines);
  const combinedCandidates = getPassportVizGeometryCombinedNameCandidates(textLines, mrzTokens);
  const rejectedSamples: NativePassportGeometryNameDiagnostic["rejectedSamples"] = [];
  const pushRejected = (value: string, source: "combined_geometry_row" | "field_pair") => {
    if (rejectedSamples.length >= 8) return;
    const tokens = getPassportDisplayNameTokens(value);
    const reason = getPassportGeometryNameRejectReason(tokens, mrzTokens);
    if (!reason) return;
    rejectedSamples.push({
      reason,
      source,
      tokenCount: tokens.length,
      tokenLengths: tokens.map((token) => token.length),
    });
  };
  fieldCandidates.forEach((value) => pushRejected(value, "field_pair"));
  combinedCandidates.forEach((value) => pushRejected(value, "combined_geometry_row"));
  let surname = 0;
  let given = 0;
  let combinedSurnameGiven = 0;
  let valueLineCount = 0;
  grouped.forEach((group) => {
    group.forEach((line) => {
      const hasSurname = PASSPORT_SURNAME_LABEL_PATTERN.test(line.text);
      const hasGiven = PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line.text);
      if (hasSurname) surname += 1;
      if (hasGiven) given += 1;
      if (hasSurname && hasGiven) combinedSurnameGiven += 1;
      const value = getPassportVizNameValue(line.text);
      if (value) {
        valueLineCount += 1;
        if (group.some((candidate) => PASSPORT_SURNAME_LABEL_PATTERN.test(candidate.text)) && group.some((candidate) => PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(candidate.text))) {
          pushRejected(value, "combined_geometry_row");
        }
      }
    });
  });
  return {
    acceptedCandidateCount: [...fieldCandidates, ...combinedCandidates]
      .map((value, index) => ({
        source: index < fieldCandidates.length ? "field_pair" as const : "combined_geometry_row" as const,
        tokens: getPassportDisplayNameTokens(value),
      }))
      .filter(({ source, tokens }) => isPassportGeometryNameMatch(tokens, mrzTokens, source)).length,
    groupCount: grouped.size,
    hasWeakMrzName: passportNameNeedsOcrRepair(mrzLegalName),
    labelCounts: { combinedSurnameGiven, given, surname },
    mrzTokenCount: mrzTokens.length,
    rejectedSamples,
    valueLineCount,
  };
};

export const resolvePassportLegalNameFromGeometryOcr = (
  mrzLegalName: string,
  textLines: NativeIdentityDocumentGeometryTextLine[],
) => {
  if (!passportNameNeedsOcrRepair(mrzLegalName)) {
    return {
      legalName: mrzLegalName,
      repaired: false,
      repairSource: "mrz_strong" as const,
      attempted: false,
      candidateCount: 0,
      sourceTokenCount: getPassportDisplayNameTokens(mrzLegalName).length,
    };
  }

  const mrzTokens = getPassportDisplayNameTokens(mrzLegalName);
  const mrzSurname = mrzTokens[0] ?? "";
  const candidates = [
    ...getPassportVizGeometryFieldNameCandidates(textLines).map((line) => ({ line, source: "field_pair" as const })),
    ...getPassportVizGeometryCombinedNameCandidates(textLines, mrzTokens).map((line) => ({ line, source: "combined_geometry_row" as const })),
  ]
    .map((candidate) => ({ source: candidate.source, tokens: getPassportDisplayNameTokens(candidate.line) }))
    .filter(({ tokens }) => tokens[0] === mrzSurname)
    .filter(({ tokens }) => tokens.length >= 2 && tokens.length <= 6 && tokens.every((token) => token.length > 1))
    .filter(({ tokens }) => !hasIsoAlpha3DocumentToken(tokens))
    .map(({ tokens }) => {
      if (mrzTokens.length === 1) return tokens;
      return buildPassportNameFromSharedSignals(mrzTokens, tokens);
    })
    .filter((tokens): tokens is string[] => Boolean(tokens));
  candidates.sort((left, right) => {
    const lengthDelta = right.length - left.length;
    if (lengthDelta !== 0) return lengthDelta;
    return right.join("").length - left.join("").length;
  });
  const best = candidates[0] ?? null;
  return {
    legalName: best ? titleCasePassportName(best) : mrzLegalName,
    repaired: Boolean(best),
    repairSource: best ? "ocr_geometry_label_fields" as const : "unrepaired_weak_mrz" as const,
    attempted: true,
    candidateCount: candidates.length,
    sourceTokenCount: mrzTokens.length,
  };
};

export const findIdentityDocumentGenderFromGeometryOcr = (textLines: NativeIdentityDocumentGeometryTextLine[]) => {
  const grouped = new Map<string, NativeIdentityDocumentGeometryTextLine[]>();
  textLines
    .filter((line) => line.boundingBox)
    .forEach((line) => {
      const current = grouped.get(line.sourceLabel) ?? [];
      current.push(line);
      grouped.set(line.sourceLabel, current);
    });
  for (const group of grouped.values()) {
    const labels = group.filter((line) => /(?:\b(sex|gender)\b|性別|性别)/i.test(line.text));
    for (const label of labels) {
      const sameLineMatch = /(?:\b(?:sex|gender)\b|性別|性别)\s*[:：-]?\s*(m|f|x|male|female|man|woman|unspecified|others?|男|女)/i.exec(label.text);
      const sameLineGender = sameLineMatch ? normalizeIdentityDocumentGender(sameLineMatch[1] ?? "") : null;
      if (sameLineGender) return sameLineGender;
      const valueLine = findGeometryValueNearLabel(group, label, {
        isValue: (line) => Boolean(normalizeIdentityDocumentGender(line.text)),
      });
      const gender = valueLine ? normalizeIdentityDocumentGender(valueLine.text) : null;
      if (gender) return gender;
    }
    const standaloneGender = findUniqueStandaloneIdentityDocumentSexMarker(group.map((line) => line.text));
    if (standaloneGender) return standaloneGender;
  }
  return null;
};

const findPassportVizFieldValueNearLabel = (lines: string[], labelIndex: number, labelPattern: RegExp) => {
  const sameLineValue = normalizePassportVizFieldValue(lines[labelIndex] ?? "", labelPattern);
  if (sameLineValue) return sameLineValue;
  for (let index = labelIndex + 1; index < Math.min(lines.length, labelIndex + 4); index += 1) {
    const line = lines[index] ?? "";
    if (isPassportFieldBoundaryLine(line)) break;
    const tokens = getPassportDisplayNameTokens(line).filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
    if (!tokens.length || tokens.length > 4) continue;
    if (tokens.some((token) => token.length === 1)) continue;
    if (tokens.every((token) => PASSPORT_NON_NAME_FIELD_VALUE_PATTERN.test(token))) continue;
    return tokens.join(" ");
  }
  return "";
};

export const findIdentityDocumentGenderFromOcr = (lines: string[]) => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const sameLineMatch = /(?:\b(?:sex|gender)\b|性別|性别)\s*[:：-]?\s*(m|f|x|male|female|man|woman|unspecified|others?|男|女)|(?:m|f|x|male|female|man|woman|unspecified|others?|男|女)\s*[:：-]?\s*(?:\b(?:sex|gender)\b|性別|性别)/i.exec(line);
    const sameLineGender = sameLineMatch ? normalizeIdentityDocumentGender(sameLineMatch[1] ?? sameLineMatch[2] ?? "") : null;
    if (sameLineGender) return sameLineGender;
    if (!/(?:\b(sex|gender)\b|性別|性别)/i.test(line)) continue;
    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 6); nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? "";
      const nextGender = normalizeIdentityDocumentGender(nextLine);
      if (nextGender) return nextGender;
      if (PASSPORT_FIELD_BOUNDARY_PATTERN.test(nextLine) && !/(?:\b(sex|gender)\b|性別|性别)/i.test(nextLine)) break;
    }
  }
  return findUniqueStandaloneIdentityDocumentSexMarker(lines);
};

const getPassportVizFieldNameCandidates = (lines: string[]) => {
  const candidates: string[] = [];
  const surnames: Array<{ index: number; value: string }> = [];
  const givenNames: Array<{ index: number; value: string }> = [];
  lines.forEach((line, index) => {
    if (PASSPORT_SURNAME_LABEL_PATTERN.test(line)) {
      const value = findPassportVizFieldValueNearLabel(lines, index, PASSPORT_SURNAME_LABEL_PATTERN);
      if (value) surnames.push({ index, value });
    }
    if (PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line)) {
      const value = findPassportVizFieldValueNearLabel(lines, index, PASSPORT_GIVEN_NAME_LABEL_PATTERN);
      if (value) givenNames.push({ index, value });
    }
  });
  for (const surname of surnames) {
    for (const given of givenNames) {
      if (Math.abs(given.index - surname.index) > 8) continue;
      candidates.push(`${surname.value} ${given.value}`);
    }
  }
  return candidates;
};

const getPassportVizFieldNameRepair = (lines: string[], mrzTokens: string[]) => {
  const candidates = getPassportVizFieldNameCandidates(lines)
    .map((line) => getPassportDisplayNameTokens(line))
    .map((tokens) => buildPassportNameFromSharedSignals(mrzTokens, tokens))
    .filter((tokens): tokens is string[] => Boolean(tokens));
  candidates.sort((left, right) => {
    const lengthDelta = right.length - left.length;
    if (lengthDelta !== 0) return lengthDelta;
    return right.join("").length - left.join("").length;
  });
  return candidates[0] ?? null;
};

const getPassportVizFieldNameCandidateCount = (lines: string[]) => getPassportVizFieldNameCandidates(lines).length;

const hasPassportVizFieldNameToken = (lines: string[], token: string) => {
  const normalizedToken = normalizePassportNameToken(token);
  return getPassportVizFieldNameCandidates(lines)
    .some((line) => getPassportDisplayNameTokens(line).includes(normalizedToken));
};

const getPassportVizStandaloneNameCandidates = (lines: string[], surname: string) => {
  const candidates: string[] = [];
  for (const line of lines) {
    if (PASSPORT_SURNAME_LABEL_PATTERN.test(line) || PASSPORT_GIVEN_NAME_LABEL_PATTERN.test(line)) continue;
    const tokens = getPassportDisplayNameTokens(line).filter((token) => !PASSPORT_VIZ_NAME_LABEL_TOKENS.has(token));
    if (tokens.length < 2 || tokens.length > 5) continue;
    if (tokens[0] !== surname) continue;
    if (tokens.some((token) => token.length === 1)) continue;
    candidates.push(tokens.join(" "));
  }
  return candidates;
};

const hasOrderedPassportTokens = (candidateTokens: string[], orderedTokens: string[]) => {
  let searchFrom = 0;
  for (const token of orderedTokens) {
    const foundAt = candidateTokens.indexOf(token, searchFrom);
    if (foundAt < 0) return false;
    searchFrom = foundAt + 1;
  }
  return true;
};

const buildAlignedPassportNameRepair = (mrzTokens: string[], candidateTokens: string[]) => {
  if (!mrzTokens.length || candidateTokens[0] !== mrzTokens[0]) return null;
  if (mrzTokens.length < 2) return candidateTokens;
  const repaired: string[] = [];
  let candidateIndex = 0;
  for (let mrzIndex = 0; mrzIndex < mrzTokens.length; mrzIndex += 1) {
    const mrzToken = mrzTokens[mrzIndex] ?? "";
    if (mrzToken.length > 1) {
      const foundAt = candidateTokens.indexOf(mrzToken, candidateIndex);
      if (foundAt < 0) return null;
      repaired.push(mrzToken);
      candidateIndex = foundAt + 1;
      continue;
    }

    const nextStrongToken = mrzTokens.slice(mrzIndex + 1).find((token) => token.length > 1) ?? "";
    const searchEnd = nextStrongToken ? candidateTokens.indexOf(nextStrongToken, candidateIndex) : candidateTokens.length;
    if (searchEnd < candidateIndex) return null;
    const replacement = candidateTokens
      .slice(candidateIndex, searchEnd)
      .filter((token) => token.length > 1 && token.startsWith(mrzToken))
      .sort((left, right) => right.length - left.length)[0];
    if (!replacement) return null;
    repaired.push(replacement);
    candidateIndex = candidateTokens.indexOf(replacement, candidateIndex) + 1;
  }
  return repaired;
};

const buildStrictPassportNameRepair = (mrzTokens: string[], candidateTokens: string[]) => {
  if (!mrzTokens.length || candidateTokens[0] !== mrzTokens[0]) return null;
  if (mrzTokens.length === 1) return candidateTokens.length >= 2 ? candidateTokens : null;
  const repaired: string[] = [];
  let candidateIndex = 0;
  for (let mrzIndex = 0; mrzIndex < mrzTokens.length; mrzIndex += 1) {
    const mrzToken = mrzTokens[mrzIndex] ?? "";
    if (mrzToken.length > 1) {
      if (candidateTokens[candidateIndex] !== mrzToken) return null;
      repaired.push(mrzToken);
      candidateIndex += 1;
      continue;
    }
    const nextStrongToken = mrzTokens.slice(mrzIndex + 1).find((token) => token.length > 1) ?? "";
    const searchEnd = nextStrongToken ? candidateTokens.indexOf(nextStrongToken, candidateIndex) : candidateTokens.length;
    if (searchEnd < candidateIndex) return null;
    const replacementSegment = candidateTokens.slice(candidateIndex, searchEnd);
    if (replacementSegment.length !== 1) return null;
    const replacement = replacementSegment[0] ?? "";
    if (replacement.length <= 1 || !replacement.startsWith(mrzToken)) return null;
    repaired.push(replacement);
    candidateIndex = searchEnd;
  }
  if (candidateIndex !== candidateTokens.length) return null;
  return repaired;
};

export const resolvePassportLegalNameFromOcr = (mrzLegalName: string, lines: string[]) => {
  if (!passportNameNeedsOcrRepair(mrzLegalName)) {
    return {
      legalName: mrzLegalName,
      repaired: false,
      repairSource: "mrz_strong" as const,
      attempted: false,
      candidateCount: 0,
      sourceTokenCount: getPassportDisplayNameTokens(mrzLegalName).length,
    };
  }

  const mrzTokens = getPassportDisplayNameTokens(mrzLegalName);
  const fieldCandidateCount = getPassportVizFieldNameCandidateCount(lines);
  if (mrzTokens.some((token) => token.length === 1)) {
    const fieldRepair = getPassportVizFieldNameRepair(lines, mrzTokens);
    if (fieldRepair) {
      return {
        legalName: titleCasePassportName(fieldRepair),
        repaired: true,
        repairSource: "ocr_label_fields" as const,
        attempted: true,
        candidateCount: fieldCandidateCount,
        sourceTokenCount: mrzTokens.length,
      };
    }
    return {
      legalName: mrzLegalName,
      repaired: false,
      repairSource: "unrepaired_weak_mrz" as const,
      attempted: true,
      candidateCount: fieldCandidateCount,
      sourceTokenCount: mrzTokens.length,
    };
  }
  const surname = mrzTokens[0] ?? "";
  if (!surname) {
    return {
      legalName: mrzLegalName,
      repaired: false,
      repairSource: "unrepaired_weak_mrz" as const,
      attempted: true,
      candidateCount: 0,
      sourceTokenCount: mrzTokens.length,
    };
  }

  const orderedStrongMrzTokens = mrzTokens.filter((token) => token.length >= 2);
  const repairs: Array<{ legalName: string; score: number; source: NativePassportNameRepairSource }> = [];
  const candidateLines: PassportVizNameCandidate[] = [
    ...getPassportVizFieldNameCandidates(lines).map((line) => ({ line, source: "ocr_label_fields" as const, strict: true })),
    ...getPassportVizStandaloneNameCandidates(lines, surname)
      .filter((line) => orderedStrongMrzTokens.every((token) => hasPassportVizFieldNameToken(lines, token) || getPassportDisplayNameTokens(line).includes(token)))
      .map((line) => ({ line, source: "ocr_surname_first" as const, strict: false })),
  ];
  for (const { line, source, strict } of candidateLines) {
    const candidateTokens = normalizePassportVizNameCandidate(line, surname);
    if (candidateTokens.length < Math.max(2, orderedStrongMrzTokens.length)) continue;
    if (candidateTokens[0] !== surname) continue;
    if (candidateTokens.some((token) => token.length === 1)) continue;
    if (candidateTokens.length > 5) continue;
    if (!hasOrderedPassportTokens(candidateTokens, orderedStrongMrzTokens)) continue;
    const repairedTokens = strict
      ? buildStrictPassportNameRepair(mrzTokens, candidateTokens)
      : buildAlignedPassportNameRepair(mrzTokens, candidateTokens);
    if (!repairedTokens) continue;
    const extraTokenCount = Math.max(0, candidateTokens.length - repairedTokens.length);
    const score = orderedStrongMrzTokens.length * 45 + repairedTokens.join("").length - extraTokenCount * 60;
    repairs.push({ legalName: titleCasePassportName(repairedTokens), score, source });
  }

  repairs.sort((left, right) => right.score - left.score);
  const best = repairs[0] ?? null;
  return {
    legalName: best?.legalName ?? mrzLegalName,
    repaired: Boolean(best?.legalName),
    repairSource: best?.source ?? "unrepaired_weak_mrz" as const,
    attempted: true,
    candidateCount: candidateLines.length,
    sourceTokenCount: mrzTokens.length,
  };
};

const getMrzNameTokens = (value: string) => {
  const [surname = "", givenNames = ""] = value.split("<<");
  return [...surname.split("<"), ...givenNames.split("<")]
    .map((part) => part.trim())
    .filter(Boolean);
};

const scoreMrzNameField = (firstLine: string) => {
  const nameField = firstLine.slice(5, 44);
  const tokens = getMrzNameTokens(nameField);
  const letterCount = tokens.reduce((sum, token) => sum + token.replace(/[^A-Z]/g, "").length, 0);
  const singleLetterPenalty = tokens.filter((token) => token.length === 1).length * 240;
  const strongNameScore = tokens.length >= 2 && tokens.every((token) => token.length > 1) ? 260 : 0;
  const separatorScore = nameField.includes("<<") ? 40 : 0;
  const fillerPaddingPenalty = Math.max(0, 8 - tokens.length) + Math.max(0, nameField.length - nameField.replace(/<+$/g, "").length - 8);
  return strongNameScore + separatorScore + letterCount * 4 - singleLetterPenalty - fillerPaddingPenalty;
};

type PassportMrzSpan = {
  end: number;
  lineCount: number;
  sourceLabels: string[];
  start: number;
  text: string;
};

type PassportMrzCandidate = {
  first: string;
  firstStart: number;
  firstEnd: number;
  firstRawLength: number;
  score: number;
  second: string;
  secondStart: number;
  secondEnd: number;
  secondRawLength: number;
};

type PassportMrzLineInput = {
  sourceLabel?: string;
  text: string;
};

const normalizePassportMrzLineInputs = (lines: Array<string | PassportMrzLineInput>) => lines
  .map((line) => typeof line === "string" ? { text: line } : line)
  .map((line) => ({
    sourceLabel: line.sourceLabel,
    text: repairMrzCandidate(line.text).trim(),
  }))
  .filter((line) => line.text.length >= 8);

const buildPassportMrzSpans = (lines: Array<string | PassportMrzLineInput>) => {
  const normalized = normalizePassportMrzLineInputs(lines);
  const spans: PassportMrzSpan[] = [];
  for (let start = 0; start < normalized.length; start += 1) {
    let text = "";
    const sourceLabels = new Set<string>();
    for (let end = start; end < normalized.length && end < start + 3; end += 1) {
      const next = normalized[end];
      if (!next) continue;
      text += next.text;
      if (next.sourceLabel) sourceLabels.add(next.sourceLabel);
      if (text.length < 8) continue;
      spans.push({
        end,
        lineCount: end - start + 1,
        sourceLabels: [...sourceLabels],
        start,
        text,
      });
    }
  }
  return spans;
};

const scorePassportMrzCandidate = (candidate: PassportMrzCandidate) => {
  const firstLengthScore = Math.max(0, 88 - Math.abs(candidate.firstRawLength - 44) * 4);
  const secondLengthScore = Math.max(0, 88 - Math.abs(candidate.secondRawLength - 44) * 4);
  const firstPaddingPenalty = Math.max(0, 44 - candidate.firstRawLength) * 10;
  const secondPaddingPenalty = Math.max(0, 44 - candidate.secondRawLength) * 6;
  const firstStructureScore = candidate.first.startsWith("P<") ? 160 : candidate.first.startsWith("P") ? 70 : 0;
  const secondStructureScore = /[0-9]/.test(candidate.second) ? 40 : 0;
  const nameScore = scoreMrzNameField(candidate.first);
  const fragmentPenalty = (candidate.firstEnd - candidate.firstStart + 1 - 1 + candidate.secondEnd - candidate.secondStart + 1 - 1) * 8;
  const gapPenalty = Math.max(0, candidate.secondStart - candidate.firstEnd - 1) * 12;
  return candidate.score + firstLengthScore + secondLengthScore + firstStructureScore + secondStructureScore + nameScore - firstPaddingPenalty - secondPaddingPenalty - fragmentPenalty - gapPenalty;
};

const findPassportMrzLines = (lines: string[]) => {
  const spans = buildPassportMrzSpans(lines);
  let bestCandidate: PassportMrzCandidate | null = null;

  for (let firstIndex = 0; firstIndex < spans.length; firstIndex += 1) {
    const firstSpan = spans[firstIndex];
    const repairedFirst = repairPassportLineStart(firstSpan.text);
    const firstCandidate = repairedFirst.padEnd(44, "<").slice(0, 44);
    if (!firstCandidate.startsWith("P<")) continue;

    for (let secondIndex = firstIndex + 1; secondIndex < spans.length; secondIndex += 1) {
      const secondSpan = spans[secondIndex];
      const gap = secondSpan.start - firstSpan.end - 1;
      if (gap > 3) break;
      if (gap < 0) continue;

      for (const repairedSecond of getSecondLineRepairCandidates(secondSpan.text)) {
        const documentNumber = repairedSecond.slice(0, 9);
        const documentNumberCheck = repairedSecond.slice(9, 10);
        const dob = repairedSecond.slice(13, 19);
        const dobCheck = repairedSecond.slice(19, 20);
        const expiryDate = repairedSecond.slice(21, 27);
        const expiryDateCheck = repairedSecond.slice(27, 28);
        const personalNumber = repairedSecond.slice(28, 42);
        const personalNumberCheck = repairedSecond.slice(42, 43);
        const compositeCheck = repairedSecond.slice(43, 44);
        const compositeValue = `${documentNumber}${documentNumberCheck}${dob}${dobCheck}${expiryDate}${expiryDateCheck}${personalNumber}${personalNumberCheck}`;
        const checksValid =
          hasValidChecksum(documentNumber, documentNumberCheck) &&
          hasValidChecksum(dob, dobCheck) &&
          hasValidChecksum(expiryDate, expiryDateCheck) &&
          hasValidChecksum(personalNumber, personalNumberCheck) &&
          hasValidChecksum(compositeValue, compositeCheck);
        const candidate = {
          first: firstCandidate,
          firstEnd: firstSpan.end,
          firstRawLength: repairedFirst.length,
          firstStart: firstSpan.start,
          score: checksValid ? 1000 : 0,
          second: repairedSecond,
          secondEnd: secondSpan.end,
          secondRawLength: repairMrzCandidate(secondSpan.text).length,
          secondStart: secondSpan.start,
        };
        if (checksValid) {
          const scoredCandidate = scorePassportMrzCandidate(candidate);
          if (!bestCandidate || scoredCandidate > scorePassportMrzCandidate(bestCandidate)) {
            bestCandidate = candidate;
          }
        } else if (!bestCandidate) {
          const scoredCandidate = scorePassportMrzCandidate(candidate);
          if (!bestCandidate || scoredCandidate > scorePassportMrzCandidate(bestCandidate)) {
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  if (bestCandidate && bestCandidate.score >= 1000) {
    return [bestCandidate.first, bestCandidate.second] as const;
  }

  const merged = spans.map((span) => span.text).join("");
  const mergedStart = merged.indexOf("P<");
  if (mergedStart >= 0 && merged.length >= mergedStart + 80) {
    const first = merged.slice(mergedStart, mergedStart + 44);
    const second = merged.slice(mergedStart + 44, mergedStart + 88);
    return [first.padEnd(44, "<").slice(0, 44), second.padEnd(44, "<").slice(0, 44)] as const;
  }

  return null;
};

const scoreBucket = (score: number) => Math.round(score / 100) * 100;

export const getPassportMrzCandidateDiagnostics = (
  lines: Array<string | PassportMrzLineInput>,
  limit = 8,
): NativePassportMrzCandidateDiagnostic[] => {
  const spans = buildPassportMrzSpans(lines);
  const diagnostics: NativePassportMrzCandidateDiagnostic[] = [];
  for (let firstIndex = 0; firstIndex < spans.length; firstIndex += 1) {
    const firstSpan = spans[firstIndex];
    const repairedFirst = repairPassportLineStart(firstSpan.text);
    const firstCandidate = repairedFirst.padEnd(44, "<").slice(0, 44);
    if (!firstCandidate.startsWith("P<")) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < spans.length; secondIndex += 1) {
      const secondSpan = spans[secondIndex];
      const gap = secondSpan.start - firstSpan.end - 1;
      if (gap > 3) break;
      if (gap < 0) continue;
      for (const repairedSecond of getSecondLineRepairCandidates(secondSpan.text)) {
        const checksum = summarizePassportMrzSecondLineChecks(repairedSecond);
        const candidate: PassportMrzCandidate = {
          first: firstCandidate,
          firstEnd: firstSpan.end,
          firstRawLength: repairedFirst.length,
          firstStart: firstSpan.start,
          score: Object.values(checksum).every(Boolean) ? 1000 : 0,
          second: repairedSecond,
          secondEnd: secondSpan.end,
          secondRawLength: repairMrzCandidate(secondSpan.text).length,
          secondStart: secondSpan.start,
        };
        diagnostics.push({
          checksum,
          firstLen: repairedFirst.length,
          firstSourceLabels: firstSpan.sourceLabels,
          firstSpanCount: firstSpan.lineCount,
          firstStartsPassport: firstCandidate.startsWith("P<"),
          hasTwoAdjacentStructuredLines: gap === 0 && firstSpan.lineCount === 1 && secondSpan.lineCount === 1,
          secondLen: repairMrzCandidate(secondSpan.text).length,
          secondSourceLabels: secondSpan.sourceLabels,
          secondSpanCount: secondSpan.lineCount,
          scoreBucket: scoreBucket(scorePassportMrzCandidate(candidate)),
        });
      }
    }
  }
  return diagnostics
    .sort((left, right) => right.scoreBucket - left.scoreBucket)
    .slice(0, limit);
};

export const parsePassportMrz = (lines: string[]): NativePassportMrzParseResult => {
  const mrz = findPassportMrzLines(lines);
  if (!mrz) return { ok: false, reason: "mrz_not_found" };

  const [first, rawSecond] = mrz;
  for (const second of getSecondLineRepairCandidates(rawSecond)) {
    const documentNumber = second.slice(0, 9);
    const documentNumberCheck = second.slice(9, 10);
    const dob = second.slice(13, 19);
    const dobCheck = second.slice(19, 20);
    const expiryDate = second.slice(21, 27);
    const expiryDateCheck = second.slice(27, 28);
    const personalNumber = second.slice(28, 42);
    const personalNumberCheck = second.slice(42, 43);
    const compositeCheck = second.slice(43, 44);
    const compositeValue = `${documentNumber}${documentNumberCheck}${dob}${dobCheck}${expiryDate}${expiryDateCheck}${personalNumber}${personalNumberCheck}`;

    const checksValid =
      hasValidChecksum(documentNumber, documentNumberCheck) &&
      hasValidChecksum(dob, dobCheck) &&
      hasValidChecksum(expiryDate, expiryDateCheck) &&
      hasValidChecksum(personalNumber, personalNumberCheck) &&
      hasValidChecksum(compositeValue, compositeCheck);

    if (!checksValid) continue;
    const legalName = normalizeMrzName(first.slice(5));
    if (!legalName) return { ok: false, reason: "mrz_invalid_name" };

    return {
      ok: true,
      documentCountry: first.slice(2, 5).replace(/</g, ""),
      dob: normalizeMrzBirthDate(dob),
      documentGender: normalizeMrzGender(second.slice(20, 21)),
      legalName,
      documentNumber: documentNumber.replace(/</g, ""),
      expiryDate: normalizeMrzExpiryDate(expiryDate),
    };
  }

  return { ok: false, reason: "mrz_checksum_failed" };
};
