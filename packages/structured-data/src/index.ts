import { h, type Child } from "@tavojs/core";
import { definePluginFactory } from "@tavojs/core/plugin";
import type { PageLoadContext } from "@tavojs/core/router";
import type {
  BreadcrumbListMetadata,
  ConfiguredSoftwareApplication,
  CreateSoftwareApplicationOptions,
  CreateStructuredDataPluginOptions,
  CreateStructuredDataSiteOptions,
  OrganizationMetadata,
  PageStructuredDataMetadata,
  SiteGraphMetadata,
  SoftwareApplicationMetadata,
  StructuredDataAdapter,
  StructuredDataAdapterDefinition,
  StructuredDataDocument,
  StructuredDataNode,
  StructuredDataObject,
  StructuredDataPlugin,
  StructuredDataProps,
  StructuredDataScriptProps,
  StructuredDataSite,
  StructuredDataTrailingSlashPolicy,
  StructuredDataUrlPolicy,
  StructuredDataValue,
  WebSiteMetadata,
} from "./types.js";

export type {
  BreadcrumbListMetadata,
  ConfiguredSoftwareApplication,
  CreateSoftwareApplicationOptions,
  CreateStructuredDataPluginOptions,
  CreateStructuredDataSiteOptions,
  OrganizationMetadata,
  PageStructuredDataMetadata,
  SiteGraphMetadata,
  SoftwareApplicationCategory,
  SoftwareApplicationMetadata,
  SoftwareApplicationOffer,
  StructuredDataAdapter,
  StructuredDataAdapterDefinition,
  StructuredDataBreadcrumb,
  StructuredDataDocument,
  StructuredDataNode,
  StructuredDataObject,
  StructuredDataPlugin,
  StructuredDataPrimitive,
  StructuredDataProps,
  StructuredDataResolver,
  StructuredDataScriptProps,
  StructuredDataSite,
  StructuredDataTrailingSlashPolicy,
  StructuredDataUrlPolicy,
  StructuredDataValue,
  WebSiteMetadata,
} from "./types.js";

const SCHEMA_CONTEXT = "https://schema.org";
const DEFAULT_SCRIPT_ID = "tavo-structured-data";
const sitePolicySetters = new WeakMap<
  StructuredDataSite,
  (policy: StructuredDataUrlPolicy) => void
>();

type JsonObject = Readonly<Record<string, unknown>>;

function assertNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`tavo structured data: ${label} must not be empty.`);
  }
  return normalized;
}

function normalizeSiteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `tavo structured data: siteUrl must be an absolute HTTP(S) origin, received "${value}".`,
    );
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `tavo structured data: siteUrl must be an absolute HTTP(S) origin, received "${value}".`,
    );
  }
  return url;
}

function resolveHttpUrl(site: URL, value: string, label: string): string {
  const normalized = assertNonEmpty(value, label);
  let resolved: URL;
  try {
    resolved = new URL(normalized, site);
  } catch {
    throw new Error(`tavo structured data: ${label} contains an invalid URL.`);
  }
  if (
    (resolved.protocol !== "https:" && resolved.protocol !== "http:") ||
    resolved.username ||
    resolved.password
  ) {
    throw new Error(
      `tavo structured data: ${label} must resolve to an HTTP(S) URL.`,
    );
  }
  return resolved.href;
}

function assertUrlPolicy(
  value: StructuredDataUrlPolicy | undefined,
  label = "urlPolicy",
): void {
  if (
    value !== undefined &&
    value.trailingSlash !== "always" &&
    value.trailingSlash !== "never" &&
    value.trailingSlash !== "preserve"
  ) {
    throw new Error(
      `tavo structured data: ${label}.trailingSlash must be "always", "never", or "preserve".`,
    );
  }
}

function isExplicitAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");
}

function isFileLikeUrl(value: URL): boolean {
  const pathname = value.pathname.replace(/\/+$/, "");
  const basename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return basename.includes(".");
}

function resolvePageUrl(
  site: URL,
  value: string,
  label: string,
  urlPolicy: StructuredDataUrlPolicy | undefined,
): string {
  const normalized = assertNonEmpty(value, label);
  const resolved = resolveHttpUrl(site, normalized, label);
  if (
    urlPolicy === undefined ||
    urlPolicy.trailingSlash === "preserve" ||
    isExplicitAbsoluteUrl(normalized) ||
    normalized.startsWith("#") ||
    normalized.startsWith("?")
  ) {
    return resolved;
  }

  const canonical = new URL(resolved);
  if (
    canonical.pathname === "/" ||
    (urlPolicy.trailingSlash === "always" && isFileLikeUrl(canonical))
  ) {
    return canonical.href;
  }
  const pathname = canonical.pathname.replace(/\/+$/, "");
  canonical.pathname =
    urlPolicy.trailingSlash === "always"
      ? `${pathname}/`
      : pathname || "/";
  return canonical.href;
}

function resolveEntityId(
  site: URL,
  value: string | undefined,
  fallback: string,
): string {
  return resolveHttpUrl(site, value ?? `/#${fallback}`, `${fallback} id`);
}

function normalizeRoutePath(value: string, label: string): string {
  const normalized = assertNonEmpty(value, label);
  if (
    !normalized.startsWith("/") ||
    /[?#\\\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(
      `tavo structured data: ${label} must be an absolute route pathname.`,
    );
  }
  const pathname = normalized.replace(/\/{2,}/g, "/");
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function assertSerializable(value: unknown, label = "structured data"): void {
  const active = new WeakSet<object>();

  function visit(candidate: unknown, path: string): void {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new Error(
          `tavo structured data: ${path} contains a non-finite number.`,
        );
      }
      return;
    }
    if (typeof candidate !== "object") {
      throw new Error(
        `tavo structured data: ${path} is not JSON-serializable.`,
      );
    }
    if (active.has(candidate)) {
      throw new Error(
        `tavo structured data: ${path} contains a circular reference.`,
      );
    }
    active.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else {
      for (const [key, item] of Object.entries(candidate)) {
        if (item === undefined) {
          throw new Error(
            `tavo structured data: ${path}.${key} must not be undefined.`,
          );
        }
        visit(item, `${path}.${key}`);
      }
    }
    active.delete(candidate);
  }

  visit(value, label);
}

function documentNodes(data: StructuredDataDocument): StructuredDataNode[] {
  const nodes = Array.isArray(data) ? [...data] : [data as StructuredDataNode];
  for (const [index, node] of nodes.entries()) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error(
        `tavo structured data: node ${index + 1} must be an object.`,
      );
    }
    const type = node["@type"];
    if (
      (typeof type !== "string" || !type.trim()) &&
      (!Array.isArray(type) ||
        type.length === 0 ||
        type.some((item) => !item.trim()))
    ) {
      throw new Error(
        `tavo structured data: node ${index + 1} must define @type.`,
      );
    }
  }
  assertSerializable(nodes);
  return nodes;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function equivalent(
  left: StructuredDataNode,
  right: StructuredDataNode,
): boolean {
  return (
    JSON.stringify(canonicalValue(left)) ===
    JSON.stringify(canonicalValue(right))
  );
}

function dedupeNodes(
  nodes: readonly StructuredDataNode[],
): StructuredDataNode[] {
  const output: StructuredDataNode[] = [];
  const identified = new Map<string, StructuredDataNode>();
  for (const node of nodes) {
    const id = node["@id"];
    if (typeof id !== "string") {
      output.push(node);
      continue;
    }
    const existing = identified.get(id);
    if (!existing) {
      identified.set(id, node);
      output.push(node);
      continue;
    }
    if (!equivalent(existing, node)) {
      throw new Error(
        `tavo structured data: conflicting nodes use @id "${id}".`,
      );
    }
  }
  return output;
}

export function toStructuredDataJson(data: StructuredDataDocument): JsonObject {
  const nodes = dedupeNodes(documentNodes(data));
  if (nodes.length === 0) {
    throw new Error(
      "tavo structured data: at least one schema node is required.",
    );
  }
  if (nodes.length === 1) {
    return { "@context": SCHEMA_CONTEXT, ...nodes[0] };
  }
  return { "@context": SCHEMA_CONTEXT, "@graph": nodes };
}

export function defineStructuredData<T extends StructuredDataDocument>(
  data: T,
): T {
  documentNodes(data);
  return data;
}

export function StructuredData(props: StructuredDataProps): Child {
  const id = props.id ?? DEFAULT_SCRIPT_ID;
  const json = JSON.stringify(toStructuredDataJson(props.data))
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\u003e")
    .replace(/<\/script/gi, "<\\/script");
  return h(
    "script",
    {
      id,
      type: "application/ld+json",
      "data-tavo-head": `script:id:${id}`,
      ...(props.nonce === undefined ? {} : { nonce: props.nonce }),
    },
    json,
  );
}

export function createOrganization(
  options: OrganizationMetadata,
): StructuredDataNode {
  const site = normalizeSiteUrl(options.siteUrl);
  const sameAs = options.sameAs?.map((value, index) =>
    resolveHttpUrl(site, value, `organization sameAs[${index}]`),
  );
  return {
    "@type": "Organization",
    "@id": resolveEntityId(site, options.id, "organization"),
    url: site.href,
    name: assertNonEmpty(options.name, "organization name"),
    ...(options.description === undefined
      ? {}
      : {
          description: assertNonEmpty(
            options.description,
            "organization description",
          ),
        }),
    ...(options.email === undefined
      ? {}
      : { email: assertNonEmpty(options.email, "organization email") }),
    ...(options.logo === undefined
      ? {}
      : { logo: resolveHttpUrl(site, options.logo, "organization logo") }),
    ...(sameAs && sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function createWebSite(options: WebSiteMetadata): StructuredDataNode {
  const site = normalizeSiteUrl(options.siteUrl);
  const alternateName =
    options.alternateName === undefined
      ? undefined
      : Array.isArray(options.alternateName)
        ? options.alternateName.map((value, index) =>
            assertNonEmpty(value, `website alternateName[${index}]`),
          )
        : assertNonEmpty(
            options.alternateName as string,
            "website alternateName",
          );
  return {
    "@type": "WebSite",
    "@id": resolveEntityId(site, options.id, "website"),
    url: site.href,
    name: assertNonEmpty(options.name, "website name"),
    ...(alternateName === undefined ? {} : { alternateName }),
    ...(options.description === undefined
      ? {}
      : {
          description: assertNonEmpty(
            options.description,
            "website description",
          ),
        }),
    ...(options.publisherId === undefined
      ? {}
      : {
          publisher: {
            "@id": resolveHttpUrl(site, options.publisherId, "publisher id"),
          },
        }),
  };
}

export function createSiteGraph(
  options: SiteGraphMetadata,
): readonly StructuredDataNode[] {
  const site = normalizeSiteUrl(options.siteUrl);
  const organization = createOrganization({
    ...options.organization,
    siteUrl: site.href,
  });
  const website = createWebSite({
    ...options.website,
    publisherId: organization["@id"] as string,
    siteUrl: site.href,
  });
  return [website, organization];
}

export function createBreadcrumbList(
  options: BreadcrumbListMetadata,
): StructuredDataNode {
  const site = normalizeSiteUrl(options.siteUrl);
  assertUrlPolicy(options.urlPolicy);
  if (options.items.length < 2) {
    throw new Error(
      "tavo structured data: breadcrumbs require at least two items.",
    );
  }
  const itemListElement = options.items.map((item, index) => {
    const isLast = index === options.items.length - 1;
    if (!isLast && item.url === undefined) {
      throw new Error(
        `tavo structured data: breadcrumb ${index + 1} requires a URL.`,
      );
    }
    return {
      "@type": "ListItem",
      position: index + 1,
      name: assertNonEmpty(item.name, `breadcrumb ${index + 1} name`),
      ...(item.url === undefined
        ? {}
        : {
            item: resolvePageUrl(
              site,
              item.url,
              `breadcrumb ${index + 1} URL`,
              options.urlPolicy,
            ),
          }),
    } satisfies StructuredDataNode;
  });
  return {
    "@type": "BreadcrumbList",
    ...(options.id === undefined
      ? {}
      : { "@id": resolveHttpUrl(site, options.id, "breadcrumb id") }),
    itemListElement,
  };
}

export function createSoftwareApplication(
  options: CreateSoftwareApplicationOptions,
): StructuredDataNode {
  const site = normalizeSiteUrl(options.siteUrl);
  assertUrlPolicy(options.urlPolicy);
  const url = resolvePageUrl(
    site,
    options.url ?? site.href,
    "software application URL",
    options.urlPolicy,
  );
  const price = options.offers.price;
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(
      "tavo structured data: software application price must be a non-negative number.",
    );
  }
  if (price > 0 && options.offers.priceCurrency === undefined) {
    throw new Error(
      "tavo structured data: paid software applications require priceCurrency.",
    );
  }
  const priceCurrency = options.offers.priceCurrency?.trim().toUpperCase();
  if (priceCurrency !== undefined && !/^[A-Z]{3}$/.test(priceCurrency)) {
    throw new Error(
      "tavo structured data: priceCurrency must be a three-letter currency code.",
    );
  }
  return {
    "@type": "SoftwareApplication",
    "@id": resolveHttpUrl(
      site,
      options.id ?? `${url}#software-application`,
      "software application id",
    ),
    url,
    name: assertNonEmpty(options.name, "software application name"),
    applicationCategory: options.applicationCategory,
    operatingSystem: assertNonEmpty(
      options.operatingSystem,
      "software application operatingSystem",
    ),
    ...(options.description === undefined
      ? {}
      : {
          description: assertNonEmpty(
            options.description,
            "software application description",
          ),
        }),
    ...(options.authorId === undefined
      ? {}
      : {
          author: {
            "@id": resolveHttpUrl(
              site,
              options.authorId,
              "software application author id",
            ),
          },
        }),
    ...(options.license === undefined
      ? {}
      : {
          license: resolveHttpUrl(
            site,
            options.license,
            "software application license",
          ),
        }),
    ...(options.downloadUrl === undefined
      ? {}
      : {
          downloadUrl: resolveHttpUrl(
            site,
            options.downloadUrl,
            "software application downloadUrl",
          ),
        }),
    offers: {
      "@type": "Offer",
      price,
      ...(priceCurrency === undefined ? {} : { priceCurrency }),
      ...(options.offers.availability === undefined
        ? {}
        : {
            availability: resolveHttpUrl(
              site,
              options.offers.availability,
              "offer availability",
            ),
          }),
      ...(options.offers.url === undefined
        ? {}
        : {
            url: resolvePageUrl(
              site,
              options.offers.url,
              "offer URL",
              options.urlPolicy,
            ),
          }),
    },
    ...(options.aggregateRating === undefined
      ? {}
      : { aggregateRating: options.aggregateRating }),
    ...(options.review === undefined ? {} : { review: options.review }),
  };
}

function metadataValue<T extends keyof PageStructuredDataMetadata>(
  key: T,
  override: PageStructuredDataMetadata | undefined,
  resolved: PageStructuredDataMetadata | undefined,
  fallback: PageStructuredDataMetadata[T],
): PageStructuredDataMetadata[T] {
  if (override && Object.prototype.hasOwnProperty.call(override, key))
    return override[key];
  if (resolved && Object.prototype.hasOwnProperty.call(resolved, key))
    return resolved[key];
  return fallback;
}

function applicationForPath(
  applications: readonly ConfiguredSoftwareApplication[],
  pathname: string,
): ConfiguredSoftwareApplication | undefined {
  const matches = applications.filter(
    (application) =>
      normalizeRoutePath(application.path, "software application path") ===
      pathname,
  );
  if (matches.length > 1) {
    throw new Error(
      `tavo structured data: multiple software applications target "${pathname}".`,
    );
  }
  return matches[0];
}

function appendDocument(
  target: StructuredDataNode[],
  data: StructuredDataDocument | undefined,
): void {
  if (data === undefined) return;
  target.push(...documentNodes(data));
}

export function createStructuredDataSite(
  options: CreateStructuredDataSiteOptions,
): StructuredDataSite {
  const site = normalizeSiteUrl(options.siteUrl);
  assertUrlPolicy(options.urlPolicy);
  let activeUrlPolicy = options.urlPolicy;
  const applications = options.applications ?? [];
  for (const application of applications) {
    normalizeRoutePath(application.path, "software application path");
  }

  function data(
    context: PageLoadContext,
    override?: PageStructuredDataMetadata,
  ): readonly StructuredDataNode[] {
    const pathname = normalizeRoutePath(context.pathname, "context pathname");
    const resolved = options.resolve?.(context);
    const configuredApplication = applicationForPath(applications, pathname);
    const includeSiteIdentity = metadataValue(
      "includeSiteIdentity",
      override,
      resolved,
      pathname === "/",
    );
    const softwareApplication = metadataValue(
      "softwareApplication",
      override,
      resolved,
      configuredApplication,
    );
    const breadcrumbs = metadataValue(
      "breadcrumbs",
      override,
      resolved,
      undefined,
    );
    const schemas = metadataValue("schemas", override, resolved, undefined);
    const nodes: StructuredDataNode[] = [];

    if (includeSiteIdentity) {
      nodes.push(
        ...createSiteGraph({
          organization: options.organization,
          siteUrl: site.href,
          website: options.website,
        }),
      );
    }
    if (softwareApplication) {
      const applicationPath =
        "path" in softwareApplication &&
        typeof softwareApplication.path === "string"
          ? softwareApplication.path
          : pathname;
      const { path: _path, ...application } =
        softwareApplication as SoftwareApplicationMetadata & { path?: string };
      nodes.push(
        createSoftwareApplication({
          ...application,
          authorId: application.authorId ?? `${site.href}#organization`,
          siteUrl: site.href,
          ...(activeUrlPolicy === undefined
            ? {}
            : { urlPolicy: activeUrlPolicy }),
          url:
            application.url ??
            applicationPath,
        }),
      );
    }
    if (breadcrumbs !== undefined && breadcrumbs.length >= 2) {
      nodes.push(
        createBreadcrumbList({
          items: breadcrumbs,
          siteUrl: site.href,
          ...(activeUrlPolicy === undefined
            ? {}
            : { urlPolicy: activeUrlPolicy }),
        }),
      );
    }
    appendDocument(nodes, schemas);
    return dedupeNodes(nodes);
  }

  const structuredDataSite: StructuredDataSite = {
    siteUrl: site.href,
    data,
    head(
      context: PageLoadContext,
      override?: PageStructuredDataMetadata,
      script?: StructuredDataScriptProps,
    ): Child {
      const nodes = data(context, override);
      return nodes.length === 0
        ? null
        : StructuredData({
            data: nodes,
            id: script?.id ?? DEFAULT_SCRIPT_ID,
            ...(script?.nonce === undefined ? {} : { nonce: script.nonce }),
          });
    },
  };
  sitePolicySetters.set(structuredDataSite, (policy) => {
    assertUrlPolicy(policy, "framework urlPolicy");
    activeUrlPolicy = policy;
  });
  return structuredDataSite;
}

export function defineStructuredDataAdapter<T>(
  definition: StructuredDataAdapterDefinition<T>,
): StructuredDataAdapter<T> {
  return {
    from(value: T, context?: PageLoadContext): PageStructuredDataMetadata {
      const breadcrumbs = definition.breadcrumbs?.(value, context);
      const includeSiteIdentity = definition.includeSiteIdentity?.(
        value,
        context,
      );
      const schemas = definition.schemas?.(value, context);
      const softwareApplication = definition.softwareApplication?.(
        value,
        context,
      );
      return {
        ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
        ...(includeSiteIdentity === undefined ? {} : { includeSiteIdentity }),
        ...(schemas === undefined ? {} : { schemas }),
        ...(softwareApplication === undefined ? {} : { softwareApplication }),
      };
    },
  };
}

export const createStructuredDataPlugin: (
  options: CreateStructuredDataPluginOptions,
) => StructuredDataPlugin = definePluginFactory(
  (options: CreateStructuredDataPluginOptions) => {
    if (!options || (options.data === undefined && options.site === undefined)) {
      throw new Error(
        "tavo structured data: plugin data or site is required.",
      );
    }
    const data =
      options.data === undefined ? undefined : defineStructuredData(options.data);
    const setUrlPolicy =
      options.site === undefined ? undefined : sitePolicySetters.get(options.site);
    if (options.site !== undefined && setUrlPolicy === undefined) {
      throw new Error(
        "tavo structured data: plugin site must come from createStructuredDataSite().",
      );
    }
    const scriptId = options.id ?? DEFAULT_SCRIPT_ID;
    assertNonEmpty(scriptId, "script id");
    return {
      id: "@tavojs/structured-data",
      version: "1.0.0",
      apiVersion: 1,
      manifest: {
        ...(data === undefined
          ? {}
          : {
              head: [
                {
                  id: "structured-data",
                  key: `tavo:structured-data:${scriptId}`,
                  cardinality: "singleton" as const,
                },
              ],
            }),
      },
      structuredData: data ?? [],
      server: async () => {
        const { createStructuredDataServerPhase } = await import("./server.js");
        return createStructuredDataServerPhase(
          data,
          {
            id: scriptId,
            ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
          },
          setUrlPolicy,
        );
      },
    };
  },
);
