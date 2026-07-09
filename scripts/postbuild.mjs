import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cliPath = resolve("dist/cli.js");
const source = readFileSync(cliPath, "utf8");
if (!source.startsWith("#!/usr/bin/env node")) {
  writeFileSync(cliPath, `#!/usr/bin/env node\n${source}`);
}
chmodSync(cliPath, 0o755);
