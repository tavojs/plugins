import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  disableAnalytics,
  getAnalyticsState,
  loadAnalytics,
  pushToDataLayer,
  subscribeAnalyticsState,
  track,
  trackPageView,
  updateConsent
} from "../src/client.js";
import type {
  AnalyticsConsent,
  AnalyticsLoadingStrategy,
  AnalyticsRuntimeConfig
} from "../src/types.js";

type FakeScript = {
  async: boolean;
  attributes: Record<string, string>;
  onerror: (() => void) | null;
  onload: (() => void) | null;
  removed: boolean;
  remove(): void;
  setAttribute(name: string, value: string): void;
  src: string;
};

type FakeBrowser = {
  documentElementScripts: FakeScript[];
  headScripts: FakeScript[];
  runtime: {
    bootstrapPushed: boolean;
    config: AnalyticsRuntimeConfig;
    consent: AnalyticsConsent;
    disabled: boolean;
    enabled: boolean;
    initialDataPushed: boolean;
    listeners: unknown[];
    status: string;
    transportInserted: boolean;
    transportLoaded: boolean;
  };
  window: Record<string, unknown>;
};

function createConfig(
  mode: "google-analytics" | "google-tag-manager",
  strategy: AnalyticsLoadingStrategy,
  consent: AnalyticsConsent = {}
): AnalyticsRuntimeConfig {
  if (mode === "google-analytics") {
    return {
      consentDefault: consent,
      dataLayerName: "dataLayer",
      loadingStrategy: strategy,
      mode,
      preConsentEvents: "drop",
      transport: {
        config: { send_page_view: false },
        measurementId: "G-CLIENT1"
      }
    };
  }
  return {
    consentDefault: consent,
    dataLayerName: "appLayer",
    loadingStrategy: strategy,
    mode,
    preConsentEvents: "drop",
    transport: {
      containerId: "GTM-CLIENT1",
      environment: {
        auth: "auth-token",
        preview: "env-7"
      },
      initialData: { app_name: "test-app" }
    }
  };
}

function installBrowser(
  mode: "google-analytics" | "google-tag-manager",
  strategy: AnalyticsLoadingStrategy,
  consent: AnalyticsConsent = {},
  options: { withoutHead?: boolean } = {}
): FakeBrowser {
  const config = createConfig(mode, strategy, consent);
  const runtime = {
    bootstrapPushed: false,
    config,
    consent: { ...consent },
    disabled: false,
    enabled: strategy === "immediate",
    initialDataPushed: false,
    listeners: [],
    status: strategy === "immediate" ? "loading" : strategy === "manual" ? "idle" : "awaiting-consent",
    transportInserted: false,
    transportLoaded: false
  };
  const fakeWindow: Record<string, unknown> = {
    __TAVO_ANALYTICS__: runtime,
    location: { href: "https://example.test/pricing" }
  };
  const headScripts: FakeScript[] = [];
  const documentElementScripts: FakeScript[] = [];
  const createScript = (): FakeScript => ({
    async: false,
    attributes: {},
    onerror: null,
    onload: null,
    removed: false,
    remove() {
      this.removed = true;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    src: ""
  });
  const fakeDocument = {
    createElement(name: string) {
      assert.equal(name, "script");
      return createScript();
    },
    documentElement: {
      appendChild(script: FakeScript) {
        documentElementScripts.push(script);
      }
    },
    head: options.withoutHead
      ? null
      : {
          appendChild(script: FakeScript) {
            headScripts.push(script);
          }
        },
    title: "Pricing"
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument
  });
  return { documentElementScripts, headScripts, runtime, window: fakeWindow };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

test("SSR lifecycle and event calls remain safe", async () => {
  assert.deepEqual(await loadAnalytics(), { status: "not-configured" });
  assert.deepEqual(getAnalyticsState(), { consent: {}, status: "not-configured" });
  assert.equal(track("signup"), false);
  assert.equal(trackPageView(), false);
  assert.equal(updateConsent({ analytics_storage: "granted" }), false);
  assert.equal(disableAnalytics(), false);
  assert.equal(pushToDataLayer({ currency: "EUR" }), false);
  assert.equal(typeof subscribeAnalyticsState(() => undefined), "function");
});

test("after-consent drops historical events and loads GTM once after a grant", async () => {
  const browser = installBrowser("google-tag-manager", "after-consent", {
    analytics_storage: "denied"
  });

  assert.equal(track("pre_consent"), false);
  assert.equal(pushToDataLayer({ event: "also_dropped" }), false);
  assert.deepEqual(await loadAnalytics(), { status: "blocked" });
  assert.equal(browser.headScripts.length, 0);

  assert.equal(updateConsent({ analytics_storage: "granted" }), true);
  const loading = loadAnalytics();
  assert.equal(browser.headScripts.length, 1);
  assert.match(
    browser.headScripts[0]!.src,
    /^https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-CLIENT1&l=appLayer&gtm_auth=auth-token&gtm_preview=env-7&gtm_cookies_win=x$/
  );

  const layer = browser.window.appLayer as unknown[];
  assert.deepEqual(layer[1], { app_name: "test-app" });
  assert.equal((layer[2] as { event: string }).event, "gtm.js");
  assert.equal(layer.some((entry) => (entry as { event?: string }).event === "pre_consent"), false);

  browser.headScripts[0]!.onload?.();
  assert.deepEqual(await loading, { status: "loaded" });
  assert.equal(track("post_consent", { plan: "pro" }), true);
  assert.deepEqual(layer[3], { event: "post_consent", plan: "pro" });
  assert.deepEqual(await loadAnalytics(), { status: "already-loaded" });
  assert.equal(browser.headScripts.length, 1);
  assert.equal(layer.filter((entry) => (entry as { event?: string }).event === "gtm.js").length, 1);
});

test("concurrent loads share one promise and append to documentElement as fallback", async () => {
  const browser = installBrowser(
    "google-tag-manager",
    "after-consent",
    { analytics_storage: "granted" },
    { withoutHead: true }
  );

  const first = loadAnalytics();
  const second = loadAnalytics();
  assert.equal(first, second);
  assert.equal(browser.documentElementScripts.length, 1);
  browser.documentElementScripts[0]!.onload?.();
  assert.deepEqual(await first, { status: "loaded" });
  assert.deepEqual(await second, { status: "loaded" });
});

test("a saved grant can initialize immediately on mount", async () => {
  const browser = installBrowser("google-tag-manager", "after-consent", {
    analytics_storage: "granted"
  });

  const loading = loadAnalytics();
  assert.equal(browser.headScripts.length, 1);
  browser.headScripts[0]!.onload?.();
  assert.deepEqual(await loading, { status: "loaded" });
});

test("rejection never inserts a transport and withdrawal blocks later events", async () => {
  const rejected = installBrowser("google-tag-manager", "after-consent", {
    analytics_storage: "denied"
  });
  assert.deepEqual(await loadAnalytics(), { status: "blocked" });
  assert.equal(rejected.headScripts.length, 0);

  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  const granted = installBrowser("google-tag-manager", "after-consent", {
    analytics_storage: "granted"
  });
  const loading = loadAnalytics();
  granted.headScripts[0]!.onload?.();
  await loading;
  assert.equal(track("before_withdrawal"), true);
  assert.equal(disableAnalytics(), true);
  assert.equal(track("after_withdrawal"), false);
  assert.equal(pushToDataLayer({ event: "after_withdrawal" }), false);
  assert.equal(getAnalyticsState().status, "disabled");
  assert.equal(disableAnalytics(), false);
});

test("failed loads are stable and retry only when requested", async () => {
  const browser = installBrowser("google-analytics", "manual");

  const first = loadAnalytics();
  assert.match(browser.headScripts[0]!.src, /gtag\/js\?id=G-CLIENT1$/);
  browser.headScripts[0]!.onerror?.();
  assert.deepEqual(await first, {
    error: "Failed to load analytics transport.",
    status: "failed"
  });
  assert.equal(browser.headScripts[0]!.removed, true);
  assert.deepEqual(await loadAnalytics(), {
    error: "Failed to load analytics transport.",
    status: "failed"
  });
  assert.equal(browser.headScripts.length, 1);

  const retry = loadAnalytics({ retry: true });
  assert.equal(browser.headScripts.length, 2);
  browser.headScripts[1]!.onload?.();
  assert.deepEqual(await retry, { status: "loaded" });
  const layer = browser.window.dataLayer as unknown[];
  assert.equal(Array.from(layer[0] as ArrayLike<unknown>)[0], "js");
  assert.equal(Array.from(layer[1] as ArrayLike<unknown>)[0], "config");
  assert.equal(layer.length, 2);
});

test("immediate mode keeps backward-compatible event queuing", () => {
  const browser = installBrowser("google-analytics", "immediate");

  assert.equal(track("purchase", { value: 42 }), true);
  assert.equal(updateConsent({ analytics_storage: "denied" }), true);

  const layer = browser.window.dataLayer as unknown[];
  assert.deepEqual(Array.from(layer[0] as ArrayLike<unknown>), [
    "event",
    "purchase",
    { value: 42 }
  ]);
  assert.deepEqual(Array.from(layer[1] as ArrayLike<unknown>), [
    "consent",
    "update",
    { analytics_storage: "denied" }
  ]);
});

test("state subscribers receive loading and loaded transitions", async () => {
  const browser = installBrowser("google-tag-manager", "manual");
  const statuses: string[] = [];
  const unsubscribe = subscribeAnalyticsState((state) => statuses.push(state.status));

  const loading = loadAnalytics();
  browser.headScripts[0]!.onload?.();
  await loading;
  unsubscribe();
  disableAnalytics();

  assert.deepEqual(statuses, ["loading", "loaded"]);
});

test("empty event names fail early", () => {
  installBrowser("google-analytics", "immediate");
  assert.throws(() => track("  "), /must not be empty/);
});
