const fs = require("fs");
const path = require("path");

const iosFilePath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "ios", "ExpoTextExtractorModule.swift");
const androidFilePath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "android", "src", "main", "java", "expo", "modules", "textextractor", "ExpoTextExtractorModule.kt");
const androidBuildGradlePath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "android", "build.gradle");
const moduleSourcePath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "src", "ExpoTextExtractorModule.ts");
const moduleBuildTypesPath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "build", "ExpoTextExtractorModule.d.ts");
const indexSourcePath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "src", "index.ts");
const indexBuildPath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "build", "index.js");
const indexBuildTypesPath = path.join(__dirname, "..", "node_modules", "expo-text-extractor", "build", "index.d.ts");
const docScannerSwiftPath = path.join(__dirname, "..", "node_modules", "react-native-document-scanner-plugin", "ios", "DocScanner", "DocScanner.swift");

const swiftSource = `import ExpoModulesCore
import ImageIO
import Vision

public class ExpoTextExtractorModule: Module {
    private func textShape(_ text: String) -> String {
        let normalized = text.uppercased().replacingOccurrences(of: "\\\\s+", with: "", options: .regularExpression)
        let mrzLike = normalized.replacingOccurrences(of: "[^A-Z0-9<«‹|]", with: "", options: .regularExpression)
        let hasPassportStart = normalized.range(of: "^P[<A-Z0-9]", options: .regularExpression) != nil
        let hasFillers = normalized.contains("<") || normalized.contains("«") || normalized.contains("‹")
        return "len=\\(normalized.count) mrzLen=\\(mrzLike.count) passportStart=\\(hasPassportStart) fillers=\\(hasFillers)"
    }

    private func cgImageOrientation(from orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .up:
            return .up
        case .down:
            return .down
        case .left:
            return .left
        case .right:
            return .right
        case .upMirrored:
            return .upMirrored
        case .downMirrored:
            return .downMirrored
        case .leftMirrored:
            return .leftMirrored
        case .rightMirrored:
            return .rightMirrored
        @unknown default:
            return .up
        }
    }

    private func recognizeTextLines(from url: URL) throws -> [[String: Any]] {
        let imageData = try Data(contentsOf: url)
        let image = UIImage(data: imageData)
        guard let cgImage = image?.cgImage else {
            throw Exception.init(name: "err", description: "err")
        }
        NSLog("[HUDDLE_VERIFY_IDENTITY_NATIVE_OCR] start width=%d height=%d fileBytes=%d", cgImage.width, cgImage.height, imageData.count)

        var recognizedLines: [[String: Any]] = []
        var recognitionError: Error?
        let requestHandler = VNImageRequestHandler(
            cgImage: cgImage,
            orientation: cgImageOrientation(from: image?.imageOrientation ?? .up)
        )
        let request = VNRecognizeTextRequest { (request, error) in
            if let error {
                recognitionError = error
                return
            }
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                return
            }

            recognizedLines = observations.compactMap { observation in
                guard let candidate = observation.topCandidates(1).first else {
                    return nil
                }
                let box = observation.boundingBox
                return [
                    "text": candidate.string,
                    "confidence": candidate.confidence,
                    "boundingBox": [
                        "x": box.origin.x,
                        "y": box.origin.y,
                        "width": box.size.width,
                        "height": box.size.height
                    ]
                ]
            }
            NSLog("[HUDDLE_VERIFY_IDENTITY_NATIVE_OCR] observations=%d lines=%d", observations.count, recognizedLines.count)
            for (index, line) in recognizedLines.prefix(8).enumerated() {
                if let text = line["text"] as? String {
                    NSLog("[HUDDLE_VERIFY_IDENTITY_NATIVE_OCR] line[%d] %@", index, self.textShape(text))
                }
            }
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.004
        request.recognitionLanguages = ["en-US", "zh-Hant", "zh-Hans"]

        try requestHandler.perform([request])
        if let recognitionError {
            throw recognitionError
        }
        return recognizedLines
    }

    public func definition() -> ModuleDefinition {
        Name("ExpoTextExtractor")

        Constants([
            "isSupported": true
        ])

        AsyncFunction("extractTextFromImage") { (url: URL, promise: Promise) in
            do {
                let recognizedTexts = try recognizeTextLines(from: url).compactMap { line in
                    line["text"] as? String
                }
                promise.resolve(recognizedTexts)
            } catch {
                promise.reject(error)
            }
        }

        AsyncFunction("extractTextLinesFromImage") { (url: URL, promise: Promise) in
            do {
                promise.resolve(try recognizeTextLines(from: url))
            } catch {
                promise.reject(error)
            }
        }

        Function("logVerifyIdentity") { (label: String, payload: String) in
            NSLog("[HUDDLE_VERIFY_IDENTITY_NATIVE] %@ %@", label, payload)
        }
    }
}
`;

const kotlinSource = `package expo.modules.textextractor

import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ExpoTextExtractorModule : Module() {
  private fun textLinePayload(visionTexts: List<Text>): List<Map<String, Any>> {
    return visionTexts.flatMap { visionText ->
      visionText.textBlocks.flatMap { block ->
        block.lines.map { line ->
          val box = line.boundingBox
          val payload = mutableMapOf<String, Any>("text" to line.text)
          if (box != null) {
            payload["boundingBox"] = mapOf(
              "x" to box.left,
              "y" to box.top,
              "width" to box.width(),
              "height" to box.height()
            )
          }
          payload
        }
      }
    }.distinctBy { payload ->
      val box = payload["boundingBox"] as? Map<*, *>
      "\${payload["text"]}:\${box?.get("x")}:\${box?.get("y")}:\${box?.get("width")}:\${box?.get("height")}"
    }
  }

  private fun inputImageFromUri(uriString: String): InputImage {
    val context = appContext.reactContext!!
    val uri = if (uriString.startsWith("content://") || uriString.startsWith("file://")) {
      Uri.parse(uriString)
    } else {
      val file = File(uriString)
      if (!file.exists()) {
        throw Exception("File not found: $uriString")
      }
      Uri.fromFile(file)
    }
    return InputImage.fromFilePath(context, uri)
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoTextExtractor")

    Constants(
      "isSupported" to true
    )

    AsyncFunction("extractTextFromImage") { uriString: String, promise: Promise ->
      try {
        val inputImage = inputImageFromUri(uriString)
        val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val chineseRecognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        val latinTask = latinRecognizer.process(inputImage)
        val chineseTask = chineseRecognizer.process(inputImage)

        Tasks.whenAllComplete(latinTask, chineseTask)
          .addOnSuccessListener { tasks ->
            val successfulResults = tasks.mapNotNull { task ->
              if (task.isSuccessful) task.result as? Text else null
            }
            val recognizedTexts = textLinePayload(successfulResults).mapNotNull { it["text"] as? String }.distinct()

            if (recognizedTexts.isEmpty()) {
              val error = tasks.firstOrNull { !it.isSuccessful }?.exception
              if (error != null) {
                promise.reject(CodedException("err", error))
                return@addOnSuccessListener
              }
            }

            promise.resolve(recognizedTexts)
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("err", error))
          }
          .addOnCompleteListener {
            latinRecognizer.close()
            chineseRecognizer.close()
          }
      } catch (error: Exception) {
        promise.reject(CodedException("UNKNOWN_ERROR", error.message ?: "Unknown error", error))
      }
    }

    AsyncFunction("extractTextLinesFromImage") { uriString: String, promise: Promise ->
      try {
        val inputImage = inputImageFromUri(uriString)
        val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val chineseRecognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        val latinTask = latinRecognizer.process(inputImage)
        val chineseTask = chineseRecognizer.process(inputImage)

        Tasks.whenAllComplete(latinTask, chineseTask)
          .addOnSuccessListener { tasks ->
            val successfulResults = tasks.mapNotNull { task ->
              if (task.isSuccessful) task.result as? Text else null
            }
            val recognizedLines = textLinePayload(successfulResults)

            if (recognizedLines.isEmpty()) {
              val error = tasks.firstOrNull { !it.isSuccessful }?.exception
              if (error != null) {
                promise.reject(CodedException("err", error))
                return@addOnSuccessListener
              }
            }

            promise.resolve(recognizedLines)
          }
          .addOnFailureListener { error ->
            promise.reject(CodedException("err", error))
          }
          .addOnCompleteListener {
            latinRecognizer.close()
            chineseRecognizer.close()
          }
      } catch (error: Exception) {
        promise.reject(CodedException("UNKNOWN_ERROR", error.message ?: "Unknown error", error))
      }
    }
  }
}
`;

const moduleTypesSource = `import { requireNativeModule } from 'expo-modules-core';

interface ExpoTextExtractorModule {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
  extractTextLinesFromImage?: (uri: string) => Promise<NativeTextLine[]>;
  logVerifyIdentity?: (label: string, payload: string) => void;
}

export default requireNativeModule<ExpoTextExtractorModule>('ExpoTextExtractor');

export type NativeTextLine = {
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
};
`;

const moduleBuildTypesSource = `interface ExpoTextExtractorModule {
    isSupported: boolean;
    extractTextFromImage: (uri: string) => Promise<string[]>;
    extractTextLinesFromImage?: (uri: string) => Promise<NativeTextLine[]>;
    logVerifyIdentity?: (label: string, payload: string) => void;
}
declare const _default: ExpoTextExtractorModule;
export default _default;
export type NativeTextLine = {
    text: string;
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    confidence?: number;
};
`;

const indexSource = `import ExpoTextExtractorModule from './ExpoTextExtractorModule';
import type { NativeTextLine } from './ExpoTextExtractorModule';

/**
 * A boolean value that indicates whether the text extraction module is supported on the current device.
 */
export const isSupported = ExpoTextExtractorModule.isSupported;

/**
 * Extracts text from an image.
 */
export async function extractTextFromImage(uri: string): Promise<string[]> {
  return ExpoTextExtractorModule.extractTextFromImage(uri);
}

export async function extractTextLinesFromImage(uri: string): Promise<NativeTextLine[]> {
  if (ExpoTextExtractorModule.extractTextLinesFromImage) {
    return ExpoTextExtractorModule.extractTextLinesFromImage(uri);
  }
  const lines = await ExpoTextExtractorModule.extractTextFromImage(uri);
  return lines.map((text) => ({ text }));
}

export function logVerifyIdentity(label: string, payload: string): void {
  ExpoTextExtractorModule.logVerifyIdentity?.(label, payload);
}

export type { NativeTextLine };
`;

const indexBuildSource = `import ExpoTextExtractorModule from './ExpoTextExtractorModule';
/**
 * A boolean value that indicates whether the text extraction module is supported on the current device.
 */
export const isSupported = ExpoTextExtractorModule.isSupported;
/**
 * Extracts text from an image.
 */
export async function extractTextFromImage(uri) {
    return ExpoTextExtractorModule.extractTextFromImage(uri);
}
export async function extractTextLinesFromImage(uri) {
    if (ExpoTextExtractorModule.extractTextLinesFromImage) {
        return ExpoTextExtractorModule.extractTextLinesFromImage(uri);
    }
    const lines = await ExpoTextExtractorModule.extractTextFromImage(uri);
    return lines.map((text) => ({ text }));
}
export function logVerifyIdentity(label, payload) {
    ExpoTextExtractorModule.logVerifyIdentity?.(label, payload);
}
`;

const indexBuildTypesSource = `import type { NativeTextLine } from './ExpoTextExtractorModule';
/**
 * A boolean value that indicates whether the text extraction module is supported on the current device.
 */
export declare const isSupported: boolean;
/**
 * Extracts text from an image.
 */
export declare function extractTextFromImage(uri: string): Promise<string[]>;
export declare function extractTextLinesFromImage(uri: string): Promise<NativeTextLine[]>;
export declare function logVerifyIdentity(label: string, payload: string): void;
export type { NativeTextLine };
`;

const writeIfExists = (filePath, source) => {
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, source);
  }
};

writeIfExists(iosFilePath, swiftSource);
writeIfExists(androidFilePath, kotlinSource);
writeIfExists(moduleSourcePath, moduleTypesSource);
writeIfExists(moduleBuildTypesPath, moduleBuildTypesSource);
writeIfExists(indexSourcePath, indexSource);
writeIfExists(indexBuildPath, indexBuildSource);
writeIfExists(indexBuildTypesPath, indexBuildTypesSource);

if (fs.existsSync(androidBuildGradlePath)) {
  let source = fs.readFileSync(androidBuildGradlePath, "utf8");
  if (!source.includes("play-services-mlkit-text-recognition-chinese")) {
    source = source.replace(
      "implementation 'com.google.android.gms:play-services-mlkit-text-recognition:19.0.1'",
      "implementation 'com.google.android.gms:play-services-mlkit-text-recognition:19.0.1'\n    implementation 'com.google.android.gms:play-services-mlkit-text-recognition-chinese:16.0.1'"
    );
  }
  fs.writeFileSync(androidBuildGradlePath, source);
}

if (fs.existsSync(docScannerSwiftPath)) {
  let source = fs.readFileSync(docScannerSwiftPath, "utf8");
  if (!source.includes('self.errorHandler("Scan one side only.")')) {
    source = source.replace(
      "    ) {\n        var results: [String] = []",
      `    ) {
        if scan.pageCount != 1 {
            goBackToPreviousView(controller)
            self.errorHandler("Scan one side only.")
            return
        }

        var results: [String] = []`
    );
  }
  fs.writeFileSync(docScannerSwiftPath, source);
}
