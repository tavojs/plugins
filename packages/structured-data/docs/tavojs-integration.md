# Tavo.js Website Integration

This package does not change the `tavojs.dev` application. The following is
the package-side integration contract to use when the website repository is
updated separately.

## Central Site Metadata

Create `src/seo/structured-data.ts` in the website application:

```ts
import {
  createStructuredDataSite,
  type PageStructuredDataMetadata
} from "@tavojs/structured-data";

export const structuredData = createStructuredDataSite({
  siteUrl: "https://tavojs.dev",
  website: {
    name: "Tavo.js",
    alternateName: ["tavojs.dev"]
  },
  organization: {
    name: "Tavo.js",
    logo: "/images/tavo-logo.png",
    sameAs: [
      "https://github.com/tavojs",
      "https://www.npmjs.com/org/tavojs",
      "https://www.linkedin.com/company/tavo-js/",
      "https://www.instagram.com/tavojs.dev/",
      "https://www.youtube.com/@tavojs-dev"
    ]
  },
  applications: [{
    path: "/",
    name: "Tavo.js Framework",
    description:
      "A TypeScript-first frontend framework for client-rendered and server-rendered applications.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 0 },
    license: "https://github.com/tavojs/core/blob/main/LICENSE",
    downloadUrl: "https://www.npmjs.com/package/@tavojs/core"
  }],
  resolve(context) {
    return resolveWebsiteStructuredData(context.pathname);
  }
});

function resolveWebsiteStructuredData(
  pathname: string
): PageStructuredDataMetadata | undefined {
  const page = documentationPageForPath(pathname);
  return page
    ? { breadcrumbs: documentationBreadcrumbs(page) }
    : undefined;
}
```

`documentationPageForPath()` remains owned by the website's route registry.
No labels are inferred from URL segments.

## One Root-Layout Call

The existing Tavo.js `head(context)` hook already supports returning head
children. Add the site helper beside the canonical metadata:

```tsx
import { Seo } from "@tavojs/core";
import type { PageLoadContext } from "@tavojs/core/router";
import { structuredData } from "src/seo/structured-data";

export function head(context: PageLoadContext) {
  const canonical = new URL(context.pathname, "https://tavojs.dev").href;

  return (
    <>
      <Seo canonical={canonical} openGraph={{ url: canonical }} />
      {structuredData.head(context)}
    </>
  );
}
```

That one call covers every route known to the synchronous website registry.

## Shared Documentation Breadcrumb Model

Keep the hierarchy in one website function so the visible breadcrumb and
JSON-LD cannot drift. This example uses the existing `section`, `slug`, and
`navTitle` fields; adapt the discriminants to the registry's actual type:

```ts
import type { StructuredDataBreadcrumb } from "@tavojs/structured-data";

export function documentationBreadcrumbs(
  page: DocPageDefinition
): StructuredDataBreadcrumb[] {
  const items: StructuredDataBreadcrumb[] = [
    { name: "Docs", url: "/docs" }
  ];

  if (page.section === "ui") {
    items.push({ name: "UI", url: "/docs/ui" });
    if (page.slug.startsWith("components/")) {
      items.push({ name: "Components", url: "/docs/ui/components" });
    }
  } else if (page.section === "core") {
    items.push({ name: "Framework", url: "/docs/core" });
    if (page.slug.startsWith("api/")) {
      items.push({ name: "Core API", url: "/docs/core/api" });
    }
  }

  items.push({ name: page.navTitle, url: documentationPath(page) });
  return items;
}
```

The visible component consumes the same result:

```tsx
const breadcrumbs = documentationBreadcrumbs(page);

return <VisibleBreadcrumbs items={breadcrumbs} />;
```

The root-layout resolver receives the list through the registry and generates
`BreadcrumbList` automatically. For a standalone route, the same list can be
rendered directly with `createBreadcrumbList()` and `StructuredData`.

## Registry Adapter

An adapter keeps the mapping reusable for registries, CMS records, or loader
results:

```ts
import { defineStructuredDataAdapter } from "@tavojs/structured-data";

const docsAdapter = defineStructuredDataAdapter<DocPageDefinition>({
  breadcrumbs(page) {
    return documentationBreadcrumbs(page);
  },
  schemas(page) {
    return page.structuredData;
  }
});

const metadata = docsAdapter.from(page);
```

## Loader-Only Metadata

Tavo.js passes resolved page loader data to that page's `head()` context. A
page can override registry metadata without writing Schema.org nodes:

```tsx
export function head({
  data,
  ...context
}: PageLoadContext & { data: ProductPageData }) {
  return structuredData.head(context, {
    breadcrumbs: data.breadcrumbs,
    schemas: data.structuredData
  });
}
```

A layout head receives its own layout loader data, not a descendant page's
loader data. Keep page-specific loader metadata in the page head.

## Generated Website Output

| Route | JSON-LD selected by the integration |
| --- | --- |
| `/` | `WebSite`, `Organization`, and `SoftwareApplication` in one `@graph` |
| `/docs` | Documentation breadcrumb when the registry supplies at least two items |
| `/docs/core/...` | `BreadcrumbList` from the Core documentation model |
| `/docs/ui/components/...` | Docs → UI → Components → current component |
| `/docs/core/api/...` | Docs → Framework → Core API → current reference |
| Other routes | Nothing unless the resolver or page head supplies metadata |

The package adds only `application/ld+json` script elements. It does not change
visible UI, styles, navigation, cookies, analytics, network requests, or route
behavior.
