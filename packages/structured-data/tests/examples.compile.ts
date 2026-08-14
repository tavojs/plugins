import type { Child } from "@tavojs/core";
import type { PageLoadContext } from "@tavojs/core/router";
import {
  StructuredData,
  createBreadcrumbList,
  createSoftwareApplication,
  createStructuredDataPlugin,
  createStructuredDataSite,
  defineStructuredData,
  defineStructuredDataAdapter,
  type PageStructuredDataMetadata,
  type StructuredDataBreadcrumb,
  type StructuredDataDocument
} from "../src/index.js";

type DocPageDefinition = {
  navTitle: string;
  path: string;
  section: "core" | "ui";
  slug: string;
  structuredData?: StructuredDataDocument;
};

declare function documentationPageForPath(
  pathname: string
): DocPageDefinition | undefined;

function documentationBreadcrumbs(
  page: DocPageDefinition
): StructuredDataBreadcrumb[] {
  const items: StructuredDataBreadcrumb[] = [{ name: "Docs", url: "/docs" }];
  if (page.section === "ui") {
    items.push({ name: "UI", url: "/docs/ui" });
    if (page.slug.startsWith("components/")) {
      items.push({ name: "Components", url: "/docs/ui/components" });
    }
  } else {
    items.push({ name: "Framework", url: "/docs/core" });
    if (page.slug.startsWith("api/")) {
      items.push({ name: "Core API", url: "/docs/core/api" });
    }
  }
  items.push({ name: page.navTitle, url: page.path });
  return items;
}

function resolveWebsiteStructuredData(
  pathname: string
): PageStructuredDataMetadata | undefined {
  const page = documentationPageForPath(pathname);
  return page ? { breadcrumbs: documentationBreadcrumbs(page) } : undefined;
}

const structuredData = createStructuredDataSite({
  siteUrl: "https://tavojs.dev",
  website: { name: "Tavo.js", alternateName: ["tavojs.dev"] },
  organization: {
    name: "Tavo.js",
    logo: "/images/tavo-logo.png",
    sameAs: ["https://github.com/tavojs"]
  },
  applications: [{
    path: "/",
    name: "Tavo.js Framework",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 0 }
  }],
  resolve(context) {
    return resolveWebsiteStructuredData(context.pathname);
  }
});

export function rootHead(context: PageLoadContext): Child {
  return structuredData.head(context);
}

const docsAdapter = defineStructuredDataAdapter<DocPageDefinition>({
  breadcrumbs: documentationBreadcrumbs,
  schemas(page) {
    return page.structuredData;
  }
});

declare const page: DocPageDefinition;
void docsAdapter.from(page);

type ProductPageData = {
  breadcrumbs: readonly StructuredDataBreadcrumb[];
  structuredData?: StructuredDataDocument;
};

export function productHead({
  data,
  ...context
}: PageLoadContext & { data: ProductPageData }): Child {
  return structuredData.head(context, {
    breadcrumbs: data.breadcrumbs,
    schemas: data.structuredData
  });
}

const paidApplication = createSoftwareApplication({
  siteUrl: "https://example.com",
  name: "Example Pro",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { price: 19, priceCurrency: "USD" },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: 4.8,
    ratingCount: 125
  },
  review: [{
    "@type": "Review",
    author: { "@type": "Person", name: "Example user" },
    reviewRating: { "@type": "Rating", ratingValue: 5 }
  }]
});

const breadcrumb = createBreadcrumbList({
  siteUrl: "https://example.com",
  items: [
    { name: "Products", url: "/products" },
    { name: "Example Pro" }
  ]
});

void StructuredData({
  id: "product-schema",
  nonce: "request-nonce",
  data: [paidApplication, breadcrumb]
});

const customSchema = defineStructuredData({
  "@type": "TechArticle",
  headline: "Routing in Tavo.js"
});

void createStructuredDataPlugin({
  id: "global-schema",
  data: customSchema
});
