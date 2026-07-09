import { describe, expect, it } from "vitest";
import { extractPassageMatches } from "../src/matcher";
import { linkifyMarkdown } from "../src/linkify";

describe("extractPassageMatches", () => {
  it("finds common full and abbreviated references", () => {
    expect(extractPassageMatches("John 3:16").map((m) => m.text)).toEqual(["John 3:16"]);
    expect(extractPassageMatches("Rom. 8:28").map((m) => m.text)).toEqual(["Rom. 8:28"]);
    expect(extractPassageMatches("Rom 8:28").map((m) => m.text)).toEqual(["Rom 8:28"]);
    expect(extractPassageMatches("1 Cor. 13:4-7").map((m) => m.text)).toEqual(["1 Cor. 13:4-7"]);
    expect(extractPassageMatches("1 Corinthians 13:4-7").map((m) => m.text)).toEqual([
      "1 Corinthians 13:4-7",
    ]);
    expect(extractPassageMatches("Jn 3:16").map((m) => m.text)).toEqual(["Jn 3:16"]);
    expect(extractPassageMatches("John 3:16–18").map((m) => m.text)).toEqual(["John 3:16–18"]);
    expect(extractPassageMatches("Psalm 23").map((m) => m.text)).toEqual(["Psalm 23"]);
  });

  it("finds multiple references in one sentence", () => {
    const matches = extractPassageMatches("Read John 3:16 and Romans 8:28.");
    expect(matches.map((m) => m.text)).toEqual(["John 3:16", "Romans 8:28"]);
  });

  it("skips bare ambiguous fragments", () => {
    expect(extractPassageMatches("The score was 3:16 when we left.")).toEqual([]);
  });

  it("detects trailing translation codes", () => {
    const matches = extractPassageMatches("Ephesians 2:8-9 (ESV)");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.translation).toBe("ESV");
  });
});

describe("linkifyMarkdown", () => {
  it("links plain references and preserves visible wording", () => {
    const result = linkifyMarkdown("Read John 3:16 and Rom. 8:28.");
    expect(result.count).toBe(2);
    expect(result.text).toContain("[John 3:16](https://route.bible/jhn.3.16)");
    expect(result.text).toContain("[Rom. 8:28](https://route.bible/rom.8.28)");
  });

  it("links chapter and verse ranges", () => {
    const result = linkifyMarkdown("Read Psalm 23 and 1 Corinthians 13:4-7.");
    expect(result.count).toBe(2);
    expect(result.text).toContain("[Psalm 23](https://route.bible/psa.23)");
    expect(result.text).toContain("[1 Corinthians 13:4-7](https://route.bible/1co.13.4-7)");
  });

  it("attaches translation query when present", () => {
    const result = linkifyMarkdown("Point readers to Ephesians 2:8-9 (ESV).");
    expect(result.count).toBe(1);
    expect(result.text).toContain("[Ephesians 2:8-9](https://route.bible/eph.2.8-9?v=ESV)");
    expect(result.text).toContain("(ESV)");
  });

  it("skips fenced code, inline code, frontmatter, and existing links", () => {
    const source = [
      "---",
      "passage: John 3",
      "---",
      "",
      "Read John 3:16 and https://example.com/John-3:16",
      "`Romans 8:28` should stay code",
      "[Hebrews 11:1](https://example.com/hebrews) should stay linked",
      "```md",
      "Psalm 23:1",
      "```",
    ].join("\n");

    const result = linkifyMarkdown(source);
    expect(result.count).toBe(1);
    expect(result.text).toContain("[John 3:16](https://route.bible/jhn.3.16)");
    expect(result.text).toContain("https://example.com/John-3:16");
    expect(result.text).toContain("`Romans 8:28`");
    expect(result.text).toContain("[Hebrews 11:1](https://example.com/hebrews)");
    expect(result.text).toContain("passage: John 3");
    expect(result.text).toContain("Psalm 23:1");
  });

  it("does not nest links inside existing route.bible links", () => {
    const source = "Compare [John 1:1](https://route.bible/jhn.1.1) with Genesis 1:1.";
    const result = linkifyMarkdown(source);
    expect(result.count).toBe(1);
    expect(result.text).toContain("[John 1:1](https://route.bible/jhn.1.1)");
    expect(result.text).toContain("[Genesis 1:1](https://route.bible/gen.1.1)");
    expect(result.text).not.toContain("[[John 1:1]");
  });

  it("rewrites existing links only when override is enabled", () => {
    const source = "[John 3:16](https://example.com/john-3-16)";

    const untouched = linkifyMarkdown(source);
    expect(untouched.count).toBe(0);
    expect(untouched.text).toBe(source);

    const rewritten = linkifyMarkdown(source, { rewriteExisting: true });
    expect(rewritten.count).toBe(1);
    expect(rewritten.text).toBe("[John 3:16](https://route.bible/jhn.3.16)");
  });

  it("is idempotent on already-linkified markdown", () => {
    const once = linkifyMarkdown("John 3:16 and Romans 8:28");
    const twice = linkifyMarkdown(once.text);
    expect(twice.count).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it("supports custom base URL and src tag", () => {
    const result = linkifyMarkdown("John 3:16", {
      baseUrl: "https://route.bible/",
      src: "ci",
    });
    expect(result.text).toBe("[John 3:16](https://route.bible/jhn.3.16?src=ci)");
  });
});
