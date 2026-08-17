import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { templates } from "@ai-threejs-studio/three-templates";
import { normalizeProjectFilePath } from "../storage/localWorkspaceStorage.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const TRUSTED_ROOT_FILES = new Map(
  templates[0].files.filter((file) => !file.path.startsWith("src/")).map((file) => [file.path, file.content])
);

interface SpecifierMatch {
  kind: string;
  specifier: string;
}

/**
 * Reject source constructs that make Vite/TypeScript read outside a project's
 * src directory. That boundary matters even with a scrubbed subprocess env:
 * Vite's ?raw/?url transforms otherwise read arbitrary host files at build time.
 */
export function projectSourcePolicyViolation(filePath: string, content: string): string | null {
  const normalizedPath = normalizeProjectFilePath(filePath);

  if (/\bimport\.meta\.glob(?:Eager)?\s*\(/.test(content)) {
    return `${normalizedPath}: import.meta.glob is unavailable in hosted projects.`;
  }
  if (/sourceMappingURL\s*=\s*(?!data:)/i.test(content)) {
    return `${normalizedPath}: external source maps are unavailable in hosted projects.`;
  }

  for (const { kind, specifier } of sourceSpecifiers(normalizedPath, content)) {
    const issue = unsafeSpecifier(normalizedPath, specifier);
    if (issue) return `${normalizedPath}: unsafe ${kind} ${JSON.stringify(specifier)} (${issue}).`;
  }
  return null;
}

export async function assertWorkspaceSourcePolicy(workspacePath: string): Promise<void> {
  await assertTrustedWorkspaceRoot(workspacePath);
  const sourceRoot = path.join(workspacePath, "src");
  const files = await walkSourceFiles(sourceRoot, sourceRoot);
  for (const { absolutePath, relativePath } of files) {
    const content = await fs.readFile(absolutePath, "utf8");
    const violation = projectSourcePolicyViolation(`src/${relativePath}`, content);
    if (violation) throw new Error(`Project source policy blocked the build: ${violation}`);
  }
}

async function assertTrustedWorkspaceRoot(workspacePath: string): Promise<void> {
  const entries = await fs.readdir(workspacePath, { withFileTypes: true });
  const allowedEntries = new Set([...TRUSTED_ROOT_FILES.keys(), "src", "dist"]);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Project source policy blocked the symbolic link ${entry.name}.`);
    if (!allowedEntries.has(entry.name)) throw new Error(`Project source policy blocked the unexpected root entry ${entry.name}.`);
  }

  for (const [fileName, trustedContent] of TRUSTED_ROOT_FILES) {
    const actualContent = await fs.readFile(path.join(workspacePath, fileName), "utf8").catch(() => null);
    if (actualContent === null) throw new Error(`Project source policy requires the trusted ${fileName}.`);
    const comparableActual =
      fileName === "index.html"
        ? actualContent.replace(/<title>[\s\S]*?<\/title>/, "<title>__PROJECT_NAME__</title>")
        : actualContent;
    if (comparableActual !== trustedContent) {
      throw new Error(`Project source policy blocked a modified ${fileName}.`);
    }
  }
}

function sourceSpecifiers(filePath: string, content: string): SpecifierMatch[] {
  const matches: SpecifierMatch[] = [];
  const patterns: Array<{ kind: string; expression: RegExp }> = [
    { kind: "module import", expression: /\b(?:import|export)\s+(?:type\s+)?[\s\S]{0,500}?\sfrom\s*["']([^"']+)["']/g },
    { kind: "side-effect import", expression: /\bimport\s*["']([^"']+)["']/g },
    { kind: "dynamic import", expression: /\bimport\s*\(\s*["']([^"']+)["']/g },
    { kind: "require", expression: /\brequire\s*\(\s*["']([^"']+)["']/g },
    { kind: "asset URL", expression: /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g }
  ];
  if (filePath.endsWith(".css")) {
    patterns.push(
      { kind: "CSS import", expression: /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi },
      { kind: "CSS URL", expression: /\burl\(\s*["']?([^"')\s]+)["']?\s*\)/gi }
    );
  }
  for (const { kind, expression } of patterns) {
    for (const match of content.matchAll(expression)) {
      if (match[1]) matches.push({ kind, specifier: match[1] });
    }
  }
  return matches;
}

function unsafeSpecifier(fromFile: string, rawSpecifier: string): string | null {
  const specifier = rawSpecifier.trim();
  if (!specifier) return "empty path";
  if (/^(?:data:|https?:|blob:|#)/i.test(specifier)) return null;
  if (/^(?:file:|node:)/i.test(specifier) || NODE_BUILTINS.has(specifier)) return "host/runtime access is forbidden";
  if (specifier.includes("\\") || specifier.includes("\0")) return "ambiguous path";

  // Bare package imports are resolved from the fixed dependency tree. Relative
  // and root imports must remain within src, including before ?raw/?url plugins.
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  if (specifier.startsWith("/")) return "root-relative source imports are forbidden";
  const withoutQuery = specifier.split(/[?#]/, 1)[0];
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), withoutQuery));
  if (target !== "src" && !target.startsWith("src/")) return "path leaves src/";
  return null;
}

async function walkSourceFiles(root: string, current: string): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Project source policy blocked a symbolic link in src/.");
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(root, absolutePath)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push({ absolutePath, relativePath: path.relative(root, absolutePath).split(path.sep).join("/") });
    }
  }
  return files;
}
