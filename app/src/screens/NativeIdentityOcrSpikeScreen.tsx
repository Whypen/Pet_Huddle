import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { extractNativeIdentityText, isNativeIdentityOcrSupported } from "../lib/nativeIdentityDocumentOcr";
import { parsePassportMrz } from "../lib/nativeIdentityDocumentMrz";
import { huddleButtons, huddleColors, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";
import { launchNativeCameraAsync, requestNativeCameraPermissionDetail } from "../lib/nativeMediaPermissions";

const samplePassportMrz = [
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
];

type SpikeStatus = "idle" | "running" | "passed" | "failed";
type DocumentScannerModule = typeof import("react-native-document-scanner-plugin");
type CaptureProof = {
  deleted: boolean;
  lineCount: number;
  source: "manual" | "scanner";
  status: "idle" | "running" | "passed" | "failed" | "cancelled";
  summary: string;
  uriKind: "file" | "base64" | "unknown";
};

const emptyCaptureProof = (source: CaptureProof["source"]): CaptureProof => ({
  deleted: false,
  lineCount: 0,
  source,
  status: "idle",
  summary: "Not run yet",
  uriKind: "unknown",
});

const deleteCaptureFile = async (uri: string | null | undefined) => {
  if (!uri || !uri.startsWith("file://")) return false;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
  return !info.exists;
};

const summarizeLines = (lines: string[]) => {
  if (lines.length === 0) return "No text detected";
  return lines.slice(0, 6).join(" / ");
};

const loadDocumentScanner = (): DocumentScannerModule => (
  require("react-native-document-scanner-plugin") as DocumentScannerModule
);

export function NativeIdentityOcrSpikeScreen() {
  const [status, setStatus] = useState<SpikeStatus>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [mrzSummary, setMrzSummary] = useState("");
  const [manualProof, setManualProof] = useState<CaptureProof>(() => emptyCaptureProof("manual"));
  const [scannerProof, setScannerProof] = useState<CaptureProof>(() => emptyCaptureProof("scanner"));

  const runProof = async () => {
    setStatus("running");
    setError("");
    setLines([]);
    setMrzSummary("");

    try {
      const mrz = parsePassportMrz(samplePassportMrz);
      if (!mrz.ok) throw new Error(`mrz_parse_failed:${mrz.reason}`);

      setMrzSummary(`${mrz.legalName} / ${mrz.documentCountry} / ${mrz.dob}`);
      setStatus("passed");
      console.log("NATIVE_IDENTITY_OCR_SPIKE_RESULT", {
        supported: isNativeIdentityOcrSupported(),
        mrz,
      });
    } catch (nextError) {
      const message = String((nextError as { message?: unknown })?.message || nextError || "unknown_error");
      setError(message);
      setStatus("failed");
      console.log("NATIVE_IDENTITY_OCR_SPIKE_RESULT", { supported: isNativeIdentityOcrSupported(), error: message });
    }
  };

  const runManualCaptureProof = async () => {
    setManualProof({ ...emptyCaptureProof("manual"), status: "running", summary: "Opening system camera..." });
    let uri: string | null = null;
    try {
      const permission = await requestNativeCameraPermissionDetail();
      if (permission.state !== "granted") throw new Error("camera_permission_denied");
      const result = await launchNativeCameraAsync({
        allowsEditing: false,
        base64: false,
        exif: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) {
        setManualProof({ ...emptyCaptureProof("manual"), status: "cancelled", summary: "Manual capture cancelled" });
        return;
      }
      uri = result.assets[0].uri;
      const ocr = await extractNativeIdentityText(uri);
      const deleted = await deleteCaptureFile(uri);
      setManualProof({
        deleted,
        lineCount: ocr.lines.length,
        source: "manual",
        status: ocr.supported ? "passed" : "failed",
        summary: ocr.supported ? summarizeLines(ocr.lines) : "OCR not supported",
        uriKind: uri.startsWith("file://") ? "file" : "unknown",
      });
      console.log("NATIVE_IDENTITY_CAPTURE_SPIKE_RESULT", {
        deleted,
        lineCount: ocr.lines.length,
        source: "manual",
        uriKind: uri.startsWith("file://") ? "file" : "unknown",
      });
    } catch (nextError) {
      const deleted = await deleteCaptureFile(uri);
      setManualProof({
        deleted,
        lineCount: 0,
        source: "manual",
        status: "failed",
        summary: String((nextError as { message?: unknown })?.message || nextError || "unknown_error"),
        uriKind: uri?.startsWith("file://") ? "file" : "unknown",
      });
    }
  };

  const runScannerCaptureProof = async () => {
    setScannerProof({ ...emptyCaptureProof("scanner"), status: "running", summary: "Opening native document scanner..." });
    let uri: string | null = null;
    try {
      const { default: DocumentScanner, ResponseType, ScanDocumentResponseStatus } = loadDocumentScanner();
      const result = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
        responseType: ResponseType.ImageFilePath,
      });
      if (result.status === ScanDocumentResponseStatus.Cancel || !result.scannedImages?.[0]) {
        setScannerProof({ ...emptyCaptureProof("scanner"), status: "cancelled", summary: "Scanner capture cancelled" });
        return;
      }
      uri = result.scannedImages[0];
      const ocr = await extractNativeIdentityText(uri);
      const deleted = await deleteCaptureFile(uri);
      setScannerProof({
        deleted,
        lineCount: ocr.lines.length,
        source: "scanner",
        status: ocr.supported ? "passed" : "failed",
        summary: ocr.supported ? summarizeLines(ocr.lines) : "OCR not supported",
        uriKind: uri.startsWith("file://") ? "file" : "unknown",
      });
      console.log("NATIVE_IDENTITY_CAPTURE_SPIKE_RESULT", {
        deleted,
        lineCount: ocr.lines.length,
        source: "scanner",
        uriKind: uri.startsWith("file://") ? "file" : "unknown",
      });
    } catch (nextError) {
      const deleted = await deleteCaptureFile(uri);
      setScannerProof({
        deleted,
        lineCount: 0,
        source: "scanner",
        status: "failed",
        summary: String((nextError as { message?: unknown })?.message || nextError || "unknown_error"),
        uriKind: uri?.startsWith("file://") ? "file" : "unknown",
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Phase 1 OCR Spike</Text>
        <Text style={styles.title}>Capture quality proof</Text>
        <Text style={styles.copy}>This screen is dev-only. It compares normal camera capture with the native document scanner, then deletes local capture files after OCR.</Text>
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Status</Text>
          <Text style={styles.resultValue}>{status}</Text>
          <Text style={styles.resultLabel}>Supported</Text>
          <Text style={styles.resultValue}>{isNativeIdentityOcrSupported() ? "yes" : "no"}</Text>
          <Text style={styles.resultLabel}>OCR output</Text>
          <Text style={styles.resultValue}>{lines.length > 0 ? lines.join(" / ") : error || "Run a capture proof to detect text"}</Text>
          <Text style={styles.resultLabel}>MRZ parser</Text>
          <Text style={styles.resultValue}>{mrzSummary || "Not parsed yet"}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={runProof} style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
          <Text style={styles.buttonText}>Run OCR again</Text>
        </Pressable>
        <View style={styles.compareGrid}>
          <CaptureProofPanel proof={manualProof} title="Manual camera" />
          <CaptureProofPanel proof={scannerProof} title="Native scanner" />
        </View>
        <Pressable accessibilityRole="button" onPress={runManualCaptureProof} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
          <Text style={styles.secondaryButtonText}>Capture with normal camera</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={runScannerCaptureProof} style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
          <Text style={styles.buttonText}>Capture with document scanner</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function CaptureProofPanel({ proof, title }: { proof: CaptureProof; title: string }) {
  return (
    <View style={styles.proofPanel}>
      <Text style={styles.resultLabel}>{title}</Text>
      <Text style={styles.resultValue}>Status: {proof.status}</Text>
      <Text style={styles.resultValue}>Lines: {proof.lineCount}</Text>
      <Text style={styles.resultValue}>URI: {proof.uriKind}</Text>
      <Text style={styles.resultValue}>Deleted: {proof.deleted ? "yes" : "no"}</Text>
      <Text style={styles.resultValue}>{proof.summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: huddleColors.canvas,
    justifyContent: "center",
    padding: huddleSpacing.x6,
  },
  card: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.sheet,
    borderWidth: 1,
    padding: huddleSpacing.x5,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  eyebrow: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: 13,
    marginBottom: huddleSpacing.x2,
  },
  title: {
    color: huddleColors.text,
    fontFamily: "Urbanist-800",
    fontSize: 26,
    lineHeight: 31,
  },
  copy: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 21,
    marginTop: huddleSpacing.x3,
  },
  preview: {
    alignSelf: "center",
    height: 120,
    marginVertical: huddleSpacing.x5,
    width: "100%",
  },
  resultBox: {
    backgroundColor: huddleColors.canvas,
    borderRadius: huddleRadii.glass,
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x2,
  },
  resultLabel: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  resultValue: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
    marginBottom: huddleSpacing.x2,
  },
  compareGrid: {
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  proofPanel: {
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    padding: huddleSpacing.x4,
  },
  button: {
    ...huddleButtons.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: huddleSpacing.x5,
    minHeight: 56,
  },
  secondaryButton: {
    ...huddleButtons.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: huddleSpacing.x3,
    minHeight: 56,
  },
  secondaryButtonText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 16,
  },
  buttonText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: 16,
  },
  pressed: {
    opacity: 0.78,
  },
});
