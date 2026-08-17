# @tavojs/sitemap

## 1.0.2

### Patch Changes

- 87e78aa: Integrate sitemap and structured-data URL normalization with Tavo.js's resolved trailing-slash policy, with explicit overrides, backward-compatible absolute URLs, and file-resource protection.

## 1.0.1

### Patch Changes

- 4cd8863: Add opt-in trailing-slash normalization for discovered pages, explicit entries, and alternate-language URLs.

## Unreleased

- Integrate trailing-slash normalization with the framework-resolved URL policy for runtime and static sitemaps.
- Support `"always"`, `"never"`, and `"preserve"` policies while retaining boolean entry and discovery overrides.
- Preserve queries and file-like resources when normalizing entries and alternate-language URLs.

## 1.0.0

- Initial public release.
