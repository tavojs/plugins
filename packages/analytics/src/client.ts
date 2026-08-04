import type {
  AnalyticsConsent,
  AnalyticsLoadOptions,
  AnalyticsLoadResult,
  AnalyticsParameters,
  AnalyticsRuntimeConfig,
  AnalyticsRuntimeState
} from "./types.js";

type AnalyticsStateListener = (state: AnalyticsRuntimeState) => void;

type BrowserAnalyticsRuntime = {
  bootstrapPushed: boolean;
  config: AnalyticsRuntimeConfig;
  consent: AnalyticsConsent;
  consentInitialized?: boolean;
  disabled?: boolean;
  enabled: boolean;
  error?: string;
  initialDataPushed: boolean;
  listeners: AnalyticsStateListener[];
  loadPromise?: Promise<AnalyticsLoadResult>;
  status: AnalyticsRuntimeState["status"];
  transportInserted: boolean;
  transportLoaded: boolean;
};

type AnalyticsBrowserWindow = Window & {
  __TAVO_ANALYTICS__?: BrowserAnalyticsRuntime;
};

function getRuntime(): BrowserAnalyticsRuntime | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as AnalyticsBrowserWindow).__TAVO_ANALYTICS__ ?? null;
}

function getLayer(runtime: BrowserAnalyticsRuntime): unknown[] {
  const values = window as unknown as Record<string, unknown>;
  const existing = values[runtime.config.dataLayerName];
  const layer = Array.isArray(existing) ? existing : [];
  values[runtime.config.dataLayerName] = layer;
  return layer;
}

function pushCommand(layer: unknown[], ...values: unknown[]): void {
  function command(...args: unknown[]): void {
    layer.push(arguments);
    void args;
  }
  command(...values);
}

function notify(runtime: BrowserAnalyticsRuntime): void {
  for (const listener of [...runtime.listeners]) {
    listener(toPublicState(runtime));
  }
}

function toPublicState(runtime: BrowserAnalyticsRuntime): AnalyticsRuntimeState {
  return {
    consent: { ...runtime.consent },
    loadingStrategy: runtime.config.loadingStrategy,
    mode: runtime.config.mode,
    status: runtime.status,
    ...(runtime.error === undefined ? {} : { error: runtime.error })
  };
}

function canTrack(runtime: BrowserAnalyticsRuntime): boolean {
  if (!runtime.enabled || runtime.disabled) {
    return false;
  }
  return runtime.config.loadingStrategy === "immediate" || runtime.transportLoaded;
}

function createGoogleTagManagerSource(runtime: BrowserAnalyticsRuntime): string {
  const transport = runtime.config.transport as {
    containerId: string;
    environment?: { auth: string; cookiesWin?: boolean; preview: string };
  };
  const parameters = new URLSearchParams({ id: transport.containerId });
  if (runtime.config.dataLayerName !== "dataLayer") {
    parameters.set("l", runtime.config.dataLayerName);
  }
  if (transport.environment) {
    parameters.set("gtm_auth", transport.environment.auth);
    parameters.set("gtm_preview", transport.environment.preview);
    if (transport.environment.cookiesWin ?? true) {
      parameters.set("gtm_cookies_win", "x");
    }
  }
  return `https://www.googletagmanager.com/gtm.js?${parameters.toString()}`;
}

function initializeTransportQueue(runtime: BrowserAnalyticsRuntime): string {
  const layer = getLayer(runtime);
  if (runtime.config.mode === "google-analytics") {
    const transport = runtime.config.transport as {
      config: AnalyticsParameters;
      measurementId: string;
    };
    if (!runtime.bootstrapPushed) {
      pushCommand(layer, "js", new Date());
      pushCommand(layer, "config", transport.measurementId, transport.config);
      runtime.bootstrapPushed = true;
    }
    return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(transport.measurementId)}`;
  }

  const transport = runtime.config.transport as {
    initialData?: AnalyticsParameters;
  };
  if (!runtime.initialDataPushed && transport.initialData !== undefined) {
    layer.push(transport.initialData);
    runtime.initialDataPushed = true;
  }
  if (!runtime.bootstrapPushed) {
    layer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    runtime.bootstrapPushed = true;
  }
  return createGoogleTagManagerSource(runtime);
}

function waitForExistingLoad(runtime: BrowserAnalyticsRuntime): Promise<AnalyticsLoadResult> {
  if (runtime.loadPromise) {
    return runtime.loadPromise;
  }
  runtime.loadPromise = new Promise((resolve) => {
    const listener: AnalyticsStateListener = (state) => {
      if (state.status === "loaded") {
        unsubscribe();
        resolve({ status: "loaded" });
      } else if (state.status === "failed") {
        unsubscribe();
        resolve({
          error: state.error ?? "Failed to load analytics transport.",
          status: "failed"
        });
      }
    };
    const unsubscribe = subscribeAnalyticsState(listener);
  });
  return runtime.loadPromise;
}

/** Returns a snapshot of transport, consent, and eligibility state. */
export function getAnalyticsState(): AnalyticsRuntimeState {
  const runtime = getRuntime();
  return runtime ? toPublicState(runtime) : { consent: {}, status: "not-configured" };
}

/** Subscribes to lifecycle state changes. It is safe to call during SSR. */
export function subscribeAnalyticsState(listener: AnalyticsStateListener): () => void {
  const runtime = getRuntime();
  if (!runtime) {
    return () => undefined;
  }
  runtime.listeners.push(listener);
  return () => {
    const index = runtime.listeners.indexOf(listener);
    if (index >= 0) {
      runtime.listeners.splice(index, 1);
    }
  };
}

/**
 * Loads the server-validated transport once. After-consent mode requires a local
 * analytics_storage grant; manual mode treats this explicit call as authority.
 */
export function loadAnalytics(options: AnalyticsLoadOptions = {}): Promise<AnalyticsLoadResult> {
  const runtime = getRuntime();
  if (!runtime || typeof document === "undefined") {
    return Promise.resolve({ status: "not-configured" });
  }
  if (
    runtime.config.loadingStrategy === "after-consent" &&
    runtime.consent.analytics_storage !== "granted"
  ) {
    return Promise.resolve({ status: "blocked" });
  }
  if (runtime.transportLoaded) {
    runtime.enabled = true;
    runtime.disabled = false;
    runtime.status = "loaded";
    notify(runtime);
    return Promise.resolve({ status: "already-loaded" });
  }
  if (runtime.status === "failed" && !options.retry) {
    return Promise.resolve({
      error: runtime.error ?? "Failed to load analytics transport.",
      status: "failed"
    });
  }
  if (runtime.transportInserted) {
    runtime.enabled = true;
    runtime.disabled = false;
    runtime.status = "loading";
    return waitForExistingLoad(runtime);
  }

  runtime.enabled = true;
  runtime.disabled = false;
  runtime.status = "loading";
  delete runtime.error;
  notify(runtime);

  const source = initializeTransportQueue(runtime);
  runtime.transportInserted = true;
  runtime.loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = source;
    script.setAttribute("data-tavo-analytics-transport", "");
    script.onload = () => {
      runtime.transportLoaded = true;
      runtime.status = runtime.disabled ? "disabled" : "loaded";
      notify(runtime);
      resolve({ status: "loaded" });
    };
    script.onerror = () => {
      runtime.status = runtime.disabled ? "disabled" : "failed";
      runtime.error = "Failed to load analytics transport.";
      runtime.transportInserted = false;
      script.remove();
      notify(runtime);
      resolve({ error: runtime.error, status: "failed" });
    };
    (document.head ?? document.documentElement).appendChild(script);
  });
  return runtime.loadPromise;
}

/** Sends a named event only while the configured transport is eligible. */
export function track(eventName: string, parameters: AnalyticsParameters = {}): boolean {
  if (!eventName.trim()) {
    throw new Error("tavo analytics: event names must not be empty.");
  }
  const runtime = getRuntime();
  if (!runtime || !canTrack(runtime)) {
    return false;
  }
  const layer = getLayer(runtime);
  if (runtime.config.mode === "google-tag-manager") {
    layer.push({ ...parameters, event: eventName });
  } else {
    pushCommand(layer, "event", eventName, parameters);
  }
  return true;
}

/** Sends a page_view event. Tavo.js does not install automatic route listeners. */
export function trackPageView(parameters: AnalyticsParameters = {}): boolean {
  const browserDefaults =
    typeof window === "undefined"
      ? {}
      : {
          page_location: window.location.href,
          page_title: document.title
        };
  return track("page_view", { ...browserDefaults, ...parameters });
}

/** Records and queues a Google consent update without loading a deferred transport. */
export function updateConsent(consent: AnalyticsConsent): boolean {
  const runtime = getRuntime();
  if (!runtime) {
    return false;
  }
  runtime.consent = { ...runtime.consent, ...consent };
  pushCommand(getLayer(runtime), "consent", "update", consent);

  if (runtime.config.loadingStrategy !== "immediate") {
    if (runtime.consent.analytics_storage === "granted") {
      runtime.enabled = true;
      runtime.disabled = false;
      runtime.status = runtime.transportLoaded
        ? "loaded"
        : runtime.transportInserted
          ? "loading"
          : "idle";
    } else if (!runtime.transportLoaded) {
      runtime.enabled = false;
      runtime.status = "awaiting-consent";
    }
  }
  notify(runtime);
  return true;
}

/**
 * Stops new application events. Loaded third-party code cannot be unloaded;
 * reload the page after withdrawal when strict isolation is required.
 */
export function disableAnalytics(): boolean {
  const runtime = getRuntime();
  if (!runtime || runtime.disabled) {
    return false;
  }
  const denied: AnalyticsConsent = {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: "denied"
  };
  runtime.consent = { ...runtime.consent, ...denied };
  pushCommand(getLayer(runtime), "consent", "update", denied);
  runtime.enabled = false;
  runtime.disabled = true;
  runtime.status = "disabled";
  notify(runtime);
  return true;
}

/** Pushes application data only while the configured transport is eligible. */
export function pushToDataLayer(data: AnalyticsParameters): boolean {
  const runtime = getRuntime();
  if (!runtime || !canTrack(runtime)) {
    return false;
  }
  getLayer(runtime).push(data);
  return true;
}
