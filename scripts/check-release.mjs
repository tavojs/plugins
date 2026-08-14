import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repositoryUrl = "git+https://github.com/tavojs/plugins.git";
const publicPackages = [
  ["@tavojs/analytics", "packages/analytics"],
  ["@tavojs/sitemap", "packages/sitemap"],
  ["@tavojs/structured-data", "packages/structured-data"]
];
const privatePackages = [
  ["@tavojs/auth", "packages/auth"],
  ["@tavojs/fsm", "packages/fsm"]
];
const expectedAuthor = "Hrachya Martirosyan";
const expectedCopyright = "Copyright (c) 2026 Hrachya Martirosyan and contributors";
const legalFiles = [
  "LICENSE",
  "packages/analytics/LICENSE",
  "packages/sitemap/LICENSE",
  "packages/structured-data/LICENSE"
];
const publicLegalEntries = ["LICENSE", "CONTRIBUTING.md", "TRADEMARKS.md", "SECURITY.md"];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dependencyEntries(packageJson) {
  return [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.devDependencies ?? {}),
    ...Object.entries(packageJson.optionalDependencies ?? {}),
    ...Object.entries(packageJson.peerDependencies ?? {})
  ];
}

const rootPackage = readJson("package.json");
const lockfile = readJson("package-lock.json");

assert(rootPackage.private === true, "The workspace root must remain private.");
assert(rootPackage.license === "MIT", "The workspace root must remain MIT-licensed.");
assert(rootPackage.packageManager === "npm@11.5.1", "Trusted publishing requires the pinned npm release.");
assert(rootPackage.repository?.url === repositoryUrl, "Root repository metadata must target tavojs/plugins.");

for (const [, directory] of publicPackages) {
  assert(rootPackage.workspaces?.includes(directory) || rootPackage.workspaces?.includes("packages/*"), `${directory} must be a root workspace.`);
}

const rootLicense = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
for (const licensePath of legalFiles) {
  const license = fs.readFileSync(path.join(root, licensePath), "utf8");
  assert(license.includes(expectedCopyright), `${licensePath} has an incorrect copyright notice.`);
  assert(license === rootLicense, `${licensePath} must exactly match the root LICENSE.`);
}

const exportScriptPath = path.join(root, "scripts/export-public.mjs");
if (fs.existsSync(exportScriptPath)) {
  const exportScript = fs.readFileSync(exportScriptPath, "utf8");
  const publicEntriesSource = exportScript.match(/const sharedEntries = \[([\s\S]*?)\];/)?.[1] ?? "";
  for (const legalEntry of publicLegalEntries) {
    assert(
      publicEntriesSource.includes(`"${legalEntry}"`),
      `Public export must include ${legalEntry}.`
    );
  }
  assert(publicEntriesSource.includes('"packages/analytics"'), "Public export must include packages/analytics.");
  assert(publicEntriesSource.includes('"packages/sitemap"'), "Public export must include packages/sitemap.");
  assert(publicEntriesSource.includes('"packages/structured-data"'), "Public export must include packages/structured-data.");
  assert(!publicEntriesSource.includes('"packages/auth"'), "Public export must exclude packages/auth.");
  assert(!publicEntriesSource.includes('"packages/fsm"'), "Public export must exclude packages/fsm.");
}

for (const legalEntry of publicLegalEntries) {
  assert(fs.existsSync(path.join(root, legalEntry)), `Root legal file is missing: ${legalEntry}.`);
}

for (const [expectedName, directory] of publicPackages) {
  const manifestPath = `${directory}/package.json`;
  const sourcePath = `${directory}/src/index.ts`;
  const packageJson = readJson(manifestPath);
  const source = fs.readFileSync(path.join(root, sourcePath), "utf8");

  assert(packageJson.name === expectedName, `${manifestPath} must publish as ${expectedName}.`);
  assert(packageJson.private !== true, `${expectedName} must remain publishable.`);
  assert(packageJson.author === expectedAuthor, `${expectedName} author metadata is incorrect.`);
  assert(packageJson.license === "MIT", `${expectedName} must remain MIT-licensed.`);
  assert(packageJson.repository?.url === repositoryUrl, `${expectedName} repository URL is incorrect.`);
  assert(packageJson.repository?.directory === directory, `${expectedName} repository directory is incorrect.`);
  assert(packageJson.publishConfig?.access === "public", `${expectedName} must publish with public access.`);
  assert(
    packageJson.publishConfig?.registry === "https://registry.npmjs.org/",
    `${expectedName} must publish to npmjs.org.`
  );
  assert(packageJson.peerDependencies?.["@tavojs/core"] === "^1.0.0", `${expectedName} must peer on core 1.x.`);
  assert(packageJson.devDependencies?.["@tavojs/core"] === "^1.0.1", `${expectedName} tests must use released core.`);

  for (const requiredFile of ["README.md", "CHANGELOG.md", "LICENSE"]) {
    assert(fs.existsSync(path.join(root, directory, requiredFile)), `${expectedName} is missing ${requiredFile}.`);
    assert(packageJson.files?.includes(requiredFile), `${expectedName} must publish ${requiredFile}.`);
  }

  for (const [dependency, range] of dependencyEntries(packageJson)) {
    assert(
      !range.startsWith("file:") && !range.startsWith("workspace:") && !path.isAbsolute(range),
      `${expectedName} has a non-publishable range for ${dependency}: ${range}`
    );
  }

  const escapedVersion = packageJson.version.replaceAll(".", "\\.");
  assert(
    new RegExp(`\\bversion:\\s*["']${escapedVersion}["']`).test(source),
    `${expectedName} descriptor version must match package.json ${packageJson.version}.`
  );

  const lockPackage = lockfile.packages?.[directory];
  assert(lockPackage?.version === packageJson.version, `${expectedName} lockfile version must match package.json.`);
}

for (const [expectedName, directory] of privatePackages) {
  const manifestPath = `${directory}/package.json`;
  if (!fs.existsSync(path.join(root, manifestPath))) {
    assert(!rootPackage.workspaces?.includes(directory), `${directory} must not be listed in the public workspace manifest.`);
    assert(lockfile.packages?.[directory] === undefined, `${directory} must not be present in the public lockfile.`);
    continue;
  }

  const packageJson = readJson(manifestPath);
  const lockPackage = lockfile.packages?.[directory];

  assert(packageJson.name === expectedName, `${manifestPath} must remain ${expectedName}.`);
  assert(packageJson.private === true, `${expectedName} must remain a private workspace.`);
  assert(packageJson.author === expectedAuthor, `${expectedName} author metadata is incorrect.`);
  assert(packageJson.license === "MIT", `${expectedName} must remain MIT-licensed.`);
  assert(packageJson.publishConfig === undefined, `${expectedName} must not define publishConfig.`);
  assert(fs.existsSync(path.join(root, directory, "LICENSE")), `${expectedName} is missing LICENSE.`);
  assert(packageJson.files?.includes("LICENSE"), `${expectedName} must retain LICENSE in its files list.`);
  assert(lockPackage?.version === packageJson.version, `${expectedName} lockfile version must match package.json.`);
  assert(rootPackage.workspaces?.includes(directory) || rootPackage.workspaces?.includes("packages/*"), `${directory} must be a private-root workspace.`);
  assert(fs.readFileSync(path.join(root, directory, "LICENSE"), "utf8") === rootLicense, `${directory}/LICENSE must exactly match the root LICENSE.`);
}

const serializedLockfile = JSON.stringify(lockfile);
for (const [label, pattern] of [
  ["file dependency", /["']file:/],
  ["private core checkout", /(?:\.\.\/)+pin(?:\/|["'])/],
  ["absolute user path", /\/(?:Users|home)\/[^/\s]+/]
]) {
  assert(!pattern.test(serializedLockfile), `package-lock.json contains ${label}.`);
}

const presentPrivatePackages = privatePackages
  .filter(([, directory]) => fs.existsSync(path.join(root, directory, "package.json")))
  .map(([name]) => name);
const privateSummary = presentPrivatePackages.length > 0
  ? ` and private workspaces ${presentPrivatePackages.join(", ")}`
  : "";

console.log(
  `Release manifest check passed for public packages ${publicPackages.map(([name]) => name).join(", ")}${privateSummary}.`
);
