const fs = require("fs");
const path = require("path");

const appJson = require("./app.json");

const readLocalEnv = () => {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return env;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return env;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) env[key] = value;
    return env;
  }, {});
};

const localEnv = readLocalEnv();
const mapboxPublicToken =
  process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  localEnv.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  localEnv.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  "";

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    mapboxPublicToken,
  },
};
