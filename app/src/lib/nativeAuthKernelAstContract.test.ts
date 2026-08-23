import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(currentDir, "..");
const kernelPath = resolve(currentDir, "nativeFunctionClient.ts");
const forbiddenLifecycleMethods = new Set(["getSession", "refreshSession", "setSession", "signOut", "onAuthStateChange"]);

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  if (![".ts", ".tsx"].includes(extname(entry.name)) || /\.test\.[jt]sx?$/.test(entry.name)) return [];
  return [path];
});

const propertyName = (node: ts.PropertyName | ts.Expression): string | null => {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return propertyName(node.expression);
  return null;
};

const isSupabaseAuth = (node: ts.Expression, supabaseAliases: ReadonlySet<string>): boolean => {
  const isAuthProperty = (name: string | null) => name === "auth";
  if (ts.isPropertyAccessExpression(node)) return ts.isIdentifier(node.expression) && supabaseAliases.has(node.expression.text) && isAuthProperty(node.name.text);
  if (ts.isElementAccessExpression(node)) return ts.isIdentifier(node.expression) && supabaseAliases.has(node.expression.text) && isAuthProperty(node.argumentExpression ? propertyName(node.argumentExpression) : null);
  return false;
};

const findUnsafeAuthPatterns = (source: string, fileName = "fixture.ts"): string[] => {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: string[] = [];
  const authAliases = new Set<string>();
  const supabaseAliases = new Set(["supabase"]);

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && ts.isIdentifier(node.initializer) && supabaseAliases.has(node.initializer.text)) {
        supabaseAliases.add(node.name.text);
      }
      if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer) && supabaseAliases.has(node.initializer.text)) {
        for (const element of node.name.elements) {
          const sourceName = element.propertyName ? propertyName(element.propertyName) : ts.isIdentifier(element.name) ? element.name.text : null;
          if (sourceName === "auth" && ts.isIdentifier(element.name)) authAliases.add(element.name.text);
        }
      }
      if (isSupabaseAuth(node.initializer, supabaseAliases)) {
        if (ts.isIdentifier(node.name)) authAliases.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const name = element.propertyName
              ? propertyName(element.propertyName)
              : ts.isIdentifier(element.name)
                ? element.name.text
                : null;
            if (name && forbiddenLifecycleMethods.has(name)) violations.push(`destructure:${name}`);
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
        const method = propertyName(ts.isPropertyAccessExpression(expression) ? expression.name : expression.argumentExpression ?? expression);
        const receiver = expression.expression;
        if (method && forbiddenLifecycleMethods.has(method) && (isSupabaseAuth(receiver, supabaseAliases) || (ts.isIdentifier(receiver) && authAliases.has(receiver.text)))) {
          violations.push(`lifecycle:${method}`);
        }
        if ((method === "set" || method === "append") && node.arguments.length >= 1 && propertyName(node.arguments[0])?.toLowerCase() === "authorization") {
          violations.push(`headers.${method}:authorization`);
        }
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(node.left)) {
      if (node.left.argumentExpression && propertyName(node.left.argumentExpression)?.toLowerCase() === "authorization") {
        violations.push("assignment:authorization");
      }
    }

    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name?.toLowerCase() === "authorization") violations.push("object:authorization");
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (/^Bearer\s/i.test(node.text)) violations.push("literal:bearer");
    }
    if (ts.isTemplateExpression(node) && /^Bearer\s/i.test(node.head.text)) violations.push("template:bearer");

    ts.forEachChild(node, visit);
  };

  visit(tree);
  return violations;
};

const mayContainAuthBypass = (source: string): boolean => (
  /\b(?:getSession|refreshSession|setSession|signOut|onAuthStateChange)\b/.test(source) ||
  /\bAuthorization\b/.test(source) ||
  /\bBearer\s/.test(source) ||
  /["']authorization["']/i.test(source)
);

describe("native auth kernel AST enforcement", () => {
  it("rejects direct, computed, destructured, aliased, object, and Headers API bypasses", () => {
    const violations = findUnsafeAuthPatterns(`
      const client = supabase;
      const { auth: destructuredAuth } = client;
      const auth = client.auth;
      auth.getSession();
      destructuredAuth["refreshSession"]();
      const { setSession: install, signOut } = supabase.auth;
      const headers = { ["authorization"]: "Bearer " + token };
      new Headers().set("AUTHORIZATION", "Bearer " + token);
      new Headers().append("authorization", "Bearer " + token);
      headers["authorization"] = "Bearer " + token;
    `);

    expect(violations).toEqual(expect.arrayContaining([
      "lifecycle:getSession",
      "lifecycle:refreshSession",
      "destructure:setSession",
      "destructure:signOut",
      "object:authorization",
      "headers.set:authorization",
      "headers.append:authorization",
      "assignment:authorization",
      "literal:bearer",
    ]));
  });

  it("does not flag ordinary non-auth code", () => {
    expect(findUnsafeAuthPatterns(`
      const options = { authorizationRequired: true };
      const label = "Authorized caregiver";
      void options;
      void label;
    `)).toEqual([]);
  });

  it("keeps every production bypass form outside the central kernel absent", () => {
    const violations = sourceFiles(srcRoot)
      .filter((path) => path !== kernelPath)
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        if (!mayContainAuthBypass(source)) return [];
        return findUnsafeAuthPatterns(source, path).map((violation) => `${relative(srcRoot, path)}:${violation}`);
      });

    expect(violations).toEqual([]);
  // Whole-src AST scan: needs a real budget, not the 5s default.
  }, 30_000);
});
