# @tavojs/analytics

Google Analytics and Google Tag Manager support for Tavo.js apps.

This is one package with two installation modes. Choose direct Google Analytics for a small, code-owned analytics setup. Choose Google Tag Manager when tags and triggers should be managed in GTM; configure the GA4 tag in the GTM container instead of also enabling direct GA.

The package also supports Google's Advanced and Basic Consent Mode loading models. `immediate` is the backward-compatible default and loads Google with the configured consent defaults. `after-consent` emits only an inert local runtime until the application records an analytics grant and calls `loadAnalytics`. `manual` loads only after an explicit call.

## Install

```sh
npm install @tavojs/analytics
```

## Direct Google Analytics

```ts
import { createAnalyticsPlugin } from "@tavojs/analytics";
import { defineConfig } from "@tavojs/core/config";

export default defineConfig({
  plugins: [
    createAnalyticsPlugin({
      googleAnalytics: { measurementId: "G-XXXXXXXXXX" }
    })
  ]
});
```

## Google Tag Manager

```ts
import { createAnalyticsPlugin } from "@tavojs/analytics";
import { defineConfig } from "@tavojs/core/config";

export default defineConfig({
  plugins: [
    createAnalyticsPlugin({
      googleTagManager: { containerId: "GTM-XXXXXXX" }
    })
  ]
});
```

## Track Events

```ts
import { track, trackPageView } from "@tavojs/analytics/client";

track("sign_up", { method: "email" });
trackPageView({ page_path: "/pricing" });
```

Client helpers are SSR-safe and return `false` when the browser snippet is not available. GTM mode pushes named objects to the selected data layer; direct GA mode queues `gtag` commands.

## Consent

Queue consent defaults before Google scripts load, then update them from the consent UI:

```ts
createAnalyticsPlugin({
  consent: {
    default: {
      ad_personalization: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      analytics_storage: "denied"
    },
    urlPassthrough: true
  },
  googleAnalytics: {
    measurementId: "G-XXXXXXXXXX"
  }
});
```

```ts
import { updateConsent } from "@tavojs/analytics/client";

updateConsent({ analytics_storage: "granted" });
```

Your application remains responsible for collecting valid consent and choosing defaults appropriate to its policy and jurisdictions.

### Strict prior-consent loading

Use `after-consent` when no Google request or application analytics event may occur before an explicit analytics grant:

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
    containerId: "GTM-XXXXXXX",
    initialData: { app_name: "my-app" }
  }
});
```

Apply the saved or newly selected preference in browser code:

```ts
import {
  disableAnalytics,
  loadAnalytics,
  trackPageView,
  updateConsent
} from "@tavojs/analytics/client";

if (preferences.analytics) {
  updateConsent({ analytics_storage: "granted" });
  const result = await loadAnalytics();
  if (result.status === "loaded") {
    // This is an intentional post-consent view, not replayed history.
    trackPageView();
  }
} else {
  updateConsent({ analytics_storage: "denied" });
  disableAnalytics();
}
```

Before a grant, `track`, `trackPageView`, and `pushToDataLayer` return `false` and do not buffer application events. Concurrent load calls share one request. A failed load remains failed until `loadAnalytics({ retry: true })` is called.

`disableAnalytics()` immediately blocks new application events and queues denied Google consent values. It cannot undo data already transmitted or unload executed third-party code. Reload the page after withdrawal when strict process isolation is required; cookie removal remains the consent-management layer's responsibility.

Lifecycle state is available through `getAnalyticsState()` and `subscribeAnalyticsState(listener)`.

## Page Views

The package does not patch browser history. In direct GA mode, GA4 Enhanced Measurement can observe history changes. In GTM mode, use a History Change trigger or call `trackPageView` from app navigation code. Do not enable two approaches for the same navigation.

With deferred loading, the plugin deliberately does not replay the page viewed before consent. If the current page should count after a first successful load, send it explicitly as shown above.

## Current Tavo.js Limitation

Tavo.js Plugin API v1 exposes keyed document-head contributions but not a body-start contribution. The plugin installs the functional GTM JavaScript snippet in the head, but cannot place GTM's optional `<noscript>` iframe immediately after the opening `<body>` tag. Visitors with JavaScript disabled therefore are not measured.

The inline bootstrap is declared as unsafe head HTML. The plugin manifest declares the required `unsafeHeadHtml` permission with an inspection-visible reason, and installing this trusted plugin enables it. Tavo.js rejects the contribution if that manifest permission is missing.

## More Documentation

- `docs/framework-usage.md`
- `docs/google-analytics.md`
- `docs/google-tag-manager.md`
- `docs/testing-and-publishing.md`

## Project Policies

- [Contributing](https://github.com/tavojs/plugins/blob/main/CONTRIBUTING.md)
- [Trademark policy](https://github.com/tavojs/plugins/blob/main/TRADEMARKS.md)
- [Security policy](https://github.com/tavojs/plugins/blob/main/SECURITY.md)
