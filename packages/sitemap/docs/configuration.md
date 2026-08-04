# Configuration

## Sitemap

- `siteUrl`: required absolute HTTP(S) origin. Paths, credentials, queries, and fragments are rejected.
- `autoDiscover`: discovers Tavo.js file routes and defaults to `true`. Pass `false` or `{ pagesDir, exclude }`.
- `entries`: optional extra entries or metadata overrides; accepts an array, iterable, async iterable, or callback.
- `path`: public sitemap path; defaults to `/sitemap.xml`.
- `cacheControl`: response cache policy; defaults to `public, max-age=0, s-maxage=3600`. Set `false` to omit it.
- `emitStatic`: emits client-build assets. It defaults to `true` when entries are omitted or an array, and `false` for callbacks.
- `maxEntries`: output URL limit, bounded by the sitemap protocol maximum of 50,000.
- `maxBytes`: output byte limit, bounded by the sitemap protocol maximum of 50 MiB.

Entries accept a path string or an object:

```ts
{
  path: "/products/widget",
  lastModified: "2026-07-20",
  changeFrequency: "weekly",
  priority: 0.7,
  alternates: {
    en: "/products/widget",
    es: "/es/products/widget"
  }
}
```

`lastModified` accepts a valid `Date`, an ISO date, or an ISO date-time with a timezone. `priority` must be between zero and one.

## Robots

Robots output is opt-in. Use `robots: true` for an allow-all file that advertises the generated sitemap, or provide rules:

```ts
robots: {
  rules: [
    {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/private"]
    }
  ],
  additionalSitemaps: ["https://media.example.com/images.xml"]
}
```

Robots options include `path`, `cacheControl`, `host`, `includeSitemap`, `additionalSitemaps`, and `rules`.

## Static Builds

Automatic routes and array entries are emitted as static assets automatically when no callback source is configured. Callback sources remain request-only unless `emitStatic: true` is set. A build-time callback receives no request and must not depend on request headers, cookies, or a deployed-only service.

Required dynamic routes such as `/blog/[slug].tsx` are skipped because a route pattern does not identify its public URLs. Supply those URLs through `entries`. Optional parameters contribute their base URL.
