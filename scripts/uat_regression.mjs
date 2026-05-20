#!/usr/bin/env node
import { execSync } from "node:child_process";

const checks = [];

const grepCount = (cmd) => {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out ? out.split("\n").filter(Boolean).length : 0;
  } catch {
    return 0;
  }
};

const passIf = (name, condition, detail) => {
  checks.push({ name, pass: Boolean(condition), detail });
};

passIf(
  "noticeboard_category_selected_blue",
  grepCount("grep -Rni \"category === cat.id\" src/components/social/NoticeBoard.tsx") > 0 &&
    grepCount("grep -Rni \"bg-primary text-white\" src/components/social/NoticeBoard.tsx") > 0,
  "selected class uses bg-primary text-white"
);

passIf(
  "noticeboard_word_count_removed",
  grepCount("grep -Rni \"remainingChars\" src/components/social/NoticeBoard.tsx") === 0,
  "remainingChars references=0"
);

passIf(
  "lightbox_wired",
  grepCount("grep -Rni \"MediaThumb\" src/components/social/NoticeBoard.tsx src/pages/Discover.tsx src/components/map/PinDetailModal.tsx src/components/map/BroadcastModal.tsx") >= 4 &&
    grepCount("grep -Rni \"Lightbox\" src/components/media/MediaThumb.tsx src/components/media/Lightbox.tsx") >= 2,
  "MediaThumb + Lightbox present"
);

passIf(
  "pin_detail_no_map_alerts_updated_at",
  grepCount("grep -Rni -E \"map_alerts|updated_at\" src/components/map/PinDetailModal.tsx") === 0,
  "PinDetailModal no map_alerts/updated_at writes"
);

passIf(
  "discover_route_exists",
  grepCount("grep -Rni 'path=\"/discover\"' src/App.tsx") > 0,
  "/discover route registered"
);

passIf(
  "map_expiry_filter_present",
  grepCount("grep -Rni \"expires_at\" src/pages/Map.tsx") > 0 && grepCount("grep -Rni \"expiresAt > now\" src/pages/Map.tsx") > 0,
  "Map filters expired alerts client-side"
);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  passIf("settings_toggle_persistence", false, "DATABASE_URL missing");
} else {
  try {
    const userId = execSync(
      `psql "${dbUrl}" -P pager=off -t -A -c "select id from public.profiles order by created_at desc limit 1;"`
    ).toString().trim();
    if (!userId) throw new Error("no profile row available");

    execSync(
      `psql "${dbUrl}" -P pager=off -c "insert into public.notification_preferences(user_id,push_enabled,pause_all,social,chats,map,vet,email) values ('${userId}', true, false, true, false, true, false, true) on conflict(user_id) do update set push_enabled=excluded.push_enabled,pause_all=excluded.pause_all,social=excluded.social,chats=excluded.chats,map=excluded.map,vet=excluded.vet,email=excluded.email;"`
    );
    const persistedRaw = execSync(
      `psql "${dbUrl}" -P pager=off -t -A -c "select concat_ws(',', push_enabled::text,pause_all::text,social::text,chats::text,map::text,vet::text,email::text) from public.notification_preferences where user_id='${userId}' limit 1;"`
    ).toString().trim();
    passIf(
      "settings_toggle_persistence",
      persistedRaw === "true,false,true,false,true,false,true",
      `row=${persistedRaw}`
    );
  } catch (err) {
    passIf("settings_toggle_persistence", false, `error=${err instanceof Error ? err.message : String(err)}`);
  }
}

let failed = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`PASS ${check.name} ${check.detail}`);
  } else {
    failed = true;
    console.log(`FAIL ${check.name} ${check.detail}`);
  }
}

if (failed) process.exit(1);
console.log("PASS uat_regression_complete");
