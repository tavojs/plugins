# Direct Google Analytics

Use direct mode when the app owns its analytics configuration in code:

```ts
createAnalyticsPlugin({
  googleAnalytics: {
    measurementId: "G-XXXXXXXXXX",
    config: {
      send_page_view: false
    }
  }
});
```

`measurementId` accepts GA4 `G-...` IDs and `GT-...` Google tag IDs. Universal Analytics `UA-...` properties are not supported.

The plugin initializes the data layer, queues any consent default, loads `gtag.js`, and calls the initial `config` command once. Values in `config` are serialized into the initial command.

With `loading.strategy: "after-consent"` or `"manual"`, SSR queues only local consent state. The `js` and `config` commands and the `gtag.js` request are created once by `loadAnalytics()`.

If `send_page_view` is disabled, call `trackPageView` from the application's navigation lifecycle. Also review GA4 Enhanced Measurement so history-based page views are not counted twice.
