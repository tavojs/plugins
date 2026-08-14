# @tavojs/sitemap

Sitemap and optional `robots.txt` generation for Tavo.js applications.

The plugin discovers Tavo.js pages, serves files from SSR handlers, and emits build assets when its entry source is build-safe. The same configuration supports server-rendered and static deployments.

## Install

```sh
npm install @tavojs/sitemap
```

## Configure

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

Tavo.js pages with concrete paths are discovered automatically. For example, `src/pages/about.tsx` becomes `/about`, while route groups are omitted and optional parameters contribute their concrete base path.

Add entries only for dynamic URLs or to attach metadata to an automatically discovered page:

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  entries: [
    {
      path: "/about",
      priority: 0.9
    },
    {
      path: "/blog/hello",
      lastModified: "2026-07-20",
      changeFrequency: "weekly"
    }
  ],
  robots: true
})
```

Explicit entries override automatically discovered entries at the same URL.

The manifest declares standard root exposure with an inspection-visible reason. Installing the plugin enables that exposure, so it creates:

- `/sitemap.xml`
- `/robots.txt` when `robots` is enabled
- static build assets when the entries are build-safe

Use an application `expose` record only to remap the declared server tree, for example `{ plugin: sitemapPlugin, expose: { server: "/seo" } }`.

## Automatic Discovery

Discovery follows Tavo.js's file-route conventions:

- includes ordinary static page files
- removes route groups such as `(marketing)`
- ignores layouts, error pages, `404`, and private `_` page files
- includes the base path of optional parameters such as `/docs/[[section]].tsx` → `/docs`
- skips required dynamic and catch-all routes because they do not identify concrete URLs
- reads a custom `pagesDir` from `tavo.config.*`

Exclude private or non-indexable areas explicitly:

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  autoDiscover: {
    exclude: ["/admin/*", /^\/account(?:\/|$)/]
  }
})
```

For static deployments that serve HTML routes with trailing slashes, normalize
automatically discovered pages to their canonical URLs:

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  autoDiscover: {
    exclude: ["/admin/*"],
    trailingSlash: true
  }
})
```

The root remains `/`, and file-like discovered paths remain unchanged. Set
`trailingSlash: false` to remove a trailing slash from discovered pages instead.

Set `autoDiscover: false` to use only explicit entries.

## Explicit Entries

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  entries: [
    "/",
    "/about",
    {
      path: "/blog/hello",
      trailingSlash: true,
      lastModified: "2026-07-20",
      changeFrequency: "weekly",
      priority: 0.8
    }
  ]
})
```

An entry object's `trailingSlash` setting applies to both its `path` and every
URL in `alternates`. It leaves `/` unchanged, adds or removes one trailing slash
without duplicating it, and supports relative or absolute same-origin URLs.
String entries retain their existing spelling, so file URLs such as `/llms.txt`,
`/manifest.json`, and `/sitemap.xml` stay unchanged unless they are converted to
objects with an explicit `trailingSlash` override.

## Dynamic Entries

Use an async source when URLs come from a database or CMS:

```ts
createSitemapPlugin({
  siteUrl: "https://example.com",
  async entries({ request }) {
    const posts = await listPublishedPosts({ signal: request?.signal });
    return posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastModified: post.updatedAt
    }));
  }
});
```

Callback sources are request-time by default and are not executed during builds. Automatically discovered routes are still available to SSR responses. Set `emitStatic: true` when the callback is also safe and deterministic at build time; build calls receive `{ mode: "build" }` without a request.

## Localized Alternates

```ts
{
  path: "/about",
  alternates: {
    en: "/about",
    es: "/es/about",
    "x-default": "/about"
  }
}
```

All entry and alternate URLs must resolve to the configured `siteUrl` origin. The plugin rejects duplicates, fragments, invalid dates, invalid priorities, oversized output, and more than 50,000 URLs.

## More Documentation

- `docs/framework-usage.md`
- `docs/configuration.md`
- `docs/testing-and-publishing.md`

## Project Policies

- [Contributing](https://github.com/tavojs/plugins/blob/main/CONTRIBUTING.md)
- [Trademark policy](https://github.com/tavojs/plugins/blob/main/TRADEMARKS.md)
- [Security policy](https://github.com/tavojs/plugins/blob/main/SECURITY.md)
