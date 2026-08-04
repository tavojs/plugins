import { definePluginPhase } from "@tavojs/core/plugin";

export function createSitemapBuildPhase(vitePlugin: unknown) {
  return definePluginPhase({
    build: { plugins: { sitemap: vitePlugin } }
  });
}
