#!/usr/bin/env node
import { execSync } from "node:child_process";

const commands = [
  "npm run lint",
  "npm run build",
  "npx tsc --noEmit",
  "node scripts/full_smoke.mjs",
  "node scripts/signup_gate_check.mjs",
  "node scripts/ui_gate_check.mjs",
  "node scripts/uat_regression.mjs",
];

for (let i = 1; i <= 3; i += 1) {
  console.log(`RUN ${i} begin`);
  for (const cmd of commands) {
    console.log(`RUN ${i} exec: ${cmd}`);
    execSync(cmd, { stdio: "inherit", env: process.env });
  }
  console.log(`RUN ${i} pass`);
}

console.log("PASS uat_loop_complete");
