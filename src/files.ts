import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import { linkifyMarkdown, type LinkifyOptions, type LinkifyResult } from "./linkify";

export type FileProcessResult = {
  path: string;
  relativePath: string;
  result: LinkifyResult;
  written: boolean;
};

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function matchesAny(path: string, patterns: string[]): boolean {
  const posix = toPosix(path);
  return patterns.some((pattern) => minimatch(posix, pattern, { dot: true }));
}

function hasAllowedExtension(path: string, extensions: string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

function walkDirectory(root: string, dir: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      walkDirectory(root, full, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(full);
    }
  }
}

export function collectFiles(
  cwd: string,
  pathPatterns: string[],
  excludePatterns: string[],
  extensions: string[],
): string[] {
  const absoluteRoots: string[] = [];
  const globPatterns: string[] = [];

  for (const pattern of pathPatterns) {
    const abs = resolve(cwd, pattern);
    try {
      const st = statSync(abs);
      if (st.isFile()) {
        absoluteRoots.push(abs);
        continue;
      }
      if (st.isDirectory()) {
        walkDirectory(cwd, abs, absoluteRoots);
        continue;
      }
    } catch {
      // treat as glob
    }
    globPatterns.push(pattern);
  }

  if (globPatterns.length > 0) {
    const all: string[] = [];
    walkDirectory(cwd, cwd, all);
    for (const file of all) {
      const rel = toPosix(relative(cwd, file));
      if (matchesAny(rel, globPatterns) || matchesAny(file, globPatterns)) {
        absoluteRoots.push(file);
      }
    }
  }

  const unique = Array.from(new Set(absoluteRoots.map((f) => resolve(f))));
  return unique
    .filter((file) => hasAllowedExtension(file, extensions))
    .filter((file) => {
      const rel = toPosix(relative(cwd, file));
      return !matchesAny(rel, excludePatterns);
    })
    .sort();
}

export function processFile(
  filePath: string,
  cwd: string,
  options: LinkifyOptions,
  write: boolean,
): FileProcessResult {
  const source = readFileSync(filePath, "utf8");
  const result = linkifyMarkdown(source, options);
  let written = false;

  if (write && result.changed) {
    writeFileSync(filePath, result.text, "utf8");
    written = true;
  }

  return {
    path: filePath,
    relativePath: toPosix(relative(cwd, filePath)) || toPosix(filePath),
    result,
    written,
  };
}

export function formatUnifiedDiff(relativePath: string, before: string, after: string): string {
  if (before === after) {
    return "";
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  // Strip common prefix/suffix, emit one hunk for the changed middle.
  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let endOld = beforeLines.length - 1;
  let endNew = afterLines.length - 1;
  while (
    endOld >= start &&
    endNew >= start &&
    beforeLines[endOld] === afterLines[endNew]
  ) {
    endOld -= 1;
    endNew -= 1;
  }

  const oldCount = Math.max(0, endOld - start + 1);
  const newCount = Math.max(0, endNew - start + 1);
  const lines: string[] = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`,
  ];

  for (let i = start; i <= endOld; i += 1) {
    lines.push(`-${beforeLines[i] ?? ""}`);
  }
  for (let i = start; i <= endNew; i += 1) {
    lines.push(`+${afterLines[i] ?? ""}`);
  }

  return lines.join("\n");
}
