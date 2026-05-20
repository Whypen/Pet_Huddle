#!/usr/bin/env node
import { execSync } from "node:child_process";

const checks = [];

const runGrepCount = (cmd) => {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out ? out.split("\n").filter(Boolean).length : 0;
  } catch {
    return 0;
  }
};

const mustBeZero = (name, cmd) => {
  const count = runGrepCount(cmd);
  const pass = count === 0;
  checks.push({ name, pass, detail: `matches=${count}` });
};

mustBeZero("no_stub_not_available", 'grep -Rni "not available in this build" src');
mustBeZero("no_account_settings_route", 'grep -Rni "/account-settings" src');
mustBeZero("no_support_route_refs", 'grep -Rni -E "path=\"/support\"|navigate\\(\"/support\"|href=\"/support\"" src/App.tsx src/pages/Settings.tsx');
mustBeZero("noticeboard_no_nav_height_padding", 'grep -Rni "var(--nav-height)" src/components/social/NoticeBoard.tsx');
mustBeZero("chats_no_metadata_insert", 'grep -Rni "metadata:" src/pages/Chats.tsx');

const maxWCount = runGrepCount('grep -Rni "max-w" src/pages');
const widthPass = maxWCount <= 70;
checks.push({ name: "page_width_wrapper_budget", pass: widthPass, detail: `max-w matches=${maxWCount} budget<=70` });

let hasFail = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`PASS ${check.name} ${check.detail}`);
  } else {
    hasFail = true;
    console.log(`FAIL ${check.name} ${check.detail}`);
  }
}

if (hasFail) {
  process.exit(1);
}

console.log("PASS ui_gate_check_complete");
