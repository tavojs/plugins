import { definePluginFactory } from "@tavojs/core/plugin";
import { discoverTavoPagePaths } from "./discovery.js";
import type {
  CreateSitemapPluginOptions,
  RobotsOptions,
  RobotsRule,
  SitemapAutoDiscoverOptions,
  SitemapEntry,
  SitemapEntryCollection,
  SitemapEntryInput,
  SitemapPlugin,
  SitemapRuntime,
  SitemapSourceContext,
  SitemapTrailingSlash,
  SitemapTrailingSlashPolicy
} from "./types.js";

export type {
  CreateSitemapPluginOptions,
  SitemapAutoDiscoverOptions,
  RobotsOptions,
  RobotsRule,
  SitemapChangeFrequency,
  SitemapEntry,
  SitemapEntryCollection,
  SitemapEntryInput,
  SitemapEntrySource,
  SitemapPlugin,
  SitemapRuntime,
  SitemapSourceContext,
  SitemapTrailingSlash,
  SitemapTrailingSlashPolicy
} from "./types.js";
export { discoverTavoPagePaths } from "./discovery.js";
export type { DiscoverTavoPagePathsOptions } from "./discovery.js";

declare const __TAVO_SITEMAP_DISCOVERED_ROUTES__: readonly string[] | undefined;

const DEFAULT_CACHE_CONTROL = "public, max-age=0, s-maxage=3600";
const MAX_SITEMAP_ENTRIES = 50_000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;
const CHANGE_FREQUENCIES = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never"
]);
const LANGUAGE_CODE = /^(?:x-default|[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function compiledDiscoveredPaths(): string[] {
  return typeof __TAVO_SITEMAP_DISCOVERED_ROUTES__ === "undefined"
    ? []
    : [...__TAVO_SITEMAP_DISCOVERED_ROUTES__];
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeSiteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`tavo sitemap: siteUrl must be an absolute HTTP(S) origin, received "${value}".`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`tavo sitemap: siteUrl must be an absolute HTTP(S) origin, received "${value}".`);
  }
  return url;
}

function normalizePublicPath(value: string, label: string): string {
  if (!value.startsWith("/") || value === "/" || /[?#\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`tavo sitemap: ${label} must be an absolute public file path.`);
  }
  const segments = value.slice(1).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`tavo sitemap: ${label} must not contain empty, dot, or parent segments.`);
  }
  return value;
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new Error(`tavo sitemap: ${label} must be an integer between 1 and ${maximum}.`);
  }
  return normalized;
}

function assertTrailingSlash(value: unknown, label: string): asserts value is SitemapTrailingSlash | undefined {
  if (
    value !== undefined &&
    typeof value !== "boolean" &&
    value !== "always" &&
    value !== "never" &&
    value !== "preserve"
  ) {
    throw new Error(`tavo sitemap: ${label} must be a boolean, "always", "never", or "preserve".`);
  }
}

function normalizeTrailingSlash(value: SitemapTrailingSlash | undefined): SitemapTrailingSlashPolicy | undefined {
  return typeof value === "boolean" ? (value ? "always" : "never") : value;
}

function resolveSiteUrl(
  site: URL,
  value: string,
  label: string,
  trailingSlash: SitemapTrailingSlashPolicy = "preserve"
): string {
  if (!value.trim()) {
    throw new Error(`tavo sitemap: ${label} must not be empty.`);
  }
  let resolved: URL;
  try {
    resolved = new URL(value, site);
  } catch {
    throw new Error(`tavo sitemap: ${label} contains an invalid URL "${value}".`);
  }
  if (
    (resolved.protocol !== "https:" && resolved.protocol !== "http:") ||
    resolved.username ||
    resolved.password ||
    resolved.hash ||
    resolved.origin !== site.origin
  ) {
    throw new Error(`tavo sitemap: ${label} must resolve to the siteUrl origin.`);
  }
  if (
    trailingSlash !== "preserve" &&
    resolved.pathname !== "/" &&
    (trailingSlash === "never" || !isFileLikeUrl(resolved))
  ) {
    const pathname = resolved.pathname.replace(/\/+$/, "");
    resolved.pathname = trailingSlash === "always" ? `${pathname}/` : pathname || "/";
  }
  return resolved.href;
}

function isFileLikeUrl(value: URL): boolean {
  const pathname = value.pathname.replace(/\/+$/, "");
  const basename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return basename.includes(".");
}

function normalizeLastModified(value: Date | string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error("tavo sitemap: lastModified contains an invalid Date.");
    }
    return value.toISOString();
  }
  const normalized = value.trim();
  if (ISO_DATE.test(normalized)) {
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized) {
      return normalized;
    }
  }
  if (ISO_DATE_TIME.test(normalized)) {
    const parsed = new Date(normalized);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  throw new Error(`tavo sitemap: lastModified must be an ISO date or date-time, received "${value}".`);
}

type NormalizedSitemapEntry = Required<Pick<SitemapEntry, "path">> &
  Omit<SitemapEntry, "path" | "trailingSlash">;

function normalizeEntry(
  input: SitemapEntryInput,
  site: URL,
  defaultTrailingSlash: SitemapTrailingSlashPolicy = "preserve"
): NormalizedSitemapEntry {
  const entry = typeof input === "string" ? { path: input } : input;
  if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
    throw new Error("tavo sitemap: every entry must be a path string or an object with a path.");
  }
  if (entry.changeFrequency !== undefined && !CHANGE_FREQUENCIES.has(entry.changeFrequency)) {
    throw new Error(`tavo sitemap: unsupported changeFrequency "${String(entry.changeFrequency)}".`);
  }
  if (
    entry.priority !== undefined &&
    (!Number.isFinite(entry.priority) || entry.priority < 0 || entry.priority > 1)
  ) {
    throw new Error("tavo sitemap: priority must be a finite number between 0 and 1.");
  }
  assertTrailingSlash(entry.trailingSlash, "entry trailingSlash");
  const trailingSlash = normalizeTrailingSlash(entry.trailingSlash) ?? defaultTrailingSlash;

  const alternates: Record<string, string> = {};
  for (const [language, path] of Object.entries(entry.alternates ?? {})) {
    if (!LANGUAGE_CODE.test(language)) {
      throw new Error(`tavo sitemap: invalid alternate language code "${language}".`);
    }
    alternates[language] = resolveSiteUrl(
      site,
      path,
      `alternate "${language}"`,
      trailingSlash
    );
  }

  return {
    path: resolveSiteUrl(site, entry.path, "entry path", trailingSlash),
    ...(Object.keys(alternates).length > 0 ? { alternates } : {}),
    ...(entry.changeFrequency === undefined ? {} : { changeFrequency: entry.changeFrequency }),
    ...(entry.lastModified === undefined ? {} : { lastModified: normalizeLastModified(entry.lastModified) }),
    ...(entry.priority === undefined ? {} : { priority: entry.priority })
  };
}

async function collectEntries(collection: SitemapEntryCollection): Promise<SitemapEntryInput[]> {
  if (!collection || typeof collection !== "object") {
    throw new Error("tavo sitemap: entries must resolve to an iterable or async iterable.");
  }
  const output: SitemapEntryInput[] = [];
  if (Symbol.asyncIterator in collection) {
    for await (const entry of collection as AsyncIterable<SitemapEntryInput>) {
      output.push(entry);
    }
    return output;
  }
  if (Symbol.iterator in collection) {
    for (const entry of collection as Iterable<SitemapEntryInput>) {
      output.push(entry);
    }
    return output;
  }
  throw new Error("tavo sitemap: entries must resolve to an iterable or async iterable.");
}

async function resolveSourceEntries(
  source: CreateSitemapPluginOptions["entries"],
  context: SitemapSourceContext
): Promise<SitemapEntryInput[]> {
  if (source === undefined) return [];
  return collectEntries(typeof source === "function" ? await source(context) : source);
}

function renderNormalizedSitemap(entries: ReturnType<typeof normalizeEntry>[]): string {
  const hasAlternates = entries.some((entry) => entry.alternates !== undefined);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""
    }>`
  ];
  for (const entry of entries) {
    lines.push("  <url>", `    <loc>${xml(entry.path)}</loc>`);
    for (const [language, href] of Object.entries(entry.alternates ?? {})) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${xml(language)}" href="${xml(href)}" />`);
    }
    if (entry.lastModified !== undefined) {
      lines.push(`    <lastmod>${xml(String(entry.lastModified))}</lastmod>`);
    }
    if (entry.changeFrequency !== undefined) {
      lines.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
    }
    if (entry.priority !== undefined) {
      lines.push(`    <priority>${entry.priority}</priority>`);
    }
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

/** Renders and validates one XML sitemap independently of the Tavo.js runtime. */
function renderSitemapEntries(
  options: Pick<CreateSitemapPluginOptions, "maxBytes" | "maxEntries" | "siteUrl">,
  inputs: SitemapEntryInput[],
  defaultTrailingSlash: SitemapTrailingSlashPolicy = "preserve"
): string {
  const site = normalizeSiteUrl(options.siteUrl);
  const maxEntries = normalizeLimit(options.maxEntries, MAX_SITEMAP_ENTRIES, MAX_SITEMAP_ENTRIES, "maxEntries");
  const maxBytes = normalizeLimit(options.maxBytes, MAX_SITEMAP_BYTES, MAX_SITEMAP_BYTES, "maxBytes");
  if (inputs.length > maxEntries) {
    throw new Error(`tavo sitemap: generated ${inputs.length} entries, exceeding maxEntries ${maxEntries}.`);
  }

  const seen = new Set<string>();
  const entries = inputs.map((input) => {
    const entry = normalizeEntry(input, site, defaultTrailingSlash);
    if (seen.has(entry.path)) {
      throw new Error(`tavo sitemap: duplicate URL "${entry.path}".`);
    }
    seen.add(entry.path);
    return entry;
  });
  const output = renderNormalizedSitemap(entries);
  const bytes = new TextEncoder().encode(output).byteLength;
  if (bytes > maxBytes) {
    throw new Error(`tavo sitemap: generated XML is ${bytes} bytes, exceeding maxBytes ${maxBytes}.`);
  }
  return output;
}

/** Renders and validates one XML sitemap independently of the Tavo.js runtime. */
export async function renderSitemap(
  options: Pick<CreateSitemapPluginOptions, "entries" | "maxBytes" | "maxEntries" | "siteUrl">,
  context: SitemapSourceContext = { mode: "build" }
): Promise<string> {
  return renderSitemapEntries(options, await resolveSourceEntries(options.entries, context));
}

async function renderDiscoveredSitemap(
  options: CreateSitemapPluginOptions,
  discoveredPaths: readonly string[],
  context: SitemapSourceContext,
  frameworkTrailingSlash: SitemapTrailingSlashPolicy
): Promise<string> {
  const explicit = await resolveSourceEntries(options.entries, context);
  const site = normalizeSiteUrl(options.siteUrl);
  const configuredTrailingSlash = typeof options.autoDiscover === "object"
    ? normalizeTrailingSlash(options.autoDiscover.trailingSlash)
    : undefined;
  const resolvedTrailingSlash = configuredTrailingSlash ?? frameworkTrailingSlash;
  const routeIdentity = (value: SitemapEntryInput) => {
    const entry = typeof value === "string" ? { path: value } : value;
    const url = new URL(resolveSiteUrl(site, entry.path, "entry path"));
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  };
  const explicitRoutes = new Set(explicit.map(routeIdentity));
  const automatic = discoveredPaths.filter((path) => !explicitRoutes.has(routeIdentity(path)));
  return renderSitemapEntries(options, [...automatic, ...explicit], resolvedTrailingSlash);
}

function values(value: string | readonly string[] | undefined): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

function assertRobotsValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n\u0000]/.test(normalized)) {
    throw new Error(`tavo sitemap: ${label} must be a non-empty single-line value.`);
  }
  return normalized;
}

function renderRobotsRule(rule: RobotsRule): string[] {
  const userAgents = values(rule.userAgent).map((value) => assertRobotsValue(value, "robots userAgent"));
  if (userAgents.length === 0) {
    throw new Error("tavo sitemap: each robots rule requires at least one userAgent.");
  }
  if (rule.crawlDelay !== undefined && (!Number.isFinite(rule.crawlDelay) || rule.crawlDelay < 0)) {
    throw new Error("tavo sitemap: robots crawlDelay must be a finite non-negative number.");
  }
  return [
    ...userAgents.map((value) => `User-agent: ${value}`),
    ...values(rule.allow).map((value) => `Allow: ${assertRobotsValue(value, "robots allow path")}`),
    ...values(rule.disallow).map((value) => `Disallow: ${assertRobotsValue(value, "robots disallow path")}`),
    ...(rule.crawlDelay === undefined ? [] : [`Crawl-delay: ${rule.crawlDelay}`])
  ];
}

/** Renders robots.txt content and advertises the plugin sitemap by default. */
export function renderRobotsTxt(
  siteUrl: string,
  sitemapPath: string,
  options: RobotsOptions = {}
): string {
  const site = normalizeSiteUrl(siteUrl);
  const groups = options.rules?.length
    ? options.rules.map(renderRobotsRule)
    : [["User-agent: *", "Allow: /"]];
  const lines: string[] = [];
  for (const [index, group] of groups.entries()) {
    if (index > 0) lines.push("");
    lines.push(...group);
  }
  if (options.host !== undefined) {
    lines.push("", `Host: ${assertRobotsValue(options.host, "robots host")}`);
  }
  const sitemaps = [
    ...(options.includeSitemap === false ? [] : [new URL(sitemapPath, site).href]),
    ...(options.additionalSitemaps ?? []).map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`tavo sitemap: additional sitemap URL is invalid: "${value}".`);
      }
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash) {
        throw new Error(`tavo sitemap: additional sitemap URL is invalid: "${value}".`);
      }
      return url.href;
    })
  ];
  if (sitemaps.length > 0) {
    lines.push("", ...sitemaps.map((value) => `Sitemap: ${value}`));
  }
  return `${lines.join("\n")}\n`;
}

type StaticAssetEmitterContext = {
  emitFile(file: { fileName: string; source: string; type: "asset" }): void;
};

type ViteConnectRequest = {
  headers: Record<string, string | readonly string[] | undefined>;
  method?: string;
  url?: string;
};

type ViteConnectResponse = {
  statusCode: number;
  end(body?: Uint8Array): void;
  setHeader(name: string, value: string): void;
};

type ViteServer = {
  middlewares?: {
    use(handler: (
      request: ViteConnectRequest,
      response: ViteConnectResponse,
      next: () => void
    ) => void): void;
  };
};

type ViteSitemapPlugin = {
  name: string;
  config(config: { root?: unknown }): Promise<{
    define: Record<string, string>;
    ssr?: { noExternal: string[] };
  }>;
  configResolved(config: { build?: { ssr?: unknown } }): void;
  configurePreviewServer(server: ViteServer): void;
  configureServer(server: ViteServer): void;
  generateBundle(this: StaticAssetEmitterContext): Promise<void>;
};

function requestHeaders(input: ViteConnectRequest["headers"]): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === "string") {
      headers.set(name, value);
    } else if (value !== undefined) {
      for (const part of value) headers.append(name, part);
    }
  }
  return headers;
}

async function writeViteResponse(response: Response, output: ViteConnectResponse): Promise<void> {
  output.statusCode = response.status;
  response.headers.forEach((value, name) => output.setHeader(name, value));
  output.end(new Uint8Array(await response.arrayBuffer()));
}

function createVitePlugin(
  runtime: SitemapRuntime,
  emitStatic: boolean,
  handleRequest: (request: Request) => Promise<Response | null>,
  autoDiscover: false | SitemapAutoDiscoverOptions,
  reservedPaths: readonly string[],
  setDiscoveredPaths: (paths: string[]) => void
): ViteSitemapPlugin {
  let serverBuild = false;
  const configureServer = (server: ViteServer) => {
    server.middlewares?.use((nodeRequest, nodeResponse, next) => {
      let request: Request;
      try {
        request = new Request(new URL(nodeRequest.url ?? "/", "http://localhost"), {
          headers: requestHeaders(nodeRequest.headers),
          method: nodeRequest.method ?? "GET"
        });
      } catch {
        next();
        return;
      }
      handleRequest(request).then(
        (response) => {
          if (!response) {
            next();
            return;
          }
          void writeViteResponse(response, nodeResponse);
        },
        () => {
          nodeResponse.statusCode = 500;
          nodeResponse.end(new TextEncoder().encode("Internal Server Error"));
        }
      );
    });
  };
  return {
    name: "tavo-sitemap",
    async config(config) {
      const paths = autoDiscover === false
        ? []
        : await discoverTavoPagePaths({
            ...autoDiscover,
            reservedPaths,
            ...(typeof config.root === "string" ? { root: config.root } : {})
          });
      setDiscoveredPaths(paths);
      return {
        define: {
          __TAVO_SITEMAP_DISCOVERED_ROUTES__: JSON.stringify(paths)
        },
        ...(autoDiscover === false
          ? {}
          : { ssr: { noExternal: ["@tavojs/sitemap"] } })
      };
    },
    configResolved(config) {
      serverBuild = Boolean(config.build?.ssr);
    },
    configurePreviewServer: configureServer,
    configureServer,
    async generateBundle() {
      if (serverBuild || !emitStatic) return;
      this.emitFile({
        type: "asset",
        fileName: runtime.sitemapPath.slice(1),
        source: await runtime.renderSitemap({ mode: "build" })
      });
      const robots = runtime.renderRobots();
      if (robots !== null && runtime.robotsPath) {
        this.emitFile({
          type: "asset",
          fileName: runtime.robotsPath.slice(1),
          source: robots
        });
      }
    }
  };
}

function xmlResponse(body: string, request: Request, cacheControl: false | string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/xml; charset=utf-8"
  };
  if (cacheControl !== false) headers["Cache-Control"] = cacheControl;
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

function textResponse(body: string, request: Request, cacheControl: false | string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8"
  };
  if (cacheControl !== false) headers["Cache-Control"] = cacheControl;
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

/** Creates sitemap.xml and optional robots.txt routes for a Tavo.js application. */
export const createSitemapPlugin: (
  options: CreateSitemapPluginOptions
) => SitemapPlugin = definePluginFactory((options: CreateSitemapPluginOptions) => {
  if (!options) {
    throw new Error("tavo sitemap: options are required.");
  }
  const autoDiscover: false | SitemapAutoDiscoverOptions = options.autoDiscover === false
    ? false
    : options.autoDiscover === true || options.autoDiscover === undefined
      ? {}
      : options.autoDiscover;
  if (autoDiscover !== false) {
    assertTrailingSlash(autoDiscover.trailingSlash, "autoDiscover.trailingSlash");
  }
  if (autoDiscover === false && options.entries === undefined) {
    throw new Error("tavo sitemap: entries are required when autoDiscover is disabled.");
  }
  normalizeSiteUrl(options.siteUrl);
  const sitemapPath = normalizePublicPath(options.path ?? "/sitemap.xml", "path");
  const robotsOptions = options.robots === true ? {} : options.robots;
  const robotsPath = robotsOptions
    ? normalizePublicPath(robotsOptions.path ?? "/robots.txt", "robots.path")
    : undefined;
  if (robotsPath === sitemapPath) {
    throw new Error("tavo sitemap: sitemap and robots paths must be different.");
  }
  normalizeLimit(options.maxEntries, MAX_SITEMAP_ENTRIES, MAX_SITEMAP_ENTRIES, "maxEntries");
  normalizeLimit(options.maxBytes, MAX_SITEMAP_BYTES, MAX_SITEMAP_BYTES, "maxBytes");

  let discoveredPaths = autoDiscover === false ? [] : compiledDiscoveredPaths();
  let frameworkTrailingSlash: SitemapTrailingSlashPolicy = "preserve";
  const setFrameworkTrailingSlash = (value: unknown) => {
    assertTrailingSlash(value, "framework routing.trailingSlash");
    frameworkTrailingSlash = normalizeTrailingSlash(value) ?? "preserve";
  };
  const runtime: SitemapRuntime = {
    sitemapPath,
    ...(robotsPath === undefined ? {} : { robotsPath }),
    discoveredPaths() {
      return [...discoveredPaths];
    },
    renderRobots() {
      return robotsOptions ? renderRobotsTxt(options.siteUrl, sitemapPath, robotsOptions) : null;
    },
    renderSitemap(context = { mode: "build" }) {
      return renderDiscoveredSitemap(options, discoveredPaths, context, frameworkTrailingSlash);
    }
  };
  const emitStatic = options.emitStatic ?? (options.entries === undefined || Array.isArray(options.entries));
  const cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;
  const robotsCacheControl = robotsOptions?.cacheControl ?? cacheControl;
  const handleSitemap = async (request: Request) =>
    xmlResponse(
      await runtime.renderSitemap({ mode: "request", request }),
      request,
      cacheControl
    );
  const mountedSiblingPath = (requestPath: string, localPath: string, siblingPath: string) =>
    requestPath.endsWith(localPath)
      ? `${requestPath.slice(0, -localPath.length)}${siblingPath}`
      : siblingPath;
  const handleRobots = (request: Request) =>
    textResponse(
      renderRobotsTxt(
        options.siteUrl,
        mountedSiblingPath(new URL(request.url).pathname, robotsPath!, sitemapPath),
        robotsOptions!
      ),
      request,
      robotsCacheControl
    );
  const handleRequest = async (request: Request): Promise<Response | null> => {
    const pathname = new URL(request.url).pathname;
    if ((request.method === "GET" || request.method === "HEAD") && pathname === sitemapPath) {
      return handleSitemap(request);
    }
    if (
      robotsPath &&
      (request.method === "GET" || request.method === "HEAD") &&
      pathname === robotsPath
    ) {
      return handleRobots(request);
    }
    return null;
  };

  return {
    id: "@tavojs/sitemap",
    version: "1.0.2",
    apiVersion: 1,
    manifest: {
      endpoints: [
        {
          id: "sitemap",
          methods: ["GET", "HEAD"],
          match: { kind: "exact", path: sitemapPath }
        },
        ...(robotsPath
          ? [{
              id: "robots",
              methods: ["GET", "HEAD"],
              match: { kind: "exact" as const, path: robotsPath }
            }]
          : [])
      ],
      build: { plugins: [{ id: "sitemap" }] },
      exposure: [{
        target: "server",
        from: "/",
        to: "/",
        reason: "Publishes sitemap.xml and optional robots.txt at their standard root paths."
      }]
    },
    sitemap: runtime,
    server: async () => {
      const { createSitemapServerPhase } = await import("./server.js");
      return createSitemapServerPhase(
        handleSitemap,
        robotsPath ? handleRobots : undefined,
        setFrameworkTrailingSlash
      );
    },
    build: async () => {
      const { createSitemapBuildPhase } = await import("./build.js");
      return createSitemapBuildPhase(
        createVitePlugin(
          runtime,
          emitStatic,
          handleRequest,
          autoDiscover,
          [sitemapPath, ...(robotsPath ? [robotsPath] : [])],
          (paths) => {
            discoveredPaths = paths;
          }
        ),
        setFrameworkTrailingSlash
      );
    }
  };
});
