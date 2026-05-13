// supabase/functions/delete-account/index.ts
//
// Apple App Store Guideline 5.1.1(v): every iOS app that supports account
// creation must offer in-app account deletion that hard-removes the user.
//
// Flow:
//   1. Client sends Authorization: Bearer <user JWT> (their access_token).
//   2. We verify the JWT by calling auth.getUser() with the user's token —
//      the anon client honors the Authorization header automatically.
//   3. With a separate service-role client we:
//        a. delete the row in public.user_data (the app's data row), and
//        b. call auth.admin.deleteUser(uid) to remove the auth.users row.
//      Both are required: without (a) the row is orphaned + counted in
//      get_artist_save_counts(); without (b) the user can still sign in.
//
// Deploy:
//   supabase functions deploy delete-account
//
// The three env vars below (SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY) are reserved by the Supabase runtime and
// auto-injected into every Edge Function — you do NOT (and cannot) set
// them via `supabase secrets set`; the CLI refuses with "Env name cannot
// start with SUPABASE_". `verify_jwt = false` lives in
// supabase/config.toml so we can return our own clean 401 messages
// instead of the gateway's opaque ones.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Tight CORS: only the surfaces that legitimately host the Plursky UI may
// invoke this function from a browser. Bare-Origin requests (server-to-server,
// curl) skip CORS entirely so they're unaffected; the JWT check below is what
// actually enforces who can delete whom.
const ALLOWED_ORIGINS = new Set([
  "https://plursky.com",
  "https://www.plursky.com",
  "capacitor://localhost",   // iOS Capacitor runtime
  "http://localhost",        // local dev
  "http://localhost:8080",
]);
function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://plursky.com";
  return {
    "Access-Control-Allow-Origin":  allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const CORS = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...CORS, "content-type": "application/json" },
    });


  const SUPABASE_URL              = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token)
    return new Response(JSON.stringify({ error: "missing_token" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });

  // Verify the caller's JWT and resolve their user id.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: getUserErr } = await userClient.auth.getUser();
  if (getUserErr || !user)
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });

  // Hard delete: drop the user_data row first, then auth.users.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // user_data row is RLS-protected but the service-role client bypasses RLS.
  // Ignore "no rows found" — first-time accounts may not have a row yet.
  await admin.from("user_data").delete().eq("user_id", user.id);

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr)
    return new Response(JSON.stringify({ error: "delete_failed", detail: delErr.message }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });

  return new Response(JSON.stringify({ ok: true, user_id: user.id }), {
    status: 200, headers: { ...CORS, "content-type": "application/json" },
  });
});
