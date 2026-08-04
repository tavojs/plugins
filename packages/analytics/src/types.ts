import type { TavoPlugin } from "@tavojs/core/plugin";

export type AnalyticsMode = "google-analytics" | "google-tag-manager";
export type AnalyticsLoadingStrategy = "after-consent" | "immediate" | "manual";
export type AnalyticsPreConsentEvents = "drop";

export type AnalyticsParameters = Record<string, unknown>;

export type ConsentStatus = "denied" | "granted";

export type AnalyticsConsent = {
  ad_personalization?: ConsentStatus;
  ad_storage?: ConsentStatus;
  ad_user_data?: ConsentStatus;
  analytics_storage?: ConsentStatus;
  functionality_storage?: ConsentStatus;
  personalization_storage?: ConsentStatus;
  security_storage?: ConsentStatus;
  region?: string[];
  wait_for_update?: number;
};

export type AnalyticsConsentOptions = {
  /** Consent state queued before the Google script starts loading. */
  default: AnalyticsConsent;
  /** Preserve supported ad click identifiers in links when storage is denied. */
  urlPassthrough?: boolean;
};

export type AnalyticsLoadingOptions = {
  /** Defaults to immediate for backward compatibility. */
  strategy?: AnalyticsLoadingStrategy;
  /** Deferred transports deliberately support dropping, never replaying, pre-consent events. */
  preConsentEvents?: AnalyticsPreConsentEvents;
};

export type GoogleAnalyticsOptions = {
  /** Additional values passed to the initial gtag config command. */
  config?: AnalyticsParameters;
  /** A GA4 measurement ID (G-...) or Google tag ID (GT-...). */
  measurementId: string;
};

export type GoogleTagManagerEnvironment = {
  auth: string;
  cookiesWin?: boolean;
  preview: string;
};

export type GoogleTagManagerOptions = {
  /** A web container ID such as GTM-XXXXXXX. */
  containerId: string;
  /** Custom data layer name. Defaults to dataLayer. */
  dataLayerName?: string;
  /** Optional GTM environment parameters. */
  environment?: GoogleTagManagerEnvironment;
  /** Data pushed immediately before the GTM bootstrap event. */
  initialData?: AnalyticsParameters;
};

type AnalyticsPluginBaseOptions = {
  consent?: AnalyticsConsentOptions;
  loading?: AnalyticsLoadingOptions;
};

export type CreateAnalyticsPluginOptions = AnalyticsPluginBaseOptions & (
  | {
      googleAnalytics: GoogleAnalyticsOptions;
      googleTagManager?: never;
    }
  | {
      googleAnalytics?: never;
      googleTagManager: GoogleTagManagerOptions;
    }
);

export type GoogleAnalyticsTransportConfig = {
  config: AnalyticsParameters;
  measurementId: string;
};

export type GoogleTagManagerTransportConfig = {
  containerId: string;
  environment?: GoogleTagManagerEnvironment;
  initialData?: AnalyticsParameters;
};

export type AnalyticsRuntimeConfig = {
  consentDefault: AnalyticsConsent;
  dataLayerName: string;
  loadingStrategy: AnalyticsLoadingStrategy;
  mode: AnalyticsMode;
  preConsentEvents: AnalyticsPreConsentEvents;
  transport: GoogleAnalyticsTransportConfig | GoogleTagManagerTransportConfig;
  urlPassthrough?: boolean;
};

export type AnalyticsRuntimeStatus =
  | "awaiting-consent"
  | "disabled"
  | "failed"
  | "idle"
  | "loaded"
  | "loading"
  | "not-configured";

export type AnalyticsRuntimeState = {
  consent: AnalyticsConsent;
  error?: string;
  loadingStrategy?: AnalyticsLoadingStrategy;
  mode?: AnalyticsMode;
  status: AnalyticsRuntimeStatus;
};

export type AnalyticsLoadResult =
  | { status: "already-loaded" }
  | { status: "blocked" }
  | { error: string; status: "failed" }
  | { status: "loaded" }
  | { status: "not-configured" };

export type AnalyticsLoadOptions = {
  /** Retry a previous failed network load once at the caller's request. */
  retry?: boolean;
};

export type AnalyticsPlugin = TavoPlugin & {
  analytics: AnalyticsRuntimeConfig;
};
