#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const commands = {
  start: ["expo", ["start"]],
  android: ["expo", ["run:android"]],
  ios: ["expo", ["run:ios"]],
  web: ["expo", ["start", "--web"]],
};

const target = process.argv[2];
const command = commands[target];

if (!command) {
  console.error("Unknown mobile fallback command.");
  process.exit(1);
}

if (process.env.ALLOW_MOBILE_FALLBACK !== "1") {
  console.error(
    [
      "Blocked: /mobile is frozen fallback/reference only.",
      "Use /app for active native work.",
      `To intentionally run this fallback command: ALLOW_MOBILE_FALLBACK=1 npm run ${target}`,
    ].join("\n"),
  );
  process.exit(1);
}

const [bin, args] = command;
const result = spawnSync(bin, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
