import type { SitemapAutoDiscoverOptions } from "./types.js";

type DirectoryEntry = {
  isDirectory(): boolean;
  isFile(): boolean;
  name: string;
};

type FileSystemPromises = {
  readFile(file: string, encoding: "utf8"): Promise<string>;
  readdir(directory: string, options: { withFileTypes: true }): Promise<DirectoryEntry[]>;
};

type PathModule = {
  isAbsolute(value: string): boolean;
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
  sep: string;
};

const PAGE_FILE = /\.(?:js|jsx|ts|tsx)$/;
const CONFIG_FILES = ["tavo.config.ts", "tavo.config.mts", "tavo.config.js", "tavo.config.mjs"];

async function nodeModules(): Promise<{ fs: FileSystemPromises; path: PathModule }> {
  const runtimeImport = new Function("specifier", "return import(specifier);") as (
    specifier: string
  ) => Promise<unknown>;
  const [fs, path] = await Promise.all([
    runtimeImport("node:fs/promises"),
    runtimeImport("node:path")
  ]);
  return {
    fs: fs as FileSystemPromises,
    path: path as PathModule
  };
}

async function configuredPagesDir(fs: FileSystemPromises, path: PathModule, root: string): Promise<string> {
  for (const candidate of CONFIG_FILES) {
    try {
      const source = await fs.readFile(path.join(root, candidate), "utf8");
      const match = source.match(/\bpagesDir\s*:\s*["'`]([^"'`]+)["'`]/);
      if (match?.[1]) return match[1];
    } catch {
      // Try the next supported Tavo.js config file.
    }
  }
  return "src/pages";
}

function assertPagesRoot(path: PathModule, root: string, pagesDir: string): string {
  const pagesRoot = path.resolve(root, pagesDir);
  const relative = path.relative(root, pagesRoot);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("tavo sitemap: autoDiscover.pagesDir must stay inside the project root.");
  }
  return pagesRoot;
}

async function collectFiles(fs: FileSystemPromises, path: PathModule, directory: string): Promise<string[]> {
  let entries: DirectoryEntry[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fs, path, target));
    } else if (entry.isFile() && PAGE_FILE.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

function routeSegment(segment: string): { kind: "omit" | "required" | "static"; value?: string } {
  if (/^\(.+\)$/.test(segment) || /^\[\[(?:\.\.\.)?.+\]\]$/.test(segment)) {
    return { kind: "omit" };
  }
  if (/^\[(?:\.\.\.)?.+\]$/.test(segment)) {
    return { kind: "required" };
  }
  return { kind: "static", value: segment };
}

function routeFromFile(path: PathModule, pagesRoot: string, file: string): string | null {
  const relative = path.relative(pagesRoot, file).split(path.sep).join("/").replace(PAGE_FILE, "");
  const parts = relative.split("/").filter(Boolean);
  const stem = parts.pop() ?? "index";
  if (stem === "_layout" || stem === "_error" || stem === "404" || stem.startsWith("_")) {
    return null;
  }
  if (stem !== "index") parts.push(stem);

  const output: string[] = [];
  for (const part of parts) {
    const segment = routeSegment(part);
    if (segment.kind === "required") return null;
    if (segment.kind === "static") output.push(segment.value!);
  }
  return output.length === 0 ? "/" : `/${output.join("/")}`;
}

function isExcluded(pathname: string, patterns: readonly (string | RegExp)[]): boolean {
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(pathname);
    }
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2).replace(/\/+$/, "") || "/";
      return pathname === base || pathname.startsWith(base === "/" ? "/" : `${base}/`);
    }
    return pathname === pattern;
  });
}

export type DiscoverTavoPagePathsOptions = SitemapAutoDiscoverOptions & {
  reservedPaths?: readonly string[];
  root?: string;
};

/** Discovers concrete URLs from Tavo.js's file-route conventions without importing page modules. */
export async function discoverTavoPagePaths(
  options: DiscoverTavoPagePathsOptions = {}
): Promise<string[]> {
  const { fs, path } = await nodeModules();
  const root = path.resolve(options.root ?? ".");
  const pagesDir = options.pagesDir ?? await configuredPagesDir(fs, path, root);
  const pagesRoot = assertPagesRoot(path, root, pagesDir);
  const excluded = [...(options.exclude ?? []), ...(options.reservedPaths ?? [])];
  const routes = new Set<string>();
  for (const file of await collectFiles(fs, path, pagesRoot)) {
    const route = routeFromFile(path, pagesRoot, file);
    if (route && !isExcluded(route, excluded)) routes.add(route);
  }
  return [...routes].sort((left, right) => {
    if (left === "/") return -1;
    if (right === "/") return 1;
    return left.localeCompare(right);
  });
}
