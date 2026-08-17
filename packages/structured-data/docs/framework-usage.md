# Framework Usage

## Metadata-First Integration

`createStructuredDataSite()` is the primary API. It owns stable site entity
identifiers, route-to-application matching, metadata resolution, precedence,
deduplication, and final ordering.

The builder reads `pathname` from Tavo.js's existing `PageLoadContext`. It does
not inspect URL segments to invent labels or business facts.

```ts
const site = createStructuredDataSite({
  siteUrl: "https://example.com",
  website: { name: "Example" },
  organization: { name: "Example Project" },
  applications: [{
    path: "/",
    name: "Example Framework",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 0 }
  }]
});
```

Install a policy-binding plugin beside the site helper so it receives the same
resolved routing policy as canonical links and framework navigation:

```ts
const structuredDataPlugin = createStructuredDataPlugin({ site });

export default {
  routing: { trailingSlash: "always" },
  plugins: [structuredDataPlugin]
};
```

If the helper is used outside an installed Tavo.js plugin, configure the same
policy explicitly with `urlPolicy: { trailingSlash: "always" }`. Supported
values are `"always"`, `"never"`, and `"preserve"`.

Only site-relative page identities are formatted. Explicit absolute URLs,
query strings, fragments, entity IDs, and resource URLs retain their existing
meaning. File-like URLs never gain a slash.

`site.data(context)` returns normalized nodes for inspection or custom
rendering. `site.head(context)` returns a Tavo.js head child, or `null` when the
route has no selected schema.

## Resolution And Precedence

The final metadata is selected in this order:

1. Metadata passed directly to `site.head()` or `site.data()`.
2. Metadata returned by the configured synchronous `resolve()` callback.
3. Defaults inferred from the route: site identity on `/` and an application
   whose configured `path` matches the pathname.

Set `softwareApplication: false` to suppress a configured application. Set
`includeSiteIdentity: false` to suppress the homepage identity defaults.

```tsx
site.head(context, {
  includeSiteIdentity: false,
  softwareApplication: false,
  schemas: {
    "@type": "TechArticle",
    headline: "A custom page"
  }
});
```

## SSR, Prerendering, And CSR

Dynamic page head functions run after their route loader resolves. SSR and
prerendering therefore include generated JSON-LD in the delivered HTML. Client
navigation applies the same head contribution through Tavo.js's `Script`
component.

Pure static CSR documents cannot evaluate dynamic head functions before the
browser starts. Prefer SSR or prerendering for search-critical pages and verify
the delivered HTML in production.

Global plugin mode contributes to server/prerendered head output. Use the
component or site builder for route-specific client updates.

## Content Security Policy

Pass an application-provided nonce as the third `site.head()` argument:

```tsx
site.head(context, metadata, {
  id: "page-structured-data",
  nonce: data.cspNonce
});
```

The package does not generate nonces and does not weaken an application's
Content Security Policy.
