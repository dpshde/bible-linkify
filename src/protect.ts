export type ProtectedToken = {
  start: number;
  end: number;
  kind: "frontmatter" | "fence" | "inline_code" | "markdown_link" | "wikilink" | "html";
};

const INLINE_CODE_REGEX = /`+[^`\n]*`+/g;
const WIKILINK_REGEX = /\[\[[^\]\n]+\]\]/g;
const MARKDOWN_LINK_REGEX = /!?\[([^\]\n]*)\]\(([^)\n]+)\)/g;
const HTML_TAG_REGEX = /<\/?[A-Za-z][^>\n]*>/g;

function pushIfNonOverlapping(tokens: ProtectedToken[], token: ProtectedToken): void {
  const overlap = tokens.some((existing) => token.start < existing.end && token.end > existing.start);
  if (!overlap) {
    tokens.push(token);
  }
}

function findFrontmatter(source: string): ProtectedToken[] {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return [];
  }

  const firstLineEnd = source.indexOf("\n");
  if (firstLineEnd < 0) {
    return [];
  }

  const searchFrom = firstLineEnd + 1;
  const closingPatterns = ["\n---\n", "\n---\r\n", "\n---"];
  let closingIndex = -1;
  let delimiterLength = 0;

  for (const pattern of closingPatterns) {
    const index = source.indexOf(pattern, searchFrom);
    if (index >= 0 && (closingIndex < 0 || index < closingIndex)) {
      closingIndex = index;
      delimiterLength = pattern.length;
    }
  }

  if (closingIndex < 0) {
    return [];
  }

  return [{ start: 0, end: closingIndex + delimiterLength, kind: "frontmatter" }];
}

function findFencedCodeBlocks(source: string): ProtectedToken[] {
  const tokens: ProtectedToken[] = [];
  const lines = source.match(/.*(?:\n|$)/g) ?? [];
  let offset = 0;
  let activeFence: { character: "`" | "~"; length: number; start: number } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
    const fence = line.match(/^(```+|~~~+)/);
    if (!activeFence) {
      if (fence?.[1]) {
        activeFence = {
          character: fence[1][0] as "`" | "~",
          length: fence[1].length,
          start: offset,
        };
      }
    } else if (
      fence?.[1] &&
      fence[1][0] === activeFence.character &&
      fence[1].length >= activeFence.length
    ) {
      tokens.push({ start: activeFence.start, end: offset + rawLine.length, kind: "fence" });
      activeFence = null;
    }

    offset += rawLine.length;
  }

  if (activeFence) {
    tokens.push({ start: activeFence.start, end: source.length, kind: "fence" });
  }

  return tokens;
}

function findInlineTokens(source: string, regex: RegExp, kind: ProtectedToken["kind"]): ProtectedToken[] {
  const tokens: ProtectedToken[] = [];
  for (const match of source.matchAll(regex)) {
    const value = match[0];
    if (!value) {
      continue;
    }

    const start = match.index ?? 0;
    tokens.push({ start, end: start + value.length, kind });
  }
  return tokens;
}

export function collectProtectedTokens(source: string): ProtectedToken[] {
  const tokens = [
    ...findFrontmatter(source),
    ...findFencedCodeBlocks(source),
    ...findInlineTokens(source, INLINE_CODE_REGEX, "inline_code"),
    ...findInlineTokens(source, WIKILINK_REGEX, "wikilink"),
    ...findInlineTokens(source, MARKDOWN_LINK_REGEX, "markdown_link"),
    ...findInlineTokens(source, HTML_TAG_REGEX, "html"),
  ];

  const result: ProtectedToken[] = [];
  for (const token of tokens.sort((left, right) => left.start - right.start || right.end - left.end)) {
    pushIfNonOverlapping(result, token);
  }
  return result;
}
