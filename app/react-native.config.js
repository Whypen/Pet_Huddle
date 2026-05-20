const skipFaceDetector = process.env.HUDDLE_SKIP_NATIVE_FACE_DETECTOR === "1";

module.exports = {
  dependencies: skipFaceDetector
    ? {
        // Google MLKit's iOS pod ships x86_64 simulator and arm64 device slices,
        // but no valid arm64-simulator slice. Let simulator/dev-client builds
        // load without the native detector; the screen already handles fallback.
        "react-native-vision-camera-face-detector": {
          platforms: {
            ios: null,
          },
        },
      }
    : {},
};
