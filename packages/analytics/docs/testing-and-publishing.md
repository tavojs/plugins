# Testing And Publishing

Run package checks from the repository root:

```sh
npm run build
npm test
npm run pack:check
```

The package is published as `@tavojs/analytics` with public npm access. The root export contains plugin configuration and types; browser event helpers live in `@tavojs/analytics/client`.
