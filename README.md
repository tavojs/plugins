# Tavo.js Plugins

Official plugins for the [Tavo.js](https://tavojs.dev) framework.

## Packages

| Package | Description |
| --- | --- |
| [`@tavojs/analytics`](./packages/analytics) | Google Analytics and Google Tag Manager integration with configurable consent-aware loading. |
| [`@tavojs/sitemap`](./packages/sitemap) | Automatic `sitemap.xml` and optional `robots.txt` generation for SSR and static builds. |

Each package is independently versioned and published to npm.

## Installation

Install the plugins your application needs:

```sh
npm install @tavojs/analytics
npm install @tavojs/sitemap
```

Both packages use `@tavojs/core` as a peer dependency.

## Quick start

### Analytics

```ts
import { defineConfig } from "@tavojs/core/config";
import { createAnalyticsPlugin } from "@tavojs/analytics";

export default defineConfig({
  plugins: [
    createAnalyticsPlugin({
      googleAnalytics: { measurementId: "G-XXXXXXXXXX" }
    })
  ]
});
```

See the [`@tavojs/analytics` documentation](./packages/analytics) for Google Tag
Manager, consent modes, client events, and loading strategies.

### Sitemap

```ts
import { defineConfig } from "@tavojs/core/config";
import { createSitemapPlugin } from "@tavojs/sitemap";

export default defineConfig({
  plugins: [
    createSitemapPlugin({
      siteUrl: "https://example.com",
      robots: true
    })
  ]
});
```

See the [`@tavojs/sitemap` documentation](./packages/sitemap) for automatic
page discovery, dynamic entries, metadata, exclusions, and deployment details.

## Requirements

- Node.js `^20.19.0`, `^22.12.0`, or a newer supported release
- `@tavojs/core` `^1.0.0`

## Development

Install dependencies and run the full validation suite from the repository
root:

```sh
npm ci
npm run build
npm test
npm run release:check
```

Package-specific commands can use npm workspaces:

```sh
npm test --workspace @tavojs/analytics
npm test --workspace @tavojs/sitemap
```

## Releases

Releases are managed with Changesets and published from GitHub Actions through
npm Trusted Publishing with provenance.

## Contributing

Read the [contribution guide](./CONTRIBUTING.md) before opening a pull request.
Please report security issues through the process in [SECURITY.md](./SECURITY.md)
rather than a public issue.

## License

Released under the [MIT License](./LICENSE). The project name and branding are
covered separately by the [trademark policy](./TRADEMARKS.md).
