// Spotify / Music + Me screens

const SPOTIFY_CLIENT_ID = "2219c68606c54629a8799f467a996a81";
const SPOTIFY_REDIRECT  = "https://plursky.com/callback";
const SPOTIFY_SCOPES    = "user-top-read user-read-private user-read-email playlist-modify-public playlist-modify-private";

// Genre keywords → EDC stage affinity
const STAGE_GENRES = {
  kinetic:  ["big room", "progressive house", "electro house", "edm", "dutch", "future house", "pop dance"],
  cosmic:   ["melodic bass", "future bass", "breakbeat", "big beat", "melodic", "indie electronic"],
  circuit:  ["techno", "melodic techno", "minimal techno", "industrial techno", "dark techno", "detroit techno"],
  neon:     ["house", "deep house", "afro house", "acid house", "organic house", "microhouse"],
  quantum:  ["trance", "psytrance", "uplifting trance", "vocal trance", "progressive trance", "goa"],
  stereo:   ["tech house", "bass house", "slap house", "uk house", "underground"],
  bionic:   ["indie dance", "nu disco", "french house", "electro", "uk garage", "disco"],
  basspod:  ["dubstep", "riddim", "uk bass", "brostep", "drum and bass", "dnb", "liquid dnb", "bass music"],
  waste:    ["hardstyle", "hardcore", "uptempo", "hard dance", "gabber", "rawstyle"],
};

// ── PKCE helpers ─────────────────────────────────────────────
function _randString(n) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => chars[b % chars.length]).join("");
}
async function _sha256(plain) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}
function _b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// iOS PWA + Android TWA in "standalone" mode have their own localStorage
// silo. OAuth redirects break out to the system browser, which can't see
// the PKCE verifier we just saved → connect fails. Detect that case and
// warn the user before redirecting.
function isStandalonePWA() {
  return (typeof window !== "undefined") &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
     window.navigator.standalone === true);
}
function isMobile() {
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

async function startSpotifyAuth() {
  // Mobile-PWA OAuth gotcha: warn once, and let user opt out of the redirect
  if (isStandalonePWA() && isMobile()) {
    const ack = confirm(
      "Heads up: Spotify login is more reliable in your phone's browser " +
      "than in this installed app.\n\n" +
      "Tap OK to continue here (may fail), or Cancel and open plursky.com " +
      "in Safari/Chrome to connect there first."
    );
    if (!ack) return;
  }

  const verifier  = _randString(128);
  const challenge = _b64url(await _sha256(verifier));
  // Persist verifier in BOTH localStorage and sessionStorage. iOS Safari
  // sometimes loses one across the auth-domain redirect; the other usually
  // survives.
  try { localStorage.setItem("spotify_pkce_verifier", verifier); } catch {}
  try { sessionStorage.setItem("spotify_pkce_verifier", verifier); } catch {}
  const params = new URLSearchParams({
    client_id:             SPOTIFY_CLIENT_ID,
    response_type:         "code",
    redirect_uri:          SPOTIFY_REDIRECT,
    code_challenge_method: "S256",
    code_challenge:        challenge,
    scope:                 SPOTIFY_SCOPES,
  });
  window.location.href = "https://accounts.spotify.com/authorize?" + params;
}

function disconnectSpotify(setState, state) {
  ["spotify_token","spotify_refresh_token","spotify_expires","spotify_pkce_verifier","spotify_profile"]
    .forEach(k => localStorage.removeItem(k));
  try { sessionStorage.removeItem("spotify_pkce_verifier"); } catch {}
  setState({ ...state, spotifyConnected: false, spotifyProfile: null });
}

// Read the cached Spotify profile (set by callback.html on first connect).
// Falls back to fetching /me if missing — runs lazily on demand.
function getSpotifyProfileSync() {
  try {
    const raw = localStorage.getItem("spotify_profile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function ensureSpotifyProfile() {
  const cached = getSpotifyProfileSync();
  if (cached) return cached;
  const token = localStorage.getItem("spotify_token");
  if (!token) return null;
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return null;
    const p = await res.json();
    const prof = {
      id: p.id,
      name: p.display_name || p.id,
      email: p.email || null,
      image: p.images?.[0]?.url || null,
      country: p.country || null,
      product: p.product || null,
    };
    localStorage.setItem("spotify_profile", JSON.stringify(prof));
    return prof;
  } catch { return null; }
}

// #12 Build my playlist — push the user's saved EDC sets into a
// Spotify playlist on their account. Skips artists Spotify can't find.
async function createEdcPlaylist(state) {
  const token   = localStorage.getItem("spotify_token");
  const profile = await ensureSpotifyProfile();
  if (!token || !profile) return { ok: false, reason: "not_connected" };

  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(Boolean);
  if (saved.length === 0) return { ok: false, reason: "empty" };

  // 1) Create empty playlist on user's account
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const plRes = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "My EDC LV 2026 Lineup",
      description: `${saved.length} sets · built with Plursky · ${dateStr}`,
      public: false,
    }),
  });
  if (!plRes.ok) {
    const err = await plRes.json().catch(() => ({}));
    return { ok: false, reason: "create_fail", status: plRes.status, error: err.error };
  }
  const playlist = await plRes.json();

  // 2) Find a top track per artist (parallel, throttled to ~6 in flight)
  const uris = [];
  let missed = 0;
  const search = async (artist) => {
    try {
      const r = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent('artist:"' + artist.name + '"')}&type=track&limit=1`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!r.ok) { missed++; return; }
      const j = await r.json();
      const t = j.tracks?.items?.[0];
      if (t?.uri) uris.push(t.uri);
      else missed++;
    } catch { missed++; }
  };
  // 6-wide concurrency to stay friendly to Spotify rate limits
  for (let i = 0; i < saved.length; i += 6) {
    await Promise.all(saved.slice(i, i + 6).map(search));
  }

  // 3) Add tracks (Spotify caps at 100 URIs per request)
  for (let i = 0; i < uris.length; i += 100) {
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }

  return {
    ok: true,
    added:    uris.length,
    total:    saved.length,
    missed,
    url:      playlist.external_urls?.spotify,
    id:       playlist.id,
  };
}

// Returns full artist objects (with .genres array, deduped across all 3 time ranges,
// each tagged with a `_score` weighting recent listens 3×, 6mo 2×, all-time 1×).
// Returns null on token expiry, [] on error.
async function fetchSpotifyTopArtists() {
  const token = localStorage.getItem("spotify_token");
  if (!token) return [];
  const ranges = [
    { range: "short_term",  weight: 3 },  // last 4 weeks
    { range: "medium_term", weight: 2 },  // last 6 months
    { range: "long_term",   weight: 1 },  // all-time
  ];
  try {
    const responses = await Promise.all(ranges.map(({ range }) =>
      fetch(`https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${range}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ));
    if (responses.some(r => r.status === 401)) {
      ["spotify_token","spotify_expires"].forEach(k => localStorage.removeItem(k));
      return null;
    }
    const datas = await Promise.all(responses.map(r => r.ok ? r.json() : { items: [] }));
    // Dedupe by artist id; score = Σ weight × (51 − rank) across the ranges they appear in.
    const byId = new Map();
    ranges.forEach(({ weight }, i) => {
      (datas[i]?.items || []).forEach((artist, idx) => {
        const score = (51 - (idx + 1)) * weight;
        const cur = byId.get(artist.id);
        if (cur) cur._score += score;
        else byId.set(artist.id, { ...artist, _score: score });
      });
    });
    return Array.from(byId.values()).sort((a, b) => b._score - a._score);
  } catch {
    return [];
  }
}

// Search Spotify for a 30-sec preview URL for a given artist name
async function fetchPreviewUrl(artistName) {
  const token = localStorage.getItem("spotify_token");
  if (!token) return null;
  try {
    const q   = encodeURIComponent(artistName);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const tracks = data.tracks?.items || [];
    const first  = tracks.find(t =>
      t.preview_url &&
      t.artists.some(a => a.name.toLowerCase().includes(artistName.toLowerCase().split(" ")[0]))
    ) || tracks.find(t => t.preview_url);
    return first ? { url: first.preview_url, name: first.name } : null;
  } catch {
    return null;
  }
}

// Match Spotify artist names against the EDC lineup
function matchLineupArtists(spotifyArtists) {
  if (!spotifyArtists?.length) return [];
  const names = spotifyArtists.map(a => a.name.toLowerCase());
  return ARTISTS.filter(a => {
    const ln = a.name.toLowerCase();
    return names.some(n => ln.includes(n) || n.includes(ln));
  });
}

// Count genre frequencies and score each EDC stage
function analyzeGenres(spotifyArtists) {
  const counts = {};
  spotifyArtists.forEach(artist => {
    (artist.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
  });

  const stageScores = {};
  STAGES.forEach(s => { stageScores[s.id] = 0; });
  Object.entries(counts).forEach(([genre, count]) => {
    Object.entries(STAGE_GENRES).forEach(([sid, keywords]) => {
      if (keywords.some(k => genre.includes(k))) {
        stageScores[sid] = (stageScores[sid] || 0) + count;
      }
    });
  });

  const maxScore = Math.max(...Object.values(stageScores), 1);
  const topGenres = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre, count]) => ({ genre, count }));
  const stageRecs = Object.entries(stageScores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, score]) => ({
      stage: STAGES.find(s => s.id === id),
      pct:   Math.round((score / maxScore) * 100),
    }));

  return { topGenres, stageRecs };
}

// EDC artists you'd probably love but aren't already in your Spotify top.
// Scored by stage affinity (your genre profile → stage weights) + tier bonus.
function getDiscoveries(spotifyArtists, matched, savedIds, max = 8) {
  if (!spotifyArtists?.length) return [];
  const matchedIds = new Set((matched || []).map(a => a.id));
  const savedSet   = new Set(savedIds || []);
  // Stage profile: count how many of your top artist genres map to each EDC stage.
  const stageProfile = {};
  STAGES.forEach(s => { stageProfile[s.id] = 0; });
  spotifyArtists.forEach(a => {
    (a.genres || []).forEach(g => {
      Object.entries(STAGE_GENRES).forEach(([sid, kws]) => {
        if (kws.some(k => g.includes(k))) stageProfile[sid] += 1;
      });
    });
  });
  const total = Math.max(1, Object.values(stageProfile).reduce((a, b) => a + b, 0));
  const scored = ARTISTS
    .filter(a => !matchedIds.has(a.id) && !savedSet.has(a.id) && a.tier >= 2)
    .map(a => {
      const stageWeight = (stageProfile[a.stage] || 0) / total;
      const tierBonus   = a.tier * 0.5; // light nudge toward primetime/headliner picks
      return { artist: a, score: stageWeight * 100 + tierBonus };
    });
  // Filter out anyone with zero genre fit AND no headliner status — avoid random fallbacks
  const meaningful = scored.filter(s => s.score > 0.6);
  return meaningful.sort((a, b) => b.score - a.score).slice(0, max).map(s => s.artist);
}

// ── SPOTIFY SCREEN ────────────────────────────────────────────
function SpotifyScreen({ state, setState }) {
  const connected = state.spotifyConnected;
  const [spotifyArtists, setSpotifyArtists] = React.useState(null);
  const [tokenBad,  setTokenBad]  = React.useState(false);
  const [saveFlash, setSaveFlash] = React.useState(false);

  React.useEffect(() => {
    if (!connected) { setSpotifyArtists([]); return; }
    fetchSpotifyTopArtists().then(artists => {
      if (artists === null) { setTokenBad(true); setState({ ...state, spotifyConnected: false }); }
      else setSpotifyArtists(artists);
    });
  }, [connected]);

  const matched  = matchLineupArtists(spotifyArtists);
  const { topGenres, stageRecs } = spotifyArtists?.length
    ? analyzeGenres(spotifyArtists)
    : { topGenres: [], stageRecs: [] };
  const maxCount    = topGenres[0]?.count || 1;
  const discoveries = spotifyArtists?.length
    ? getDiscoveries(spotifyArtists, matched, state.saved, 8)
    : [];
  const fallback    = ARTISTS.filter(a => a.tier === 3).slice(0, 8);
  const recs        = matched.length ? matched : fallback;

  const handleSaveAll = () => {
    const newSaved = [...new Set([...state.saved, ...matched.map(a => a.id)])];
    setState({ ...state, saved: newSaved });
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2200);
  };

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Music</span>} sub="SOUNDTRACK" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 24px" }}>

        {/* ── Connect card ───────────────────────────────── */}
        <div style={{
          borderRadius: 20, padding: 20,
          background: connected ? "#1a3d2b" : "var(--ink)",
          color: "var(--paper)", marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" style={{ position: "absolute", top: 16, right: 16 }}>
            <circle cx="12" cy="12" r="11" fill="#1DB954"/>
            <path d="M6 10 Q12 8 18 11" stroke="#000" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            <path d="M7 13 Q12 11.5 17 14" stroke="#000" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
            <path d="M8 15.8 Q12 14.5 16 16.5" stroke="#000" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
          </svg>

          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: 0.65, marginBottom: 8 }}>
            {connected ? "CONNECTED" : "CONNECT SPOTIFY"}
          </div>
          <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 10, maxWidth: "78%" }}>
            {connected
              ? <>Your lineup is <span style={{ fontStyle: "italic" }}>personalised</span></>
              : <>Build your <span style={{ fontStyle: "italic" }}>perfect</span> EDC night</>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.55, marginBottom: 16, maxWidth: "88%" }}>
            {connected
              ? matched.length
                ? `${matched.length} EDC artists match your Spotify · scanned across recent, 6-month and all-time listens.`
                : spotifyArtists === null ? "Loading your taste…" : "No direct matches — showing genre-based picks below."
              : "Link Spotify to see your EDC matches, genre breakdown, and play 30-sec previews on any artist."}
          </div>

          {tokenBad && (
            <div style={{ fontSize: 11, color: "#f87171", marginBottom: 10, letterSpacing: 0.8 }}>
              Session expired — please reconnect.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {connected && matched.length > 0 && (
              <button onClick={handleSaveAll} style={{
                background: saveFlash ? "#2d7a55" : "#1DB954",
                color: "#fff", border: "none",
                borderRadius: 999, padding: "10px 16px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
                transition: "background 0.3s",
              }}>
                {saveFlash ? `✓ SAVED ${matched.length} ARTISTS` : `SAVE ALL ${matched.length} ARTISTS`}
              </button>
            )}
            {connected && state.saved.length > 0 && (
              <BuildPlaylistButton state={state} />
            )}
            <button
              onClick={() => connected ? disconnectSpotify(setState, state) : startSpotifyAuth()}
              style={{
                background: "rgba(247,237,224,0.12)", color: "var(--paper)",
                border: "1px solid rgba(247,237,224,0.28)",
                borderRadius: 999, padding: "10px 16px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 500,
              }}>
              {connected ? "DISCONNECT" : "CONNECT ACCOUNT"}
            </button>
          </div>
        </div>

        {/* ── Genre DNA chart ────────────────────────────── */}
        {connected && topGenres.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div className="serif" style={{ fontSize: 22, letterSpacing: -0.3, marginBottom: 3 }}>Your music DNA</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 14 }}>
              FROM YOUR SPOTIFY TOP 50 ARTISTS
            </div>
            {topGenres.map(({ genre, count }) => {
              const pct = Math.round((count / maxCount) * 100);
              // Find matching stage color
              let barColor = "var(--ember)";
              for (const [sid, keywords] of Object.entries(STAGE_GENRES)) {
                if (keywords.some(k => genre.includes(k))) {
                  barColor = STAGES.find(s => s.id === sid)?.color || barColor;
                  break;
                }
              }
              return (
                <div key={genre} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, textTransform: "capitalize", color: "var(--ink)" }}>{genre}</span>
                    <span className="mono" style={{ fontSize: 9.5, letterSpacing: 0.8, color: "var(--muted)" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: "var(--line)", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: barColor, borderRadius: 5,
                      transition: "width 0.7s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Best stages for you ───────────────────────── */}
        {connected && stageRecs.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div className="serif" style={{ fontSize: 22, letterSpacing: -0.3, marginBottom: 3 }}>Best stages for you</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 14 }}>
              BASED ON YOUR GENRE TASTE
            </div>
            {stageRecs.map(({ stage, pct }) => (
              <div key={stage.id} style={{
                padding: "12px 14px", borderRadius: 12, marginBottom: 8,
                background: "var(--paper-2)",
                borderLeft: `3px solid ${stage.color}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>{stage.name}</div>
                  <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: stage.color, fontWeight: 700 }}>
                    {pct}% MATCH
                  </div>
                </div>
                <div style={{ height: 3, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: stage.color, borderRadius: 3 }} />
                </div>
                <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)" }}>
                  {stage.desc.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Artist picks ──────────────────────────────── */}
        <div className="serif" style={{ fontSize: 22, letterSpacing: -0.3, marginBottom: 3 }}>
          {connected && matched.length ? "Your EDC matches" : "Top picks for EDC"}
        </div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 14 }}>
          {connected && matched.length ? "FROM YOUR SPOTIFY · TAP TO VIEW" : "HEADLINERS · TAP + TO SAVE"}
        </div>

        {recs.map(a => {
          const stg   = STAGES.find(s => s.id === a.stage);
          const isSaved = state.saved.includes(a.id);
          return (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0", borderBottom: "1px solid var(--line)",
            }}>
              <ArtistSwatch artist={a} size={48} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                   onClick={() => setState({ ...state, tab: "home", artist: a.id })}>
                <div className="serif" style={{ fontSize: 18, lineHeight: 1.1 }}>{a.name}</div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>
                  {stg.name} · DAY {a.day} · {a.start}
                </div>
              </div>
              <button onClick={() => toggleSave(state, setState, a.id)} style={{
                width: 34, height: 34, borderRadius: 34,
                background: isSaved ? "var(--ember)" : "transparent",
                color: isSaved ? "#fff" : "var(--ink)",
                border: isSaved ? "none" : "1px solid var(--line-2)",
                cursor: "pointer", fontSize: 18, fontWeight: 300,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{isSaved ? "✓" : "+"}</button>
            </div>
          );
        })}

        {/* ── Discoveries: EDC artists you don't listen to yet, but should ── */}
        {connected && discoveries.length > 0 && (
          <>
            <div className="serif" style={{ fontSize: 22, letterSpacing: -0.3, marginTop: 24, marginBottom: 3 }}>
              Recommended for you
            </div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 14 }}>
              EDC ARTISTS THAT MATCH YOUR TASTE · NOT IN YOUR TOP YET
            </div>
            {discoveries.map(a => {
              const stg     = STAGES.find(s => s.id === a.stage);
              const isSaved = state.saved.includes(a.id);
              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", borderBottom: "1px solid var(--line)",
                }}>
                  <ArtistSwatch artist={a} size={48} />
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                       onClick={() => setState({ ...state, tab: "home", artist: a.id })}>
                    <div className="serif" style={{ fontSize: 18, lineHeight: 1.1 }}>{a.name}</div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>
                      {stg.name} · DAY {a.day} · {a.start}
                    </div>
                  </div>
                  <button onClick={() => toggleSave(state, setState, a.id)} style={{
                    width: 34, height: 34, borderRadius: 34,
                    background: isSaved ? "var(--ember)" : "transparent",
                    color: isSaved ? "#fff" : "var(--ink)",
                    border: isSaved ? "none" : "1px solid var(--line-2)",
                    cursor: "pointer", fontSize: 18, fontWeight: 300,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{isSaved ? "✓" : "+"}</button>
                </div>
              );
            })}
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}

// ── ME SCREEN ─────────────────────────────────────────────────
// ── Safety & Wellness — harm-reduction surface ────────────────
const SAFETY_LINKS = [
  {
    id: "ground",
    title: "Ground Control",
    sub: "Free water · cool down · friendly faces. Look for the high-vis vests.",
    color: "var(--horizon)",
    icon: "shield",
    href: "https://insomniac.com/festival/edc-las-vegas/2026/info/health-safety/",
  },
  {
    id: "amnesty",
    title: "Amnesty Boxes",
    sub: "Drop unwanted substances at any entrance. No questions, no consequences.",
    color: "var(--ember)",
    icon: "amnesty",
    href: "https://insomniac.com/festival/edc-las-vegas/2026/info/health-safety/",
  },
  {
    id: "dancesafe",
    title: "DanceSafe",
    sub: "Drug-checking, harm-reduction info, peer support. Independent nonprofit.",
    color: "#34d399",
    icon: "info",
    href: "https://dancesafe.org",
  },
  {
    id: "consent",
    title: "Consent Reporting",
    sub: "Report anonymously. Insomniac Cares + 24/7 confidential line.",
    color: "var(--ink)",
    icon: "consent",
    href: "https://insomniac.com/cares",
  },
  {
    id: "medical",
    title: "Medical · 24/7",
    sub: "3 medic tents on-site · roamers in the crowd. Tap → map.",
    color: "#f87171",
    icon: "med",
    onClick: (state, setState) => setState({ ...state, tab: "map" }),
  },
];

function SafetyIcon({ kind, color }) {
  const stroke = color || "currentColor";
  if (kind === "shield") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 L20 6 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V6 Z"/><path d="M9 12 L11 14 L15 10"/></svg>;
  if (kind === "amnesty") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="1.5"/><path d="M8 8 V6 a4 4 0 0 1 8 0 V8"/><path d="M9 14 H15"/></svg>;
  if (kind === "info") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11 V16"/><circle cx="12" cy="8" r="0.7" fill={stroke}/></svg>;
  if (kind === "consent") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12 a9 9 0 1 1-3-6.7"/><path d="M21 4 V10 H15"/></svg>;
  if (kind === "med") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M12 10 V16"/><path d="M9 13 H15"/></svg>;
  return null;
}

function SafetyCards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {SAFETY_LINKS.map(item => {
        const onClick = item.href
          ? () => window.open(item.href, "_blank", "noopener")
          : () => item.onClick?.();
        return (
          <button key={item.id} onClick={onClick} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "12px 14px", borderRadius: 12,
            background: "var(--paper)", border: "1px solid var(--line)",
            borderLeft: `3px solid ${item.color}`,
            cursor: "pointer", textAlign: "left", color: "var(--ink)",
            fontFamily: "inherit",
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: `${item.color}1f`, color: item.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <SafetyIcon kind={item.icon} color={item.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1.1 }}>{item.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{item.sub}</div>
            </div>
            {item.href && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 4 }}>
                <path d="M7 17 L17 7"/><path d="M9 7 H17 V15"/>
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MeScreen({ state, setState }) {
  const friends = [
    { name: "Remi", color: "#e85d2e", at: "Bionic Jungle",   dist: "Here" },
    { name: "Juno", color: "#7b3d9a", at: "Quantum Valley",  dist: "4 min walk" },
    { name: "Kai",  color: "#f59a36", at: "Stereo Bloom",    dist: "8 min walk" },
    { name: "Sage", color: "#6f8fb8", at: "Circuit Grounds", dist: "Approaching" },
  ];

  // Build identity from Spotify profile when available, else fall back to demo
  const [profile, setProfile] = React.useState(getSpotifyProfileSync);
  React.useEffect(() => {
    if (state.spotifyConnected && !profile) {
      ensureSpotifyProfile().then(setProfile);
    }
  }, [state.spotifyConnected]);

  const displayName = profile?.name || "Ava Torres";
  const initial = (displayName.match(/[A-Za-z0-9]/) || ["A"])[0].toUpperCase();
  const subline = profile
    ? `${profile.product === "premium" ? "PREMIUM" : "FREE"} · ${profile.country || "—"} · 3-DAY PASS`
    : "3-DAY PASS · GA+ · WRISTBAND #EDC-9122";

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Me</span>} sub="EDC · LAS VEGAS 2026" tight />
      </div>
      <ScrollBody style={{ padding: "10px 20px 24px" }}>
        {/* Profile */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: 16,
          background: "var(--paper-2)", borderRadius: 16, marginBottom: 18,
        }}>
          {profile?.image ? (
            <img src={profile.image} alt="" style={{
              width: 60, height: 60, borderRadius: 60, flexShrink: 0,
              objectFit: "cover", border: "2px solid var(--ember)",
            }}/>
          ) : (
            <div style={{
              width: 60, height: 60, borderRadius: 60,
              background: "linear-gradient(135deg, var(--ember), var(--horizon))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 26, color: "#fff",
              flexShrink: 0,
            }}>{initial}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayName}
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
              {subline}
            </div>
            {profile && (
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "#1DB954", marginTop: 4, fontWeight: 700 }}>
                ✓ SPOTIFY LINKED
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          {[{ n: state.saved.length, l: "SAVED" }, { n: "3.2", l: "KM TODAY" }, { n: "7", l: "STAMPS" }].map(s => (
            <div key={s.l} style={{
              padding: 14, borderRadius: 12, textAlign: "center",
              background: "var(--paper)", border: "1px solid var(--line)",
            }}>
              <div className="serif" style={{ fontSize: 28, lineHeight: 1 }}>{s.n}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Friends */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="serif" style={{ fontSize: 22 }}>Friends at EDC</div>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>4 LIVE</span>
        </div>
        {friends.map(f => (
          <div key={f.name} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 12, marginBottom: 8,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 38, background: f.color,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 18, position: "relative",
            }}>{f.name[0]}
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)", border: "2px solid var(--paper)",
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1 }}>{f.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3, textTransform: "uppercase" }}>
                {f.at} · {f.dist}
              </div>
            </div>
            <button onClick={() => setState({ ...state, tab: "map" })} style={{
              background: "transparent", border: "1px solid var(--line-2)",
              borderRadius: 999, padding: "6px 10px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
            }}>LOCATE</button>
          </div>
        ))}

        {/* Safety & Wellness — harm-reduction one tap away */}
        <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 3 }}>
          Safety & <span style={{ fontStyle: "italic" }}>care</span>
        </div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 12 }}>
          ON-SITE TEAMS · NO QUESTIONS ASKED
        </div>
        <SafetyCards />

        {/* Memories */}
        <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 10 }}>Memories</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ARTISTS.filter(a => a.tier === 3).slice(0, 6).map(a => (
            <div key={a.id} style={{
              aspectRatio: "1/1", borderRadius: 10, background: a.img,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.5))" }}/>
              <div style={{ position: "absolute", bottom: 5, left: 6, right: 6, color: "#fff" }} className="mono">
                <span style={{ fontSize: 8, letterSpacing: 1, opacity: 0.9 }}>{a.start}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 20 }} />
      </ScrollBody>
    </Screen>
  );
}

function BuildPlaylistButton({ state }) {
  const [status, setStatus] = React.useState("idle"); // idle | working | done | err
  const [result, setResult] = React.useState(null);

  const onClick = async () => {
    if (status === "working") return;
    setStatus("working");
    const r = await createEdcPlaylist(state);
    setResult(r);
    if (r.ok) {
      setStatus("done");
      // Open the playlist in Spotify after a short delay
      if (r.url) setTimeout(() => window.open(r.url, "_blank", "noopener"), 800);
      setTimeout(() => setStatus("idle"), 4000);
    } else {
      setStatus("err");
      setTimeout(() => setStatus("idle"), 3500);
    }
  };

  let label, bg = "rgba(29,185,84,0.14)", color = "#1DB954", border = "1px solid #1DB954";
  if (status === "working") label = "BUILDING…";
  else if (status === "done") {
    label = `✓ ADDED ${result?.added}/${result?.total}`;
    bg = "#1DB954"; color = "#000"; border = "none";
  } else if (status === "err") {
    label = result?.reason === "create_fail"
      ? `✕ FAILED · ${result?.status || "?"}`
      : "✕ TRY AGAIN";
    bg = "rgba(248,113,113,0.18)"; color = "#fecaca"; border = "1px solid #f87171";
  } else {
    label = "BUILD MY PLAYLIST";
  }

  return (
    <button onClick={onClick} disabled={status === "working"} style={{
      background: bg, color, border,
      borderRadius: 999, padding: "10px 16px",
      cursor: status === "working" ? "wait" : "pointer",
      fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
      transition: "all .2s",
    }}>{label}</button>
  );
}

Object.assign(window, {
  SpotifyScreen, MeScreen, fetchPreviewUrl,
  ensureSpotifyProfile, getSpotifyProfileSync, createEdcPlaylist,
});
