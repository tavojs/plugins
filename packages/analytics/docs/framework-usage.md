# Framework Usage

Register exactly one `createAnalyticsPlugin` instance in `tavo.config.ts`. The plugin writes a local runtime into the server-rendered document head and uses one of three loading strategies:

- `immediate` is the default and preserves Advanced Consent Mode behavior. The Google transport is installed during initial rendering, even when consent defaults are denied.
- `after-consent` implements Basic Consent Mode. SSR contains no Google endpoint or transport insertion. `loadAnalytics()` remains blocked until `updateConsent({ analytics_storage: "granted" })` records a local grant.
- `manual` also defers SSR loading, but the explicit `loadAnalytics()` call itself authorizes installation. This is useful when eligibility is controlled outside Google consent fields.

Deferred modes always use `preConsentEvents: "drop"`. Buffering is intentionally unsupported because replaying events after a later grant would measure behavior that occurred before consent.

## Client API

- `loadAnalytics({ retry? })` installs the validated server configuration exactly once and resolves on the script load or error event.
- `disableAnalytics()` prevents subsequent application events and records denied analytics/ad consent values.
- `getAnalyticsState()` returns a snapshot with consent, mode, strategy, status, and any load error.
- `subscribeAnalyticsState(listener)` observes loading, loaded, failed, and disabled transitions.
- `track(name, parameters)` sends an eligible event.
- `trackPageView(parameters)` sends `page_view` with browser location and title defaults.
- `updateConsent(consent)` records and queues a consent update without automatically loading a deferred transport.
- `pushToDataLayer(data)` is an eligibility-gated escape hatch for advanced GTM and Google tag data.

All helpers are SSR-safe. Event helpers return `false` if no browser runtime exists or tracking is not eligible. A missing runtime produces `{ status: "not-configured" }` from `loadAnalytics()`.

## Strict consent flow

```ts
updateConsent({ analytics_storage: "granted" });
const result = await loadAnalytics();

if (result.status === "loaded") {
  trackPageView();
}
```

Run the same flow during controller mount when persisted preferences already contain a grant. Repeated calls, layouts, and preference events reuse the loaded transport.

For rejection or withdrawal:

```ts
updateConsent({ analytics_storage: "denied" });
disableAnalytics();
```

Withdrawal stops package-managed application events. JavaScript already executed by Google cannot be unloaded, and transmitted data cannot be recalled. A reload is recommended when strict isolation after withdrawal is required. This package deliberately does not delete cookies because correct names, paths, and domain scope belong to the application's consent-management policy.

## Page views

The plugin does not patch `history.pushState`, listen for router changes, or automatically send SPA page views. Configure one strategy: GA Enhanced Measurement, a GTM History Change trigger, or application navigation code.

Deferred loading does not retain the pre-consent page view. Send the current page explicitly after a successful first load only when that is the application's intended consent semantics.

## Failure and retry

CSP, ad blockers, and network failures produce a stable `failed` state. Automatic retry is intentionally absent. Use `loadAnalytics({ retry: true })` after a deliberate user or application action. Concurrent calls share the same in-flight promise, and insertion falls back to `document.documentElement` if `document.head` is unavailable.
