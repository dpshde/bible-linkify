import { parseToResolverUrl, type ParsedPassage } from "grab-bcv";

export const DEFAULT_BASE_URL = "https://route.bible";

export type BuildRouteUrlOptions = {
  baseUrl?: string;
  translation?: string;
  src?: string;
};

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function buildRouteBibleUrl(
  parsed: ParsedPassage,
  options: BuildRouteUrlOptions = {},
): string {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = new URL(parseToResolverUrl(baseUrl, parsed));

  if (options.translation?.trim()) {
    url.searchParams.set("v", options.translation.trim().toUpperCase());
  }

  if (options.src?.trim()) {
    url.searchParams.set("src", options.src.trim());
  }

  return url.toString();
}

export function buildMarkdownRouteLink(
  visibleText: string,
  parsed: ParsedPassage,
  options: BuildRouteUrlOptions = {},
): string {
  return `[${visibleText}](${buildRouteBibleUrl(parsed, options)})`;
}
