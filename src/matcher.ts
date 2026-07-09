import { formatPassageForDisplay, parsePassage, tryParseAnyPassage, type ParsedPassage } from "grab-bcv";

export type PassageTextMatch = {
  start: number;
  end: number;
  text: string;
  display: string;
  parsed: ParsedPassage;
  translation?: string;
};

type CandidateWindow = {
  start: number;
  end: number;
};

const MAX_CANDIDATE_WINDOWS = 512;

// Numbered books with optional abbreviation period: "1 Cor. 13:4-7", "1 John 1:1"
// Require a word boundary before the leading digit so "Psalm 23 and 1 Cor..." does not
// match the trailing "3" of "23" as the start of a numbered book.
const NUMBERED_REFERENCE_REGEX =
  /\b[1-3]\s+[A-Za-z]+\.?(?:\s+of\s+[A-Za-z]+)?\s+\d+(?:(?::|\s)\d+(?:\s*[‐‑‒–—-]\s*\d+)?)?/g;

// Unnumbered books + OSIS-ish tokens. Allows "Rom. 8:28", "John 3:16–18", "Jn 3:16".
const REFERENCE_CANDIDATE_REGEX =
  /\b[1-3]?[A-Za-z]{2,}\.\d+(?:\.\d+)?(?:-[1-3]?[A-Za-z]{2,}\.\d+\.\d+|-\d+)?(?:\.[A-Za-z0-9]{2,8})?|\b(?:[1-3]\s+)?[A-Za-z]+\.?(?:\s+of\s+[A-Za-z]+)?\s+\d+(?:(?::|\s)\d+(?:\s*[‐‑‒–—-]\s*\d+)?)?/g;

const LEADING_WRAPPER_REGEX = /^[([{"'`]+/;
const TRAILING_WRAPPER_REGEX = /[)\]}",;.!?'`]+$/;
const WORD_CHAR_REGEX = /[A-Za-z0-9]/;
const URLISH_TOKEN_REGEX = /(?:https?:\/\/|www\.)/i;
const TRAILING_TRANSLATION_REGEX = /^\s*\(([A-Za-z0-9]{2,12})\)/;

function hasPassageSignal(text: string): boolean {
  return /[A-Za-z]/.test(text) && /\d/.test(text);
}

function trimCandidateBounds(text: string, start: number, end: number): { start: number; end: number } {
  let nextStart = start;
  let nextEnd = end;

  while (nextStart < nextEnd && LEADING_WRAPPER_REGEX.test(text[nextStart] ?? "")) {
    nextStart += 1;
  }

  while (nextEnd > nextStart && TRAILING_WRAPPER_REGEX.test(text[nextEnd - 1] ?? "")) {
    nextEnd -= 1;
  }

  return { start: nextStart, end: nextEnd };
}

function isStandaloneToken(text: string, start: number, end: number): boolean {
  const before = start > 0 ? (text[start - 1] ?? "") : "";
  const after = end < text.length ? (text[end] ?? "") : "";
  return !WORD_CHAR_REGEX.test(before) && !WORD_CHAR_REGEX.test(after);
}

function isWithinUrlishToken(text: string, start: number, end: number): boolean {
  let tokenStart = start;
  let tokenEnd = end;

  while (tokenStart > 0 && !(text[tokenStart - 1] ?? "").match(/\s/)) {
    tokenStart -= 1;
  }

  while (tokenEnd < text.length && !(text[tokenEnd] ?? "").match(/\s/)) {
    tokenEnd += 1;
  }

  return URLISH_TOKEN_REGEX.test(text.slice(tokenStart, tokenEnd));
}

function collectCandidateWindowsByStart(text: string): Map<number, CandidateWindow[]> {
  const deduped = new Set<string>();
  const windowsByStart = new Map<number, CandidateWindow[]>();
  let total = 0;

  const addMatches = (pattern: RegExp): void => {
    for (const match of text.matchAll(pattern)) {
      if (total >= MAX_CANDIDATE_WINDOWS) {
        return;
      }

      const value = match[0];
      if (!value) {
        continue;
      }

      const start = match.index ?? 0;
      const end = start + value.length;
      const key = `${start}:${end}`;
      if (deduped.has(key)) {
        continue;
      }

      deduped.add(key);
      total += 1;
      const existing = windowsByStart.get(start);
      const candidate = { start, end };
      if (existing) {
        existing.push(candidate);
      } else {
        windowsByStart.set(start, [candidate]);
      }
    }
  };

  addMatches(NUMBERED_REFERENCE_REGEX);
  addMatches(REFERENCE_CANDIDATE_REGEX);

  for (const candidates of windowsByStart.values()) {
    candidates.sort((left, right) => right.end - left.end);
  }

  return windowsByStart;
}

function parseCandidate(value: string): ParsedPassage | null {
  const parsed = tryParseAnyPassage(value);
  return parsed.ok && !Array.isArray(parsed.value) ? parsed.value : null;
}

function detectTrailingTranslation(text: string, end: number): string | undefined {
  const trailing = text.slice(end);
  const match = trailing.match(TRAILING_TRANSLATION_REGEX);
  if (!match?.[1]) {
    return undefined;
  }

  // Avoid treating normal parentheticals as translations ("(and more)", "(cf. Paul)")
  const code = match[1];
  if (!/^[A-Za-z0-9]{2,12}$/.test(code)) {
    return undefined;
  }

  // Prefer common translation-code shape: mostly letters, optional digits (e.g. NASB, NIV, ESV, KJV, CSB, NLT, BSB, NET)
  if (!/^[A-Za-z]{2,8}\d{0,2}$/.test(code)) {
    return undefined;
  }

  return code.toUpperCase();
}

export function extractPassageMatches(text: string): PassageTextMatch[] {
  if (!hasPassageSignal(text)) {
    return [];
  }

  const matches: PassageTextMatch[] = [];
  let consumedUntil = 0;
  const windowsByStart = collectCandidateWindowsByStart(text);
  const starts = Array.from(windowsByStart.keys()).sort((left, right) => left - right);

  for (const startIndex of starts) {
    if (startIndex < consumedUntil) {
      continue;
    }

    const candidates = windowsByStart.get(startIndex);
    if (!candidates) {
      continue;
    }

    for (const candidate of candidates) {
      const { start, end } = trimCandidateBounds(text, candidate.start, candidate.end);
      if (start >= end || start < consumedUntil) {
        continue;
      }

      if (!isStandaloneToken(text, start, end) || isWithinUrlishToken(text, start, end)) {
        continue;
      }

      const value = text.slice(start, end);
      const parsed = parseCandidate(value);
      if (!parsed) {
        continue;
      }

      // Sanity: re-parse via parsePassage on canonical to ensure grab-bcv accepts it
      try {
        parsePassage(parsed.canonical);
      } catch {
        continue;
      }

      matches.push({
        start,
        end,
        text: value,
        display: formatPassageForDisplay(parsed),
        parsed,
        translation: detectTrailingTranslation(text, end),
      });
      consumedUntil = end;
      break;
    }
  }

  return matches;
}
