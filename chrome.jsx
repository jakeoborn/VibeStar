// Screen shell + bottom tab nav + shared atoms

function Screen({ children, bg = "var(--paper)", pad = true, ink = "var(--ink)" }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: bg,
      color: ink,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function ScrollBody({ children, style, ...rest }) {
  return (
    <div {...rest} style={{
      flex: 1, overflowY: "auto", overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
      ...style,
    }}>
      {children}
    </div>
  );
}

function TopBar({ title, right, sub, tight }) {
  return (
    <div style={{
      padding: tight ? "6px 20px 10px" : "10px 20px 14px",
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 12,
    }}>
      <div>
        {sub && <div className="mono" style={{
          fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase",
          color: "var(--muted)", marginBottom: 4,
        }}>{sub}</div>}
        <div className="serif" style={{ fontSize: 34, lineHeight: 0.95, letterSpacing: -0.5 }}>
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}

// Bottom tab nav — 4 tabs after v92 collapse (Music folded into Me).
// SpotifyScreen still routes via state.tab="spotify" but Me lights up in the bar.
function TabBar({ active, onChange }) {
  const tabs = [
    { id: "home",    label: "Today",  icon: HomeIcon },
    { id: "lineup",  label: "Lineup", icon: LineupIcon },
    { id: "map",     label: "Map",    icon: MapIcon },
    { id: "me",      label: "Me",     icon: MeIcon },
  ];
  return (
    <div style={{
      background: "var(--paper-2)",
      borderTop: "1px solid var(--line)",
      padding: "8px 10px 10px",
      display: "flex",
      justifyContent: "space-around",
    }}>
      {tabs.map(t => {
        const Icon = t.icon;
        const on = active === t.id;
        return (
          <button key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 8px",
              color: on ? "var(--ink)" : "var(--muted)",
              minWidth: 54,
            }}>
            <Icon on={on} />
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const stroke = (on) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: on ? 1.8 : 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

function HomeIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5 L12 5.5 M12 18.5 L12 21.5 M2.5 12 L5.5 12 M18.5 12 L21.5 12" />
      <path d="M5.5 5.5 L7.5 7.5 M16.5 16.5 L18.5 18.5 M5.5 18.5 L7.5 16.5 M16.5 7.5 L18.5 5.5" opacity="0.55"/>
    </svg>
  );
}
function MapIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <path d="M3 6 L9 4 L15 6 L21 4 L21 18 L15 20 L9 18 L3 20 Z" />
      <path d="M9 4 L9 18 M15 6 L15 20" />
    </svg>
  );
}
function LineupIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <path d="M4 6 L20 6 M4 12 L20 12 M4 18 L14 18" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
function MusicIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
      <path d="M9.5 17 L9.5 5 L19.5 3 L19.5 15" />
    </svg>
  );
}
function MeIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20 C 5 16, 8.5 14, 12 14 C 15.5 14, 19 16, 19 20" />
    </svg>
  );
}

// Generic pill
function Pill({ children, tone = "ink", style }) {
  const tones = {
    ink:    { bg: "var(--ink)", fg: "var(--paper)" },
    outline:{ bg: "transparent", fg: "var(--ink)", border: "1px solid var(--line-2)" },
    ember:  { bg: "var(--ember)", fg: "#fff" },
    paper:  { bg: "var(--paper)", fg: "var(--ink)", border: "1px solid var(--line)" },
    night:  { bg: "var(--night)", fg: "var(--paper)" },
  };
  const t = tones[tone];
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 9px", borderRadius: 999,
      background: t.bg, color: t.fg, border: t.border || "none",
      fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 500,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

// ── Artist photo cache + rate-limited Spotify fetch ──────────
// One fetch at a time, 150 ms apart — avoids Spotify 429s when
// the full lineup loads. Reads localStorage cache first (instant).
const _photoQueue = [];
let   _photoActive = false;

function _drainPhotoQueue() {
  if (_photoActive || !_photoQueue.length) return;
  _photoActive = true;
  const { name, resolve } = _photoQueue.shift();
  const token   = localStorage.getItem("spotify_token");
  const expires = localStorage.getItem("spotify_expires");
  if (!token || !expires || Date.now() >= parseInt(expires)) {
    _photoActive = false; resolve(null); _drainPhotoQueue(); return;
  }
  fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=3`,
    { headers: { Authorization: "Bearer " + token } }
  ).then(r => r.ok ? r.json() : null).then(d => {
    const ln = name.toLowerCase();
    const items = d?.artists?.items || [];
    const match = items.find(x => x.name.toLowerCase() === ln)
      || items.find(x => ln.includes(x.name.toLowerCase()))
      || items[0];
    const img = match?.images?.[0]?.url || null;
    if (img) {
      try {
        const imgs = JSON.parse(localStorage.getItem("artist_images_v1") || "{}");
        imgs[ln] = img;
        localStorage.setItem("artist_images_v1", JSON.stringify(imgs));
      } catch {}
    }
    resolve(img);
  }).catch(() => resolve(null)).finally(() => {
    _photoActive = false;
    setTimeout(_drainPhotoQueue, 150);
  });
}

function _queuePhoto(name) {
  return new Promise(resolve => { _photoQueue.push({ name, resolve }); _drainPhotoQueue(); });
}

function useArtistPhoto(name) {
  const [photo, setPhoto] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("artist_images_v1") || "{}")[name.toLowerCase()] || null; }
    catch { return null; }
  });
  React.useEffect(() => {
    if (photo) return;
    const token   = localStorage.getItem("spotify_token");
    const expires = localStorage.getItem("spotify_expires");
    if (!token || !expires || Date.now() >= parseInt(expires)) return;
    let live = true;
    _queuePhoto(name).then(img => { if (live && img) setPhoto(img); });
    return () => { live = false; };
  }, [name.toLowerCase()]);
  return photo;
}

// Artist color swatch — shows Spotify headshot when available,
// falls back to gradient + initials.
function ArtistSwatch({ artist, size = 44 }) {
  const photo = useArtistPhoto(artist.name);
  const initials = artist.name.split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: size,
      background: artist.img,
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Instrument Serif, serif",
      fontSize: size * 0.42,
      flexShrink: 0,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
      overflow: "hidden", position: "relative",
    }}>
      {photo
        ? <img src={photo} alt={artist.name} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 15%",
          }}/>
        : initials}
    </div>
  );
}

// Plursky logo mark — uses the same yellow P icon as the home-screen / app icon
// so the brand is uniform between the website masthead and the installed PWA.
function Wordmark({ size = 18, color = "var(--ink)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color }}>
      <img src="./apple-touch-icon.png" alt=""
        width={size} height={size}
        style={{ borderRadius: size * 0.22, display: "block", flexShrink: 0 }} />
      <span className="mono" style={{ fontSize: size * 0.72, letterSpacing: 3, fontWeight: 500 }}>PLURSKY</span>
    </div>
  );
}

// ── PWA install prompt ────────────────────────────────────────
// Android (Chrome/Edge): captures beforeinstallprompt and exposes prompt().
// iOS (Safari): no native install prompt — show "Add to Home Screen" hint.
// Standalone (already installed): suppress everything.
function useInstallPrompt() {
  const [deferred, setDeferred] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("install_dismissed") === "1"
  );

  React.useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferred(e); };
    const installed = () => {
      setDeferred(null);
      try { localStorage.setItem("install_dismissed", "1"); } catch {}
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  // We ARE the native app — Capacitor doesn't set navigator.standalone or the
  // display-mode media query, so without this guard the "Add to Home Screen"
  // banner pitches users to install the app they're already inside.
  const isNativeApp = !!window.Capacitor?.isNativePlatform?.();

  const canInstall = !dismissed && !isStandalone && !isNativeApp && (deferred || isIOS);

  return {
    canInstall,
    isIOS,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setDeferred(null);
      } catch {}
    },
    dismiss: () => {
      try { localStorage.setItem("install_dismissed", "1"); } catch {}
      setDismissed(true);
    },
  };
}

function InstallBanner() {
  const ip = useInstallPrompt();
  if (!ip.canInstall) return null;

  return (
    <div style={{
      margin: "8px 16px 0",
      padding: "10px 12px",
      borderRadius: 14,
      background: "var(--ink)",
      color: "var(--paper)",
      display: "flex", alignItems: "center", gap: 11,
    }}>
      <img src="./apple-touch-icon.png" alt=""
        width="36" height="36"
        style={{ borderRadius: 9, display: "block", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--flare)", fontWeight: 700 }}>
          INSTALL PLURSKY
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.35, marginTop: 2, color: "rgba(247,237,224,0.85)" }}>
          {ip.isIOS
            ? <>Tap <span style={{ display: "inline-flex", verticalAlign: "middle", padding: "0 2px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 L12 16"/><path d="M7 8 L12 3 L17 8"/><rect x="5" y="13" width="14" height="8" rx="1.5"/>
                </svg></span> then <strong style={{ color: "var(--paper)" }}>Add to Home Screen</strong> for offline + full-screen.</>
            : <>Add to home screen for offline lineup + full-screen map.</>}
        </div>
      </div>
      {!ip.isIOS && (
        <button onClick={ip.install} style={{
          background: "var(--ember)", color: "#fff", border: "none",
          borderRadius: 999, padding: "7px 12px", cursor: "pointer",
          fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
          flexShrink: 0,
        }}>INSTALL</button>
      )}
      <button onClick={ip.dismiss} aria-label="Dismiss" style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: "rgba(247,237,224,0.55)", padding: 4, flexShrink: 0,
        fontSize: 18, lineHeight: 1,
      }}>×</button>
    </div>
  );
}

// ── Notifications (v131: native + web hybrid) ──────────────────
// Two paths sharing the same { supported, perm, enable, showLocal } API:
//
//   • Native iOS (Capacitor): @capacitor/local-notifications schedules
//     reminders at the OS level so they fire when the app is killed.
//     This is the only way set-time reminders actually work on iOS —
//     web Notification doesn't exist inside WKWebView, and setTimeout
//     stops when the app is backgrounded.
//
//   • Web (plursky.com): real wall-clock setTimeout(showNotification)
//     via the service-worker registration. Persisted to localStorage so
//     a reload re-registers any reminders that haven't fired yet.
//
// SW push handler (sw.js) is also live for future server-sent VAPID
// pushes, but Plursky has no backend for that today — only locally
// scheduled set-time reminders.

function _capLocalNotifications() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.LocalNotifications || null;
}

// Map a string artist id to a deterministic int32-safe positive integer.
// LocalNotifications.schedule requires numeric ids; reusing the same id
// for the same artist makes cancel/replace trivial.
function _notifIdForArtist(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1_999_999_999) + 1; // 1..~2e9, never 0
}
// Distinct id for the test ping so it doesn't collide with any artist's
// reminder slot.
const _TEST_NOTIF_ID = 9_999_001;

function useNotifications() {
  const ln = _capLocalNotifications();
  const webSupported = typeof Notification !== "undefined";
  const supported = !!ln || webSupported;

  const [perm, setPerm] = React.useState(() => {
    if (ln)            return "checking";   // resolved by the effect below
    if (webSupported)  return Notification.permission;
    return "unsupported";
  });

  // On native: resolve the current permission state once on mount so the
  // UI can show ENABLED / OFF / BLOCKED accurately.
  React.useEffect(() => {
    if (!ln) return;
    let cancelled = false;
    ln.checkPermissions().then(res => {
      if (cancelled) return;
      setPerm(_mapDisplayPerm(res?.display));
    }).catch(() => { if (!cancelled) setPerm("default"); });
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    if (ln) {
      try {
        const res = await ln.requestPermissions();
        const next = _mapDisplayPerm(res?.display);
        setPerm(next);
        return next;
      } catch {
        setPerm("denied");
        return "denied";
      }
    }
    if (!webSupported) return "unsupported";
    if (perm === "granted") return "granted";
    const result = await Notification.requestPermission();
    setPerm(result);
    return result;
  };

  const showLocal = async (title, opts = {}) => {
    if (perm !== "granted") return false;
    if (ln) {
      // Native path: schedule one second from now so the OS still treats
      // this as a real scheduled notification (firing immediately can be
      // dropped on some iOS versions when the app is foreground).
      try {
        await ln.schedule({
          notifications: [{
            id: _TEST_NOTIF_ID,
            title,
            body: opts.body || "",
            schedule: { at: new Date(Date.now() + 1000) },
            sound: undefined,
            smallIcon: "ic_stat_icon_config_sample",
            extra: opts.data || {},
          }],
        });
        return true;
      } catch { return false; }
    }
    if (!webSupported) return false;
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        await reg.showNotification(title, {
          icon: "/og.svg", badge: "/og.svg",
          vibrate: [80, 40, 80],
          ...opts,
        });
      } else {
        new Notification(title, opts);
      }
      return true;
    } catch { return false; }
  };

  return { supported, perm, enable, showLocal };
}

// LocalNotifications.{check,request}Permissions returns
// { display: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }
// We collapse the two prompt-ish states into web's "default" so the rest
// of the UI can use a single shape.
function _mapDisplayPerm(display) {
  if (display === "granted") return "granted";
  if (display === "denied")  return "denied";
  return "default";
}

// ── Attendance tracking (v137) ────────────────────────────────
// Real "SETS CAUGHT" stat — replaces the previous hardcoded heuristic
// (set.day <= NOW.day, which lit up every saved set whether attended
// or not). Two ways a set ends up here:
//   (a) Live GPS auto-detect — if the user is within ~140 m of a
//       stage anchor while one of its artists is mid-set, we mark
//       attendance immediately. No history needed; just current GPS
//       + current time. See `detectCurrentArtist`.
//   (b) Manual review in the Memories tab — checkbox list per night
//       so the user can backfill anything we missed the next morning.

const ATTENDED_KEY = "plursky_attended_v1";
function getAllAttended() {
  try {
    const raw = localStorage.getItem(ATTENDED_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    // Normalize legacy/empty values into arrays of strings.
    Object.keys(obj).forEach(k => {
      obj[k] = Array.isArray(obj[k]) ? obj[k].filter(x => typeof x === "string") : [];
    });
    return obj;
  } catch { return {}; }
}
function _writeAttended(map) {
  try { localStorage.setItem(ATTENDED_KEY, JSON.stringify(map)); } catch {}
  try { window.dispatchEvent(new CustomEvent("plursky-attended-change")); } catch {}
}
function getAttendedForNight(night) {
  return new Set(getAllAttended()[night] || []);
}
function getAttendedCount() {
  const all = getAllAttended();
  return Object.values(all).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
}
function markAttended(night, artistId, source = "manual") {
  if (!night || !artistId) return false;
  const all = getAllAttended();
  const list = all[night] || [];
  if (list.includes(artistId)) return false;
  all[night] = [...list, artistId];
  _writeAttended(all);
  if (source === "gps") {
    // Lightweight crumb so we can show a "marked by GPS" badge later
    try {
      const log = JSON.parse(localStorage.getItem("plursky_attended_source_v1") || "{}");
      log[artistId] = { source, ts: Date.now() };
      localStorage.setItem("plursky_attended_source_v1", JSON.stringify(log));
    } catch {}
  }
  return true;
}
function unmarkAttended(night, artistId) {
  if (!night || !artistId) return false;
  const all = getAllAttended();
  const list = (all[night] || []).filter(x => x !== artistId);
  if (list.length === (all[night] || []).length) return false;
  all[night] = list;
  _writeAttended(all);
  return true;
}
function isAttended(night, artistId) {
  return getAttendedForNight(night).has(artistId);
}
function getAttendanceSource(artistId) {
  try {
    const log = JSON.parse(localStorage.getItem("plursky_attended_source_v1") || "{}");
    return log[artistId]?.source || "manual";
  } catch { return "manual"; }
}

// Quick equirectangular distance — accurate enough at festival scale.
function _gpsDistMeters(latA, lngA, latB, lngB) {
  const toRad = (d) => d * Math.PI / 180;
  const cosLat = Math.cos(toRad((latA + latB) / 2));
  const dLat = toRad(latB - latA) * 6371000;
  const dLng = toRad(lngB - lngA) * 6371000 * cosLat;
  return Math.hypot(dLat, dLng);
}

// Given current GPS + current festival time, return the artist the user is
// most likely watching right now — or null if none matches.
//
// "At a set" = within `radiusM` of a stage anchor AND the stage has an
// artist whose set window contains NOW.time. We use 140 m as the default
// radius which roughly matches the audible/visible footprint of a stage
// at LVMS without bleeding into neighbours.
function detectCurrentArtist(lat, lng, opts = {}) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const cfg = window.FESTIVAL_CONFIG;
  if (!cfg) return null;
  const anchors = cfg.gpsAnchors || [];
  if (anchors.length === 0) return null;
  const radius = opts.radiusM || 140;
  const now = window.NOW;
  if (!now || !now.day || !now.time) return null;
  // Closest stage anchor within radius
  let best = null;
  for (const a of anchors) {
    const d = _gpsDistMeters(lat, lng, a.lat, a.lng);
    if (d > radius) continue;
    if (!best || d < best.d) best = { ...a, d };
  }
  if (!best) return null;
  // Artist at that stage whose set window contains NOW.time
  const [nh, nm] = (now.time || "00:00").split(":").map(Number);
  const adjustH = nh < 6 ? nh + 24 : nh;
  const nowMin  = adjustH * 60 + nm;
  const playing = (window.ARTISTS || []).find(a => {
    if (a.day !== now.day) return false;
    if (a.stage !== best.stageId) return false;
    const [sh, sm] = a.start.split(":").map(Number);
    const [eh, em] = a.end.split(":").map(Number);
    const start = (sh < 6 ? sh + 24 : sh) * 60 + sm;
    const end   = (eh < 6 ? eh + 24 : eh) * 60 + em;
    return nowMin >= start && nowMin <= end;
  });
  if (!playing) return null;
  return { artistId: playing.id, stageId: best.stageId, night: now.day, distM: Math.round(best.d) };
}

// Called from the GPS effect in MapScreen on every successful sample.
// Idempotent + cheap — silently no-ops when the user is between stages,
// outside the festival, or it's not set time.
function recordAttendanceFromGps(lat, lng) {
  const hit = detectCurrentArtist(lat, lng);
  if (!hit) return null;
  const added = markAttended(hit.night, hit.artistId, "gps");
  return added ? hit : null;
}

// Convert an artist's set start to a real UTC timestamp (respects
// post-midnight sets: hours < 6 are treated as the following calendar day).
function _artistStartMs(artist) {
  const dayConfig = FESTIVAL_CONFIG.dayDates[artist.day];
  if (!dayConfig) return null;
  const [h, m] = artist.start.split(":").map(Number);
  const adjustH = h < 6 ? h + 24 : h;
  return dayConfig.midnightUtc + adjustH * 3600000 + m * 60000;
}

const _REMINDERS_KEY = "reminders_v1";
const _REMINDER_LEAD_KEY = "plursky_reminder_lead_min";
const _REMINDER_LEAD_OPTIONS = [5, 15, 30, 60];
const _SCHEDULED = new Map(); // artistId → timeout handle

function getReminderLeadMin() {
  try {
    const raw = parseInt(localStorage.getItem(_REMINDER_LEAD_KEY) || "", 10);
    if (_REMINDER_LEAD_OPTIONS.includes(raw)) return raw;
  } catch {}
  return 15;
}
function setReminderLeadMin(mins) {
  if (!_REMINDER_LEAD_OPTIONS.includes(mins)) return;
  try { localStorage.setItem(_REMINDER_LEAD_KEY, String(mins)); } catch {}
}

// Schedule reminders for all upcoming saved sets using real wall-clock time.
// Lead-time is configurable (5/15/30/60 min, default 15).
//
// Native path: hand the full list to LocalNotifications.schedule with
// `at: new Date(fireMs)`. The OS owns the schedule from there — the app
// can die, the user can hard-quit, the phone can reboot, and the alert
// still fires. Cancels prior plursky-owned notifications first so the
// list is always a fresh mirror of the saved set.
//
// Web path: setTimeout each pending reminder and persist to localStorage
// so a reload can rehydrate any that haven't fired yet.
function scheduleReminders(state, showLocal) {
  const ln = _capLocalNotifications();
  const now = Date.now();
  const leadMin = getReminderLeadMin();
  const pending = [];

  state.saved.forEach(id => {
    const a = ARTISTS.find(x => x.id === id);
    if (!a) return;
    const startMs = _artistStartMs(a);
    if (!startMs) return;
    const fireMs = startMs - leadMin * 60000;
    const delayMs = fireMs - now;
    if (delayMs <= 0 || delayMs > 24 * 3600000) return; // upcoming within 24 h only
    const stage = STAGES.find(s => s.id === a.stage);
    pending.push({
      id: a.id,
      notifId: _notifIdForArtist(a.id),
      name: a.name,
      stageName: stage?.name || "",
      start: a.start,
      fireMs, leadMin,
    });
  });

  if (ln) {
    // Native: cancel the previous slate, then schedule fresh. We cancel by
    // explicit id list so we don't blow away third-party Capacitor plugins'
    // notifications (none exist today, but cheap insurance).
    const prevIds = Array.from(_SCHEDULED.values()).filter(v => typeof v === "number");
    const allIds  = new Set([...prevIds, ...pending.map(p => p.notifId)]);
    _SCHEDULED.clear();
    ln.cancel({ notifications: [...allIds].map(id => ({ id })) }).catch(() => {});
    if (pending.length > 0) {
      ln.schedule({
        notifications: pending.map(p => ({
          id:    p.notifId,
          title: `${p.name} starts in ${p.leadMin} min`,
          body:  `${p.stageName} · ${fmt12(p.start)}`,
          schedule: { at: new Date(p.fireMs), allowWhileIdle: true },
          extra: { artistId: p.id, url: "/" },
        })),
      }).catch(() => {});
    }
    pending.forEach(p => _SCHEDULED.set(p.id, p.notifId));
    try { localStorage.setItem(_REMINDERS_KEY, JSON.stringify(pending)); } catch {}
    return _SCHEDULED.size;
  }

  // Web fallback: setTimeout per reminder.
  _SCHEDULED.forEach(h => { if (typeof h !== "number") clearTimeout(h); });
  _SCHEDULED.clear();
  pending.forEach(p => {
    const handle = setTimeout(() => {
      showLocal(`${p.name} starts in ${p.leadMin} min`, {
        body: `${p.stageName} · ${fmt12(p.start)}`,
        tag: `set-${p.id}`,
        data: { url: "/" },
      });
      _SCHEDULED.delete(p.id);
    }, p.fireMs - now);
    _SCHEDULED.set(p.id, handle);
  });
  try { localStorage.setItem(_REMINDERS_KEY, JSON.stringify(pending)); } catch {}
  return _SCHEDULED.size;
}

// On mount: reload any reminders that were persisted before the page
// refreshed and haven't fired yet.
//
// Native: a no-op — the OS holds the schedule across app lifecycle.
// (NotificationsCard's effect still calls scheduleReminders when the
// saved-set list changes, so any drift gets reconciled.)
function loadAndReschedule(showLocal) {
  if (_capLocalNotifications()) return 0;
  let count = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(_REMINDERS_KEY) || "[]");
    const now = Date.now();
    const live = saved.filter(r => r.fireMs > now && r.fireMs - now <= 24 * 3600000);
    live.forEach(r => {
      if (_SCHEDULED.has(r.id)) return;
      const lead = r.leadMin || 15;
      const handle = setTimeout(() => {
        showLocal(`${r.name} starts in ${lead} min`, {
          body: `${r.stageName} · ${fmt12(r.start)}`,
          tag: `set-${r.id}`,
          data: { url: "/" },
        });
        _SCHEDULED.delete(r.id);
      }, r.fireMs - now);
      _SCHEDULED.set(r.id, handle);
      count++;
    });
    if (live.length !== saved.length)
      localStorage.setItem(_REMINDERS_KEY, JSON.stringify(live));
  } catch {}
  return count;
}

function NotificationsCard({ state }) {
  const { supported, perm, enable, showLocal } = useNotifications();
  const [scheduled, setScheduled] = React.useState(0);
  const [flash, setFlash] = React.useState(null); // 'enabled' | 'tested'
  const [leadMin, setLeadMinState] = React.useState(getReminderLeadMin);
  const onPickLead = (mins) => {
    setReminderLeadMin(mins);
    setLeadMinState(mins);
    if (perm === "granted") setScheduled(scheduleReminders(state, showLocal));
  };

  // On mount: restore reminders that survived a page reload
  React.useEffect(() => {
    if (perm === "granted") {
      const n = loadAndReschedule(showLocal);
      if (n > 0) setScheduled(n);
    }
  }, []);

  // Re-schedule whenever the save list changes
  React.useEffect(() => {
    if (perm === "granted") setScheduled(scheduleReminders(state, showLocal));
  }, [perm, state.saved.join(",")]);

  const onEnable = async () => {
    const r = await enable();
    if (r === "granted") {
      const n = scheduleReminders(state, showLocal);
      setScheduled(n);
      setFlash("enabled"); setTimeout(() => setFlash(null), 2000);
    }
  };

  const onTest = async () => {
    const ok = await showLocal("Plursky reminder · TEST", {
      body: "This is what set-start alerts will look like.",
      tag: "plursky-test",
    });
    if (ok) { setFlash("tested"); setTimeout(() => setFlash(null), 1800); }
  };

  if (!supported) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: 12,
        background: "var(--paper)", border: "1px solid var(--line)",
        marginBottom: 12,
      }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", fontWeight: 700 }}>
          NOTIFICATIONS · UNSUPPORTED
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>
          {window.Capacitor?.isNativePlatform?.()
            ? "Notifications aren't wired in this build yet — set-time reminders will land in a future update."
            : "Your browser doesn't support web notifications. Install Plursky to your home screen for the full experience."}
        </div>
      </div>
    );
  }

  const label = perm === "granted" ? "ENABLED" : perm === "denied" ? "BLOCKED" : "OFF";
  const labelColor = perm === "granted" ? "var(--success)" : perm === "denied" ? "#f87171" : "var(--muted)";

  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "var(--paper)", border: "1px solid var(--line)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700 }}>
          REMINDERS
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: labelColor, fontWeight: 700 }}>
          {flash === "enabled" ? "✓ ENABLED" : flash === "tested" ? "✓ TEST SENT" : label}
        </span>
      </div>
      <div className="serif" style={{ fontSize: 19, lineHeight: 1.1, marginBottom: 4 }}>
        {leadMin}-min head-up before each set
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: perm === "denied" ? 8 : 12 }}>
        {perm === "granted"
          ? scheduled > 0
            ? `${scheduled} reminder${scheduled === 1 ? "" : "s"} set · alerts fire even when Plursky is in the background.`
            : "No sets starting in the next 24 hours — reminders will activate automatically during the festival."
          : perm === "denied"
            ? (window.Capacitor?.isNativePlatform?.()
                ? "Notifications are blocked in iOS Settings."
                : "Notifications are blocked for this site.")
            : `Get a notification ${leadMin} minutes before each saved set so you don't miss a thing.`}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", fontWeight: 700 }}>
          LEAD TIME
        </span>
        <div style={{ display: "flex", gap: 5 }}>
          {_REMINDER_LEAD_OPTIONS.map(m => {
            const on = m === leadMin;
            return (
              <button key={m} onClick={() => onPickLead(m)} className="mono" style={{
                padding: "4px 9px", borderRadius: 999, cursor: "pointer",
                background: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper)" : "var(--ink)",
                border: on ? "none" : "1px solid var(--line-2)",
                fontSize: 9.5, letterSpacing: 1.1, fontWeight: on ? 700 : 500,
              }}>{m}M</button>
            );
          })}
        </div>
      </div>
      {perm === "denied" && (
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
          borderRadius: 10, padding: "10px 12px", marginBottom: 12,
        }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>
            HOW TO RE-ENABLE
          </div>
          {window.Capacitor?.isNativePlatform?.() ? (
            <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.55 }}>
              iPhone: <strong>Settings</strong> → <strong>Plursky</strong> → <strong>Notifications</strong> → set <em>Allow Notifications</em> ON.
            </div>
          ) : /iPhone|iPad|iPod/.test(navigator.userAgent) ? (
            <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.55 }}>
              iPhone: <strong>Settings</strong> → <strong>Apps</strong> → <strong>Safari</strong> → <strong>Notifications</strong> → find <em>plursky.com</em> → Allow
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.55 }}>
              Tap the <strong>lock icon</strong> (or <strong>ⓘ</strong>) in your browser's address bar → <strong>Site settings</strong> → <strong>Notifications</strong> → set to <strong>Allow</strong>, then reload.
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {perm !== "granted" && perm !== "denied" && (
          <button onClick={onEnable} style={{
            background: "var(--ember)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 14px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
          }}>ENABLE</button>
        )}
        {perm === "granted" && (
          <button onClick={onTest} style={{
            background: "transparent", color: "var(--ink)", border: "1px solid var(--line-2)",
            borderRadius: 999, padding: "8px 14px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
          }}>SEND A TEST</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Festival switcher (Phase 2)
// ─────────────────────────────────────────────────────────────
// Small "EDC LV 2026 ▾" pill that opens a sheet listing every
// festival in FESTIVALS_REGISTRY. Selectable festivals reload the
// page with their config; "coming soon" festivals are visible as
// a roadmap preview but not selectable.
function FestivalChip({ compact = false, accent = "var(--ink)" }) {
  const [open, setOpen] = React.useState(false);
  const canSwitch = FESTIVALS_REGISTRY.filter(f => f.available).length > 1;
  const entry = FESTIVALS_REGISTRY.find(f => f.config.id === FESTIVAL_CONFIG.id);
  return (
    <>
      <div
        onClick={canSwitch ? () => setOpen(true) : undefined}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
          color: accent,
          borderRadius: 999, padding: compact ? "3px 8px 3px 7px" : "4px 10px 4px 8px",
          fontFamily: "Geist Mono, monospace",
          fontSize: compact ? 9 : 9.5, letterSpacing: 1.2, fontWeight: 700,
          cursor: canSwitch ? "pointer" : "default", whiteSpace: "nowrap",
          userSelect: "none",
        }}>
        <span style={{ fontSize: compact ? 11 : 12 }}>{entry?.emoji || "🎪"}</span>
        <span>{FESTIVAL_CONFIG.shortName.toUpperCase()}</span>
        {canSwitch && (
          <svg width={compact ? 8 : 9} height={compact ? 8 : 9} viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5 L6 7.5 L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {open && <FestivalSwitcher onClose={() => setOpen(false)} />}
    </>
  );
}

function FestivalSwitcher({ onClose }) {
  const activeId = FESTIVAL_CONFIG.id;
  const onPick = (id, available) => {
    if (!available || id === activeId) { onClose(); return; }
    setActiveFestivalAndReload(id);
  };
  const byRegion = {};
  FESTIVALS_REGISTRY.forEach(f => {
    (byRegion[f.region] = byRegion[f.region] || []).push(f);
  });
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 60,
      background: "rgba(13,8,4,0.55)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end",
      animation: "fadeIn .2s",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        width: "100%", padding: "14px 20px 24px",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.4)",
        maxHeight: "85%", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--line-2)" }}/>
        </div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", marginBottom: 4 }}>
          PICK A FESTIVAL
        </div>
        <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 18 }}>
          Where are you raving?
        </div>

        {Object.entries(byRegion).map(([region, fests]) => (
          <div key={region} style={{ marginBottom: 18 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>
              {region.toUpperCase()}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {fests.map(f => {
                const isActive = f.config.id === activeId;
                const dimmed = !f.available;
                return (
                  <button key={f.config.id} onClick={() => onPick(f.config.id, f.available)}
                    disabled={!f.available && !isActive}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 14,
                      background: isActive ? f.accent : "var(--paper-2)",
                      color: isActive ? "#fff" : "var(--ink)",
                      border: `1px solid ${isActive ? f.accent : "var(--line-2)"}`,
                      cursor: f.available ? "pointer" : "default",
                      opacity: dimmed && !isActive ? 0.55 : 1,
                      textAlign: "left", fontFamily: "inherit",
                      transition: "transform .12s",
                    }}>
                    <span style={{ fontSize: 22 }}>{f.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="serif" style={{ fontSize: 18, lineHeight: 1.05, fontWeight: 400 }}>
                        {f.config.name}
                      </div>
                      <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1, marginTop: 3, opacity: 0.85 }}>
                        {f.config.location.toUpperCase()} · {f.config.dates.toUpperCase()}
                      </div>
                    </div>
                    {isActive && (
                      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "rgba(255,255,255,0.25)" }}>
                        ACTIVE
                      </div>
                    )}
                    {!isActive && !f.available && (
                      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "var(--paper)", color: "var(--muted)", border: "1px solid var(--line-2)" }}>
                        SOON
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
          More festivals coming through 2026.<br/>
          Switching reloads the app with the new festival's data.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Battery-saver mode
// ─────────────────────────────────────────────────────────────
// Three modes: "off" | "on" | "auto" (default).
//   auto = (battery <25% on a non-charging device) AND
//          (we're inside the festival window — i.e. user has a saved set within 24h
//           OR right now is between FESTIVAL_START_MS and FESTIVAL_END_MS).
// Pre-event there's no point dimming the UI; the late-night clock trigger fired
// inappropriately when the user was just opening the app at 3 AM weeks before.
// When active, body.bs-on disables all keyframe animations, transitions,
// and backdrop-filter blurs, then dims via brightness/saturate. Geolocation
// (map.jsx) and the demo-wander tick read window._BS.active to throttle.
const BATTERY_SAVER_KEY = "battery_saver_mode";
const _BS = (window._BS = window._BS || {
  mode: (() => {
    try { return localStorage.getItem(BATTERY_SAVER_KEY) || "auto"; }
    catch { return "auto"; }
  })(),
  battery: null,         // { level: 0..1, charging: bool } when supported
  active: false,
  listeners: new Set(),  // (active) => void
});

function _bsHasFestivalContext() {
  // Active during the festival window itself, OR when the user has a saved set
  // starting within the next 24h. Outside that window the auto-trigger is off.
  try {
    const now = Date.now();
    const cfg = (typeof window !== "undefined" && window.FESTIVAL_CONFIG) || null;
    if (cfg && typeof cfg.startMs === "number" && typeof cfg.endMs === "number") {
      if (now >= cfg.startMs && now <= cfg.endMs) return true;
    }
    const artists = (typeof window !== "undefined" && window.ARTISTS) || null;
    const dayDates = cfg && cfg.dayDates;
    if (!artists || !dayDates) return false;
    let raw = "[]";
    try {
      const fid = cfg && cfg.id;
      raw = (fid && localStorage.getItem(`${fid}_saved_v1`)) || "[]";
    } catch {}
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length) {
      const horizon = now + 24 * 3600 * 1000;
      for (const id of saved) {
        const a = artists.find(x => x.id === id);
        if (!a || !a.start) continue;
        const dm = dayDates[a.day];
        if (!dm || typeof dm.midnightUtc !== "number") continue;
        const [h, m] = String(a.start).split(":").map(Number);
        const isOvernight = h < 12;
        const startMs = dm.midnightUtc + (isOvernight ? 86400000 : 0) + (h || 0) * 3600000 + (m || 0) * 60000;
        if (startMs >= now && startMs <= horizon) return true;
      }
    }
  } catch {}
  return false;
}

function _bsCompute() {
  if (_BS.mode === "on")  return true;
  if (_BS.mode === "off") return false;
  // auto: real low-battery only, gated by festival context
  const lowBatt = _BS.battery && !_BS.battery.charging && _BS.battery.level < 0.25;
  if (!lowBatt) return false;
  return _bsHasFestivalContext();
}
function _bsApply() {
  const next = _bsCompute();
  if (next === _BS.active && document.body.classList.contains("bs-on") === next) {
    return; // idempotent fast-path
  }
  _BS.active = next;
  if (typeof document !== "undefined") {
    document.body.classList.toggle("bs-on", next);
  }
  _BS.listeners.forEach(fn => { try { fn(next); } catch {} });
}
function setBatterySaverMode(mode) {
  if (!["off", "on", "auto"].includes(mode)) return;
  _BS.mode = mode;
  try { localStorage.setItem(BATTERY_SAVER_KEY, mode); } catch {}
  _bsApply();
}

// One-time init: hook the Battery Status API when available, recompute on
// the hour for the auto night-window, and inject the CSS overrides.
if (!window._bsInited) {
  window._bsInited = true;

  (async () => {
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        const sync = () => {
          _BS.battery = { level: b.level, charging: b.charging };
          _bsApply();
        };
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
        sync();
      } else {
        _bsApply();
      }
    } catch { _bsApply(); }
  })();

  // Re-evaluate the night-window every 5 min (cheap, lets auto-mode flip on
  // at 02:00 without waiting for an unrelated battery event).
  setInterval(_bsApply, 5 * 60 * 1000);

  const tag = document.createElement("style");
  tag.id = "bs-css";
  tag.textContent = `
    body.bs-on, body.bs-on * {
      animation: none !important;
      transition: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    body.bs-on .ios-frame, body.bs-on .stage {
      filter: brightness(0.72) saturate(0.85);
    }
    body.bs-on .bs-hide { display: none !important; }
  `;
  document.head.appendChild(tag);
}

function useBatterySaver() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    _BS.listeners.add(force);
    return () => _BS.listeners.delete(force);
  }, []);
  return {
    active:  _BS.active,
    mode:    _BS.mode,
    battery: _BS.battery,    // { level, charging } | null
    setMode: setBatterySaverMode,
  };
}

// One-shot toast that appears when auto-mode flips ON. Once the user has
// seen it for this session, we suppress until a fresh page load.
function BatterySaverToast() {
  const { active, mode, battery } = useBatterySaver();
  const [shown, setShown] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (active && mode === "auto" && !shown && !dismissed) {
      setShown(true);
      const t = setTimeout(() => setDismissed(true), 6000);
      return () => clearTimeout(t);
    }
  }, [active, mode, shown, dismissed]);

  if (!shown || dismissed) return null;
  const reason = (battery && !battery.charging && battery.level < 0.25)
    ? `${Math.round(battery.level * 100)}% battery — dimmed for the long stretch.`
    : "Late-night mode — dimmed and animations paused.";
  return (
    <div className="bs-hide" style={{
      position: "absolute", left: 16, right: 16, top: 60, zIndex: 80,
      padding: "10px 14px", borderRadius: 14,
      background: "var(--ink)", color: "var(--paper)",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    }}>
      <span style={{ fontSize: 16 }}>🔋</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--flare)", fontWeight: 700 }}>
          BATTERY SAVER ON
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2, color: "rgba(247,237,224,0.85)" }}>
          {reason}
        </div>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: "rgba(247,237,224,0.6)", fontSize: 18, lineHeight: 1, padding: 4,
      }}>×</button>
    </div>
  );
}

// Settings card for MeScreen — segmented control + live battery readout.
function BatterySaverCard() {
  const { active, mode, battery, setMode } = useBatterySaver();
  const segs = [
    { id: "off",  label: "OFF" },
    { id: "auto", label: "AUTO" },
    { id: "on",   label: "ON" },
  ];
  const battPct = battery ? Math.round(battery.level * 100) : null;
  const battColor = battPct == null ? "var(--muted)"
    : battPct > 50 ? "var(--success)"
    : battPct > 20 ? "var(--flare)"
    : "#f87171";

  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "var(--paper)", border: "1px solid var(--line)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700 }}>
          BATTERY SAVER
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: active ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
          {active ? "✓ ACTIVE" : "STANDBY"}
        </span>
      </div>
      <div className="serif" style={{ fontSize: 19, lineHeight: 1.1, marginBottom: 4 }}>
        Stretch the phone past sunrise
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
        Dims the screen, freezes animations, and slows GPS polling.
        Auto kicks in at 2 AM or when battery drops under 25%.
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4,
        background: "var(--paper-2)", borderRadius: 999, padding: 3,
        border: "1px solid var(--line)",
      }}>
        {segs.map(s => {
          const on = mode === s.id;
          return (
            <button key={s.id} onClick={() => setMode(s.id)} style={{
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink)",
              border: "none", borderRadius: 999, padding: "7px 10px",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
              cursor: "pointer",
            }}>{s.label}</button>
          );
        })}
      </div>

      {battPct != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{
            position: "relative", width: 28, height: 13,
            border: "1.4px solid var(--ink)", borderRadius: 3,
          }}>
            <div style={{
              position: "absolute", top: 1, left: 1, bottom: 1,
              width: `${Math.max(0, Math.min(100, battPct)) * 0.24}px`,
              background: battColor, borderRadius: 1,
            }}/>
            <div style={{
              position: "absolute", right: -3, top: 3, bottom: 3, width: 2,
              background: "var(--ink)", borderRadius: 1,
            }}/>
          </div>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--ink)", fontWeight: 600 }}>
            {battPct}% {battery.charging ? "· CHARGING" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status strip — sticky thin bar above every screen.
// Shows local DAY · TIME plus offline and battery-saver indicators
// so reorientation / connectivity / power context is glanceable
// from any tab without opening Home.
// ─────────────────────────────────────────────────────────────
function _useTickMs(intervalMs) {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(force, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function useOnlineStatus() {
  const [online, setOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  React.useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const _STATUS_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function StatusStrip() {
  _useTickMs(30000);
  const online = useOnlineStatus();
  const { active: bsActive } = useBatterySaver();

  const now = new Date();
  const day = _STATUS_DAYS[now.getDay()];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return (
    <div className="mono" style={{
      flexShrink: 0,
      height: 22,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 16px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--line)",
      fontSize: 9.5, letterSpacing: 1.4, fontWeight: 600,
      color: "var(--muted)",
    }}>
      <span>{day} · {hh}:{mm}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {bsActive && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--flare)" }}>
            <svg width="9" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="12" height="17" rx="1.5"/>
              <path d="M10 1 L14 1"/>
              <path d="M11 9 L13 9 L11 13 L14 13 L10 18"/>
            </svg>
            SAVER
          </span>
        )}
        {!online && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#c14a37" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4 L20 20"/>
              <path d="M2 9 Q6 5 10 5.4 M22 9 Q18 5 14 5.4"/>
              <path d="M6 13 Q12 8 18 13" opacity="0.55"/>
              <circle cx="12" cy="19" r="0.9" fill="currentColor"/>
            </svg>
            OFFLINE
          </span>
        )}
      </span>
    </div>
  );
}

Object.assign(window, {
  Screen, ScrollBody, TopBar, TabBar, Pill, ArtistSwatch, Wordmark,
  useArtistPhoto,
  useInstallPrompt, InstallBanner,
  useNotifications, NotificationsCard, scheduleReminders,
  getAllAttended, getAttendedForNight, getAttendedCount, markAttended, unmarkAttended,
  isAttended, getAttendanceSource, detectCurrentArtist, recordAttendanceFromGps,
  FestivalChip, FestivalSwitcher,
  useBatterySaver, BatterySaverCard, BatterySaverToast, setBatterySaverMode,
  useOnlineStatus, StatusStrip,
});
