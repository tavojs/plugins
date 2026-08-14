# @tavojs/structured-data

Metadata-driven Schema.org JSON-LD for Tavo.js applications.

Configure site identity and product facts once, connect an optional route
metadata resolver, and render the schemas selected for the current route. The
package includes typed builders for `WebSite`, `Organization`,
`SoftwareApplication`, and `BreadcrumbList`, plus an escape hatch for other
Schema.org types.

## Install

```sh
npm install @tavojs/structured-data
```

## Configure A Site Once

Create an application-owned module such as `src/seo/structured-data.ts`:

```ts
import { createStructuredDataSite } from "@tavojs/structured-data";

export const structuredData = createStructuredDataSite({
  siteUrl: "https://example.com",
  website: {
    name: "Example",
    alternateName: ["example.com"]
  },
  organization: {
    name: "Example Project",
    logo: "/images/logo.png",
    sameAs: ["https://github.com/example"]
  },
  applications: [{
    path: "/",
    name: "Example Framework",
    description: "A framework for complete web applications.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 0 }
  }],
  resolve({ pathname }) {
    return pathname === "/docs/button"
      ? {
          breadcrumbs: [
            { name: "Docs", url: "/docs" },
            { name: "Button" }
          ]
        }
      : undefined;
  }
});
```

Call the builder from a root layout head function:

```tsx
import { Seo } from "@tavojs/core";
import type { PageLoadContext } from "@tavojs/core/router";
import { structuredData } from "src/seo/structured-data";

export function head(context: PageLoadContext) {
  const canonical = new URL(context.pathname, "https://example.com").href;
  return (
    <>
      <Seo canonical={canonical} openGraph={{ url: canonical }} />
      {structuredData.head(context)}
    </>
  );
}
```

The homepage emits `WebSite`, `Organization`, and the configured
`SoftwareApplication` in one `@graph`. The documentation route emits only its
`BreadcrumbList`. Routes without metadata emit no JSON-LD.

## Loader Data

A page head receives the resolved value from its page `load()` function. Pass
only application metadata; the package creates the Schema.org shape:

```tsx
import type { PageLoadContext } from "@tavojs/core/router";
import { structuredData } from "src/seo/structured-data";

type ProductPageData = {
  breadcrumbs: Array<{ name: string; url?: string }>;
};

export function head(
  context: PageLoadContext & { data?: ProductPageData; error?: unknown }
) {
  return structuredData.head(context, {
    breadcrumbs: context.data?.breadcrumbs
  });
}
```

A layout head receives its own layout loader data, not a descendant page's
loader data. Put data-dependent schema in the page head or in statically known
route metadata.

## Direct Builders

Use the lower-level component and builders for exceptional routes:

```tsx
import {
  StructuredData,
  createBreadcrumbList,
  createSoftwareApplication
} from "@tavojs/structured-data";

export const head = (
  <StructuredData
    id="product-schema"
    data={[
      createSoftwareApplication({
        siteUrl: "https://example.com",
        url: "/product",
        name: "Example Framework",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        offers: { price: 0 }
      }),
      createBreadcrumbList({
        siteUrl: "https://example.com",
        items: [
          { name: "Products", url: "/products" },
          { name: "Example Framework" }
        ]
      })
    ]}
  />
);
```

Multiple nodes become one `@graph`. Inline JSON is escaped through Tavo.js's
script renderer, including closing script sequences.

## Global Plugin Mode

Use global mode only for a schema deliberately repeated on every SSR or
prerendered page:

```ts
import { defineConfig } from "@tavojs/core/config";
import {
  createStructuredDataPlugin,
  defineStructuredData
} from "@tavojs/structured-data";

const globalSchema = createStructuredDataPlugin({
  id: "global-schema",
  data: defineStructuredData({
    "@type": "Organization",
    name: "Example",
    url: "https://example.com"
  })
});

export default defineConfig({ plugins: [globalSchema] });
```

For search site names and organization identity, prefer homepage metadata. A
root-layout `head(context)` can make that choice from the current pathname.

## More Documentation

- [Framework usage](./docs/framework-usage.md)
- [Tavo.js website integration](./docs/tavojs-integration.md)
- [Schema builders and adapters](./docs/schema-types.md)
- [Validation and publishing](./docs/validation.md)

## Project Policies

- [Contributing](https://github.com/tavojs/plugins/blob/main/CONTRIBUTING.md)
- [Trademark policy](https://github.com/tavojs/plugins/blob/main/TRADEMARKS.md)
- [Security policy](https://github.com/tavojs/plugins/blob/main/SECURITY.md)
