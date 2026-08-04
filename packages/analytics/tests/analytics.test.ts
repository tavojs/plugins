import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPluginGraph } from "@tavojs/core/dev";
import { createAnalyticsPlugin } from "../src/index.js";

async function render(plugin: ReturnType<typeof createAnalyticsPlugin>): Promise<string> {
  const loaded = await plugin.server?.();
  const phase = loaded && "default" in loaded ? loaded.default : loaded;
  return phase?.head?.bootstrap ?? "";
}

test("declares its required unsafe head permission", () => {
  const plugin = createAnalyticsPlugin({
    googleAnalytics: { measurementId: "G-ABC123" }
  });
  const inspection = inspectPluginGraph([plugin]);

  assert.deepEqual(inspection.permissions, [{
    owner: "@tavojs/analytics#default",
    name: "unsafeHeadHtml",
    required: true,
    reason: "Injects the validated Google Analytics or Google Tag Manager bootstrap script.",
  }]);
  assert.equal(inspection.valid, true);
});

test("rejects raw head HTML when the manifest permission is removed", () => {
  const plugin = createAnalyticsPlugin({
    googleAnalytics: { measurementId: "G-ABC123" }
  });
  const { permissions: _permissions, ...manifest } = plugin.manifest;
  const inspection = inspectPluginGraph([{ ...plugin, manifest }]);

  assert.equal(inspection.valid, false);
  assert.equal(inspection.diagnostics.some((item) =>
    item.code === "TAVO_PLUGIN_006" && /without declaring unsafeHeadHtml/.test(item.message)
  ), true);
});

test("immediate Google Analytics preserves advanced consent mode behavior", async () => {
  const plugin = createAnalyticsPlugin({
    consent: {
      default: {
        ad_storage: "denied",
        analytics_storage: "denied"
      },
      urlPassthrough: true
    },
    googleAnalytics: {
      config: { send_page_view: false },
      measurementId: "G-ABC123"
    }
  });
  const head = await render(plugin);

  assert.equal(plugin.analytics.loadingStrategy, "immediate");
  assert.equal(plugin.analytics.mode, "google-analytics");
  assert.match(head, /googletagmanager\.com\/gtag\/js\?id=G-ABC123/);
  assert.match(head, /"send_page_view":false/);
  assert.ok(head.indexOf('"consent","default"') < head.indexOf('"config","G-ABC123"'));
});

test("immediate GTM preserves custom layers, environments, and initial data", async () => {
  const plugin = createAnalyticsPlugin({
    googleTagManager: {
      containerId: "GTM-ABC123",
      dataLayerName: "appDataLayer",
      environment: {
        auth: "auth-token",
        preview: "env-3"
      },
      initialData: { app_version: "1.2.3" }
    }
  });
  const head = await render(plugin);

  assert.equal(plugin.analytics.dataLayerName, "appDataLayer");
  assert.equal(plugin.analytics.loadingStrategy, "immediate");
  assert.equal(plugin.analytics.mode, "google-tag-manager");
  assert.match(head, /appDataLayer/);
  assert.match(head, /app_version/);
  assert.ok(head.includes("gtm.js?id=GTM-ABC123\\u0026l=appDataLayer"));
  assert.match(head, /gtm_auth=auth-token/);
  assert.match(head, /gtm_preview=env-3/);
  assert.match(head, /gtm_cookies_win=x/);
});

test("after-consent GTM renders only an inert local runtime", async () => {
  const plugin = createAnalyticsPlugin({
    loading: {
      strategy: "after-consent",
      preConsentEvents: "drop"
    },
    consent: {
      default: {
        ad_storage: "denied",
        ad_user_data: "denied",
        analytics_storage: "denied"
      }
    },
    googleTagManager: {
      containerId: "GTM-STRICT1",
      dataLayerName: "strictLayer",
      environment: {
        auth: "</script><script>bad()</script>",
        preview: "env-5"
      },
      initialData: {
        app_name: "tavo-website",
        unsafe: "</script><script>bad()</script>"
      }
    }
  });
  const head = await render(plugin);

  assert.equal(plugin.analytics.loadingStrategy, "after-consent");
  assert.match(head, /status:"awaiting-consent"/);
  assert.match(head, /"analytics_storage":"denied"/);
  assert.match(head, /GTM-STRICT1/);
  assert.match(head, /strictLayer/);
  assert.match(head, /app_name/);
  assert.doesNotMatch(head, /googletagmanager\.com|gtm\.js|gtag\.js|<iframe/i);
  assert.doesNotMatch(head, /<script>bad\(\)<\/script>/);
  assert.match(head, /\\u003c\/script\\u003e/);
});

test("manual direct GA also omits the transport during SSR", async () => {
  const plugin = createAnalyticsPlugin({
    loading: { strategy: "manual" },
    googleAnalytics: {
      config: { debug_mode: true },
      measurementId: "G-MANUAL1"
    }
  });
  const head = await render(plugin);

  assert.equal(plugin.analytics.loadingStrategy, "manual");
  assert.match(head, /status:"idle"/);
  assert.match(head, /G-MANUAL1/);
  assert.doesNotMatch(head, /googletagmanager\.com|gtag\.js/);
});

test("configuration requires exactly one provider", () => {
  assert.throws(() => createAnalyticsPlugin({} as never), /configure exactly one/);
  assert.throws(
    () =>
      createAnalyticsPlugin({
        googleAnalytics: { measurementId: "G-ABC123" },
        googleTagManager: { containerId: "GTM-ABC123" }
      } as never),
    /configure exactly one/
  );
});

test("IDs, loading policies, and custom data layer names are validated", () => {
  assert.throws(
    () => createAnalyticsPlugin({ googleAnalytics: { measurementId: "UA-123" } }),
    /invalid Google Analytics tag ID/
  );
  assert.throws(
    () =>
      createAnalyticsPlugin({
        googleTagManager: {
          containerId: "GTM-ABC123",
          dataLayerName: "not-valid-name"
        }
      }),
    /invalid data layer name/
  );
  assert.throws(
    () =>
      createAnalyticsPlugin({
        loading: { strategy: "later" as never },
        googleAnalytics: { measurementId: "G-ABC123" }
      }),
    /unsupported loading strategy/
  );
});

test("immediate inline configuration escapes script-breaking values", async () => {
  const head = await render(
    createAnalyticsPlugin({
      googleAnalytics: {
        config: { campaign: "</script><script>alert(1)</script>" },
        measurementId: "G-ABC123"
      }
    })
  );

  assert.doesNotMatch(head, /<script>alert\(1\)<\/script>/);
  assert.match(head, /\\u003c\/script\\u003e/);
});
