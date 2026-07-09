# bible-linkify

Deterministic Markdown linkifier for Scripture references → portable [route.bible](https://route.bible) URLs.

Pair of the agent skill [`bible-links`](https://github.com/dpshde/bible-links):

| Surface | When it runs |
| --- | --- |
| **bible-links** (agent skill) | While an agent *writes* Markdown |
| **bible-linkify** (this package) | Over an *existing* docs tree / CI |

```markdown
Read John 3:16 and Rom. 8:28.
→
Read [John 3:16](https://route.bible/jhn.3.16) and [Rom. 8:28](https://route.bible/rom.8.28).
```

Visible wording is preserved. Code fences, inline code, frontmatter, wikilinks, HTML tags, and existing Markdown links are left alone.

Powered by [`grab-bcv`](https://www.npmjs.com/package/grab-bcv).

## Install

```bash
npm i -D bible-linkify
# or
npx bible-linkify --check README.md
```

## CLI

```bash
bible-linkify --check README.md docs          # CI: exit 1 if unlinked refs remain
bible-linkify --write "docs/**/*.md"          # rewrite files in place
bible-linkify --diff                          # preview unified diffs
bible-linkify --report                        # JSON summary
```

### Options

| Flag | Meaning |
| --- | --- |
| `--check` | Fail if any file would change (default) |
| `--write` | Apply changes |
| `--diff` / `--dry-run` | Print diffs only |
| `--report` | JSON report |
| `--base-url <url>` | Default `https://route.bible` |
| `--src <tag>` | Optional `src=` query tag |
| `--rewrite-existing` | Repoint existing MD links whose label is a passage |
| `--no-detect-translation` | Do not add `?v=` from trailing `(ESV)` |
| `--exclude <glob>` | Exclude pattern (repeatable) |
| `--config <path>` | Config file path |
| `--cwd <path>` | Working directory |

### Config file

Optional `.bible-linkify.yml` in the repo root:

```yaml
paths:
  - "README.md"
  - "docs/**/*.md"
exclude:
  - "**/CHANGELOG.md"
baseUrl: https://route.bible
src: docs
rewriteExisting: false
detectTranslation: true
```

See [`.bible-linkify.example.yml`](./.bible-linkify.example.yml).

## Library

```ts
import { linkifyMarkdown } from "bible-linkify";

const { text, count, changes } = linkifyMarkdown(
  "Read John 3:16 and Romans 8:28.",
  { baseUrl: "https://route.bible", src: "docs" },
);
```

## GitHub Action

```yaml
# .github/workflows/bible-links.yml
name: Bible links
on:
  pull_request:
    paths: ["**/*.md", "**/*.mdx"]
  workflow_dispatch:

jobs:
  linkify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dpshde/bible-linkify@main
        with:
          mode: check
          paths: "README.md docs"
```

### Write + open a PR

```yaml
- uses: actions/checkout@v4
- uses: dpshde/bible-linkify@main
  with:
    mode: write
    paths: "docs README.md"
- uses: peter-evans/create-pull-request@v6
  with:
    title: "docs: linkify Scripture references via route.bible"
    commit-message: "docs: linkify Scripture references to route.bible"
    branch: chore/bible-linkify
```

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `mode` | `check` | `check` \| `write` \| `diff` \| `report` |
| `paths` | _(config/default globs)_ | Space-separated paths/globs |
| `base_url` | `https://route.bible` | Resolver origin |
| `src` | | Optional `src=` tag |
| `rewrite_existing` | `false` | Rewrite existing MD links |
| `config` | | Path to config file |
| `working_directory` | `.` | Scan root |

## Safety rules

**Links**
- Unambiguous book + chapter (and optional verse/range)
- Outside protected regions
- Author’s visible spelling preserved (`Rom.` stays `Rom.`)

**Never links**
- Fenced / inline code
- Existing Markdown / HTML links (unless `--rewrite-existing`)
- Frontmatter, wikilinks
- Bare `3:16` with no book
- Tokens inside URLs

## Related

- [`grab-bcv`](https://github.com/dpshde/grab-bcv) — parse + resolve
- [route.bible](https://route.bible) — portable destination
- [`bible-links`](https://github.com/dpshde/bible-links) — agent-time policy skill

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm exec bible-linkify --check README.md
```

## License

MIT
