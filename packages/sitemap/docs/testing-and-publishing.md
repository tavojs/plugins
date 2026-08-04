# Testing And Publishing

Run the package checks from this directory:

```sh
npm run build
npm test
npm pack --dry-run
```

From the workspace root, the standard commands include the sitemap package:

```sh
npm run build
npm test
npm run pack:check
```

Before publishing, test both an SSR request to `/sitemap.xml` and a static Tavo.js build. Verify that callback sources do not expose draft or private records and that the production `siteUrl` is correct.
