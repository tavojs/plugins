# Changesets

Add a release note entry for each publishable package change:

```sh
npm run changeset
```

The manually dispatched GitHub `Publish` workflow opens or updates a version
pull request. Merging that pull request and dispatching `Publish` again releases
the changed packages to npm through Trusted Publishing with GitHub OIDC.

The version command also synchronizes each package version into its Tavo.js plugin
descriptor before the version pull request is created.
