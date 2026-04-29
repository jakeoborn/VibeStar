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
      scopes: "user-top-read user-read-recently-played user-library-read user-read-private user-read-email playlist-read-private playlist-modify-public playlist-modify-private",
      redirectTo: window.location.origin,
    },
  });
  return { error: error?.message || null };
}

// Sign in with Apple via Supabase OAuth — requires Apple enabled in
// Supabase Dashboard → Auth → Providers with Apple Service ID + private key.
async function sbSignInWithApple() {
  if (!_sb) return { error: "Supabase not configured" };
  const { error } = await _sb.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message || null };
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
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState("");

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

  const handleSignOut = async () => {
    await sbSignOut();
    setSbUser(null);
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

  return (
    <div style={{
      marginTop: 20,
      background: "var(--paper)", border: "1px solid var(--line)",
      borderRadius: 16, padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
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
        <div>
          <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>Cloud account</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>
            SYNC LINEUP + NOTES ACROSS DEVICES
          </div>
        </div>
      </div>

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
              <button onClick={() => sbSignInWithApple()} style={{
                width: "100%", marginBottom: 10,
                background: "#000", color: "#fff",
                border: "none", borderRadius: 10, padding: "11px 14px",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontFamily: "Geist, sans-serif", fontSize: 14, fontWeight: 500,
              }}>
                <svg width="16" height="16" viewBox="0 0 814 1000" fill="white">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663.1 0 541.8c0-207.5 133.4-317.1 264.5-317.1 70.4 0 128.9 45.5 173 45.5 42.9 0 109.9-48.1 190.5-48.1C500.1 222.2 620.9 240.3 788.1 340.9zM530.4 220.5c-20.1-29.7-47.1-66.8-97.3-66.8-12.1 0-24.2 2.3-35.7 5.1-7.1 1.8-14.1 3.9-21.3 3.9-1.9 0-3.8-.1-5.7-.3 11.4-57.7 56.4-143.4 122.3-180.5 27.9-15.7 59-26.2 91.9-26.2 2.9 0 5.8.1 8.7.3-1 56.1-23.8 117.3-63 164.5z"/>
                </svg>
                Sign in with Apple
              </button>
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
    </div>
  );
}

// ── Realtime presence (friend locations) ─────────────────────
// No DB table needed — presence is ephemeral, managed by Supabase
// Realtime. Channel is scoped per festival so events don't bleed.

const PRESENCE_CHANNEL_NAME = `presence-${FESTIVAL_CONFIG?.id || "festival"}`;
const PRESENCE_COLORS = [
  "#e85d2e","#7b3d9a","#f59a36","#6f8fb8",
  "#2d7a55","#e85d8f","#34b4e8","#a855f7",
];

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

function sbPresenceJoin({ name, stageId }) {
  if (!_sb) return;
  _presMyId = _myPresId();
  const color = _presColor(_presMyId);
  if (_presCh) { _sb.removeChannel(_presCh); _presCh = null; }
  _presCh = _sb.channel(PRESENCE_CHANNEL_NAME, {
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
        await _presCh.track({ name, stageId, color, ts: Date.now() });
      }
    });
}

async function sbPresenceUpdate(stageId) {
  if (!_presCh || !_presMyId) return;
  const cur = (_presCh.presenceState()[_presMyId] || [])[0];
  if (cur) await _presCh.track({ ...cur, stageId, ts: Date.now() });
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

function sbGetMyPresId() { return _presMyId; }
function sbGetPresSnap()  { return { ..._presSnap }; }

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

Object.assign(window, {
  AccountCard, sbSignIn, sbSignInWithSpotify, sbSignInWithApple, sbSignOut, sbGetUser, sbPush, sbPull, sbOnAuthChange,
  sbGetArtistSaveCounts,
  sbPresenceJoin, sbPresenceUpdate, sbPresenceLeave, sbOnPresenceChange,
  sbGetMyPresId, sbGetPresSnap,
  FriendsCard,
});
