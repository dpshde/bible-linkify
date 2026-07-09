# bible-linkify Agent Guide

## Purpose

Deterministic Markdown linkifier: unlinked Scripture refs → `https://route.bible/...` links for CLI/CI.

Public standalone package (same pattern as `grab-bcv`). Consumed from npm; not developed inside private monorepos.

## Boundaries

- Depends on external npm `grab-bcv` only — do not vendor parser logic.
- Keep editor-specific UX (Obsidian, etc.) out of this package.
- Policy should stay aligned with `dpshde/bible-links` skill (preserve visible text, skip code, skip existing links).

## Validation

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## Layout

- `src/linkify.ts` — core transform
- `src/matcher.ts` — passage span finder
- `src/cli.ts` — CLI entry (`bible-linkify`)
- `action.yml` — composite GitHub Action (`dpshde/bible-linkify`)
