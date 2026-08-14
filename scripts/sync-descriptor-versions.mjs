import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageDirectories = ["analytics", "auth", "fsm", "sitemap", "structured-data"];

for (const directory of packageDirectories) {
  const packageRoot = path.join(root, "packages", directory);
  const manifestPath = path.join(packageRoot, "package.json");
  const sourcePath = path.join(packageRoot, "src/index.ts");

  if (!fs.existsSync(manifestPath)) continue;

  const packageJson = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const source = fs.readFileSync(sourcePath, "utf8");
  const versionPattern = /\bversion:\s*(["'])\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\1/;
  const matches = source.match(new RegExp(versionPattern.source, "g")) ?? [];

  if (matches.length !== 1) {
    throw new Error(
      `packages/${directory}/src/index.ts must contain exactly one plugin descriptor version; found ${matches.length}.`
    );
  }

  const updated = source.replace(versionPattern, `version: "${packageJson.version}"`);
  if (updated !== source) {
    fs.writeFileSync(sourcePath, updated);
    console.log(`Updated ${directory} descriptor to ${packageJson.version}.`);
  }
}
