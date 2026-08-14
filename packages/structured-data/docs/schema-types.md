# Schema Builders And Adapters

## Site Identity

`createSiteGraph()` returns `WebSite` followed by `Organization`. It creates
stable `#website` and `#organization` identifiers and connects
`WebSite.publisher` to the organization.

```ts
createSiteGraph({
  siteUrl: "https://example.com",
  website: {
    name: "Example",
    alternateName: ["example.com"]
  },
  organization: {
    name: "Example Project",
    logo: "/logo.png",
    sameAs: ["https://github.com/example"]
  }
});
```

`createWebSite()` and `createOrganization()` are also exported for standalone
use.

## Software Applications

`createSoftwareApplication()` supports Google's documented application
categories, a free or paid offer, stable author references, license and
download URLs, and optional real review or rating data.

```ts
createSoftwareApplication({
  siteUrl: "https://example.com",
  url: "/pro",
  name: "Example Pro",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: {
    price: 19,
    priceCurrency: "USD"
  }
});
```

Paid offers require a three-letter currency code. Free offers use `price: 0`.
Do not create ratings or reviews unless they are genuine, visible, and comply
with the search provider's policies.

When an application already has genuine, visible feedback, map that source
instead of copying constants into SEO configuration:

```ts
createSoftwareApplication({
  siteUrl: "https://example.com",
  name: product.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    price: product.price,
    priceCurrency: product.currency
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: product.rating.value,
    ratingCount: product.rating.count
  },
  review: product.reviews.map((review) => ({
    "@type": "Review",
    author: { "@type": "Person", name: review.authorName },
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.value
    }
  }))
});
```

Omit both fields when that source data does not exist. The package never
creates ratings or reviews automatically.

## Breadcrumbs

Breadcrumb metadata requires at least two items. Every item except the final
one needs a URL. Positions are generated automatically.

```ts
createBreadcrumbList({
  siteUrl: "https://example.com",
  items: [
    { name: "Docs", url: "/docs" },
    { name: "API", url: "/docs/api" },
    { name: "Router" }
  ]
});
```

Use a shared application model for both visible navigation and JSON-LD. Do not
derive semantic labels from path segments.

## Application Metadata Adapters

Adapters convert an existing model into package metadata once:

```ts
type DocPage = {
  title: string;
  href: string;
  section: string;
};

const docs = defineStructuredDataAdapter<DocPage>({
  breadcrumbs(page) {
    return [
      { name: page.section, url: `/docs/${page.section.toLowerCase()}` },
      { name: page.title, url: page.href }
    ];
  }
});

const metadata = docs.from(page);
```

Adapters can map breadcrumbs, site-identity selection, software applications,
and custom schemas. They are synchronous so their output can be consumed by a
Tavo.js page head function.

## Custom Schema.org Nodes

Use `defineStructuredData()` when a typed builder is not provided:

```ts
defineStructuredData({
  "@type": "TechArticle",
  headline: "Routing in Tavo.js",
  author: {
    "@id": "https://example.com/#organization"
  }
});
```

Custom values must be finite, JSON-serializable, and free of circular
references. The package intentionally does not reimplement the full Schema.org
vocabulary.
