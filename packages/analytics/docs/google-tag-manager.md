# Google Tag Manager

Use GTM mode when the container should own GA and other tag configuration:

```ts
createAnalyticsPlugin({
  googleTagManager: {
    containerId: "GTM-XXXXXXX",
    dataLayerName: "appDataLayer",
    initialData: {
      app_environment: "production"
    }
  }
});
```

Configure the GA4 Google tag inside the GTM workspace. Do not also configure `googleAnalytics` in Tavo.js, because the same event may reach GA twice.

For a GTM environment snippet, pass its auth and preview values:

```ts
googleTagManager: {
  containerId: "GTM-XXXXXXX",
  environment: {
    auth: "environment-auth-token",
    preview: "env-3"
  }
}
```

`track` pushes `{ event: name, ...parameters }` semantics to the configured data layer, with the provided event name taking precedence. Create GTM Custom Event triggers for application events.

## Basic consent mode

Configure strict prior-consent loading with:

```ts
createAnalyticsPlugin({
  loading: {
    strategy: "after-consent",
    preConsentEvents: "drop"
  },
  consent: {
    default: {
      ad_personalization: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      analytics_storage: "denied"
    }
  },
  googleTagManager: {
    containerId: "GTM-XXXXXXX"
  }
});
```

The rendered document contains the validated container configuration and local consent commands, but no Google URL or script insertion. After a local grant, `loadAnalytics()` pushes configured initial data and the `gtm.js` bootstrap event exactly once, then inserts the environment-aware GTM script.

For complex consent deployments, prefer a CMP and GTM consent-mode template. Ensure tags in the container have appropriate built-in or additional consent checks. The package controls when the container loads and exposes generic consent primitives; it does not replace tag-level consent configuration.

Plugin API v1 cannot inject GTM's `<noscript>` iframe at the start of the body. The JavaScript integration is complete; no-JavaScript visits are not measured.
