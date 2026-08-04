import { definePluginPhase } from "@tavojs/core/plugin";
import type { AnalyticsRuntimeConfig } from "./types.js";

function serializeScriptValue(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createGoogleTagManagerUrl(config: AnalyticsRuntimeConfig): string {
  const transport = config.transport as {
    containerId: string;
    environment?: { auth: string; cookiesWin?: boolean; preview: string };
  };
  const parameters = new URLSearchParams({ id: transport.containerId });
  if (config.dataLayerName !== "dataLayer") parameters.set("l", config.dataLayerName);
  if (transport.environment) {
    parameters.set("gtm_auth", transport.environment.auth);
    parameters.set("gtm_preview", transport.environment.preview);
    if (transport.environment.cookiesWin ?? true) parameters.set("gtm_cookies_win", "x");
  }
  return `https://www.googletagmanager.com/gtm.js?${parameters.toString()}`;
}

function renderRuntimePrelude(config: AnalyticsRuntimeConfig): string {
  const initialStatus = config.loadingStrategy === "immediate"
    ? "loading"
    : config.loadingStrategy === "after-consent" ? "awaiting-consent" : "idle";
  const layer = serializeScriptValue(config.dataLayerName);
  return `<script>${[
    `(function(w){var c=${serializeScriptValue(config)},r=w.__TAVO_ANALYTICS__;`,
    `if(!r||!r.config){r=w.__TAVO_ANALYTICS__={config:c,consent:Object.assign({},c.consentDefault),status:${serializeScriptValue(initialStatus)},enabled:c.loadingStrategy==="immediate",transportInserted:false,transportLoaded:false,initialDataPushed:false,bootstrapPushed:false,listeners:[]};}`,
    `w[${layer}]=w[${layer}]||[];`,
    `w.__tavoAnalyticsGtag=w.__tavoAnalyticsGtag||function(){w[${layer}].push(arguments);};`,
    `if(!r.consentInitialized){w.__tavoAnalyticsGtag("consent","default",c.consentDefault);`,
    config.urlPassthrough === undefined ? "" : `w.__tavoAnalyticsGtag("set","url_passthrough",${serializeScriptValue(config.urlPassthrough)});`,
    `r.consentInitialized=true;}`,
    `})(window);`
  ].join("")}</script>`;
}

function renderImmediateTransport(config: AnalyticsRuntimeConfig): string {
  const layer = serializeScriptValue(config.dataLayerName);
  const source = config.mode === "google-analytics"
    ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent((config.transport as { measurementId: string }).measurementId)}`
    : createGoogleTagManagerUrl(config);
  const initialization = config.mode === "google-analytics"
    ? `if(!r.bootstrapPushed){w.__tavoAnalyticsGtag("js",new Date());w.__tavoAnalyticsGtag("config",${serializeScriptValue((config.transport as { measurementId: string }).measurementId)},${serializeScriptValue((config.transport as { config: Record<string, unknown> }).config)});r.bootstrapPushed=true;}`
    : `if(!r.initialDataPushed&&r.config.transport.initialData!==undefined){w[${layer}].push(r.config.transport.initialData);r.initialDataPushed=true;}if(!r.bootstrapPushed){w[${layer}].push({"gtm.start":new Date().getTime(),event:"gtm.js"});r.bootstrapPushed=true;}`;
  return [
    `<script>(function(w,d){var r=w.__TAVO_ANALYTICS__;if(!r||r.transportInserted)return;`,
    initialization,
    `r.transportInserted=true;var s=d.createElement("script");s.async=true;s.src=${serializeScriptValue(source)};s.setAttribute("data-tavo-analytics-transport","");`,
    `s.onload=function(){r.transportLoaded=true;r.status=r.disabled?"disabled":"loaded";var x={consent:Object.assign({},r.consent),loadingStrategy:r.config.loadingStrategy,mode:r.config.mode,status:r.status};(r.listeners||[]).slice().forEach(function(f){f(x);});};`,
    `s.onerror=function(){r.status=r.disabled?"disabled":"failed";r.error="Failed to load analytics transport.";r.transportInserted=false;var x={consent:Object.assign({},r.consent),error:r.error,loadingStrategy:r.config.loadingStrategy,mode:r.config.mode,status:r.status};(r.listeners||[]).slice().forEach(function(f){f(x);});};`,
    `(d.head||d.documentElement).appendChild(s);})(window,document);</script>`
  ].join("");
}

export function createAnalyticsServerPhase(config: AnalyticsRuntimeConfig) {
  const head = `${renderRuntimePrelude(config)}${
    config.loadingStrategy === "immediate" ? renderImmediateTransport(config) : ""
  }`;
  return definePluginPhase({ head: { bootstrap: head } });
}
