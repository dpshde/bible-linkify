import { extractPassageMatches, type PassageTextMatch } from "./matcher";
import { collectProtectedTokens, type ProtectedToken } from "./protect";
import { buildMarkdownRouteLink, buildRouteBibleUrl, DEFAULT_BASE_URL, type BuildRouteUrlOptions } from "./urls";

export type LinkifyOptions = {
  /** route.bible origin (default https://route.bible) */
  baseUrl?: string;
  /** Optional src= query tag for analytics */
  src?: string;
  /** When true, rewrite existing MD links whose label is a full passage */
  rewriteExisting?: boolean;
  /** Attach ?v=CODE when a trailing (ESV)-style translation is detected */
  detectTranslation?: boolean;
};

export type LinkifyChange = {
  start: number;
  end: number;
  original: string;
  replacement: string;
  canonical: string;
  visible: string;
  url: string;
};

export type LinkifyResult = {
  text: string;
  count: number;
  changes: LinkifyChange[];
  changed: boolean;
};

function urlOptionsForMatch(match: PassageTextMatch, options: LinkifyOptions): BuildRouteUrlOptions {
  return {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    src: options.src,
    translation: options.detectTranslation === false ? undefined : match.translation,
  };
}

function linkifyPlainText(text: string, options: LinkifyOptions): LinkifyResult {
  const matches = extractPassageMatches(text);
  if (!matches.length) {
    return { text, count: 0, changes: [], changed: false };
  }

  let cursor = 0;
  let output = "";
  const changes: LinkifyChange[] = [];

  for (const match of matches) {
    output += text.slice(cursor, match.start);
    const urlOpts = urlOptionsForMatch(match, options);
    const replacement = buildMarkdownRouteLink(match.text, match.parsed, urlOpts);
    const url = buildRouteBibleUrl(match.parsed, urlOpts);

    changes.push({
      start: match.start,
      end: match.end,
      original: match.text,
      replacement,
      canonical: match.parsed.canonical,
      visible: match.text,
      url,
    });

    output += replacement;
    cursor = match.end;
  }

  output += text.slice(cursor);
  return {
    text: output,
    count: changes.length,
    changes,
    changed: changes.length > 0,
  };
}

function maybeRewriteMarkdownLink(tokenText: string, options: LinkifyOptions): LinkifyResult {
  if (!options.rewriteExisting) {
    return { text: tokenText, count: 0, changes: [], changed: false };
  }

  const match = tokenText.match(/^(!?)\[([^\]\n]+)\]\(([^)\n]+)\)$/);
  if (!match || match[1]) {
    return { text: tokenText, count: 0, changes: [], changed: false };
  }

  const label = match[2]?.trim();
  if (!label) {
    return { text: tokenText, count: 0, changes: [], changed: false };
  }

  const passages = extractPassageMatches(label);
  if (passages.length !== 1 || passages[0]?.text.trim() !== label) {
    return { text: tokenText, count: 0, changes: [], changed: false };
  }

  const passage = passages[0];
  const urlOpts = urlOptionsForMatch(passage, options);
  const replacement = buildMarkdownRouteLink(passage.text, passage.parsed, urlOpts);
  const url = buildRouteBibleUrl(passage.parsed, urlOpts);

  // Keep original label spelling (already in passage.text which equals label)
  return {
    text: replacement,
    count: 1,
    changes: [
      {
        start: 0,
        end: tokenText.length,
        original: tokenText,
        replacement,
        canonical: passage.parsed.canonical,
        visible: passage.text,
        url,
      },
    ],
    changed: true,
  };
}

function shiftChanges(changes: LinkifyChange[], offset: number): LinkifyChange[] {
  return changes.map((change) => ({
    ...change,
    start: change.start + offset,
    end: change.end + offset,
  }));
}

/**
 * Linkify unlinked Scripture references in Markdown source.
 *
 * Preserves author-visible wording. Skips fenced/inline code, frontmatter,
 * wikilinks, HTML tags, and existing Markdown links (unless rewriteExisting).
 */
export function linkifyMarkdown(source: string, options: LinkifyOptions = {}): LinkifyResult {
  const tokens = collectProtectedTokens(source);
  let cursor = 0;
  let count = 0;
  let output = "";
  const changes: LinkifyChange[] = [];

  const processPlain = (slice: string, absoluteStart: number): void => {
    const plain = linkifyPlainText(slice, options);
    output += plain.text;
    count += plain.count;
    changes.push(...shiftChanges(plain.changes, absoluteStart));
  };

  for (const token of tokens) {
    processPlain(source.slice(cursor, token.start), cursor);

    const tokenText = source.slice(token.start, token.end);
    if (token.kind === "markdown_link") {
      const rewritten = maybeRewriteMarkdownLink(tokenText, options);
      output += rewritten.text;
      count += rewritten.count;
      if (rewritten.changed) {
        changes.push(
          ...rewritten.changes.map((change) => ({
            ...change,
            start: token.start,
            end: token.end,
          })),
        );
      }
    } else {
      output += tokenText;
    }

    cursor = token.end;
  }

  processPlain(source.slice(cursor), cursor);

  return {
    text: output,
    count,
    changes,
    changed: count > 0 && output !== source,
  };
}

export type { ProtectedToken, PassageTextMatch };
