// Spotify / Music + Me (profile/friends) screens

const SPOTIFY_CLIENT_ID  = "2219c68606c54629a8799f467a996a81";
const SPOTIFY_REDIRECT   = "https://plursky.com/callback";
const SPOTIFY_SCOPES     = "user-top-read user-read-private";

// ── PKCE helpers ──────────────────────────────────────────────
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

async function startSpotifyAuth() {
  const verifier  = _randString(128);
  const challenge = _b64url(await _sha256(verifier));
  localStorage.setItem("spotify_pkce_verifier", verifier);
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
  ["spotify_token","spotify_refresh_token","spotify_expires","spotify_pkce_verifier"]
    .forEach(k => localStorage.removeItem(k));
  setState({ ...state, spotifyConnected: false });
}

async function fetchSpotifyTopArtists() {
  const token = localStorage.getItem("spotify_token");
  if (!token) return [];
  try {
    const res = await fetch(
      "https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 401) {
      // Token expired — clear it
      ["spotify_token","spotify_expires"].forEach(k => localStorage.removeItem(k));
      return null; // signals expiry
    }
    const data = await res.json();
    return (data.items || []).map(a => a.name.toLowerCase());
  } catch {
    return [];
  }
}

function matchLineupArtists(topNames) {
  if (!topNames || !topNames.length) return [];
  return ARTISTS.filter(a => {
    const ln = a.name.toLowerCase();
    return topNames.some(n => ln.includes(n) || n.includes(ln));
  });
}

// ── SPOTIFY SCREEN ────────────────────────────────────────────
function SpotifyScreen({ state, setState }) {
  const connected = state.spotifyConnected;
  const [topNames,  setTopNames]  = React.useState(null);  // null=loading, []=[]=no data
  const [tokenBad,  setTokenBad]  = React.useState(false);

  React.useEffect(() => {
    if (!connected) { setTopNames([]); return; }
    fetchSpotifyTopArtists().then(names => {
      if (names === null) { setTokenBad(true); setState({ ...state, spotifyConnected: false }); }
      else setTopNames(names);
    });
  }, [connected]);

  const matched  = connected && topNames ? matchLineupArtists(topNames) : [];
  const fallback = ARTISTS.filter(a => a.tier === 3).slice(0, 8);
  const recs     = matched.length ? matched : fallback;

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Music</span>} sub="SOUNDTRACK" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 24px" }}>
        {/* Spotify connect card */}
        <div style={{
          borderRadius: 20, padding: 20,
          background: connected ? "#1a3d2b" : "var(--ink)",
          color: "var(--paper)",
          marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          {/* Spotify logo */}
          <svg width="36" height="36" viewBox="0 0 24 24" style={{ position: "absolute", top: 16, right: 16, opacity: 0.9 }}>
            <circle cx="12" cy="12" r="11" fill="#1DB954" />
            <path d="M6 10 Q12 8 18 11" stroke="#000" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <path d="M7 13 Q12 11.5 17 14" stroke="#000" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <path d="M8 15.8 Q12 14.5 16 16.5" stroke="#000" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>

          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: 0.7, marginBottom: 8 }}>
            {connected ? "CONNECTED" : "CONNECT SPOTIFY"}
          </div>
          <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 12, maxWidth: "70%" }}>
            {connected
              ? <>Your lineup is <span style={{ fontStyle: "italic" }}>personalised</span></>
              : <>We'll build your <span style={{ fontStyle: "italic" }}>perfect</span> lineup</>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.45, marginBottom: 16, maxWidth: "90%" }}>
            {connected
              ? matched.length
                ? `${matched.length} artists from your Spotify top 50 are playing EDC. We've highlighted them below.`
                : "No direct matches found — showing headliners you might love."
              : "Link your Spotify and we'll surface EDC sets based on your top artists and recent plays."}
          </div>

          {tokenBad && (
            <div style={{ fontSize: 11, color: "#f87171", marginBottom: 10, letterSpacing: 0.8 }}>
              Session expired — please reconnect.
            </div>
          )}

          <button
            onClick={() => connected ? disconnectSpotify(setState, state) : startSpotifyAuth()}
            style={{
              background: "var(--paper)", color: "var(--ink)", border: "none",
              borderRadius: 999, padding: "11px 18px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 500,
            }}>
            {connected ? "DISCONNECT" : "CONNECT ACCOUNT"}
          </button>
        </div>

        {/* Recommendations */}
        <div className="serif" style={{ fontSize: 24, letterSpacing: -0.3, marginBottom: 2 }}>
          {connected && matched.length ? "From your Spotify top artists" : "Top picks for EDC"}
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginBottom: 14 }}>
          TAP TO VIEW · + TO SAVE TO LINEUP
        </div>

        {!connected && topNames === null && (
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>
            LOADING…
          </div>
        )}

        {recs.map(a => {
          const stage = STAGES.find(s => s.id === a.stage);
          const saved = state.saved.includes(a.id);
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
                  {stage.name} · DAY {a.day} · {a.start}
                </div>
              </div>
              <button onClick={() => toggleSave(state, setState, a.id)} style={{
                width: 34, height: 34, borderRadius: 34,
                background: saved ? "var(--ember)" : "transparent",
                color: saved ? "#fff" : "var(--ink)",
                border: saved ? "none" : "1px solid var(--line-2)",
                cursor: "pointer", fontSize: 18, fontWeight: 300,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{saved ? "✓" : "+"}</button>
            </div>
          );
        })}
      </ScrollBody>
    </Screen>
  );
}

// ── ME SCREEN ─────────────────────────────────────────────────
function MeScreen({ state, setState }) {
  const friends = [
    { name: "Remi",   color: "#e85d2e", at: "Bionic Jungle",   dist: "Here" },
    { name: "Juno",   color: "#7b3d9a", at: "Quantum Valley",  dist: "4 min walk" },
    { name: "Kai",    color: "#f59a36", at: "Stereo Bloom",    dist: "8 min walk" },
    { name: "Sage",   color: "#6f8fb8", at: "Circuit Grounds", dist: "Approaching" },
  ];
  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Me</span>} sub="EDC · LAS VEGAS 2026" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 24px" }}>
        {/* Profile card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "16px",
          background: "var(--paper-2)",
          borderRadius: 16,
          marginBottom: 18,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 60,
            background: "linear-gradient(135deg, var(--ember), var(--horizon))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Instrument Serif, serif", fontSize: 26, color: "#fff",
          }}>A</div>
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>Ava Torres</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
              3-DAY PASS · GA+ · WRISTBAND #EDC-9122
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { n: state.saved.length, l: "SAVED" },
            { n: "3.2",              l: "KM TODAY" },
            { n: "7",                l: "STAMPS" },
          ].map(s => (
            <div key={s.l} style={{
              padding: 14, borderRadius: 12,
              background: "var(--paper)",
              border: "1px solid var(--line)",
              textAlign: "center",
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
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            marginBottom: 8,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 38,
              background: f.color, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 18,
              position: "relative",
            }}>{f.name[0]}
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)",
                border: "2px solid var(--paper)",
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

        {/* Memories */}
        <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 10 }}>Memories</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ARTISTS.filter(a => a.tier === 3).slice(0, 6).map(a => (
            <div key={a.id} style={{
              aspectRatio: "1/1", borderRadius: 10,
              background: a.img,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5))",
              }}/>
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

Object.assign(window, { SpotifyScreen, MeScreen });
