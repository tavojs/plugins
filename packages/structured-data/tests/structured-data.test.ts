import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "@tavojs/core";
import { inspectPluginGraph } from "@tavojs/core/dev";
import type { PageLoadContext } from "@tavojs/core/router";
import {
  StructuredData,
  createBreadcrumbList,
  createOrganization,
  createSiteGraph,
  createSoftwareApplication,
  createStructuredDataPlugin,
  createStructuredDataSite,
  createWebSite,
  defineStructuredData,
  defineStructuredDataAdapter,
  toStructuredDataJson,
  type StructuredDataNode,
} from "../src/index.js";

function context(pathname: string): PageLoadContext {
  const url = new URL(pathname, "https://example.com");
  const request = new Request(url);
  return {
    pathname: url.pathname,
    params: {},
    request,
    url,
    headers: request.headers,
    method: "GET",
    signal: request.signal,
  };
}

function graph(
  document: Readonly<Record<string, unknown>>,
): StructuredDataNode[] {
  if (Array.isArray(document["@graph"])) {
    return document["@graph"] as StructuredDataNode[];
  }
  const { "@context": _context, ...node } = document;
  return [node as StructuredDataNode];
}

test("creates linked WebSite and Organization nodes with normalized URLs", () => {
  const nodes = createSiteGraph({
    siteUrl: "https://example.com",
    website: {
      name: "Example",
      alternateName: ["EX", "example.com"],
    },
    organization: {
      name: "Example Project",
      logo: "/logo.png",
      sameAs: ["https://github.com/example"],
    },
  });

  assert.equal(nodes[0]?.["@type"], "WebSite");
  assert.equal(nodes[0]?.["@id"], "https://example.com/#website");
  assert.deepEqual(nodes[0]?.publisher, {
    "@id": "https://example.com/#organization",
  });
  assert.equal(nodes[1]?.["@type"], "Organization");
  assert.equal(nodes[1]?.logo, "https://example.com/logo.png");
});

test("creates standalone site entities and rejects invalid site origins", () => {
  const website = createWebSite({
    siteUrl: "https://example.com",
    name: "Example",
  });
  const organization = createOrganization({
    siteUrl: "https://example.com",
    name: "Example",
  });

  assert.equal(website.url, "https://example.com/");
  assert.equal(organization.url, "https://example.com/");
  assert.throws(
    () =>
      createWebSite({ siteUrl: "https://example.com/docs", name: "Example" }),
    /absolute HTTP\(S\) origin/,
  );
});

test("generates BreadcrumbList positions and permits a URL-less final item", () => {
  const breadcrumb = createBreadcrumbList({
    siteUrl: "https://example.com",
    items: [
      { name: "Docs", url: "/docs" },
      { name: "Components", url: "/docs/components" },
      { name: "Button" },
    ],
  });

  assert.deepEqual(breadcrumb.itemListElement, [
    {
      "@type": "ListItem",
      position: 1,
      name: "Docs",
      item: "https://example.com/docs",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Components",
      item: "https://example.com/docs/components",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Button",
    },
  ]);
  assert.throws(
    () =>
      createBreadcrumbList({
        siteUrl: "https://example.com",
        items: [{ name: "Only", url: "/" }],
      }),
    /at least two/,
  );
  assert.throws(
    () =>
      createBreadcrumbList({
        siteUrl: "https://example.com",
        items: [{ name: "Missing" }, { name: "Last" }],
      }),
    /breadcrumb 1 requires a URL/,
  );
});

test("creates free and paid SoftwareApplication offers without inventing ratings", () => {
  const free = createSoftwareApplication({
    siteUrl: "https://example.com",
    name: "Example Framework",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 0 },
  });
  const paid = createSoftwareApplication({
    siteUrl: "https://example.com",
    url: "/pro",
    name: "Example Pro",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { price: 19, priceCurrency: "usd" },
  });

  assert.deepEqual(free.offers, { "@type": "Offer", price: 0 });
  assert.equal(free.aggregateRating, undefined);
  assert.deepEqual(paid.offers, {
    "@type": "Offer",
    price: 19,
    priceCurrency: "USD",
  });
  assert.throws(
    () =>
      createSoftwareApplication({
        siteUrl: "https://example.com",
        name: "Paid",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        offers: { price: 1 },
      }),
    /require priceCurrency/,
  );

  const aggregateRating = defineStructuredData({
    "@type": "AggregateRating",
    ratingValue: 4.8,
    ratingCount: 125,
  });
  const review = defineStructuredData({
    "@type": "Review",
    author: { "@type": "Person", name: "Example user" },
    reviewRating: { "@type": "Rating", ratingValue: 5 },
  });
  const rated = createSoftwareApplication({
    siteUrl: "https://example.com",
    name: "Rated from source data",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: { price: 0 },
    aggregateRating,
    review: [review],
  });

  assert.equal(rated.aggregateRating, aggregateRating);
  assert.deepEqual(rated.review, [review]);
});

test("site metadata generates homepage identity, route applications, and breadcrumbs", () => {
  const site = createStructuredDataSite({
    siteUrl: "https://example.com",
    website: { name: "Example" },
    organization: { name: "Example Project" },
    applications: [
      {
        path: "/",
        name: "Example Framework",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        offers: { price: 0 },
      },
    ],
    resolve({ pathname }) {
      return pathname === "/docs/button"
        ? {
            breadcrumbs: [{ name: "Docs", url: "/docs" }, { name: "Button" }],
          }
        : undefined;
    },
  });

  assert.deepEqual(
    site.data(context("/")).map((node) => node["@type"]),
    ["WebSite", "Organization", "SoftwareApplication"],
  );
  assert.deepEqual(
    site.data(context("/docs/button")).map((node) => node["@type"]),
    ["BreadcrumbList"],
  );
  assert.equal(site.data(context("/about")).length, 0);
  assert.equal(site.head(context("/about")), null);
  assert.equal(
    site.data(context("/about"), {
      breadcrumbs: [{ name: "About" }],
    }).length,
    0,
  );
});

test("per-call metadata overrides resolver and configured application defaults", () => {
  const site = createStructuredDataSite({
    siteUrl: "https://example.com",
    website: { name: "Example" },
    organization: { name: "Example" },
    applications: [
      {
        path: "/product",
        name: "Configured",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        offers: { price: 0 },
      },
    ],
    resolve() {
      return {
        includeSiteIdentity: true,
        softwareApplication: false,
      };
    },
  });

  const resolved = site.data(context("/product"));
  assert.deepEqual(
    resolved.map((node) => node["@type"]),
    ["WebSite", "Organization"],
  );

  const overridden = site.data(context("/product"), {
    includeSiteIdentity: false,
    softwareApplication: {
      name: "Override",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { price: 0 },
    },
  });
  assert.deepEqual(
    overridden.map((node) => node["@type"]),
    ["SoftwareApplication"],
  );
  assert.equal(overridden[0]?.name, "Override");
});

test("metadata adapters convert application models without JSON-LD authoring", () => {
  type Doc = { title: string; href: string; section: string };
  const adapter = defineStructuredDataAdapter<Doc>({
    breadcrumbs(doc) {
      return [
        { name: doc.section, url: `/docs/${doc.section.toLowerCase()}` },
        { name: doc.title, url: doc.href },
      ];
    },
  });

  assert.deepEqual(
    adapter.from({
      title: "Button",
      href: "/docs/ui/button",
      section: "UI",
    }),
    {
      breadcrumbs: [
        { name: "UI", url: "/docs/ui" },
        { name: "Button", url: "/docs/ui/button" },
      ],
    },
  );
});

test("documents use @context directly for one node and @graph for multiple nodes", () => {
  const one = toStructuredDataJson(
    defineStructuredData({
      "@type": "TechArticle",
      headline: "Safe scripts",
    }),
  );
  const many = toStructuredDataJson(
    createSiteGraph({
      siteUrl: "https://example.com",
      website: { name: "Example" },
      organization: { name: "Example" },
    }),
  );

  assert.equal(one["@context"], "https://schema.org");
  assert.equal(one["@type"], "TechArticle");
  assert.equal(graph(many).length, 2);
});

test("deduplicates equivalent identifiers and rejects conflicting identifiers", () => {
  const first = defineStructuredData({
    "@type": "Organization",
    "@id": "https://example.com/#organization",
    name: "Example",
  });
  const equivalent = defineStructuredData({
    name: "Example",
    "@id": "https://example.com/#organization",
    "@type": "Organization",
  });
  const conflict = defineStructuredData({
    "@type": "Organization",
    "@id": "https://example.com/#organization",
    name: "Different",
  });

  assert.equal(graph(toStructuredDataJson([first, equivalent])).length, 1);
  assert.throws(
    () => toStructuredDataJson([first, conflict]),
    /conflicting nodes use @id/,
  );
});

test("renders escaped JSON-LD with stable script attributes", () => {
  const html = renderToString(
    StructuredData({
      id: "page-schema",
      nonce: "nonce-value",
      data: defineStructuredData({
        "@type": "TechArticle",
        headline: "</script><script>alert(1)</script>",
        description: "line\u2028separator\u2029end",
      }),
    }),
  );

  assert.match(html, /^<script /);
  assert.match(html, /type="application\/ld\+json"/);
  assert.match(html, /id="page-schema"/);
  assert.match(html, /data-tavo-head="script:id:page-schema"/);
  assert.match(html, /nonce="nonce-value"/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /\\u003c\/script>/);
});

test("rejects undefined, non-finite, and circular custom schema values", () => {
  assert.throws(
    () =>
      defineStructuredData({
        "@type": "Thing",
        value: undefined,
      } as unknown as StructuredDataNode),
    /must not be undefined/,
  );
  assert.throws(
    () =>
      defineStructuredData({
        "@type": "Thing",
        value: Number.NaN,
      }),
    /non-finite number/,
  );
  const circular: Record<string, unknown> = { "@type": "Thing" };
  circular.self = circular;
  assert.throws(
    () => defineStructuredData(circular as unknown as StructuredDataNode),
    /circular reference/,
  );
});

test("global plugin declares a safe singleton and renders its server head phase", async () => {
  const plugin = createStructuredDataPlugin({
    id: "global-schema",
    data: {
      "@type": "Organization",
      name: "Example",
    },
  });
  const inspection = inspectPluginGraph([plugin]);
  const loaded = await plugin.server?.();
  const phase = loaded && "default" in loaded ? loaded.default : loaded;
  const html = renderToString(phase?.head?.["structured-data"] as never);

  assert.equal(inspection.valid, true);
  assert.deepEqual(inspection.head, [
    {
      owner: "@tavojs/structured-data#default",
      id: "structured-data",
      key: "tavo:structured-data:global-schema",
      cardinality: "singleton",
    },
  ]);
  assert.deepEqual(inspection.permissions, []);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /\"@type\":\"Organization\"/);
});
