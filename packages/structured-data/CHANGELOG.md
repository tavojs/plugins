# @tavojs/structured-data

## 1.0.1

### Patch Changes

- 87e78aa: Integrate sitemap and structured-data URL normalization with Tavo.js's resolved trailing-slash policy, with explicit overrides, backward-compatible absolute URLs, and file-resource protection.

## Unreleased

- Resolve site-relative breadcrumb, application, and offer page URLs with the framework URL policy or an explicit standalone `urlPolicy`.
- Preserve explicit absolute URLs, queries, fragments, entity IDs, and file resources while applying trailing-slash policy.
- Allow `createStructuredDataPlugin({ site })` to bind a site helper to framework plugin context.

## 1.0.0

- Initial public release with metadata-driven site, software application, breadcrumb, adapter, component, and global plugin APIs.
