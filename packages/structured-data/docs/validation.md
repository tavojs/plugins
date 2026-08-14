# Validation And Publishing

## Local Checks

From the package directory:

```sh
npm run build
npm test
npm pack --dry-run
```

From the workspace root:

```sh
npm run build
npm test
npm run release:check
```

Tests cover route matching, metadata precedence, adapters, graph identifiers,
breadcrumbs, application offers, conflicting identifiers, script escaping,
CSP attributes, and the global plugin contract.

## External Validation

Validate generated HTML or deployed public URLs with both tools:

- [Schema.org Validator](https://validator.schema.org/)
- [Google Rich Results Test](https://search.google.com/test/rich-results)

Use Schema.org Validator for every generated node. Use Google Rich Results Test
to check eligibility for Google-supported features such as breadcrumbs and
software applications.

Google's site-name feature uses `WebSite`, but the Rich Results Test does not
currently report site-name eligibility. Validate its syntax with Schema.org
Validator and follow Google's site-name documentation.

Do not add a review or aggregate rating unless it comes from genuine user
feedback. Google can accept a software application without either field and
may report their absence as a non-critical issue instead of an eligibility
error.

## Reference Fixture

On August 13, 2026, the package's representative Tavo.js graph was checked in
both validators. Schema.org Validator reported zero errors and zero warnings.
Google Rich Results Test found one valid breadcrumb item and one valid software
application item. It reported optional, non-critical issues for the missing
`aggregateRating` and the free offer's missing `priceCurrency`; the package
does not fabricate either value to silence an optional warning.

External validators are not part of automated package tests because they are
remote services whose availability and rule sets change independently. Record
manual validation results during application rollout and repeat URL validation
after deployment.
