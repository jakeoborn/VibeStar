// Spotify / Music + Me screens

const SPOTIFY_CLIENT_ID = "2219c68606c54629a8799f467a996a81";
const SPOTIFY_REDIRECT  = "https://plursky.com/callback";
const SPOTIFY_SCOPES    = "user-top-read user-read-recently-played user-library-read user-read-private user-read-email playlist-read-private playlist-modify-public playlist-modify-private";

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
// crypto.getRandomValues is available everywhere we care about; if not we
// fall back to Math.random (only called for the verifier, which is opaque).
function _randString(n) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    for (let i = 0; i < n; i++) out += chars[buf[i] % chars.length];
  } else {
    for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// Pure-JS SHA-256 — drop-in fallback for environments where
// crypto.subtle.digest is missing (Safari over HTTP, some installed-PWA
// webviews, etc.). Returns an ArrayBuffer of 32 bytes.
const _SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
function _sha256js(str) {
  const utf8 = new TextEncoder().encode(str);
  const len = utf8.length;
  const paddedLen = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(utf8);
  buf[len] = 0x80;
  const bitLen = len * 8;
  buf[paddedLen - 4] = (bitLen >>> 24) & 0xff;
  buf[paddedLen - 3] = (bitLen >>> 16) & 0xff;
  buf[paddedLen - 2] = (bitLen >>> 8) & 0xff;
  buf[paddedLen - 1] = bitLen & 0xff;
  const H = new Uint32Array([
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = (buf[i+t*4]<<24) | (buf[i+t*4+1]<<16) | (buf[i+t*4+2]<<8) | buf[i+t*4+3];
    }
    for (let t = 16; t < 64; t++) {
      const x = W[t-15], y = W[t-2];
      const s0 = ((x>>>7)|(x<<25)) ^ ((x>>>18)|(x<<14)) ^ (x>>>3);
      const s1 = ((y>>>17)|(y<<15)) ^ ((y>>>19)|(y<<13)) ^ (y>>>10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
      const ch = (e & f) ^ ((~e) & g);
      const T1 = (h + S1 + ch + _SHA256_K[t] + W[t]) >>> 0;
      const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + T1) >>> 0;
      d = c; c = b; b = a; a = (T1 + T2) >>> 0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4]   = (H[i] >>> 24) & 0xff;
    out[i*4+1] = (H[i] >>> 16) & 0xff;
    out[i*4+2] = (H[i] >>> 8)  & 0xff;
    out[i*4+3] =  H[i]         & 0xff;
  }
  return out.buffer;
}

async function _sha256(plain) {
  // Prefer WebCrypto when available; fall back to pure JS otherwise.
  // Some Safari/PWA contexts expose `crypto` but `crypto.subtle` is undefined.
  if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
    try {
      return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
    } catch {
      // fall through to JS fallback
    }
  }
  return _sha256js(plain);
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

// Build the Spotify authorize URL + persist the PKCE verifier. We pre-warm
// this on module load so the eventual click handler can navigate
// synchronously — iOS Safari silently blocks redirects that happen *after*
// `await` chains in click handlers (the user-gesture token expires).
async function _buildSpotifyAuthUrl() {
  const verifier  = _randString(128);
  const challenge = _b64url(await _sha256(verifier));
  // Persist in BOTH stores. iOS Safari occasionally drops one across the
  // auth-domain redirect; the other usually survives.
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
  return "https://accounts.spotify.com/authorize?" + params;
}

// Cached URL ready by the time the user actually taps CONNECT.
let _SPOTIFY_AUTH_URL = null;
let _SPOTIFY_AUTH_ERR = null;
function _prewarmSpotifyAuth() {
  _SPOTIFY_AUTH_URL = null;
  _SPOTIFY_AUTH_ERR = null;
  return _buildSpotifyAuthUrl()
    .then(u => { _SPOTIFY_AUTH_URL = u; })
    .catch(e => { _SPOTIFY_AUTH_ERR = e; });
}
// Kick off immediately at module load.
if (typeof window !== "undefined") _prewarmSpotifyAuth();

// Tiny visible toast — used when something silently goes wrong on iOS.
// We DOM-inject so it works even if React state is in a bad place.
function _spotifyDebugToast(text, color) {
  try {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `
      position:fixed;left:50%;bottom:80px;transform:translateX(-50%);
      background:${color || "#1a120d"};color:#f7ede0;
      padding:10px 14px;border-radius:10px;
      font:12px/1.4 'Geist Mono',monospace;letter-spacing:.4px;
      z-index:99999;max-width:88%;text-align:center;
      box-shadow:0 8px 24px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  } catch {}
}

function startSpotifyAuth() {
  // Mobile-PWA OAuth gotcha: warn once, and let user opt out of the redirect.
  if (isStandalonePWA() && isMobile()) {
    const ack = confirm(
      "Heads up: Spotify login is more reliable in your phone's browser " +
      "than in this installed app.\n\n" +
      "Tap OK to continue here (may fail), or Cancel and open plursky.com " +
      "in Safari/Chrome to connect there first."
    );
    if (!ack) return;
  }

  // Fast path: URL is already pre-computed → navigate synchronously inside
  // the user-gesture handler. This is what iOS Safari needs.
  if (_SPOTIFY_AUTH_URL) {
    window.location.assign(_SPOTIFY_AUTH_URL);
    return;
  }

  // The pre-warm failed earlier — surface it so we don't fail silently.
  if (_SPOTIFY_AUTH_ERR) {
    _spotifyDebugToast(
      "Spotify init failed: " + (_SPOTIFY_AUTH_ERR.message || _SPOTIFY_AUTH_ERR),
      "#9b1c1c"
    );
    _prewarmSpotifyAuth(); // try again in the background
    return;
  }

  // Pre-warm hasn't resolved yet (unusual — sha256 is sub-millisecond).
  // Compute now and navigate when ready; if it never finishes we toast.
  _spotifyDebugToast("Preparing Spotify…", "#1a120d");
  _buildSpotifyAuthUrl()
    .then(url => { window.location.assign(url); })
    .catch(err => {
      _spotifyDebugToast(
        "Spotify connect failed: " + (err && err.message ? err.message : "unknown"),
        "#9b1c1c"
      );
    });
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
      name: `My ${FESTIVAL_CONFIG.shortName} Lineup`,
      description: `${saved.length} sets · built with Plursky · ${dateStr}`,
      public: false,
    }),
  });
  if (!plRes.ok) {
    const err = await plRes.json().catch(() => ({}));
    // 401/403 usually means the stored token was issued before we added a
    // scope (e.g. playlist-modify-private). Clear it so the user reconnects.
    if (plRes.status === 401 || plRes.status === 403) {
      ["spotify_token","spotify_expires"].forEach(k => localStorage.removeItem(k));
      return { ok: false, reason: "reconnect", status: plRes.status, message: err.error?.message || "Reconnect required" };
    }
    return { ok: false, reason: "create_fail", status: plRes.status, message: err.error?.message || "" };
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
    const top = Array.from(byId.values()).sort((a, b) => b._score - a._score);

    // Also pull recently-played + Liked Songs so artists you've played even
    // once (but aren't in your top 50) get matched against the lineup.
    // Charlotte de Witte / one-off plays were invisible before this.
    const seen = new Set(top.map(a => a.id));
    const extras = [];
    const pull = async (url, sourceTag, baseScore) => {
      try {
        const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (!r.ok) return;  // silently degrade if scope missing on legacy tokens
        const d = await r.json();
        (d.items || []).forEach(item => {
          (item.track?.artists || []).forEach(a => {
            if (!a?.id || seen.has(a.id)) return;
            seen.add(a.id);
            extras.push({ id: a.id, name: a.name, genres: [], _score: baseScore, _source: sourceTag });
          });
        });
      } catch {}
    };
    await Promise.all([
      pull("https://api.spotify.com/v1/me/player/recently-played?limit=50", "recent", 60),
      pull("https://api.spotify.com/v1/me/tracks?limit=50", "saved", 40),
    ]);

    // Walk OWNED playlists — any track-level artist who's playing EDC counts
    // as a match too (e.g. one Charlotte de Witte track buried in a playlist
    // would have been invisible without this).
    try {
      const profile = await ensureSpotifyProfile();
      const plRes = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: { Authorization: "Bearer " + token }
      });
      if (plRes.ok && profile) {
        const plData = await plRes.json();
        const owned = (plData.items || [])
          .filter(p => p?.owner?.id === profile.id)
          .slice(0, 30);
        const fetchPl = async (pl) => {
          try {
            const tr = await fetch(
              `https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=100&fields=items(track(artists(id,name)))`,
              { headers: { Authorization: "Bearer " + token } }
            );
            if (!tr.ok) return;
            const td = await tr.json();
            (td.items || []).forEach(item => {
              (item.track?.artists || []).forEach(a => {
                if (!a?.id || seen.has(a.id)) return;
                seen.add(a.id);
                extras.push({ id: a.id, name: a.name, genres: [], _score: 25, _source: "playlist" });
              });
            });
          } catch {}
        };
        // 6-wide concurrency keeps us under Spotify's rate limit
        for (let i = 0; i < owned.length; i += 6) {
          await Promise.all(owned.slice(i, i + 6).map(fetchPl));
        }
      }
    } catch {}

    return [...top, ...extras];
  } catch {
    return [];
  }
}

// Search Spotify for a 30-sec preview URL for a given artist name.
// Spotify deprecated `preview_url` for new apps in late 2024 — most tracks
// now return null. Falls back to iTunes Search (free, no auth, CORS-OK)
// which still serves 30s previews for ~95% of mainstream artists.
async function fetchPreviewUrl(artistName) {
  const token = localStorage.getItem("spotify_token");
  const firstWord = artistName.toLowerCase().split(" ")[0];

  if (token) {
    try {
      const q   = encodeURIComponent(artistName);
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data   = await res.json();
        const tracks = data.tracks?.items || [];
        const first  = tracks.find(t =>
          t.preview_url &&
          t.artists.some(a => a.name.toLowerCase().includes(firstWord))
        ) || tracks.find(t => t.preview_url);
        if (first) return { url: first.preview_url, name: first.name, source: "spotify" };
      }
    } catch {}
  }

  // iTunes fallback — works without auth, returns 30s m4a previews
  try {
    const q = encodeURIComponent(artistName);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10`);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    const first = results.find(t =>
      t.previewUrl && t.artistName?.toLowerCase().includes(firstWord)
    ) || results.find(t => t.previewUrl);
    return first ? { url: first.previewUrl, name: first.trackName, source: "itunes" } : null;
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
                ? `${matched.length} EDC artists match your Spotify · scanned across top, recent, liked songs and your playlists.`
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

// Essentials checklist — persisted to localStorage so users can tick items
// off as they pack at home and the state is still there at the venue.
const PACK_ITEMS = [
  { id: "hydra",  label: "Hydration pack / Camelbak", emoji: "💧" },
  { id: "ear",    label: "Earplugs", emoji: "🎧" },
  { id: "sun",    label: "Sunscreen + lip balm", emoji: "☀️" },
  { id: "boots",  label: "Comfortable boots / sneakers", emoji: "👟" },
  { id: "jacket", label: "Light jacket (60°F at sunrise)", emoji: "🧥" },
  { id: "power",  label: "Phone charger / battery pack", emoji: "🔋" },
  { id: "cash",   label: "Cash + ID + bank card", emoji: "💳" },
  { id: "bandana",label: "Bandana / dust mask", emoji: "🌪️" },
  { id: "kandi",  label: "Kandi + totem (foldable)", emoji: "🌈" },
  { id: "snacks", label: "Snacks + gum", emoji: "🍭" },
];

function PackListCard() {
  const [checked, setChecked] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("pack_list_v1") || "{}"); }
    catch { return {}; }
  });
  const toggle = (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try { localStorage.setItem("pack_list_v1", JSON.stringify(next)); } catch {}
  };
  const done = PACK_ITEMS.filter(i => checked[i.id]).length;
  return (
    <div style={{ marginTop: 20, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="serif" style={{ fontSize: 22 }}>Pack list</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: done === PACK_ITEMS.length ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
          {done}/{PACK_ITEMS.length} {done === PACK_ITEMS.length && "✓"}
        </div>
      </div>
      {PACK_ITEMS.map((it, i) => (
        <button key={it.id} onClick={() => toggle(it.id)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "11px 4px", background: "transparent",
          border: "none", borderBottom: i < PACK_ITEMS.length - 1 ? "1px solid var(--line)" : "none",
          cursor: "pointer", textAlign: "left",
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: 6,
            background: checked[it.id] ? "var(--ember)" : "transparent",
            border: `1.5px solid ${checked[it.id] ? "var(--ember)" : "var(--line-2)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 12, fontWeight: 700,
            flexShrink: 0, transition: "all .15s",
          }}>{checked[it.id] ? "✓" : ""}</span>
          <span style={{ fontSize: 15, opacity: 0.7, width: 22, textAlign: "center" }}>{it.emoji}</span>
          <span style={{
            flex: 1, fontFamily: "Geist, sans-serif", fontSize: 14,
            color: checked[it.id] ? "var(--muted)" : "var(--ink)",
            textDecoration: checked[it.id] ? "line-through" : "none",
            transition: "color .15s",
          }}>{it.label}</span>
        </button>
      ))}
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
        <TopBar title={<span>Me</span>} sub={FESTIVAL_CONFIG.shortName.toUpperCase()} tight />
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

        {/* Reminders / push notifications */}
        <NotificationsCard state={state} />

        {/* Battery saver — dim screen + freeze animations + slow GPS */}
        <BatterySaverCard />

        {/* Pack list — essentials checklist for the festival */}
        <PackListCard />

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
    // If we surfaced a reconnect prompt last run, clicking restarts auth.
    if (status === "err" && result?.reason === "reconnect") {
      startSpotifyAuth();
      return;
    }
    setStatus("working");
    const r = await createEdcPlaylist(state);
    setResult(r);
    if (r.ok) {
      setStatus("done");
      if (r.url) setTimeout(() => window.open(r.url, "_blank", "noopener"), 800);
      setTimeout(() => setStatus("idle"), 4000);
    } else {
      setStatus("err");
      // Reconnect prompts stay sticky (no auto-reset) so user can tap them.
      if (r.reason !== "reconnect") setTimeout(() => setStatus("idle"), 4500);
    }
  };

  let label, bg = "rgba(29,185,84,0.14)", color = "#1DB954", border = "1px solid #1DB954";
  if (status === "working") label = "BUILDING…";
  else if (status === "done") {
    label = `✓ ADDED ${result?.added}/${result?.total}`;
    bg = "#1DB954"; color = "#000"; border = "none";
  } else if (status === "err") {
    if (result?.reason === "reconnect") {
      label = "↻ RECONNECT SPOTIFY";
    } else if (result?.reason === "empty") {
      label = "SAVE SETS FIRST";
    } else if (result?.reason === "create_fail") {
      const msg = (result?.message || "").slice(0, 22);
      label = msg ? `✕ ${result?.status} · ${msg}` : `✕ FAILED · ${result?.status || "?"}`;
    } else if (result?.reason === "not_connected") {
      label = "↻ RECONNECT SPOTIFY";
    } else {
      label = "✕ TRY AGAIN";
    }
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
  startSpotifyAuth, PackListCard,
});
