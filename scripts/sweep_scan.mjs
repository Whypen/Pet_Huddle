import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function readText(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const root = process.cwd();
const webSrc = path.join(root, "src");
const mobileSrc = path.join(root, "mobile", "src");

const files = [
  ...walk(webSrc).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")),
  ...walk(mobileSrc).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")),
];

const checks = [
  {
    id: "web_chats_useMemo_import",
    desc: "Web Chats imports useMemo (fixes runtime error).",
    must: [{ file: "src/pages/Chats.tsx", re: /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['\"]react['\"]/ }],
  },
  {
    id: "qms_thread_post_used",
    desc: "Thread posting consumes QMS via thread_post.",
    must: [{ any: true, re: /check_and_increment_quota[\s\S]{0,200}?thread_post/ }],
  },
  {
    id: "qms_discovery_used",
    desc: "Discovery consumes QMS via discovery_profile.",
    must: [{ file: "src/pages/Chats.tsx", re: /check_and_increment_quota[\s\S]{0,200}?discovery_profile/ }],
  },
  {
    id: "qms_broadcast_used",
    desc: "Broadcast consumes QMS via broadcast_alert.",
    must: [{ file: "src/pages/Map.tsx", re: /broadcast_alert/ }],
  },
  {
    id: "auth_consent_web",
    desc: "Web signup blocks on consent checkbox.",
    must: [{ file: "src/pages/Auth.tsx", re: /I have read and agree to the/ }],
  },
  {
    id: "auth_consent_mobile",
    desc: "Mobile signup blocks on consent.",
    must: [{ file: "mobile/src/screens/AuthScreen.tsx", re: /Agreement required|agree to the Terms/ }],
  },
  {
    id: "map_50km_rpc",
    desc: "Web map uses get_map_alerts_nearby (50km cap).",
    must: [{ file: "src/pages/Map.tsx", re: /get_map_alerts_nearby/ }],
  },
  {
    id: "map_friend_pins_rpc",
    desc: "Map friends uses get_friend_pins_nearby (server-side 50km cap + map_visible gate).",
    must: [{ file: "src/pages/Map.tsx", re: /get_friend_pins_nearby/ }],
  },
  {
    id: "notifications_hub_web",
    desc: "Web has Notification Hub (header bell + /notifications route).",
    must: [
      { file: "src/components/layout/GlobalHeader.tsx", re: /\bBell\b/ },
      { file: "src/App.tsx", re: /path=\"\/notifications\"/ },
      { file: "src/pages/Notifications.tsx", re: /Notifications/ },
    ],
  },
  {
    id: "notifications_hub_mobile",
    desc: "Mobile has Notification Hub screen and header bell routes to it.",
    must: [
      { file: "mobile/src/screens/NotificationsScreen.tsx", re: /Notifications/ },
      { file: "mobile/src/components/Header.tsx", re: /Notifications/ },
      { file: "mobile/src/navigation/RootNavigator.tsx", re: /name=\"Notifications\"/ },
    ],
  },
  {
    id: "mobile_map_tab",
    desc: "Mobile has Map tab registered in TabsNavigator.",
    must: [
      { file: "mobile/src/navigation/TabsNavigator.tsx", re: /name=\"Map\"/ },
      { file: "mobile/src/screens/MapScreen.tsx", re: /MapView/ },
    ],
  },
];

function checkMust(entry) {
  if (entry.file) {
    const p = path.join(root, entry.file);
    const txt = readText(p);
    if (!txt) return false;
    return entry.re.test(txt);
  }
  if (entry.any) {
    for (const f of files) {
      const txt = readText(f);
      if (txt && entry.re.test(txt)) return true;
    }
    return false;
  }
  return false;
}

const results = [];
for (const c of checks) {
  const ok = c.must.every(checkMust);
  results.push({ id: c.id, ok, desc: c.desc });
}

const fails = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: fails.length === 0, results, fails }, null, 2));
