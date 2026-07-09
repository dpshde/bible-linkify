import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  defaultConfig,
  loadConfigFile,
  mergeConfig,
  type BibleLinkifyConfig,
} from "./config";
import { collectFiles, formatUnifiedDiff, processFile, type FileProcessResult } from "./files";
import type { LinkifyOptions } from "./linkify";

type Mode = "check" | "write" | "diff" | "report";

type CliArgs = {
  mode: Mode;
  paths: string[];
  exclude: string[];
  baseUrl?: string;
  src?: string;
  rewriteExisting?: boolean;
  detectTranslation?: boolean;
  configPath?: string;
  cwd: string;
  help: boolean;
  version: boolean;
  quiet: boolean;
};

function readPackageVersion(): string {
  try {
    // dist/cli.js → package root
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readPackageVersion();

function printHelp(): void {
  process.stdout.write(`bible-linkify v${VERSION}

Linkify unlinked Scripture references in Markdown to portable route.bible URLs.

Usage:
  bible-linkify [options] [paths...]

Modes:
  --check     Exit 1 if any file would change (default; good for CI)
  --write     Write linkified Markdown back to disk
  --diff      Print unified diffs; do not write
  --report    Print a JSON report of matches and changes

Options:
  --base-url <url>          Destination origin (default: https://route.bible)
  --src <tag>               Optional src= query tag
  --rewrite-existing        Rewrite existing MD links whose label is a passage
  --no-detect-translation   Do not attach ?v= from trailing (ESV) markers
  --exclude <glob>          Exclude glob (repeatable)
  --config <path>           Config file (default: .bible-linkify.yml)
  --cwd <path>              Working directory (default: process.cwd())
  --quiet                   Less output
  -h, --help                Show help
  -v, --version             Show version

Config file (.bible-linkify.yml):
  paths:
    - "docs/**/*.md"
    - "README.md"
  exclude:
    - "**/CHANGELOG.md"
  baseUrl: https://route.bible
  src: docs
  rewriteExisting: false
  detectTranslation: true

Examples:
  bible-linkify --check README.md docs
  bible-linkify --write "docs/**/*.md"
  bible-linkify --diff
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    mode: "check",
    paths: [],
    exclude: [],
    cwd: process.cwd(),
    help: false,
    version: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      args.version = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    if (arg === "--check") {
      args.mode = "check";
      continue;
    }
    if (arg === "--write") {
      args.mode = "write";
      continue;
    }
    if (arg === "--diff" || arg === "--dry-run") {
      args.mode = "diff";
      continue;
    }
    if (arg === "--report") {
      args.mode = "report";
      continue;
    }
    if (arg === "--rewrite-existing") {
      args.rewriteExisting = true;
      continue;
    }
    if (arg === "--no-detect-translation") {
      args.detectTranslation = false;
      continue;
    }
    if (arg === "--base-url") {
      args.baseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg === "--src") {
      args.src = argv[++i];
      continue;
    }
    if (arg.startsWith("--src=")) {
      args.src = arg.slice("--src=".length);
      continue;
    }
    if (arg === "--exclude") {
      const value = argv[++i];
      if (value) {
        args.exclude.push(value);
      }
      continue;
    }
    if (arg.startsWith("--exclude=")) {
      args.exclude.push(arg.slice("--exclude=".length));
      continue;
    }
    if (arg === "--config") {
      args.configPath = argv[++i];
      continue;
    }
    if (arg.startsWith("--config=")) {
      args.configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--cwd") {
      args.cwd = resolve(argv[++i] ?? process.cwd());
      continue;
    }
    if (arg.startsWith("--cwd=")) {
      args.cwd = resolve(arg.slice("--cwd=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    args.paths.push(arg);
  }

  return args;
}

function toLinkifyOptions(config: BibleLinkifyConfig): LinkifyOptions {
  return {
    baseUrl: config.baseUrl,
    src: config.src,
    rewriteExisting: config.rewriteExisting,
    detectTranslation: config.detectTranslation,
  };
}

function printHumanSummary(results: FileProcessResult[], quiet: boolean): void {
  const changed = results.filter((r) => r.result.changed);
  const totalLinks = results.reduce((sum, r) => sum + r.result.count, 0);

  if (!quiet) {
    for (const item of changed) {
      process.stdout.write(
        `${item.relativePath}: ${item.result.count} reference${item.result.count === 1 ? "" : "s"}\n`,
      );
      for (const change of item.result.changes) {
        process.stdout.write(`  ${change.visible} → ${change.url}\n`);
      }
    }
  }

  process.stdout.write(
    `\n${changed.length} file${changed.length === 1 ? "" : "s"} with ${totalLinks} link${totalLinks === 1 ? "" : "s"} across ${results.length} scanned.\n`,
  );
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const fileConfig = loadConfigFile(args.cwd, args.configPath);
  const cliOverrides: BibleLinkifyConfig = {
    paths: args.paths.length > 0 ? args.paths : undefined,
    exclude: args.exclude.length > 0 ? args.exclude : undefined,
    baseUrl: args.baseUrl,
    src: args.src,
    rewriteExisting: args.rewriteExisting,
    detectTranslation: args.detectTranslation,
  };

  const config = mergeConfig(fileConfig, cliOverrides);
  const defaults = defaultConfig();
  const paths = config.paths ?? defaults.paths ?? ["**/*.{md,mdx,markdown}"];
  const exclude = config.exclude ?? defaults.exclude ?? [];
  const extensions = config.extensions ?? defaults.extensions ?? [".md", ".mdx", ".markdown"];
  const linkifyOptions = toLinkifyOptions(config);

  const files = collectFiles(args.cwd, paths, exclude, extensions);
  if (files.length === 0) {
    process.stderr.write("No Markdown files matched.\n");
    return 0;
  }

  // Always compute against on-disk originals first (never write during scan).
  const results = files.map((file) => processFile(file, args.cwd, linkifyOptions, false));
  const changed = results.filter((r) => r.result.changed);

  if (args.mode === "report") {
    const report = {
      version: VERSION,
      mode: args.mode,
      baseUrl: config.baseUrl,
      scanned: results.length,
      changedFiles: changed.length,
      totalLinks: results.reduce((sum, r) => sum + r.result.count, 0),
      files: results
        .filter((r) => r.result.count > 0)
        .map((r) => ({
          path: r.relativePath,
          count: r.result.count,
          changes: r.result.changes.map((c) => ({
            visible: c.visible,
            canonical: c.canonical,
            url: c.url,
          })),
        })),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  if (args.mode === "diff") {
    for (const item of changed) {
      const original = readFileSync(item.path, "utf8");
      const diff = formatUnifiedDiff(item.relativePath, original, item.result.text);
      if (diff) {
        process.stdout.write(`${diff}\n`);
      }
    }
    printHumanSummary(results, args.quiet);
    return 0;
  }

  if (args.mode === "write") {
    for (const item of changed) {
      processFile(item.path, args.cwd, linkifyOptions, true);
      if (!args.quiet) {
        process.stdout.write(`wrote ${item.relativePath} (${item.result.count})\n`);
      }
    }
    printHumanSummary(results, args.quiet);
    return 0;
  }

  // check mode
  printHumanSummary(results, args.quiet);
  if (changed.length > 0) {
    process.stderr.write(
      "\nUnlinked Scripture references found. Run with --write to apply, or --diff to preview.\n",
    );
    return 1;
  }

  return 0;
}

/**
 * True when this module is the process entrypoint.
 * Must resolve npm/pnpm bin *symlinks* via realpath — otherwise `npx bible-linkify`
 * never calls process.exit and --check always exits 0.
 */
export function isDirectRun(
  entryPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    const resolvedEntry = realpathSync(resolve(entryPath));
    return moduleUrl === pathToFileURL(resolvedEntry).href;
  } catch {
    const base = entryPath.replace(/\\/g, "/");
    return /(^|\/)(bible-linkify|cli)(\.[cm]?[jt]s)?$/.test(base);
  }
}

if (isDirectRun()) {
  runCli()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(1);
    });
}
