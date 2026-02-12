import fs from "node:fs";
import path from "node:path";

const targets = [
  "src/pages/Map.tsx",
  "src/components/map/BroadcastModal.tsx",
];

const cwd = process.cwd();

function getLineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function collectCallbackDecls(text) {
  const decls = new Map();
  const lines = text.split(/\r?\n/);
  const cbDecl = /^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*useCallback\s*\(/;
  const memoDecl = /^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*useMemo\s*\(/;
  const funcDecl = /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

  lines.forEach((line, idx) => {
    let m = line.match(cbDecl);
    if (m) decls.set(m[1], idx + 1);
    m = line.match(memoDecl);
    if (m) decls.set(m[1], idx + 1);
    m = line.match(funcDecl);
    if (m) decls.set(m[1], idx + 1);
  });
  return decls;
}

function extractDeps(text) {
  const deps = [];
  const hookRegex = /(useEffect|useLayoutEffect)\s*\(/g;
  let match;
  while ((match = hookRegex.exec(text)) !== null) {
    const start = match.index;
    let depth = 0;
    let i = start;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const call = text.slice(start, i + 1);
    const depMatch = call.match(/,\s*\[([\s\S]*?)\]\s*\)$/);
    if (!depMatch) continue;
    const depRaw = depMatch[1];
    const names = depRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\?.*$/, ""))
      .map((s) => s.replace(/\[.*?\]/g, ""))
      .map((s) => s.replace(/\(.*/g, ""));
    deps.push({
      hook: match[1],
      line: getLineNumber(text, start),
      names,
    });
  }
  return deps;
}

function findTDZDeps(filePath) {
  const abs = path.join(cwd, filePath);
  const text = fs.readFileSync(abs, "utf8");
  const decls = collectCallbackDecls(text);
  const deps = extractDeps(text);
  const risks = [];

  for (const dep of deps) {
    for (const name of dep.names) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      const declLine = decls.get(name);
      if (!declLine) continue;
      if (declLine > dep.line) {
        risks.push({ name, hook: dep.hook, hookLine: dep.line, declLine });
      }
    }
  }

  return risks;
}

let hasRisk = false;
for (const target of targets) {
  const risks = findTDZDeps(target);
  if (risks.length === 0) {
    console.log(`[TDZ] OK: ${target}`);
    continue;
  }
  hasRisk = true;
  console.log(`[TDZ] RISK: ${target}`);
  for (const r of risks) {
    console.log(`  - ${r.name} used in ${r.hook} deps at line ${r.hookLine} before declaration at line ${r.declLine}`);
  }
}

process.exitCode = hasRisk ? 1 : 0;
