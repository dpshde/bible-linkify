import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "bible-linkify-"));
}

describe("runCli", () => {
  const logs: string[] = [];
  const errors: string[] = [];

  afterEach(() => {
    logs.length = 0;
    errors.length = 0;
    vi.restoreAllMocks();
  });

  function capture(): void {
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      errors.push(String(chunk));
      return true;
    });
  }

  it("exits 1 in check mode when unlinked refs exist", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "Read John 3:16 today.\n", "utf8");
    capture();

    const code = await runCli(["--check", "--cwd", dir, "README.md"]);
    expect(code).toBe(1);
    expect(logs.join("")).toContain("John 3:16");
  });

  it("writes links with --write", async () => {
    const dir = makeTempDir();
    const file = join(dir, "note.md");
    writeFileSync(file, "See Romans 8:28.\n", "utf8");
    capture();

    const code = await runCli(["--write", "--cwd", dir, "note.md"]);
    expect(code).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("[Romans 8:28](https://route.bible/rom.8.28)");
  });

  it("exits 0 in check mode when clean", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "clean.md"), "See [John 3:16](https://route.bible/jhn.3.16).\n", "utf8");
    capture();

    const code = await runCli(["--check", "--cwd", dir, "clean.md"]);
    expect(code).toBe(0);
  });

  it("emits JSON in report mode", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.md"), "Psalm 23\n", "utf8");
    capture();

    const code = await runCli(["--report", "--cwd", dir, "a.md"]);
    expect(code).toBe(0);
    const payload = JSON.parse(logs.join(""));
    expect(payload.totalLinks).toBe(1);
    expect(payload.files[0].changes[0].canonical).toBe("PSA.23");
  });
});
