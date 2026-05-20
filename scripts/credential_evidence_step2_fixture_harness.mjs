const normalizeMatchText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeIdentifier = (value) => String(value || "").replace(/\D/g, "");

const acncCharityStatusIsRegistered = (value) => {
  const normalized = normalizeMatchText(value);
  return normalized === "REGISTERED" || normalized === "REGISTERED CHARITY";
};

const matchAcncFixture = ({ legalName, abn }, records) => {
  const expectedName = normalizeMatchText(legalName);
  const expectedAbn = normalizeIdentifier(abn);
  if (!expectedName || !expectedAbn) return "unable_to_verify";
  if (!Array.isArray(records)) return "unable_to_verify";

  for (const record of records.slice(0, 10)) {
    const nameMatches = normalizeMatchText(record.Charity_Legal_Name) === expectedName;
    const abnMatches = normalizeIdentifier(record.ABN) === expectedAbn;
    if (!nameMatches || !abnMatches) continue;
    return acncCharityStatusIsRegistered(record.Charity_Status)
      ? "organization_matched"
      : "unable_to_verify";
  }
  return "unable_to_verify";
};

const matchIrsFixture = ({ legalName, ein }, records) => {
  const expectedName = normalizeMatchText(legalName);
  const expectedEin = normalizeIdentifier(ein);
  if (!expectedName || !expectedEin) return "unable_to_verify";
  if (!Array.isArray(records)) return "unable_to_verify";

  for (const record of records.slice(0, 5)) {
    const nameMatches = normalizeMatchText(record.organization_name_normalized || record.organization_name) === expectedName;
    const einMatches = normalizeIdentifier(record.EIN || record.ein) === expectedEin;
    if (nameMatches && einMatches && record.active !== false) return "organization_matched";
  }
  return "unable_to_verify";
};

const cases = [
  {
    name: "ACNC exact legal name and ABN matches registered charity",
    expected: "organization_matched",
    actual: matchAcncFixture(
      { legalName: "Huddle Animal Rescue Limited", abn: "12 345 678 901" },
      [{ ABN: "12345678901", Charity_Legal_Name: "HUDDLE ANIMAL RESCUE LIMITED", Charity_Status: "Registered" }],
    ),
  },
  {
    name: "ACNC name mismatch does not match",
    expected: "unable_to_verify",
    actual: matchAcncFixture(
      { legalName: "Huddle Animal Rescue Limited", abn: "12 345 678 901" },
      [{ ABN: "12345678901", Charity_Legal_Name: "Different Rescue Limited", Charity_Status: "Registered" }],
    ),
  },
  {
    name: "ACNC ABN mismatch does not match",
    expected: "unable_to_verify",
    actual: matchAcncFixture(
      { legalName: "Huddle Animal Rescue Limited", abn: "12 345 678 901" },
      [{ ABN: "99999999999", Charity_Legal_Name: "Huddle Animal Rescue Limited", Charity_Status: "Registered" }],
    ),
  },
  {
    name: "ACNC not registered status does not match",
    expected: "unable_to_verify",
    actual: matchAcncFixture(
      { legalName: "Huddle Animal Rescue Limited", abn: "12 345 678 901" },
      [{ ABN: "12345678901", Charity_Legal_Name: "Huddle Animal Rescue Limited", Charity_Status: "Revoked" }],
    ),
  },
  {
    name: "ACNC malformed response does not match",
    expected: "unable_to_verify",
    actual: matchAcncFixture(
      { legalName: "Huddle Animal Rescue Limited", abn: "12 345 678 901" },
      null,
    ),
  },
  {
    name: "IRS EO BMF exact legal name and EIN matches indexed record",
    expected: "organization_matched",
    actual: matchIrsFixture(
      { legalName: "Huddle Rescue Foundation", ein: "12-3456789" },
      [{ EIN: "123456789", organization_name: "HUDDLE RESCUE FOUNDATION", organization_name_normalized: "HUDDLE RESCUE FOUNDATION", active: true }],
    ),
  },
  {
    name: "IRS EO BMF EIN mismatch does not match",
    expected: "unable_to_verify",
    actual: matchIrsFixture(
      { legalName: "Huddle Rescue Foundation", ein: "12-3456789" },
      [{ EIN: "987654321", organization_name: "HUDDLE RESCUE FOUNDATION", organization_name_normalized: "HUDDLE RESCUE FOUNDATION", active: true }],
    ),
  },
  {
    name: "IRS EO BMF name mismatch does not match",
    expected: "unable_to_verify",
    actual: matchIrsFixture(
      { legalName: "Huddle Rescue Foundation", ein: "12-3456789" },
      [{ EIN: "123456789", organization_name: "OTHER RESCUE FOUNDATION", organization_name_normalized: "OTHER RESCUE FOUNDATION", active: true }],
    ),
  },
  {
    name: "IRS EO BMF malformed index response does not match",
    expected: "unable_to_verify",
    actual: matchIrsFixture(
      { legalName: "Huddle Rescue Foundation", ein: "12-3456789" },
      null,
    ),
  },
];

let failed = false;
for (const testCase of cases) {
  const passed = testCase.actual === testCase.expected;
  console.log(`${passed ? "PASS" : "FAIL"} ${testCase.name}`);
  if (!passed) failed = true;
}

if (failed) process.exitCode = 1;
