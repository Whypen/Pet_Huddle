import { describe, expect, it } from "vitest";
import { findIdentityDocumentGenderFromGeometryOcr, findIdentityDocumentGenderFromOcr, getPassportGeometryNameDiagnostics, parsePassportMrz, resolvePassportDocumentCountryFromText, resolvePassportLegalNameFromGeometryOcr, resolvePassportLegalNameFromOcr } from "./nativeIdentityDocumentMrz";

const MRZ_LINE_1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const VALID_MRZ_LINE_2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const INVALID_COMPOSITE_MRZ_LINE_2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<11";

describe("parsePassportMrz", () => {
  it("accepts a valid passport MRZ composite checksum", () => {
    const result = parsePassportMrz([MRZ_LINE_1, VALID_MRZ_LINE_2]);

    expect(result).toMatchObject({
      ok: true,
      documentCountry: "UTO",
      dob: "1974-08-12",
      documentGender: "Woman",
      legalName: "Eriksson Anna Maria",
    });
  });

  it("rejects an invalid passport MRZ composite checksum", () => {
    expect(parsePassportMrz([MRZ_LINE_1, INVALID_COMPOSITE_MRZ_LINE_2])).toEqual({
      ok: false,
      reason: "mrz_checksum_failed",
    });
  });

  it("joins split MRZ OCR fragments before checksum validation", () => {
    const result = parsePassportMrz([
      "P<UTOERIKSSON<<ANNA<MARIA<<<<",
      "<<<<<<<<<<<<<<<",
      "L898902C36UTO7408122F1204159",
      "ZE184226B<<<<<10",
    ]);

    expect(result).toMatchObject({
      ok: true,
      legalName: "Eriksson Anna Maria",
    });
  });

  it("splits a merged 88-character MRZ block before checksum validation", () => {
    const result = parsePassportMrz([`${MRZ_LINE_1}${VALID_MRZ_LINE_2}`]);

    expect(result).toMatchObject({
      ok: true,
      dob: "1974-08-12",
    });
  });

  it("repairs common OCR digit mistakes in checksum-protected fields", () => {
    const result = parsePassportMrz([
      "P0UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
      "L8989O2C36UTO74O8122F12O4159ZE184226B<<<<<1O",
    ]);

    expect(result).toMatchObject({
      ok: true,
      documentNumber: "L898902C3",
      dob: "1974-08-12",
      expiryDate: "2012-04-15",
      legalName: "Eriksson Anna Maria",
    });
  });

  it("treats future MRZ expiry years as this century", () => {
    const result = parsePassportMrz([
      "P<GBRSMITH<<ALICE<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "1234567897GBR9901018F3001019<<<<<<<<<<<<<<02",
    ]);

    expect(result).toMatchObject({
      ok: true,
      dob: "1999-01-01",
      expiryDate: "2030-01-01",
      legalName: "Smith Alice",
    });
  });

  it("repairs a missing passport type filler after P", () => {
    const result = parsePassportMrz([
      "PUTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
      VALID_MRZ_LINE_2,
    ]);

    expect(result).toMatchObject({
      ok: true,
      documentCountry: "UTO",
      legalName: "Eriksson Anna Maria",
    });
  });

  it("rejects a checksum-valid MRZ when the name field is empty", () => {
    const result = parsePassportMrz([
      "P<UTO<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      VALID_MRZ_LINE_2,
    ]);

    expect(result).toEqual({
      ok: false,
      reason: "mrz_invalid_name",
    });
  });

  it("prefers the fuller checksum-valid MRZ name line over a cropped given-name fragment", () => {
    const result = parsePassportMrz([
      "P<CHNCHAN<<T<MAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      VALID_MRZ_LINE_2,
      "P<CHNCHAN<<TAI<MAN<<<<<<<<<<<<<<<<<<<<<<<<<<",
      VALID_MRZ_LINE_2,
    ]);

    expect(result).toMatchObject({
      ok: true,
      documentCountry: "CHN",
      legalName: "Chan Tai Man",
    });
  });

  it("keeps passport extraction MRZ-first by preferring a strong MRZ name over a weak one", () => {
    const result = parsePassportMrz([
      "P<CHNCHAN<<T<MAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "noise before second line",
      VALID_MRZ_LINE_2,
      "P<CHNCHAN<<TAI<MAN<<<<<<<<<<<<<<<<<<<<<<<<<<",
      VALID_MRZ_LINE_2,
    ]);

    expect(result).toMatchObject({
      ok: true,
      legalName: "Chan Tai Man",
    });
  });

  it("resolves HKSAR passport display country from visible passport text when MRZ country is CHN", () => {
    expect(resolvePassportDocumentCountryFromText("CHN", [
      "Hong Kong Special Administrative Region",
      "People's Republic of China",
    ])).toBe("HKG");
  });

  it("repairs a corrupted HKSAR MRZ country from visible passport text", () => {
    expect(resolvePassportDocumentCountryFromText("LAG", [
      "Hong Kong Special Administrative Region",
      "People's Republic of China",
    ])).toBe("HKG");
  });

  it("repairs weak MRZ names only from explicit VIZ surname and given-name fields", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Ti Chan Given Names Tai Man",
      "Surname Chan",
      "Given Names Tai Man",
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_label_fields",
    });
  });

  it("does not repair passport names from unlabeled OCR text", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Ti Chan Given Names Tai Man",
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("does not repair a weak passport MRZ name from a standalone surname-first OCR line", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "CHAN TAI MAN",
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("uses only explicit labeled fields instead of noisy standalone passport names", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Chan Tez Tai Man",
      "Given Names Tai Man",
      "Surname Chan",
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_label_fields",
    });
  });

  it("does not insert unrelated standalone tokens between labeled passport fields", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Chan Hee Tai Man",
      "Surname Chan",
      "Given Names Tai Man",
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_label_fields",
    });
  });

  it("keeps labeled OCR field values as-is without MRZ token expansion", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Surname Chan",
      "Given Names Taik Man",
    ])).toMatchObject({
      legalName: "Chan Taik Man",
      repaired: true,
      repairSource: "ocr_label_fields",
    });
  });

  it("repairs a one-token passport MRZ name only from explicit VIZ surname and given-name fields", () => {
    expect(resolvePassportLegalNameFromOcr("Chan", [
      "Surname",
      "CHAN",
      "Given Names",
      "TAI MAN",
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
    });
  });

  it("keeps a strong passport MRZ name frozen without OCR fallback", () => {
    expect(resolvePassportLegalNameFromOcr("Chan Tai Man", [
      "Surname Chan",
      "Given Names Tez Tai Man",
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: false,
      attempted: false,
    });
  });

  it("does not treat a nearby Sex field as a passport given name", () => {
    expect(resolvePassportLegalNameFromOcr("Chan T Man", [
      "Surname Chan",
      "Given Names",
      "Sex",
      "M",
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("repairs passport name from geometry when labels and values are read in columns", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "Sex", boundingBox: { x: 0.63, y: 0.70, width: 0.06, height: 0.03 } },
      { sourceLabel, text: "Nationality", boundingBox: { x: 0.75, y: 0.70, width: 0.14, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.15, height: 0.03 } },
      { sourceLabel, text: "F", boundingBox: { x: 0.64, y: 0.62, width: 0.02, height: 0.03 } },
      { sourceLabel, text: "CHINESE", boundingBox: { x: 0.75, y: 0.62, width: 0.13, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("uses MRZ line 1 to choose the correct labeled passport values when nearest geometry is wrong", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHINESE", boundingBox: { x: 0.31, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.15, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("does not use geometry Sex or Nationality values as passport name fields", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "Sex", boundingBox: { x: 0.39, y: 0.62, width: 0.05, height: 0.03 } },
      { sourceLabel, text: "M", boundingBox: { x: 0.39, y: 0.56, width: 0.02, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("rejects passport geometry names whose surname does not match the MRZ surname", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHN", boundingBox: { x: 0.18, y: 0.62, width: 0.08, height: 0.03 } },
      { sourceLabel, text: "WE TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.18, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("filters extra passport geometry tokens that are not shared by MRZ line 1", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "WE TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.18, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("filters exact passport geometry field values with extra inserted OCR tokens", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "ME TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.18, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("repairs passport name from one combined value line under Surname and Given Names labels", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname Given Names Sex Nationality", boundingBox: { x: 0.18, y: 0.70, width: 0.58, height: 0.03 } },
      { sourceLabel, text: "CHAN TAI MAN", boundingBox: { x: 0.18, y: 0.62, width: 0.30, height: 0.03 } },
      { sourceLabel, text: "F", boundingBox: { x: 0.64, y: 0.62, width: 0.02, height: 0.03 } },
      { sourceLabel, text: "CHINESE", boundingBox: { x: 0.75, y: 0.62, width: 0.13, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("repairs passport name when the visible label is Given Name(s)", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname Given Name(s) Sex Nationality", boundingBox: { x: 0.18, y: 0.70, width: 0.58, height: 0.03 } },
      { sourceLabel, text: "CHAN TAI MAN", boundingBox: { x: 0.18, y: 0.62, width: 0.30, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("filters a combined passport value line with an inserted token", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname Given Names Sex Nationality", boundingBox: { x: 0.18, y: 0.70, width: 0.58, height: 0.03 } },
      { sourceLabel, text: "CHAN ME TAI MAN", boundingBox: { x: 0.18, y: 0.62, width: 0.34, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Tai Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("repairs explicit passport field pairs when OCR splits a weak given-name token", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "TA IK MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.18, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan Ta Man",
      repaired: true,
      repairSource: "ocr_geometry_label_fields",
    });
  });

  it("does not accept a longer explicit passport middle token as a weak MRZ repair", () => {
    const sourceLabel = "normalized_full";
    expect(resolvePassportLegalNameFromGeometryOcr("Chan T Man", [
      { sourceLabel, text: "Surname", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "Given Names", boundingBox: { x: 0.38, y: 0.70, width: 0.17, height: 0.03 } },
      { sourceLabel, text: "CHAN", boundingBox: { x: 0.18, y: 0.62, width: 0.09, height: 0.03 } },
      { sourceLabel, text: "TEZ TAI MAN", boundingBox: { x: 0.38, y: 0.62, width: 0.18, height: 0.03 } },
    ])).toMatchObject({
      legalName: "Chan T Man",
      repaired: false,
    });
  });

  it("reports privacy-safe passport name geometry accepted candidates", () => {
    const sourceLabel = "normalized_full";
    expect(getPassportGeometryNameDiagnostics("Chan T Man", [
      { sourceLabel, text: "Surname Given Names Sex Nationality", boundingBox: { x: 0.18, y: 0.70, width: 0.58, height: 0.03 } },
      { sourceLabel, text: "CHAN ME TAI MAN", boundingBox: { x: 0.18, y: 0.62, width: 0.34, height: 0.03 } },
    ])).toMatchObject({
      acceptedCandidateCount: 1,
      labelCounts: { combinedSurnameGiven: 1, given: 1, surname: 1 },
      valueLineCount: 1,
    });
  });

  it("extracts document gender from passport and ID OCR labels", () => {
    expect(findIdentityDocumentGenderFromOcr([
      "Surname Chan",
      "Given Names Tai Man",
      "Sex",
      "M",
    ])).toBe("Man");
    expect(findIdentityDocumentGenderFromOcr([
      "Gender: Female",
    ])).toBe("Woman");
    expect(findIdentityDocumentGenderFromOcr([
      "性別",
      "男",
    ])).toBe("Man");
  });

  it("uses a unique standalone sex marker as OCR fallback", () => {
    expect(findIdentityDocumentGenderFromOcr([
      "CHAN TAI MAN",
      "M",
      "Date of Birth 1990-01-01",
    ])).toBe("Man");
    expect(findIdentityDocumentGenderFromOcr([
      "CHAN TAI MAN",
      "Female",
      "Date of Birth 1990-01-01",
    ])).toBe("Woman");
  });

  it("does not use conflicting standalone sex markers", () => {
    expect(findIdentityDocumentGenderFromOcr([
      "CHAN TAI MAN",
      "M",
      "F",
    ])).toBeNull();
  });

  it("extracts gender from OCR geometry label-value fields", () => {
    const sourceLabel = "document_frame";
    expect(findIdentityDocumentGenderFromGeometryOcr([
      { sourceLabel, text: "姓名 Name", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "性別", boundingBox: { x: 0.62, y: 0.70, width: 0.08, height: 0.03 } },
      { sourceLabel, text: "女", boundingBox: { x: 0.62, y: 0.62, width: 0.03, height: 0.03 } },
    ])).toBe("Woman");
  });

  it("uses a unique standalone sex marker as geometry fallback", () => {
    const sourceLabel = "document_frame";
    expect(findIdentityDocumentGenderFromGeometryOcr([
      { sourceLabel, text: "姓名 Name", boundingBox: { x: 0.18, y: 0.70, width: 0.12, height: 0.03 } },
      { sourceLabel, text: "CHAN TAI MAN", boundingBox: { x: 0.18, y: 0.62, width: 0.18, height: 0.03 } },
      { sourceLabel, text: "F", boundingBox: { x: 0.62, y: 0.62, width: 0.03, height: 0.03 } },
    ])).toBe("Woman");
  });
});
