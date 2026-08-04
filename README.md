# Tavo.js Plugins

Public plugins for the [Tavo.js](https://tavojs.dev) framework.

## Packages

- `packages/analytics` publishes `@tavojs/analytics`.
- `packages/sitemap` publishes `@tavojs/sitemap`.
- `packages/auth` contains the private `@tavojs/auth` workspace.
- `packages/fsm` contains the private `@tavojs/fsm` workspace.

Analytics and Sitemap are independently versioned and published from this npm
workspace. Auth and FSM remain private, are never published by Changesets, and
their source directories are excluded from the public repository export.

## Development

```sh
npm ci
npm run build
npm test
npm run release:check
```

The repository consumes the released `@tavojs/core` package. Private framework
CI may test this public repository against a packed prerelease of core, but local
or private paths must never be committed here.

## Public source synchronization

Create the first reviewed public snapshot in an empty directory outside this
private repository:

```sh
npm run export:public -- /absolute/path/to/plugins-public
```

For later updates, start from a clean public checkout of `tavojs/plugins`, create
a branch other than `main` or `master`, and run:

```sh
npm run sync:public -- /absolute/path/to/plugins-public
```

The exporter stages and scans an explicit public allowlist containing only the
analytics and sitemap package directories. It refuses symbolic links,
credentials, private keys, machine paths, build output, private handovers, an
unexpected Git remote, a dirty public checkout, or a sync on the default branch.
Review and merge the resulting public-repository pull request normally.

## Releases

Releases follow the same Changesets and npm Trusted Publishing pattern as
`tavojs/core` and `tavojs/ui`.

1. Add a changeset with `npm run changeset`.
2. Merge the package change and its changeset to `main`.
3. Run the GitHub `Publish` workflow. It opens or updates the Changesets version PR.
4. Review and merge the version PR.
5. Run `Publish` again. The workflow verifies, publishes, creates npm provenance,
   tags the release, and creates GitHub releases.

The workflow uses the protected GitHub `npm` environment and GitHub OIDC. It
does not use an `NPM_TOKEN`.

### One-time npm setup

An npm package must exist before a trusted publisher can be attached. Bootstrap
each new package once with a maintainer account protected by 2FA, after running
`npm run release:check`:

```sh
npm publish --workspace @tavojs/analytics --access public
npm publish --workspace @tavojs/sitemap --access public
```

Then configure Trusted Publishing in each package's npm settings:

- Provider: GitHub Actions
- Organization: `tavojs`
- Repository: `plugins`
- Workflow filename: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Create the `npm` environment in the GitHub repository, add required reviewers if
desired, run the workflow once, and then set npm publishing access to require 2FA
and disallow traditional tokens.

## Project policies

- [License](./LICENSE)
- [Contributing](./CONTRIBUTING.md)
- [Trademark policy](./TRADEMARKS.md)
- [Security policy](./SECURITY.md)
