import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BASE_URL } from "./urls";

export type BibleLinkifyConfig = {
  paths?: string[];
  exclude?: string[];
  baseUrl?: string;
  src?: string;
  rewriteExisting?: boolean;
  detectTranslation?: boolean;
  extensions?: string[];
};

const DEFAULT_EXTENSIONS = [".md", ".mdx", ".markdown"];

export function defaultConfig(): Required<
  Pick<BibleLinkifyConfig, "paths" | "exclude" | "baseUrl" | "rewriteExisting" | "detectTranslation" | "extensions">
> &
  BibleLinkifyConfig {
  return {
    paths: ["**/*.{md,mdx,markdown}"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/CHANGELOG.md",
      "**/pnpm-lock.yaml",
    ],
    baseUrl: DEFAULT_BASE_URL,
    rewriteExisting: false,
    detectTranslation: true,
    extensions: DEFAULT_EXTENSIONS,
  };
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  // Minimal YAML subset: top-level keys, scalars, and string lists.
  // Enough for .bible-linkify.yml without a YAML dependency.
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let currentListKey: string | null = null;
  let currentList: string[] = [];

  const flushList = (): void => {
    if (currentListKey) {
      result[currentListKey] = currentList;
      currentListKey = null;
      currentList = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) {
      continue;
    }

    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentListKey) {
      let value = listItem[1]?.trim() ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      currentList.push(value);
      continue;
    }

    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv?.[1]) {
      continue;
    }

    flushList();
    const key = kv[1];
    const rawValue = (kv[2] ?? "").trim();

    if (!rawValue) {
      currentListKey = key;
      currentList = [];
      continue;
    }

    if (rawValue === "true" || rawValue === "false") {
      result[key] = rawValue === "true";
      continue;
    }

    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  flushList();
  return result;
}

export function loadConfigFile(cwd: string, explicitPath?: string): BibleLinkifyConfig {
  const candidates = explicitPath
    ? [resolve(cwd, explicitPath)]
    : [
        resolve(cwd, ".bible-linkify.yml"),
        resolve(cwd, ".bible-linkify.yaml"),
        resolve(cwd, "bible-linkify.yml"),
      ];

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }

    const raw = readFileSync(path, "utf8");
    const parsed = parseSimpleYaml(raw);
    return {
      paths: Array.isArray(parsed.paths) ? (parsed.paths as string[]) : undefined,
      exclude: Array.isArray(parsed.exclude) ? (parsed.exclude as string[]) : undefined,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined,
      src: typeof parsed.src === "string" ? parsed.src : undefined,
      rewriteExisting:
        typeof parsed.rewriteExisting === "boolean" ? parsed.rewriteExisting : undefined,
      detectTranslation:
        typeof parsed.detectTranslation === "boolean" ? parsed.detectTranslation : undefined,
      extensions: Array.isArray(parsed.extensions) ? (parsed.extensions as string[]) : undefined,
    };
  }

  return {};
}

export function mergeConfig(
  fileConfig: BibleLinkifyConfig,
  cliOverrides: BibleLinkifyConfig,
): BibleLinkifyConfig {
  const defaults = defaultConfig();
  return {
    paths: cliOverrides.paths ?? fileConfig.paths ?? defaults.paths,
    exclude: [...(defaults.exclude ?? []), ...(fileConfig.exclude ?? []), ...(cliOverrides.exclude ?? [])],
    baseUrl: cliOverrides.baseUrl ?? fileConfig.baseUrl ?? defaults.baseUrl,
    src: cliOverrides.src ?? fileConfig.src,
    rewriteExisting: cliOverrides.rewriteExisting ?? fileConfig.rewriteExisting ?? defaults.rewriteExisting,
    detectTranslation:
      cliOverrides.detectTranslation ?? fileConfig.detectTranslation ?? defaults.detectTranslation,
    extensions: cliOverrides.extensions ?? fileConfig.extensions ?? defaults.extensions,
  };
}
