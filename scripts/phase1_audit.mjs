import fs from "fs";
import path from "path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const auditDir = path.join(root, "audit");
const appFile = path.join(srcDir, "App.tsx");

const requiredRoutes = [
  "/auth",
  "/signup/dob",
  "/signup/credentials",
  "/signup/name",
  "/signup/verify",
  "/verify-identity",
  "/edit-profile",
  "/edit-pet-profile",
  "/reset-password",
  "/auth/callback",
  "/premium",
  "/",
];

const legacyFieldPatterns = [
  { field: "effective_tier", regex: /\beffective_tier\b/g },
  { field: "subscription_status", regex: /\bsubscription_status\b/g },
  { field: ".tier", regex: /\.tier\b/g },
];

const membershipFieldPatterns = [
  { field: "membership_tier", regex: /\bmembership_tier\b/g },
  { field: "effective_tier", regex: /\beffective_tier\b/g },
  { field: ".tier", regex: /\.tier\b/g },
  { field: "subscription_status", regex: /\bsubscription_status\b/g },
];

const ignoreElementNames = new Set(["ProtectedRoute", "PublicRoute", "Navigate", "div", "React", "Fragment"]);

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
};

const srcFiles = walk(srcDir).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

const readFile = (filePath) => fs.readFileSync(filePath, "utf8");

const toRel = (filePath) => path.relative(root, filePath);

const extractRouteDefs = (filePath, contents) => {
  const routes = [];
  const routeRegex = /<Route[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = routeRegex.exec(contents)) !== null) {
    routes.push({ path: match[1], file: toRel(filePath) });
  }
  return routes;
};

const extractImportMap = (contents) => {
  const map = new Map();
  const importRegex = /import\s+([^;]+?)\s+from\s+["'](.+?)["']/g;
  let match;
  while ((match = importRegex.exec(contents)) !== null) {
    const spec = match[1].trim();
    const source = match[2];
    if (spec.startsWith("{")) continue;
    const defaultName = spec.split(",")[0]?.trim();
    if (!defaultName) continue;
    map.set(defaultName, source);
  }
  return map;
};

const resolveImportPath = (source) => {
  if (!source) return null;
  if (source.startsWith("@/")) {
    return path.join(srcDir, source.replace("@/", ""));
  }
  if (source.startsWith("./") || source.startsWith("../")) {
    return path.resolve(path.dirname(appFile), source);
  }
  return null;
};

const findComponentInElement = (elementText) => {
  const componentRegex = /<([A-Z][A-Za-z0-9_]*)/g;
  let match;
  while ((match = componentRegex.exec(elementText)) !== null) {
    const name = match[1];
    if (!ignoreElementNames.has(name)) return name;
  }
  return null;
};

const extractAppRoutesWithComponents = (contents) => {
  const routes = [];
  const routeRegex = /<Route[\s\S]*?\bpath\s*=\s*["']([^"']+)["'][\s\S]*?element=\{([\s\S]*?)\}\s*\/?>/g;
  let match;
  while ((match = routeRegex.exec(contents)) !== null) {
    routes.push({ path: match[1], element: match[2] });
  }
  return routes;
};

const extractMembershipFields = (contents) => {
  const found = new Set();
  for (const { field, regex } of membershipFieldPatterns) {
    if (regex.test(contents)) {
      found.add(field);
    }
  }
  return [...found];
};

const extractTables = (contents) => {
  const found = new Set();
  const regex = /\.from\(\s*["']([a-zA-Z0-9_]+)["']\s*\)/g;
  let match;
  while ((match = regex.exec(contents)) !== null) {
    found.add(match[1]);
  }
  return [...found];
};

const collectLegacyFieldRefs = () => {
  const refs = [];
  for (const file of srcFiles) {
    const contents = readFile(file);
    for (const { field, regex } of legacyFieldPatterns) {
      let match;
      while ((match = regex.exec(contents)) !== null) {
        const before = contents.slice(0, match.index);
        const line = before.split("\n").length;
        refs.push({ field, file: toRel(file), line });
      }
    }
  }
  return refs;
};

const collectRouteStrings = () => {
  const refs = new Map();
  const regexes = [
    /navigate\(\s*["'](\/[^"']+)["']/g,
    /to=\{?\s*["'](\/[^"']+)["']/g,
    /href=\{?\s*["'](\/[^"']+)["']/g,
    /window\.location\.href\s*=\s*["'](\/[^"']+)["']/g,
    /window\.location\.assign\(\s*["'](\/[^"']+)["']/g,
  ];
  for (const file of srcFiles) {
    const contents = readFile(file);
    for (const regex of regexes) {
      let match;
      while ((match = regex.exec(contents)) !== null) {
        const raw = match[1];
        if (!raw.startsWith("/")) continue;
        const normalized = raw.split("?")[0].split("#")[0];
        if (!refs.has(normalized)) refs.set(normalized, []);
        refs.get(normalized).push({ file: toRel(file) });
      }
    }
  }
  return refs;
};

const specSectionForRoute = (routePath) => {
  if (routePath.startsWith("/signup") || routePath === "/auth" || routePath === "/reset-password" || routePath === "/auth/callback") {
    return "2.1 Social ID System";
  }
  if (routePath === "/verify-identity") return "2.2 Identity Verification (KYC)";
  if (routePath === "/premium" || routePath === "/subscription" || routePath === "/manage-subscription") {
    return "3. Membership Economy";
  }
  if (routePath.startsWith("/ai-vet")) return "4.1 Gemini AI Vet";
  if (routePath === "/social" || routePath === "/") return "5. Social Discovery";
  if (routePath.startsWith("/map")) return "6. Broadcast Mesh Network";
  if (routePath.startsWith("/threads")) return "7. Threads (Community Forum)";
  if (routePath.startsWith("/chats") || routePath.startsWith("/chat-dialogue")) return "8. Chat Safety & Moderation";
  if (routePath.startsWith("/edit-profile") || routePath.startsWith("/edit-pet-profile") || routePath.startsWith("/account-settings")) {
    return "9.1 Core Tables (profiles/pets)";
  }
  if (routePath.startsWith("/settings")) return "4.2 Nanny Marketplace Escrow";
  return "1. Product Definition";
};

const appContents = readFile(appFile);
const importMap = extractImportMap(appContents);
const appRoutes = extractAppRoutesWithComponents(appContents);

const routeDefs = [];
for (const file of srcFiles) {
  const contents = readFile(file);
  routeDefs.push(...extractRouteDefs(file, contents));
}

const routePaths = [...new Set(routeDefs.map((r) => r.path))];

const missingRequiredRoutes = requiredRoutes.filter((route) => !routePaths.includes(route));

const legacyFieldRefs = collectLegacyFieldRefs();

const routeStringRefs = collectRouteStrings();
const mismatchedRoutes = [];
for (const [routePath, locations] of routeStringRefs.entries()) {
  if (routePath === "*") continue;
  if (!routePaths.includes(routePath)) {
    mismatchedRoutes.push({ path: routePath, locations });
  }
}

const componentRoutes = appRoutes.map((route) => {
  const componentName = findComponentInElement(route.element) || "Unknown";
  const importSource = importMap.get(componentName) || null;
  const resolvedImport = importSource ? resolveImportPath(importSource) : null;
  const componentFile = resolvedImport
    ? [".tsx", ".ts", ".jsx", ".js", ""].map((ext) => `${resolvedImport}${ext}`).find((p) => fs.existsSync(p)) || null
    : null;
  let membershipFields = [];
  let dbTables = [];
  if (componentFile && fs.existsSync(componentFile)) {
    const componentContents = readFile(componentFile);
    membershipFields = extractMembershipFields(componentContents);
    dbTables = extractTables(componentContents);
  }
  return {
    path: route.path,
    component: componentName,
    componentFile: componentFile ? toRel(componentFile) : null,
    specSection: specSectionForRoute(route.path),
    membershipFields,
    dbTables,
  };
});

const truthTable = {
  generated_at: new Date().toISOString(),
  routes: componentRoutes,
  routeDefinitions: routeDefs,
  requiredRoutes,
  fail: {
    missingRequiredRoutes,
    legacyFieldRefs,
    mismatchedRouteStrings: mismatchedRoutes,
  },
};

const mdLines = [];
mdLines.push("# Phase 1 Truth Table");
mdLines.push("");
mdLines.push(`Generated: ${truthTable.generated_at}`);
mdLines.push("");
mdLines.push("## Routes Found");
for (const route of routeDefs) {
  mdLines.push(`- ${route.path} (${route.file})`);
}
mdLines.push("");
mdLines.push("## Truth Table");
mdLines.push("| SPEC Section | Route | Component | Membership Fields | DB Tables | Component File |");
mdLines.push("| --- | --- | --- | --- | --- | --- |");
for (const route of componentRoutes) {
  mdLines.push(
    `| ${route.specSection} | ${route.path} | ${route.component} | ${route.membershipFields.join(", ") || "none"} | ${route.dbTables.join(", ") || "none"} | ${route.componentFile ?? "unknown"} |`
  );
}
mdLines.push("");
mdLines.push("## FAIL");
mdLines.push("### Missing Required Routes");
if (!missingRequiredRoutes.length) {
  mdLines.push("- none");
} else {
  for (const route of missingRequiredRoutes) mdLines.push(`- ${route}`);
}
mdLines.push("");
mdLines.push("### Legacy Fields Still Referenced");
if (!legacyFieldRefs.length) {
  mdLines.push("- none");
} else {
  for (const ref of legacyFieldRefs) {
    mdLines.push(`- ${ref.field} @ ${ref.file}:${ref.line}`);
  }
}
mdLines.push("");
mdLines.push("### Mismatched Route Strings");
if (!mismatchedRoutes.length) {
  mdLines.push("- none");
} else {
  for (const mismatch of mismatchedRoutes) {
    mdLines.push(`- ${mismatch.path}`);
    for (const loc of mismatch.locations) {
      mdLines.push(`  - ${loc.file}`);
    }
  }
}

if (!fs.existsSync(auditDir)) {
  fs.mkdirSync(auditDir, { recursive: true });
}

fs.writeFileSync(path.join(auditDir, "phase1_truth_table.json"), JSON.stringify(truthTable, null, 2));
fs.writeFileSync(path.join(auditDir, "phase1_truth_table.md"), mdLines.join("\n"));

console.log("Phase 1 audit complete.");
