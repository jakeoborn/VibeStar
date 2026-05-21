// Spotify / Music + Me screens

// ── Apple Music ───────────────────────────────────────────────
// Requires an Apple Developer account + MusicKit identifier.
// 1. enroll.developer.apple.com → create a MusicKit key
// 2. Sign a developer JWT (6-month expiry) — paste below.
// Guide: https://developer.apple.com/documentation/musickit
const APPLE_DEV_TOKEN = "";

let _mkReady = false;
let _mkLoadP  = null;
function _loadMusicKit() {
  if (_mkReady) return Promise.resolve();
  if (_mkLoadP)  return _mkLoadP;
  _mkLoadP = new Promise((res, rej) => {
    const s   = document.createElement("script");
    s.src     = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    s.onload  = () => { _mkReady = true; res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _mkLoadP;
}

async function connectAppleMusic() {
  if (!APPLE_DEV_TOKEN) return { error: "not_configured" };
  try {
    await _loadMusicKit();
    await MusicKit.configure({
      developerToken: APPLE_DEV_TOKEN,
      app: { name: "Plursky", build: "1.0.0" },
    });
    const music = MusicKit.getInstance();
    await music.authorize();
    const ut = music.musicUserToken;
    if (!ut) return { error: "No user token — authorization may have been denied." };
    localStorage.setItem("am_user_token", ut);
    return { ok: true };
  } catch (e) {
    return { error: e?.message || "Authorization failed" };
  }
}

function disconnectAppleMusic() {
  localStorage.removeItem("am_user_token");
  if (typeof MusicKit !== "undefined") {
    try { MusicKit.getInstance().unauthorize(); } catch {}
  }
}

// Paginate through the user's entire Apple Music library and return
// a flat array of {name} objects (one per unique artist).
async function fetchAppleMusicArtists() {
  const ut  = localStorage.getItem("am_user_token");
  if (!ut || !APPLE_DEV_TOKEN) return null;
  const headers = {
    Authorization:    `Bearer ${APPLE_DEV_TOKEN}`,
    "Music-User-Token": ut,
  };
  const seen    = new Set();
  const artists = [];
  let offset = 0;
  try {
    while (true) {
      const res = await fetch(
        `https://api.music.apple.com/v1/me/library/artists?limit=100&offset=${offset}`,
        { headers }
      );
      if (!res.ok) {
        if (res.status === 401) localStorage.removeItem("am_user_token");
        break;
      }
      const json  = await res.json();
      const items = json.data || [];
      items.forEach(a => {
        const name = a.attributes?.name;
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          artists.push({ name });
        }
      });
      if (!json.next || items.length < 100) break;
      offset += 100;
    }
    return artists;
  } catch { return []; }
}

const SPOTIFY_CLIENT_ID     = "2219c68606c54629a8799f467a996a81";
const SPOTIFY_REDIRECT_WEB  = "https://plursky.com/callback";
// v132: native iOS uses a custom URL scheme so Spotify's redirect comes back
// INTO the app via Capacitor's appUrlOpen listener (vs. dumping the user
// into a web tab at the wrong origin). Requires:
//   • Info.plist registers the `plursky` URL scheme (see CFBundleURLTypes)
//   • Spotify dashboard adds `plursky://callback` to Redirect URIs
function _isNativeApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}
const SPOTIFY_REDIRECT_NATIVE = "plursky://callback";
function _spotifyRedirectUri() {
  return _isNativeApp() ? SPOTIFY_REDIRECT_NATIVE : SPOTIFY_REDIRECT_WEB;
}
// Back-compat alias — pre-v132 code referenced SPOTIFY_REDIRECT directly.
const SPOTIFY_REDIRECT = SPOTIFY_REDIRECT_WEB;
const SPOTIFY_SCOPES    = "user-top-read user-read-recently-played user-library-read user-read-private user-read-email user-follow-read playlist-read-private playlist-modify-public playlist-modify-private";

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
  // Note: `spotify_auth_scopes` is the GRANTED-scope record, not the requested
  // one — only callback.html writes it (after the token exchange returns the
  // actual `scope` field). Writing here would falsely promise scopes that
  // Spotify might silently downgrade if the user denied any.
  const params = new URLSearchParams({
    client_id:             SPOTIFY_CLIENT_ID,
    response_type:         "code",
    redirect_uri:          _spotifyRedirectUri(),
    code_challenge_method: "S256",
    code_challenge:        challenge,
    scope:                 SPOTIFY_SCOPES,
    // Force the consent screen even for previously-authorized users so newly
    // added scopes (playlist-read-private etc.) actually get granted instead
    // of Spotify silently re-issuing a token with the old scope set.
    show_dialog:           "true",
  });
  return "https://accounts.spotify.com/authorize?" + params;
}

// v132 native OAuth: exchange the auth code for a token in-process. On the
// web this is done by callback.html; on native we never hit a web page so
// we replicate the logic here. Records the granted scope + caches profile.
async function _spotifyExchangeCode(code, redirectUri) {
  const verifier =
    localStorage.getItem("spotify_pkce_verifier") ||
    sessionStorage.getItem("spotify_pkce_verifier");
  if (!verifier) return { error: "session_lost" };
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     SPOTIFY_CLIENT_ID,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
        code_verifier: verifier,
      }),
    });
    const data = await res.json();
    if (!data.access_token) return { error: data.error_description || data.error || "no_token" };
    try {
      localStorage.setItem("spotify_token",         data.access_token);
      localStorage.setItem("spotify_refresh_token", data.refresh_token || "");
      localStorage.setItem("spotify_expires",       Date.now() + data.expires_in * 1000);
      if (data.scope) localStorage.setItem("spotify_auth_scopes", data.scope);
      localStorage.removeItem("spotify_pkce_verifier");
      sessionStorage.removeItem("spotify_pkce_verifier");
    } catch {}
    // Pre-fetch profile so home/me screens render personalised on first paint.
    try {
      const profRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: "Bearer " + data.access_token },
      });
      if (profRes.ok) {
        const p = await profRes.json();
        localStorage.setItem("spotify_profile", JSON.stringify({
          id: p.id,
          name: p.display_name || p.id,
          email: p.email || null,
          image: p.images?.[0]?.url || null,
          country: p.country || null,
          product: p.product || null,
        }));
      }
    } catch {}
    return { ok: true };
  } catch (e) {
    return { error: e?.message || "network" };
  }
}

// Capacitor's appUrlOpen fires when iOS hands a `plursky://...` URL to the
// app. We listen for `plursky://callback?code=...` here, run the token
// exchange, close the in-app browser, and notify React via a custom event
// the SpotifyScreen (and Me-tab account card) listen for.
let _spotifyNativeHandlerRegistered = false;
function _registerNativeSpotifyHandler() {
  if (_spotifyNativeHandlerRegistered) return;
  const App = window.Capacitor?.Plugins?.App;
  const Browser = window.Capacitor?.Plugins?.Browser;
  if (!App?.addListener) return;
  _spotifyNativeHandlerRegistered = true;
  App.addListener("appUrlOpen", async (event) => {
    const url = event?.url || "";
    if (!/^plursky:\/\/callback/i.test(url)) return;
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    const code  = parsed.searchParams.get("code");
    const error = parsed.searchParams.get("error");
    // Close the in-app SafariViewController; user lands back in Plursky.
    try { await Browser?.close?.(); } catch {}
    if (error || !code) {
      _spotifyDebugToast("Spotify connect cancelled.", "#9b1c1c");
      try { window.dispatchEvent(new CustomEvent("plursky-spotify-connect", { detail: { error: error || "no_code" } })); } catch {}
      return;
    }
    const { error: exErr } = await _spotifyExchangeCode(code, SPOTIFY_REDIRECT_NATIVE);
    if (exErr) {
      _spotifyDebugToast("Spotify connect failed: " + exErr, "#9b1c1c");
      try { window.dispatchEvent(new CustomEvent("plursky-spotify-connect", { detail: { error: exErr } })); } catch {}
      return;
    }
    // Success — React state lives one layer up; broadcast and let listeners
    // setState({ spotifyConnected: true, spotifyProfile: ... }).
    try { window.dispatchEvent(new CustomEvent("plursky-spotify-connect", { detail: { ok: true } })); } catch {}
  });
}
if (typeof window !== "undefined") _registerNativeSpotifyHandler();

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

// One-shot v80 migration: pre-v80 versions wrote the REQUESTED scope string
// (not the granted one) to spotify_auth_scopes on every page load, falsely
// promising playlist-modify scopes the running token may not have. Wipe it
// for any user who hasn't migrated yet — _hasPlaylistWriteScope will then
// correctly fail-closed and prompt reconnect.
if (typeof window !== "undefined") {
  try {
    if (!localStorage.getItem("plursky_scope_migration_v80")) {
      localStorage.removeItem("spotify_auth_scopes");
      localStorage.setItem("plursky_scope_migration_v80", "1");
    }
  } catch {}
}

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
  // Native iOS (Capacitor): open the auth URL in an in-app SafariViewController
  // via @capacitor/browser. Spotify redirects back to `plursky://callback?code=…`,
  // which iOS hands to the app via App.appUrlOpen — handled by the listener
  // registered at module load. The in-browser SafariViewController also keeps
  // the user's existing Spotify session cookie from Safari, so most users get
  // a one-tap "Allow" sheet instead of a full email/password form.
  if (_isNativeApp()) {
    const Browser = window.Capacitor?.Plugins?.Browser;
    if (!Browser?.open) {
      _spotifyDebugToast("Spotify connect needs an app update.", "#9b1c1c");
      return;
    }
    const go = (url) => {
      Browser.open({ url, presentationStyle: "popover" }).catch(err => {
        _spotifyDebugToast("Spotify connect failed: " + (err?.message || err), "#9b1c1c");
      });
    };
    if (_SPOTIFY_AUTH_URL) { go(_SPOTIFY_AUTH_URL); return; }
    _spotifyDebugToast("Preparing Spotify…", "#1a120d");
    _buildSpotifyAuthUrl().then(go).catch(err => {
      _spotifyDebugToast("Spotify connect failed: " + (err?.message || err), "#9b1c1c");
    });
    return;
  }

  // Web (plursky.com): Mobile-PWA OAuth gotcha — installed-PWA standalone mode
  // has its own localStorage silo that the system browser can't see, so the
  // PKCE verifier we just wrote is unreachable after redirect. Warn and let
  // the user opt out.
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
  // Keep spotify_pkce_verifier — startSpotifyAuth() may be called immediately
  // after disconnect (reconnect flow) and still needs the pre-warmed verifier.
  // callback.html removes it after a successful token exchange.
  ["spotify_token","spotify_refresh_token","spotify_expires","spotify_profile",
   "spotify_auth_scopes"]
    .forEach(k => localStorage.removeItem(k));
  // Drop cached scan results — stale data with old (limited) scopes would
  // otherwise persist and the user wouldn't see the playlist-matched artists
  // appear after reconnecting with the broader scope set.
  setState({ ...state, spotifyConnected: false, spotifyProfile: null });
}

// Returns a valid access token, silently refreshing via the refresh token if expired.
// Returns null if no token and no refresh token (user must reconnect).
async function getValidToken() {
  const token = localStorage.getItem("spotify_token");
  const expires = localStorage.getItem("spotify_expires");
  if (token && expires && Date.now() < parseInt(expires) - 60000) return token;
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  if (!refreshToken) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     SPOTIFY_CLIENT_ID,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    localStorage.setItem("spotify_token",   data.access_token);
    localStorage.setItem("spotify_expires", Date.now() + data.expires_in * 1000);
    if (data.refresh_token) localStorage.setItem("spotify_refresh_token", data.refresh_token);
    return data.access_token;
  } catch { return null; }
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
  const token = await getValidToken();
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

// Pick the right artist when Spotify returns multiple name collisions.
// E.g. "Westend" (EDC tech-house DJ) vs "Westend" (rock band). Strategy:
// exact-name matches first; among those, prefer electronic genres; tie-break
// by Spotify popularity. Falls back to substring matches if no exact hit.
const _ELECTRONIC_HINTS = ["electronic","dance","edm","house","techno","trance","dubstep","bass","garage","hardstyle","breakbeat","trap","electro","club","rave","tech","ambient","downtempo","progressive","jungle","phonk","riddim","dnb","drum and bass","drum & bass","psytrance","synthwave","moombahton","nu-disco","disco","hardcore","dance-pop"];
function _isElectronicArtist(a) {
  const gs = a?.genres || [];
  if (gs.length === 0) return false;
  return gs.some(g => {
    const lower = String(g).toLowerCase();
    return _ELECTRONIC_HINTS.some(k => lower.includes(k));
  });
}
function _pickArtistMatch(items, ln) {
  if (!items || items.length === 0) return null;
  const byPop = arr => [...arr].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const exact = items.filter(a => a.name.toLowerCase() === ln);
  if (exact.length) {
    const elec = exact.filter(_isElectronicArtist);
    return (elec.length ? byPop(elec) : byPop(exact))[0];
  }
  const partial = items.filter(a =>
    a.name.toLowerCase().includes(ln) || ln.includes(a.name.toLowerCase())
  );
  if (partial.length) {
    const elec = partial.filter(_isElectronicArtist);
    return (elec.length ? byPop(elec) : byPop(partial))[0];
  }
  return null;
}

// Tokens issued by app versions <= v53 don't carry playlist-modify scopes —
// refreshing inherits the original (limited) scope set, so the only fix is
// a fresh OAuth grant. We detect this up-front to skip a guaranteed 403.
function _hasPlaylistWriteScope() {
  let s = "";
  try { s = localStorage.getItem("spotify_auth_scopes") || ""; } catch {}
  // Treat unknown (legacy connection, never recorded) as "missing" — better to
  // ask the user to reconnect than to round-trip the API and 403.
  if (!s) return false;
  return s.includes("playlist-modify-public") || s.includes("playlist-modify-private");
}

// Find a user-owned playlist whose name starts with "plursky" (case-insensitive).
// Falls back from a cached ID. Returns one of:
//   { playlist }                    — found
//   { error: "not_found" }          — searched all pages, none matched
//   { error: "rate_limited" }       — 429 (often after heavy API churn)
//   { error: "fetch_failed", status } — other non-ok response
// Used because POST /users/{id}/playlists is blocked for Spotify Development
// Mode apps (post-Nov 2024) — the user creates a "Plursky" playlist manually
// once, then modify-existing endpoints (which are NOT restricted) take over.
async function _findPlurskyPlaylist(token, profileId) {
  // Brief retry helper for transient 429s — Spotify's rate limit windows are
  // short (seconds), so two retries with backoff usually clears them.
  const fetchWithRetry = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (r.status !== 429) return r;
      const retryAfter = parseInt(r.headers.get("Retry-After") || "2");
      const wait = Math.min(retryAfter * 1000, 4000) + attempt * 500;
      if (attempt < 2) await new Promise(res => setTimeout(res, wait));
    }
    return null;
  };

  let cachedId = null;
  try { cachedId = localStorage.getItem("plursky_target_playlist_id"); } catch {}
  if (cachedId) {
    try {
      const r = await fetchWithRetry(`https://api.spotify.com/v1/playlists/${cachedId}`);
      if (r?.ok) {
        const candidate = await r.json();
        if (candidate?.owner?.id === profileId) return { playlist: candidate };
      }
    } catch {}
    try { localStorage.removeItem("plursky_target_playlist_id"); } catch {}
  }
  for (let offset = 0; offset < 200; offset += 50) {
    const r = await fetchWithRetry(
      `https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`
    );
    if (!r) return { error: "rate_limited" };
    if (!r.ok) return { error: "fetch_failed", status: r.status };
    const j = await r.json();
    const items = j.items || [];
    const found = items.find(p =>
      p?.owner?.id === profileId &&
      typeof p?.name === "string" &&
      p.name.trim().toLowerCase().startsWith("plursky")
    );
    if (found) return { playlist: found };
    if (items.length < 50) break;
  }
  return { error: "not_found" };
}

// #12 Build my playlist — push the user's saved EDC sets into their existing
// "Plursky" Spotify playlist (created manually, see _findPlurskyPlaylist).
// Skips artists Spotify can't find.
async function createEdcPlaylist(state) {
  const token   = await getValidToken();
  const profile = await ensureSpotifyProfile();
  if (!token || !profile) return { ok: false, reason: "not_connected" };
  if (!_hasPlaylistWriteScope()) return { ok: false, reason: "reconnect", status: 403, message: "Need to reconnect for playlist permission" };

  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(Boolean);
  if (saved.length === 0) return { ok: false, reason: "empty" };

  // Sort by night (day 1→2→3) then by set start time with after-midnight wrap
  const timeKey = hhmm => { const h = parseInt(hhmm); return h < 6 ? h + 24 : h; };
  const sorted = [...saved].sort((a, b) =>
    a.day !== b.day ? a.day - b.day : timeKey(a.start) - timeKey(b.start)
  );

  // Track depth: headliners (tier 3) = 5, prime time (tier 2) = 4, openers (tier 1) = 3
  const trackLimit = tier => tier === 3 ? 5 : tier === 2 ? 4 : 3;
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // 1) Find the user's manually-created "Plursky" playlist
  const lookup = await _findPlurskyPlaylist(token, profile.id);
  if (lookup.error === "rate_limited") {
    return { ok: false, reason: "rate_limited", message: "Spotify rate limit — wait 30s & retry" };
  }
  if (lookup.error === "fetch_failed") {
    if (lookup.status === 401 || lookup.status === 403) {
      ["spotify_token","spotify_expires","spotify_auth_scopes"].forEach(k => { try { localStorage.removeItem(k); } catch {} });
      return { ok: false, reason: "reconnect", status: lookup.status, message: "Reconnect required" };
    }
    return { ok: false, reason: "create_fail", status: lookup.status, message: "Spotify lookup failed" };
  }
  if (lookup.error === "not_found" || !lookup.playlist) {
    return {
      ok: false,
      reason: "no_target_playlist",
      message: "Create empty Spotify playlist named 'Plursky' first",
    };
  }
  const playlist = lookup.playlist;
  try { localStorage.setItem("plursky_target_playlist_id", playlist.id); } catch {}

  // 2) Top tracks per saved artist, kept in day buckets for FRI→SAT→SUN ordering.
  //    B2B names split so each artist contributes independently.
  const seenUris = new Set();
  const urisByDay = { 1: [], 2: [], 3: [] };
  let missed = 0;

  // Shared 429 retry — Spotify throttles bursty token traffic. Without retry,
  // a single rate-limited search drops the artist (counted as missed) and a
  // rate-limited write batch silently loses tracks.
  const fetchWithRetry = async (url, init) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url, init);
      if (r.status !== 429) return r;
      const retryAfter = parseInt(r.headers.get("Retry-After") || "2");
      const wait = Math.min(retryAfter * 1000, 4000) + attempt * 500;
      if (attempt < 2) await new Promise(res => setTimeout(res, wait));
    }
    return null;
  };

  const searchOne = async (searchName, limit) => {
    // Track-search path: avoids /artists/{id}/top-tracks which is blocked for
    // Development-Mode apps post-Nov 2024. Disambiguates name collisions
    // (e.g. Westend the rock band vs Westend the EDC house DJ) by counting
    // how many tracks each candidate artist ID owns and picking the most-
    // represented one — Spotify's track relevance ranking surfaces the
    // popular artist's catalog first.
    // Strip lineup-only suffixes like "(DJ Set)", "(VIP)", "(Live)" — Spotify's
    // canonical artist name doesn't include them, so the exact-name match below
    // would fail otherwise.
    const clean = searchName.replace(/\s*\([^)]*\)\s*/g, "").trim() || searchName;
    try {
      const tr = await fetchWithRetry(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${clean}"`)}&type=track&limit=10`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!tr || !tr.ok) return [];
      const tj = await tr.json();
      const items = tj.tracks?.items || [];
      const ln = clean.toLowerCase();
      const byArtist = new Map();
      for (const t of items) {
        const matched = (t.artists || []).find(a => a.name.toLowerCase() === ln);
        if (!matched) continue;
        if (!byArtist.has(matched.id)) byArtist.set(matched.id, []);
        byArtist.get(matched.id).push(t);
      }
      if (byArtist.size === 0) return [];
      let bestId = null, bestCount = 0;
      for (const [id, ts] of byArtist) {
        if (ts.length > bestCount) { bestId = id; bestCount = ts.length; }
      }
      const collected = [];
      for (const t of byArtist.get(bestId)) {
        if (!t?.uri || seenUris.has(t.uri) || collected.length >= limit) continue;
        seenUris.add(t.uri); collected.push(t.uri);
      }
      return collected;
    } catch { return []; }
  };

  const search = async (artist) => {
    const parts = artist.name.split(/ b2b /i).map(s => s.trim());
    const limit = trackLimit(artist.tier);
    let total = 0;
    for (const part of parts) {
      const uris = await searchOne(part, limit);
      uris.forEach(u => (urisByDay[artist.day] || []).push(u));
      total += uris.length;
    }
    if (total === 0) missed++;
  };

  // 4-wide concurrency keeps us under Spotify's burst limit for token-auth
  // search calls. Higher widths trigger 429s that the retry helper has to
  // unwind — slower overall than a slightly narrower fan-out.
  for (let i = 0; i < sorted.length; i += 4) {
    await Promise.all(sorted.slice(i, i + 4).map(search));
  }

  // 3) Replace existing tracks: PUT clears+sets the first batch, POST appends rest.
  //    PUT with { uris: [] } clears entirely — runs even if we have zero matched
  //    tracks, so a rebuild with no matches still empties the playlist.
  const allUris = [
    ...(urisByDay[1] || []),
    ...(urisByDay[2] || []),
    ...(urisByDay[3] || []),
  ];
  const batches = [];
  for (let i = 0; i < allUris.length; i += 100) batches.push(allUris.slice(i, i + 100));
  if (batches.length === 0) batches.push([]);
  let addedCount = 0;
  let writeFailStatus = null;
  for (let i = 0; i < batches.length; i++) {
    try {
      const isFirst = i === 0;
      const ar = await fetchWithRetry(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: isFirst ? "PUT" : "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: batches[i] }),
      });
      if (ar?.ok) addedCount += batches[i].length;
      else if (writeFailStatus === null) writeFailStatus = ar?.status || 429;
    } catch {}
  }
  if (allUris.length > 0 && addedCount === 0 && writeFailStatus) {
    // Couldn't write any tracks — likely scope or ownership issue; surface it
    // rather than silently reporting a "successful" empty rebuild.
    if (writeFailStatus === 401 || writeFailStatus === 403) {
      ["spotify_token","spotify_expires","spotify_auth_scopes"].forEach(k => { try { localStorage.removeItem(k); } catch {} });
      return { ok: false, reason: "reconnect", status: writeFailStatus, message: "Reconnect required" };
    }
    return { ok: false, reason: "create_fail", status: writeFailStatus, message: "Couldn't write tracks" };
  }

  // 4) Update description with per-day track counts for easy navigation
  const dayLabels = [1, 2, 3].map(d => {
    const n = (urisByDay[d] || []).length;
    return n > 0 ? `${FESTIVAL_CONFIG.dayDates[d].short} ${n}` : null;
  }).filter(Boolean);
  if (dayLabels.length > 0) {
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `${sorted.length} sets · ${dayLabels.join(" · ")} tracks · headliners 5 songs · built with Plursky · ${dateStr}`,
      }),
    }).catch(() => {});
  }

  return {
    ok:    true,
    added: addedCount,
    total: sorted.length,
    missed,
    url:   playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
    id:    playlist.id,
  };
}

// Pre-game hype playlist — full lineup, 1 top track per artist, headliners first.
// Distinct from createEdcPlaylist (saved sets, 2 tracks each = post-festival recap).
async function createHypePlaylist() {
  const token   = await getValidToken();
  const profile = await ensureSpotifyProfile();
  if (!token || !profile) return { ok: false, reason: "not_connected" };

  // Full lineup sorted tier-desc, deduplicated by name (some artists span days)
  const seen = new Set();
  const artists = [...ARTISTS]
    .sort((a, b) => (b.tier - a.tier) || a.name.localeCompare(b.name))
    .filter(a => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const plRes = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${FESTIVAL_CONFIG.shortName} 2026 — Pre-Game Hype`,
      description: `${artists.length} acts · 1 track each · headliners first · built with Plursky · ${dateStr}`,
      public: false,
    }),
  });
  if (!plRes.ok) {
    const err = await plRes.json().catch(() => ({}));
    if (plRes.status === 401 || plRes.status === 403) {
      ["spotify_token","spotify_expires"].forEach(k => localStorage.removeItem(k));
      return { ok: false, reason: "reconnect", status: plRes.status };
    }
    return { ok: false, reason: "create_fail", status: plRes.status, message: err.error?.message || "" };
  }
  const playlist = await plRes.json();

  const uris = [];
  let missed = 0;
  const searchHypeOne = async (searchName) => {
    // Same track-search path as createEdcPlaylist — see comment there.
    const clean = searchName.replace(/\s*\([^)]*\)\s*/g, "").trim() || searchName;
    try {
      const tr = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${clean}"`)}&type=track&limit=10`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!tr.ok) return false;
      const tj = await tr.json();
      const items = tj.tracks?.items || [];
      const ln = clean.toLowerCase();
      const byArtist = new Map();
      for (const t of items) {
        const matched = (t.artists || []).find(a => a.name.toLowerCase() === ln);
        if (!matched) continue;
        if (!byArtist.has(matched.id)) byArtist.set(matched.id, []);
        byArtist.get(matched.id).push(t);
      }
      if (byArtist.size === 0) return false;
      let bestId = null, bestCount = 0;
      for (const [id, ts] of byArtist) {
        if (ts.length > bestCount) { bestId = id; bestCount = ts.length; }
      }
      const first = byArtist.get(bestId)[0];
      if (first?.uri) { uris.push(first.uri); return true; }
      return false;
    } catch { return false; }
  };
  const search = async (artist) => {
    const parts = artist.name.split(/ b2b /i).map(s => s.trim());
    let ok = false;
    for (const part of parts) ok = await searchHypeOne(part) || ok;
    if (!ok) missed++;
  };
  for (let i = 0; i < artists.length; i += 6) {
    await Promise.all(artists.slice(i, i + 6).map(search));
  }
  for (let i = 0; i < uris.length; i += 100) {
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
  return { ok: true, added: uris.length, total: artists.length, missed, url: playlist.external_urls?.spotify, id: playlist.id };
}

// Returns full artist objects (with .genres array, deduped across all 3 time ranges,
// each tagged with a `_score` weighting recent listens 3×, 6mo 2×, all-time 1×).
// Returns null on token expiry, [] on error.
// Returns EDC artists the user follows on Spotify but hasn't saved to their lineup.
// Paginates up to 200 followed artists (4 pages × 50).
async function fetchFollowedEdcArtists(savedIds) {
  const token = await getValidToken();
  if (!token) return [];
  const savedNames = new Set(
    savedIds
      .map(id => ARTISTS.find(a => a.id === id))
      .filter(Boolean)
      .flatMap(a => a.name.split(/ b2b /i).map(s => s.trim().toLowerCase()))
  );
  const followedLower = [];
  let after = null;
  for (let page = 0; page < 4; page++) {
    try {
      const url = `https://api.spotify.com/v1/me/following?type=artist&limit=50${after ? "&after=" + after : ""}`;
      const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) break;
      const json = await res.json();
      const items = json.artists?.items || [];
      items.forEach(a => followedLower.push(a.name.toLowerCase()));
      after = json.artists?.cursors?.after;
      if (!after || items.length < 50) break;
    } catch { break; }
  }
  if (!followedLower.length) return [];
  const result = [];
  const seen = new Set();
  ARTISTS.forEach(a => {
    if (seen.has(a.id)) return;
    const parts = a.name.split(/ b2b /i).map(s => s.trim().toLowerCase());
    const follows = parts.some(p => followedLower.some(f => f === p || f.includes(p) || p.includes(f)));
    if (follows && !savedIds.includes(a.id)) { seen.add(a.id); result.push(a); }
  });
  return result;
}

async function fetchSpotifyTopArtists() {
  const token = await getValidToken();
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

    // Persist artist images keyed by lowercase name for ArtistScreen hero
    try {
      const imgs = JSON.parse(localStorage.getItem("artist_images_v1") || "{}");
      top.forEach(a => {
        const url = a.images?.[0]?.url;
        if (url && a.name) imgs[a.name.toLowerCase()] = url;
      });
      localStorage.setItem("artist_images_v1", JSON.stringify(imgs));
    } catch {}

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
    // Pull recently-played (max 50) + first 6 pages of liked songs (300 tracks).
    // More pages → more EDM artists who appear only a few times in the library.
    // Followed artists — cursor-paginated, different shape from track-based pulls.
    // An artist you follow but never play (e.g. you like an EDM act's posts but
    // listen to other genres at home) was invisible to the matcher before this.
    const pullFollowing = async () => {
      let after = null;
      for (let page = 0; page < 4; page++) {
        try {
          const url = `https://api.spotify.com/v1/me/following?type=artist&limit=50${after ? "&after=" + after : ""}`;
          const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
          if (!r.ok) return;
          const d = await r.json();
          const items = d.artists?.items || [];
          items.forEach(a => {
            if (!a?.id || seen.has(a.id)) return;
            seen.add(a.id);
            extras.push({ id: a.id, name: a.name, genres: a.genres || [], _score: 50, _source: "following" });
          });
          after = d.artists?.cursors?.after;
          if (!after || items.length < 50) break;
        } catch { return; }
      }
    };
    await Promise.all([
      pull("https://api.spotify.com/v1/me/player/recently-played?limit=50", "recent", 60),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=0",   "saved", 40),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=50",  "saved", 35),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=100", "saved", 30),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=150", "saved", 25),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=200", "saved", 20),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=250", "saved", 15),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=300", "saved", 12),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=350", "saved", 10),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=400", "saved", 8),
      pull("https://api.spotify.com/v1/me/tracks?limit=50&offset=450", "saved", 6),
      pullFollowing(),
    ]);

    // Walk ALL playlists (owned + followed) — paginate both the playlist list
    // and each playlist's tracks so a 1000-song playlist is fully scanned.
    // _playlistCount stays 0 if the scope or token blocks the list endpoint.
    // _playlistScanOk is true only if the endpoint responded with HTTP 2xx at
    // least once — distinguishes "0 playlists" from "API call failed".
    // Scope pre-check: if the stored auth scopes (written by _buildSpotifyAuthUrl
    // since v54) don't include playlist-read-private, surface the banner now
    // rather than letting the scan silently return an empty playlist list.
    const _storedScopes = (() => { try { return localStorage.getItem("spotify_auth_scopes") || ""; } catch { return ""; } })();
    const _missingScopeRecord = _storedScopes !== "" && !_storedScopes.includes("playlist-read-private");
    let _playlistCount = 0;
    let _playlistScanOk = _missingScopeRecord ? false : false; // stays false until first HTTP 2xx
    // Retry helper — Spotify throttles bursty token traffic with 429.
    // Treating 429 as "scan failed" surfaces a misleading reconnect banner,
    // so retry up to 3 times honoring Retry-After before giving up.
    const fetchPlaylistsWithRetry = async (url) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (r.status !== 429) return r;
        const retryAfter = parseInt(r.headers.get("Retry-After") || "2");
        const wait = Math.min(retryAfter * 1000, 4000) + attempt * 500;
        if (attempt < 2) await new Promise(res => setTimeout(res, wait));
      }
      return null;
    };
    try {
      // Fetch every playlist the user has (paginate the list — max 50 per page)
      const allPlaylists = [];
      let plOffset = 0;
      while (true) {
        const plRes = await fetchPlaylistsWithRetry(
          `https://api.spotify.com/v1/me/playlists?limit=50&offset=${plOffset}`
        );
        if (!plRes || !plRes.ok) break;
        _playlistScanOk = true;
        const plData = await plRes.json();
        const items = (plData.items || []).filter(p => p?.id);
        allPlaylists.push(...items);
        if (items.length < 50 || !plData.next) break;
        plOffset += 50;
      }
      _playlistCount = allPlaylists.length;

      // Per-playlist: paginate every track page (100 tracks at a time)
      // No `fields=` param — avoids comma encoding bugs that break `next`
      const fetchPl = async (pl) => {
        try {
          let offset = 0;
          while (true) {
            const tr = await fetchPlaylistsWithRetry(
              `https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=100&offset=${offset}`
            );
            if (!tr || !tr.ok) break;
            const td = await tr.json();
            const items = td.items || [];
            items.forEach(item => {
              // Primary track artists
              (item.track?.artists || []).forEach(a => {
                if (!a?.id || seen.has(a.id)) return;
                seen.add(a.id);
                extras.push({ id: a.id, name: a.name, genres: [], _score: 25, _source: "playlist" });
              });
              // Remix / edit credits buried in the track title:
              // "Song (Layton Giordani Remix)" → extract "Layton Giordani".
              // EDM labels often credit remixers only in the title, not as a
              // track artist — this catches them.
              const title = item.track?.name || "";
              // Spotify formats remix credits three ways: "(Name Remix)",
              // "[Name Remix]", or " - Name Remix" (dash with no parens, e.g.
              // "Drinkee - Sofi Tukker Remix"). All three covered below.
              const rxMatch = title.match(/\(\s*([^)]+?)\s+(?:Remix|Edit|Mix|Rework|Bootleg|Flip|VIP)\s*\)/i)
                           || title.match(/\[\s*([^\]]+?)\s+(?:Remix|Edit|Mix|Rework|Bootleg|Flip|VIP)\s*\]/i)
                           || title.match(/\s[-–—]\s+([^-–—]+?)\s+(?:Remix|Edit|Mix|Rework|Bootleg|Flip|VIP)\s*$/i);
              if (rxMatch) {
                const remixerRaw = rxMatch[1].trim();
                // A track can have a compound remixer credit like "A & B" — split on & / x / vs
                remixerRaw.split(/\s*[&,]\s*|\s+(?:x|vs\.?)\s+/i).forEach(rName => {
                  const n = rName.trim();
                  if (!n || seen.has("remix_" + n.toLowerCase())) return;
                  seen.add("remix_" + n.toLowerCase());
                  extras.push({ id: "remix_" + n.toLowerCase(), name: n, genres: [], _score: 20, _source: "playlist" });
                });
              }
            });
            // Stop when we received fewer than a full page, or Spotify says no more
            if (items.length < 100 || !td.next) break;
            offset += 100;
          }
        } catch {}
      };

      // 6-wide concurrency keeps us under Spotify's rate limit
      for (let i = 0; i < allPlaylists.length; i += 6) {
        await Promise.all(allPlaylists.slice(i, i + 6).map(fetchPl));
      }
    } catch {}

    const result = [...top, ...extras];
    result._playlistCount = _playlistCount;
    result._playlistScanOk = _playlistScanOk;
    return result;
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

// Match Spotify artist names against the EDC lineup.
// B2B entries ("A b2b B") are kept as a single entry — the full compound
// set shows in the matched list. Matching fires if ANY individual part of
// the B2B name is found in the user's Spotify library, so "Peggy Gou b2b
// Ki/Ki" surfaces if you follow Peggy Gou.
function matchLineupArtists(spotifyArtists) {
  if (!spotifyArtists?.length) return [];
  const names = spotifyArtists.map(a => a.name.toLowerCase());
  const result = [];
  const seen   = new Set();

  ARTISTS.forEach(a => {
    if (seen.has(a.id)) return;
    const parts = a.name.split(/ b2b /i).map(s => s.trim().toLowerCase());
    const matches = parts.some(part => names.some(n => part.includes(n) || n.includes(part)));
    if (!matches) return;
    seen.add(a.id);
    result.push(a);
  });
  return result;
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
  // Use real IDs (strip B2B virtual suffix) so matched B2B halves don't leak
  // into the discovery list under the original compound entry ID.
  const matchedIds = new Set((matched || []).map(a => a._realId || a.id));
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
  // Identify the user's strongest stage so we can call it out by name in the
  // recommendation reason ("matches your top stage").
  const ranked = Object.entries(stageProfile).sort((a, b) => b[1] - a[1]);
  const topStageId = ranked[0]?.[1] > 0 ? ranked[0][0] : null;
  const scored = ARTISTS
    .filter(a => !matchedIds.has(a.id) && !savedSet.has(a.id) && a.tier >= 2)
    .map(a => {
      const stageWeight = (stageProfile[a.stage] || 0) / total;
      const tierBonus   = a.tier * 0.5; // light nudge toward primetime/headliner picks
      const stage       = STAGES.find(s => s.id === a.stage);
      const stageShort  = stage?.short || stage?.name || a.stage;
      let reason;
      if (a.stage === topStageId && stageWeight > 0) reason = `Your top stage · ${stageShort}`;
      else if (stageWeight > 0)                     reason = `Matches your ${stageShort} taste`;
      else                                           reason = null;
      return { artist: { ...a, _reason: reason }, score: stageWeight * 100 + tierBonus };
    });
  // Only surface picks with a real genre-fit reason — random "headliner you
  // haven't heard" suggestions assumed unfamiliarity that wasn't there.
  const meaningful = scored.filter(s => s.artist._reason);
  return meaningful.sort((a, b) => b.score - a.score).slice(0, max).map(s => s.artist);
}

// ── SPOTIFY SCREEN ────────────────────────────────────────────
function SpotifyScreen({ state, setState }) {
  const connected = state.spotifyConnected;
  const [spotifyArtists,  setSpotifyArtists]  = React.useState(null);
  const [tokenBad,        setTokenBad]        = React.useState(false);
  const [saveFlash,         setSaveFlash]         = React.useState(false);
  const [playlistCount,     setPlaylistCount]     = React.useState(null);
  const [playlistScanFailed, setPlaylistScanFailed] = React.useState(false);
  const [showAllArtists,  setShowAllArtists]  = React.useState(false);

  // Apple Music state
  const [amConnected, setAmConnected] = React.useState(() => !!localStorage.getItem("am_user_token"));
  const [amArtists,   setAmArtists]   = React.useState(null);
  const [amLoading,   setAmLoading]   = React.useState(false);
  const [amError,     setAmError]     = React.useState("");

  React.useEffect(() => {
    if (!connected) { setSpotifyArtists([]); setPlaylistCount(null); setPlaylistScanFailed(false); return; }
    fetchSpotifyTopArtists().then(artists => {
      if (artists === null) { setTokenBad(true); setState({ ...state, spotifyConnected: false }); }
      else {
        setSpotifyArtists(artists);
        setPlaylistCount(artists._playlistCount ?? null);
        setPlaylistScanFailed(artists._playlistScanOk === false);
        try {
          const ids = matchLineupArtists(artists).map(a => a._realId || a.id);
          localStorage.setItem('spotify_matched_ids_v1', JSON.stringify(ids));
        } catch {}
      }
    });
  }, [connected]);

  React.useEffect(() => {
    if (!amConnected) { setAmArtists(null); return; }
    fetchAppleMusicArtists().then(artists => {
      if (artists === null) { setAmConnected(false); }
      else setAmArtists(artists);
    });
  }, [amConnected]);

  const handleAmConnect = async () => {
    if (!APPLE_DEV_TOKEN) return;
    setAmLoading(true); setAmError("");
    const result = await connectAppleMusic();
    setAmLoading(false);
    if (result.ok) { setAmConnected(true); }
    else setAmError(result.error || "Connection failed");
  };

  const handleAmDisconnect = () => {
    disconnectAppleMusic();
    setAmConnected(false);
    setAmArtists(null);
  };

  const amMatched = amArtists ? matchLineupArtists(amArtists) : [];

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

  // Check if this connection was made after scope-recording was introduced (v54).
  // Old connections have no record → private playlists may have been silently skipped.
  const noScopeRecord = (() => { try { return !localStorage.getItem("spotify_auth_scopes"); } catch { return false; } })();
  // Tokens granted before user-follow-read was added to SPOTIFY_SCOPES can't fetch
  // followed artists — Layton Giordani / Sofi Tukker etc. get missed if user only follows them.
  const missingFollowScope = (() => {
    try { const s = localStorage.getItem("spotify_auth_scopes") || ""; return s !== "" && !s.includes("user-follow-read"); }
    catch { return false; }
  })();

  const handleSaveAll = () => {
    const newSaved = [...new Set([...state.saved, ...matched.map(a => a._realId || a.id)])];
    setState({ ...state, saved: newSaved });
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2200);
  };

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Music</span>} sub="SOUNDTRACK" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 94px" }}>

        {/* Native-iOS Spotify fallback hint (v132). On the App Store binary
            before the @capacitor/browser OAuth path landed, Spotify connect
            failed silently because the redirect went to a different origin.
            Even with the fix in place, surfacing a "Safari also works" hint
            gives users a path forward if the in-app SafariViewController
            misbehaves. */}
        {!connected && _isNativeApp() && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", marginBottom: 14,
            background: "rgba(232,93,46,0.10)",
            border: "1px solid rgba(232,93,46,0.35)",
            borderRadius: 12,
          }}>
            <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>ℹ️</span>
            <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.45 }}>
              If Spotify sign-in stalls, open <strong>plursky.com</strong> in mobile Safari — it works there reliably and your saved sets sync if you signed in with Apple on Me.
            </div>
          </div>
        )}

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
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.55, marginBottom: connected && spotifyArtists !== null && (playlistScanFailed || noScopeRecord) ? 8 : 16, maxWidth: "88%" }}>
            {connected
              ? matched.length
                ? `${matched.length} EDC artists match · scanned top, recent, liked songs${playlistCount > 0 ? ` + ${playlistCount} playlist${playlistCount === 1 ? "" : "s"}` : ""}.`
                : spotifyArtists === null ? "Loading your taste…" : "No direct matches — showing genre-based picks below."
              : "Link Spotify to see your EDC matches, genre breakdown, and play 30-sec previews on any artist."}
          </div>

          {connected && spotifyArtists !== null && (playlistScanFailed || noScopeRecord || missingFollowScope) && (
            <button
              onClick={() => { disconnectSpotify(setState, state); startSpotifyAuth(); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                fontSize: 11, lineHeight: 1.5, marginBottom: 14,
                background: "rgba(245,154,54,0.18)", border: "1px solid rgba(245,154,54,0.4)",
                borderRadius: 8, padding: "8px 10px", color: "#fde68a",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {missingFollowScope
                ? "↻ Reconnect Spotify — your current session can't see followed artists. Layton Giordani, Sofi Tukker and others you follow won't be matched until you reconnect."
                : noScopeRecord && !playlistScanFailed
                  ? "↻ Reconnect Spotify to unlock full playlist scanning — artists in private playlists may be missing."
                  : "↻ Your playlists weren't scanned. Tap to reconnect Spotify with full access — this fixes missing artists like those in private playlists."}
            </button>
          )}

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

        {/* ── Followed artists nudge ────────────────────── */}
        {connected && <FollowedNudge state={state} setState={setState} />}

        {/* ── Apple Music card ──────────────────────────── */}
        {/* Hidden entirely until a dev token is wired — the previous
            "add your token" copy was a developer reminder that nagged every
            end user without offering them any action. */}
        {APPLE_DEV_TOKEN && <div style={{
          borderRadius: 20, padding: 20,
          background: amConnected ? "#3a1a1a" : "var(--paper-2)",
          border: `1px solid ${amConnected ? "rgba(252,60,60,0.25)" : "var(--line)"}`,
          color: amConnected ? "var(--paper)" : "var(--ink)",
          marginBottom: 14, position: "relative", overflow: "hidden",
        }}>
          {/* Apple Music logo */}
          <svg width="36" height="36" viewBox="0 0 24 24" style={{ position: "absolute", top: 16, right: 16 }}>
            <rect width="24" height="24" rx="6" fill="#fc3c44"/>
            <path d="M16.5 7.5 L10 9 L10 15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="8.5" cy="15" r="1.5" fill="#fff"/>
            <circle cx="15" cy="13" r="1.5" fill="#fff"/>
          </svg>

          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: amConnected ? 0.65 : 0.5, marginBottom: 8 }}>
            {amConnected ? "APPLE MUSIC CONNECTED" : "CONNECT APPLE MUSIC"}
          </div>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 8, maxWidth: "78%" }}>
            {amConnected
              ? <>{amMatched.length} EDC <span style={{ fontStyle: "italic" }}>matches</span> found</>
              : <>Don't use Spotify? <span style={{ fontStyle: "italic" }}>Link Apple Music</span></>}
          </div>

          {!amConnected && (
            <>
              <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.5, marginBottom: 14, maxWidth: "88%" }}>
                Scan your Apple Music library to find which EDC artists you already know and love.
              </div>
              {amError && (
                <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{amError}</div>
              )}
              <button onClick={handleAmConnect} disabled={amLoading} style={{
                background: "#fc3c44", color: "#fff", border: "none",
                borderRadius: 999, padding: "10px 18px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
              }}>
                {amLoading ? "CONNECTING…" : "CONNECT APPLE MUSIC"}
              </button>
            </>
          )}

          {amConnected && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {amMatched.length > 0 && (
                <button onClick={() => {
                  const newSaved = [...new Set([...state.saved, ...amMatched.map(a => a.id)])];
                  setState({ ...state, saved: newSaved });
                }} style={{
                  background: "#fc3c44", color: "#fff", border: "none",
                  borderRadius: 999, padding: "10px 16px", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
                }}>
                  SAVE ALL {amMatched.length} ARTISTS
                </button>
              )}
              <button onClick={handleAmDisconnect} style={{
                background: "rgba(247,237,224,0.12)", color: "var(--paper)",
                border: "1px solid rgba(247,237,224,0.28)",
                borderRadius: 999, padding: "10px 16px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2,
              }}>DISCONNECT</button>
            </div>
          )}

          {amConnected && amArtists === null && (
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, opacity: 0.6 }}>LOADING LIBRARY…</div>
          )}
        </div>}

        {/* ── Harmony score ──────────────────────────────── */}
        {connected && spotifyArtists !== null && (
          <div style={{
            borderRadius: 16, padding: "14px 16px", marginBottom: 20,
            background: "var(--paper-2)", border: "1px solid var(--line)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div className="serif" style={{ fontSize: 20, lineHeight: 1, letterSpacing: -0.3 }}>Harmony score</div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginTop: 3 }}>
                  YOUR SPOTIFY VS THE LINEUP
                </div>
              </div>
              <div className="serif" style={{ fontSize: 44, lineHeight: 1, letterSpacing: -1.5 }}>
                {Math.round(matched.length / ARTISTS.length * 100)}<span style={{ fontSize: 22, opacity: 0.45 }}>%</span>
              </div>
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
              <div style={{
                width: `${Math.round(matched.length / ARTISTS.length * 100)}%`, height: "100%",
                background: "linear-gradient(90deg, var(--ember), var(--horizon))",
                borderRadius: 6, transition: "width 0.8s ease",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {matched.length} of {ARTISTS.length} EDC artists match your Spotify — scanned across top, recent, liked &amp; playlists.
            </div>
          </div>
        )}

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
          const realId  = a._realId || a.id;
          const stg     = STAGES.find(s => s.id === a.stage);
          const isSaved = state.saved.includes(realId);
          return (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0", borderBottom: "1px solid var(--line)",
            }}>
              <ArtistSwatch artist={a} size={48} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                   onClick={() => setState({ ...state, tab: "home", artist: realId })}>
                <div className="serif" style={{ fontSize: 18, lineHeight: 1.1 }}>{a.name}</div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>
                  {stg.name} · DAY {a.day} · {fmt12(a.start)}
                </div>
              </div>
              <button onClick={() => toggleSave(state, setState, realId)} style={{
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
                      {stg.name} · DAY {a.day} · {fmt12(a.start)}
                    </div>
                    {a._reason && (
                      <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--horizon)", marginTop: 3, lineHeight: 1.3 }}>
                        {a._reason}
                      </div>
                    )}
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

        {/* ── All scanned artists ─────────────────────────── */}
        {connected && spotifyArtists !== null && spotifyArtists.length > 0 && (
          <div style={{ marginTop: 28, marginBottom: 8 }}>
            <button
              onClick={() => setShowAllArtists(v => !v)}
              style={{
                width: "100%", textAlign: "left", background: "none", border: "none",
                padding: 0, cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}>
              <div>
                <div className="serif" style={{ fontSize: 22, letterSpacing: -0.3 }}>
                  Your scanned artists
                </div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginTop: 3 }}>
                  {spotifyArtists.length} ARTISTS FROM YOUR SPOTIFY
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1 }}>
                {showAllArtists ? "▲ HIDE" : "▼ SHOW"}
              </div>
            </button>

            {showAllArtists && (
              <div style={{ marginTop: 14 }}>
                {[...spotifyArtists]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((a, i) => {
                    const srcLabel = a._source === "top" ? "TOP" : a._source === "recent" ? "RECENT" : a._source === "saved" ? "LIKED" : "PLAYLIST";
                    const srcColor = a._source === "top" ? "var(--ember)" : a._source === "recent" ? "var(--horizon)" : a._source === "saved" ? "#34d399" : "var(--muted)";
                    const isEdc = ARTISTS.some(e => e.name.toLowerCase() === a.name.toLowerCase());
                    return (
                      <div key={a.id || i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "7px 0", borderBottom: "1px solid var(--line)",
                      }}>
                        <div style={{ fontSize: 14, color: isEdc ? "var(--ink)" : "var(--muted)", fontWeight: isEdc ? 500 : 400 }}>
                          {a.name}{isEdc && <span style={{ fontSize: 10, color: "var(--ember)", marginLeft: 6 }}>· EDC</span>}
                        </div>
                        <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: srcColor }}>{srcLabel}</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
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
    try { return JSON.parse(localStorage.getItem(`${FESTIVAL_CONFIG.id}_pack_v1`) || "{}"); }
    catch { return {}; }
  });
  const [custom, setCustom] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("pack_custom_v1") || "[]"); }
    catch { return []; }
  });
  const [draft, setDraft] = React.useState("");

  const saveChecked = (next) => {
    setChecked(next);
    try { localStorage.setItem(`${FESTIVAL_CONFIG.id}_pack_v1`, JSON.stringify(next)); } catch {}
  };
  const saveCustom = (next) => {
    setCustom(next);
    try { localStorage.setItem("pack_custom_v1", JSON.stringify(next)); } catch {}
  };

  const toggle = (id) => saveChecked({ ...checked, [id]: !checked[id] });

  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    const id = "c_" + Date.now();
    saveCustom([...custom, { id, label, emoji: "📝" }]);
    setDraft("");
  };
  const removeCustom = (id) => {
    saveCustom(custom.filter(it => it.id !== id));
    const next = { ...checked };
    delete next[id];
    saveChecked(next);
  };

  const allItems = [...PACK_ITEMS, ...custom];
  const done = allItems.filter(i => checked[i.id]).length;

  const itemRow = (it, isLast, isCustom) => (
    <div key={it.id} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 4px",
      borderBottom: isLast ? "none" : "1px solid var(--line)",
    }}>
      <button onClick={() => toggle(it.id)} style={{
        display: "flex", alignItems: "center", gap: 12, flex: 1,
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
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
      {isCustom && (
        <button onClick={() => removeCustom(it.id)} style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0,
        }}>×</button>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 20, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="serif" style={{ fontSize: 22 }}>Pack list</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: done === allItems.length ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
          {done}/{allItems.length} {done === allItems.length && "✓"}
        </div>
      </div>
      {PACK_ITEMS.map((it, i) => itemRow(it, i === allItems.length - 1 && custom.length === 0, false))}
      {custom.map((it, i) => itemRow(it, i === custom.length - 1, true))}
      {/* Add custom item */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addItem()}
          placeholder="Add an item…"
          style={{
            flex: 1, background: "var(--paper-2)", border: "1px solid var(--line-2)",
            borderRadius: 10, padding: "9px 12px",
            fontFamily: "Geist, sans-serif", fontSize: 14, color: "var(--ink)", outline: "none",
          }}
        />
        <button onClick={addItem} style={{
          background: draft.trim() ? "var(--ember)" : "var(--paper-2)",
          color: draft.trim() ? "#fff" : "var(--muted)",
          border: "none", borderRadius: 10, padding: "9px 14px",
          cursor: draft.trim() ? "pointer" : "default",
          fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1, fontWeight: 700,
          transition: "all .15s",
        }}>ADD</button>
      </div>
    </div>
  );
}

// Me+ / Plenty of Fish-modeled badges section. Festival milestones
// derived from state.saved + ARTISTS data, no new infra. Earned badges
// render full-color; locked stay greyed out with their unlock criteria
// visible so users know what to chase.
function BadgesSection({ state }) {
  const saved = state.saved || [];
  const savedArtists = saved
    .map(id => window.ARTISTS?.find(a => a.id === id))
    .filter(Boolean);
  const stageCount = new Set(savedArtists.map(a => a.stage)).size;
  const headlinerCount = savedArtists.filter(a => a.tier === 3).length;
  const byStage = (stageId) => savedArtists.filter(a => a.stage === stageId).length;
  // Hours of music saved across all nights
  const totalMin = savedArtists.reduce((acc, a) => {
    const s = window.toNightMin?.(a.start) || 0;
    const e = window.toNightMin?.(a.end) || 0;
    return acc + Math.max(0, e - s);
  }, 0);
  const hasSunriseSet = savedArtists.some(a => {
    const s = window.toNightMin?.(a.start) || 0;
    return s >= 18 * 60; // 02:00+ in night-min space = sunrise-adjacent
  });

  const BADGES = [
    { id: "first-save",    icon: "✦", name: "First Save",       desc: "Save your first set",                earned: savedArtists.length >= 1 },
    { id: "all-stages",    icon: "◉", name: "All 9 Stages",     desc: "Save a set from every stage",        earned: stageCount >= 9 },
    { id: "five-stages",   icon: "◍", name: "Five Stages",      desc: "Save sets across 5+ stages",         earned: stageCount >= 5 },
    { id: "headliner",     icon: "★", name: "Headliner Hunter", desc: "Save 3+ tier-3 headliner sets",      earned: headlinerCount >= 3 },
    { id: "sunrise",       icon: "☀", name: "Sunrise Survivor", desc: "Save a set running past 2 AM",       earned: hasSunriseSet },
    { id: "ten-deep",      icon: "▤", name: "Ten Deep",         desc: "10+ saved sets across the run",      earned: savedArtists.length >= 10 },
    { id: "twenty-deep",   icon: "▥", name: "Twenty Deep",      desc: "20+ saved sets across the run",      earned: savedArtists.length >= 20 },
    { id: "trance-fam",    icon: "△", name: "Trance Family",    desc: "Save 3+ Quantum Valley sets",        earned: byStage("quantum") >= 3 },
    { id: "house-heads",   icon: "⬡", name: "House Heads HQ",   desc: "Save 3+ Neon Garden sets",           earned: byStage("neon") >= 3 },
    { id: "techno-vault",  icon: "▣", name: "Techno Vault",     desc: "Save 3+ Circuit Grounds sets",       earned: byStage("circuit") >= 3 },
    { id: "bass-faithful", icon: "◆", name: "Bass Faithful",    desc: "Save 3+ Basspod or Wasteland sets",  earned: (byStage("basspod") + byStage("waste")) >= 3 },
    { id: "marathon",      icon: "⌬", name: "Marathon",         desc: "6+ hours of saved music",            earned: totalMin >= 360 },
    { id: "thirty-years",  icon: "✺", name: "30 Years Crew",    desc: "Plursky for EDC LV 2026's 30th",     earned: true },
  ];

  const earned = BADGES.filter(b => b.earned);
  const locked = BADGES.filter(b => !b.earned);

  const cardStyle = (on) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 12,
    background: on ? "var(--paper-2)" : "var(--paper)",
    border: on ? "1px solid var(--line)" : "1px dashed var(--line-2)",
    opacity: on ? 1 : 0.55,
  });
  const iconCircle = (on) => ({
    width: 36, height: 36, borderRadius: 999,
    background: on ? "linear-gradient(135deg, var(--ember), var(--horizon))" : "var(--paper-2)",
    color: on ? "#fff" : "var(--muted)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Instrument Serif, serif", fontSize: 17, flexShrink: 0,
    border: on ? "none" : "1px solid var(--line-2)",
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, fontWeight: 700, color: "var(--ink)" }}>
          BADGES
        </span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)" }}>
          {earned.length} of {BADGES.length} EARNED
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {earned.map(b => (
          <div key={b.id} style={cardStyle(true)}>
            <div style={iconCircle(true)}>{b.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 16, lineHeight: 1.15 }}>{b.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2 }}>
                EARNED · {b.desc.toUpperCase()}
              </div>
            </div>
          </div>
        ))}
        {locked.map(b => (
          <div key={b.id} style={cardStyle(false)}>
            <div style={iconCircle(false)}>{b.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 16, lineHeight: 1.15, color: "var(--muted)" }}>{b.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2 }}>
                LOCKED · {b.desc.toUpperCase()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Runbuds-modeled History/Records section. Lives on the Me page below
// the 4-card grid. History rows = per-night recap (sets caught, total
// minutes, top stage color stripe). Records = derived superlatives
// (most saved on one night, top stage, longest single set, etc.).
function HistoryRecordsSection({ state, setState }) {
  const [view, setView] = React.useState("history"); // "history" | "records"

  const days = Object.keys(window.FESTIVAL_CONFIG?.dayDates || {})
    .map(Number).sort((a, b) => a - b);

  // Per-night stats — for HISTORY rows.
  const nights = days.map((n) => {
    const dayDate = window.FESTIVAL_CONFIG.dayDates[n] || {};
    const savedThisDay = (state.saved || [])
      .map((id) => window.ARTISTS.find((a) => a.id === id))
      .filter((a) => a && a.day === n);
    const totalMin = savedThisDay.reduce((acc, a) => {
      const s = window.toNightMin?.(a.start) || 0;
      const e = window.toNightMin?.(a.end) || 0;
      return acc + Math.max(0, e - s);
    }, 0);
    // Top stage = stage with the most saved sets on this night
    const stageCounts = {};
    savedThisDay.forEach((a) => { stageCounts[a.stage] = (stageCounts[a.stage] || 0) + 1; });
    const topStageId = Object.keys(stageCounts).sort((x, y) => stageCounts[y] - stageCounts[x])[0];
    const topStage = topStageId ? window.STAGES.find((s) => s.id === topStageId) : null;
    return {
      n,
      label: dayDate.short || `DAY ${n}`,
      name:  dayDate.name  || "",
      count: savedThisDay.length,
      totalMin,
      topStage,
      isPast: typeof window.NOW !== "undefined" && window.NOW.day > n,
      isLive: typeof window.NOW !== "undefined" && window.NOW.day === n,
    };
  });

  // Records — superlatives derived from the saved set
  const records = (() => {
    const out = [];
    const allSaved = (state.saved || [])
      .map((id) => window.ARTISTS.find((a) => a.id === id))
      .filter(Boolean);
    if (allSaved.length === 0) return out;
    // Most saved on one night
    const peakNight = nights.slice().sort((a, b) => b.count - a.count)[0];
    if (peakNight && peakNight.count > 0) {
      out.push({
        label: "BUSIEST NIGHT",
        value: `${peakNight.label} · ${peakNight.count}`,
        accent: peakNight.topStage?.color || "var(--ember)",
      });
    }
    // Top stage across the run
    const stageAll = {};
    allSaved.forEach((a) => { stageAll[a.stage] = (stageAll[a.stage] || 0) + 1; });
    const topId = Object.keys(stageAll).sort((x, y) => stageAll[y] - stageAll[x])[0];
    const topStage = topId ? window.STAGES.find((s) => s.id === topId) : null;
    if (topStage) {
      out.push({
        label: "TOP STAGE",
        value: `${topStage.name.toUpperCase()} · ${stageAll[topId]}×`,
        accent: topStage.color,
      });
    }
    // Longest single set
    const longest = allSaved.slice().sort((x, y) => {
      const xLen = (window.toNightMin?.(y.end) || 0) - (window.toNightMin?.(y.start) || 0);
      const yLen = (window.toNightMin?.(x.end) || 0) - (window.toNightMin?.(x.start) || 0);
      return xLen - yLen;
    })[0];
    if (longest) {
      const len = (window.toNightMin?.(longest.end) || 0) - (window.toNightMin?.(longest.start) || 0);
      if (len > 0) {
        out.push({
          label: "LONGEST SET",
          value: `${longest.name.toUpperCase()} · ${Math.floor(len / 60) ? `${Math.floor(len / 60)}H` : ""}${len % 60}M`,
          accent: window.STAGES.find((s) => s.id === longest.stage)?.color || "var(--horizon)",
        });
      }
    }
    return out;
  })();

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Toggle pills */}
      <div style={{
        display: "inline-flex", padding: 3, gap: 2,
        background: "var(--paper-2)", borderRadius: 999,
        marginBottom: 10,
      }}>
        {["history", "records"].map((k) => {
          const on = view === k;
          return (
            <button key={k} onClick={() => setView(k)} className="mono" style={{
              padding: "5px 12px", borderRadius: 999, border: "none",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink)",
              fontSize: 9, letterSpacing: 1.3, fontWeight: 700,
              cursor: "pointer",
            }}>{k.toUpperCase()}</button>
          );
        })}
      </div>

      {view === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {nights.map((n) => (
            <button key={n.n}
              onClick={() => setState && setState(s => ({ ...s, tab: "memories", memoriesNight: n.n }))}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 12,
                background: "var(--paper-2)",
                borderLeft: `3px solid ${n.topStage?.color || "var(--line-2)"}`,
                opacity: n.count === 0 && !n.isLive ? 0.62 : 1,
                border: "none", cursor: "pointer", textAlign: "left",
                width: "100%",
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="serif" style={{ fontSize: 16, lineHeight: 1.15 }}>
                  {n.name || `Night ${n.n}`}
                  {n.isLive && (
                    <span className="mono" style={{
                      marginLeft: 8, fontSize: 8, letterSpacing: 1.2, fontWeight: 800,
                      color: "var(--success)", background: "rgba(45,122,85,0.14)",
                      padding: "1px 6px", borderRadius: 999,
                      border: "0.5px solid rgba(45,122,85,0.55)",
                    }}>● LIVE</span>
                  )}
                </div>
                <div className="mono" style={{
                  fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 3,
                  display: "flex", gap: 8, flexWrap: "wrap",
                }}>
                  <span>{n.count} {n.count === 1 ? "SET" : "SETS"}</span>
                  {n.totalMin > 0 && (
                    <span>· {Math.floor(n.totalMin / 60) ? `${Math.floor(n.totalMin / 60)}H ` : ""}{n.totalMin % 60}M</span>
                  )}
                  {n.topStage && <span style={{ color: n.topStage.color, fontWeight: 700 }}>· {n.topStage.short || n.topStage.name.split(" ")[0].toUpperCase()}</span>}
                </div>
              </div>
              <div className="mono" style={{
                fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                color: n.isPast ? "var(--muted)" : (n.isLive ? "var(--success)" : "var(--horizon)"),
              }}>{n.isPast ? "DONE" : n.isLive ? "TONIGHT" : "UPCOMING"}</div>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {view === "records" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {records.length === 0 ? (
            <div style={{
              padding: "18px 14px", borderRadius: 12, background: "var(--paper-2)",
              textAlign: "center",
            }}>
              <div className="serif" style={{ fontSize: 16, marginBottom: 4 }}>No records yet</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)" }}>
                SAVE SETS TO UNLOCK SUPERLATIVES
              </div>
            </div>
          ) : records.map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 12,
              background: "var(--paper-2)",
              borderLeft: `3px solid ${r.accent}`,
            }}>
              <div className="mono" style={{
                fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: "var(--muted)",
                width: 110, flexShrink: 0,
              }}>{r.label}</div>
              <div style={{ fontFamily: "Geist, sans-serif", fontSize: 13, fontWeight: 500, flex: 1 }}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Memories: photos + moments per night ──────────────────────────
// Metadata in localStorage (small JSON, sync access for MEMORIES count).
// Photos in IndexedDB (Blob-native, big quota on iOS Safari ~hundreds of MB).
// Zero backend cost — everything stays on-device.

const MOMENTS_KEY = "plursky_moments_v1";

function _readMoments() {
  try { return JSON.parse(localStorage.getItem(MOMENTS_KEY) || "{}"); }
  catch { return {}; }
}
function _writeMoments(all) {
  localStorage.setItem(MOMENTS_KEY, JSON.stringify(all));
}
function _countMoments() {
  const all = _readMoments();
  return Object.values(all).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
}

let _memDbP = null;
function _openMemDB() {
  if (_memDbP) return _memDbP;
  _memDbP = new Promise((resolve, reject) => {
    const req = indexedDB.open("plursky_memories", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
  return _memDbP;
}
async function _putPhoto(id, blob) {
  const db = await _openMemDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}
async function _getPhoto(id) {
  const db = await _openMemDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const r  = tx.objectStore("photos").get(id);
    r.onsuccess = () => resolve(r.result?.blob || null);
    r.onerror   = e => reject(e.target.error);
  });
}
async function _deletePhoto(id) {
  const db = await _openMemDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

// Compress on pick: 720px max edge, JPEG q0.78 → typical 80-150KB.
function _compressMomentImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 720;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (blob) resolve(blob); else reject(new Error("blob conversion failed"));
        }, "image/jpeg", 0.78);
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

// v135: videos go in as-is — no transcoding in-browser (would need FFmpeg
// WASM, way too heavy). Cap at 200 MB per clip so a stray 4K Cinematic
// can't blow out the IndexedDB quota in a single import.
const _MAX_VIDEO_BYTES = 200 * 1024 * 1024;
async function _processMomentMedia(file) {
  if (/^image\//.test(file.type)) {
    return { blob: await _compressMomentImage(file), kind: "image" };
  }
  if (/^video\//.test(file.type)) {
    if (file.size > _MAX_VIDEO_BYTES) {
      throw new Error(`Video too large (${Math.round(file.size / 1048576)} MB > 200 MB cap)`);
    }
    // Store raw — modern iOS records H.265/HEVC which Safari plays natively.
    return { blob: file, kind: "video" };
  }
  throw new Error("Unsupported file type: " + file.type);
}

// Fall back to `file.lastModified` for date when EXIF is missing (always for
// videos, sometimes for screenshots / edited photos). iOS preserves capture
// time as lastModified for camera-roll content, so this is reliable enough
// for set-time matching.
function _metaFromFile(file, exifMeta) {
  const out = { date: exifMeta?.date || null, lat: exifMeta?.lat ?? null, lng: exifMeta?.lng ?? null };
  if (!out.date && file?.lastModified) {
    const d = new Date(file.lastModified);
    out.date = {
      yr: d.getFullYear(), mo: d.getMonth() + 1, dy: d.getDate(),
      hh: d.getHours(), mm: d.getMinutes(), ss: d.getSeconds(),
    };
  }
  return out;
}

function _fmtMomentTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function useMomentPhoto(photoId) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    if (!photoId) { setUrl(null); return; }
    let cancelled = false;
    let objectUrl = null;
    _getPhoto(photoId).then(blob => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);
  return url;
}

function MomentCard({ moment, idx, total, onDelete, onArtistClick }) {
  const photoUrl = useMomentPhoto(moment.photoId);
  const artist = moment.artistId ? ARTISTS.find(a => a.id === moment.artistId) : null;
  const stage  = artist ? STAGES.find(s => s.id === artist.stage) : null;
  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--line)",
      borderRadius: 14, padding: 12, marginBottom: 10,
    }}>
      {moment.photoId && (
        photoUrl ? (
          moment.kind === "video" ? (
            <video src={photoUrl} controls playsInline preload="metadata" style={{
              width: "100%", borderRadius: 10, display: "block",
              marginBottom: moment.text ? 10 : 8,
              background: "#000",
            }}/>
          ) : (
            <img src={photoUrl} alt="" style={{
              width: "100%", borderRadius: 10, display: "block",
              marginBottom: moment.text ? 10 : 8,
            }}/>
          )
        ) : (
          <div style={{
            width: "100%", aspectRatio: "4/3", borderRadius: 10,
            background: "var(--paper)", border: "1px solid var(--line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: moment.text ? 10 : 8,
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700 }}>
              LOADING…
            </span>
          </div>
        )
      )}
      {moment.text && (
        <div className="serif" style={{ fontSize: 17, lineHeight: 1.3, color: "var(--ink)" }}>
          {moment.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {artist && (
          <button onClick={() => onArtistClick(artist.id)} className="mono" style={{
            background: stage ? `${stage.color}18` : "var(--paper)",
            color:      stage ? stage.color       : "var(--muted)",
            border:     stage ? `1px solid ${stage.color}40` : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 9px",
            fontSize: 9, letterSpacing: 1, fontWeight: 700, cursor: "pointer",
          }}>♬ {artist.name.toUpperCase()}</button>
        )}
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", fontWeight: 600 }}>
          {_fmtMomentTime(moment.createdAt)} · {idx + 1}/{total}
        </span>
        <button onClick={() => onDelete(moment)} aria-label="Delete moment" className="mono" style={{
          marginLeft: "auto",
          background: "transparent", border: "none",
          color: "var(--muted)", cursor: "pointer",
          fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
          padding: "3px 5px",
        }}>DELETE</button>
      </div>
    </div>
  );
}

function AddMomentForm({ night, savedNightArtists, onAdd, onCancel }) {
  const [blob,       setBlob]       = React.useState(null);
  const [previewUrl, setPreviewUrl] = React.useState(null);
  const [text,       setText]       = React.useState("");
  const [artistId,   setArtistId]   = React.useState(null);
  const [busy,       setBusy]       = React.useState(false);
  const [err,        setErr]        = React.useState("");

  // Revoke any preview URL on unmount/replace.
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const [mediaKind, setMediaKind] = React.useState("image"); // image | video
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr("");
    try {
      // Read EXIF / fall back to file.lastModified so the matcher can pre-fill
      // the artist chip. _compressMomentImage strips EXIF (canvas re-encode)
      // so we have to read it BEFORE processing.
      const exif = await _parseExifMeta(file).catch(() => null);
      const meta = _metaFromFile(file, exif);
      if (meta && meta.date && !artistId) {
        const matched = _matchArtistForPhoto(meta, savedNightArtists.map(a => a.id));
        if (matched.artistId) setArtistId(matched.artistId);
      }
      const out = await _processMomentMedia(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(out.blob);
      setMediaKind(out.kind);
      setPreviewUrl(URL.createObjectURL(out.blob));
    } catch (err) {
      setErr(err?.message || "Couldn't load that file.");
    }
    setBusy(false);
  };
  const clearPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
  };

  const handleSave = async () => {
    if (!blob && !text.trim()) {
      setErr("Add a photo or some text first.");
      return;
    }
    setBusy(true); setErr("");
    try {
      const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let photoId = null;
      if (blob) {
        photoId = `p_${id}`;
        await _putPhoto(photoId, blob);
      }
      const moment = {
        id, night, text: text.trim(), artistId, photoId,
        kind: blob ? mediaKind : null,
        createdAt: Date.now(),
      };
      onAdd(moment);
    } catch (e) {
      if (e?.name === "QuotaExceededError" || e?.message?.includes("quota")) {
        setErr("Storage full — delete an older moment to free space.");
      } else {
        setErr("Couldn't save. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--line-2)",
      borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 14,
    }}>
      {previewUrl ? (
        <div style={{ position: "relative", marginBottom: 10 }}>
          {mediaKind === "video" ? (
            <video src={previewUrl} controls playsInline
              style={{ width: "100%", borderRadius: 10, display: "block", background: "#000" }}/>
          ) : (
            <img src={previewUrl} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }}/>
          )}
          <button onClick={clearPhoto} aria-label="Remove media" style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: 999,
            background: "rgba(0,0,0,0.55)", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(6px)",
          }}>×</button>
        </div>
      ) : (
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px", background: "var(--paper)", border: "1px dashed var(--line-2)",
          borderRadius: 10, cursor: "pointer", marginBottom: 10,
          color: "var(--muted)",
          fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
        }}>
          <span>📷 ADD PHOTO OR VIDEO (OPTIONAL)</span>
          <input type="file" accept="image/*,video/*"
            onChange={handlePhoto} style={{ display: "none" }}/>
        </label>
      )}

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What happened?"
        rows={2}
        maxLength={240}
        style={{
          width: "100%", padding: "10px 12px", boxSizing: "border-box",
          background: "var(--paper)", border: "1px solid var(--line-2)",
          borderRadius: 10, resize: "none",
          fontFamily: "Geist, sans-serif", fontSize: 14, lineHeight: 1.4,
          color: "var(--ink)", outline: "none", marginBottom: 10,
        }}
      />

      {savedNightArtists.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>
            TAG A SET (OPTIONAL)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {savedNightArtists.map(a => {
              const on = artistId === a.id;
              return (
                <button key={a.id} onClick={() => setArtistId(on ? null : a.id)} className="mono" style={{
                  padding: "5px 10px", borderRadius: 999,
                  background: on ? "var(--ink)"  : "var(--paper)",
                  color:      on ? "var(--paper)" : "var(--ink)",
                  border:     on ? "none"         : "1px solid var(--line-2)",
                  fontSize: 9, letterSpacing: 1, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}>{a.name.toUpperCase()}</button>
              );
            })}
          </div>
        </div>
      )}

      {err && (
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1, color: "#c14a4a", marginBottom: 10, fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} disabled={busy} className="mono" style={{
          flex: 1, padding: "11px", borderRadius: 10,
          background: "transparent", border: "1px solid var(--line-2)", color: "var(--ink)",
          fontSize: 10, letterSpacing: 1.2, fontWeight: 700, cursor: busy ? "default" : "pointer",
        }}>CANCEL</button>
        <button onClick={handleSave} disabled={busy} className="mono" style={{
          flex: 2, padding: "11px", borderRadius: 10,
          background: busy ? "var(--muted)" : "var(--ember)",
          color: "#fff", border: "none",
          fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
          cursor: busy ? "default" : "pointer",
        }}>{busy ? "WORKING…" : "✓ SAVE MOMENT"}</button>
      </div>
    </div>
  );
}

// ── EXIF + auto-tag (v135) ────────────────────────────────────
// Parse JPEG EXIF for DateTimeOriginal + GPSLatitude/Longitude so a
// photo dragged in from Camera Roll lands on the right artist without
// the user picking from a chip list. iOS encodes EXIF time as local
// wall-clock (no tz) — at EDC that's PT, so we treat the parsed
// "YYYY:MM:DD HH:MM:SS" string as PT and convert to epoch ms via the
// festival's day-midnight UTC constants (which already bake in PT).

const _EXIF_TAG_EXIF_IFD = 0x8769;
const _EXIF_TAG_GPS_IFD  = 0x8825;
const _EXIF_TAG_DATETIME_ORIGINAL = 0x9003;
const _EXIF_TAG_GPS_LAT_REF = 0x0001;
const _EXIF_TAG_GPS_LAT     = 0x0002;
const _EXIF_TAG_GPS_LNG_REF = 0x0003;
const _EXIF_TAG_GPS_LNG     = 0x0004;

async function _parseExifMeta(file) {
  const out = { date: null, lat: null, lng: null };
  if (!file || !/^image\//.test(file.type)) return out;
  try {
    // 256 KB is enough for the APP1 segment on any modern phone photo.
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return out; // not a JPEG → no EXIF
    let off = 2;
    while (off + 4 < dv.byteLength) {
      if (dv.getUint8(off) !== 0xFF) break;
      const marker = dv.getUint16(off);
      const len    = dv.getUint16(off + 2);
      if (marker === 0xFFE1 && len > 8) {
        // "Exif\0\0" header at off+4
        const exifHdr =
          dv.getUint8(off + 4) === 0x45 && // E
          dv.getUint8(off + 5) === 0x78 && // x
          dv.getUint8(off + 6) === 0x69 && // i
          dv.getUint8(off + 7) === 0x66;   // f
        if (!exifHdr) { off += 2 + len; continue; }
        const tiff = off + 10;
        const byteOrder = dv.getUint16(tiff);
        const little = byteOrder === 0x4949;
        const u16 = (p) => dv.getUint16(p, little);
        const u32 = (p) => dv.getUint32(p, little);
        if (u16(tiff + 2) !== 0x002A) return out;
        const ifd0 = tiff + u32(tiff + 4);
        const readEntries = (ifdOff) => {
          const n = u16(ifdOff);
          const entries = {};
          for (let i = 0; i < n; i++) {
            const eOff = ifdOff + 2 + i * 12;
            entries[u16(eOff)] = {
              type:  u16(eOff + 2),
              count: u32(eOff + 4),
              valOff: eOff + 8, // 4-byte value or pointer
            };
          }
          return entries;
        };
        const ifd0Entries = readEntries(ifd0);
        // ExifIFD → DateTimeOriginal
        const exifPtr = ifd0Entries[_EXIF_TAG_EXIF_IFD];
        if (exifPtr) {
          const exifIfd = tiff + u32(exifPtr.valOff);
          const exifEntries = readEntries(exifIfd);
          const dto = exifEntries[_EXIF_TAG_DATETIME_ORIGINAL];
          if (dto && dto.count > 0) {
            // ASCII at value or pointer (string > 4 bytes → pointer)
            const strOff = dto.count > 4 ? tiff + u32(dto.valOff) : dto.valOff;
            let str = "";
            for (let i = 0; i < Math.min(dto.count - 1, 24); i++) {
              const c = dv.getUint8(strOff + i);
              if (c === 0) break;
              str += String.fromCharCode(c);
            }
            // Format: "YYYY:MM:DD HH:MM:SS"
            const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(str);
            if (m) {
              // Build PT epoch — EDC festival is in Vegas (UTC-7 PDT in May).
              // FESTIVAL_CONFIG.dayDates[*].midnightUtc already encodes that
              // (e.g. May 15 00:00 PT = May 15 07:00 UTC). We compute the
              // photo's offset from its calendar day's PT midnight, then add
              // to the day's midnightUtc to land on a true UTC epoch.
              const yr = +m[1], mo = +m[2], dy = +m[3];
              const hh = +m[4], mm = +m[5], ss = +m[6];
              // For now, ignore the date-from-EXIF year/month and just use
              // time-of-day vs. nearest festival night. This sidesteps EXIF
              // timezone weirdness — if a photo was taken at 11:30 PM it was
              // taken at 11:30 PM whatever the device clock thinks the day is.
              out.date = { yr, mo, dy, hh, mm, ss };
            }
          }
        }
        // GPSIFD → Latitude + Longitude
        const gpsPtr = ifd0Entries[_EXIF_TAG_GPS_IFD];
        if (gpsPtr) {
          const gpsIfd = tiff + u32(gpsPtr.valOff);
          const gpsEntries = readEntries(gpsIfd);
          const readRationalDeg = (entry) => {
            if (!entry || entry.count !== 3 || entry.type !== 5) return null;
            const off2 = tiff + u32(entry.valOff);
            const r = (p) => u32(p) / u32(p + 4);
            return r(off2) + r(off2 + 8) / 60 + r(off2 + 16) / 3600;
          };
          const lat = readRationalDeg(gpsEntries[_EXIF_TAG_GPS_LAT]);
          const lng = readRationalDeg(gpsEntries[_EXIF_TAG_GPS_LNG]);
          if (lat != null) {
            const refEntry = gpsEntries[_EXIF_TAG_GPS_LAT_REF];
            const refCh = refEntry ? String.fromCharCode(dv.getUint8(refEntry.valOff)) : "N";
            out.lat = refCh === "S" ? -lat : lat;
          }
          if (lng != null) {
            const refEntry = gpsEntries[_EXIF_TAG_GPS_LNG_REF];
            const refCh = refEntry ? String.fromCharCode(dv.getUint8(refEntry.valOff)) : "E";
            out.lng = refCh === "W" ? -lng : lng;
          }
        }
        return out;
      }
      off += 2 + len;
    }
  } catch {}
  return out;
}

// Given EXIF metadata + the list of saved-set IDs the user has tagged for
// any night, pick the best matching artist:
//   1. Prefer an artist whose set window contains the photo time AND whose
//      stage is closest to the photo GPS (if GPS available).
//   2. If no time match in saved sets, expand to ALL artists on that night.
//   3. If still nothing, return null.
// v146 fix: use the photo's actual DATE (yr/mo/dy) to determine which
// festival night it belongs to BEFORE matching artists. The prior version
// only used time-of-day, which meant a Saturday 10:30 PM photo could be
// tagged as a Friday artist whose set happened to overlap 10:30 PM.
//
// Festival night N runs from Day N at 19:00 local to Day N+1 at 06:00 local.
// `FESTIVAL_CONFIG.dayDates[n].midnightUtc` is the UTC epoch corresponding
// to Day N's local 00:00, so [+19h, +30h] is the night window in UTC.
function _festivalTzOffsetHours() {
  const day1 = window.FESTIVAL_CONFIG?.dayDates?.[1];
  if (!day1) return -7; // PT default
  return -new Date(day1.midnightUtc).getUTCHours();
}
function _photoEpochUtc(date) {
  // EXIF DateTimeOriginal / file.lastModified gives festival-local wall
  // clock (iOS phones store capture time in device-local, no tz). Convert
  // to UTC epoch using the festival's offset.
  const offset = _festivalTzOffsetHours(); // e.g. -7 for PDT
  return Date.UTC(date.yr, date.mo - 1, date.dy, date.hh, date.mm, date.ss || 0)
       - offset * 3600000;
}
function _photoFestivalNight(date) {
  if (!date) return null;
  const cfg = window.FESTIVAL_CONFIG;
  if (!cfg?.dayDates) return null;
  const photoMs = _photoEpochUtc(date);
  for (const n of Object.keys(cfg.dayDates).map(Number)) {
    const dm = cfg.dayDates[n];
    if (!dm) continue;
    const startMs = dm.midnightUtc + 19 * 3600000;     // 19:00 PT of day N
    const endMs   = dm.midnightUtc + 30 * 3600000;     // 06:00 PT day N+1
    if (photoMs >= startMs - 30 * 60000 && photoMs <= endMs + 30 * 60000) return n;
  }
  return null;
}

function _matchArtistForPhoto({ date, lat, lng }, savedIds) {
  if (!date) return { artistId: null, night: null, reason: "no_date" };
  // First: which festival night does this photo's DATE place it in?
  const night = _photoFestivalNight(date);
  if (!night) return { artistId: null, night: null, reason: "outside_festival_window" };

  // Then: which artist on THAT night was playing at the photo's time?
  const minOfDay = date.hh * 60 + date.mm;
  const adjustedMin = minOfDay < 360 ? minOfDay + 1440 : minOfDay;
  const candidates = [];
  for (const a of (window.ARTISTS || [])) {
    if (a.day !== night) continue;
    const [sh, sm] = a.start.split(":").map(Number);
    const [eh, em] = a.end.split(":").map(Number);
    const startMin = (sh < 6 ? sh + 24 : sh) * 60 + sm;
    const endMin   = (eh < 6 ? eh + 24 : eh) * 60 + em;
    if (adjustedMin >= startMin - 5 && adjustedMin <= endMin + 10) {
      candidates.push({ a, startMin, endMin });
    }
  }
  if (candidates.length === 0) {
    // We know the night but no specific artist — return the night so the
    // photo still lands in the right bucket (e.g. between sets, in the
    // shuttle line, etc.).
    return { artistId: null, night, reason: "no_artist_at_time" };
  }
  // Prefer saved artists; GPS tiebreaker; then tightest time fit
  const savedSet = new Set(savedIds || []);
  const inSaved = candidates.filter(c => savedSet.has(c.a.id));
  const pool = inSaved.length > 0 ? inSaved : candidates;
  const stageDist = (a) => {
    if (lat == null || lng == null) return Infinity;
    const anchor = (window.FESTIVAL_CONFIG?.gpsAnchors || []).find(g => g.stageId === a.stage);
    if (!anchor) return Infinity;
    const dLat = lat - anchor.lat, dLng = lng - anchor.lng;
    return dLat * dLat + dLng * dLng;
  };
  pool.sort((x, y) => {
    const dx = stageDist(x.a), dy = stageDist(y.a);
    if (dx !== Infinity && dy !== Infinity && Math.abs(dx - dy) > 1e-9) return dx - dy;
    return Math.abs(adjustedMin - x.startMin) - Math.abs(adjustedMin - y.startMin);
  });
  return { artistId: pool[0].a.id, night, reason: "matched" };
}

function MemoriesScreen({ state, setState }) {
  const [all, setAll] = React.useState(_readMoments);
  const [adding, setAdding] = React.useState(null); // night number being added to, or null
  const [batch, setBatch] = React.useState(null);   // null | { total, done, results: [{name, night, artistId, err?}] }
  const batchInputRef = React.useRef(null);
  const nightSectionRefs = React.useRef({});

  // v141: when a user taps a FRI/SAT/SUN row on the Me-tab History list,
  // it sets state.memoriesNight + state.tab="memories". This effect scrolls
  // that night's section to the top of the ScrollBody so the user lands
  // on the right place + clears the hint so a manual navigation later
  // doesn't snap them back.
  React.useEffect(() => {
    if (!state.memoriesNight) return;
    const id = requestAnimationFrame(() => {
      const el = nightSectionRefs.current[state.memoriesNight];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "instant", block: "start" });
      setState(s => ({ ...s, memoriesNight: null }));
    });
    return () => cancelAnimationFrame(id);
  }, [state.memoriesNight]);

  const handleAdd = (moment) => {
    const next = { ..._readMoments() };
    next[moment.night] = [...(next[moment.night] || []), moment];
    _writeMoments(next);
    setAll(next);
    setAdding(null);
  };

  // Auto-import multiple photos at once. For each file we read EXIF, ask the
  // matcher which artist+night it belongs to, compress + save to IndexedDB,
  // and write a moment. Photos with no EXIF date are skipped (the user can
  // still manually add them via the per-night ADD MOMENT button).
  const handleBatchPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-pick of same files
    if (files.length === 0) return;
    const results = [];
    setBatch({ total: files.length, done: 0, results });
    const savedIds = state.saved || [];
    const current = { ..._readMoments() };
    // Fallback target night when we can't infer one from EXIF: prefer the
    // current festival day, then yesterday (post-midnight shoot earlier in
    // the morning), else the first festival night. Better to import every
    // photo into SOME night so the user can re-tag than silently skip.
    const allNights = Object.keys(window.FESTIVAL_CONFIG?.dayDates || {}).map(Number).sort((a, b) => a - b);
    const fallbackNight = (window.NOW?.day && allNights.includes(window.NOW.day))
      ? window.NOW.day
      : (allNights[allNights.length - 1] || 1);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const exif = await _parseExifMeta(f).catch(() => null);
        const meta = _metaFromFile(f, exif);
        const matched = meta?.date ? _matchArtistForPhoto(meta, savedIds) : { artistId: null, night: null, reason: "no_date" };
        // v141: never skip — if EXIF/lastModified didn't pick a night, drop
        // into the current festival night untagged. User can re-tag from
        // the moment card later or delete if it doesn't belong.
        const night = matched.night || fallbackNight;
        const out = await _processMomentMedia(f);
        const id = `m_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        const photoId = `p_${id}`;
        await _putPhoto(photoId, out.blob);
        const moment = {
          id, night, text: "", artistId: matched.artistId, photoId,
          kind: out.kind,
          createdAt: Date.now(),
          takenAt: meta?.date ? `${meta.date.yr}-${String(meta.date.mo).padStart(2,"0")}-${String(meta.date.dy).padStart(2,"0")} ${String(meta.date.hh).padStart(2,"0")}:${String(meta.date.mm).padStart(2,"0")}` : null,
          // Mark fallback drops so the UI can show a "Tap to retag" hint.
          autoTagged: !!matched.artistId,
        };
        current[night] = [...(current[night] || []), moment];
        results.push({ name: f.name, night, artistId: matched.artistId, fallback: !matched.night });
      } catch (err) {
        results.push({ name: f.name, night: null, artistId: null, err: err?.message || "failed" });
      }
      setBatch({ total: files.length, done: i + 1, results: results.slice() });
    }
    _writeMoments(current);
    setAll(current);
    // Auto-dismiss summary banner after 6s if user doesn't tap it
    setTimeout(() => setBatch(b => (b && b.done === b.total ? null : b)), 6000);
  };

  const handleDelete = async (moment) => {
    if (!window.confirm("Delete this moment?")) return;
    if (moment.photoId) { try { await _deletePhoto(moment.photoId); } catch {} }
    const next = { ..._readMoments() };
    for (const n of Object.keys(next)) {
      next[n] = (next[n] || []).filter(m => m.id !== moment.id);
    }
    _writeMoments(next);
    setAll(next);
  };

  const totalCount = Object.values(all).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setState(s => ({ ...s, tab: "me" }))} aria-label="Back" style={{
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          fontSize: 22, color: "var(--ink)", lineHeight: 1,
          width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TopBar
            title={<span>Memories</span>}
            sub={`${totalCount} ${totalCount === 1 ? "MOMENT" : "MOMENTS"} · ${FESTIVAL_CONFIG.shortName.toUpperCase()}`}
            tight
          />
        </div>
      </div>
      <ScrollBody style={{ padding: "0 20px 94px" }}>
        {/* v135 batch import — auto-tags each photo by EXIF time + GPS,
            then drops it into the right night without further input. */}
        <input
          ref={batchInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleBatchPick}
          style={{ display: "none" }}
        />
        <button onClick={() => batchInputRef.current?.click()}
          disabled={!!batch && batch.done < batch.total}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", marginTop: 12, padding: "12px 14px",
            background: "linear-gradient(135deg, rgba(232,93,46,0.12), rgba(123,61,154,0.10))",
            border: "1px solid rgba(232,93,46,0.4)",
            borderRadius: 14, color: "var(--ink)", cursor: "pointer",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 17 }}>✨</span>
            <div style={{ textAlign: "left" }}>
              <div className="serif" style={{ fontSize: 16, lineHeight: 1.1 }}>Import from camera roll</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2, fontWeight: 700 }}>
                AUTO-TAGS BY TIME + LOCATION
              </div>
            </div>
          </div>
          <span className="mono" style={{
            background: "var(--ember)", color: "#fff",
            padding: "5px 11px", borderRadius: 999,
            fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
          }}>{batch && batch.done < batch.total ? `${batch.done}/${batch.total}` : "PICK"}</span>
        </button>
        {batch && batch.done === batch.total && (() => {
          const ok = batch.results.filter(r => !r.err).length;
          const skip = batch.results.length - ok;
          return (
            <div onClick={() => setBatch(null)} style={{
              marginTop: 8, padding: "9px 12px",
              background: "rgba(45,122,85,0.12)", border: "1px solid rgba(45,122,85,0.4)",
              borderRadius: 10, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: "var(--success)", fontWeight: 700 }}>
                ✓ {ok} ADDED{skip > 0 ? ` · ${skip} SKIPPED (NO TIME/LOCATION DATA)` : ""}
              </span>
              <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>TAP TO DISMISS</span>
            </div>
          );
        })()}
        {DAYS.map(d => {
          const moments = (all[d.n] || []).slice().sort((a, b) => a.createdAt - b.createdAt);
          const dateInfo = FESTIVAL_CONFIG.dayDates?.[d.n];
          const savedNightArtists = state.saved
            .map(id => ARTISTS.find(a => a.id === id))
            .filter(a => a && a.day === d.n);
          return (
            <div key={d.n}
              ref={el => { nightSectionRefs.current[d.n] = el; }}
              style={{ marginBottom: 22, scrollMarginTop: 12 }}
            >
              <div style={{
                display: "flex", alignItems: "baseline", gap: 10,
                paddingTop: 14, paddingBottom: 8, marginBottom: 4,
                borderBottom: "1px solid var(--line)",
              }}>
                <div className="serif" style={{ fontSize: 24, color: "var(--ink)" }}>
                  {d.label}
                </div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", fontWeight: 700 }}>
                  · {(dateInfo?.short || `DAY ${d.n}`).toString().toUpperCase()}
                </div>
                {moments.length > 0 && (
                  <div className="mono" style={{ marginLeft: "auto", fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700 }}>
                    {moments.length} MOMENT{moments.length === 1 ? "" : "S"}
                  </div>
                )}
              </div>

              {moments.length === 0 && adding !== d.n && (
                <div style={{
                  padding: "18px 14px", textAlign: "center",
                  border: "1px dashed var(--line-2)", borderRadius: 14,
                  background: "var(--paper-2)", marginTop: 10, marginBottom: 10,
                }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700 }}>
                    NO MOMENTS YET
                  </div>
                </div>
              )}

              {moments.map((m, i) => (
                <MomentCard
                  key={m.id}
                  moment={m}
                  idx={i}
                  total={moments.length}
                  onDelete={handleDelete}
                  onArtistClick={(id) => setState(s => ({ ...s, artist: id }))}
                />
              ))}

              {adding === d.n ? (
                <AddMomentForm
                  night={d.n}
                  savedNightArtists={savedNightArtists}
                  onAdd={handleAdd}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <button onClick={() => setAdding(d.n)} className="mono" style={{
                  width: "100%", padding: "12px",
                  background: "transparent", border: "1px dashed var(--line-2)",
                  borderRadius: 12, color: "var(--ink)",
                  fontSize: 10, letterSpacing: 1.4, fontWeight: 700, cursor: "pointer",
                  marginTop: moments.length > 0 ? 4 : 0,
                }}>+ ADD MOMENT</button>
              )}

              {savedNightArtists.length > 0 && (
                <AttendanceReview night={d.n} savedNightArtists={savedNightArtists} />
              )}
            </div>
          );
        })}
      </ScrollBody>
    </Screen>
  );
}

// v137: manual attendance review — checkbox list of every saved set for a
// given night. Toggling persists via markAttended/unmarkAttended which both
// emit the "plursky-attended-change" event so other UI (Me-tab SETS CAUGHT)
// stays in sync.
function AttendanceReview({ night, savedNightArtists }) {
  const [attended, setAttended] = React.useState(() => getAttendedForNight(night));
  React.useEffect(() => {
    const refresh = () => setAttended(getAttendedForNight(night));
    window.addEventListener("plursky-attended-change", refresh);
    return () => window.removeEventListener("plursky-attended-change", refresh);
  }, [night]);
  const toggle = (id) => {
    if (attended.has(id)) unmarkAttended(night, id);
    else markAttended(night, id, "manual");
  };
  const caught = savedNightArtists.filter(a => attended.has(a.id)).length;
  return (
    <div style={{
      marginTop: 10, padding: "12px 14px",
      background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 12,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700 }}>
          SETS YOU CAUGHT
        </div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: caught === savedNightArtists.length ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
          {caught} / {savedNightArtists.length}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {savedNightArtists
          .slice()
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(a => {
            const on = attended.has(a.id);
            const stage = STAGES.find(s => s.id === a.stage);
            const src = on ? getAttendanceSource(a.id) : null;
            return (
              <button key={a.id} onClick={() => toggle(a.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8,
                background: on ? "rgba(45,122,85,0.10)" : "var(--paper)",
                border: on ? "1px solid rgba(45,122,85,0.4)" : "1px solid var(--line)",
                cursor: "pointer", textAlign: "left",
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: on ? "var(--success)" : "transparent",
                  border: on ? "none" : "1.5px solid var(--line-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 11, fontWeight: 700,
                }}>{on ? "✓" : ""}</span>
                <div style={{ width: 3, alignSelf: "stretch", background: stage?.color || "var(--line-2)", borderRadius: 3 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="serif" style={{ fontSize: 15, lineHeight: 1.1 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2, fontWeight: 600 }}>
                    {(stage?.short || "").toUpperCase()} · {a.start}
                  </div>
                </div>
                {src === "gps" && (
                  <span className="mono" style={{
                    fontSize: 8, letterSpacing: 1, color: "var(--success)", fontWeight: 700,
                    padding: "2px 6px", borderRadius: 999,
                    background: "rgba(45,122,85,0.14)",
                  }}>📍 GPS</span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function MeScreen({ state, setState }) {
  // Build identity from Spotify profile when available, else fall back to user-set name
  const [profile, setProfile] = React.useState(getSpotifyProfileSync);
  const [localName, setLocalName] = React.useState(() => {
    try { return localStorage.getItem("plursky_display_name") || localStorage.getItem("user_name") || ""; } catch { return ""; }
  });
  React.useEffect(() => {
    if (state.spotifyConnected && !profile) {
      ensureSpotifyProfile().then(setProfile);
    }
  }, [state.spotifyConnected]);

  // Resolve display name from Spotify profile → display_name → user_name
  // (matches Runbuds-style identity: serif name + ping chip + tagline).
  const rawName = profile?.name || localName || "";
  const displayName = rawName || "—";
  const initial = rawName ? (rawName.match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase() : "?";
  const promptName = () => {
    const next = (window.prompt("Your name (shown to crew & on this screen):", localName || "") || "").trim();
    if (!next) return;
    try { localStorage.setItem("plursky_display_name", next); } catch {}
    setLocalName(next);
  };

  // Ping code (e.g. SAGE) — exported on window by map.jsx
  const pingCode = (typeof window.getMyPingCode === "function" ? window.getMyPingCode() : "PLUR");

  // Deterministic ping color from code → palette token. Stays in the
  // desert-dawn family (ember/flare/horizon/sky/success). Avatar circle
  // + ping chip dot pull from this so identity reads consistent.
  const PING_PALETTE = ["var(--ember)", "var(--flare)", "var(--horizon)", "var(--sky)", "var(--success)"];
  let pingHash = 0;
  for (let i = 0; i < pingCode.length; i++) pingHash = (pingHash * 31 + pingCode.charCodeAt(i)) >>> 0;
  const pingColor = PING_PALETTE[pingHash % PING_PALETTE.length];

  // Live crew count from Supabase Realtime presence (0 if not connected)
  const [crewCount, setCrewCount] = React.useState(() => {
    try {
      const snap = window.sbGetPresSnap?.() || {};
      const mine = window.sbGetMyPresId?.();
      return Object.keys(snap).filter(id => id !== mine).length;
    } catch { return 0; }
  });
  React.useEffect(() => {
    if (typeof window.sbOnPresenceChange !== "function") return;
    return window.sbOnPresenceChange(snap => {
      try {
        const mine = window.sbGetMyPresId?.();
        setCrewCount(Object.keys(snap).filter(id => id !== mine).length);
      } catch {}
    });
  }, []);

  // Settings (Notifications / Battery / Pack list / Wizard) folded into a
  // single disclosure so the festival-flavored top of the page reads first.
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Stats — kept locally per the spec; intentionally cheap, not precious.
  // SETS CAUGHT now reflects real attendance (live GPS auto-detect + manual
  // review checklist in Memories). Re-renders on any attendance change via
  // the global "plursky-attended-change" event.
  const [setsCaught, setSetsCaught] = React.useState(getAttendedCount);
  React.useEffect(() => {
    const refresh = () => setSetsCaught(getAttendedCount());
    window.addEventListener("plursky-attended-change", refresh);
    return () => window.removeEventListener("plursky-attended-change", refresh);
  }, []);
  const daysHere = NOW.day || 0;
  const savedCount = state.saved.length;
  // Earned-badge count for the 4-card grid badge — cheap derivation mirroring
  // BadgesSection's logic. Always at least 1 (the "30 Years Crew" auto-earn).
  const badgesEarnedCount = React.useMemo(() => {
    const savedArtists = state.saved.map(id => ARTISTS.find(x => x.id === id)).filter(Boolean);
    const stages = new Set(savedArtists.map(a => a.stage));
    const heads  = savedArtists.filter(a => a.tier === 3).length;
    const byStg  = (id) => savedArtists.filter(a => a.stage === id).length;
    let n = 1; // 30 Years Crew always
    if (savedArtists.length >= 1) n++;
    if (savedArtists.length >= 10) n++;
    if (savedArtists.length >= 20) n++;
    if (stages.size >= 5) n++;
    if (stages.size >= 9) n++;
    if (heads >= 3) n++;
    if (byStg("quantum") >= 3) n++;
    if (byStg("neon") >= 3) n++;
    if (byStg("circuit") >= 3) n++;
    if (byStg("basspod") + byStg("waste") >= 3) n++;
    return n;
  }, [state.saved]);

  // Tagline — "DAY N OF EDC LV 2026" once the festival is live, otherwise
  // a pre-festival countdown line with the date range.
  const tagline = daysHere
    ? `DAY ${daysHere} OF EDC LV 2026`
    : "EDC LV 2026 · MAY 15–17";

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Me</span>} sub={FESTIVAL_CONFIG.shortName.toUpperCase()} tight />
      </div>
      <ScrollBody style={{ padding: "10px 20px 94px" }}>
        {/* ── 1. Identity card (Runbuds-modeled) ───────────────────
            Centered avatar in the user's ping color, serif name,
            ping-code chip in mono caps, festival-day tagline. */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "18px 16px 20px", marginBottom: 16,
        }}>
          <div
            onClick={profile ? undefined : promptName}
            style={{
              width: 78, height: 78, borderRadius: 999,
              background: profile?.image ? "transparent" : pingColor,
              border: "3px solid #fff",
              boxShadow: "0 2px 8px rgba(26,18,13,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
              cursor: profile ? "default" : "pointer",
              marginBottom: 10,
            }}
          >
            {profile?.image ? (
              <img src={profile.image} alt="" style={{
                width: "100%", height: "100%", objectFit: "cover",
              }}/>
            ) : (
              <span className="serif" style={{
                fontSize: 36, color: "#fff", lineHeight: 1,
                textShadow: "0 1px 2px rgba(26,18,13,0.25)",
              }}>{initial}</span>
            )}
          </div>
          <div
            className="serif"
            onClick={rawName ? undefined : promptName}
            style={{
              fontSize: 28, lineHeight: 1.05, color: rawName ? "var(--ink)" : "var(--muted)",
              textAlign: "center", marginBottom: 8,
              cursor: rawName ? "default" : "pointer",
            }}
          >
            {displayName}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--paper-2)", borderRadius: 999, padding: "4px 10px",
            marginBottom: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 999, background: pingColor,
              display: "inline-block",
            }}/>
            <span className="mono" style={{
              fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: "var(--ink)",
            }}>PING · {pingCode}</span>
          </div>
          <div className="mono" style={{
            fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: "var(--muted)",
          }}>{tagline}</div>
        </div>

        {/* ── 2. Three-stat row (Forest-modeled) ───────────────────
            Sets caught (saved sets whose day has passed/is today),
            crew (live presence count), days here (NOW.day). */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 14, padding: "14px 4px", marginBottom: 18,
        }}>
          {[
            { n: setsCaught, label: "SETS CAUGHT" },
            { n: crewCount,  label: "CREW" },
            { n: daysHere,   label: "DAYS HERE" },
          ].map((s, i) => (
            <div key={s.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              borderLeft: i === 0 ? "none" : "1px solid var(--line)",
              padding: "2px 6px",
            }}>
              <div className="serif" style={{ fontSize: 28, lineHeight: 1, color: "var(--ink)", marginBottom: 6 }}>
                {s.n}
              </div>
              <div className="mono" style={{
                fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: "var(--muted)",
                textAlign: "center",
              }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── 3. 4-card grid (komoot-modeled) ──────────────────────
            Quick jumps to Saved, Memories (stub), Crew (stub),
            Badges (stub). 2x2 square-ish cells with emoji + count. */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          marginBottom: 22,
        }}>
          {[
            { key: "saved",    label: "SAVED",    count: savedCount, icon: "★",
              onClick: () => setState(st => ({ ...st, tab: "lineup" })) },
            { key: "memories", label: "MEMORIES", count: _countMoments(), icon: "◐",
              onClick: () => setState(s => ({ ...s, tab: "memories" })) },
            { key: "crew",     label: "CREW",     count: crewCount,   icon: "☷",
              onClick: () => alert("See Crew below") },
            { key: "badges",   label: "BADGES",   count: badgesEarnedCount, icon: "✦",
              onClick: () => {
                document.getElementById("plursky-badges-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
              } },
          ].map(card => (
            <button key={card.key} onClick={card.onClick} style={{
              position: "relative",
              background: "var(--paper-2)", border: "1px solid var(--line)",
              borderRadius: 14, padding: 14, minHeight: 96,
              display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "space-between",
              textAlign: "left", cursor: "pointer",
              fontFamily: "inherit", color: "var(--ink)",
            }}>
              <div style={{
                position: "absolute", top: 12, right: 14,
                fontSize: 18, lineHeight: 1, color: "var(--muted)",
              }}>{card.icon}</div>
              <div/>
              <div>
                <div className="serif" style={{ fontSize: 22, lineHeight: 1, color: "var(--ink)" }}>
                  {card.count}
                </div>
                <div className="mono" style={{
                  fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: "var(--muted)",
                  marginTop: 4,
                }}>{card.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Festival Recap entry (v145) ───────────────────────────
            Spotify-Wrapped-style summary of the weekend — sets caught,
            top stage, top genre, hidden gems. Lives behind a big card
            on Me so it's discoverable but optional. Only renders once
            the festival is over (otherwise the stats are noise). */}
        {typeof window.FESTIVAL_CONFIG?.endMs === "number" && Date.now() > window.FESTIVAL_CONFIG.endMs && (
          <button onClick={() => setState(s => ({ ...s, tab: "recap" }))} style={{
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: "14px 16px", marginBottom: 14,
            background: "linear-gradient(135deg, var(--ink) 0%, var(--horizon) 100%)",
            border: "none", borderRadius: 16,
            color: "var(--paper)", cursor: "pointer", textAlign: "left",
            boxShadow: "0 4px 18px rgba(123,61,154,0.30)",
          }}>
            <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>✦</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 21, lineHeight: 1.05 }}>
                Your <span style={{ fontStyle: "italic", color: "var(--flare)" }}>EDC</span> weekend
              </div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "rgba(247,237,224,0.65)", marginTop: 4, fontWeight: 700 }}>
                THE RECAP · {getAttendedCount?.() || 0} SETS CAUGHT · TAP TO SEE
              </div>
            </div>
            <span style={{ fontSize: 18, opacity: 0.75 }}>→</span>
          </button>
        )}

        {/* ── History / Records toggle (Runbuds-modeled) ────────────
            Night-by-night recap rows + festival superlatives below the
            stat grid. History = per-day saved-set count + time + top
            stage; Records = derived best-of stats from saved data. */}
        <HistoryRecordsSection state={state} setState={setState} />

        {/* ── Badges (Me+ / Plenty of Fish-modeled) ─────────────────
            Festival milestones earned from saved-set behavior. Earned
            badges full-color; locked ones grayed with their unlock
            criteria visible so users know what to chase. */}
        <div id="plursky-badges-anchor"/>
        <BadgesSection state={state} />

        {/* Music — primary entry to SpotifyScreen now that the Music tab is
            gone (v92 fold). Connect status is the headline; tapping opens
            the full Music screen with top artists, discoveries, playlist build. */}
        <button
          onClick={() => setState({ ...state, tab: "spotify" })}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: "13px 14px", marginBottom: 14,
            background: state.spotifyConnected
              ? "linear-gradient(135deg, rgba(29,185,84,0.12), rgba(123,61,154,0.10))"
              : "var(--paper-2)",
            border: state.spotifyConnected
              ? "1px solid rgba(29,185,84,0.4)"
              : "1px solid var(--line-2)",
            borderRadius: 14, cursor: "pointer", textAlign: "left",
          }}>
          <div style={{
            width: 38, height: 38, borderRadius: 38, flexShrink: 0,
            background: state.spotifyConnected
              ? "linear-gradient(135deg, #1DB954, var(--horizon))"
              : "linear-gradient(135deg, var(--ember), var(--horizon))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="15" r="2.5"/>
              <path d="M9.5 17 L9.5 5 L19.5 3 L19.5 15"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 18, lineHeight: 1.05, color: "var(--ink)" }}>
              {state.spotifyConnected ? "Music · matched" : "Match the lineup to your Spotify"}
            </div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
              {state.spotifyConnected ? "TOP ARTISTS · DISCOVERIES · BUILD PLAYLIST" : "TAP TO CONNECT"}
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 18 L15 12 L9 6"/>
          </svg>
        </button>

        {/* Friends — live via Supabase Realtime Presence */}
        <div style={{ marginBottom: 20 }}>
          <FriendsCard state={state} setState={setState} />
        </div>

        {/* Crew mode — shared saved lineups */}
        <div style={{ marginBottom: 20 }}>
          <CrewCard state={state} />
        </div>

        {/* Cloud account / sync */}
        <AccountCard state={state} setState={setState} />

        {/* Settings — folds Notifications, Battery saver, Pack list, and the
            setup-wizard re-run into one disclosure to keep the festival top
            of the page above the fold. */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            style={{
              width: "100%", padding: "13px 14px",
              background: "var(--paper-2)", border: "1px solid var(--line-2)",
              borderRadius: 14, cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", gap: 12,
              fontFamily: "inherit", color: "var(--ink)",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 18, lineHeight: 1.05 }}>Settings</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
                NOTIFICATIONS · BATTERY · PACK LIST · WIZARD
              </div>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: "transform 0.2s", transform: settingsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
              <path d="M9 18 L15 12 L9 6"/>
            </svg>
          </button>
          {settingsOpen && (
            <div style={{ marginTop: 10 }}>
              <NotificationsCard state={state} />
              <BatterySaverCard />
              <PackListCard />
              <div style={{ marginTop: 14 }}>
                <button onClick={() => window.plurskyOpenOnboarding?.()} style={{
                  background: "transparent", border: "1px solid var(--line-2)",
                  borderRadius: 999, padding: "8px 14px", cursor: "pointer",
                  color: "var(--muted)",
                  fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 600,
                }}>
                  ↻ RE-RUN SETUP WIZARD
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Safety & Wellness — harm-reduction one tap away */}
        <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 3 }}>
          Safety & <span style={{ fontStyle: "italic" }}>care</span>
        </div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginBottom: 12 }}>
          ON-SITE TEAMS · NO QUESTIONS ASKED
        </div>
        <SafetyCards />

        {/* Your headliners — saved tier-3 sets, tappable to artist screen.
            Replaces the old static "Memories" grid which was unlinked
            decoration. Hidden if the user hasn't saved any headliners yet. */}
        {(() => {
          const savedHeadliners = state.saved
            .map(id => ARTISTS.find(a => a.id === id))
            .filter(a => a && a.tier === 3)
            .slice(0, 6);
          if (savedHeadliners.length === 0) return null;
          return (
            <>
              <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 10 }}>
                Your <span style={{ fontStyle: "italic" }}>headliners</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {savedHeadliners.map(a => (
                  <button key={a.id} onClick={() => setState({ ...state, artist: a.id })} style={{
                    aspectRatio: "1/1", borderRadius: 10, background: a.img,
                    position: "relative", overflow: "hidden", border: "none", padding: 0, cursor: "pointer",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.65))" }}/>
                    <div style={{ position: "absolute", bottom: 6, left: 6, right: 6, color: "#fff", textAlign: "left" }} className="mono">
                      <div style={{ fontSize: 10, letterSpacing: 0.4, fontWeight: 700, lineHeight: 1.1, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                      <div style={{ fontSize: 8, letterSpacing: 1, opacity: 0.8 }}>
                        {FESTIVAL_CONFIG.dayDates[a.day]?.short || ""} · {fmt12(a.start)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          );
        })()}
        <div style={{ padding: 20 }} />
      </ScrollBody>
    </Screen>
  );
}

function FollowedNudge({ state, setState }) {
  const [followed, setFollowed] = React.useState(null); // null=loading, []=none
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    fetchFollowedEdcArtists(state.saved).then(setFollowed);
  }, [state.saved.length]);

  if (!followed || followed.length === 0) return null;

  const handleSave = (artist) => {
    setState(s => ({ ...s, saved: [...new Set([...s.saved, artist.id])] }));
  };
  const handleSaveAll = () => {
    setState(s => ({ ...s, saved: [...new Set([...s.saved, ...followed.map(a => a.id)])] }));
  };

  return (
    <div style={{
      background: "rgba(29,185,84,0.1)", border: "1px solid rgba(29,185,84,0.25)",
      borderRadius: 16, padding: "14px 16px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "#1DB954", fontWeight: 700 }}>
            YOU FOLLOW {followed.length} EDC ACT{followed.length > 1 ? "S" : ""} NOT IN YOUR LINEUP
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleSaveAll} style={{
            background: "#1DB954", color: "#000", border: "none",
            borderRadius: 999, padding: "5px 10px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1, fontWeight: 700,
          }}>SAVE ALL</button>
          <button onClick={() => setExpanded(e => !e)} style={{
            background: "transparent", color: "rgba(247,237,224,0.6)",
            border: "1px solid rgba(247,237,224,0.2)",
            borderRadius: 999, padding: "5px 10px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1,
          }}>{expanded ? "HIDE" : "VIEW"}</button>
        </div>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {followed.map(a => {
            const st = STAGES.find(s => s.id === a.stage);
            return (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "8px 12px",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--paper)" }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2 }}>
                    {st?.short} · DAY {a.day} · {fmt12(a.start)}
                  </div>
                </div>
                <button onClick={() => handleSave(a)} style={{
                  background: "transparent", color: st?.color || "#1DB954",
                  border: `1px solid ${st?.color || "#1DB954"}`,
                  borderRadius: 999, padding: "5px 10px", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1, fontWeight: 700,
                }}>+ SAVE</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BuildPlaylistButton({ state }) {
  const [status, setStatus] = React.useState("idle"); // idle | working | done | err
  const [result, setResult] = React.useState(null);

  const run = async () => {
    setStatus("working");
    try {
      const r = await createEdcPlaylist(state);
      setResult(r);
      if (r.ok) {
        setStatus("done");
      } else {
        setStatus("err");
        // Persist actionable errors (reconnect, missing target playlist) so the
        // user has time to read + click. Auto-clear only transient failures.
        if (r.reason !== "reconnect" && r.reason !== "no_target_playlist") {
          setTimeout(() => setStatus("idle"), 4500);
        }
      }
    } catch (e) {
      setResult({ ok: false, reason: "create_fail", message: String(e?.message || e) });
      setStatus("err");
      setTimeout(() => setStatus("idle"), 4500);
    }
  };

  // After the user reconnects via OAuth and returns to the app, resume the
  // build automatically if they were mid-flow. Removes the otherwise required
  // third click ("connect", "back", "build again").
  React.useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem("plursky_pending_build"); } catch {}
    if (pending && state.spotifyConnected && _hasPlaylistWriteScope()) {
      try { localStorage.removeItem("plursky_pending_build"); } catch {}
      run();
    }
  }, []); // mount-only — pending flag is one-shot

  const onClick = async () => {
    if (status === "working") return;
    if (status === "err" && (result?.reason === "reconnect" || result?.reason === "not_connected")) {
      // Mark intent so we auto-resume after the OAuth round-trip.
      try { localStorage.setItem("plursky_pending_build", "1"); } catch {}
      startSpotifyAuth(); return;
    }
    if (status === "err" && result?.reason === "no_target_playlist") {
      window.open("https://open.spotify.com/", "_blank", "noopener"); return;
    }
    // When done, clicking opens the playlist (user-initiated — not blocked)
    if (status === "done" && result?.url) {
      window.open(result.url, "_blank", "noopener"); return;
    }
    run();
  };

  let label, bg = "rgba(29,185,84,0.14)", color = "#1DB954", border = "1px solid #1DB954";
  if (status === "working") {
    label = "BUILDING…";
  } else if (status === "done") {
    const missed = result?.missed || 0;
    label = missed > 0
      ? `✓ ${result?.added} TRACKS (${missed} not on Spotify) — OPEN ↗`
      : `✓ ${result?.added} TRACKS · FRI→SAT→SUN — OPEN ↗`;
    bg = "#1DB954"; color = "#000"; border = "none";
  } else if (status === "err") {
    if (result?.reason === "reconnect" || result?.reason === "not_connected") label = "↻ TAP TO GRANT SPOTIFY ACCESS";
    else if (result?.reason === "no_target_playlist") label = "↗ CREATE 'PLURSKY' PLAYLIST IN SPOTIFY";
    else if (result?.reason === "rate_limited") label = "⏱ SPOTIFY BUSY · WAIT 30S, TAP AGAIN";
    else if (result?.reason === "empty") label = "SAVE SETS FIRST";
    else if (result?.reason === "create_fail") {
      const msg = (result?.message || "").slice(0, 28);
      label = msg ? `✕ ${result?.status} · ${msg}` : `✕ FAILED · ${result?.status || "?"}`;
    } else label = "✕ TRY AGAIN";
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


// ── Festival Recap (v145) ─────────────────────────────────────
// Spotify-Wrapped-style post-festival summary. Stitches together the
// attendance store (plursky_attended_v1), saved sets, Memories moments,
// and any cached Spotify popularity stats into a series of full-bleed
// cards that scroll vertically. No "tap to next" gesture — just a clean
// long-form recap the user can screenshot at will.
function _computeRecap(state) {
  const attended = getAllAttended();                // { night: artistId[] }
  const moments  = _readMoments();                   // { night: moment[] }
  const ARTISTS  = window.ARTISTS || [];
  const STAGES   = window.STAGES  || [];
  const CFG      = window.FESTIVAL_CONFIG;

  // Flatten to attended-artist objects with night info
  const caughtArtists = [];
  Object.keys(attended).forEach(n => {
    (attended[n] || []).forEach(id => {
      const a = ARTISTS.find(x => x.id === id);
      if (a) caughtArtists.push({ ...a, _night: +n });
    });
  });
  const setsCount = caughtArtists.length;

  // Time spent (minutes) across all attended sets
  const totalMin = caughtArtists.reduce((sum, a) => {
    const sm = window.toNightMin?.(a.start) || 0;
    const em = window.toNightMin?.(a.end)   || 0;
    return sum + Math.max(0, em - sm);
  }, 0);

  // Sets per night → busiest night
  const byNight = {};
  caughtArtists.forEach(a => { byNight[a._night] = (byNight[a._night] || 0) + 1; });
  const busiestNight = Object.keys(byNight).sort((x, y) => byNight[y] - byNight[x])[0];
  const busiestNightCount = busiestNight ? byNight[busiestNight] : 0;
  const busiestNightLabel = busiestNight && CFG?.dayDates?.[busiestNight]?.name || `Night ${busiestNight || "—"}`;

  // Sets per stage → top stage
  const byStage = {};
  const stageMinutes = {};
  caughtArtists.forEach(a => {
    byStage[a.stage] = (byStage[a.stage] || 0) + 1;
    const sm = window.toNightMin?.(a.start) || 0;
    const em = window.toNightMin?.(a.end)   || 0;
    stageMinutes[a.stage] = (stageMinutes[a.stage] || 0) + Math.max(0, em - sm);
  });
  const topStageId = Object.keys(stageMinutes).sort((x, y) => stageMinutes[y] - stageMinutes[x])[0];
  const topStage   = topStageId ? STAGES.find(s => s.id === topStageId) : null;
  const topStageMin = topStageId ? stageMinutes[topStageId] : 0;

  // Genre tally
  const byGenre = {};
  caughtArtists.forEach(a => { byGenre[a.genre] = (byGenre[a.genre] || 0) + 1; });
  const topGenre = Object.keys(byGenre).sort((x, y) => byGenre[y] - byGenre[x])[0] || null;

  // First and last set (chronologically across all 3 nights)
  const _artistEpoch = (a) => {
    const dm = CFG?.dayDates?.[a._night];
    if (!dm) return 0;
    const [h, m] = a.start.split(":").map(Number);
    const adjustH = h < 6 ? h + 24 : h;
    return dm.midnightUtc + adjustH * 3600000 + m * 60000;
  };
  const chronological = caughtArtists.slice().sort((x, y) => _artistEpoch(x) - _artistEpoch(y));
  const firstSet = chronological[0] || null;
  const lastSet  = chronological[chronological.length - 1] || null;

  // Headliners caught
  const headlinersCaught = caughtArtists.filter(a => a.tier === 3);
  const headlinerNames = headlinersCaught.map(a => a.name);

  // Sunrise sets caught (started at or after 04:00 next-day, i.e. early-AM)
  const sunriseSets = caughtArtists.filter(a => {
    const [h] = a.start.split(":").map(Number);
    return h >= 4 && h <= 8;
  });

  // Hidden gem: lowest Spotify popularity among the artists they caught
  // (requires the spotify_artist_data_v1 cache that artist.jsx populates).
  let hiddenGem = null;
  let topByPop  = null;
  try {
    const cache = JSON.parse(localStorage.getItem("spotify_artist_data_v1") || "{}");
    const annotated = caughtArtists
      .map(a => {
        const c = cache[a.name.toLowerCase()];
        return c?.popularity > 0 ? { ...a, _pop: c.popularity } : null;
      })
      .filter(Boolean);
    if (annotated.length) {
      annotated.sort((x, y) => x._pop - y._pop);
      hiddenGem = annotated[0];
      topByPop  = annotated[annotated.length - 1];
    }
  } catch {}

  // Memories
  const allMoments = Object.values(moments).flat();
  const photoMoments = allMoments.filter(m => m.photoId);
  const videoMoments = allMoments.filter(m => m.kind === "video");

  // v147: stages visited (unique stages with ≥1 attended set)
  const stagesVisited = Array.from(new Set(caughtArtists.map(a => a.stage)));
  const stagesVisitedNames = stagesVisited
    .map(id => STAGES.find(s => s.id === id))
    .filter(Boolean)
    .map(s => s.name);

  // v147: walking distance estimate — sum minutes from WALK_PAIRS for every
  // stage-to-stage transition in chronological attendance, then convert to
  // approximate metres at festival pace (~75 m/min).
  const _artistEpochM = (a) => {
    const dm = CFG?.dayDates?.[a._night];
    if (!dm) return 0;
    const [h, m] = a.start.split(":").map(Number);
    return dm.midnightUtc + (h < 6 ? h + 24 : h) * 3600000 + m * 60000;
  };
  const walkSequence = caughtArtists.slice().sort((a, b) => _artistEpochM(a) - _artistEpochM(b));
  let walkingMinutesLo = 0, walkingMinutesHi = 0;
  const WP = window.WALK_PAIRS || {};
  const PK = window._pairKey || ((a, b) => a < b ? `${a},${b}` : `${b},${a}`);
  for (let i = 1; i < walkSequence.length; i++) {
    const prev = walkSequence[i - 1].stage;
    const cur  = walkSequence[i].stage;
    if (prev === cur) continue;
    const pair = WP[PK(prev, cur)];
    if (!pair) continue;
    walkingMinutesLo += pair[0];
    walkingMinutesHi += pair[1];
  }
  const walkingMetersLo = Math.round(walkingMinutesLo * 75);
  const walkingMetersHi = Math.round(walkingMinutesHi * 75);

  // v147: B2B sets caught — artist names containing "b2b" or " b2b "
  const b2bSets = caughtArtists.filter(a => /\bb2b\b/i.test(a.name));

  return {
    setsCount,
    totalMin,
    nights: Object.keys(byNight).length,
    busiestNightLabel,
    busiestNightCount,
    topStage, topStageMin,
    topGenre,
    firstSet, lastSet,
    headlinersCaught: headlinersCaught.length,
    headlinerNames,
    sunriseSetsCount: sunriseSets.length,
    hiddenGem, topByPop,
    momentsCount: allMoments.length,
    photosCount:  photoMoments.length,
    videosCount:  videoMoments.length,
    stagesVisitedCount: stagesVisited.length,
    stagesVisitedNames,
    walkingMinutesLo, walkingMinutesHi,
    walkingMetersLo,  walkingMetersHi,
    b2bCount: b2bSets.length,
    b2bNames: b2bSets.map(a => a.name),
  };
}

function _fmtHrsMin(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}M`;
  if (m === 0) return `${h}H`;
  return `${h}H ${m}M`;
}

function RecapCard({ accent = "var(--ink)", paper = "var(--paper)", children, mono, kicker }) {
  return (
    <div style={{
      borderRadius: 22, padding: "26px 22px",
      background: paper, color: accent,
      marginBottom: 14,
      minHeight: 200,
      border: "1px solid var(--line)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxShadow: "0 6px 22px rgba(26,18,13,0.06)",
    }}>
      {kicker && (
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
          color: mono || "var(--muted)", marginBottom: 14,
        }}>{kicker}</div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// v147: shareable image card — paints the recap stats onto a 1080x1920 canvas
// (Instagram story aspect), then shares via navigator.share files API (which
// pops the iOS share sheet — IG, Messages, AirDrop, save to camera roll) or
// downloads as PNG on desktop. Fonts ship via Google Fonts in index.html; we
// await document.fonts.ready so canvas picks them up.
async function _renderRecapShareCard(recap) {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const CFG = window.FESTIVAL_CONFIG || {};

  // Ensure custom fonts are ready before we draw — canvas falls back to a
  // generic serif if Instrument Serif hasn't loaded yet.
  try {
    await document.fonts.load("700 italic 96px 'Instrument Serif'");
    await document.fonts.load("700 24px 'Geist Mono'");
    await document.fonts.load("500 64px Geist");
  } catch {}

  // Background — same gradient as the hero card on screen
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,    "#1a120d");
  grad.addColorStop(0.55, "#7b3d9a");
  grad.addColorStop(1,    "#e85d2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle starfield to echo TopDownMap's aesthetic
  ctx.fillStyle = "rgba(247,237,224,0.4)";
  let s = 0xdeadbeef;
  for (let i = 0; i < 60; i++) {
    s = Math.imul(s ^ (s >>> 17), 0x45d9f3b);
    const rng = () => ((s = Math.imul(s, 0x119de1f3)) >>> 0) / 0x100000000;
    const x = rng() * W, y = rng() * H * 0.5;
    const r = 1 + rng() * 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Kicker
  ctx.fillStyle = "rgba(247,237,224,0.65)";
  ctx.font = "700 26px 'Geist Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`PLURSKY · ${(CFG.shortName || "EDC LV").toUpperCase()} · ${CFG.year || ""}`, 72, 130);

  // Title
  ctx.fillStyle = "#f7ede0";
  ctx.textAlign = "left";
  ctx.font = "400 130px 'Instrument Serif', serif";
  ctx.fillText("That was", 72, 290);
  ctx.font = "italic 400 130px 'Instrument Serif', serif";
  ctx.fillStyle = "#f59a36";
  ctx.fillText("your weekend.", 72, 440);

  // 2x2 stats grid
  const cells = [
    { big: String(recap.setsCount),                small: "SETS CAUGHT" },
    { big: _fmtHrsMin(recap.totalMin),             small: "ON DANCEFLOORS" },
    { big: String(recap.stagesVisitedCount || recap.nights), small: recap.stagesVisitedCount != null ? `OF ${(window.STAGES || []).length} STAGES` : "NIGHTS" },
    { big: String(recap.headlinersCaught),         small: "HEADLINERS" },
  ];
  const gridTop = 600, cellH = 240, cellW = W / 2;
  cells.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col * cellW + 72;
    const y = gridTop + row * cellH;
    ctx.fillStyle = "#f7ede0";
    ctx.font = "400 130px 'Instrument Serif', serif";
    ctx.fillText(c.big, x, y + 130);
    ctx.fillStyle = "rgba(247,237,224,0.65)";
    ctx.font = "700 22px 'Geist Mono', monospace";
    ctx.fillText(c.small, x, y + 175);
  });

  // Top-stage banner
  if (recap.topStage) {
    const by = gridTop + cellH * 2 + 60;
    ctx.fillStyle = recap.topStage.color;
    ctx.fillRect(72, by, W - 144, 6);
    ctx.fillStyle = "rgba(247,237,224,0.7)";
    ctx.font = "700 22px 'Geist Mono', monospace";
    ctx.fillText("YOU LIVED AT", 72, by + 60);
    ctx.fillStyle = "#f7ede0";
    ctx.font = "italic 400 80px 'Instrument Serif', serif";
    ctx.fillText(recap.topStage.name, 72, by + 150);
  }

  // Headliner pill row
  if (recap.headlinerNames?.length) {
    const hy = H - 380;
    ctx.fillStyle = "rgba(247,237,224,0.7)";
    ctx.font = "700 22px 'Geist Mono', monospace";
    ctx.fillText(`HEADLINERS CAUGHT · ${recap.headlinersCaught}`, 72, hy);
    ctx.font = "700 28px 'Geist Mono', monospace";
    ctx.fillStyle = "#f7ede0";
    let lineY = hy + 60;
    let lineW = 0;
    recap.headlinerNames.slice(0, 8).forEach((name) => {
      const text = "★ " + name.toUpperCase();
      const w = ctx.measureText(text).width + 40;
      if (lineW + w > W - 144) {
        lineY += 60;
        lineW = 0;
      }
      ctx.fillText(text, 72 + lineW, lineY);
      lineW += w + 24;
    });
  }

  // Watermark
  ctx.fillStyle = "rgba(247,237,224,0.55)";
  ctx.textAlign = "left";
  ctx.font = "700 26px 'Geist Mono', monospace";
  ctx.fillText("PLURSKY.COM", 72, H - 90);
  ctx.textAlign = "right";
  ctx.fillText("UNDER THE ELECTRIC SKY", W - 72, H - 90);

  return canvas;
}

async function _shareRecapCard(recap) {
  let canvas;
  try { canvas = await _renderRecapShareCard(recap); }
  catch (e) { console.error("[plursky-recap] render failed:", e); return false; }
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  if (!blob) return false;
  const filename = `plursky-recap-${(window.FESTIVAL_CONFIG?.id || "festival")}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  // Try iOS share sheet first (best path on phone)
  if (navigator.share && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `My ${window.FESTIVAL_CONFIG?.shortName || "festival"}` });
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false; // user cancelled — silent
    }
  }
  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function RecapScreen({ state, setState }) {
  const recap = React.useMemo(() => _computeRecap(state), [state]);
  const CFG   = window.FESTIVAL_CONFIG || {};
  const fmt12 = window.fmt12 || ((t) => t);

  const back = () => setState(s => ({ ...s, tab: "me" }));

  // Empty-state guard — nothing to recap
  if (recap.setsCount === 0 && recap.momentsCount === 0) {
    return (
      <Screen bg="var(--paper)">
        <div style={{ padding: "8px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={back} aria-label="Back" style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontSize: 22, color: "var(--ink)", lineHeight: 1, width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>←</button>
          <TopBar title={<span>Recap</span>} sub={CFG.shortName?.toUpperCase()} tight />
        </div>
        <ScrollBody style={{ padding: "10px 20px 94px" }}>
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 24, color: "var(--muted)", fontStyle: "italic", marginBottom: 8 }}>
              Nothing to recap yet
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              MARK SETS YOU CAUGHT IN MEMORIES — TODAY'S WEEKEND RECAP WILL FILL IN
            </div>
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen bg="var(--paper-2)">
      <div style={{ padding: "8px 20px", display: "flex", alignItems: "center", gap: 10, background: "var(--paper)" }}>
        <button onClick={back} aria-label="Back" style={{
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          fontSize: 22, color: "var(--ink)", lineHeight: 1, width: 30, height: 30,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>←</button>
        <TopBar title={<span>Recap</span>} sub={(CFG.shortName || "Festival").toUpperCase() + " · YOUR WEEKEND"} tight />
      </div>
      <ScrollBody style={{ padding: "14px 16px 94px" }}>
        {/* HERO ─ totals · share button bottom-right */}
        <div style={{
          borderRadius: 22, padding: "26px 22px", marginBottom: 14,
          background: "linear-gradient(155deg, var(--ink) 0%, var(--horizon) 60%, var(--ember) 130%)",
          color: "var(--paper)",
          boxShadow: "0 10px 30px rgba(26,18,13,0.18)",
          position: "relative",
        }}>
          <button
            onClick={async () => { await _shareRecapCard(recap); }}
            aria-label="Share recap"
            style={{
              position: "absolute", top: 16, right: 16,
              padding: "7px 12px", borderRadius: 999,
              background: "rgba(247,237,224,0.18)", color: "#f7ede0",
              border: "1px solid rgba(247,237,224,0.35)", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
              backdropFilter: "blur(8px)",
            }}>↗ SHARE</button>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "rgba(247,237,224,0.75)", fontWeight: 700, marginBottom: 10 }}>
            YOUR {(CFG.shortName || "FESTIVAL").toUpperCase()} · {CFG.year || ""}
          </div>
          <div className="serif" style={{ fontSize: 40, lineHeight: 0.95, letterSpacing: -0.5, marginBottom: 18 }}>
            That was <span style={{ fontStyle: "italic", color: "var(--flare)" }}>your</span> weekend.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div className="serif" style={{ fontSize: 36, lineHeight: 1 }}>{recap.setsCount}</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700, color: "rgba(247,237,224,0.7)", marginTop: 3 }}>SETS CAUGHT</div>
            </div>
            <div>
              <div className="serif" style={{ fontSize: 36, lineHeight: 1 }}>{_fmtHrsMin(recap.totalMin)}</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700, color: "rgba(247,237,224,0.7)", marginTop: 3 }}>ON DANCEFLOORS</div>
            </div>
            <div>
              <div className="serif" style={{ fontSize: 36, lineHeight: 1 }}>{recap.nights}</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700, color: "rgba(247,237,224,0.7)", marginTop: 3 }}>NIGHTS</div>
            </div>
            <div>
              <div className="serif" style={{ fontSize: 36, lineHeight: 1 }}>{recap.headlinersCaught}</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700, color: "rgba(247,237,224,0.7)", marginTop: 3 }}>HEADLINERS</div>
            </div>
          </div>
        </div>

        {/* TOP STAGE */}
        {recap.topStage && (
          <RecapCard
            kicker="YOUR HEADQUARTERS"
            paper={`${recap.topStage.color}18`}
            mono={recap.topStage.color}
          >
            <div className="serif" style={{ fontSize: 32, lineHeight: 1, letterSpacing: -0.4, marginBottom: 8 }}>
              You lived at <span style={{ fontStyle: "italic", color: recap.topStage.color }}>{recap.topStage.name}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: "var(--muted)", marginTop: 6, fontWeight: 600 }}>
              {_fmtHrsMin(recap.topStageMin)} of your weekend was right here
            </div>
          </RecapCard>
        )}

        {/* BUSIEST NIGHT */}
        {recap.busiestNightCount > 0 && (
          <RecapCard kicker="BUSIEST NIGHT">
            <div className="serif" style={{ fontSize: 32, lineHeight: 1.0, letterSpacing: -0.4 }}>
              <span style={{ fontStyle: "italic", color: "var(--ember)" }}>{recap.busiestNightLabel}</span> was your peak —
              {" "}{recap.busiestNightCount} sets in one night.
            </div>
          </RecapCard>
        )}

        {/* TOP GENRE */}
        {recap.topGenre && (
          <RecapCard kicker="THE SOUND OF YOUR WEEKEND" paper="var(--paper)">
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.0, letterSpacing: -0.4 }}>
              You went deep on{" "}
              <span style={{ fontStyle: "italic", color: "var(--horizon)" }}>{recap.topGenre}</span>.
            </div>
          </RecapCard>
        )}

        {/* FIRST + LAST */}
        {recap.firstSet && recap.lastSet && (
          <RecapCard kicker="BOOKENDS">
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.15, marginBottom: 14 }}>
              You opened with <span style={{ color: "var(--ember)" }}>{recap.firstSet.name}</span>
              <span style={{ color: "var(--muted)", fontSize: 16 }}> · {fmt12(recap.firstSet.start)}</span>
            </div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.15 }}>
              and closed with <span style={{ color: "var(--ember)" }}>{recap.lastSet.name}</span>
              <span style={{ color: "var(--muted)", fontSize: 16 }}> · {fmt12(recap.lastSet.start)}</span>
            </div>
          </RecapCard>
        )}

        {/* SUNRISE */}
        {recap.sunriseSetsCount > 0 && (
          <RecapCard kicker="STAYED UP">
            <div className="serif" style={{ fontSize: 32, lineHeight: 1.0, letterSpacing: -0.4 }}>
              {recap.sunriseSetsCount === 1 ? "One sunrise set" : `${recap.sunriseSetsCount} sunrise sets`}.{" "}
              <span style={{ color: "var(--flare)", fontStyle: "italic" }}>Respect.</span>
            </div>
          </RecapCard>
        )}

        {/* HIDDEN GEM */}
        {recap.hiddenGem && (
          <RecapCard kicker="HIDDEN GEM" paper="var(--paper)">
            <div className="serif" style={{ fontSize: 28, lineHeight: 1.05, letterSpacing: -0.3 }}>
              Most under-the-radar artist you saw:{" "}
              <span style={{ fontStyle: "italic", color: "var(--horizon)" }}>{recap.hiddenGem.name}</span>.
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)", marginTop: 10, fontWeight: 600 }}>
              SPOTIFY POPULARITY {recap.hiddenGem._pop} / 100 · TASTE 🤌
            </div>
          </RecapCard>
        )}

        {/* STAGES VISITED */}
        {recap.stagesVisitedCount > 0 && (
          <RecapCard kicker={`STAGES VISITED · ${recap.stagesVisitedCount} OF ${(window.STAGES || []).length}`}>
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 10 }}>
              {recap.stagesVisitedCount === (window.STAGES || []).length
                ? <>Every <span style={{ fontStyle: "italic", color: "var(--ember)" }}>stage</span>. Completionist.</>
                : <>You set foot at <span style={{ fontStyle: "italic", color: "var(--ember)" }}>{recap.stagesVisitedCount}</span> of {(window.STAGES || []).length} stages.</>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {recap.stagesVisitedNames.map(name => (
                <span key={name} className="mono" style={{
                  padding: "4px 9px", borderRadius: 999,
                  background: "var(--paper)", border: "1px solid var(--line-2)",
                  color: "var(--ink)", fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
                }}>{name.toUpperCase()}</span>
              ))}
            </div>
          </RecapCard>
        )}

        {/* WALKING DISTANCE */}
        {recap.walkingMinutesHi > 0 && (
          <RecapCard kicker="DISTANCE COVERED">
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: -0.3 }}>
              You walked roughly{" "}
              <span style={{ fontStyle: "italic", color: "var(--horizon)" }}>
                {recap.walkingMetersHi >= 1000
                  ? `${(recap.walkingMetersLo / 1000).toFixed(1)}–${(recap.walkingMetersHi / 1000).toFixed(1)} km`
                  : `${recap.walkingMetersLo}–${recap.walkingMetersHi} m`}
              </span>{" "}
              between stages.
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)", marginTop: 10, fontWeight: 600 }}>
              ~{recap.walkingMinutesLo}–{recap.walkingMinutesHi} MIN WALKING TOTAL
            </div>
          </RecapCard>
        )}

        {/* B2B SETS */}
        {recap.b2bCount > 0 && (
          <RecapCard kicker={`B2B SETS · ${recap.b2bCount}`}>
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 8 }}>
              You caught {recap.b2bCount === 1 ? "a" : recap.b2bCount} <span style={{ fontStyle: "italic", color: "var(--ember)" }}>back-to-back</span> collab{recap.b2bCount === 1 ? "" : "s"}.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
              {recap.b2bNames.join(" · ")}
            </div>
          </RecapCard>
        )}

        {/* HEADLINERS */}
        {recap.headlinersCaught > 0 && (
          <RecapCard kicker={`HEADLINERS CAUGHT · ${recap.headlinersCaught}`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {recap.headlinerNames.map(n => (
                <span key={n} className="mono" style={{
                  padding: "6px 11px", borderRadius: 999,
                  background: "var(--ink)", color: "var(--paper)",
                  fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
                }}>★ {n.toUpperCase()}</span>
              ))}
            </div>
          </RecapCard>
        )}

        {/* MEMORIES */}
        {recap.momentsCount > 0 && (
          <RecapCard kicker="MEMORIES" paper="var(--paper)">
            <div className="serif" style={{ fontSize: 32, lineHeight: 1.0, letterSpacing: -0.4 }}>
              <span style={{ color: "var(--ember)" }}>{recap.momentsCount}</span>{" "}
              {recap.momentsCount === 1 ? "moment" : "moments"} captured.
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)", marginTop: 10, fontWeight: 600 }}>
              {recap.photosCount} PHOTO{recap.photosCount === 1 ? "" : "S"}
              {recap.videosCount > 0 ? ` · ${recap.videosCount} VIDEO${recap.videosCount === 1 ? "" : "S"}` : ""}
            </div>
            <button onClick={() => setState(s => ({ ...s, tab: "memories" }))} style={{
              marginTop: 14, padding: "8px 14px", borderRadius: 999,
              background: "var(--ink)", color: "var(--paper)", border: "none",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
              cursor: "pointer", alignSelf: "flex-start",
            }}>OPEN MEMORIES →</button>
          </RecapCard>
        )}

        {/* OUTRO */}
        <RecapCard
          kicker="UNTIL NEXT YEAR"
          paper="linear-gradient(155deg, var(--paper) 0%, rgba(245,154,54,0.18) 100%)"
        >
          <div className="serif" style={{ fontSize: 32, lineHeight: 1, letterSpacing: -0.4 }}>
            See you under the <span style={{ fontStyle: "italic", color: "var(--ember)" }}>electric sky</span>.
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 10, fontWeight: 600 }}>
            PLURSKY · {CFG.year || ""}
          </div>
        </RecapCard>
      </ScrollBody>
    </Screen>
  );
}

Object.assign(window, {
  SpotifyScreen, MeScreen, MemoriesScreen, RecapScreen, fetchPreviewUrl,
  ensureSpotifyProfile, getSpotifyProfileSync, createEdcPlaylist,
  startSpotifyAuth, PackListCard,
});
