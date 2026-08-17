import { definePluginPhase } from "@tavojs/core/plugin";

export function createSitemapBuildPhase(
  vitePlugin: unknown,
  setTrailingSlash?: (value: unknown) => void
) {
  return definePluginPhase({
    build: { plugins: { sitemap: vitePlugin } },
    setup(context) {
      setTrailingSlash?.((context as typeof context & {
        urlPolicy?: { trailingSlash?: unknown };
      }).urlPolicy?.trailingSlash);
    }
  });
}
