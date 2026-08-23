import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export type NativeIdentityDocumentType = "passport" | "id";
export type NativeIdentityExtractionMethod = "mrz" | "ocr";

export type NativeIdentityOcrResult = {
  diagnostics: NativeIdentityOcrDiagnostics;
  errorCode?: NativeIdentityOcrErrorCode;
  supported: boolean;
  lines: string[];
  mrzLines: string[];
  mrzTextLines: NativeIdentityOcrTextLine[];
  textLines: NativeIdentityOcrTextLine[];
  joinedText: string;
  qualityIssue?: "too_small";
};

export type NativeIdentityOcrErrorCode =
  | "ocr_empty_result"
  | "ocr_file_unreadable"
  | "ocr_module_unavailable"
  | "ocr_native_rejected"
  | "ocr_preprocess_failed";

type NativeIdentityOcrCallResult = {
  error?: string;
  label: string;
  lineCount: number;
  ok: boolean;
};

export type NativeIdentityOcrDiagnostics = {
  cropCount: number;
  crops: Array<{ height: number; label: string; originY: number; width: number }>;
  documentType: NativeIdentityDocumentType;
  fileExists: boolean | null;
  fileSize: number | null;
  lineCount: number;
  mrzLineCount: number;
  nativeCalls: NativeIdentityOcrCallResult[];
  normalizedHeight: number | null;
  normalizedWidth: number | null;
  passportVizCropCount: number;
  preprocessError: string | null;
  source: "camera" | "scanner";
  structuredLineCount: number;
  uriScheme: string;
};

type NativeTextExtractorModule = typeof import("expo-text-extractor");
type NativeIdentityOcrOptions = {
  documentType?: NativeIdentityDocumentType;
  source?: "camera" | "scanner";
};

export type NativeIdentityOcrTextLine = {
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  sourceLabel: string;
};

export const normalizeNativeIdentityMrzCandidateText = (value: string) =>
  String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[«‹]/g, "<")
    .replace(/[|]/g, "I")
    .replace(/[^A-Z0-9<]/g, "");

let nativeTextExtractorModule: NativeTextExtractorModule | null | undefined;

const loadNativeTextExtractor = (): NativeTextExtractorModule | null => {
  if (nativeTextExtractorModule !== undefined) return nativeTextExtractorModule;
  try {
    nativeTextExtractorModule = require("expo-text-extractor") as NativeTextExtractorModule;
  } catch {
    nativeTextExtractorModule = null;
  }
  return nativeTextExtractorModule;
};

export const isNativeIdentityOcrSupported = () => loadNativeTextExtractor()?.isSupported === true;

const getUriScheme = (uri: string) => {
  const match = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match?.[1] ?? "path";
};

const createDiagnostics = (uri: string, options: NativeIdentityOcrOptions): NativeIdentityOcrDiagnostics => ({
  cropCount: 0,
  crops: [],
  documentType: options.documentType ?? "id",
  fileExists: null,
  fileSize: null,
  lineCount: 0,
  mrzLineCount: 0,
  nativeCalls: [],
  normalizedHeight: null,
  normalizedWidth: null,
  passportVizCropCount: 0,
  preprocessError: null,
  source: options.source ?? "camera",
  structuredLineCount: 0,
  uriScheme: getUriScheme(uri),
});

const uniqueLines = (lines: string[]) => {
  const seen = new Set<string>();
  return lines.flatMap((line) => String(line || "").split(/\r?\n/g)).filter((line) => {
    const normalized = String(line || "").replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const normalizeNativeTextLine = (value: unknown, sourceLabel: string): NativeIdentityOcrTextLine | null => {
  if (typeof value === "string") {
    const text = value.replace(/\s+/g, " ").trim();
    return text ? { text, sourceLabel } : null;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as { text?: unknown; boundingBox?: unknown; confidence?: unknown };
  const text = String(candidate.text || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const rawBox = candidate.boundingBox as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
  const boundingBox = rawBox &&
    Number.isFinite(Number(rawBox.x)) &&
    Number.isFinite(Number(rawBox.y)) &&
    Number.isFinite(Number(rawBox.width)) &&
    Number.isFinite(Number(rawBox.height))
    ? {
      x: Number(rawBox.x),
      y: Number(rawBox.y),
      width: Number(rawBox.width),
      height: Number(rawBox.height),
    }
    : undefined;
  const confidence = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : undefined;
  return { text, boundingBox, confidence, sourceLabel };
};

const uniqueTextLines = (lines: NativeIdentityOcrTextLine[]) => {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const box = line.boundingBox;
    const key = [
      line.sourceLabel,
      line.text.replace(/\s+/g, " ").trim().toUpperCase(),
      box ? Math.round(box.x * 1000) : "",
      box ? Math.round(box.y * 1000) : "",
      box ? Math.round(box.width * 1000) : "",
      box ? Math.round(box.height * 1000) : "",
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getDocumentCrop = (width: number, height: number, documentType: NativeIdentityDocumentType) => {
  const targetAspect = documentType === "passport" ? 1.42 : 1.58;
  const cropWidth = Math.min(width * 0.92, height * targetAspect * 0.82);
  const cropHeight = cropWidth / targetAspect;
  return {
    height: Math.max(1, Math.round(cropHeight)),
    originX: Math.max(0, Math.round((width - cropWidth) / 2)),
    originY: Math.max(0, Math.round((height - cropHeight) * (documentType === "passport" ? 0.5 : 0.54))),
    width: Math.max(1, Math.round(cropWidth)),
  };
};

const getPassportMrzCrops = (width: number, height: number) => {
  const fullWidthCropHeight = Math.max(1, Math.round(height * 0.34));
  const lowerHalfHeight = Math.max(1, Math.round(height * 0.5));
  const lowerThirdHeight = Math.max(1, Math.round(height * 0.38));
  const bottomBandHeight = Math.max(1, Math.round(height * 0.24));
  const wideColumnWidth = Math.max(1, Math.round(width * 0.72));
  const halfColumnWidth = Math.max(1, Math.round(width * 0.56));
  const crops = [
    { height: lowerHalfHeight, originX: 0, originY: Math.max(0, height - lowerHalfHeight), width, label: "passport_mrz_lower_half_full" },
    { height: lowerThirdHeight, originX: 0, originY: Math.max(0, height - lowerThirdHeight), width, label: "passport_mrz_lower_third_full" },
    { height: bottomBandHeight, originX: 0, originY: Math.max(0, height - bottomBandHeight), width, label: "passport_mrz_bottom_band_full" },
    { height: fullWidthCropHeight, originX: 0, originY: Math.max(0, Math.round(height * 0.44)), width, label: "passport_mrz_band_1" },
    { height: fullWidthCropHeight, originX: 0, originY: Math.max(0, Math.round(height * 0.56)), width, label: "passport_mrz_band_2" },
    { height: fullWidthCropHeight, originX: 0, originY: Math.max(0, Math.round(height * 0.66)), width, label: "passport_mrz_band_3" },
    { height: lowerHalfHeight, originX: 0, originY: Math.max(0, height - lowerHalfHeight), width: wideColumnWidth, label: "passport_mrz_lower_left" },
    { height: lowerHalfHeight, originX: Math.max(0, width - wideColumnWidth), originY: Math.max(0, height - lowerHalfHeight), width: wideColumnWidth, label: "passport_mrz_lower_right" },
    { height: lowerHalfHeight, originX: Math.max(0, Math.round((width - halfColumnWidth) / 2)), originY: Math.max(0, height - lowerHalfHeight), width: halfColumnWidth, label: "passport_mrz_lower_center" },
  ];
  return crops.map(({ label, ...crop }) => ({
    crop: {
      height: Math.min(crop.height, height - crop.originY),
      originX: Math.min(crop.originX, Math.max(0, width - 1)),
      originY: Math.min(crop.originY, Math.max(0, height - 1)),
      width: Math.min(crop.width, width - crop.originX),
    },
    label,
  }));
};

const clampCrop = (
  width: number,
  height: number,
  crop: { height: number; originX: number; originY: number; width: number },
) => ({
  height: Math.max(1, Math.min(crop.height, height - crop.originY)),
  originX: Math.min(crop.originX, Math.max(0, width - 1)),
  originY: Math.min(crop.originY, Math.max(0, height - 1)),
  width: Math.max(1, Math.min(crop.width, width - crop.originX)),
});

const getPassportVizCrops = (width: number, height: number) => {
  const upperHeight = Math.max(1, Math.round(height * 0.72));
  const middleHeight = Math.max(1, Math.round(height * 0.58));
  const nameBandHeight = Math.max(1, Math.round(height * 0.44));
  const rightWidth = Math.max(1, Math.round(width * 0.76));
  const crops = [
    { height: upperHeight, originX: 0, originY: 0, width, label: "passport_viz_upper_full" },
    { height: middleHeight, originX: 0, originY: Math.max(0, Math.round(height * 0.14)), width, label: "passport_viz_middle_full" },
    { height: nameBandHeight, originX: 0, originY: Math.max(0, Math.round(height * 0.24)), width, label: "passport_viz_name_band_full" },
    { height: upperHeight, originX: Math.max(0, width - rightWidth), originY: 0, width: rightWidth, label: "passport_viz_right_data" },
  ];
  return crops.map(({ label, ...crop }) => ({
    crop: clampCrop(width, height, crop),
    label,
  }));
};

const extractLinesSafely = async (
  extractor: NativeTextExtractorModule,
  uri: string,
  label: string,
): Promise<{ call: NativeIdentityOcrCallResult; lines: string[]; textLines: NativeIdentityOcrTextLine[] }> => {
  try {
    const rawLines = extractor.extractTextLinesFromImage
      ? await extractor.extractTextLinesFromImage(uri)
      : await extractor.extractTextFromImage(uri);
    const textLines = rawLines
      .map((line) => normalizeNativeTextLine(line, label))
      .filter((line): line is NativeIdentityOcrTextLine => Boolean(line));
    const lines = textLines.map((line) => line.text);
    return {
      call: { label, lineCount: lines.length, ok: true },
      lines,
      textLines,
    };
  } catch (error) {
    return {
      call: {
        error: error instanceof Error ? error.message : String(error || "unknown"),
        label,
        lineCount: 0,
        ok: false,
      },
      lines: [],
      textLines: [],
    };
  }
};

const getMrzCandidateTextLines = (textLines: NativeIdentityOcrTextLine[]) => textLines
  .filter((line) => {
    if (line.sourceLabel.startsWith("passport_mrz_")) return true;
    const normalized = normalizeNativeIdentityMrzCandidateText(line.text);
    return normalized.length >= 20 && (normalized.includes("<<") || normalized.startsWith("P"));
  });

export const extractNativeIdentityText = async (uri: string, options: NativeIdentityOcrOptions = {}): Promise<NativeIdentityOcrResult> => {
  const diagnostics = createDiagnostics(uri, options);
  if (!isNativeIdentityOcrSupported()) {
    return { diagnostics, errorCode: "ocr_module_unavailable", supported: false, lines: [], mrzLines: [], mrzTextLines: [], textLines: [], joinedText: "" };
  }

  const generatedUris: string[] = [];
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    diagnostics.fileExists = fileInfo?.exists ?? false;
    diagnostics.fileSize = fileInfo?.exists && "size" in fileInfo ? fileInfo.size ?? null : null;
    if (diagnostics.uriScheme === "file" && !diagnostics.fileExists) {
      return { diagnostics, errorCode: "ocr_file_unreadable", supported: true, lines: [], mrzLines: [], mrzTextLines: [], textLines: [], joinedText: "" };
    }

    const normalized = await manipulateAsync(uri, [{ resize: { width: 2400 } }], {
      compress: 1,
      format: SaveFormat.JPEG,
    });
    generatedUris.push(normalized.uri);
    diagnostics.normalizedHeight = normalized.height;
    diagnostics.normalizedWidth = normalized.width;

    if (normalized.width < 1200 || normalized.height < 1200) {
      return { diagnostics, errorCode: "ocr_empty_result", supported: true, lines: [], mrzLines: [], mrzTextLines: [], textLines: [], joinedText: "", qualityIssue: "too_small" };
    }

    const documentType = options.documentType ?? "id";
    const crop = documentType === "passport" || options.source === "scanner"
      ? null
      : getDocumentCrop(normalized.width, normalized.height, documentType);
    const cropped = crop
      ? await manipulateAsync(normalized.uri, [{ crop }, { resize: { width: 2200 } }], {
        compress: 1,
        format: SaveFormat.JPEG,
      })
      : normalized;
    if (cropped.uri !== normalized.uri) generatedUris.push(cropped.uri);
    if (crop) {
      diagnostics.crops.push({ height: crop.height, label: "document_frame", originY: crop.originY, width: crop.width });
    }

    const passportMrzCrops = options.documentType === "passport"
      ? await Promise.all(getPassportMrzCrops(cropped.width, cropped.height).map(async ({ crop: mrzCrop, label }) => {
        const image = await manipulateAsync(cropped.uri, [{ crop: mrzCrop }, { resize: { width: 3200 } }], {
        compress: 1,
        format: SaveFormat.JPEG,
        });
        generatedUris.push(image.uri);
        diagnostics.crops.push({ height: mrzCrop.height, label, originY: mrzCrop.originY, width: mrzCrop.width });
        return { image, label };
      }))
      : [];
    const passportVizCrops = options.documentType === "passport"
      ? await Promise.all(getPassportVizCrops(cropped.width, cropped.height).map(async ({ crop: vizCrop, label }) => {
        const image = await manipulateAsync(cropped.uri, [{ crop: vizCrop }, { resize: { width: 3200 } }], {
          compress: 1,
          format: SaveFormat.JPEG,
        });
        generatedUris.push(image.uri);
        diagnostics.crops.push({ height: vizCrop.height, label, originY: vizCrop.originY, width: vizCrop.width });
        return { image, label };
      }))
      : [];
    diagnostics.passportVizCropCount = passportVizCrops.length;
    diagnostics.cropCount = diagnostics.crops.length;

    const extractor = loadNativeTextExtractor();
    if (!extractor?.extractTextFromImage) {
      return { diagnostics, errorCode: "ocr_module_unavailable", supported: false, lines: [], mrzLines: [], mrzTextLines: [], textLines: [], joinedText: "" };
    }

    const lineGroups: string[][] = [];
    const textLineGroups: NativeIdentityOcrTextLine[][] = [];
    for (const vizCrop of passportVizCrops) {
      const result = await extractLinesSafely(extractor, vizCrop.image.uri, vizCrop.label);
      diagnostics.nativeCalls.push(result.call);
      lineGroups.push(result.lines);
      textLineGroups.push(result.textLines);
    }
    for (const mrzCrop of passportMrzCrops) {
      const result = await extractLinesSafely(extractor, mrzCrop.image.uri, mrzCrop.label);
      diagnostics.nativeCalls.push(result.call);
      lineGroups.push(result.lines);
      textLineGroups.push(result.textLines);
    }
    const croppedResult = await extractLinesSafely(extractor, cropped.uri, crop ? "document_frame" : "normalized_full");
    diagnostics.nativeCalls.push(croppedResult.call);
    lineGroups.push(croppedResult.lines);
    textLineGroups.push(croppedResult.textLines);
    if (cropped.uri !== normalized.uri) {
      const fallbackResult = await extractLinesSafely(extractor, normalized.uri, "normalized_full");
      diagnostics.nativeCalls.push(fallbackResult.call);
      lineGroups.push(fallbackResult.lines);
      textLineGroups.push(fallbackResult.textLines);
    }
    const textLines = uniqueTextLines(textLineGroups.flat());
    const lines = uniqueLines(lineGroups.flat());
    const mrzTextLines = getMrzCandidateTextLines(textLines);
    const mrzLines = uniqueLines(mrzTextLines.map((line) => line.text));
    diagnostics.lineCount = lines.length;
    diagnostics.mrzLineCount = mrzLines.length;
    diagnostics.structuredLineCount = textLines.filter((line) => Boolean(line.boundingBox)).length;
    const nativeHadError = diagnostics.nativeCalls.some((call) => !call.ok);
    const nativeHadSuccess = diagnostics.nativeCalls.some((call) => call.ok);
    const errorCode: NativeIdentityOcrErrorCode | undefined = lines.length > 0
      ? undefined
      : nativeHadError && !nativeHadSuccess
        ? "ocr_native_rejected"
        : "ocr_empty_result";
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.info("[NativeIdentityDocumentOcr.proof]", {
        crop,
        cropCount: diagnostics.cropCount,
        documentType,
        lineCount: lines.length,
        mrzLineCount: mrzLines.length,
        nativeCalls: diagnostics.nativeCalls,
        normalizedHeight: normalized.height,
        normalizedWidth: normalized.width,
        source: options.source ?? "camera",
        structuredLineCount: diagnostics.structuredLineCount,
        uriScheme: diagnostics.uriScheme,
      });
    }
    return {
      diagnostics,
      errorCode,
      supported: true,
      lines,
      mrzLines,
      mrzTextLines,
      textLines,
      joinedText: lines.join("\n"),
    };
  } catch (error) {
    diagnostics.preprocessError = error instanceof Error ? error.message : String(error || "unknown");
    return { diagnostics, errorCode: "ocr_preprocess_failed", supported: true, lines: [], mrzLines: [], mrzTextLines: [], textLines: [], joinedText: "" };
  } finally {
    for (const generatedUri of generatedUris) {
      if (generatedUri && generatedUri !== uri && generatedUri.startsWith("file://")) {
        await FileSystem.deleteAsync(generatedUri, { idempotent: true }).catch(() => undefined);
      }
    }
  }
};
