import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { inspectPluginGraph } from "@tavojs/core/dev";
import {
  createSitemapPlugin,
  discoverTavoPagePaths,
  renderRobotsTxt,
  renderSitemap
} from "../src/index.js";

async function writePage(root: string, relative: string): Promise<void> {
  const file = join(root, relative);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, "export default function Page() { return null; }\n", "utf8");
}

async function sitemapVitePlugin(plugin: ReturnType<typeof createSitemapPlugin>): Promise<any> {
  const loaded = await plugin.build?.();
  const phase = loaded && "default" in loaded ? loaded.default : loaded;
  return phase?.build?.plugins?.sitemap;
}

type TrailingSlashPolicy = "always" | "never" | "preserve";

function setupContext(trailingSlash: TrailingSlashPolicy) {
  return {
    instanceId: "default",
    resolve() {
      throw new Error("not available in sitemap tests");
    },
    tryResolve() {
      return undefined;
    },
    urlPolicy: {
      trailingSlash,
      canonicalize(value: string) {
        return value;
      }
    }
  } as never;
}

async function setupPluginPhase(
  plugin: ReturnType<typeof createSitemapPlugin>,
  phaseName: "build" | "server",
  trailingSlash: TrailingSlashPolicy
): Promise<any> {
  const loaded = await plugin[phaseName]?.();
  const phase = loaded && "default" in loaded ? loaded.default : loaded;
  await phase?.setup?.(setupContext(trailingSlash));
  return phase;
}

async function callEndpoint(
  plugin: ReturnType<typeof createSitemapPlugin>,
  id: "robots" | "sitemap",
  request: Request,
  trailingSlash?: TrailingSlashPolicy
): Promise<Response | null> {
  const loaded = await plugin.server?.();
  const phase = loaded && "default" in loaded ? loaded.default : loaded;
  if (trailingSlash) await phase?.setup?.(setupContext(trailingSlash));
  const handler = phase?.endpoints?.[id];
  return handler ? handler({ request } as never) : null;
}

function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
}

test("declares standard server exposure and supports application remapping", () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"],
    robots: true
  });
  const defaults = inspectPluginGraph([plugin]);
  const remapped = inspectPluginGraph([{
    plugin,
    expose: { server: "/seo" }
  }]);

  assert.deepEqual(defaults.exposure, [{
    owner: "@tavojs/sitemap#default",
    target: "server",
    from: "/",
    to: "/",
    reason: "Publishes sitemap.xml and optional robots.txt at their standard root paths."
  }]);
  assert.deepEqual(
    defaults.endpoints.map((endpoint) => endpoint.path),
    ["/sitemap.xml", "/robots.txt"]
  );
  assert.deepEqual(
    remapped.endpoints.map((endpoint) => endpoint.path),
    ["/seo/sitemap.xml", "/seo/robots.txt"]
  );
  assert.equal(remapped.exposure[0]?.to, "/seo");
  assert.equal(defaults.valid, true);
  assert.equal(remapped.valid, true);
});

test("serves remapped sitemap paths and advertises the remapped URL", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"],
    robots: true
  });
  const sitemap = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/seo/sitemap.xml")
  );
  const robots = await callEndpoint(
    plugin,
    "robots",
    new Request("https://example.com/seo/robots.txt")
  );

  assert.equal(sitemap?.status, 200);
  assert.match(await robots!.text(), /Sitemap: https:\/\/example\.com\/seo\/sitemap\.xml/);
});

test("renders validated sitemap XML with metadata and localized alternates", async () => {
  const output = await renderSitemap({
    siteUrl: "https://example.com",
    entries: [
      "/",
      {
        path: "/products?category=a&sort=new",
        alternates: {
          en: "/products",
          es: "/es/products",
          "x-default": "/products"
        },
        changeFrequency: "weekly",
        lastModified: "2026-07-20",
        priority: 0.8
      }
    ]
  });

  assert.match(output, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(output, /xmlns:xhtml=/);
  assert.match(output, /<loc>https:\/\/example\.com\/products\?category=a&amp;sort=new<\/loc>/);
  assert.match(output, /hreflang="es" href="https:\/\/example\.com\/es\/products"/);
  assert.match(output, /<lastmod>2026-07-20<\/lastmod>/);
  assert.match(output, /<changefreq>weekly<\/changefreq>/);
  assert.match(output, /<priority>0\.8<\/priority>/);
});

test("normalizes explicit entry and alternate trailing slashes", async () => {
  const output = await renderSitemap({
    siteUrl: "https://example.com",
    entries: [
      { path: "/", trailingSlash: true },
      {
        path: "/about",
        trailingSlash: true,
        alternates: {
          en: "/about",
          es: "https://example.com/es/about/",
          fr: "/fr/about//"
        }
      },
      { path: "https://example.com/contact?from=sitemap", trailingSlash: true },
      { path: "/without/", trailingSlash: false },
      { path: "/remove-file.json/", trailingSlash: false },
      "/llms.txt",
      "/manifest.json",
      "/sitemap.xml",
      { path: "/explicit-file.json", trailingSlash: true }
    ]
  });

  assert.deepEqual(sitemapLocations(output), [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/contact/?from=sitemap",
    "https://example.com/without",
    "https://example.com/remove-file.json",
    "https://example.com/llms.txt",
    "https://example.com/manifest.json",
    "https://example.com/sitemap.xml",
    "https://example.com/explicit-file.json"
  ]);
  assert.match(output, /hreflang="en" href="https:\/\/example\.com\/about\/"/);
  assert.match(output, /hreflang="es" href="https:\/\/example\.com\/es\/about\/"/);
  assert.match(output, /hreflang="fr" href="https:\/\/example\.com\/fr\/about\/"/);
});

test("preserves slash output by default and detects duplicates after normalization", async () => {
  const output = await renderSitemap({
    siteUrl: "https://example.com",
    entries: ["/about", "/contact/", "/asset.json"]
  });

  assert.deepEqual(sitemapLocations(output), [
    "https://example.com/about",
    "https://example.com/contact/",
    "https://example.com/asset.json"
  ]);
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: [
        { path: "/same", trailingSlash: true },
        "https://example.com/same/"
      ]
    }),
    /duplicate URL "https:\/\/example\.com\/same\/"/
  );
});

test("supports async request-time entry sources", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: async ({ mode, request }) => [
      "/",
      `/tenant/${request?.headers.get("x-tenant") ?? mode}`
    ]
  });
  const response = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/sitemap.xml", {
      headers: { "x-tenant": "acme" }
    })
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, s-maxage=3600");
  assert.match(await response.text(), /https:\/\/example\.com\/tenant\/acme/);
});

test("applies framework policies to dynamic entries, alternates, queries, and files", async () => {
  for (const [policy, expected] of [
    ["always", [
      "https://example.com/dynamic/?page=1",
      "https://example.com/already/",
      "https://example.com/sitemap.xml",
      "https://example.com/robots.txt",
      "https://example.com/llms.txt",
      "https://example.com/data.json",
      "https://example.com/image.webp"
    ]],
    ["never", [
      "https://example.com/dynamic?page=1",
      "https://example.com/already",
      "https://example.com/sitemap.xml",
      "https://example.com/robots.txt",
      "https://example.com/llms.txt",
      "https://example.com/data.json",
      "https://example.com/image.webp"
    ]],
    ["preserve", [
      "https://example.com/dynamic?page=1",
      "https://example.com/already/",
      "https://example.com/sitemap.xml",
      "https://example.com/robots.txt",
      "https://example.com/llms.txt",
      "https://example.com/data.json",
      "https://example.com/image.webp"
    ]]
  ] as const) {
    const plugin = createSitemapPlugin({
      siteUrl: "https://example.com",
      autoDiscover: false,
      entries: async () => [{
        path: "/dynamic?page=1",
        alternates: { es: "/es/dynamic?lang=es" }
      }, "/already/", "/sitemap.xml", "/robots.txt", "/llms.txt", "/data.json", "/image.webp"]
    });
    const response = await callEndpoint(
      plugin,
      "sitemap",
      new Request("https://example.com/sitemap.xml"),
      policy
    );
    const output = await response!.text();

    assert.deepEqual(sitemapLocations(output), expected);
    assert.match(
      output,
      policy === "always"
        ? /href="https:\/\/example\.com\/es\/dynamic\/\?lang=es"/
        : /href="https:\/\/example\.com\/es\/dynamic\?lang=es"/
    );
  }
});

test("uses entry, auto-discovery, and framework policy precedence", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    autoDiscover: { trailingSlash: "always" },
    entries: [
      "/from-auto-default",
      { path: "/entry-never/", trailingSlash: "never" },
      { path: "/entry-preserve/", trailingSlash: "preserve" },
      { path: "/legacy-boolean", trailingSlash: true }
    ]
  });
  const response = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/sitemap.xml"),
    "never"
  );

  assert.deepEqual(sitemapLocations(await response!.text()), [
    "https://example.com/from-auto-default/",
    "https://example.com/entry-never",
    "https://example.com/entry-preserve/",
    "https://example.com/legacy-boolean/"
  ]);
});

test("passes the same framework policy to static and runtime sitemap rendering", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    autoDiscover: false,
    entries: ["/docs?source=sitemap", "/asset.png"]
  });
  const buildPhase = await setupPluginPhase(plugin, "build", "always");
  const vitePlugin = buildPhase.build.plugins.sitemap as {
    configResolved(config: { build?: { ssr?: unknown } }): void;
    generateBundle(this: {
      emitFile(file: { fileName: string; source: string }): void;
    }): Promise<void>;
  };
  const emitted: Array<{ fileName: string; source: string }> = [];
  vitePlugin.configResolved({ build: { ssr: false } });
  await vitePlugin.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });
  const runtime = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/sitemap.xml"),
    "always"
  );

  assert.equal(emitted[0]?.source, await runtime!.text());
  assert.deepEqual(sitemapLocations(emitted[0]?.source ?? ""), [
    "https://example.com/docs/?source=sitemap",
    "https://example.com/asset.png"
  ]);
});

test("serves HEAD without a response body", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"]
  });
  const response = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/sitemap.xml", { method: "HEAD" })
  );

  assert.ok(response);
  assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(await response.text(), "");
});

test("renders optional robots.txt rules and sitemap directives", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"],
    robots: {
      additionalSitemaps: ["https://static.example.net/images.xml"],
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/admin", "/private"]
        }
      ]
    }
  });
  const response = await callEndpoint(
    plugin,
    "robots",
    new Request("https://example.com/robots.txt")
  );

  assert.ok(response);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(
    await response.text(),
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /private",
      "",
      "Sitemap: https://example.com/sitemap.xml",
      "Sitemap: https://static.example.net/images.xml",
      ""
    ].join("\n")
  );
});

test("does not register robots.txt unless requested", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"]
  });

  assert.equal(
    await callEndpoint(plugin, "robots", new Request("https://example.com/robots.txt")),
    null
  );
});

test("declares exact endpoint matches so nested paths are excluded by Tavo.js", () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/"],
    robots: true
  });

  assert.deepEqual(
    plugin.manifest.endpoints?.map((endpoint) => endpoint.match),
    [
      { kind: "exact", path: "/sitemap.xml" },
      { kind: "exact", path: "/robots.txt" }
    ]
  );
});

test("rejects cross-origin, duplicate, and invalid entry metadata", async () => {
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: ["https://other.example/page"]
    }),
    /must resolve to the siteUrl origin/
  );
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: ["/same", "https://example.com/same"]
    }),
    /duplicate URL/
  );
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: [{ path: "/", priority: 1.5 }]
    }),
    /priority must be/
  );
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: [{ path: "/", lastModified: "next Tuesday" }]
    }),
    /lastModified must be an ISO/
  );
});

test("enforces configured entry and byte limits", async () => {
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: ["/one", "/two"],
      maxEntries: 1
    }),
    /exceeding maxEntries 1/
  );
  await assert.rejects(
    renderSitemap({
      siteUrl: "https://example.com",
      entries: ["/one"],
      maxBytes: 20
    }),
    /exceeding maxBytes 20/
  );
});

test("static entry arrays emit client build assets and skip server builds", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/", "/about"],
    robots: true
  });
  const emitter = await sitemapVitePlugin(plugin) as {
    configResolved(config: { build?: { ssr?: unknown } }): void;
    generateBundle(this: { emitFile(file: { fileName: string; source: string }): void }): Promise<void>;
  };
  assert.ok(emitter);

  const emitted: Array<{ fileName: string; source: string }> = [];
  emitter.configResolved({ build: { ssr: false } });
  await emitter.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });
  assert.deepEqual(emitted.map((file) => file.fileName), ["sitemap.xml", "robots.txt"]);
  assert.match(emitted[0]!.source, /https:\/\/example\.com\/about/);

  emitted.length = 0;
  emitter.configResolved({ build: { ssr: true } });
  await emitter.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });
  assert.deepEqual(emitted, []);
});

test("request-time sources do not emit static assets unless enabled", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: () => ["/"]
  });
  const vitePlugin = await sitemapVitePlugin(plugin) as {
    configResolved(config: { build?: { ssr?: unknown } }): void;
    generateBundle(this: { emitFile(file: unknown): void }): Promise<void>;
  };
  const emitted: unknown[] = [];
  vitePlugin.configResolved({ build: { ssr: false } });
  await vitePlugin.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });

  assert.deepEqual(emitted, []);
});

test("discovers concrete Tavo.js file routes and skips unresolved dynamic patterns", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavo-sitemap-discovery-"));
  await writeFile(
    join(root, "tavo.config.ts"),
    'export default { pagesDir: "app/routes" };\n',
    "utf8"
  );
  await Promise.all([
    writePage(root, "app/routes/index.tsx"),
    writePage(root, "app/routes/about.tsx"),
    writePage(root, "app/routes/(marketing)/pricing.tsx"),
    writePage(root, "app/routes/docs/[[section]].tsx"),
    writePage(root, "app/routes/deep/[[...slug]].tsx"),
    writePage(root, "app/routes/blog/[id].tsx"),
    writePage(root, "app/routes/files/[...all].tsx"),
    writePage(root, "app/routes/admin/index.tsx"),
    writePage(root, "app/routes/_layout.tsx"),
    writePage(root, "app/routes/_error.tsx"),
    writePage(root, "app/routes/404.tsx"),
    writePage(root, "app/routes/_private.tsx")
  ]);

  const routes = await discoverTavoPagePaths({
    root,
    exclude: ["/admin/*"]
  });

  assert.deepEqual(routes, ["/", "/about", "/deep", "/docs", "/pricing"]);
});

test("automatic routes emit during builds and explicit entries override their metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavo-sitemap-build-"));
  await Promise.all([
    writePage(root, "src/pages/index.tsx"),
    writePage(root, "src/pages/about.tsx"),
    writePage(root, "src/pages/sitemap.xml.tsx"),
    writePage(root, "src/pages/blog/[slug].tsx")
  ]);
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: [
      { path: "/about", priority: 1 },
      "/blog/first-post"
    ]
  });
  const vitePlugin = await sitemapVitePlugin(plugin) as {
    config(config: { root: string }): Promise<{ define: Record<string, string> }>;
    configResolved(config: { build?: { ssr?: unknown } }): void;
    generateBundle(this: {
      emitFile(file: { fileName: string; source: string }): void;
    }): Promise<void>;
  };

  const discoveredConfig = await vitePlugin.config({ root });
  assert.deepEqual(discoveredConfig.ssr?.noExternal, ["@tavojs/sitemap"]);
  assert.deepEqual(
    JSON.parse(discoveredConfig.define.__TAVO_SITEMAP_DISCOVERED_ROUTES__!),
    ["/", "/about"]
  );
  assert.deepEqual(plugin.sitemap.discoveredPaths(), ["/", "/about"]);

  const emitted: Array<{ fileName: string; source: string }> = [];
  vitePlugin.configResolved({ build: { ssr: false } });
  await vitePlugin.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });
  const sitemap = emitted.find((file) => file.fileName === "sitemap.xml")?.source ?? "";
  assert.equal((sitemap.match(/https:\/\/example\.com\/about/g) ?? []).length, 1);
  assert.match(sitemap, /<loc>https:\/\/example\.com\/blog\/first-post<\/loc>/);
  assert.match(sitemap, /<priority>1<\/priority>/);
  assert.doesNotMatch(sitemap, /\[slug\]|sitemap\.xml<\/loc>/);
});

test("applies discovered trailing slashes to static and runtime sitemaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavo-sitemap-trailing-slash-"));
  await Promise.all([
    writePage(root, "src/pages/index.tsx"),
    writePage(root, "src/pages/about.tsx"),
    writePage(root, "src/pages/contact.tsx"),
    writePage(root, "src/pages/feed.xml.tsx")
  ]);
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    autoDiscover: { trailingSlash: true },
    entries: [
      { path: "https://example.com/about", trailingSlash: true, priority: 1 },
      { path: "/blog/first-post", trailingSlash: true },
      "/llms.txt",
      "/manifest.json"
    ]
  });
  const vitePlugin = await sitemapVitePlugin(plugin) as {
    config(config: { root: string }): Promise<{ define: Record<string, string> }>;
    configResolved(config: { build?: { ssr?: unknown } }): void;
    generateBundle(this: {
      emitFile(file: { fileName: string; source: string }): void;
    }): Promise<void>;
  };
  await vitePlugin.config({ root });

  const emitted: Array<{ fileName: string; source: string }> = [];
  vitePlugin.configResolved({ build: { ssr: false } });
  await vitePlugin.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    }
  });
  const staticXml = emitted.find((file) => file.fileName === "sitemap.xml")?.source ?? "";
  const response = await callEndpoint(
    plugin,
    "sitemap",
    new Request("https://example.com/sitemap.xml")
  );
  const runtimeXml = await response!.text();

  assert.equal(runtimeXml, staticXml);
  assert.deepEqual(sitemapLocations(staticXml), [
    "https://example.com/",
    "https://example.com/contact/",
    "https://example.com/feed.xml",
    "https://example.com/about/",
    "https://example.com/blog/first-post/",
    "https://example.com/llms.txt",
    "https://example.com/manifest.json"
  ]);
  assert.equal((staticXml.match(/https:\/\/example\.com\/about\//g) ?? []).length, 1);
  assert.match(staticXml, /<priority>1<\/priority>/);
});

test("Vite middleware serves sitemap GET routes during development", async () => {
  const plugin = createSitemapPlugin({
    siteUrl: "https://example.com",
    entries: ["/", "/dev"]
  });
  const vitePlugin = await sitemapVitePlugin(plugin) as {
    configureServer(server: {
      middlewares: {
        use(handler: (
          request: { headers: Record<string, string>; method: string; url: string },
          response: {
            statusCode: number;
            end(body?: Uint8Array): void;
            setHeader(name: string, value: string): void;
          },
          next: () => void
        ) => void): void;
      };
    }): void;
  };

  const result = await new Promise<{ body: string; contentType?: string; status: number }>((resolve, reject) => {
    vitePlugin.configureServer({
      middlewares: {
        use(handler) {
          const headers: Record<string, string> = {};
          const response = {
            statusCode: 200,
            setHeader(name: string, value: string) {
              headers[name.toLowerCase()] = value;
            },
            end(body?: Uint8Array) {
              resolve({
                body: new TextDecoder().decode(body),
                contentType: headers["content-type"],
                status: this.statusCode
              });
            }
          };
          handler(
            { headers: {}, method: "GET", url: "/sitemap.xml" },
            response,
            () => reject(new Error("Expected sitemap middleware to handle the request."))
          );
        }
      }
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.contentType, "application/xml; charset=utf-8");
  assert.match(result.body, /https:\/\/example\.com\/dev/);
});

test("configuration validates origins, public paths, robots values, and protocol limits", () => {
  assert.throws(
    () => createSitemapPlugin({ siteUrl: "/relative", entries: [] }),
    /absolute HTTP\(S\) origin/
  );
  assert.throws(
    () => createSitemapPlugin({ siteUrl: "https://example.com/base", entries: [] }),
    /absolute HTTP\(S\) origin/
  );
  assert.throws(
    () => createSitemapPlugin({ siteUrl: "https://example.com", path: "sitemap.xml", entries: [] }),
    /absolute public file path/
  );
  assert.throws(
    () => createSitemapPlugin({ siteUrl: "https://example.com", entries: [], maxEntries: 50_001 }),
    /between 1 and 50000/
  );
  assert.throws(
    () => createSitemapPlugin({ siteUrl: "https://example.com", autoDiscover: false }),
    /entries are required when autoDiscover is disabled/
  );
  assert.throws(
    () => renderRobotsTxt("https://example.com", "/sitemap.xml", {
      rules: [{ userAgent: "bot\ninjected" }]
    }),
    /single-line value/
  );
});
