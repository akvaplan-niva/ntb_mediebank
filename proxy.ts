// Deno proxy server for [NTB Mediebank API v1](https://api.ntb.no/portal/docs/media)
//
// Pre v1 examples:
// http://localhost:8000/preview/385801 alias for http://localhost:8000/api/v1/apps/asset/preview/preview/385801
// http://localhost:8000/albums/527 – alias for http://localhost:8000/api/v1/apps/assets?query&albums[]=527

const { serve, env } = Deno;

const ntb_mediebank_secret = env.get("ntb_mediebank_secret");

const baseURL = new URL("https://mediebank.ntb.no/api/v1");

// const errorResponse = (
//   { status = 500, statusText = status }: ResponseInit = {},
// ) => Response.json(statusText, { status });

const preview = new URLPattern({
  pathname: "/:variant(preview|thumbnail_big|preview_big|original|custom)/:id",
});
// original: 1024px (?)
// preview_big: 1024px
// preview: 512px
// thumbnail_big: 256px
const albums = new URLPattern({ pathname: "/album{s}?/:id" });
const patterns = [albums, preview];

const mediebankURL = (url: URL | string) => {
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
        url.searchParams.set("albums[]", id as string);
      } else {
        const { id, variant } = match.pathname.groups;

        url.pathname =
          `${baseURL.pathname}/apps/asset/preview/${variant}/${id}`;
      }
    }
  }
  console.debug("url", url.href);
  return url;
};

const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
});

export const proxy = async (request: Request) => {
  try {
    if ("OPTIONS" === request.method) {
      return new Response(undefined, { status: 204, headers: corsHeaders });
    }

    const url = mediebankURL(request.url);

    if (!url.pathname.startsWith(baseURL.pathname)) {
      return Response.json({
        error: `Invalid URL, pathname must start with: ${baseURL.pathname}`,
      }, { status: 400 });
    }

    const headers = new Headers(request.headers);
    headers.append("x-api-secret", ntb_mediebank_secret as string);
    headers.append("accept", "application/json,image/*,text/*");

    // Uncomment&refactor to become a real proxy, for now only GET
    // const { body, method } = request;
    const body = undefined;
    const method = "GET";

    const response = await fetch(url.href, {
      headers,
      method,
      body,
      signal: AbortSignal.timeout(15000),
    });

    // Add CORS to response headers
    // @todo Serve unmodified response on anything but JSON?
    const responseHeaders = new Headers([...response.headers, ...corsHeaders]);

    return new Response(response.body, { headers: responseHeaders });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
};

serve(proxy);
