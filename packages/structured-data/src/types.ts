import type { Child } from "@tavojs/core";
import type { PageLoadContext } from "@tavojs/core/router";
import type { TavoPlugin } from "@tavojs/core/plugin";

export type StructuredDataPrimitive = boolean | null | number | string;

export type StructuredDataValue =
  | StructuredDataPrimitive
  | StructuredDataObject
  | readonly StructuredDataValue[];

export type StructuredDataObject = {
  readonly [property: string]: StructuredDataValue | undefined;
};

export type StructuredDataNode = StructuredDataObject & {
  readonly "@id"?: string;
  readonly "@type": string | readonly string[];
};

export type StructuredDataDocument =
  | StructuredDataNode
  | readonly StructuredDataNode[];

export type StructuredDataScriptProps = {
  id?: string;
  nonce?: string;
};

export type StructuredDataProps = StructuredDataScriptProps & {
  data: StructuredDataDocument;
};

export type StructuredDataTrailingSlashPolicy =
  | "always"
  | "never"
  | "preserve";

/** The routing policy used to format site-relative page URLs. */
export type StructuredDataUrlPolicy = {
  readonly trailingSlash: StructuredDataTrailingSlashPolicy;
  /** Compatible with the framework's resolved URL-policy shape. */
  readonly canonicalize?: (url: string) => string;
};

export type WebSiteMetadata = {
  alternateName?: string | readonly string[];
  description?: string;
  id?: string;
  name: string;
  publisherId?: string;
  siteUrl: string;
};

export type OrganizationMetadata = {
  description?: string;
  email?: string;
  id?: string;
  logo?: string;
  name: string;
  sameAs?: readonly string[];
  siteUrl: string;
};

export type SiteGraphMetadata = {
  organization: Omit<OrganizationMetadata, "siteUrl">;
  siteUrl: string;
  website: Omit<WebSiteMetadata, "publisherId" | "siteUrl">;
};

export type StructuredDataBreadcrumb = {
  name: string;
  /** Site-relative or absolute HTTP(S) URL. The final item may omit it. */
  url?: string;
};

export type BreadcrumbListMetadata = {
  id?: string;
  items: readonly StructuredDataBreadcrumb[];
  siteUrl: string;
  urlPolicy?: StructuredDataUrlPolicy;
};

export type SoftwareApplicationCategory =
  | "BrowserApplication"
  | "BusinessApplication"
  | "CommunicationApplication"
  | "DesktopEnhancementApplication"
  | "DesignApplication"
  | "DeveloperApplication"
  | "DriverApplication"
  | "EducationalApplication"
  | "EntertainmentApplication"
  | "FinanceApplication"
  | "GameApplication"
  | "HealthApplication"
  | "HomeApplication"
  | "LifestyleApplication"
  | "MultimediaApplication"
  | "ReferenceApplication"
  | "SecurityApplication"
  | "ShoppingApplication"
  | "SocialNetworkingApplication"
  | "SportsApplication"
  | "TravelApplication"
  | "UtilitiesApplication";

export type SoftwareApplicationOffer = {
  availability?: string;
  price: number;
  priceCurrency?: string;
  url?: string;
};

export type SoftwareApplicationMetadata = {
  aggregateRating?: StructuredDataNode;
  applicationCategory: SoftwareApplicationCategory;
  authorId?: string;
  description?: string;
  downloadUrl?: string;
  id?: string;
  license?: string;
  name: string;
  offers: SoftwareApplicationOffer;
  operatingSystem: string;
  review?: StructuredDataNode | readonly StructuredDataNode[];
  url?: string;
};

export type CreateSoftwareApplicationOptions = SoftwareApplicationMetadata & {
  siteUrl: string;
  urlPolicy?: StructuredDataUrlPolicy;
};

export type ConfiguredSoftwareApplication = SoftwareApplicationMetadata & {
  path: string;
};

export type PageStructuredDataMetadata = {
  breadcrumbs?: readonly StructuredDataBreadcrumb[] | undefined;
  includeSiteIdentity?: boolean | undefined;
  schemas?: StructuredDataDocument | undefined;
  /** Set false to suppress an application configured for the current route. */
  softwareApplication?: SoftwareApplicationMetadata | false | undefined;
};

export type StructuredDataResolver = (
  context: PageLoadContext
) => PageStructuredDataMetadata | undefined;

export type CreateStructuredDataSiteOptions = {
  applications?: readonly ConfiguredSoftwareApplication[];
  organization: Omit<OrganizationMetadata, "siteUrl">;
  resolve?: StructuredDataResolver;
  siteUrl: string;
  /** Explicit fallback when no installed plugin can read framework context. */
  urlPolicy?: StructuredDataUrlPolicy;
  website: Omit<WebSiteMetadata, "publisherId" | "siteUrl">;
};

export type StructuredDataSite = {
  readonly siteUrl: string;
  data(
    context: PageLoadContext,
    override?: PageStructuredDataMetadata
  ): readonly StructuredDataNode[];
  head(
    context: PageLoadContext,
    override?: PageStructuredDataMetadata,
    script?: StructuredDataScriptProps
  ): Child;
};

export type StructuredDataAdapterDefinition<T> = {
  breadcrumbs?: (
    value: T,
    context?: PageLoadContext
  ) => readonly StructuredDataBreadcrumb[] | undefined;
  includeSiteIdentity?: (
    value: T,
    context?: PageLoadContext
  ) => boolean | undefined;
  schemas?: (
    value: T,
    context?: PageLoadContext
  ) => StructuredDataDocument | undefined;
  softwareApplication?: (
    value: T,
    context?: PageLoadContext
  ) => SoftwareApplicationMetadata | false | undefined;
};

export type StructuredDataAdapter<T> = {
  from(value: T, context?: PageLoadContext): PageStructuredDataMetadata;
};

export type CreateStructuredDataPluginOptions = StructuredDataScriptProps &
  (
    | {
        /** Existing global JSON-LD contribution. */
        data: StructuredDataDocument;
        /** Also binds a site helper to the framework-resolved URL policy. */
        site?: StructuredDataSite;
      }
    | {
        data?: never;
        /** Binds a site helper to the framework-resolved URL policy. */
        site: StructuredDataSite;
      }
  );

export type StructuredDataPlugin = TavoPlugin & {
  /** Empty in policy-binding-only mode. */
  readonly structuredData: StructuredDataDocument;
};
