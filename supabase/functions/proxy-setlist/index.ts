// supabase/functions/proxy-setlist/index.ts
//
// setlist.fm sends NO `Access-Control-Allow-Origin` header, so the browser
// blocks the response when called directly from plursky.com / the iOS
// WebView. This proxy forwards the request server-side, holds the API
// key, and returns the JSON with the right CORS headers.
//
// The endpoint accepts only setlist.fm's `search/setlists` path under the
// `/rest/1.0/` namespace and forwards only safe query params (`artistName`,
// `p`). Anything else 400s — we're not building an open relay.
//
// Deploy:
//   supabase functions deploy proxy-setlist
//
// `verify_jwt = false` in supabase/config.toml so the function is reachable
// without an auth header. The API key is the only secret and lives in the
// `SETLISTFM_KEY` env var, set via `supabase secrets set` (NOT the
// SUPABASE_-reserved namespace).

const ALLOWED_ORIGINS = new Set([
  "https://plursky.com",
  "https://www.plursky.com",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:8080",
]);

function corsFor(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.has(origin);
  return {
    "Access-Control-Allow-Origin":  ok ? origin! : "https://plursky.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary":                         "Origin",
  };
}

Deno.serve(async (req) => {
  const origin  = req.headers.get("Origin");
  const cors    = corsFor(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET")     return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  // Prefer the secret if set; fall back to the inline key that already
  // shipped publicly in the v1.0 bundle. Move to a secret-only setup once
  // the key is rotated.
  const apiKey = Deno.env.get("SETLISTFM_KEY") || "Fjj0gHyGxSTN4TfFc_K76CV-KAoTGE1SksfU";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_api_key" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const artistName = (url.searchParams.get("artistName") || "").slice(0, 120);
  const p          = Math.max(1, Math.min(50, parseInt(url.searchParams.get("p") || "1", 10) || 1));
  if (!artistName) {
    return new Response(JSON.stringify({ error: "missing_artistName" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const upstream = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artistName)}&p=${p}`;
  try {
    const res = await fetch(upstream, {
      headers: {
        "x-api-key": apiKey,
        "Accept":    "application/json",
        "User-Agent": "Plursky/1.0 (plursky.com)",
      },
    });
    // setlist.fm returns 404 with a small JSON body for unknown artists — pass through.
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        ...cors,
        "Content-Type": res.headers.get("content-type") || "application/json",
        // Cache at the edge — setlist data is mostly static
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "upstream_failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
