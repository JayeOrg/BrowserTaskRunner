/**
 * Scans markdown files for path references and checks they exist on disk.
 * Catches stale references after file moves.
 *
 * Usage: node --import jiti/register scripts/check-paths.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// ── Collect markdown files ──────────────────────────────────────────

function collectMarkdownFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, results);
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

// ── Extract path references from a line ─────────────────────────────

// Markdown links: [text](path) — most reliable signal
const LINK_RE = /\[.*?\]\((?<path>[^)#]+)\)/gu;

// Backtick refs: only match paths with a `/` to avoid bare filenames like `run.ts`
const BACKTICK_PATH_RE = /`(?<path>(?:stack|docs|tests|\.claude|\.github)\/[a-zA-Z0-9_./-]+)`/gu;

// "Refer to X" directives in .claude/rules/ pointer files
const REFER_RE = /Refer to (?<path>\S+)/gu;

// Paths that are generated at runtime, instructional examples, or intentionally hypothetical
const ALLOWED_MISSING = new Set([
  ".claude/dx-review-plan.md",
  "stack/projects/yoursite/tasks/yourSite.ts",
  "stack/projects/yoursite/project.ts",
  "stack/framework/project.js",
  "stack/extension/messages/commands/screenshot.ts",
  "stack/infra/Dockerfile.proxy",
  "stack/framework/alerts.ts",
  "stack/projects/_template/",
]);

function isSkippable(ref: string): boolean {
  const cleaned = ref.replace(/^\.\//, "");
  return (
    ref.startsWith("http://") ||
    ref.startsWith("https://") ||
    ref.includes("*") ||
    ref.startsWith("node:") ||
    ref.startsWith("node_modules") ||
    ref.includes("<") ||
    ref.startsWith("#") ||
    ref.includes("=") ||
    ref.startsWith("$") ||
    ref.startsWith("-") ||
    ref.startsWith("@") ||
    ALLOWED_MISSING.has(cleaned)
  );
}

interface PathRef {
  file: string;
  line: number;
  ref: string;
}

function extractRefs(filePath: string): PathRef[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const refs: PathRef[] = [];
  let inFencedBlock = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    if (line.startsWith("```")) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) continue;

    for (const re of [LINK_RE, BACKTICK_PATH_RE, REFER_RE]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        const ref = match.groups?.["path"];
        if (ref && !isSkippable(ref)) {
          refs.push({ file: filePath, line: lineNum + 1, ref });
        }
      }
    }
  }

  return refs;
}

// ── Resolve and check ───────────────────────────────────────────────

function resolveRef(ref: string): string {
  const cleaned = ref.replace(/^\.\//, "");
  return resolve(ROOT, cleaned);
}

function pathExists(absPath: string): boolean {
  if (existsSync(absPath)) return true;
  const trimmed = absPath.replace(/\/$/u, "");
  return existsSync(trimmed) && statSync(trimmed).isDirectory();
}

// ── Main ────────────────────────────────────────────────────────────

const files = collectMarkdownFiles(ROOT);
const allRefs = files.flatMap(extractRefs);

const broken: PathRef[] = [];
for (const pathRef of allRefs) {
  const abs = resolveRef(pathRef.ref);
  if (!pathExists(abs)) {
    broken.push(pathRef);
  }
}

if (broken.length > 0) {
  console.error(`\nFound ${String(broken.length)} broken path reference(s):\n`);
  for (const item of broken) {
    const relative = item.file.replace(`${ROOT}/`, "");
    console.error(`  ${relative}:${String(item.line)}  →  ${item.ref}`);
  }
  console.error("");
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
} else {
  console.log("All path references are valid.");
}
