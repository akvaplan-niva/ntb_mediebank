// Deno proxy server for NTB mediebank API v1
//
// Examples:
// http://localhost:9000/preview/385801 alias for http://localhost:9000/api/v1/apps/asset/preview/preview/385801
// http://localhost:9000/albums/527 – alias for http://localhost:9000/api/v1/apps/assets?query&albums[]=527

import { serve as std_serve } from "https://deno.land/std@0.158.0/http/mod.ts";

const { serve, env } = Deno;

const ntb_mediebank_secret = env.get("ntb_mediebank_secret");

const baseURL = new URL("https://mediebank.ntb.no/api/v1");

const errorResponse = ({ status = 500, statusText = status } = {}) =>
  Response.json(statusText, { status });

const preview = new URLPattern({
  pathname: "/:variant(preview|thumbnail_big|preview_big|original|custom)/:id",
});
//"Size must be one of 'original', 'thumbnail_big', 'preview_big', 'preview', 'custom'",
// preview_big: 1024px
// preview: 512px
// thumbnail_big: 256px
// Notice: original and custom seems not to work]
const albums = new URLPattern({ pathname: "/albums/:id" });
const patterns = [albums, preview];

const mediebankURL = (url) => {
  url = new URL(url);
  url.protocol = "https:";
  url.hostname = baseURL.hostname;
  url.port = "443";

  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) {
      if (albums === pattern) {
        const { id } = match.pathname.groups;
        url.pathname = `${baseURL.pathname}/apps/assets`;
        url.searchParams.set("albums[]", id);
      } else {
        const { id, variant } = match.pathname.groups;

        url.pathname =
          `${baseURL.pathname}/apps/asset/preview/${variant}/${id}`;
      }
    }
  }
  return url;
};

const corsHeaders = new Headers([
  ["access-control-allow-origin", "*"],
  ["access-control-allow-methods", "GET, OPTIONS"],
]);

export const proxy = async (request) => {
  try {
    if ("OPTIONS" === request.method) {
      return new Response(undefined, { status: 204, headers: corsHeaders });
    }

    const url = mediebankURL(request.url);

    if (!url.pathname.startsWith(baseURL.pathname)) {
      return errorResponse(
        {
          statusText:
            `Invalid URL, pathname must start with: ${baseURL.pathname}`,
          status: 400,
        },
      );
    }

    const headers = new Headers(request.headers);
    headers.append("x-api-secret", ntb_mediebank_secret);
    headers.append("accept", "application/json,image/*,text/*");

    // Uncomment/refactor to become a real proxy, for now only GET
    // const { body, method } = request;
    const body = undefined;
    const method = "GET";

    const aborter = new AbortController();
    const { signal } = aborter;
    const timeout = setTimeout(() => aborter.abort(), 15000);

    const response = await fetch(url.href, { headers, method, body, signal });

    // Add CORS to response headers
    // @todo Serve unmodified response on anything but JSON?
    const responseHeaders = new Headers([...response.headers, ...corsHeaders]);
    clearTimeout(timeout);

    return new Response(response.body, { headers: responseHeaders });
  } catch (e) {
    console.error(e);
    return errorResponse({ status: 500, statusText: String(e) });
  }
};

if (serve) {
  serve(proxy);
} else {
  std_serve(proxy);
}
