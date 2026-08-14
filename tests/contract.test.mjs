import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { checkPluginCompatibility } from "@tavojs/core/plugin";
import { createAnalyticsPlugin } from "@tavojs/analytics";

const root = path.resolve(import.meta.dirname, "..");
const packagesRoot = path.join(root, "packages");
const packages = ["analytics", "auth", "fsm", "sitemap", "structured-data"].filter((name) =>
  existsSync(path.join(packagesRoot, name, "package.json"))
);
const supportedNodeRange = "^20.19.0 || >=22.12.0";

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute));
    else files.push(absolute);
  }
  return files;
}

test("published descriptors bake Plugin API v1 and package metadata targets Tavo.js 1.0", async () => {
  for (const packageDirectory of packages) {
    const packageJson = JSON.parse(
      await readFile(path.join(packagesRoot, packageDirectory, "package.json"), "utf8")
    );
    const source = await readFile(
      path.join(packagesRoot, packageDirectory, "src/index.ts"),
      "utf8"
    );
    const output = await readFile(
      path.join(packagesRoot, packageDirectory, "dist/index.js"),
      "utf8"
    );

    assert.equal(packageJson.peerDependencies["@tavojs/core"], "^1.0.0");
    assert.equal(packageJson.engines.node, supportedNodeRange);
    assert.match(source, /\bapiVersion:\s*1\b/);
    assert.doesNotMatch(source, /\bTAVO_PLUGIN_API_VERSION\b/);
    assert.match(output, /\bapiVersion:\s*1\b/);
  }
});

test("maintained package files use only the Tavo.js 1.0 import boundaries", async () => {
  const removedSubpath = /@tavojs\/core\/(?:auto-pages|framework|ssr|session|style|store|client|dom|refs|elements|focus|observers|head|image|font|script|seo|deferred|lazy|mvc|resource|i18n|action|form|testing|instrumentation|validation|scheduler|devtools|diagnostics|stability)\b/;
  const removedContract = /\b(?:TAVO_PLUGIN_API_VERSION|unsafeHtml|headHtml|apiVersion:\s*2)\b/;

  for (const packageDirectory of packages) {
    for (const file of await filesBelow(path.join(packagesRoot, packageDirectory))) {
      const contents = await readFile(file, "utf8");
      assert.doesNotMatch(contents, removedSubpath, file);
      assert.doesNotMatch(contents, removedContract, file);
    }
  }
});

test("client, server, and build phases stay behind separate module boundaries", async () => {
  const expectedDynamicPhases = {
    analytics: ["server"],
    auth: ["server", "build"],
    fsm: ["phase"],
    sitemap: ["server", "build"],
    "structured-data": ["server"]
  };

  for (const [packageDirectory, phases] of Object.entries(expectedDynamicPhases)) {
    if (!packages.includes(packageDirectory)) continue;
    const output = await readFile(
      path.join(packagesRoot, packageDirectory, "dist/index.js"),
      "utf8"
    );
    for (const phase of phases) {
      assert.ok(output.includes(`import("./${phase}.js")`));
      assert.ok(!output.includes(`from "./${phase}.js"`));
    }
  }

  for (const packageDirectory of ["analytics", "auth"]) {
    if (!packages.includes(packageDirectory)) continue;
    const client = await readFile(
      path.join(packagesRoot, packageDirectory, "dist/client.js"),
      "utf8"
    );
    assert.doesNotMatch(client, /(?:server|build)\.js/);
    assert.doesNotMatch(client, /@tavojs\/core\/server/);
  }
});

test("incompatible or missing API versions reject before phase execution", () => {
  const valid = createAnalyticsPlugin({
    googleAnalytics: { measurementId: "G-CONTRACT1" }
  });

  for (const apiVersion of [undefined, 2]) {
    let phaseExecuted = false;
    const incompatible = {
      ...valid,
      ...(apiVersion === undefined ? {} : { apiVersion }),
      server: async () => {
        phaseExecuted = true;
        return {};
      }
    };
    if (apiVersion === undefined) delete incompatible.apiVersion;

    const result = checkPluginCompatibility(incompatible);
    assert.equal(result.compatible, false);
    assert.equal(result.diagnostic?.code, "TAVO_PLUGIN_001");
    assert.equal(phaseExecuted, false);
  }
});
