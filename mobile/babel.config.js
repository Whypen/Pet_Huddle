module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v4 exports a preset-like config. Putting it under `plugins`
    // can trigger: ".plugins is not a valid Plugin property".
    presets: ["babel-preset-expo", "nativewind/babel"],
    plugins: [
      // Must be last.
      "react-native-reanimated/plugin",
    ],
  };
};
