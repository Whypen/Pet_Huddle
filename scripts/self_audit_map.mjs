import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function fail(message, extra = "") {
  const detail = extra ? `\n${extra}` : "";
  throw new Error(`[AUDIT:MAP] ${message}${detail}`);
}

console.log("[AUDIT:MAP] build.start");
try {
  const buildOut = run("npm run build");
  process.stdout.write(buildOut);
} catch (error) {
  fail("build.failed", error.stdout || error.message);
}
console.log("[AUDIT:MAP] build.ok");

const mapTsx = readFileSync("src/pages/Map.tsx", "utf8");
if (!mapTsx.includes('import BlueDotMarker from "@/components/map/BlueDotMarker";')) {
  fail("MapPage missing BlueDotMarker import");
}
if (!mapTsx.includes('import BroadcastMarker from "@/components/map/BroadcastMarker";')) {
  fail("MapPage missing BroadcastMarker import");
}
if (!mapTsx.includes("<BlueDotMarker")) {
  fail("MapPage missing BlueDotMarker render");
}
if (!mapTsx.includes("<BroadcastMarker")) {
  fail("MapPage missing BroadcastMarker render");
}
console.log("[AUDIT:MAP] map.wiring.ok");

const patterns = [
  "is not defined",
  "Cannot access '.+' before initialization",
  "Map is not a constructor",
];

for (const pattern of patterns) {
  const safe = pattern.replace(/"/g, '\\"');
  try {
    const out = run(`rg -n "${safe}" src`);
    if (out.trim().length > 0) {
      fail(`pattern.found: ${pattern}`, out.trim());
    }
  } catch (error) {
    if (typeof error.status === "number" && error.status === 1) {
      continue;
    }
    fail(`rg.failed: ${pattern}`, error.stdout || error.message);
  }
}

console.log("[AUDIT:MAP] patterns.ok");
console.log("[AUDIT:MAP] success");
