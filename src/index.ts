export {
  linkifyMarkdown,
  type LinkifyOptions,
  type LinkifyResult,
  type LinkifyChange,
} from "./linkify";

export {
  extractPassageMatches,
  type PassageTextMatch,
} from "./matcher";

export {
  buildMarkdownRouteLink,
  buildRouteBibleUrl,
  normalizeBaseUrl,
  DEFAULT_BASE_URL,
  type BuildRouteUrlOptions,
} from "./urls";

export {
  collectProtectedTokens,
  type ProtectedToken,
} from "./protect";

export {
  loadConfigFile,
  mergeConfig,
  defaultConfig,
  type BibleLinkifyConfig,
} from "./config";

export {
  collectFiles,
  processFile,
  formatUnifiedDiff,
  type FileProcessResult,
} from "./files";
