// Builds the store-ready ZIP (extension files only) into dist/.
// Usage: node scripts/build.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const out = `dist/context-translator-${version}.zip`;
mkdirSync("dist", { recursive: true });

// git archive packs exactly the committed files, so uncommitted changes are not shipped.
execFileSync("git", ["archive", "--format=zip", "-o", out, "HEAD", "manifest.json", "src", "options", "icons", "LICENSE"], { stdio: "inherit" });
console.log(`Built ${out}`);
