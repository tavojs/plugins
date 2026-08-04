# Contributing to Tavo.js Plugins

Thank you for contributing to the Tavo.js Plugins monorepo. Workspaces live
under `packages/`. `@tavojs/analytics` and `@tavojs/sitemap` are public packages,
while `@tavojs/auth` and `@tavojs/fsm` are private workspaces whose source is
excluded from the public repository.

## Development workflow

Install the workspace dependencies:

```sh
npm install
```

Make focused changes in the relevant workspace, add or update tests and
documentation, and run the checks appropriate to the change:

```sh
npm run build
npm test
npm run release:manifest
npm run pack:check
```

Before requesting review, run the complete non-publishing release validation:

```sh
npm run release:check
```

`release:check` validates manifests, builds every workspace, runs all tests,
dry-runs the public package tarballs, and audits production dependencies. It
does not publish packages. Do not run `sync:public` as part of ordinary
contribution validation.

## Changesets

Changesets describe changes to publishable packages. Add a release-note entry
for each change to `@tavojs/analytics` or `@tavojs/sitemap` by running:

```sh
npm run changeset
```

Select only the affected public package or packages and describe the impact.
Auth and FSM remain private and are excluded from versioning and tagging
by the repository's Changesets configuration. A changeset does not authorize a
contributor to publish: maintainers release through the protected GitHub
workflow and npm Trusted Publishing.

## Pull requests

Keep pull requests focused, explain the motivation and validation performed,
and avoid committing build output, credentials, private paths, or unrelated
changes. Contributions should preserve package names, public/private flags, and
release configuration unless a maintainer-approved change specifically requires
otherwise.

## License and copyright

Contributions to every workspace are licensed under the [MIT License](./LICENSE).
Contributors retain copyright in their contributions; no copyright assignment
is required.

You must have the legal right to submit all code, documentation, tests, examples,
provider integrations, generated files, and other material in your contribution.
Do not submit incompatible copied work, confidential material, secrets, provider
credentials, or personal data.

The MIT License does not grant trademark rights. The repository's
[trademark policy](./TRADEMARKS.md) applies.

## Developer Certificate of Origin

Every contributed commit must be signed off under the
[Developer Certificate of Origin 1.1](https://developercertificate.org/). Create
signed-off commits with:

```sh
git commit --signoff
```

This adds a trailer in the following form:

```text
Signed-off-by: Your Name <your.email@example.com>
```

The sign-off certifies that you have the right to submit the contribution under
the repository's license and contribution terms. Unsigned commits may need to be
corrected before merge.
