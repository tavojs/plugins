import { definePluginPhase } from "@tavojs/core/plugin";

type Handler = (request: Request) => Promise<Response> | Response;

export function createSitemapServerPhase(sitemap: Handler, robots?: Handler) {
  return definePluginPhase({
    endpoints: {
      sitemap: ({ request }: { request: Request }) => sitemap(request),
      ...(robots
        ? { robots: ({ request }: { request: Request }) => robots(request) }
        : {})
    }
  });
}
