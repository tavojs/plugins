# Framework Usage

Install the plugin in `tavo.config.ts`:

```ts
import { defineConfig } from "@tavojs/core/config";
import { createSitemapPlugin } from "@tavojs/sitemap";

const sitemapPlugin = createSitemapPlugin({
  siteUrl: "https://example.com",
  robots: true
});

export default defineConfig({
  plugins: [sitemapPlugin]
});
```

The plugin declares root server exposure in its manifest with a reviewable reason. Installing the trusted plugin enables that exposure. The plugin discovers concrete pages from Tavo.js's configured `pagesDir`, then declares GET and HEAD handlers for `/sitemap.xml`. When robots support is enabled, it also declares GET and HEAD handlers for `/robots.txt`.

Use `expose` only to remap the declared tree. For example, `{ plugin: sitemapPlugin, expose: { server: "/seo" } }` publishes `/seo/sitemap.xml` and `/seo/robots.txt`.

Tavo.js's Node and Fetch production handlers run the declared terminal endpoints before page rendering. Static arrays are additionally emitted through the plugin's named build contribution and therefore work when deploying `.tavo/build/client` without an SSR runtime.

Static page files are included automatically. Required dynamic routes need explicit entries because their route pattern does not enumerate real URLs. Request-time sources receive the Fetch `Request`, making cancellation and request-aware data access possible. Keep credentials and private clients in server-only modules.

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  async entries({ mode, request }) {
    if (mode === "build") {
      return readPublishedEntriesFromBuildSource();
    }
    return readPublishedEntries({ signal: request?.signal });
  },
  emitStatic: true
});
```

Do not include private, draft, tenant-specific, or authenticated URLs in a public sitemap.
