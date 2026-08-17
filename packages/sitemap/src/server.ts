import { definePluginPhase } from "@tavojs/core/plugin";

type Handler = (request: Request) => Promise<Response> | Response;

export function createSitemapServerPhase(
  sitemap: Handler,
  robots?: Handler,
  setTrailingSlash?: (value: unknown) => void
) {
  return definePluginPhase({
    endpoints: {
      sitemap: ({ request }: { request: Request }) => sitemap(request),
      ...(robots
        ? { robots: ({ request }: { request: Request }) => robots(request) }
        : {})
    },
    setup(context) {
      setTrailingSlash?.((context as typeof context & {
        urlPolicy?: { trailingSlash?: unknown };
      }).urlPolicy?.trailingSlash);
    }
  });
}
