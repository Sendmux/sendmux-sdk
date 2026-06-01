import { existsSync } from "node:fs";
import { join } from "node:path";

const languages = ["ts", "python", "go", "php", "ruby"];
const surfaces = ["core", "sending", "mailbox", "management", "sdk"];
const roots = {
  go: "go",
};

const missing = [];

for (const language of languages) {
  for (const surface of surfaces) {
    const path = join(roots[language] ?? join("packages", language), surface);
    if (!existsSync(path)) {
      missing.push(path);
    }
  }
}

if (missing.length > 0) {
  console.error(`Missing package skeletons:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("SDK package layout verified.");
