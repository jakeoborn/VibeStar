// Supabase cloud sync — account auth + lineup/notes backup
//
// Setup (5 min):
//  1. Create free project at https://supabase.com
//  2. Paste your Project URL and anon key below
//  3. Open Supabase → SQL Editor → run the block below once
//
/* ── SQL (run once in Supabase SQL Editor) ───────────────────────────
create table if not exists user_data (
  user_id     uuid references auth.users primary key,
  artist_ids  text[]   not null default '{}',
  notes       jsonb    not null default '{}',
  meta        jsonb    not null default '{}',
  updated_at  timestamptz default now()
);
alter table user_data enable row level security;
create policy "own rows only" on user_data for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- If you already ran the above, add the meta column:
-- alter table user_data add column if not exists meta jsonb not null default '{}';

-- To enable "Sign in with Spotify" (one-tap login):
--  1. Supabase Dashboard → Authentication → Providers → Spotify → Enable
--  2. Paste your Spotify Client ID + Secret (from developer.spotify.com)
--  3. Copy the Supabase callback URL shown there
--  4. In Spotify developer dashboard → your app → Redirect URIs → add that URL

-- Social proof counter — run once to enable "X fans going" on artist screens:
create or replace function get_artist_save_counts(ids text[])
returns table(artist_id text, save_count bigint)
language sql security definer stable
as $$
  select a.id as artist_id,
         count(u.user_id) as save_count
  from unnest(ids) as a(id)
  left join user_data u on a.id = any(u.artist_ids)
  group by a.id;
$$;

-- Index for the `a.id = any(u.artist_ids)` lookup above. Without this the RPC
-- seq-scans user_data on every artist screen — fine at 100 users, painful at
-- 10k. GIN over the text[] column makes the `= ANY` operator index-driven.
create index if not exists user_data_artist_ids_gin
  on user_data using gin (artist_ids);

-- v98: Crew chat. Group messages keyed by crew code. The 6-char code itself is
-- the secret — anyone holding it can read/write that room. Same trust model as
-- the existing broadcast channel `group-${code}`. Persistent (vs broadcast) so
-- members who join late or reconnect after offline still see the thread.
create table if not exists crew_messages (
  id          bigserial primary key,
  crew_code   text  not null,
  sender_pid  text  not null,
  sender_name text  not null,
  body        text  not null check (length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists crew_messages_code_ts_idx
  on crew_messages (crew_code, created_at desc);
alter table crew_messages enable row level security;
create policy "anon read crew msgs"   on crew_messages for select using (true);
create policy "anon insert crew msgs" on crew_messages for insert
  with check (length(body) between 1 and 500 and length(crew_code) between 4 and 12);
-- Enable Realtime INSERT stream so subscribers get new messages without polling.
alter publication supabase_realtime add table crew_messages;
─────────────────────────────────────────────────────────────────── */

const SUPABASE_URL  = "https://pzoijbqsbbwyuyjinjtj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6b2lqYnFzYmJ3eXV5amluanRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTY4OTYsImV4cCI6MjA5MjkzMjg5Nn0.193dyHNHbc_zsm6l6UfQnpz4jXqRoPFBC4TWylyFPfA";

const _sb = (SUPABASE_URL && SUPABASE_ANON)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

// ── Auth ──────────────────────────────────────────────────────
async function sbSignIn(email) {
  if (!_sb) return { error: "Supabase not configured" };
  const { error } = await _sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message || null };
}

// Sign in with Spotify via Supabase OAuth — requires Spotify enabled in
// Supabase Dashboard → Auth → Providers. See SQL comment above for setup.
async function sbSignInWithSpotify() {
  if (!_sb) return { error: "Supabase not configured" };
  const { error } = await _sb.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      scopes: "user-top-read user-read-recently-played user-library-read user-read-private user-read-email user-follow-read playlist-read-private playlist-modify-public playlist-modify-private",
      redirectTo: window.location.origin,
    },
  });
  return { error: error?.message || null };
}

// Sign in with Apple.
//
// On iOS (Capacitor native build) we use @capacitor-community/apple-sign-in to
// surface Apple's native Face ID / Touch ID sheet, then exchange the resulting
// identity token with Supabase via signInWithIdToken. This is the form Apple
// App Review requires — Guideline 4.8 / 5.1.1(v) rejects apps that ship Sign
// in with Apple as a web-OAuth redirect (it pops Safari and is jarring).
//
// On the web (plursky.com) we fall back to Supabase's OAuth redirect, which is
// fine outside the App Store.
//
// Requires (one-time):
//   • Apple Developer → Identifiers → App ID `com.plursky.app` with the
//     "Sign in with Apple" capability enabled.
//   • Supabase Dashboard → Auth → Providers → Apple → add `com.plursky.app`
//     to "Authorized Client IDs" so Supabase accepts our identity tokens.
async function sbSignInWithApple() {
  if (!_sb) return { error: "Supabase not configured" };

  const cap = window.Capacitor;
  const isNative = !!cap?.isNativePlatform?.();
  const native = cap?.Plugins?.SignInWithApple;

  // On a native build, the native plugin MUST be available. Falling
  // through to the web-OAuth path here would silently fail inside the
  // Capacitor WebView (origin is capacitor://localhost, Apple can't
  // redirect back) — which was the App Review rejection in v1.0(3).
  if (isNative) {
    if (!native) {
      return { error: "Sign in with Apple is unavailable on this build. Use Email magic link below." };
    }
    try {
      // Bind a fresh nonce per attempt. Apple hashes (sha256) the raw nonce
      // we send and returns the hash in the identity token's `nonce` claim;
      // Supabase reverses that by hashing the value we pass to
      // signInWithIdToken — so both calls receive the same raw value.
      const rawNonce = _randNonce();
      const res = await native.authorize({
        clientId:    "com.plursky.app",
        redirectURI: "https://plursky.com/callback",
        scopes:      "email name",
        nonce:       rawNonce,
      });
      const identityToken = res?.response?.identityToken;
      if (!identityToken) return { error: "Apple did not return an identity token." };

      // Cache the display name Apple sends on first sign-in only. The cached
      // value is consumed by AccountCard's display logic.
      try {
        const given  = res?.response?.givenName  || "";
        const family = res?.response?.familyName || "";
        const full   = `${given} ${family}`.trim();
        if (full) localStorage.setItem("plursky_apple_name", full);
      } catch {}

      const { error } = await _sb.auth.signInWithIdToken({
        provider: "apple",
        token:    identityToken,
        nonce:    rawNonce,
      });
      return { error: error?.message || null };
    } catch (e) {
      // User-cancellation should not surface as a scary error.
      const msg = e?.message || String(e);
      if (/canceled|cancelled|1001|1000/i.test(msg)) return { error: null, cancelled: true };
      // Surface error code / type when available so App Review can quote
      // back what specifically failed on their device.
      return { error: msg, code: e?.code, type: e?.errorMessage || e?.name };
    }
  }

  // Web fallback (plursky.com PWA / desktop). Opens Apple's web sheet.
  const { error } = await _sb.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message || null };
}

function _randNonce() {
  const a = new Uint8Array(16);
  (crypto?.getRandomValues || (() => {}))(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

// Hard-delete the signed-in user. Apple Guideline 5.1.1(v) requires every app
// that supports account creation to expose in-app deletion that fully removes
// the user — RLS-deleted rows + signed-out client aren't enough; the auth.users
// row must go too. Calls the delete-account Edge Function, which verifies the
// JWT and uses the service-role key server-side. See supabase/functions/.
async function sbDeleteAccount() {
  if (!_sb) return { error: "Supabase not configured" };
  const { data: { session } } = await _sb.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return { error: "Not signed in." };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey:        SUPABASE_ANON,
        "content-type": "application/json",
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body?.error || `delete failed (${res.status})` };
    // Sign out locally so the cached session can't hit RLS on the now-missing row.
    try { await _sb.auth.signOut(); } catch {}
    // Wipe local app state tied to the deleted identity.
    try {
      localStorage.removeItem("plursky_apple_name");
      localStorage.removeItem("spotify_profile");
      localStorage.removeItem("spotify_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("spotify_expires");
    } catch {}
    return { error: null };
  } catch (e) {
    return { error: e?.message || "network error" };
  }
}

async function sbSignOut() {
  if (!_sb) return;
  await _sb.auth.signOut();
}

async function sbGetUser() {
  if (!_sb) return null;
  const { data } = await _sb.auth.getUser();
  return data?.user || null;
}

// Subscribe to auth changes — cb receives (event, user, session).
// On Spotify OAuth sign-in: provider_token is automatically stored as the
// Spotify access token so the Music tab works without a separate connect.
function sbOnAuthChange(cb) {
  if (!_sb) return () => {};
  const { data } = _sb.auth.onAuthStateChange((event, session) => {
    cb(event, session?.user || null, session);
    if (event === "SIGNED_IN" && session?.provider_token) {
      try {
        localStorage.setItem("spotify_token",   session.provider_token);
        localStorage.setItem("spotify_expires", String(Date.now() + 3600000));
        if (session.provider_refresh_token)
          localStorage.setItem("spotify_refresh_token", session.provider_refresh_token);
        // Fetch + cache Spotify profile
        fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: "Bearer " + session.provider_token },
        }).then(r => r.ok ? r.json() : null).then(p => {
          if (!p) return;
          localStorage.setItem("spotify_profile", JSON.stringify({
            id: p.id, name: p.display_name || p.id,
            email: p.email || null, image: p.images?.[0]?.url || null,
            country: p.country || null, product: p.product || null,
          }));
        }).catch(() => {});
      } catch {}
    }
    // Apple only sends full_name on the very first sign-in — cache it immediately
    if (event === "SIGNED_IN") {
      try {
        const meta = session?.user?.user_metadata;
        const name = meta?.full_name || meta?.name;
        if (name) localStorage.setItem("plursky_apple_name", name);
      } catch {}
    }
  });
  return () => data.subscription.unsubscribe();
}

// ── Cloud sync ────────────────────────────────────────────────
async function sbPush(artistIds, notes) {
  if (!_sb) return;
  const user = await sbGetUser();
  if (!user) return;
  const row = {
    user_id:    user.id,
    artist_ids: artistIds,
    notes:      notes,
    updated_at: new Date().toISOString(),
  };
  // Attach Spotify profile snapshot so it persists to cloud
  try {
    const raw = localStorage.getItem("spotify_profile");
    if (raw) row.meta = { spotify: JSON.parse(raw) };
  } catch {}
  await _sb.from("user_data").upsert(row);
}

async function sbPull() {
  if (!_sb) return null;
  const user = await sbGetUser();
  if (!user) return null;
  const { data } = await _sb
    .from("user_data")
    .select("artist_ids, notes, meta")
    .eq("user_id", user.id)
    .single();
  return data || null;
}

// Returns { [artistId]: count } for each id in artistIds.
// Requires the get_artist_save_counts SQL function (see SQL block above).
async function sbGetArtistSaveCounts(artistIds) {
  if (!_sb || !artistIds?.length) return {};
  const CACHE_TTL = 3600000;
  const now = Date.now();
  const result = {};
  const toFetch = [];
  for (const id of artistIds) {
    try {
      const c = JSON.parse(localStorage.getItem(`sb_sc_${id}`) || "null");
      if (c && now - c.ts < CACHE_TTL) { result[id] = c.count; continue; }
    } catch {}
    toFetch.push(id);
  }
  if (!toFetch.length) return result;
  try {
    const { data, error } = await _sb.rpc("get_artist_save_counts", { ids: toFetch });
    if (!error && data) {
      for (const row of data) {
        const count = Number(row.save_count);
        result[row.artist_id] = count;
        try { localStorage.setItem(`sb_sc_${row.artist_id}`, JSON.stringify({ count, ts: now })); } catch {}
      }
    }
  } catch {}
  return result;
}

// ── Account card (shown inside MeScreen) ─────────────────────
function AccountCard({ state, setState }) {
  const configured = !!(SUPABASE_URL && SUPABASE_ANON);
  const [sbUser, setSbUser] = React.useState(null);
  const [email,  setEmail]  = React.useState("");
  const [phase,  setPhase]  = React.useState("idle"); // idle | sending | sent | error
  const [errMsg, setErrMsg] = React.useState("");
  // Apple Sign-In needs its own busy/error state so the button gives
  // visible feedback the moment it's tapped — silent failure here was
  // the v1.0(3) App Review rejection (Guideline 2.1a).
  const [appleBusy, setAppleBusy] = React.useState(false);
  const [appleErr,  setAppleErr]  = React.useState("");
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState("");
  // Delete-account flow has three visual states: idle, confirming, working.
  // Surfacing 'confirming' inline (rather than window.confirm) keeps the
  // destructive step inside Plursky's visual frame on iOS App Review captures.
  const [deletePhase, setDeletePhase] = React.useState("idle");
  const [deleteErr,   setDeleteErr]   = React.useState("");
  // Collapsed by default — most users sign in once and don't need the controls
  // visible thereafter. Header summary tells them whether they're synced.
  const [expanded, setExpanded] = React.useState(false);

  // Resolve current user on mount
  React.useEffect(() => {
    if (!configured) return;
    sbGetUser().then(setSbUser);
    return sbOnAuthChange((event, user, session) => {
      setSbUser(user);
      // If this was a Spotify OAuth sign-in, mark Spotify as connected in app state
      if (event === "SIGNED_IN" && session?.provider_token) {
        setState(st => ({ ...st, spotifyConnected: true }));
      }
      // On sign-in, pull cloud data and merge into local state
      if (event === "SIGNED_IN" && user) {
        sbPull().then(cloud => {
          if (!cloud) return;
          setState(st => {
            const merged = [...new Set([...st.saved, ...(cloud.artist_ids || [])])];
            let localNotes = {};
            try { localNotes = JSON.parse(localStorage.getItem("artist_notes_v1") || "{}"); } catch {}
            const mergedNotes = { ...localNotes, ...cloud.notes };
            try { localStorage.setItem("artist_notes_v1", JSON.stringify(mergedNotes)); } catch {}
            return { ...st, saved: merged };
          });
        });
      }
    });
  }, [configured]);

  const handleSignIn = async () => {
    if (!email.trim()) return;
    setPhase("sending");
    const { error } = await sbSignIn(email.trim());
    if (error) { setPhase("error"); setErrMsg(error); }
    else setPhase("sent");
  };

  const handleApple = async () => {
    if (appleBusy) return;
    setAppleBusy(true);
    setAppleErr("");
    try {
      const r = await sbSignInWithApple();
      if (r?.cancelled) return;
      if (r?.error) {
        // Include error code / type when available so App Review can quote
        // it back to us if this still fails on their device. Also log to
        // console so Safari Web Inspector picks it up during live debug.
        const detail = (r?.code || r?.type) ? ` [${r.code || r.type}]` : "";
        const msg = `${r.error}${detail}`;
        try { console.error("[plursky:apple-signin]", r); } catch {}
        setAppleErr(msg);
      }
    } catch (e) {
      try { console.error("[plursky:apple-signin]", e); } catch {}
      setAppleErr(e?.message || "Sign in failed");
    } finally {
      setAppleBusy(false);
    }
  };

  const handleSignOut = async () => {
    await sbSignOut();
    setSbUser(null);
  };

  const handleDelete = async () => {
    setDeletePhase("working");
    setDeleteErr("");
    const { error } = await sbDeleteAccount();
    if (error) { setDeletePhase("confirming"); setDeleteErr(error); return; }
    setSbUser(null);
    setDeletePhase("idle");
    // Clear the in-memory app state's saved list too — the cloud row is gone
    // and we just wiped the local mirror via sbDeleteAccount's cleanup.
    setState(st => ({ ...st, saved: [] }));
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    let notes = {};
    try { notes = JSON.parse(localStorage.getItem("artist_notes_v1") || "{}"); } catch {}
    await sbPush(state.saved, notes);
    setSyncing(false);
    setSyncMsg("Saved to cloud ✓");
    setTimeout(() => setSyncMsg(""), 2500);
  };

  // Compact summary line shown when collapsed. Surfaces whether sync is
  // active so users can spot a problem without expanding the card.
  const summary = !configured
    ? "NOT CONFIGURED"
    : sbUser
      ? <span style={{ color: "var(--success)" }}>● SYNCED · {(sbUser.email || sbUser.user_metadata?.full_name || "signed in").toString().slice(0, 22)}</span>
      : "TAP TO SIGN IN";

  return (
    <div style={{
      marginTop: 20,
      background: "var(--paper)", border: "1px solid var(--line)",
      borderRadius: 16, padding: 16,
    }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        marginBottom: expanded ? 14 : 0,
        background: "transparent", border: "none", padding: 0, cursor: "pointer",
        textAlign: "left", color: "var(--ink)",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "var(--ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20 c0-4 3.6-7 8-7 s8 3 8 7"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>Cloud account</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {expanded ? "SYNC LINEUP + NOTES ACROSS DEVICES" : summary}
          </div>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>

      {!expanded ? null : <>

      {!configured && (
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          Add your Supabase URL and anon key to <span className="mono" style={{ fontSize: 11 }}>supabase.jsx</span> to enable cloud sync.
        </div>
      )}

      {configured && sbUser && (() => {
        const sp = (() => { try { return JSON.parse(localStorage.getItem("spotify_profile") || "null"); } catch { return null; } })();
        const appleName = (() => { try { return localStorage.getItem("plursky_apple_name"); } catch { return null; } })();
        const isApple = sbUser.app_metadata?.provider === "apple";
        const avatar = sp?.image || null;
        const displayName = sp?.name || appleName || sbUser.user_metadata?.full_name || sbUser.email || "?";
        const initial = displayName[0].toUpperCase();
        return (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "var(--paper-2)",
              borderRadius: 10, marginBottom: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 32, flexShrink: 0, overflow: "hidden",
                background: "linear-gradient(135deg, var(--ember), var(--horizon))",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontFamily: "Instrument Serif, serif", fontSize: 15,
              }}>
                {avatar
                  ? <img src={avatar} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {displayName}
                </div>
                <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "var(--success)", marginTop: 2 }}>● SIGNED IN{sp ? " · SPOTIFY LINKED" : isApple ? " · APPLE" : ""}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleSync} disabled={syncing} style={{
                flex: 1,
                background: syncMsg ? "var(--success)" : "var(--ink)",
                color: "var(--paper)", border: "none",
                borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
                transition: "background 0.3s",
              }}>
                {syncing ? "SYNCING…" : syncMsg || `↑ PUSH ${state.saved.length} SETS TO CLOUD`}
              </button>
              <button onClick={handleSignOut} style={{
                background: "transparent", border: "1px solid var(--line-2)",
                borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, color: "var(--muted)",
              }}>SIGN OUT</button>
            </div>

            {/* Delete account — required by Apple App Store Guideline 5.1.1(v)
                for any app that supports account creation. Two-step inline
                confirm so a stray tap can't nuke the user's data. */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              {deletePhase === "idle" && (
                <button onClick={() => { setDeletePhase("confirming"); setDeleteErr(""); }} style={{
                  background: "transparent", border: "none", padding: "4px 0", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2,
                  color: "var(--muted)", textDecoration: "underline",
                }}>DELETE ACCOUNT</button>
              )}
              {deletePhase !== "idle" && (
                <div style={{
                  padding: "10px 12px", background: "rgba(232,93,46,0.08)",
                  border: "1px solid rgba(232,93,46,0.35)", borderRadius: 10,
                }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ember)", marginBottom: 4 }}>
                    DELETE ACCOUNT?
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.45, marginBottom: 10 }}>
                    Permanently removes your saved sets, notes, and sign-in. This can't be undone.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleDelete}
                      disabled={deletePhase === "working"}
                      style={{
                        flex: 1, background: "var(--ember)", color: "#fff",
                        border: "none", borderRadius: 10, padding: "9px 12px",
                        cursor: deletePhase === "working" ? "default" : "pointer",
                        fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
                      }}>
                      {deletePhase === "working" ? "DELETING…" : "YES, DELETE EVERYTHING"}
                    </button>
                    <button
                      onClick={() => { setDeletePhase("idle"); setDeleteErr(""); }}
                      disabled={deletePhase === "working"}
                      style={{
                        background: "transparent", border: "1px solid var(--line-2)",
                        borderRadius: 10, padding: "9px 14px",
                        cursor: deletePhase === "working" ? "default" : "pointer",
                        fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, color: "var(--muted)",
                      }}>CANCEL</button>
                  </div>
                  {deleteErr && (
                    <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{deleteErr}</div>
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {configured && !sbUser && (
        <>
          {/* Email magic link — Spotify is connected separately on the Music tab */}
          {phase === "sent" ? (
            <div style={{
              padding: "12px 14px", background: "rgba(45,122,85,0.1)",
              border: "1px solid var(--success)", borderRadius: 10,
              fontSize: 13, color: "var(--success)", lineHeight: 1.5,
            }}>
              Magic link sent to <strong>{email}</strong>.<br/>
              Check your email and tap the link — this tab will sign you in automatically.
            </div>
          ) : (
            <>
              <button onClick={handleApple} disabled={appleBusy} style={{
                width: "100%", marginBottom: appleErr ? 6 : 10,
                background: appleBusy ? "#444" : "#000",
                color: "#fff",
                border: "none", borderRadius: 10, padding: "11px 14px",
                cursor: appleBusy ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontFamily: "Geist, sans-serif", fontSize: 14, fontWeight: 500,
              }}>
                {appleBusy ? (
                  <span style={{
                    width: 14, height: 14, borderRadius: 14,
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "#fff",
                    animation: "spin 0.8s linear infinite",
                    display: "inline-block",
                  }}/>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 814 1000" fill="white">
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663.1 0 541.8c0-207.5 133.4-317.1 264.5-317.1 70.4 0 128.9 45.5 173 45.5 42.9 0 109.9-48.1 190.5-48.1C500.1 222.2 620.9 240.3 788.1 340.9zM530.4 220.5c-20.1-29.7-47.1-66.8-97.3-66.8-12.1 0-24.2 2.3-35.7 5.1-7.1 1.8-14.1 3.9-21.3 3.9-1.9 0-3.8-.1-5.7-.3 11.4-57.7 56.4-143.4 122.3-180.5 27.9-15.7 59-26.2 91.9-26.2 2.9 0 5.8.1 8.7.3-1 56.1-23.8 117.3-63 164.5z"/>
                  </svg>
                )}
                {appleBusy ? "Signing in…" : "Sign in with Apple"}
              </button>
              {appleErr && (
                <div style={{
                  background: "rgba(248,113,113,0.10)",
                  border: "1px solid rgba(248,113,113,0.45)",
                  borderRadius: 10, padding: "10px 12px", marginBottom: 10,
                  fontSize: 12, color: "#c14a4a", lineHeight: 1.45,
                }}>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>
                    Sign in with Apple unavailable
                  </div>
                  <div style={{ marginBottom: 8, opacity: 0.85, fontSize: 11, wordBreak: "break-word" }}>
                    {appleErr}
                  </div>
                  <div className="mono" style={{
                    fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
                    color: "var(--ink)",
                  }}>
                    USE EMAIL MAGIC LINK BELOW ↓
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 1, background: "var(--line-2)" }}/>
                <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "var(--line-2)" }}/>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setPhase("idle"); }}
                  onKeyDown={e => e.key === "Enter" && handleSignIn()}
                  placeholder="email magic link…"
                  style={{
                    flex: 1,
                    background: "var(--paper-2)", border: `1px solid ${phase === "error" ? "#f87171" : "var(--line-2)"}`,
                    borderRadius: 10, padding: "10px 12px",
                    fontFamily: "Geist, sans-serif", fontSize: 14, color: "var(--ink)", outline: "none",
                  }}
                />
                <button onClick={handleSignIn} disabled={phase === "sending" || !email.trim()} style={{
                  background: email.trim() ? "var(--ink)" : "var(--paper-2)",
                  color: email.trim() ? "var(--paper)" : "var(--muted)",
                  border: "none", borderRadius: 10, padding: "10px 14px", cursor: email.trim() ? "pointer" : "default",
                  fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
                  whiteSpace: "nowrap", transition: "all .15s",
                }}>
                  {phase === "sending" ? "…" : "SEND LINK"}
                </button>
              </div>
              {phase === "error" && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{errMsg}</div>
              )}
            </>
          )}
        </>
      )}
      </>}
    </div>
  );
}

// ── Realtime presence (friend locations) ─────────────────────
// No DB table needed — presence is ephemeral, managed by Supabase
// Realtime. Channel is scoped per CREW so a stranger running Plursky
// can't see your location: only people who joined your crew code do.
// Falls back to a festival-wide demo channel if no crew is set yet.

const PRESENCE_FALLBACK = `presence-${FESTIVAL_CONFIG?.id || "festival"}`;
const PRESENCE_COLORS = [
  "#e85d2e","#7b3d9a","#f59a36","#6f8fb8",
  "#2d7a55","#e85d8f","#34b4e8","#a855f7",
];

// Reuse the existing crew/group code (CrewCard already manages it under
// plursky_group_code) so the presence channel is scoped to your crew —
// only members see each other's stage, not the whole festival.
function _presChannelName() {
  let code = null;
  try { code = localStorage.getItem("plursky_group_code") || null; } catch {}
  return code ? `crew-${code}` : PRESENCE_FALLBACK;
}

function _presColor(id) {
  if (!id) return PRESENCE_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

function _myPresId() {
  let id;
  try { id = localStorage.getItem("plursky_pid"); } catch {}
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem("plursky_pid", id); } catch {}
  }
  return id;
}

let _presCh   = null;
let _presCbs  = new Set();
let _presSnap = {};
let _presMyId = null;

function _presNotify() {
  const s = { ..._presSnap };
  _presCbs.forEach(fn => { try { fn(s); } catch {} });
}

function sbPresenceJoin({ name, stageId, gps }) {
  if (!_sb) return;
  _presMyId = _myPresId();
  const color = _presColor(_presMyId);
  if (_presCh) { _sb.removeChannel(_presCh); _presCh = null; }
  _presCh = _sb.channel(_presChannelName(), {
    config: { presence: { key: _presMyId } },
  });
  _presCh
    .on("presence", { event: "sync" }, () => {
      const raw  = _presCh.presenceState();
      const snap = {};
      Object.entries(raw).forEach(([key, arr]) => {
        const e = arr[arr.length - 1];
        if (e) snap[key] = e;
      });
      _presSnap = snap;
      _presNotify();
    })
    .subscribe(async status => {
      if (status === "SUBSCRIBED") {
        let pingCode;
        try { pingCode = localStorage.getItem("ping_code") || undefined; } catch {}
        // `gps` is { lat, lng, accuracy } when the user opts into live-location
        // sharing in the Share With Crew sheet; otherwise undefined and clients
        // fall back to rendering just the stageId.
        await _presCh.track({ name, stageId, color, ts: Date.now(), pingCode, gps });
      }
    });
}

// Accepts either a plain stageId (legacy, kept so old call sites still work)
// or a partial { stageId?, gps? } update merged onto the current state.
async function sbPresenceUpdate(arg) {
  if (!_presCh || !_presMyId) return;
  const cur = (_presCh.presenceState()[_presMyId] || [])[0];
  if (!cur) return;
  const patch = typeof arg === "string" ? { stageId: arg } : (arg || {});
  await _presCh.track({ ...cur, ...patch, ts: Date.now() });
}

// Re-join presence on the channel matching the current crew code. Called
// after a crew code change so a sharing user moves to the new crew's channel
// instead of being stranded on the previous one.
function sbPresenceRefresh() {
  if (!_presCh || !_presMyId) return false;
  const cur = (_presCh.presenceState()[_presMyId] || [])[0];
  if (!cur) return false;
  sbPresenceJoin({ name: cur.name, stageId: cur.stageId });
  return true;
}

function sbPresenceLeave() {
  if (_presCh && _sb) { _sb.removeChannel(_presCh); _presCh = null; }
  _presSnap = {};
  _presMyId = null;
  _presNotify();
}

function sbOnPresenceChange(cb) {
  _presCbs.add(cb);
  return () => _presCbs.delete(cb);
}

// Always returns a stable device id. Falls back to the persisted localStorage
// pid (`plursky_pid`) before presence has been joined, so callers like
// CrewCard / CrewChat that depend on this id never see null on a fresh tab.
function sbGetMyPresId() { return _presMyId || _myPresId(); }
function sbGetPresSnap()  { return { ..._presSnap }; }

function sbFindByPingCode(code) {
  const upper = (code || "").trim().toUpperCase();
  if (!upper) return null;
  for (const [id, entry] of Object.entries(_presSnap)) {
    if ((entry.pingCode || "").toUpperCase() === upper) {
      return { presId: id, name: entry.name, stageId: entry.stageId, color: entry.color, ts: entry.ts };
    }
  }
  return null;
}

// ── FriendsCard ───────────────────────────────────────────────
// Replaces the hardcoded friends array in MeScreen.
// Demo mode (no Supabase) shows mock data. Live mode uses presence.
function FriendsCard({ state, setState }) {
  const configured = !!(SUPABASE_URL && SUPABASE_ANON);

  const [sharing,   setSharing]   = React.useState(false);
  const [myName,    setMyName]    = React.useState(() => {
    try {
      return localStorage.getItem("plursky_display_name")
          || localStorage.getItem("user_name")
          || "";
    } catch { return ""; }
  });
  const [stageId,   setStageId]   = React.useState(() => STAGES?.[0]?.id || "");
  const [editName,  setEditName]  = React.useState(false);
  const [nameInput, setNameInput] = React.useState("");
  const [snap,      setSnap]      = React.useState(() => sbGetPresSnap());

  React.useEffect(() => sbOnPresenceChange(setSnap), []);

  React.useEffect(() => {
    if (!myName && state.spotifyConnected) {
      ensureSpotifyProfile().then(p => {
        const first = p?.name?.split(/\s+/)[0] || "";
        if (first && !localStorage.getItem("plursky_display_name")) setMyName(first);
      });
    }
  }, [state.spotifyConnected]);

  const myId    = sbGetMyPresId();
  const friends = Object.entries(snap)
    .filter(([id]) => id !== myId)
    .map(([id, e]) => ({ id, ...e }));

  const saveName = (val) => {
    const v = val.trim().slice(0, 20);
    if (!v) return;
    setMyName(v);
    try { localStorage.setItem("plursky_display_name", v); } catch {}
    setEditName(false);
    setNameInput("");
  };

  const handleToggle = () => {
    if (!sharing) {
      if (!myName) { setEditName(true); return; }
      sbPresenceJoin({ name: myName, stageId });
      setSharing(true);
    } else {
      sbPresenceLeave();
      setSharing(false);
    }
  };

  const handleStage = (id) => {
    setStageId(id);
    if (sharing) sbPresenceUpdate(id);
  };

  if (!configured) {
    const demo = [
      { id: "r", name: "Remi", color: "#e85d2e", stageId: "bionic",  ts: Date.now() - 60000 },
      { id: "j", name: "Juno", color: "#7b3d9a", stageId: "quantum", ts: Date.now() - 120000 },
      { id: "k", name: "Kai",  color: "#f59a36", stageId: "stereo",  ts: Date.now() - 240000 },
      { id: "s", name: "Sage", color: "#6f8fb8", stageId: "circuit", ts: Date.now() - 30000 },
    ];
    return (
      <>
        <_FriendsHeader count={4} live={false} />
        <_FriendRows friends={demo} state={state} setState={setState} />
      </>
    );
  }

  return (
    <>
      <_FriendsHeader count={friends.length} live={sharing} />

      {/* My sharing tile */}
      <div style={{
        padding: "12px 14px", borderRadius: 12, marginBottom: 8,
        background: sharing ? "var(--ink)" : "var(--paper)",
        border: `1px solid ${sharing ? "transparent" : "var(--line)"}`,
        color: sharing ? "var(--paper)" : "var(--ink)",
        transition: "background .2s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 38, flexShrink: 0,
            background: sharing ? _presColor(_presMyId || "x") : "var(--paper-2)",
            border: sharing ? "none" : "1px solid var(--line-2)",
            color: sharing ? "#fff" : "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Instrument Serif, serif", fontSize: 18, position: "relative",
          }}>
            {myName ? myName[0].toUpperCase() : "?"}
            {sharing && (
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)", border: "2px solid var(--ink)",
              }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 16, lineHeight: 1 }}>
              {myName || "Set your name"}
            </div>
            <div className="mono" style={{
              fontSize: 9, letterSpacing: 1.2, marginTop: 3, textTransform: "uppercase",
              color: sharing ? "rgba(247,237,224,0.55)" : "var(--muted)",
            }}>
              {sharing
                ? (STAGES?.find(s => s.id === stageId)?.name || stageId) + " · LIVE"
                : "You · tap GO LIVE to share"}
            </div>
          </div>
          <button onClick={handleToggle} style={{
            background: sharing ? "rgba(247,237,224,0.15)" : "var(--ember)",
            color: "#fff", border: "none", borderRadius: 999,
            padding: "7px 12px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace",
            fontSize: 9, letterSpacing: 1.2, fontWeight: 700, flexShrink: 0,
          }}>
            {sharing ? "STOP" : myName ? "GO LIVE" : "SET NAME"}
          </button>
        </div>

        {!sharing && editName && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveName(nameInput)}
              placeholder="First name…"
              autoFocus
              maxLength={20}
              style={{
                flex: 1,
                background: "var(--paper-2)", border: "1px solid var(--line-2)",
                borderRadius: 10, padding: "8px 12px",
                fontFamily: "Geist, sans-serif", fontSize: 14,
                color: "var(--ink)", outline: "none",
              }}
            />
            <button onClick={() => saveName(nameInput)} style={{
              background: nameInput.trim() ? "var(--ember)" : "var(--paper-2)",
              color: nameInput.trim() ? "#fff" : "var(--muted)",
              border: "none", borderRadius: 10, padding: "8px 12px",
              cursor: nameInput.trim() ? "pointer" : "default",
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.1, fontWeight: 700,
            }}>OK</button>
          </div>
        )}

        {sharing && (
          <div style={{ marginTop: 10 }}>
            <div className="mono" style={{
              fontSize: 8.5, letterSpacing: 1.2,
              color: "rgba(247,237,224,0.45)", marginBottom: 6,
            }}>CURRENT STAGE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {STAGES?.map(s => (
                <button key={s.id} onClick={() => handleStage(s.id)} style={{
                  background: stageId === s.id ? s.color : "rgba(247,237,224,0.08)",
                  color: stageId === s.id ? "#fff" : "rgba(247,237,224,0.65)",
                  border: `1px solid ${stageId === s.id ? s.color : "rgba(247,237,224,0.18)"}`,
                  borderRadius: 999, padding: "4px 9px", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 8, letterSpacing: 1, fontWeight: 600,
                  transition: "all .12s",
                }}>{s.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {friends.length > 0
        ? <_FriendRows friends={friends} state={state} setState={setState} />
        : (
          <div style={{
            padding: "13px 14px", borderRadius: 12,
            background: "var(--paper)", border: "1px solid var(--line)",
          }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)" }}>
              NO FRIENDS ONLINE YET
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>
              Share Plursky with your crew — anyone who taps GO LIVE shows up here instantly.
            </div>
          </div>
        )
      }
    </>
  );
}

function _FriendsHeader({ count, live }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <div className="serif" style={{ fontSize: 22 }}>Friends at EDC</div>
      {live && count > 0 && (
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--success)" }}>
          ● {count} LIVE
        </span>
      )}
    </div>
  );
}

function _FriendRows({ friends, state, setState }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {friends.map(f => {
        const stage   = STAGES?.find(s => s.id === f.stageId);
        const minsAgo = f.ts ? Math.floor((Date.now() - f.ts) / 60000) : null;
        const age     = minsAgo == null ? "Live"
          : minsAgo < 1 ? "Just now"
          : `${minsAgo}m ago`;
        return (
          <div key={f.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 38,
              background: f.color || "#888",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 18, position: "relative",
              flexShrink: 0,
            }}>
              {(f.name || "?")[0].toUpperCase()}
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)", border: "2px solid var(--paper)",
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1 }}>{f.name || "Friend"}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3, textTransform: "uppercase" }}>
                {stage?.name || f.stageId || "Unknown"} · {age}
              </div>
            </div>
            <button onClick={() => setState({ ...state, tab: "map" })} style={{
              background: "transparent", border: "1px solid var(--line-2)",
              borderRadius: 999, padding: "6px 10px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
              color: "var(--ink)",
            }}>LOCATE</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Realtime DM channels ──────────────────────────────────────
// Point-to-point broadcast channel keyed by sorted pair of plursky_pid values.
// Works purely in-memory per session — messages also saved to localStorage by
// the caller so threads persist across reloads.
const _dmChannels = new Map(); // channelKey → { ch, cbs: Set }

function sbDMChannelKey(idA, idB) {
  return `dm-${[idA, idB].sort().join("-")}`;
}

function sbDMSubscribe(channelKey, cb) {
  if (!_sb) return () => {};
  let entry = _dmChannels.get(channelKey);
  if (!entry) {
    const ch = _sb.channel(channelKey);
    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const e = _dmChannels.get(channelKey);
      if (e) e.cbs.forEach(fn => { try { fn(payload); } catch {} });
    }).subscribe();
    entry = { ch, cbs: new Set() };
    _dmChannels.set(channelKey, entry);
  }
  entry.cbs.add(cb);
  return () => {
    entry.cbs.delete(cb);
    if (entry.cbs.size === 0) {
      try { _sb.removeChannel(entry.ch); } catch {}
      _dmChannels.delete(channelKey);
    }
  };
}

async function sbDMSend(channelKey, payload) {
  if (!_sb) return false;
  const entry = _dmChannels.get(channelKey);
  if (!entry) return false;
  try {
    await entry.ch.send({ type: "broadcast", event: "msg", payload });
    return true;
  } catch { return false; }
}

// ── Group / Crew mode ────────────────────────────────────────
// Supabase broadcast channel keyed by 6-char crew code.
// Each member broadcasts their saved set IDs so everyone sees
// "X crew" badges on the lineup without any DB tables.

const _groupChannels = new Map(); // code → { ch, members: Map<pid,{name,artistIds,ts}> }

function sbGetOrCreateGroupCode() {
  try {
    let code = localStorage.getItem("plursky_group_code");
    if (!code) {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem("plursky_group_code", code);
    }
    return code;
  } catch { return "PLURSK"; }
}

function sbGroupJoin(code, { pid, name, artistIds }, onChange) {
  if (!_sb) return () => {};
  sbGroupLeave(code);
  const members = new Map();
  const entry = { ch: null, members, myState: { pid, name, artistIds } };
  const ch = _sb.channel(`group-${code}`);
  entry.ch = ch;
  ch.on("broadcast", { event: "lineup" }, ({ payload }) => {
    // Ignore our own echoes and malformed payloads.
    if (!payload || !payload.pid || payload.pid === entry.myState.pid) return;
    const isNew = !members.has(payload.pid);
    members.set(payload.pid, { name: payload.name, artistIds: payload.artistIds || [], ts: Date.now() });
    onChange?.(new Map(members));
    // Echo our state to a member we hadn't seen before. Supabase broadcast is
    // fire-and-forget — historical messages aren't replayed to new joiners — so
    // without this echo, a friend who joins after the host never learns that
    // the host is in the channel. Echo terminates because we only echo on the
    // first sighting of a pid; on the second message from same pid, we skip.
    if (isNew) {
      try { ch.send({ type: "broadcast", event: "lineup", payload: entry.myState }); } catch {}
    }
  }).subscribe(status => {
    if (status !== "SUBSCRIBED") return;
    try { ch.send({ type: "broadcast", event: "lineup", payload: entry.myState }); } catch {}
  });
  _groupChannels.set(code, entry);
  return () => sbGroupLeave(code);
}

function sbGroupLeave(code) {
  const entry = _groupChannels.get(code);
  if (!entry) return;
  try { _sb.removeChannel(entry.ch); } catch {}
  _groupChannels.delete(code);
}

function sbGroupUpdate(code, payload) {
  const entry = _groupChannels.get(code);
  if (!entry) return;
  // Keep myState fresh so echoes carry the latest saved sets, not the stale
  // ones from when sbGroupJoin was first called.
  entry.myState = payload;
  try { entry.ch.send({ type: "broadcast", event: "lineup", payload }); } catch {}
}

function sbGetCrewCount(artistId) {
  const myPid = sbGetMyPresId();
  for (const [, entry] of _groupChannels) {
    let n = 0;
    for (const [pid, m] of entry.members) {
      if (pid !== myPid && (m.artistIds || []).includes(artistId)) n++;
    }
    return n;
  }
  return 0;
}

// ── Crew chat (v98) ──────────────────────────────────────────────
// Postgres-backed group thread keyed by crew_code. Persistent so late joiners
// and reconnects see history (broadcast channel is fire-and-forget). Same
// trust model: anyone with the code can read/write — RLS is permissive
// because the code itself is the secret. See SQL block at top of file.

async function sbCrewFetchMessages(code, limit = 50) {
  if (!_sb || !code) return [];
  const { data, error } = await _sb
    .from("crew_messages")
    .select("id, sender_pid, sender_name, body, created_at")
    .eq("crew_code", code)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).slice().reverse(); // ascending for render
}

// ─── Offline outbox ─────────────────────────────────────────────
// Persistent queue for outgoing writes that survives dead-zone moments
// at the festival. Scoped to crew_messages — DM broadcasts and presence
// pings are ephemeral by design, so they stay best-effort. Drains on:
//   • app load (if navigator.onLine)
//   • window 'online' event
//   • 30-second safety-net interval (catches phones that miss the event)
const OUTBOX_KEY = "plursky_outbox_v1";

function sbOutboxList() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch { return []; }
}
function sbOutboxAdd(entry) {
  const list = sbOutboxList();
  list.push({
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    attempts: 0,
    ...entry,
  });
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch {}
}
function sbOutboxRemove(id) {
  const list = sbOutboxList().filter(e => e.id !== id);
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch {}
}
function sbOutboxBumpAttempts(id) {
  const list = sbOutboxList();
  const e = list.find(x => x.id === id);
  if (e) { e.attempts = (e.attempts || 0) + 1; }
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch {}
}

// Raw insert that does NOT re-queue on failure. Used by the drainer to
// avoid an infinite re-queue loop.
async function _sbCrewInsertRaw(code, pid, name, body) {
  if (!_sb) return { error: "no_supabase" };
  try {
    const { error } = await _sb.from("crew_messages").insert({
      crew_code: code, sender_pid: pid, sender_name: name || "Friend", body,
    });
    return { error: error?.message || null };
  } catch (e) {
    return { error: e?.message || "network" };
  }
}

let _outboxDraining = false;
async function sbOutboxDrain() {
  if (_outboxDraining) return;
  _outboxDraining = true;
  try {
    const list = sbOutboxList();
    for (const e of list) {
      if (e.type !== "crew_msg") continue;
      const { error } = await _sbCrewInsertRaw(e.code, e.pid, e.name, e.body);
      if (!error) {
        sbOutboxRemove(e.id);
      } else {
        sbOutboxBumpAttempts(e.id);
        // Stop on first failure — likely still offline. Try again later.
        break;
      }
    }
  } finally {
    _outboxDraining = false;
  }
}

let _outboxInitialized = false;
function sbOutboxInit() {
  if (typeof window === "undefined" || _outboxInitialized) return;
  _outboxInitialized = true;
  // Initial drain shortly after boot once Supabase has had a tick to init.
  setTimeout(() => { if (navigator.onLine) sbOutboxDrain(); }, 800);
  window.addEventListener("online", () => sbOutboxDrain());
  // Safety-net poll — covers cases where the browser misses the 'online'
  // event (iOS Safari has been observed to do this when waking from sleep).
  setInterval(() => { if (navigator.onLine) sbOutboxDrain(); }, 30000);
}

async function sbCrewSendMessage(code, pid, name, body) {
  if (!code) return { error: "no_code" };
  const trimmed = (body || "").trim().slice(0, 500);
  if (!trimmed) return { error: "empty" };
  // No Supabase yet — queue and let the drainer pick it up later.
  if (!_sb) {
    sbOutboxAdd({ type: "crew_msg", code, pid, name, body: trimmed });
    return { error: "queued" };
  }
  const { error } = await _sbCrewInsertRaw(code, pid, name, trimmed);
  if (error) {
    // Likely offline or Supabase blip. Persist for retry; caller still
    // sees an error so the optimistic stub can mark itself accordingly,
    // but the message isn't lost.
    sbOutboxAdd({ type: "crew_msg", code, pid, name, body: trimmed });
  }
  return { error };
}

// Subscribe to INSERTs scoped to a crew_code. Calls onMessage(row) for each
// new message (including those originated by self — caller can de-dupe by id).
function sbCrewSubscribeMessages(code, onMessage) {
  if (!_sb || !code) return () => {};
  const ch = _sb.channel(`crew-msgs-${code}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "crew_messages",
      filter: `crew_code=eq.${code}`,
    }, (payload) => {
      try { onMessage?.(payload.new); } catch {}
    })
    .subscribe();
  return () => { try { _sb.removeChannel(ch); } catch {} };
}

// ─── Live Share links ───────────────────────────────────────────
// Komoot-modeled: each Share With Crew session can mint a public URL
// that opens a minimal viewer page (share.html?t=TOKEN) showing the
// user's last-known GPS + last-seen timestamp, with a hard expiry.
// Token *is* the secret — anyone with it can read; tokens are 16 hex
// chars (~64 bits of entropy) which is plenty for an unguessable
// 4-hour share. Survives sharer going offline since rows persist.
//
// SQL — run once in Supabase SQL Editor:
//   create table if not exists live_shares (
//     token       text primary key,
//     pid         text not null,
//     name        text not null,
//     color       text,
//     lat         double precision,
//     lng         double precision,
//     accuracy    real,
//     stage_id    text,
//     updated_at  timestamptz not null default now(),
//     expires_at  timestamptz not null
//   );
//   create index if not exists live_shares_expires_idx on live_shares (expires_at);
//   alter table live_shares enable row level security;
//   create policy "anon read"   on live_shares for select using (true);
//   create policy "anon insert" on live_shares for insert with check (true);
//   create policy "anon update" on live_shares for update using (true);
//   create policy "anon delete" on live_shares for delete using (true);
//   -- Optional pg_cron sweep (run hourly):
//   -- select cron.schedule('purge-expired-shares', '17 * * * *',
//   --   $$ delete from live_shares where expires_at < now() - interval '1 hour'; $$);

function sbGenerateShareToken() {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 12) +
           Math.random().toString(36).slice(2, 8);
  }
}

async function sbLiveShareStart({ token, pid, name, color, expiresAt, gps, stageId }) {
  if (!_sb || !token) return { error: "no_supabase_or_token" };
  const row = {
    token,
    pid,
    name: (name || "Friend").slice(0, 40),
    color: color || null,
    lat: gps?.lat ?? null,
    lng: gps?.lng ?? null,
    accuracy: gps?.accuracy ?? null,
    stage_id: stageId || null,
    expires_at: new Date(expiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await _sb.from("live_shares").upsert(row, { onConflict: "token" });
  return { error: error?.message || null };
}

async function sbLiveShareUpdate(token, partial) {
  if (!_sb || !token) return { error: "no_supabase_or_token" };
  const update = { updated_at: new Date().toISOString() };
  if (partial?.gps) {
    update.lat = partial.gps.lat;
    update.lng = partial.gps.lng;
    update.accuracy = partial.gps.accuracy;
  }
  if (partial && "stageId" in partial) update.stage_id = partial.stageId || null;
  if (Object.keys(update).length === 1) return { error: null }; // only updated_at
  const { error } = await _sb.from("live_shares").update(update).eq("token", token);
  return { error: error?.message || null };
}

async function sbLiveShareStop(token) {
  if (!_sb || !token) return;
  try { await _sb.from("live_shares").delete().eq("token", token); } catch {}
}

async function sbLiveShareFetch(token) {
  if (!_sb || !token) return null;
  const { data, error } = await _sb.from("live_shares")
    .select("*").eq("token", token).maybeSingle();
  if (error) return null;
  return data;
}

// ─── Poll / vote message protocol ─────────────────────────────
// Polls and votes piggyback on crew_messages so we don't need a new
// table — keeps the surface small for App Store review. Format:
//
//   poll:  [POLL abc12345] <question> || <opt1> || <opt2> || …
//   vote:  [VOTE abc12345] <option label>
//
// Each user's *latest* vote wins (changing your mind is normal at
// 3 AM). Vote messages are filtered out of the regular thread render
// since they'd be repetitive noise.
const POLL_RE = /^\[POLL ([a-z0-9]{6,12})\]\s+(.+?)\s+\|\|\s+(.+)$/;
const VOTE_RE = /^\[VOTE ([a-z0-9]{6,12})\]\s+(.+)$/;

function _parsePoll(body) {
  const m = POLL_RE.exec(body || "");
  if (!m) return null;
  const opts = m[3].split("||").map(s => s.trim()).filter(Boolean);
  if (opts.length < 2) return null;
  return { id: m[1], question: m[2].trim(), options: opts };
}
function _parseVote(body) {
  const m = VOTE_RE.exec(body || "");
  if (!m) return null;
  return { pollId: m[1], option: m[2].trim() };
}
function _newPollId() {
  return Math.random().toString(36).slice(2, 10);
}
function _formatPollBody(id, question, options) {
  return `[POLL ${id}] ${question} || ${options.join(" || ")}`;
}
function _formatVoteBody(pollId, option) {
  return `[VOTE ${pollId}] ${option}`;
}

function CrewChat({ code, myPid, myName }) {
  const [msgs,   setMsgs]   = React.useState([]);
  const [input,  setInput]  = React.useState("");
  const [busy,   setBusy]   = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const threadRef = React.useRef(null);
  const inputRef  = React.useRef(null);

  // Reset thread state whenever the room changes (e.g. user joins a different
  // crew) so old messages don't bleed across rooms while the new fetch runs.
  React.useEffect(() => {
    setMsgs([]);
    setLoaded(false);
    let cancelled = false;
    sbCrewFetchMessages(code).then(rows => {
      if (cancelled) return;
      // Preserve any optimistic stubs the user typed before the fetch resolved.
      // Drop a stub if the fetched set already contains its real version.
      setMsgs(prev => {
        const realKeys = new Set(rows.map(r => `${r.sender_pid}::${r.body}`));
        const aliveStubs = prev.filter(m => m.id < 0 && !realKeys.has(`${m.sender_pid}::${m.body}`));
        return [...rows, ...aliveStubs];
      });
      setLoaded(true);
    });
    const unsub = sbCrewSubscribeMessages(code, (row) => {
      setMsgs(prev => {
        if (prev.some(m => m.id === row.id)) return prev;
        // If this is our own echo, replace the matching optimistic stub in place
        // so the user never sees their message twice.
        if (row.sender_pid === myPid) {
          const idx = prev.findIndex(m => m.id < 0 && m.sender_pid === myPid && m.body === row.body);
          if (idx >= 0) {
            const next = prev.slice();
            next.splice(idx, 1, row);
            return next;
          }
        }
        return [...prev, row];
      });
    });
    return () => { cancelled = true; unsub(); };
  }, [code, myPid]);

  // Pin scroll to bottom on new message.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  // Polls + vote tallies derived from msgs. Each user's *latest* VOTE
  // wins, ordered by created_at. Polls and votes are filtered out of
  // the regular message list at render time so the thread stays tidy.
  const pollState = React.useMemo(() => {
    const polls = {};
    msgs.forEach(m => {
      const p = _parsePoll(m.body);
      if (p) polls[p.id] = {
        ...p, author_pid: m.sender_pid, author_name: m.sender_name, ts: m.created_at,
        votes: polls[p.id]?.votes || {},
      };
    });
    msgs.forEach(m => {
      const v = _parseVote(m.body);
      if (!v) return;
      if (!polls[v.pollId]) return; // orphan vote (poll not yet seen)
      polls[v.pollId].votes[m.sender_pid] = { option: v.option, ts: m.created_at, name: m.sender_name };
    });
    return polls;
  }, [msgs]);

  // Inline poll-creator state. Default question matches the most common
  // festival use case; user can edit before sending.
  const [pollOpen, setPollOpen] = React.useState(false);
  const [pollQ,    setPollQ]    = React.useState("Which stage next?");
  const [pollStageIds, setPollStageIds] = React.useState([]);

  const stagesById = React.useMemo(() => {
    const map = {};
    (window.STAGES || []).forEach(s => { map[s.id] = s; });
    return map;
  }, []);

  const togglePollStage = (id) => {
    setPollStageIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const sendPoll = async () => {
    const q = pollQ.trim().slice(0, 120);
    const opts = pollStageIds.map(id => stagesById[id]?.name).filter(Boolean);
    if (!q || opts.length < 2) return;
    const id = _newPollId();
    const body = _formatPollBody(id, q, opts);
    setPollOpen(false);
    setPollStageIds([]);
    await sendBody(body, null);
  };

  const castVote = async (pollId, option) => {
    if (busy) return;
    await sendBody(_formatVoteBody(pollId, option), null);
  };

  const sendBody = async (body, replaceStubId) => {
    setBusy(true);
    const optimistic = {
      id: -Date.now() - Math.floor(Math.random() * 1000),
      sender_pid: myPid,
      sender_name: myName,
      body,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    if (replaceStubId != null) {
      setMsgs(prev => prev.map(m => m.id === replaceStubId ? optimistic : m));
    } else {
      setMsgs(prev => [...prev, optimistic]);
    }
    const { error } = await sbCrewSendMessage(code, myPid, myName, body);
    if (error) {
      setMsgs(prev => prev.map(m => m.id === optimistic.id ? { ...m, _failed: true, _pending: false } : m));
    } else {
      // Realtime echo normally replaces the stub within ~500ms. Safety net:
      // if echo never arrives (e.g. realtime publication missing the table),
      // clear the dim/pending look after 4s so the visual doesn't get stuck.
      // The next mount's fetch will reconcile to the real row.
      setTimeout(() => {
        setMsgs(prev => prev.map(m => m.id === optimistic.id ? { ...m, _pending: false } : m));
      }, 4000);
    }
    setBusy(false);
  };

  const send = async () => {
    const body = input.trim();
    if (!body || busy) return;
    setInput("");
    await sendBody(body, null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const retry = (stub) => {
    if (busy) return;
    sendBody(stub.body, stub.id);
  };

  const fmtTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch { return ""; }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 6, padding: "0 2px" }}>
        CREW CHAT
      </div>
      <div ref={threadRef} style={{
        maxHeight: 280, overflowY: "auto",
        background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12,
        padding: "10px 12px", marginBottom: 8,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {!loaded ? (
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", textAlign: "center", padding: "16px 0" }}>
            LOADING…
          </div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 4 }}>QUIET</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>Be the first to drop a message.</div>
          </div>
        ) : msgs.map(m => {
          // Hide raw VOTE messages — their data is reflected in the poll
          // tally card. Poll messages render as a special card.
          if (_parseVote(m.body)) return null;
          const parsedPoll = _parsePoll(m.body);
          const mine = m.sender_pid === myPid;
          if (parsedPoll) {
            const live = pollState[parsedPoll.id];
            const tally = {};
            let totalVotes = 0;
            parsedPoll.options.forEach(opt => { tally[opt] = 0; });
            const myVote = live?.votes?.[myPid]?.option;
            if (live) {
              Object.values(live.votes).forEach(v => {
                if (tally[v.option] != null) { tally[v.option] += 1; totalVotes += 1; }
              });
            }
            return (
              <div key={m.id} style={{
                background: "var(--paper-2)", borderRadius: 14,
                padding: "12px 14px", margin: "4px 0",
                border: "1px solid var(--line)",
              }}>
                <div className="mono" style={{
                  fontSize: 8.5, letterSpacing: 1.2, color: "var(--muted)",
                  fontWeight: 700, marginBottom: 6,
                }}>
                  POLL · {(m.sender_name || "Friend").toUpperCase()}
                </div>
                <div className="serif" style={{ fontSize: 16, marginBottom: 10 }}>
                  {parsedPoll.question}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {parsedPoll.options.map(opt => {
                    const count = tally[opt] || 0;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const onMine = myVote === opt;
                    return (
                      <button key={opt} onClick={() => castVote(parsedPoll.id, opt)} style={{
                        position: "relative", overflow: "hidden",
                        padding: "8px 12px", borderRadius: 10,
                        background: "var(--paper)",
                        border: onMine ? "1px solid var(--ember)" : "1px solid var(--line-2)",
                        cursor: "pointer", textAlign: "left",
                        display: "flex", alignItems: "center", gap: 8,
                        color: "var(--ink)",
                      }}>
                        {/* Fill bar background (count proportion) */}
                        <div style={{
                          position: "absolute", left: 0, top: 0, bottom: 0,
                          width: `${pct}%`,
                          background: onMine ? "rgba(232,93,46,0.16)" : "rgba(123,61,154,0.12)",
                          transition: "width 0.3s",
                        }}/>
                        <span style={{
                          position: "relative", width: 14, height: 14, borderRadius: 14,
                          border: onMine ? "4px solid var(--ember)" : "1.5px solid var(--line-2)",
                          background: onMine ? "var(--paper)" : "transparent",
                          flexShrink: 0,
                        }}/>
                        <span style={{ position: "relative", flex: 1, fontFamily: "Geist", fontSize: 13, fontWeight: 500 }}>
                          {opt}
                        </span>
                        <span className="mono" style={{
                          position: "relative",
                          fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
                          color: count > 0 ? "var(--ink)" : "var(--muted)",
                        }}>
                          {count > 0 ? `${count} · ${pct}%` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mono" style={{
                  fontSize: 8, letterSpacing: 0.8, color: "var(--muted)",
                  marginTop: 8, textAlign: "right",
                }}>
                  {totalVotes} {totalVotes === 1 ? "VOTE" : "VOTES"} · {fmtTime(m.created_at)}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} style={{
              display: "flex", flexDirection: "column",
              alignItems: mine ? "flex-end" : "flex-start",
            }}>
              {!mine && (
                <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginBottom: 2, padding: "0 4px" }}>
                  {(m.sender_name || "Friend").toUpperCase()}
                </div>
              )}
              <div
                onClick={m._failed ? () => retry(m) : undefined}
                style={{
                  maxWidth: "80%", padding: "7px 11px", borderRadius: 12,
                  background: mine ? "var(--ink)" : "var(--paper-2)",
                  color:      mine ? "var(--paper)" : "var(--ink)",
                  fontSize: 13, lineHeight: 1.4,
                  opacity: m._pending ? 0.55 : 1,
                  border: m._failed ? "1px solid var(--ember)" : "none",
                  cursor: m._failed ? "pointer" : "default",
                  wordBreak: "break-word",
                }}>{m.body}</div>
              <div className="mono" style={{ fontSize: 8, letterSpacing: 0.8, color: m._failed ? "var(--ember)" : "var(--muted)", marginTop: 2, padding: "0 4px" }}>
                {m._failed ? "FAILED · TAP TO RETRY" : fmtTime(m.created_at)}
              </div>
            </div>
          );
        })}
      </div>
      {pollOpen && (
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
          borderRadius: 12, padding: "10px 12px", marginBottom: 8,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700 }}>
            NEW POLL
          </div>
          <input value={pollQ} onChange={e => setPollQ(e.target.value)} maxLength={120}
            style={{
              padding: "8px 10px", borderRadius: 8,
              background: "var(--paper)", border: "1px solid var(--line-2)",
              fontFamily: "Geist", fontSize: 13, color: "var(--ink)", outline: "none",
            }}/>
          <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.1, color: "var(--muted)", fontWeight: 700 }}>
            PICK 2–6 STAGES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
            {(window.STAGES || []).map(s => {
              const on = pollStageIds.includes(s.id);
              return (
                <button key={s.id} onClick={() => togglePollStage(s.id)} style={{
                  padding: "6px 4px", borderRadius: 8,
                  background: on ? s.color : "var(--paper)",
                  color: on ? "#fff" : "var(--ink)",
                  border: on ? "none" : "1px solid var(--line-2)",
                  fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 0.8,
                  fontWeight: on ? 700 : 500, cursor: "pointer",
                }}>{s.short}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setPollOpen(false); setPollStageIds([]); }} style={{
              flex: 1, padding: "8px 10px", borderRadius: 999,
              background: "var(--paper)", color: "var(--ink)",
              border: "1px solid var(--line-2)", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
            }}>CANCEL</button>
            <button
              disabled={!pollQ.trim() || pollStageIds.length < 2 || pollStageIds.length > 6 || busy}
              onClick={sendPoll} style={{
              flex: 1, padding: "8px 10px", borderRadius: 999,
              background: pollQ.trim() && pollStageIds.length >= 2 && pollStageIds.length <= 6 ? "var(--ember)" : "var(--paper)",
              color: pollQ.trim() && pollStageIds.length >= 2 && pollStageIds.length <= 6 ? "#fff" : "var(--muted)",
              border: pollQ.trim() && pollStageIds.length >= 2 && pollStageIds.length <= 6 ? "none" : "1px solid var(--line-2)",
              cursor: pollQ.trim() && pollStageIds.length >= 2 && pollStageIds.length <= 6 ? "pointer" : "default",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
            }}>SEND POLL</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setPollOpen(o => !o)} title="Create a poll" aria-label="Poll" style={{
          padding: "9px 11px", borderRadius: 10,
          background: pollOpen ? "var(--ink)" : "var(--paper-2)",
          color: pollOpen ? "var(--paper)" : "var(--ink)",
          border: pollOpen ? "none" : "1px solid var(--line-2)",
          cursor: "pointer",
          fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.1, fontWeight: 700,
        }}>📊</button>
        <input
          ref={inputRef}
          type="text" value={input} maxLength={500}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="Message your crew…"
          style={{
            flex: 1, padding: "9px 12px",
            background: "var(--paper-2)", border: "1px solid var(--line-2)",
            borderRadius: 10, fontFamily: "inherit", fontSize: 13,
            color: "var(--ink)", outline: "none",
          }}
        />
        <button onClick={send} disabled={!input.trim() || busy} style={{
          padding: "9px 14px",
          background: input.trim() && !busy ? "var(--ember)" : "var(--paper-2)",
          color:      input.trim() && !busy ? "#fff"        : "var(--muted)",
          border: "none", borderRadius: 10,
          cursor: input.trim() && !busy ? "pointer" : "default",
          fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.1, fontWeight: 700,
        }}>SEND</button>
      </div>
    </div>
  );
}

function CrewCard({ state }) {
  const configured = !!(SUPABASE_URL && SUPABASE_ANON);
  const [code,      setCode]      = React.useState(() => sbGetOrCreateGroupCode());
  const [joined,    setJoined]    = React.useState(false);
  const [members,   setMembers]   = React.useState(new Map());
  const [codeInput, setCodeInput] = React.useState("");
  const [joining,   setJoining]   = React.useState(false);
  const [copied,    setCopied]    = React.useState(false);
  // Collapsed by default until the user opts in — Crew Mode is one of three
  // social sections on the Me tab and most users don't use it. Auto-expand
  // when joined so members stay visible without an extra tap.
  const [expanded, setExpanded] = React.useState(false);
  const leaveRef = React.useRef(null);

  const myPid  = sbGetMyPresId();
  const myName = (() => { try { return localStorage.getItem("plursky_display_name") || localStorage.getItem("user_name") || "Me"; } catch { return "Me"; } })();

  const joinCrew = (c) => {
    const newCode = (c || code).toUpperCase().trim().slice(0, 6);
    if (newCode.length < 4) return;
    setCode(newCode);
    try { localStorage.setItem("plursky_group_code", newCode); } catch {}
    if (leaveRef.current) leaveRef.current();
    leaveRef.current = sbGroupJoin(newCode, { pid: myPid, name: myName, artistIds: state.saved }, setMembers);
    setJoined(true);
    setJoining(false);
    setCodeInput("");
    setExpanded(true);
    // Migrate any active presence broadcast to the crew's channel so map
    // pins are scoped to crew members only.
    sbPresenceRefresh();
  };

  React.useEffect(() => {
    if (joined) sbGroupUpdate(code, { pid: myPid, name: myName, artistIds: state.saved });
  }, [state.saved.join(","), joined]);

  // Auto-join when arriving via a `?crew=CODE` share link. App.jsx flags it,
  // CrewCard consumes the flag once on mount.
  React.useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem("plursky_crew_autojoin"); } catch {}
    if (pending && configured) {
      try { localStorage.removeItem("plursky_crew_autojoin"); } catch {}
      joinCrew(code);
    }
  }, []);

  React.useEffect(() => () => { if (leaveRef.current) leaveRef.current(); }, []);

  const others = [...members.entries()].filter(([pid]) => pid !== myPid);

  if (!configured) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        width: "100%", marginBottom: expanded ? 10 : 0,
        background: "transparent", border: "none", padding: 0, cursor: "pointer",
        textAlign: "left", color: "var(--ink)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div className="serif" style={{ fontSize: 22 }}>Crew Mode</div>
          {!expanded && !joined && (
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)" }}>· TAP TO START OR JOIN</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {joined && <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--success)" }}>● {others.length + 1} IN CREW</span>}
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </div>
      </button>

      {!expanded ? null : !joined ? (
        <div style={{ padding: "15px 14px", borderRadius: 14, background: "var(--paper)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>
            Share a crew code with friends. When they join, you'll see which sets overlap — and the lineup shows crew badges.
          </div>
          <button onClick={() => joinCrew(code)} style={{
            width: "100%", padding: "11px", background: "var(--ink)", color: "var(--paper)",
            border: "none", borderRadius: 10, cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.4, fontWeight: 700,
            marginBottom: 8,
          }}>
            START CREW · <span style={{ letterSpacing: 4 }}>{code}</span>
          </button>
          {joining ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={e => e.key === "Enter" && joinCrew(codeInput)}
                placeholder="Enter crew code…" autoFocus maxLength={6}
                style={{
                  flex: 1, padding: "9px 12px",
                  background: "var(--paper-2)", border: "1px solid var(--line-2)",
                  borderRadius: 10, fontFamily: "Geist Mono, monospace", fontSize: 13,
                  color: "var(--ink)", outline: "none", letterSpacing: 3,
                }}
              />
              <button onClick={() => joinCrew(codeInput)} style={{
                padding: "9px 14px",
                background: codeInput.length >= 4 ? "var(--ember)" : "var(--paper-2)",
                color: codeInput.length >= 4 ? "#fff" : "var(--muted)",
                border: "none", borderRadius: 10, cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.1, fontWeight: 700,
              }}>JOIN</button>
            </div>
          ) : (
            <button onClick={() => setJoining(true)} style={{
              width: "100%", padding: "9px", background: "transparent",
              border: "1px solid var(--line-2)", borderRadius: 10, cursor: "pointer",
              color: "var(--muted)", fontFamily: "Geist Mono, monospace",
              fontSize: 9.5, letterSpacing: 1.2,
            }}>JOIN A FRIEND'S CREW</button>
          )}
        </div>
      ) : (
        <div>
          <div style={{
            padding: "12px 14px", borderRadius: 12, marginBottom: 8,
            background: "var(--ink)", color: "var(--paper)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "rgba(247,237,224,0.45)", marginBottom: 3 }}>CREW CODE — SHARE WITH FRIENDS</div>
              <div className="mono" style={{ fontSize: 28, letterSpacing: 8, fontWeight: 700, lineHeight: 1 }}>{code}</div>
            </div>
            <button onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?crew=${code}`;
              const text = `Join my Plursky crew · code ${code}`;
              if (navigator.share) {
                try { await navigator.share({ title: "Plursky crew", text, url }); setCopied(true); setTimeout(() => setCopied(false), 1500); return; }
                catch (e) { if (e?.name === "AbortError") return; }
              }
              try { await navigator.clipboard.writeText(url); } catch {}
              setCopied(true); setTimeout(() => setCopied(false), 1500);
            }} style={{
              background: copied ? "rgba(45,122,85,0.3)" : "rgba(247,237,224,0.12)",
              border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer",
              color: copied ? "var(--success)" : "var(--paper)",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
              transition: "all .15s",
            }}>{copied ? "✓" : "↗ SHARE"}</button>
            <button onClick={() => { if (leaveRef.current) leaveRef.current(); setJoined(false); setMembers(new Map()); }} style={{
              background: "rgba(247,237,224,0.08)", border: "none", borderRadius: 8,
              padding: "7px 11px", cursor: "pointer", color: "rgba(247,237,224,0.5)",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
            }}>LEAVE</button>
          </div>
          {others.length === 0 ? (
            <div style={{ padding: "13px 14px", borderRadius: 12, background: "var(--paper)", border: "1px solid var(--line)" }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)" }}>WAITING FOR CREW</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>
                Share code <strong>{code}</strong> — friends' saved sets appear when they join.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {others.map(([pid, m]) => (
                <div key={pid} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                  background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 36, background: _presColor(pid),
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "Instrument Serif, serif", fontSize: 17, flexShrink: 0,
                  }}>{(m.name || "?")[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="serif" style={{ fontSize: 16 }}>{m.name || "Friend"}</div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2 }}>
                      {(m.artistIds || []).length} SETS SAVED
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 1, color: "var(--horizon)" }}>
                    {(m.artistIds || []).filter(id => state.saved.includes(id)).length} IN COMMON
                  </div>
                </div>
              ))}
            </div>
          )}
          <CrewChat code={code} myPid={myPid} myName={myName} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  AccountCard, sbSignIn, sbSignInWithSpotify, sbSignInWithApple, sbDeleteAccount, sbSignOut, sbGetUser, sbPush, sbPull, sbOnAuthChange,
  sbGetArtistSaveCounts,
  sbPresenceJoin, sbPresenceUpdate, sbPresenceLeave, sbPresenceRefresh, sbOnPresenceChange,
  sbGetMyPresId, sbGetPresSnap, sbFindByPingCode,
  sbDMChannelKey, sbDMSubscribe, sbDMSend,
  FriendsCard, CrewCard,
  sbGetOrCreateGroupCode, sbGroupJoin, sbGroupLeave, sbGroupUpdate, sbGetCrewCount,
  sbCrewFetchMessages, sbCrewSendMessage, sbCrewSubscribeMessages,
  sbOutboxList, sbOutboxDrain, sbOutboxInit,
  sbGenerateShareToken, sbLiveShareStart, sbLiveShareUpdate, sbLiveShareStop, sbLiveShareFetch,
});
