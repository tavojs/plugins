import { definePluginFactory } from "@tavojs/core/plugin";
import type {
  AnalyticsLoadingStrategy,
  AnalyticsPlugin,
  AnalyticsRuntimeConfig,
  CreateAnalyticsPluginOptions,
  GoogleAnalyticsOptions,
  GoogleTagManagerOptions
} from "./types.js";

export type {
  AnalyticsConsent,
  AnalyticsConsentOptions,
  AnalyticsLoadOptions,
  AnalyticsLoadResult,
  AnalyticsLoadingOptions,
  AnalyticsLoadingStrategy,
  AnalyticsMode,
  AnalyticsParameters,
  AnalyticsPlugin,
  AnalyticsPreConsentEvents,
  AnalyticsRuntimeConfig,
  AnalyticsRuntimeState,
  AnalyticsRuntimeStatus,
  ConsentStatus,
  CreateAnalyticsPluginOptions,
  GoogleAnalyticsOptions,
  GoogleAnalyticsTransportConfig,
  GoogleTagManagerEnvironment,
  GoogleTagManagerOptions,
  GoogleTagManagerTransportConfig
} from "./types.js";

const GOOGLE_ANALYTICS_ID = /^(?:G|GT)-[A-Z0-9]+$/i;
const GOOGLE_TAG_MANAGER_ID = /^GTM-[A-Z0-9]+$/i;
const DATA_LAYER_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const LOADING_STRATEGIES = new Set<AnalyticsLoadingStrategy>([
  "after-consent",
  "immediate",
  "manual"
]);

function assertGoogleAnalyticsOptions(options: GoogleAnalyticsOptions): void {
  if (!GOOGLE_ANALYTICS_ID.test(options.measurementId)) {
    throw new Error(
      `tavo analytics: invalid Google Analytics tag ID "${options.measurementId}". Expected G-... or GT-....`
    );
  }
}

function assertGoogleTagManagerOptions(options: GoogleTagManagerOptions): string {
  if (!GOOGLE_TAG_MANAGER_ID.test(options.containerId)) {
    throw new Error(
      `tavo analytics: invalid Google Tag Manager container ID "${options.containerId}". Expected GTM-....`
    );
  }
  const dataLayerName = options.dataLayerName ?? "dataLayer";
  if (!DATA_LAYER_NAME.test(dataLayerName)) {
    throw new Error(
      `tavo analytics: invalid data layer name "${dataLayerName}". Use a JavaScript identifier up to 64 characters.`
    );
  }
  if (options.environment && (!options.environment.auth.trim() || !options.environment.preview.trim())) {
    throw new Error("tavo analytics: GTM environment auth and preview values must not be empty.");
  }
  return dataLayerName;
}

function getLoadingStrategy(options: CreateAnalyticsPluginOptions): AnalyticsLoadingStrategy {
  const strategy = options.loading?.strategy ?? "immediate";
  if (!LOADING_STRATEGIES.has(strategy)) {
    throw new Error(`tavo analytics: unsupported loading strategy "${String(strategy)}".`);
  }
  if (options.loading?.preConsentEvents !== undefined && options.loading.preConsentEvents !== "drop") {
    throw new Error("tavo analytics: pre-consent events must use the safe drop policy.");
  }
  return strategy;
}

function createRuntimeConfig(options: CreateAnalyticsPluginOptions): AnalyticsRuntimeConfig {
  const loadingStrategy = getLoadingStrategy(options);
  const base = {
    consentDefault: options.consent?.default ?? {},
    loadingStrategy,
    preConsentEvents: "drop" as const,
    ...(options.consent?.urlPassthrough === undefined
      ? {}
      : { urlPassthrough: options.consent.urlPassthrough })
  };

  if (options.googleAnalytics) {
    assertGoogleAnalyticsOptions(options.googleAnalytics);
    return {
      ...base,
      dataLayerName: "dataLayer",
      mode: "google-analytics",
      transport: {
        config: options.googleAnalytics.config ?? {},
        measurementId: options.googleAnalytics.measurementId
      }
    };
  }

  const googleTagManager = options.googleTagManager!;
  const dataLayerName = assertGoogleTagManagerOptions(googleTagManager);
  return {
    ...base,
    dataLayerName,
    mode: "google-tag-manager",
    transport: {
      containerId: googleTagManager.containerId,
      ...(googleTagManager.environment === undefined
        ? {}
        : { environment: googleTagManager.environment }),
      ...(googleTagManager.initialData === undefined
        ? {}
        : { initialData: googleTagManager.initialData })
    }
  };
}

/**
 * Creates one analytics plugin in either direct GA or GTM mode.
 * Configure a GA tag inside GTM when using GTM mode to avoid duplicate collection.
 */
export const createAnalyticsPlugin: (
  options: CreateAnalyticsPluginOptions
) => AnalyticsPlugin = definePluginFactory((options: CreateAnalyticsPluginOptions) => {
  const hasGoogleAnalytics = options.googleAnalytics !== undefined;
  const hasGoogleTagManager = options.googleTagManager !== undefined;
  if (hasGoogleAnalytics === hasGoogleTagManager) {
    throw new Error(
      "tavo analytics: configure exactly one of googleAnalytics or googleTagManager. Configure GA inside GTM when using Tag Manager."
    );
  }

  const runtime = createRuntimeConfig(options);
  return {
    id: "@tavojs/analytics",
    version: "1.0.0",
    apiVersion: 1,
    manifest: {
      head: [{
        id: "bootstrap",
        key: "tavo:analytics:bootstrap",
        cardinality: "singleton",
        unsafeHeadHtml: true
      }],
      permissions: [{
        name: "unsafeHeadHtml",
        required: true,
        reason: "Injects the validated Google Analytics or Google Tag Manager bootstrap script."
      }]
    },
    analytics: runtime,
    server: async () => {
      const { createAnalyticsServerPhase } = await import("./server.js");
      return createAnalyticsServerPhase(runtime);
    }
  };
});
