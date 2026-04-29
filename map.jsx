// Hybrid map — top-down navigation (default) + ground-level peek when a stage is selected.
// Designed to feel like a real wayfinding app: glanceable, easy to meet friends, easy to route.

// ── Messaging ─────────────────────────────────────────────────
// Per-friend chat threads persisted in localStorage. Demo seed so the
// drawer feels alive; real backend would replace _fakeReply with a fetch.
const QUICK_REPLIES = [
  { tag: "OMW",          text: "🚀 omw" },
  { tag: "AT STAGE",     text: "📍 at the stage now" },
  { tag: "MEET TOTEM",   text: "🪧 meet at the totem?" },
  { tag: "WATER",        text: "💧 water break — back in 10" },
  { tag: "FOUND U",      text: "👀 i see you" },
  { tag: "NEED YOU",     text: "🆘 come find me" },
];
const _SEED_MSGS = {
  f1: [
    { from: "them", text: "yooo where you at??", ts: Date.now() - 1000*60*22 },
    { from: "me",   text: "kineticFIELD, by the totems", ts: Date.now() - 1000*60*19 },
    { from: "them", text: "🚀 omw", ts: Date.now() - 1000*60*4 },
  ],
  f2: [
    { from: "them", text: "trance hit different tonight 😭", ts: Date.now() - 1000*60*38 },
  ],
  f3: [],
  f4: [
    { from: "them", text: "circuitGROUNDS in 5", ts: Date.now() - 1000*60*8 },
  ],
};
function loadThread(friendId) {
  try {
    const raw = localStorage.getItem(`msg_${friendId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return _SEED_MSGS[friendId] || [];
}
function saveThread(friendId, msgs) {
  try { localStorage.setItem(`msg_${friendId}`, JSON.stringify(msgs)); } catch {}
}
function clearAllThreads() {
  Object.keys(localStorage).filter(k => k.startsWith("msg_")).forEach(k => localStorage.removeItem(k));
}
function unreadCount(friendId) {
  const t = loadThread(friendId);
  const lastRead = parseInt(localStorage.getItem(`msg_read_${friendId}`) || "0", 10);
  return t.filter(m => m.from === "them" && m.ts > lastRead).length;
}
function markRead(friendId) {
  try { localStorage.setItem(`msg_read_${friendId}`, String(Date.now())); } catch {}
}
// Returns a contextual reply based on the user's last message
function _fakeReply(userText) {
  const t = userText.toLowerCase();
  if (/omw|on my way/.test(t))                return ["see you in a sec 🌟", 5000];
  if (/water|hydrat/.test(t))                  return ["💧 same. by the cosmic water tent", 6500];
  if (/totem|meet/.test(t))                    return ["📍 already there", 4500];
  if (/kinetic|field/.test(t))                 return ["pulling up to kineticFIELD now", 7000];
  if (/circuit|techno/.test(t))                return ["circuit's going off rn 🔥", 5500];
  if (/where|location/.test(t))                return ["bionic — pin coming", 6000];
  if (/help|need|sos|🆘/.test(t))              return ["coming. stay where u are 🚨", 3500];
  if (/love|👀|❤️/.test(t))                    return ["🥺 ur the best", 5000];
  return ["🫶", 4500 + Math.random()*2500];
}

// Friend status broadcasts — what stage they're at + freshness
const _SEED_STATUSES = {
  f1: { stage: "bionic",  ts: Date.now() - 1000*60*8  },
  f2: { stage: "quantum", ts: Date.now() - 1000*60*22 },
  f3: { stage: "stereo",  ts: Date.now() - 1000*60*4  },
  f4: { stage: "circuit", ts: Date.now() - 1000*60*15 },
};
function friendStatus(friendId) {
  try {
    const raw = localStorage.getItem(`status_${friendId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return _SEED_STATUSES[friendId] || null;
}
function getMyStatus() {
  try { return JSON.parse(localStorage.getItem("status_me") || "null"); } catch { return null; }
}
function persistMyStatus(stageId) {
  try { localStorage.setItem("status_me", JSON.stringify({ stage: stageId, ts: Date.now() })); } catch {}
}
function broadcastMyLocation(stageId) {
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return;
  const msg = `I'm at ${stage.name} 👋 come through`;
  FRIENDS.forEach(f => {
    saveThread(f.id, [...loadThread(f.id), { from: "me", text: msg, ts: Date.now(), status: "sent" }]);
  });
}


// ── Wellness state ── persists across sessions in localStorage
//
// Hydration drifts down -1% every 90s while the page is open. We don't try
// to back-fill drift while the page is closed (that'd punish someone who
// closed the app at 100% and reopened next day at 0%); instead we cap
// computed drift at 6 hrs since last drink.
const HYD_DRIFT_PER_MIN = 60 / 90;       // ~0.67%/min
const HYD_DRIFT_CAP_MIN = 6 * 60;        // 6h max drift

function readWellness() {
  try {
    const raw = localStorage.getItem("wellness");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { lastDrink: Date.now(), lastRest: Date.now() };
}
function writeWellness(w) {
  try { localStorage.setItem("wellness", JSON.stringify(w)); } catch {}
}
function computeHydration(lastDrink) {
  const minsSince = Math.min(HYD_DRIFT_CAP_MIN, (Date.now() - lastDrink) / 60000);
  return Math.max(0, Math.round(100 - minsSince * HYD_DRIFT_PER_MIN));
}

function WellnessPill() {
  const [w, setW] = React.useState(readWellness);
  const [open, setOpen] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const { active: bsActive } = useBatterySaver();
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), bsActive ? 120000 : 30000);
    return () => clearInterval(id);
  }, [bsActive]);

  const hyd = computeHydration(w.lastDrink);
  const restMin = Math.floor((Date.now() - w.lastRest) / 60000);
  const hydColor = hyd > 70 ? "#34d399" : hyd > 40 ? "#f59a36" : "#f87171";
  const restColor = restMin < 75 ? "rgba(247,237,224,0.85)" : restMin < 120 ? "#f59a36" : "#f87171";

  const drank = () => {
    const nw = { ...w, lastDrink: Date.now() };
    setW(nw); writeWellness(nw); setTick(t => t + 1);
  };
  const rested = () => {
    const nw = { ...w, lastRest: Date.now() };
    setW(nw); writeWellness(nw); setTick(t => t + 1);
  };
  const restLabel = restMin < 60 ? `${restMin}m` : `${Math.floor(restMin / 60)}h${(restMin % 60).toString().padStart(2, "0")}`;

  const restColorLight = restMin < 75 ? "var(--ink)" : restMin < 120 ? "#b8651b" : "#c14a4a";
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{
        position: "absolute", top: 14, left: 10, zIndex: 4,
        display: "flex", alignItems: "center", gap: 7,
        padding: "5px 10px 5px 7px", borderRadius: 999,
        background: "rgba(247,237,224,0.96)",
        border: `1px solid ${hyd < 40 || restMin > 120 ? "#c14a4a" : "var(--line-2)"}`,
        backdropFilter: "blur(10px)",
        color: "var(--ink)",
        fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1, fontWeight: 600,
        cursor: "pointer",
        boxShadow: hyd < 40 ? "0 0 0 4px rgba(193,74,74,0.16)" : "0 2px 8px rgba(26,18,13,0.08)",
      }}>
        <span style={{ fontSize: 12 }}>💧</span>
        <span style={{ color: hyd > 70 ? "var(--ink)" : hyd > 40 ? "#b8651b" : "#c14a4a", fontWeight: 700 }}>{hyd}%</span>
        <span style={{ width: 1, height: 10, background: "var(--line-2)" }}/>
        <span style={{ color: restColorLight, fontWeight: 700 }}>{restLabel}</span>
      </button>

      {open && (
        <div style={{ position: "absolute", inset: 0, zIndex: 6 }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}/>
          <div style={{
            position: "absolute", left: 14, right: 14, top: 100,
            background: "var(--paper)", color: "var(--ink)",
            borderRadius: 16, padding: 16,
            boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
          }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", marginBottom: 6 }}>
              WELLNESS · DESERT DEFAULTS
            </div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 12 }}>
              Take care of you.
            </div>

            {/* Hydration */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: hydColor, fontWeight: 700 }}>HYDRATION</span>
                <span className="serif" style={{ fontSize: 24, color: hydColor }}>{hyd}%</span>
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${hyd}%`, height: "100%", background: hydColor, borderRadius: 6, transition: "width .35s" }}/>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 5, lineHeight: 1.4 }}>
                {hyd > 70 ? "Cruising — top up next set." : hyd > 40 ? "Hit a water station soon." : "Drink water now. ~−1% per 90 sec in the heat."}
              </div>
              <button onClick={drank} style={{
                marginTop: 8, width: "100%",
                background: "#38bdf8", color: "#fff", border: "none",
                borderRadius: 10, padding: "10px 12px",
                fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.2, fontWeight: 700,
                cursor: "pointer",
              }}>💧 LOGGED · DRANK WATER</button>
            </div>

            {/* Rest */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: restColor, fontWeight: 700 }}>ON FEET</span>
                <span className="serif" style={{ fontSize: 24, color: restColor }}>{restLabel}</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 0, lineHeight: 1.4 }}>
                {restMin < 75 ? "Pace is good." : restMin < 120 ? "Sit down at the next break." : "Take 10 min off your feet — you'll dance harder later."}
              </div>
              <button onClick={rested} style={{
                marginTop: 8, width: "100%",
                background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--line-2)",
                borderRadius: 10, padding: "10px 12px",
                fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.2, fontWeight: 700,
                cursor: "pointer",
              }}>🦵 LOGGED · TOOK A BREAK</button>
            </div>

            <button onClick={() => setOpen(false)} style={{
              marginTop: 12, width: "100%",
              background: "transparent", border: "none",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.4, color: "var(--muted)",
              cursor: "pointer", textTransform: "uppercase",
            }}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Real GPS plumbing ─────────────────────────────────────────
// Three stage GPS anchors (from FESTIVAL_CONFIG.gpsAnchors) give us an
// affine transform from (lat, lng) → SVG (mapX, mapY) on the 0-100 grid.
// Swap the festival config and the transform automatically retunes for
// the new venue.
const FESTIVAL_LAT       = FESTIVAL_CONFIG.gps.lat;
const FESTIVAL_LNG       = FESTIVAL_CONFIG.gps.lng;
const ON_SITE_RADIUS_MI  = FESTIVAL_CONFIG.gps.onSiteRadiusMi;

// 3-point Cramer affine: [mapX, mapY] = M · [lat, lng, 1]
function _solveMapAffine() {
  const find = (id) => STAGES.find(s => s.id === id);
  const [a0, a1, a2] = FESTIVAL_CONFIG.gpsAnchors;
  const A = { lat: a0.lat, lng: a0.lng, mx: find(a0.stageId).x, my: find(a0.stageId).y };
  const B = { lat: a1.lat, lng: a1.lng, mx: find(a1.stageId).x, my: find(a1.stageId).y };
  const C = { lat: a2.lat, lng: a2.lng, mx: find(a2.stageId).x, my: find(a2.stageId).y };
  const det = A.lat*(B.lng - C.lng) - A.lng*(B.lat - C.lat) + (B.lat*C.lng - C.lat*B.lng);
  const solve = (v1, v2, v3) => {
    const a = (v1*(B.lng - C.lng)        - A.lng*(v2 - v3)            + (B.lng*v3 - C.lng*v2)) / det;
    const b = (A.lat*(v2 - v3)           - v1*(B.lat - C.lat)         + (B.lat*v3 - C.lat*v2)) / det;
    const c = (A.lat*(B.lng*v3 - C.lng*v2) - A.lng*(B.lat*v3 - C.lat*v2) + v1*(B.lat*C.lng - C.lat*B.lng)) / det;
    return [a, b, c];
  };
  return { x: solve(A.mx, B.mx, C.mx), y: solve(A.my, B.my, C.my) };
}
const MAP_AFFINE = _solveMapAffine();
function gpsToMap(lat, lng) {
  return {
    x: MAP_AFFINE.x[0]*lat + MAP_AFFINE.x[1]*lng + MAP_AFFINE.x[2],
    y: MAP_AFFINE.y[0]*lat + MAP_AFFINE.y[1]*lng + MAP_AFFINE.y[2],
  };
}
// Haversine miles
function distMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
          + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Watch the user's real position. Returns { pos, status, lastUpdate }.
// In battery-saver mode, drops high-accuracy GPS and lets the browser cache
// fixes for 30s — saves a meaningful chunk of battery on long late-night sessions.
function useGeolocation(enabled) {
  const [pos, setPos] = React.useState(null);
  const [status, setStatus] = React.useState("idle"); // idle | locating | live | denied | unavailable
  const { active: bsActive } = useBatterySaver();
  React.useEffect(() => {
    if (!enabled) { setStatus("idle"); return; }
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("locating");
    let alive = true;
    const opts = bsActive
      ? { enableHighAccuracy: false, maximumAge: 30000, timeout: 30000 }
      : { enableHighAccuracy: true,  maximumAge: 4000,  timeout: 15000 };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!alive) return;
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: Date.now() });
        setStatus("live");
      },
      (e) => {
        if (!alive) return;
        setStatus(e.code === 1 ? "denied" : "unavailable");
      },
      opts
    );
    return () => { alive = false; navigator.geolocation.clearWatch(id); };
  }, [enabled, bsActive]);
  return { pos, status };
}

// ── Walking time model ─────────────────────────────────────
// Reddit/raver-sourced estimates beat naïve dist*c. KIN→CIR is the longest
// walk on the map (15-25 min); adjacent stages are 5-15 min depending on
// pinch-points. The 1-3 AM crowd window adds ~50-60% as people leak between
// mainstage drops. Avatar→stage falls back to a piecewise distance curve
// when the avatar isn't anchored to a known stage.
// All 36 stage pairs; keys alphabetically sorted so _pairKey always hits.
const WALK_PAIRS = {
  "basspod,bionic":  [10, 16],
  "basspod,circuit": [ 6, 10],
  "basspod,cosmic":  [ 9, 13],
  "basspod,kinetic": [ 6, 10],
  "basspod,neon":    [10, 14],
  "basspod,quantum": [10, 14],
  "basspod,stereo":  [ 8, 12],
  "basspod,waste":   [ 6, 10],
  "bionic,circuit":  [14, 22],
  "bionic,cosmic":   [ 6, 10],
  "bionic,kinetic":  [ 7, 11],
  "bionic,neon":     [12, 17],
  "bionic,quantum":  [10, 14],
  "bionic,stereo":   [ 4,  7],
  "bionic,waste":    [ 7, 11],
  "circuit,cosmic":  [12, 18],
  "circuit,kinetic": [15, 25],
  "circuit,neon":    [ 5,  9],
  "circuit,quantum": [ 9, 13],
  "circuit,stereo":  [11, 16],
  "circuit,waste":   [10, 14],
  "cosmic,kinetic":  [10, 15],
  "cosmic,neon":     [13, 18],
  "cosmic,quantum":  [13, 18],
  "cosmic,stereo":   [ 6, 10],
  "cosmic,waste":    [ 7, 11],
  "kinetic,neon":    [10, 14],
  "kinetic,quantum": [ 5,  9],
  "kinetic,stereo":  [ 8, 12],
  "kinetic,waste":   [ 6, 10],
  "neon,quantum":    [ 7, 11],
  "neon,stereo":     [10, 14],
  "neon,waste":      [12, 17],
  "quantum,stereo":  [ 7, 11],
  "quantum,waste":   [13, 18],
  "stereo,waste":    [ 7, 11],
};

function _pairKey(a, b) { return a < b ? `${a},${b}` : `${b},${a}`; }

function _nearestStageId(x, y, radius = 9) {
  let best = null, bestD = radius;
  for (const s of STAGES) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { bestD = d; best = s.id; }
  }
  return best;
}

function _distToBand(d) {
  if (d < 12) return [ 2,  4];
  if (d < 22) return [ 4,  7];
  if (d < 35) return [ 6, 10];
  if (d < 50) return [10, 14];
  if (d < 65) return [13, 20];
  return        [18, 28];
}

// { lo, hi, peak, plan } — `plan` flips on for the "plan 20+ min" advisory
// during the 01:00-03:00 crowd peak when the upper bound is already > 15.
function computeWalkRange(avatarX, avatarY, targetStage, dist, nowTime) {
  let lo, hi;
  const fromStage = _nearestStageId(avatarX, avatarY);
  if (fromStage && targetStage && fromStage !== targetStage.id) {
    const k = _pairKey(fromStage, targetStage.id);
    if (WALK_PAIRS[k]) [lo, hi] = WALK_PAIRS[k];
  }
  if (lo == null) [lo, hi] = _distToBand(dist);

  const hour = nowTime ? parseInt(String(nowTime).split(":")[0], 10) : -1;
  const isPeak = hour >= 1 && hour < 3;
  if (isPeak) { lo = Math.round(lo * 1.5); hi = Math.round(hi * 1.6); }

  return { lo, hi, peak: isPeak, plan: isPeak && hi >= 15 };
}

// Single-number flavour for meet-pin ETAs (avatar→pin / friend→pin).
function distToMins(d) {
  const [lo, hi] = _distToBand(d);
  return Math.max(1, Math.round((lo + hi) / 2));
}

// Find the user's next saved set today: live now, or starting soon. Returns
// null if nothing saved on the current festival day. Used by NextSetStrip
// to power the top-of-map heads-up banner.
function findNextSavedSet(savedIds) {
  const nowMin = toNightMin(NOW.time);
  const todays = savedIds
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(a => a && a.day === NOW.day)
    .map(a => ({ a, sM: toNightMin(a.start), eM: toNightMin(a.end) }))
    .filter(x => x.eM > nowMin)
    .sort((x, y) => x.sM - y.sM);
  if (!todays.length) return null;
  const live = todays.find(x => x.sM <= nowMin && x.eM > nowMin);
  const pick = live || todays[0];
  return {
    artist:    pick.a,
    isLive:    !!live,
    minsUntil: Math.max(0, pick.sM - nowMin),
    minsLeft:  Math.max(0, pick.eM - nowMin),
  };
}

// ── Friend ping codes ─────────────────────────────────────────
// Each user gets a friendly 4-letter code (LIME, FROG, etc.) generated
// once + persisted. Share your code with a friend; they enter it in
// their app to drop a "find me" pin on your live position. Without a
// backend, lookup is demo-only: codes that match one of the seeded
// friends drop the pin on that friend; unknown codes drop near the
// avatar with a "code not found, demo pin" notice.
const PING_WORDS = [
  "LIME","KIWI","PLUM","SAGE","ROSE","DUSK","DAWN","NEON",
  "LOFT","FROG","STAR","MOTH","MINT","JADE","RUBY","PINE",
  "FERN","SOLO","HOWL","WAVE","MOON","ECHO","HAZE","SAGA",
];
function getMyPingCode() {
  try {
    let c = localStorage.getItem("ping_code");
    if (c && /^[A-Z]{4}$/.test(c)) return c;
    c = PING_WORDS[Math.floor(Math.random() * PING_WORDS.length)];
    localStorage.setItem("ping_code", c);
    return c;
  } catch {
    return "PLUR";
  }
}
// Demo-only: 4-letter "address book" mapping codes to seeded friends.
// In production this would be a server lookup against the user's actual
// friend list / contacts.
const DEMO_FRIEND_CODES = { LIME: "f1", FROG: "f2", NEON: "f3", PLUM: "f4" };

function PingSheet({ onClose, onDropPin, friends }) {
  const myCode = getMyPingCode();
  const [input, setInput] = React.useState("");
  const [feedback, setFeedback] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  const submit = () => {
    const c = input.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) {
      setFeedback({ kind: "err", text: "Enter a 4-letter code." });
      return;
    }
    const friendId = DEMO_FRIEND_CODES[c];
    if (friendId) {
      const f = friends.find(fr => fr.id === friendId);
      if (f) {
        onDropPin({ x: f.x, y: f.y, label: `${f.name} (${c})` });
        setFeedback({ kind: "ok", text: `Pin dropped on ${f.name}.` });
        setTimeout(onClose, 700);
        return;
      }
    }
    setFeedback({ kind: "warn", text: `Code "${c}" not in your address book yet (demo).` });
  };

  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`Find me on Plursky — code ${myCode}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  };
  const shareCode = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Plursky",
          text: `Find me on Plursky — code ${myCode}`,
        });
      } else {
        copyCode();
      }
    } catch {}
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(13,10,8,0.55)",
      zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 460,
        background: "var(--paper)", color: "var(--ink)",
        borderRadius: "16px 16px 0 0",
        padding: "16px 18px 22px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800 }}>PING CODES</span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        <div className="serif" style={{ fontSize: 14, color: "var(--muted)", marginBottom: 10 }}>
          Share your code so a friend can drop a pin on you.
        </div>

        <div style={{
          background: "var(--ink)", color: "var(--paper)",
          borderRadius: 14, padding: "16px 18px", marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, opacity: 0.6, marginBottom: 2 }}>YOUR CODE</div>
            <div className="serif" style={{ fontSize: 38, letterSpacing: 4, fontWeight: 400 }}>{myCode}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={shareCode} style={{
              background: "var(--ember)", color: "#fff", border: "none",
              borderRadius: 8, padding: "7px 14px",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
              cursor: "pointer",
            }}>SHARE</button>
            <button onClick={copyCode} style={{
              background: "transparent", color: "var(--paper)",
              border: "1px solid rgba(247,237,224,0.35)",
              borderRadius: 8, padding: "7px 14px",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
              cursor: "pointer",
            }}>{copied ? "COPIED" : "COPY"}</button>
          </div>
        </div>

        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
          DROP A PIN FROM A FRIEND'S CODE
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="LIME"
            maxLength={4}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{
              flex: 1, background: "var(--paper-2)", color: "var(--ink)",
              border: "1px solid var(--line-2)",
              borderRadius: 10, padding: "10px 14px",
              fontFamily: "Geist Mono, monospace", fontSize: 18,
              letterSpacing: 4, fontWeight: 700, textTransform: "uppercase",
              outline: "none",
            }}
          />
          <button onClick={submit} style={{
            background: "var(--ink)", color: "var(--paper)", border: "none",
            borderRadius: 10, padding: "10px 18px",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.4, fontWeight: 700,
            cursor: "pointer",
          }}>DROP PIN</button>
        </div>
        {feedback && (
          <div className="mono" style={{
            marginTop: 10, fontSize: 9.5, letterSpacing: 1.1, fontWeight: 700,
            color: feedback.kind === "ok" ? "var(--success)"
                 : feedback.kind === "err" ? "var(--ember)"
                 : "var(--horizon)",
          }}>{feedback.text}</div>
        )}
        <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 14, lineHeight: 1.5 }}>
          TIP: use the <span style={{ color: "var(--success)", fontWeight: 700 }}>CREW</span> button above for live real-time tracking with friends.
        </div>
      </div>
    </div>
  );
}

function IAmAtSheet({ onClose, initialStage, onStatusSet }) {
  const [selected, setSelected] = React.useState(initialStage || null);
  const [sent, setSent] = React.useState(false);

  const stage = STAGES.find(s => s.id === selected);

  const shareLink = async () => {
    if (!stage) return;
    persistMyStatus(selected);
    onStatusSet(selected);
    const text = `I'm at ${stage.name} at EDC LV 2026 🎧 come find me — plursky.com`;
    if (navigator.share) {
      try { await navigator.share({ text, title: "Where I'm at" }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); } catch {}
    }
    onClose();
  };

  const tellCrew = () => {
    if (!stage) return;
    persistMyStatus(selected);
    onStatusSet(selected);
    broadcastMyLocation(selected);
    setSent(true);
    setTimeout(onClose, 900);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(13,10,8,0.55)",
      zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 460,
        background: "var(--paper)", color: "var(--ink)",
        borderRadius: "16px 16px 0 0",
        padding: "16px 18px 28px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800 }}>WHERE ARE YOU?</span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {STAGES.map(s => {
            const on = selected === s.id;
            return (
              <button key={s.id} onClick={() => setSelected(s.id)} style={{
                padding: "8px 6px", borderRadius: 10,
                background: on ? s.color : "var(--paper-2)",
                color: on ? "#fff" : "var(--ink)",
                border: on ? "none" : "1px solid var(--line-2)",
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: on ? "rgba(255,255,255,0.7)" : s.color }} />
                <span className="mono" style={{ fontSize: 7.5, letterSpacing: 0.8, fontWeight: on ? 700 : 500, textAlign: "center", lineHeight: 1.2 }}>{s.short}</span>
              </button>
            );
          })}
        </div>

        {stage && (
          <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 10, background: `${stage.color}18`, borderLeft: `3px solid ${stage.color}` }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: stage.color, fontWeight: 700 }}>
              {stage.vibe?.toUpperCase()}
            </span>
            <span className="serif" style={{ fontSize: 14, marginLeft: 8 }}>{stage.name}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={tellCrew} disabled={!stage} style={{
            flex: 1, padding: "10px 12px", borderRadius: 999,
            background: sent ? "var(--success)" : (stage ? "var(--ink)" : "var(--paper-2)"),
            color: stage ? "var(--paper)" : "var(--muted)",
            border: "none", cursor: stage ? "pointer" : "default",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
            transition: "background .2s",
          }}>{sent ? "✓ CREW NOTIFIED" : "TELL MY CREW"}</button>
          <button onClick={shareLink} disabled={!stage} style={{
            flex: 1, padding: "10px 12px", borderRadius: 999,
            background: stage ? "var(--ember)" : "var(--paper-2)",
            color: stage ? "#fff" : "var(--muted)",
            border: "none", cursor: stage ? "pointer" : "default",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
          }}>SHARE LINK ↗</button>
        </div>
      </div>
    </div>
  );
}

// ── Saved-set reminders ──────────────────────────────────────
// 15-min-before reminder hook. Fires a Web Notification when a saved set
// is about to start. Two layers:
//   1) Permission + opt-in persisted in localStorage ("notify_enabled")
//   2) setInterval(60s) checks real wall-clock against each saved set's
//      absolute start time; fires once per set, deduped via fired Set.
// Limitation: only works while the app is open in a tab. Reliable
// background delivery requires a Web Push subscription + backend; the
// SW push handler in sw.js is already wired for that future swap.
function readNotifyEnabled() {
  try { return localStorage.getItem("notify_enabled") === "1"; } catch { return false; }
}
function writeNotifyEnabled(v) {
  try { localStorage.setItem("notify_enabled", v ? "1" : "0"); } catch {}
}
function _setStartRealMs(artist) {
  // Use FESTIVAL_CONFIG.dayDates to map (day, "HH:MM") → real local Date.
  const meta = FESTIVAL_CONFIG.dayDates?.[artist.day];
  if (!meta) return null;
  const [h, m] = artist.start.split(":").map(Number);
  const d = new Date(meta.y, meta.m, meta.d, h, m, 0, 0);
  // Sets before 08:00 are early-morning of the *next* calendar day
  if (h < 8) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function useSavedSetReminders(savedIds, enabled) {
  const firedRef = React.useRef(new Set());
  React.useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const tick = () => {
      const now = Date.now();
      savedIds.forEach(id => {
        if (firedRef.current.has(id)) return;
        const a = ARTISTS.find(x => x.id === id);
        if (!a) return;
        const startMs = _setStartRealMs(a);
        if (!startMs) return;
        const minsUntil = (startMs - now) / 60000;
        // Fire once when 0–15 min out
        if (minsUntil > 0 && minsUntil <= 15) {
          firedRef.current.add(id);
          try {
            const stage = STAGES.find(s => s.id === a.stage);
            new Notification(`${a.name} in ${Math.round(minsUntil)} min`, {
              body: `${stage?.name || a.stage} · ${a.start}`,
              tag: `set-${id}`,
              icon: "/og.svg",
            });
          } catch {}
        }
      });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [savedIds, enabled]);
}

function NotifyPill({ enabled, onChange }) {
  const supported = typeof Notification !== "undefined";
  const denied = supported && Notification.permission === "denied";
  const onClick = async () => {
    if (!supported) return;
    if (enabled) { writeNotifyEnabled(false); onChange(false); return; }
    let perm = Notification.permission;
    if (perm === "default") {
      try { perm = await Notification.requestPermission(); } catch { perm = "denied"; }
    }
    if (perm !== "granted") { onChange(false); return; }
    writeNotifyEnabled(true);
    onChange(true);
    try {
      new Notification("Plursky notifications on", {
        body: "You'll get a heads-up 15 min before saved sets.",
        tag: "notify-on",
        icon: "/og.svg",
      });
    } catch {}
  };
  const label = !supported ? "N/A" : denied ? "BLOCKED" : enabled ? "🔔 ON" : "🔔 OFF";
  return (
    <button onClick={onClick} disabled={!supported || denied} title="Set reminders 15 min before saved sets" style={{
      display: "flex", alignItems: "center", gap: 4,
      background: enabled ? "var(--ember)" : "var(--paper)",
      color: enabled ? "#fff" : "var(--muted)",
      border: enabled ? "none" : "1px solid var(--line-2)",
      borderRadius: 999, padding: "3px 8px",
      fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
      cursor: supported && !denied ? "pointer" : "not-allowed",
      opacity: !supported || denied ? 0.55 : 1,
    }}>{label}</button>
  );
}

// ── Weather strip ────────────────────────────────────────────
// Live conditions at the festival lat/lng via Open-Meteo (free, no
// auth, CORS-friendly). Cached in localStorage for 1h so we don't
// hammer the API on every map mount. Vegas mid-May norms: 85°F days,
// 60°F nights, occasional 20+ mph wind gusts that knock totems over.
const WMO_LABELS = {
  0:"Clear", 1:"Mostly clear", 2:"Partly cloudy", 3:"Overcast",
  45:"Fog", 48:"Icy fog",
  51:"Drizzle", 53:"Drizzle", 55:"Drizzle",
  61:"Rain", 63:"Rain", 65:"Heavy rain",
  71:"Snow", 73:"Snow", 75:"Snow",
  80:"Showers", 81:"Showers", 82:"Heavy showers",
  95:"Thunder", 96:"Thunder", 99:"Severe thunder",
};
function _weatherEmoji(code, isNight) {
  if (code === 0 || code === 1) return isNight ? "🌙" : "☀️";
  if (code === 2 || code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 65) return "🌧️";
  if (code >= 71 && code <= 75) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}
function _weatherVibe({ tempF, windMph, code }) {
  if (code >= 95) return "Lightning — find shelter NOW.";
  if (code >= 61 && code <= 82) return "Rain — kandi runs first, dance second.";
  if (windMph >= 25) return "Heavy gusts — secure totems and headpieces.";
  if (windMph >= 15) return "Breezy — light layers stay zipped.";
  if (tempF <= 55) return "Cold for Vegas — long sleeves, hand warmers.";
  if (tempF <= 62) return "Cool night — bring a hoodie for sunrise.";
  if (tempF <= 72) return "Perfect dancing weather.";
  if (tempF <= 82) return "Warm — hydrate every set.";
  return "Hot — water station every set, no excuses.";
}
function readCachedWeather() {
  try {
    const raw = localStorage.getItem("weather_cache");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || Date.now() - obj.ts > 60 * 60 * 1000) return null;
    return obj.data;
  } catch { return null; }
}
function writeCachedWeather(data) {
  try { localStorage.setItem("weather_cache", JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function useWeather() {
  const [w, setW] = React.useState(readCachedWeather);
  React.useEffect(() => {
    if (w) return;
    const lat = FESTIVAL_LAT, lng = FESTIVAL_LNG;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    let cancelled = false;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled || !j?.current) return;
        const data = {
          tempF:    Math.round(j.current.temperature_2m),
          windMph:  Math.round(j.current.wind_speed_10m),
          code:     j.current.weather_code,
          isDay:    !!j.current.is_day,
        };
        writeCachedWeather(data);
        setW(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [w]);
  return w;
}
function WeatherStrip() {
  const w = useWeather();
  if (!w) return null;
  const label = WMO_LABELS[w.code] || "Conditions";
  const emoji = _weatherEmoji(w.code, !w.isDay);
  const vibe = _weatherVibe(w);
  const isAlert = w.code >= 95 || w.windMph >= 25 || (w.code >= 61 && w.code <= 82);
  return (
    <div style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "8px 11px", marginTop: 8, borderRadius: 12,
      background: isAlert ? "rgba(232,93,46,0.10)" : "var(--paper-2)",
      border: `1px solid ${isAlert ? "rgba(232,93,46,0.45)" : "var(--line)"}`,
    }}>
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 1.4, fontWeight: 700,
          color: isAlert ? "var(--ember)" : "var(--muted)", marginBottom: 1,
        }}>LVMS · LIVE WEATHER</div>
        <div className="serif" style={{
          fontSize: 16, lineHeight: 1.05, letterSpacing: -0.2, color: "var(--ink)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{vibe}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="mono" style={{
          fontSize: 13, letterSpacing: 0.8, fontWeight: 800, color: "var(--ink)",
        }}>{w.tempF}°F</div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1, fontWeight: 600, color: "var(--muted)", marginTop: 2,
        }}>{w.windMph} MPH · {label.toUpperCase()}</div>
      </div>
    </div>
  );
}

// Sunrise countdown to Kinetic Field — only renders 90 min before
// sunrise to 30 min after. EDC's sunrise sets at KIN are the festival's
// signature moment; this strip flags it so a vet doesn't sleep through.
function SunriseStrip({ avatar, onSelect }) {
  const sun = FESTIVAL_CONFIG.sunTimes?.[NOW.day];
  if (!sun) return null;
  const nowMin = toNightMin(NOW.time);
  const riseMin = toNightMin(sun.rise);
  const minsUntil = riseMin - nowMin;
  // Render window: 90 min before → 30 min after sunrise
  if (minsUntil > 90 || minsUntil < -30) return null;
  const kin = STAGES.find(s => s.id === "kinetic");
  if (!kin) return null;
  const dist = Math.hypot(kin.x - avatar.x, kin.y - avatar.y);
  const walk = computeWalkRange(avatar.x, avatar.y, kin, dist, NOW.time);
  const walkLabel = walk.lo === walk.hi ? `${walk.lo}` : `${walk.lo}–${walk.hi}`;
  const isUp = minsUntil <= 0;

  return (
    <button onClick={() => onSelect(kin.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "8px 11px", marginTop: 8,
      background: "linear-gradient(90deg, #f59a36 0%, #e85d2e 60%, #a78bfa 100%)",
      color: "#fff", border: "none", borderRadius: 12,
      cursor: "pointer", textAlign: "left",
      boxShadow: "0 4px 14px rgba(245,154,54,0.35)",
    }}>
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🌅</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 1.4, fontWeight: 800,
          opacity: 0.85, marginBottom: 1,
        }}>SUNRISE · KINETIC FIELD</div>
        <div className="serif" style={{
          fontSize: 16, lineHeight: 1.05, letterSpacing: -0.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{isUp ? "Sun is up — head to the lotus" : "Hold the line for sunrise"}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="mono" style={{
          fontSize: 11, letterSpacing: 1.2, fontWeight: 800,
        }}>{isUp ? "NOW" : `${minsUntil}M`}</div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1, fontWeight: 600,
          opacity: 0.85, marginTop: 2,
        }}>{walkLabel}M WALK</div>
      </div>
    </button>
  );
}

function NextSetStrip({ savedIds, avatar, onSelect }) {
  const next = findNextSavedSet(savedIds);
  if (!next) return null;
  const stage = STAGES.find(s => s.id === next.artist.stage);
  if (!stage) return null;
  const dist = Math.hypot(stage.x - avatar.x, stage.y - avatar.y);
  const walk = computeWalkRange(avatar.x, avatar.y, stage, dist, NOW.time);
  const walkLabel = walk.lo === walk.hi ? `${walk.lo}` : `${walk.lo}–${walk.hi}`;

  // "LIVE — 38m left" vs "STARTS 0h 24m" framing
  const headline = next.isLive
    ? `LIVE · ${next.minsLeft}M LEFT`
    : next.minsUntil < 60
        ? `IN ${next.minsUntil}M`
        : `IN ${Math.floor(next.minsUntil/60)}H ${next.minsUntil%60}M`;
  // Walk vs start-time tension flag: if walk hi >= time-until-start, late
  const willBeLate = !next.isLive && walk.hi >= next.minsUntil && next.minsUntil > 0;

  return (
    <button onClick={() => onSelect(stage.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "8px 11px", marginTop: 8,
      background: next.isLive ? "var(--ember)" : "var(--ink)",
      color: next.isLive ? "#fff" : "var(--paper)",
      border: "none", borderRadius: 12,
      cursor: "pointer", textAlign: "left",
      boxShadow: next.isLive ? "0 4px 14px rgba(232,93,46,0.35)" : "0 2px 8px rgba(26,18,13,0.18)",
    }}>
      <div style={{
        width: 6, alignSelf: "stretch", borderRadius: 3,
        background: stage.color,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 1.4, fontWeight: 700,
          opacity: 0.7, marginBottom: 1,
        }}>
          {next.isLive ? "★ NEXT UP — LIVE" : "★ NEXT UP"}
        </div>
        <div className="serif" style={{
          fontSize: 17, lineHeight: 1.05, letterSpacing: -0.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{next.artist.name}</div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.1, fontWeight: 600,
          color: next.isLive ? "rgba(255,255,255,0.85)" : "rgba(247,237,224,0.7)",
          marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {stage.name.toUpperCase()} · {next.artist.start}–{next.artist.end}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: 1.2, fontWeight: 800,
        }}>{headline}</div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1, fontWeight: 600,
          opacity: 0.75, marginTop: 2,
        }}>
          {walkLabel}M WALK
        </div>
        {willBeLate && (
          <div className="mono" style={{
            fontSize: 8, letterSpacing: 1, fontWeight: 800,
            color: "#fbbf24", marginTop: 2,
          }}>⚠ MOVE NOW</div>
        )}
      </div>
    </button>
  );
}

function MapScreen({ state, setState }) {
  const [selectedStage, setSelectedStage] = React.useState(state.focusStage || null);
  const [gpsLive, setGpsLive] = React.useState(true);
  const [demoAvatar, setDemoAvatar] = React.useState(AVATAR_START);
  const [friends, setFriends] = React.useState(FRIENDS);
  const [peek, setPeek] = React.useState(false);
  const [meetMode, setMeetMode] = React.useState(false);
  const [meetTarget, setMeetTarget] = React.useState(null);
  const [meetGroup, setMeetGroup] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [heading, setHeading] = React.useState(0);
  const [chatFriend, setChatFriend] = React.useState(null);
  const [rideshareOpen, setRideshareOpen] = React.useState(false);
  const [showLabels, setShowLabels] = React.useState(false);
  const [showHeat,   setShowHeat]   = React.useState(false);
  const [pingOpen, setPingOpen] = React.useState(false);
  const [iAmAtOpen, setIAmAtOpen] = React.useState(false);
  const [myStatusStage, setMyStatusStage] = React.useState(() => getMyStatus()?.stage || null);
  const [crewLive, setCrewLive] = React.useState(false);
  const [crewSnap, setCrewSnap] = React.useState(() => sbGetPresSnap());
  const crewName = React.useMemo(() => {
    try { return localStorage.getItem("plursky_display_name") || localStorage.getItem("user_name") || ""; } catch { return ""; }
  }, []);
  // Push-style reminders for saved sets — see useSavedSetReminders below.
  const [notifyEnabled, setNotifyEnabled] = React.useState(readNotifyEnabled);
  useSavedSetReminders(state.saved, notifyEnabled);
  // Compass mode — rotate the entire map so the user's facing direction is
  // always "up". Uses DeviceOrientationEvent (with iOS permission gate).
  const [compass, setCompass] = React.useState(false);
  const [compassHeading, setCompassHeading] = React.useState(0);
  const [compassStatus, setCompassStatus] = React.useState("off"); // off/locating/live/denied/unavailable

  const enableCompass = React.useCallback(async () => {
    if (typeof DeviceOrientationEvent === "undefined") {
      setCompassStatus("unavailable"); return;
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== "granted") { setCompassStatus("denied"); return; }
      } catch { setCompassStatus("denied"); return; }
    }
    setCompassStatus("locating");
    setCompass(true);
  }, []);

  const _compassRef = React.useRef({ smoothed: 0, absEverSeen: false });
  React.useEffect(() => {
    if (!compass) return;
    const ref = _compassRef.current;
    ref.absEverSeen = false;
    const handler = (e) => {
      let h = null;
      // iOS: webkitCompassHeading is calibrated true-north (preferred)
      if (e.webkitCompassHeading != null) {
        h = e.webkitCompassHeading;
      // Android Chrome: deviceorientationabsolute always has absolute=true
      } else if (e.absolute && e.alpha != null) {
        h = (360 - e.alpha) % 360;
        ref.absEverSeen = true;
      // Relative alpha only if no absolute source has fired (last resort)
      } else if (e.alpha != null && !ref.absEverSeen) {
        h = (360 - e.alpha) % 360;
      }
      if (h != null) {
        // Circular exponential smoothing (handles 359→1 wraparound)
        let delta = h - ref.smoothed;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        ref.smoothed = ((ref.smoothed + delta * 0.18) + 360) % 360;
        // Only push to state when change is visible (> 0.5°) to cut re-renders
        if (Math.abs(delta) > 0.5) setCompassHeading(Math.round(ref.smoothed * 2) / 2);
        setCompassStatus("live");
      }
    };
    window.addEventListener("deviceorientationabsolute", handler);
    window.addEventListener("deviceorientation", handler);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
    };
  }, [compass]);

  // Real GPS → on-site map coords, off-site distance, or null
  const { pos: gpsPos, status: gpsStatus } = useGeolocation(gpsLive);
  const liveAvatar = React.useMemo(() => {
    if (!gpsPos) return null;
    const mi = distMiles(gpsPos.lat, gpsPos.lng, FESTIVAL_LAT, FESTIVAL_LNG);
    if (mi > ON_SITE_RADIUS_MI) return { offSite: true, mi };
    const { x, y } = gpsToMap(gpsPos.lat, gpsPos.lng);
    return {
      onSite: true,
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y)),
      accuracy: gpsPos.accuracy,
    };
  }, [gpsPos]);

  const isLiveOnSite = !!liveAvatar?.onSite;
  // When we don't have real on-site GPS, use the demo avatar (auto-walks
  // toward selected stage / meet pin so the routing UI stays interactive).
  const useDemo = !isLiveOnSite;
  const avatar = isLiveOnSite ? { x: liveAvatar.x, y: liveAvatar.y } : demoAvatar;

  // Demo wander tick — only runs when not pinned to real on-site GPS.
  // Slows from 600ms → 2400ms in battery-saver mode (still feels alive,
  // 4× fewer renders).
  const { active: bsActive } = useBatterySaver();
  React.useEffect(() => {
    if (!useDemo) return;
    const id = setInterval(() => {
      const goal = meetMode && meetTarget ? meetTarget
                 : selectedStage ? STAGES.find(s => s.id === selectedStage)
                 : null;
      setDemoAvatar(a => {
        if (goal) {
          const dx = goal.x - a.x, dy = goal.y - a.y;
          const d = Math.hypot(dx, dy);
          setHeading(Math.atan2(dy, dx));
          if (d < 1.2) return a;
          return { x: a.x + (dx/d) * 0.35, y: a.y + (dy/d) * 0.35 };
        }
        return {
          x: Math.max(12, Math.min(88, a.x + (Math.random() - 0.5) * 0.2)),
          y: Math.max(12, Math.min(88, a.y + (Math.random() - 0.5) * 0.2)),
        };
      });
      setFriends(prev => prev.map(f => {
        if (meetMode && meetTarget && meetGroup.includes(f.id)) {
          const dx = meetTarget.x - f.x, dy = meetTarget.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d < 1.2) return f;
          return { ...f, x: f.x + (dx/d) * 0.32, y: f.y + (dy/d) * 0.32 };
        }
        return {
          ...f,
          x: Math.max(12, Math.min(88, f.x + (Math.random() - 0.5) * 0.25)),
          y: Math.max(12, Math.min(88, f.y + (Math.random() - 0.5) * 0.25)),
        };
      }));
    }, bsActive ? 2400 : 600);
    return () => clearInterval(id);
  }, [useDemo, selectedStage, meetMode, meetTarget, meetGroup, bsActive]);

  // Heading derivation when real GPS is on-site and walking toward a goal
  React.useEffect(() => {
    if (!isLiveOnSite) return;
    const goal = meetMode && meetTarget ? meetTarget
               : selectedStage ? STAGES.find(s => s.id === selectedStage)
               : null;
    if (!goal) return;
    setHeading(Math.atan2(goal.y - avatar.y, goal.x - avatar.x));
  }, [isLiveOnSite, avatar.x, avatar.y, selectedStage, meetMode, meetTarget]);

  // Subscribe to Supabase Realtime presence — crew members broadcasting their stage
  React.useEffect(() => sbOnPresenceChange(s => setCrewSnap({ ...s })), []);

  // Convert presence snap → map positions for rendering
  const myPresId = sbGetMyPresId();
  const crewFriends = React.useMemo(() => {
    return Object.entries(crewSnap)
      .filter(([id]) => id !== myPresId)
      .map(([id, e]) => {
        const st = STAGES.find(s => s.id === e.stageId);
        if (!st) return null;
        return { id, name: e.name || "?", color: e.color || "#888", x: st.x, y: st.y, stageId: e.stageId, ts: e.ts };
      }).filter(Boolean);
  }, [crewSnap, myPresId]);

  const toggleCrewLive = () => {
    if (crewLive) {
      sbPresenceLeave();
      setCrewLive(false);
    } else {
      sbPresenceJoin({ name: crewName || "Anon", stageId: myStatusStage || STAGES[0].id });
      setCrewLive(true);
    }
  };

  const stage = selectedStage ? STAGES.find(s => s.id === selectedStage) : null;
  const nowAtStage = stage ? ARTISTS.find(a => a.stage === stage.id && a.day === NOW.day) : null;
  const dx = stage ? stage.x - avatar.x : 0;
  const dy = stage ? stage.y - avatar.y : 0;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const walk = computeWalkRange(avatar.x, avatar.y, stage, dist, NOW.time);
  const meters = Math.round(dist * 22);

  const filteredStages = search
    ? STAGES.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : STAGES;

  // Click on map → drop meet pin
  const handleMapClick = (e) => {
    if (!meetMode) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const names = meetGroup.map(id => friends.find(f => f.id === id)?.name).filter(Boolean);
    setMeetTarget({ x, y, label: names.length ? `Meet ${names.join(" + ")}` : "Meet here" });
  };

  const toggleGroupMember = (friendId) => {
    const newGroup = meetGroup.includes(friendId)
      ? meetGroup.filter(id => id !== friendId)
      : [...meetGroup, friendId];
    setMeetGroup(newGroup);
    if (newGroup.length === 0) { setMeetTarget(null); return; }
    const selected = newGroup.map(id => friends.find(f => f.id === id)).filter(Boolean);
    const allX = [avatar.x, ...selected.map(f => f.x)];
    const allY = [avatar.y, ...selected.map(f => f.y)];
    const cx = allX.reduce((s, v) => s + v, 0) / allX.length;
    const cy = allY.reduce((s, v) => s + v, 0) / allY.length;
    setMeetTarget({ x: cx, y: cy, label: `Meet ${selected.map(f => f.name).join(" + ")}` });
  };

  // GPS pill label — reflects real status
  const gpsLabel = !gpsLive ? "OFF"
    : gpsStatus === "live"        ? (isLiveOnSite ? "LIVE" : "OFF-SITE")
    : gpsStatus === "locating"    ? "FINDING…"
    : gpsStatus === "denied"      ? "DENIED"
    : gpsStatus === "unavailable" ? "N/A"
    : "DEMO";
  const gpsActive = gpsLive && (gpsStatus === "live" || gpsStatus === "locating");

  return (
    <Screen bg="var(--paper)" ink="var(--ink)">
      {/* SEARCH HEADER */}
      <div style={{ padding: "8px 12px", background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--paper-2)",
          borderRadius: 10, padding: "8px 10px",
          border: "1px solid var(--line)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M20 20 L16 16"/>
          </svg>
          <input
            type="text"
            placeholder="Search stages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontFamily: "Geist, sans-serif", fontSize: 13,
            }}
          />
          <NotifyPill enabled={notifyEnabled} onChange={setNotifyEnabled} />
          <button onClick={() => setShowLabels(s => !s)} title="Toggle landmark labels" style={{
            background: showLabels ? "var(--ink)" : "var(--paper)",
            color: showLabels ? "var(--paper)" : "var(--muted)",
            border: showLabels ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 8px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            cursor: "pointer",
          }}>LABELS</button>
          <button onClick={() => setShowHeat(s => !s)} style={{
            background: showHeat ? "var(--ember)" : "var(--paper)",
            color: showHeat ? "#fff" : "var(--muted)",
            border: showHeat ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 8px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            cursor: "pointer",
          }}>CROWD</button>
          <button onClick={() => {
            if (compass) { setCompass(false); setCompassStatus("off"); }
            else enableCompass();
          }} title="Heading-up compass mode" style={{
            display: "flex", alignItems: "center", gap: 4,
            background: compass && compassStatus === "live" ? "var(--horizon)" : "var(--paper)",
            color: compass && compassStatus === "live" ? "#fff" : "var(--muted)",
            border: compass && compassStatus === "live" ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 8px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            cursor: "pointer",
          }}>
            <span style={{ fontSize: 10 }}>⌖</span>
            {compass && compassStatus === "denied" ? "BLOCKED"
              : compass && compassStatus === "unavailable" ? "N/A"
              : compass && compassStatus === "locating" ? "FINDING…"
              : "COMPASS"}
          </button>
          <button onClick={() => setGpsLive(g => !g)} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: gpsActive ? "var(--ember)" : "var(--paper)",
            color: gpsActive ? "#fff" : "var(--muted)",
            border: gpsActive ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 9px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            cursor: "pointer",
          }}>
            {gpsActive && (
              <span style={{
                width: 5, height: 5, borderRadius: 5, background: "#fff",
                animation: gpsStatus === "live" ? "pulse 1.4s infinite" : "none",
              }}/>
            )}
            {gpsLabel}
          </button>
        </div>
        {liveAvatar?.offSite && (
          <div style={{
            marginTop: 6, padding: "5px 10px", borderRadius: 8,
            background: "rgba(245,154,54,0.12)", border: "1px solid rgba(245,154,54,0.4)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: "#b8651b", fontWeight: 700 }}>
              OFF-SITE · {liveAvatar.mi.toFixed(1)} MI FROM VENUE
            </span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>· showing demo position</span>
          </div>
        )}
        {gpsLive && gpsStatus === "denied" && (
          <div style={{
            marginTop: 6, padding: "5px 10px", borderRadius: 8,
            background: "rgba(193,74,74,0.10)", border: "1px solid rgba(193,74,74,0.35)",
          }}>
            <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: "#c14a4a", fontWeight: 700 }}>
              GPS DENIED · ENABLE LOCATION IN BROWSER SETTINGS
            </span>
          </div>
        )}

        {/* Find-nearest quick actions — tap to draw a route line to the
            closest amenity of that type. Works at any festival as long as
            AMENITIES are populated. */}
        {!search && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { type: "water",  label: "WATER",   emoji: "💧", color: "#38bdf8" },
              { type: "med",    label: "MEDIC",   emoji: "✚",  color: "#f87171" },
              { type: "toilet", label: "TOILET",  emoji: "🚻", color: "#94a3b8" },
              { type: "charge", label: "CHARGE",  emoji: "⚡", color: "#facc15" },
              { type: "locker", label: "LOCKER",  emoji: "🔒", color: "#a78bfa" },
            ].map(c => (
              <button key={c.type} onClick={() => {
                const matches = (typeof AMENITIES !== "undefined" ? AMENITIES : []).filter(a => a.type === c.type);
                if (!matches.length) return;
                const nearest = matches
                  .map(a => ({ ...a, _d: Math.hypot(a.x - avatar.x, a.y - avatar.y) }))
                  .sort((a, b) => a._d - b._d)[0];
                setMeetTarget({ x: nearest.x, y: nearest.y, label: nearest.label, isAmenity: true });
                setMeetMode(true);
              }} style={{
                flex: 1, padding: "6px 6px", borderRadius: 999,
                background: "var(--paper-2)", border: `1px solid ${c.color}55`,
                color: "var(--ink)", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}>
                <span style={{ fontSize: 11 }}>{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
        {search && (
          <div style={{ marginTop: 6, maxHeight: 140, overflowY: "auto", background: "var(--paper-2)", borderRadius: 8 }}>
            {filteredStages.map(s => (
              <button key={s.id} onClick={() => { setSelectedStage(s.id); setSearch(""); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                background: "transparent", border: "none", color: "var(--ink)", textAlign: "left", cursor: "pointer",
                borderRadius: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color, boxShadow: `0 0 6px ${s.color}` }}/>
                <span style={{ fontFamily: "Geist, sans-serif", fontSize: 13 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
        {/* NEXT-UP heads-up strip — your next saved set, with countdown +
            walk time. Tap to focus that stage. Hidden when nothing saved
            today or when the search box has focus. */}
        {!search && (
          <NextSetStrip
            savedIds={state.saved}
            avatar={avatar}
            onSelect={(id) => { setSelectedStage(id); setPeek(false); }}
          />
        )}
        {/* Sunrise countdown to Kinetic Field — auto-renders 90 min
            before → 30 min after sunrise. The signature EDC moment. */}
        {!search && (
          <SunriseStrip
            avatar={avatar}
            onSelect={(id) => { setSelectedStage(id); setPeek(false); }}
          />
        )}
        {/* Live weather at LVMS — temp + wind + a vibe note. Pulls
            Open-Meteo (free, no auth), 1h cache. Goes ember on rain /
            lightning / 25+ mph gusts. Hidden if API unreachable. */}
        {!search && <WeatherStrip />}
      </div>

      {/* MAP + PEEK WINDOW */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--paper-2)" }}>
        <WellnessPill />

        {/* Rideshare FAB — Uber/Lyft deep links to the south pickup zone */}
        <button onClick={() => setRideshareOpen(true)} aria-label="Rideshare pickup" style={{
          position: "absolute", right: 12,
          bottom: stage || meetMode ? 200 : 70,
          width: 46, height: 46, borderRadius: 46,
          background: "var(--paper)", color: "var(--ink)",
          border: "1px solid var(--line-2)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 4, transition: "bottom 0.3s",
          fontSize: 22,
        }}>🚗</button>
        <TopDownMap
          avatar={avatar} heading={heading} friends={friends} stages={STAGES}
          saved={state.saved} showLabels={showLabels} showHeat={showHeat}
          compass={compass && compassStatus === "live"}
          compassHeading={compassHeading}
          selected={selectedStage} meetMode={meetMode} meetTarget={meetTarget} meetGroup={meetGroup}
          crewFriends={crewFriends}
          onPickStage={(id) => { setSelectedStage(id); setPeek(false); }}
          onClick={handleMapClick}
        />

        {/* Ground-level peek window (picture-in-picture) */}
        {stage && peek && (
          <GroundPeek stage={stage} onClose={() => setPeek(false)} />
        )}

        {/* Meet mode banner */}
        {meetMode && (
          <div style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            background: meetTarget ? "var(--ember)" : "var(--paper)",
            border: meetTarget ? "none" : "1px solid var(--ember)",
            color: meetTarget ? "#fff" : "var(--ember)",
            padding: "7px 13px", borderRadius: 999,
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
            boxShadow: meetTarget ? "0 4px 16px rgba(232,93,46,0.5)" : "none",
            zIndex: 5, display: "flex", alignItems: "center", gap: 7,
          }}>
            {meetTarget ? (
              <>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: "#fff", animation: "pulse 1.4s infinite" }}/>
                {meetTarget.isAmenity
                  ? `→ ${meetTarget.label.toUpperCase()}`
                  : `${meetTarget.label.toUpperCase()} · ${meetGroup.length > 1 ? `GROUP (${meetGroup.length + 1})` : "BOTH"} WALKING`}
              </>
            ) : meetGroup.length ? "TAP MAP TO DROP PIN" : "PICK FRIENDS OR TAP MAP"}
          </div>
        )}

        {/* Friends bar (bottom overlay, always visible) */}
        <div style={{
          position: "absolute", left: 10, right: 10, bottom: stage || meetMode ? 140 : 10,
          background: "var(--paper)",
          border: "1px solid var(--line-2)",
          borderRadius: 14, padding: 8,
          boxShadow: "0 6px 20px rgba(26,18,13,0.12)",
          display: "flex", alignItems: "center", gap: 8,
          transition: "bottom 0.3s",
        }}>
          <button onClick={() => {
            if (meetMode) { setMeetMode(false); setMeetTarget(null); setMeetGroup([]); }
            else { setMeetMode(true); }
          }} style={{
            background: meetMode ? "var(--ember)" : "var(--ink)",
            color: "#fff",
            border: "none", borderRadius: 999, padding: "7px 11px",
            fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>{meetMode ? "× CANCEL" : "MEET UP"}</button>
          <button onClick={() => setPingOpen(true)} title="Share your ping code or drop a pin from one" style={{
            background: "var(--paper-2)", color: "var(--ink)",
            border: "1px solid var(--line-2)", borderRadius: 999, padding: "7px 10px",
            fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 4,
          }}><span style={{ fontSize: 11 }}>◉</span>PING</button>
          <button onClick={toggleCrewLive} title="Broadcast your location — crew sees your stage pin on the map" style={{
            background: crewLive ? "var(--success)" : "var(--paper-2)",
            color: crewLive ? "#fff" : "var(--ink)",
            border: crewLive ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "7px 10px",
            fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: crewLive ? "#fff" : "var(--muted)", animation: crewLive ? "pulse 1.6s infinite" : "none" }}/>
            CREW{crewFriends.length > 0 ? ` · ${crewFriends.length}` : ""}
          </button>
          {(() => {
            const ms = myStatusStage ? STAGES.find(s => s.id === myStatusStage) : null;
            return (
              <button onClick={() => setIAmAtOpen(true)} title="Broadcast your stage to friends" style={{
                background: ms ? ms.color : "var(--paper-2)",
                color: ms ? "#fff" : "var(--ink)",
                border: ms ? "none" : "1px solid var(--line-2)",
                borderRadius: 999, padding: "7px 10px",
                fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontSize: 11 }}>📍</span>
                {ms ? ms.short : "I'M AT"}
              </button>
            );
          })()}
          <div className="no-scrollbar" style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
            {friends.map(f => {
              const d = Math.round(Math.sqrt((f.x-avatar.x)**2 + (f.y-avatar.y)**2) * 1.8);
              const active = meetGroup.includes(f.id);
              const unread = unreadCount(f.id);
              const handleClick = () => {
                if (meetMode) { toggleGroupMember(f.id); return; }
                setChatFriend(f);
              };
              return (
                <button key={f.id} onClick={handleClick}
                  style={{
                    position: "relative",
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                    padding: "3px 8px 3px 3px", borderRadius: 999,
                    background: active ? f.color : "var(--paper-2)",
                    border: `1px solid ${active ? f.color : "var(--line-2)"}`,
                    color: active ? "#fff" : "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 0.4, fontWeight: 600,
                  }}>
                  <span style={{ width: 14, height: 14, borderRadius: 14, background: f.avatarTone, border: "1.2px solid #fff", flexShrink: 0 }}/>
                  {f.name.toUpperCase()}·{d}M
                  {unread > 0 && !meetMode && (
                    <span style={{
                      position: "absolute", top: -3, right: -3,
                      minWidth: 14, height: 14, padding: "0 4px",
                      background: "var(--ember)", color: "#fff",
                      borderRadius: 14, fontSize: 8, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1.5px solid var(--paper)",
                    }}>{unread}</span>
                  )}
                </button>
              );
            })}
            {crewFriends.map(f => {
              const st = STAGES.find(s => s.id === f.stageId);
              const minsAgo = f.ts ? Math.floor((Date.now() - f.ts) / 60000) : null;
              const age = minsAgo == null ? "" : minsAgo < 1 ? " · now" : ` · ${minsAgo}m`;
              return (
                <div key={f.id} style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 8px 3px 5px", borderRadius: 999,
                  background: `${f.color}22`,
                  border: `1px solid ${f.color}`,
                  fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 0.4, fontWeight: 600,
                  color: "var(--ink)",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 7, background: f.color, animation: "pulse 1.6s infinite", flexShrink: 0 }}/>
                  {f.name.toUpperCase()}
                  <span style={{ fontSize: 7.5, opacity: 0.7, letterSpacing: 0.8, color: st?.color }}>
                    {st?.short || ""}{age}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chat drawer — opens on friend tap (when not in meet mode) */}
      {chatFriend && (
        <MessageDrawer
          friend={chatFriend}
          avatarStage={selectedStage}
          onClose={() => setChatFriend(null)}
          onSwitchToMeet={() => {
            setMeetMode(true);
            setMeetGroup([chatFriend.id]);
            const f = friends.find(fr => fr.id === chatFriend.id);
            if (f) setMeetTarget({ x: (avatar.x + f.x) / 2, y: (avatar.y + f.y) / 2, label: `Meet ${f.name}` });
            setChatFriend(null);
          }}
        />
      )}

      {/* BOTTOM SHEET */}
      {(stage || (meetMode && meetTarget)) && (
        <BottomSheet
          stage={stage} nowAtStage={nowAtStage} dist={dist} walk={walk}
          peek={peek} setPeek={setPeek}
          meetMode={meetMode} meetTarget={meetTarget} friends={friends} meetGroup={meetGroup} avatar={avatar}
          onClose={() => setSelectedStage(null)}
          onCancelMeet={() => { setMeetMode(false); setMeetTarget(null); setMeetGroup([]); }}
          onOpenArtist={(id) => setState({ ...state, tab: "home", artist: id })}
          state={state} setState={setState}
        />
      )}

      {rideshareOpen && <RideshareSheet onClose={() => setRideshareOpen(false)} />}

      {pingOpen && (
        <PingSheet
          friends={friends}
          onClose={() => setPingOpen(false)}
          onDropPin={(target) => {
            setMeetMode(true);
            setMeetTarget(target);
          }}
        />
      )}

      {iAmAtOpen && (
        <IAmAtSheet
          initialStage={myStatusStage}
          onClose={() => setIAmAtOpen(false)}
          onStatusSet={(stageId) => {
            setMyStatusStage(stageId);
            if (crewLive) sbPresenceUpdate(stageId);
            else {
              sbPresenceJoin({ name: crewName || "Anon", stageId });
              setCrewLive(true);
            }
          }}
        />
      )}
    </Screen>
  );
}

// ---- Stage silhouette icons ────────────────────────────────
// Per-stage SVG silhouette evoking each stage's real-world shape:
// Kinetic = lotus, Bass Pod = speaker stack, Circuit = hangar, etc.
// Drawn at (cx, cy) with base radius r in SVG units. Small enough to
// stay readable at full-map zoom but distinctive enough to skim.
function StageIcon({ id, cx, cy, r, on, color }) {
  const op = on ? 1 : 0.92;
  const W = "rgba(255,255,255,0.94)";

  if (id === "kinetic") {
    // Lotus: 4-petal flower with diamond core (matches Image #3 lotus arch)
    const pts = [0, 1, 2, 3].map(i => {
      const a = i * Math.PI/2 - Math.PI/2;
      const tx = cx + r*1.2*Math.cos(a), ty = cy + r*1.2*Math.sin(a);
      return <ellipse key={i} cx={tx} cy={ty} rx={r*0.55} ry={r*0.32}
        fill={color} opacity={op}
        transform={`rotate(${i*90 + 90} ${tx} ${ty})`}/>;
    });
    return (<g>
      {pts}
      <path d={`M ${cx},${cy-r*0.7} L ${cx+r*0.7},${cy} L ${cx},${cy+r*0.7} L ${cx-r*0.7},${cy} Z`} fill={W}/>
      <circle cx={cx} cy={cy} r={r*0.3} fill={color}/>
    </g>);
  }

  if (id === "circuit") {
    // Hangar: rounded rect with LED tunnel stripe
    return (<g>
      <rect x={cx-r*1.05} y={cy-r*0.7} width={r*2.1} height={r*1.4} rx={r*0.3} fill={color} opacity={op}/>
      <rect x={cx-r*0.75} y={cy-r*0.18} width={r*1.5} height={r*0.36} fill={W}/>
    </g>);
  }

  if (id === "basspod") {
    // Triangular speaker stack pointing up
    return (<g>
      <path d={`M ${cx},${cy-r*1.05} L ${cx+r},${cy+r*0.7} L ${cx-r},${cy+r*0.7} Z`} fill={color} opacity={op}/>
      <circle cx={cx} cy={cy+r*0.1} r={r*0.32} fill={W}/>
      <line x1={cx-r*0.55} y1={cy+r*0.55} x2={cx+r*0.55} y2={cy+r*0.55} stroke={W} strokeWidth={r*0.15} strokeLinecap="round"/>
    </g>);
  }

  if (id === "neon") {
    // Hexagon (greenhouse / honeycomb)
    const pts = [0, 1, 2, 3, 4, 5].map(i => {
      const a = i * Math.PI/3 - Math.PI/2;
      return `${cx + r*Math.cos(a)},${cy + r*Math.sin(a)}`;
    }).join(" ");
    return (<g>
      <polygon points={pts} fill={color} opacity={op}/>
      <circle cx={cx} cy={cy} r={r*0.32} fill={W}/>
    </g>);
  }

  if (id === "cosmic") {
    // Sun/dome with rays
    return (<g>
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const a = deg * Math.PI/180;
        return <line key={deg}
          x1={cx + r*0.9*Math.cos(a)} y1={cy + r*0.9*Math.sin(a)}
          x2={cx + r*1.4*Math.cos(a)} y2={cy + r*1.4*Math.sin(a)}
          stroke={color} strokeWidth={r*0.22} strokeLinecap="round" opacity={op}/>;
      })}
      <circle cx={cx} cy={cy} r={r*0.85} fill={color} opacity={op}/>
      <circle cx={cx} cy={cy} r={r*0.35} fill={W}/>
    </g>);
  }

  if (id === "stereo") {
    // 6-petal bloom
    return (<g>
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const a = deg * Math.PI/180;
        const px = cx + r*0.6*Math.cos(a), py = cy + r*0.6*Math.sin(a);
        return <ellipse key={deg} cx={px} cy={py} rx={r*0.55} ry={r*0.32}
          fill={color} opacity={on ? 0.95 : 0.85}
          transform={`rotate(${deg} ${px} ${py})`}/>;
      })}
      <circle cx={cx} cy={cy} r={r*0.32} fill={W}/>
    </g>);
  }

  if (id === "bionic") {
    // Tree: trunk + canopy
    return (<g>
      <rect x={cx-r*0.18} y={cy+r*0.05} width={r*0.36} height={r*0.85} fill={color} opacity={op}/>
      <circle cx={cx} cy={cy-r*0.18} r={r*0.95} fill={color} opacity={op}/>
      <circle cx={cx-r*0.3} cy={cy-r*0.35} r={r*0.32} fill={W} opacity="0.6"/>
      <circle cx={cx} cy={cy-r*0.18} r={r*0.32} fill={W}/>
    </g>);
  }

  if (id === "quantum") {
    // Pyramid (trance peak) with prism inset
    return (<g>
      <path d={`M ${cx},${cy-r*1.05} L ${cx+r},${cy+r*0.65} L ${cx-r},${cy+r*0.65} Z`} fill={color} opacity={op}/>
      <path d={`M ${cx-r*0.55},${cy-r*0.1} L ${cx+r*0.55},${cy-r*0.1} L ${cx},${cy+r*0.5} Z`} fill={W} opacity="0.92"/>
    </g>);
  }

  if (id === "waste") {
    // Industrial 8-point gear/star
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI/8 - Math.PI/2;
      const rad = i % 2 === 0 ? r : r * 0.62;
      pts.push(`${cx + rad*Math.cos(a)},${cy + rad*Math.sin(a)}`);
    }
    return (<g>
      <polygon points={pts.join(" ")} fill={color} opacity={op}/>
      <circle cx={cx} cy={cy} r={r*0.32} fill={W}/>
    </g>);
  }

  // Fallback: original 2-circle dot
  return (<g>
    <circle cx={cx} cy={cy} r={r} fill={color} opacity={op}/>
    <circle cx={cx} cy={cy} r={r*0.38} fill={W}/>
  </g>);
}

// ---- CROWD HEATMAP ----
// Estimated crowd density 0–1 at a stage for a given nowMin.
// Tiers: headliner=3, prime=2, opener=1. Crowd fades out over 20 min after a set ends.
function _crowdDensity(stageId, nowMin) {
  const playing = ARTISTS.find(a =>
    a.stage === stageId &&
    toNightMin(a.start) <= nowMin &&
    toNightMin(a.end)   >  nowMin
  );
  if (playing) return 0.25 + (playing.tier / 3) * 0.75;

  // Find the most recently ended set at this stage (within 20 min)
  let recent = null;
  ARTISTS.forEach(a => {
    if (a.stage !== stageId) return;
    const endMin = toNightMin(a.end);
    if (endMin > nowMin || endMin < nowMin - 20) return;
    if (!recent || endMin > toNightMin(recent.end)) recent = a;
  });
  if (recent) {
    const fade = 1 - (nowMin - toNightMin(recent.end)) / 20;
    return (0.25 + (recent.tier / 3) * 0.75) * fade * 0.55;
  }
  return 0.04; // ambient
}

// ---- TOP-DOWN NAVIGATION MAP ----
function TopDownMap({ avatar, heading, friends, stages, saved = [], showLabels = false, showHeat = false, compass = false, compassHeading = 0, selected, meetMode, meetTarget, meetGroup = [], crewFriends = [], onPickStage, onClick }) {
  // Compass mode: rotate the entire map by -heading so the user's facing
  // direction is always "up" on screen. Readable text labels counter-rotate
  // back to upright so they stay legible at any heading.
  const mapRotate = compass ? -compassHeading : 0;
  const counterRot = compass ? ` rotate(${compassHeading}deg)` : "";
  const sel = stages.find(s => s.id === selected);

  // Stages where the user has an upcoming saved set today — used to draw a
  // gold ★ overlay so users can spot at a glance "where am I going next?"
  const savedByStage = React.useMemo(() => {
    const nowMin = toNightMin(NOW.time);
    const map = {};
    saved.forEach(id => {
      const a = ARTISTS.find(x => x.id === id);
      if (!a || a.day !== NOW.day) return;
      const startMin = toNightMin(a.start);
      const endMin = toNightMin(a.end);
      if (endMin <= nowMin) return; // already over
      const minsUntil = startMin - nowMin;
      const existing = map[a.stage];
      if (!existing || minsUntil < existing.minsUntil) {
        map[a.stage] = { artist: a, minsUntil, isLive: nowMin >= startMin };
      }
    });
    return map;
  }, [saved]);

  // Pre-computed starfield — deterministic LCG so it doesn't flicker on re-render
  const stars = React.useMemo(() => {
    let s = 0xdeadbeef;
    const rng = () => { s = Math.imul(s ^ (s >>> 17), 0x45d9f3b) ^ ((s * 0x119de1f3) >>> 16); return ((s >>> 0) / 0x100000000); };
    const out = [];
    for (let i = 0; i < 55; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = 36 + rng() * 28;
      const x     = +(50 + Math.cos(angle) * dist).toFixed(1);
      const y     = +(50 + Math.sin(angle) * dist).toFixed(1);
      if (x < 0.5 || x > 99.5 || y < 0.5 || y > 99.5) continue;
      out.push({ x, y, r: +(0.18 + rng() * 0.32).toFixed(2), op: +(0.25 + rng() * 0.55).toFixed(2) });
    }
    return out;
  }, []);

  // Push label OUT from stage in the direction farthest from the Daisy Lane
  // plaza centre (50,50), so labels never collide with the central rectangle.
  const anchorFor = (s) => {
    const cx = 50, cy = 50;
    const dx = s.x - cx, dy = s.y - cy;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) return dy < 0 ? "N" : "S";
    return dx < 0 ? "W" : "E";
  };

  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: "#060412",
    }}>
    <div style={{
      position: "absolute", inset: 0,
      transform: compass ? `rotate(${mapRotate}deg)` : undefined,
      transformOrigin: "50% 50%",
      // Linear (not ease) so heading changes feel responsive like a real
      // compass needle rather than spongy.
      transition: "transform 0.18s linear",
    }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        onClick={onClick}
        style={{ position: "absolute", inset: 0, cursor: meetMode ? "crosshair" : "default", display: "block" }}>
        <defs>
          {/* Night sky ground — deepest at edges, slightly less dark at center */}
          <radialGradient id="mapGround" cx="50%" cy="48%" r="72%">
            <stop offset="0%"   stopColor="#130b28"/>
            <stop offset="55%"  stopColor="#0c0820"/>
            <stop offset="100%" stopColor="#060412"/>
          </radialGradient>
          {/* Purple–teal nebula wash over the infield */}
          <radialGradient id="infieldGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%"   stopColor="rgba(120,60,210,0.22)"/>
            <stop offset="60%"  stopColor="rgba(60,30,120,0.08)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
          </radialGradient>
          {/* Warm amber glow at exact infield center for Daisy Lane plaza */}
          <radialGradient id="daisyGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="rgba(240,160,40,0.18)"/>
            <stop offset="100%" stopColor="rgba(240,160,40,0)"/>
          </radialGradient>
          {/* Rainbow LED ring — unchanged, looks great on dark bg */}
          <linearGradient id="ledring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#e85d2e"/>
            <stop offset="20%"  stopColor="#f59a36"/>
            <stop offset="40%"  stopColor="#22c55e"/>
            <stop offset="60%"  stopColor="#38bdf8"/>
            <stop offset="80%"  stopColor="#a78bfa"/>
            <stop offset="100%" stopColor="#ec4899"/>
          </linearGradient>
          {/* Strong glow for stage markers on dark background */}
          <filter id="stageglow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Soft outer bloom for star twinkle */}
          <filter id="starbloom" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Night sky base */}
        <rect x="0" y="0" width="100" height="100" fill="url(#mapGround)"/>

        {/* Starfield — pre-computed positions, no re-render flicker */}
        <g filter="url(#starbloom)">
          {stars.map((st, i) => (
            <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.op}/>
          ))}
        </g>

        {/* LVMS tri-oval track — LED ring blazes bright on dark sky */}
        <path d="M 42 14 L 58 14 A 36 36 0 0 1 58 86 Q 54 88 50 90 Q 46 88 42 86 A 36 36 0 0 1 42 14 Z"
          fill="rgba(20,12,40,0.6)" stroke="rgba(180,140,255,0.12)" strokeWidth="3.2"/>
        <path d="M 42 14 L 58 14 A 36 36 0 0 1 58 86 Q 54 88 50 90 Q 46 88 42 86 A 36 36 0 0 1 42 14 Z"
          fill="none" stroke="url(#ledring)" strokeWidth="1.2" opacity="0.95"/>
        <path d="M 42 14 L 58 14 A 36 36 0 0 1 58 86 Q 54 88 50 90 Q 46 88 42 86 A 36 36 0 0 1 42 14 Z"
          fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.3"/>
        <path d="M 47 19 L 53 19 A 31 31 0 0 1 53 81 Q 51.5 82.5 50 84 Q 48.5 82.5 47 81 A 31 31 0 0 1 47 19 Z"
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.22" strokeDasharray="1 1.5"/>
        {/* Start/finish stripe */}
        <line x1="50" y1="89.4" x2="50" y2="91.6" stroke="rgba(255,255,255,0.6)" strokeWidth="0.55" strokeLinecap="round"/>
        <line x1="49" y1="90.5" x2="51" y2="90.5" stroke="rgba(0,0,0,0.9)" strokeWidth="0.45" strokeLinecap="round"/>

        {/* Infield nebula glow */}
        <ellipse cx="50" cy="50" rx="38" ry="30" fill="url(#infieldGlow)"/>
        {/* Daisy Lane plaza warm amber center glow */}
        <rect x="37" y="43" width="26" height="16" rx="4" fill="url(#daisyGlow)" opacity="0.85"/>

        {/* Crowd heatmap — estimated density per stage based on lineup tiers.
            Gaussian-blurred circles shift amber→orange→red with crowd level. */}
        {showHeat && (() => {
          const nowMin = toNightMin(NOW.time);
          return (
            <g>
              <defs>
                <filter id="crowdBlur" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4.5"/>
                </filter>
              </defs>
              <g filter="url(#crowdBlur)">
                {stages.map(s => {
                  const d = _crowdDensity(s.id, nowMin);
                  if (d < 0.06) return null;
                  const r   = 5 + d * 11;
                  const col = d > 0.72 ? "#ef4444"
                            : d > 0.44 ? "#f97316"
                            : "#fbbf24";
                  return (
                    <circle key={s.id} cx={s.x} cy={s.y} r={r}
                      fill={col} opacity={0.28 + d * 0.38}/>
                  );
                })}
              </g>
            </g>
          );
        })()}

        {/* Pedestrian arteries — glowing white paths on night sky */}
        <path d="M50,16 Q50,50 50,84" stroke="rgba(255,255,255,0.06)" strokeWidth="3.4" fill="none" strokeLinecap="round"/>
        <path d="M50,16 Q50,50 50,84" stroke="rgba(255,255,255,0.18)" strokeWidth="0.55" fill="none" strokeLinecap="round" strokeDasharray="1.2 1.6"/>
        <path d="M16,50 Q50,52 84,50" stroke="rgba(255,255,255,0.05)" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
        <path d="M16,50 Q50,52 84,50" stroke="rgba(255,255,255,0.14)" strokeWidth="0.45" fill="none" strokeLinecap="round" strokeDasharray="1.2 1.6"/>
        <path d="M28,28 Q38,38 50,51" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" fill="none" strokeLinecap="round" strokeDasharray="0.8 1.2"/>
        <path d="M72,28 Q62,38 50,51" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" fill="none" strokeLinecap="round" strokeDasharray="0.8 1.2"/>

        {/* Daisy Lane central plaza — glowing ember on dark sky */}
        <rect x="37" y="43" width="26" height="16" fill="rgba(232,93,46,0.10)" stroke="rgba(232,93,46,0.55)" strokeWidth="0.35" rx="2.5"/>
        <circle cx="50" cy="51" r="3.5" fill="none" stroke="rgba(232,93,46,0.4)" strokeWidth="0.35"/>
        <circle cx="50" cy="51" r="1.4" fill="rgba(240,160,60,1)">
          <animate attributeName="r" values="1.0;1.6;1.0" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.9;1;0.9" dur="3s" repeatCount="indefinite"/>
        </circle>

        {/* Entrance gates — bright green on dark, easy to spot */}
        {[
          { id: "S",  x: 76, y: 16 },
          { id: "CD", x:  8, y: 50 },
          { id: "P",  x: 18, y: 84 },
        ].map(g => (
          <g key={g.id}>
            <circle cx={g.x} cy={g.y} r="2.8" fill="rgba(34,197,94,0.22)"/>
            <circle cx={g.x} cy={g.y} r="1.5" fill="#22c55e" stroke="rgba(255,255,255,0.95)" strokeWidth="0.35"/>
            <circle cx={g.x} cy={g.y} r="0.5" fill="#fff"/>
          </g>
        ))}

        {/* Amenity markers — coloured dots tuned for paper bg. Render before
            stages so stage markers always sit on top. Hidden when the user
            is in meet mode so the route line stays the focal point. */}
        {!meetMode && (typeof AMENITIES !== "undefined" ? AMENITIES : []).map(a => {
          const cfg = ({
            water:  { color: "#38bdf8", letter: ""  },
            food:   { color: "#fb923c", letter: ""  },
            med:    { color: "#ef4444", letter: "+" },
            toilet: { color: "#64748b", letter: ""  },
            art:    { color: "#f59a36", letter: ""  },
            info:   { color: "#16a34a", letter: "i" },
            charge: { color: "#facc15", letter: "⚡" },
            locker: { color: "#a78bfa", letter: "L" },
          })[a.type] || { color: "#000", letter: "" };
          return (
            <g key={a.id}>
              <circle cx={a.x} cy={a.y} r="1.4" fill={cfg.color} opacity="0.92" stroke="#fff" strokeWidth="0.22"/>
              {cfg.letter && (
                <text x={a.x} y={a.y + 0.65} textAnchor="middle" fontSize="1.8"
                  fill="#fff" fontFamily="Geist Mono, monospace" fontWeight="900">
                  {cfg.letter}
                </text>
              )}
            </g>
          );
        })}

        {/* Route line to selected stage or meet point */}
        {(sel || meetTarget) && (() => {
          const target = meetTarget || sel;
          const c = meetTarget ? "#e85d2e" : "#e85d2e";
          return (
            <g>
              <path d={`M ${avatar.x},${avatar.y} L ${target.x},${target.y}`}
                stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.18"/>
              <path d={`M ${avatar.x},${avatar.y} L ${target.x},${target.y}`}
                stroke={c} strokeWidth="0.85" fill="none" strokeLinecap="round" strokeDasharray="2.2 1.6"/>
            </g>
          );
        })()}

        {/* Stage markers */}
        {stages.map(s => {
          const on = s.id === selected;
          const r = 2.8 + (s.size - 1) * 1.1;
          const savedHere = savedByStage[s.id];
          return (
            <g key={s.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onPickStage(s.id); }}>
              {on && (
                <circle cx={s.x} cy={s.y} r={r + 1} fill="none" stroke={s.color} strokeWidth="0.5" opacity="0.9">
                  <animate attributeName="r" values={`${r};${r+6};${r}`} dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={s.x} cy={s.y} r={r + 2.4} fill={s.color} opacity={on ? 0.32 : 0.14} filter="url(#stageglow)"/>
              <StageIcon id={s.id} cx={s.x} cy={s.y} r={r} on={on} color={s.color}/>
              {/* Gold ★ pin if the user has an upcoming saved set on this stage */}
              {savedHere && (
                <g transform={`translate(${s.x + r * 0.85}, ${s.y - r * 0.85})`}>
                  <circle r="1.9" fill="rgba(13,8,4,0.85)" stroke="#fbbf24" strokeWidth="0.25"/>
                  <text y="0.85" textAnchor="middle" fontSize="2.4" fontWeight="900" fill="#fbbf24"
                    fontFamily="Geist Mono, monospace">★</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Friends */}
        {friends.map(f => {
          const focused = meetGroup.includes(f.id);
          return (
            <g key={f.id}>
              <circle cx={f.x} cy={f.y} r="2.5" fill={f.color} opacity="0.22">
                <animate attributeName="r" values="2;3.5;2" dur="2.8s" repeatCount="indefinite"/>
              </circle>
              <circle cx={f.x} cy={f.y} r={focused ? 1.8 : 1.5} fill={f.avatarTone} stroke="rgba(255,255,255,0.9)" strokeWidth="0.5"/>
            </g>
          );
        })}

        {/* Meet pin */}
        {meetMode && meetTarget && (
          <g>
            <circle cx={meetTarget.x} cy={meetTarget.y} r="3" fill="none" stroke="#e85d2e" strokeWidth="0.6" opacity="0.8">
              <animate attributeName="r" values="1.5;5.5;1.5" dur="1.4s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.9;0;0.9" dur="1.4s" repeatCount="indefinite"/>
            </circle>
            <circle cx={meetTarget.x} cy={meetTarget.y} r="1.6" fill="#e85d2e" stroke="#fff" strokeWidth="0.5"/>
          </g>
        )}

        {/* Avatar — you */}
        <g>
          <path d={`M${avatar.x},${avatar.y}
                    L${avatar.x + Math.cos(heading - 0.38) * 6.5},${avatar.y + Math.sin(heading - 0.38) * 6.5}
                    L${avatar.x + Math.cos(heading + 0.38) * 6.5},${avatar.y + Math.sin(heading + 0.38) * 6.5} Z`}
            fill="#f59a36" opacity="0.3"/>
          <circle cx={avatar.x} cy={avatar.y} r="3.2" fill="#f59a36" opacity="0.22">
            <animate attributeName="r" values="2.5;4.5;2.5" dur="2.2s" repeatCount="indefinite"/>
          </circle>
          <circle cx={avatar.x} cy={avatar.y} r="1.8" fill="#f59a36" stroke="rgba(255,255,255,0.95)" strokeWidth="0.6"/>
          <circle cx={avatar.x} cy={avatar.y} r="0.7" fill="#fff"/>
        </g>
      </svg>

      {/* HTML label overlay — sized to match the SVG's xMidYMid-meet square so
          left/top % values align exactly with the dots inside the SVG. */}
      <div style={{
        position: "absolute", top: "50%", left: 0, width: "100%",
        aspectRatio: "1 / 1", transform: "translateY(-50%)",
        pointerEvents: "none",
      }}>
        <div style={{
          position: "absolute", left: "50%", top: "43%",
          transform: "translate(-50%, -130%)",
          fontFamily: "Geist Mono, monospace", fontSize: 7, letterSpacing: 2.2, fontWeight: 700,
          color: "rgba(232,93,46,0.85)",
        }}>DAISY LANE</div>

        {/* Entrance gate labels */}
        {[
          { label: "GATE S",   x: 76, y: 10 },
          { label: "GATE C/D", x:  9, y: 44 },
          { label: "GATE P",   x: 18, y: 91 },
        ].map((g, i) => (
          <div key={i} style={{
            position: "absolute", left: `${g.x}%`, top: `${g.y}%`,
            transform: `translate(-50%, -50%)${counterRot}`,
            fontFamily: "Geist Mono, monospace", fontSize: 5.6, letterSpacing: 1.4, fontWeight: 700,
            color: "rgba(80,230,160,0.92)",
            textShadow: "0 0 8px rgba(80,230,160,0.5)",
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{g.label}</div>
        ))}

        {/* Named landmarks + walkways from the official EDC map.
            Hidden by default; toggle "LABELS" in the search header to show. */}
        {showLabels && [
          // Walkways
          { label: "KINETIC TRAIL",   x: 41, y: 28, rot: -55, color: "rgba(251,191,36,0.85)",  size: 6.8, ls: 1.6 },
          { label: "MEMORY LANE",     x: 33, y: 55, rot: -90, color: "rgba(247,237,224,0.7)",  size: 6.8, ls: 1.6 },
          { label: "POWER PATH",      x: 67, y: 38, rot: -90, color: "rgba(167,139,250,0.85)", size: 6.8, ls: 1.6 },
          { label: "RAINBOW ROAD",    x: 65, y: 64, rot: -90, color: "rgba(244,114,182,0.85)", size: 6.8, ls: 1.6 },
          { label: "ELECTRIC AVENUE", x: 50, y: 62, rot: 0,   color: "rgba(252,211,77,0.95)",  size: 6.8, ls: 2.0 },
          { label: "BASS LANE",       x: 56, y: 71, rot: -90, color: "rgba(96,165,250,0.85)",  size: 6.5, ls: 1.6 },
          { label: "NOMADS ALLEY",    x: 22, y: 70, rot: -22, color: "rgba(247,237,224,0.7)",  size: 6.5, ls: 1.5 },
          // Sub-areas / districts
          { label: "DAISY FIELDS",    x: 40, y: 24, rot: 0,   color: "rgba(252,211,77,0.85)",  size: 5.8, ls: 1.4 },
          { label: "NOMADS LAND",     x: 38, y: 70, rot: 0,   color: "rgba(252,211,77,0.95)",  size: 6.5, ls: 1.6 },
          // Inside-plaza landmarks
          { label: "RAINBOW BAZAAR",  x: 50, y: 47, rot: 0,   color: "rgba(255,255,255,0.92)", size: 5.8, ls: 1.4 },
          { label: "DOWNTOWN EDC",    x: 50, y: 55, rot: 0,   color: "rgba(251,191,36,0.95)",  size: 6.5, ls: 1.6 },
          // Standalone landmarks
          { label: "FLOWER TUNNEL",   x: 45, y: 33, rot: 0,   color: "rgba(244,114,182,0.9)",  size: 6.2, ls: 1.5 },
          { label: "PIXEL FOREST",    x: 78, y: 60, rot: 0,   color: "rgba(244,114,182,0.85)", size: 6.2, ls: 1.5 },
          { label: "NOMADS PORTAL",   x: 38, y: 76, rot: 0,   color: "rgba(244,114,182,0.85)", size: 5.6, ls: 1.4 },
        ].map((lm, i) => (
          <div key={i} style={{
            position: "absolute", left: `${lm.x}%`, top: `${lm.y}%`,
            transform: `translate(-50%, -50%) rotate(${lm.rot}deg)`,
            fontFamily: "Geist Mono, monospace",
            fontSize: lm.size, letterSpacing: lm.ls, fontWeight: 700,
            color: lm.color,
            textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{lm.label}</div>
        ))}

        {stages.map(s => {
          const on = s.id === selected;
          // Edge-aware anchor: edge stages prefer vertical anchors (N/S) so
          // their labels don't collide with the central Rainbow Road / plaza
          // landmarks. Pure top/bottom edges fall back to inward push.
          const anchor = (() => {
            const edgeX = s.x < 22 || s.x > 78;
            if (edgeX) {
              // Mid-height edge (cosmic / neon): push UP, away from the busy
              // y≈50 corridor and the central Daisy Lane plaza.
              if (s.y >= 40 && s.y <= 60) return "N";
              if (s.y > 60) return "S";
              return "N";
            }
            if (s.y < 22) return "S";   // far north → label south of dot
            if (s.y > 78) return "N";   // far south → label north of dot
            return anchorFor(s);
          })();
          const pos = { left: `${s.x}%`, top: `${s.y}%` };
          const off = 18;
          const tx = {
            N: { transform: `translate(-50%, calc(-100% - ${off}px))${counterRot}` },
            S: { transform: `translate(-50%, ${off}px)${counterRot}` },
            E: { transform: `translate(${off}px, -50%)${counterRot}` },
            W: { transform: `translate(calc(-100% - ${off}px), -50%)${counterRot}` },
          }[anchor];
          return (
            <div key={s.id} onClick={(e) => { e.stopPropagation(); onPickStage(s.id); }}
              style={{
                position: "absolute", ...pos, ...tx,
                pointerEvents: "auto", cursor: "pointer",
                background: on ? s.color : "rgba(6,4,18,0.82)",
                color: on ? "#fff" : "rgba(255,255,255,0.88)",
                border: `1px solid ${on ? s.color : "rgba(255,255,255,0.18)"}`,
                padding: on ? "4px 10px" : "3px 9px",
                borderRadius: 999,
                fontFamily: "Geist Mono, monospace",
                fontSize: on ? 9.5 : 8.5,
                letterSpacing: 1.2, fontWeight: 700,
                whiteSpace: "nowrap",
                boxShadow: on
                  ? `0 4px 18px ${s.color}66, 0 0 8px ${s.color}33`
                  : "0 1px 0 rgba(0,0,0,0.4), 0 2px 12px rgba(0,0,0,0.5)",
                transition: "all 0.15s",
              }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: 6,
                background: on ? "#fff" : s.color, marginRight: 6,
                verticalAlign: "1px",
              }}/>
              {s.name.toUpperCase()}
            </div>
          );
        })}

        {friends.map(f => meetGroup.includes(f.id) && (
          <div key={f.id} style={{
            position: "absolute", left: `${f.x}%`, top: `${f.y}%`,
            transform: `translate(-50%, 14px)${counterRot}`,
            background: f.color, color: "#fff",
            padding: "2px 7px", borderRadius: 999,
            fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 1.2, fontWeight: 700,
            boxShadow: `0 3px 10px ${f.color}66`, pointerEvents: "none",
          }}>
            {f.name.toUpperCase()}
          </div>
        ))}

        {crewFriends.map(f => (
          <div key={`crew-${f.id}`} style={{
            position: "absolute", left: `${f.x}%`, top: `${f.y}%`,
            transform: `translate(-50%, -28px)${counterRot}`,
            display: "flex", alignItems: "center", gap: 4,
            background: f.color, color: "#fff",
            padding: "2px 7px 2px 5px", borderRadius: 999,
            fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 1.2, fontWeight: 700,
            boxShadow: `0 3px 14px ${f.color}88`, pointerEvents: "none",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: "rgba(255,255,255,0.9)", animation: "pulse 1.6s infinite" }}/>
            {f.name.toUpperCase()}
          </div>
        ))}

        <div style={{
          position: "absolute", left: `${avatar.x}%`, top: `${avatar.y}%`,
          transform: `translate(-50%, -22px)${counterRot}`,
          background: "rgba(245,154,54,0.95)", color: "#fff",
          padding: "2px 8px", borderRadius: 999,
          fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700,
          pointerEvents: "none", boxShadow: "0 3px 10px rgba(245,154,54,0.45)",
        }}>YOU</div>
      </div>
    </div>

      {/* Compass rose — fixed-position badge in the upper-right of the map.
          The needle inside rotates so the red tip always points to true north
          regardless of which way the user is facing. Tells you at a glance
          "which direction am I oriented?" without obscuring the map. */}
      {compass && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 44, height: 44, borderRadius: 44,
          background: "rgba(247,237,224,0.92)",
          border: "1px solid var(--line-2)",
          boxShadow: "0 3px 10px rgba(26,18,13,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 5, pointerEvents: "none",
        }}>
          <div style={{
            width: 32, height: 32, position: "relative",
            transform: `rotate(${mapRotate}deg)`,
            transition: "transform 0.18s linear",
          }}>
            <div style={{
              position: "absolute", top: 0, left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "Geist Mono, monospace", fontSize: 8, fontWeight: 800,
              color: "#c14a4a", letterSpacing: 0.5,
            }}>N</div>
            <svg width="32" height="32" viewBox="-16 -16 32 32" style={{ position: "absolute", inset: 0 }}>
              <path d="M0,-9 L2.5,2 L0,0 L-2.5,2 Z" fill="#c14a4a"/>
              <path d="M0,9 L2.5,-2 L0,0 L-2.5,-2 Z" fill="rgba(26,18,13,0.45)"/>
              <circle cx="0" cy="0" r="1.2" fill="var(--ink)"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- RIDESHARE SHEET ----
// Drivers can't enter the speedway grounds; the official pickup is the
// south parking rideshare lot (~36.255, -115.012). We open the universal
// Uber/Lyft web links — these auto-bridge to the native app if installed,
// else fall through to the in-browser request flow.
function RideshareSheet({ onClose }) {
  // Festival's published rideshare pickup zone (FESTIVAL_CONFIG.rideshareGps).
  // Pre-set as the pickup pin in both Uber and Lyft universal links so the
  // driver knows exactly where you are.
  const { lat, lng, label, note } = FESTIVAL_CONFIG.rideshareGps;
  const open = (url) => { window.open(url, "_blank", "noopener"); onClose(); };
  const nickname = encodeURIComponent(`${FESTIVAL_CONFIG.brand} Rideshare Pickup`);
  const uberUrl = `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${lat}&pickup[longitude]=${lng}&pickup[nickname]=${nickname}`;
  const lyftUrl = `https://lyft.com/ride?id=lyft&partner=&pickup[latitude]=${lat}&pickup[longitude]=${lng}`;

  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 12,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end",
      animation: "fadeIn .2s",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        width: "100%", padding: "14px 20px 24px",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--line-2)" }}/>
        </div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", marginBottom: 4 }}>
          RIDESHARE · {label.toUpperCase()}
        </div>
        <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 10 }}>
          Get a ride from {FESTIVAL_CONFIG.locationShort}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
          {note} Pin pre-set so your driver finds you.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={() => open(uberUrl)} style={{
            background: "#000", color: "#fff", border: "none",
            borderRadius: 12, padding: "14px 16px",
            fontFamily: "Geist Mono, monospace", fontSize: 12, letterSpacing: 1.4, fontWeight: 700,
            cursor: "pointer",
          }}>OPEN UBER</button>
          <button onClick={() => open(lyftUrl)} style={{
            background: "#FF00BF", color: "#fff", border: "none",
            borderRadius: 12, padding: "14px 16px",
            fontFamily: "Geist Mono, monospace", fontSize: 12, letterSpacing: 1.4, fontWeight: 700,
            cursor: "pointer",
          }}>OPEN LYFT</button>
          <button onClick={onClose} style={{
            background: "transparent", color: "var(--muted)",
            border: "1px solid var(--line-2)",
            borderRadius: 12, padding: "12px 16px",
            fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.2, fontWeight: 600,
            cursor: "pointer",
          }}>CANCEL</button>
        </div>

        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          Universal links — opens app if installed, web otherwise.
        </div>
      </div>
    </div>
  );
}

// ---- GROUND-LEVEL PEEK (picture-in-picture window showing stage from avatar POV) ----
function GroundPeek({ stage, onClose }) {
  return (
    <div style={{
      position: "absolute", top: 12, right: 12,
      width: 160, height: 120,
      borderRadius: 12, overflow: "hidden",
      background: "#0a0414",
      border: "1px solid rgba(247,237,224,0.2)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      zIndex: 4,
    }}>
      <svg viewBox="0 0 200 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`peekSky-${stage.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0a3d"/>
            <stop offset="60%" stopColor="#3d1a5a"/>
            <stop offset="100%" stopColor="#e85d2e"/>
          </linearGradient>
          <linearGradient id={`peekGnd-${stage.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a1530"/>
            <stop offset="100%" stopColor="#0a0414"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="200" height="60" fill={`url(#peekSky-${stage.id})`}/>
        <rect x="0" y="60" width="200" height="80" fill={`url(#peekGnd-${stage.id})`}/>
        {/* stage silhouette */}
        <rect x="60" y="30" width="80" height="40" fill="#0a0414" stroke={stage.color} strokeWidth="1.5"/>
        <rect x="72" y="38" width="56" height="22" fill={stage.color} opacity="0.9"/>
        <rect x="56" y="24" width="88" height="4" fill="#0a0414" stroke={stage.color} strokeWidth="0.8"/>
        {[-2,-1,0,1,2].map(i => (
          <g key={i}>
            <circle cx={100 + i*16} cy={26} r="1.3" fill={stage.color}/>
            <line x1={100+i*16} y1={26} x2={100+i*16+i*6} y2={10} stroke={stage.color} strokeWidth="1" opacity="0.4" strokeLinecap="round"/>
          </g>
        ))}
        {/* crowd */}
        <path d="M20,80 Q100,65 180,80 L180,95 L20,95 Z" fill="#000" opacity="0.8"/>
        {/* label */}
        <rect x="65" y="108" width="70" height="14" rx="7" fill="rgba(10,4,20,0.9)" stroke={stage.color} strokeWidth="0.8"/>
        <text x="100" y="117" textAnchor="middle" fill={stage.color} fontFamily="Geist Mono, monospace" fontSize="7" fontWeight="700" letterSpacing="1">{stage.name.toUpperCase()}</text>
      </svg>
      <button onClick={onClose} style={{
        position: "absolute", top: 4, right: 4,
        width: 20, height: 20, borderRadius: 20,
        background: "rgba(10,4,20,0.85)", border: "1px solid rgba(247,237,224,0.3)",
        color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, padding: 0,
      }}>×</button>
      <div style={{
        position: "absolute", bottom: 4, left: 4,
        fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.2,
        color: "rgba(247,237,224,0.7)", background: "rgba(10,4,20,0.6)",
        padding: "2px 5px", borderRadius: 4,
      }}>GROUND VIEW</div>
    </div>
  );
}

// ---- BOTTOM SHEET ----
function BottomSheet({ stage, nowAtStage, dist, walk, peek, setPeek, meetMode, meetTarget, friends, meetGroup = [], avatar, onClose, onCancelMeet, onOpenArtist, state, setState }) {
  if (meetMode && meetTarget) {
    const groupFriends = meetGroup.map(id => friends.find(fr => fr.id === id)).filter(Boolean);
    const youDist = Math.sqrt((meetTarget.x-avatar.x)**2 + (meetTarget.y-avatar.y)**2);
    const youMins = distToMins(youDist);
    const fEtas = groupFriends.map(f => ({ f, mins: distToMins(Math.sqrt((meetTarget.x-f.x)**2 + (meetTarget.y-f.y)**2)) }));
    const eta = Math.max(youMins, ...fEtas.map(e => e.mins), 0);
    const title = groupFriends.length === 0 ? "Pinned spot"
      : groupFriends.length === 1 ? `You + ${groupFriends[0].name}`
      : `Group · ${groupFriends.length + 1} people`;
    const routingLabel = groupFriends.length > 1 ? "ALL ROUTING LIVE" : groupFriends.length === 1 ? "BOTH ROUTING LIVE" : "ROUTING LIVE";
    return (
      <div style={{ background: "var(--paper)", color: "var(--ink)", padding: "14px 16px 12px", borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: "0 -10px 30px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 38, background: "var(--ember)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2 C8 2 5 5 5 9 c0 5 7 13 7 13 s7-8 7-13 c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--ember)", fontWeight: 700 }}>MEETING</div>
            <div className="serif" style={{ fontSize: 20, lineHeight: 1.05 }}>{title}</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>ETA ~{eta} MIN · {routingLabel}</div>
          </div>
          <button onClick={onCancelMeet} style={{ background: "transparent", border: "1px solid var(--line-2)", color: "var(--muted)", borderRadius: 999, padding: "7px 10px", cursor: "pointer", fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 600 }}>END</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <div style={{ flex: "1 0 calc(50% - 4px)", background: "var(--paper-2)", borderRadius: 10, padding: "7px 10px" }}>
            <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: "var(--muted)" }}>YOUR ETA</div>
            <div className="serif" style={{ fontSize: 18, marginTop: 2 }}>{youMins} <span style={{ fontSize: 11 }}>min</span></div>
          </div>
          {fEtas.map(({ f, mins }) => (
            <div key={f.id} style={{ flex: "1 0 calc(50% - 4px)", background: "var(--paper-2)", borderRadius: 10, padding: "7px 10px" }}>
              <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: f.color }}>{f.name.toUpperCase()} ETA</div>
              <div className="serif" style={{ fontSize: 18, marginTop: 2 }}>{mins} <span style={{ fontSize: 11 }}>min</span></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!stage) return null;
  return <StageLineupSheet stage={stage} walk={walk} dist={dist} peek={peek} setPeek={setPeek} onClose={onClose} onOpenArtist={onOpenArtist} nowAtStage={nowAtStage} state={state} setState={setState}/>;
}

function StageLineupSheet({ stage, walk, dist, peek, setPeek, onClose, onOpenArtist, nowAtStage, state, setState }) {
  const [day, setDay] = React.useState(NOW.day);
  const [expanded, setExpanded] = React.useState(false);
  const toSlot = t => { const h = parseInt(t.split(":")[0]); return h < 8 ? h + 24 : h; };
  const sets = ARTISTS
    .filter(a => a.stage === stage.id && a.day === day)
    .sort((a, b) => toSlot(a.start) - toSlot(b.start));
  const totalAcrossDays = ARTISTS.filter(a => a.stage === stage.id).length;

  return (
    <div style={{
      background: "var(--paper)", color: "var(--ink)",
      padding: "12px 14px 10px",
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
      boxShadow: "0 -10px 30px rgba(0,0,0,0.4)",
      maxHeight: expanded ? "72vh" : "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Drag handle */}
      <div onClick={() => setExpanded(e => !e)} style={{ display: "flex", justifyContent: "center", cursor: "pointer", padding: "2px 0 6px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--line-2)" }}/>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: stage.color,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>{stage.short}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>{stage.name}</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
            {walk.lo === walk.hi ? `${walk.lo}` : `${walk.lo}–${walk.hi}`} MIN WALK{walk.peak ? " · PEAK" : ""} · ~{Math.round(dist*22)}M · {totalAcrossDays} SETS OVER 3 NIGHTS
            {walk.plan && <span style={{ color: "var(--ember)", fontWeight: 700 }}> · PLAN 20+</span>}
          </div>
        </div>
        <button onClick={() => setPeek(p => !p)} style={{
          background: peek ? stage.color : "rgba(0,0,0,0.05)",
          color: peek ? "#fff" : "var(--ink)",
          border: "none", borderRadius: 999, padding: "7px 10px", cursor: "pointer",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
        }}>{peek ? "◉ PEEK" : "PEEK"}</button>
        <button onClick={onClose} style={{
          background: "transparent", border: "1px solid var(--line-2)", color: "var(--muted)",
          borderRadius: 999, padding: "7px 10px", cursor: "pointer",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
        }}>×</button>
      </div>

      {/* Stage vibe — vet-flavor descriptor that summarises the room's
          identity ("Sunrise Cathedral", "Loudest Drops") plus when it peaks.
          Falls back gracefully if the stage data has no vibe field yet. */}
      {stage.vibe && (
        <div style={{
          marginBottom: 10, padding: "9px 11px", borderRadius: 12,
          background: "var(--paper-2)",
          borderLeft: `3px solid ${stage.color}`,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div className="mono" style={{
              fontSize: 9, letterSpacing: 1.4, fontWeight: 800,
              color: stage.color, textTransform: "uppercase",
            }}>{stage.vibe}</div>
            {stage.peak && (
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 600 }}>
                PEAKS {stage.peak}
              </div>
            )}
          </div>
          {stage.vibeNote && (
            <div style={{ fontSize: 12, lineHeight: 1.35, color: "var(--ink)", marginTop: 4 }}>
              {stage.vibeNote}
            </div>
          )}
        </div>
      )}

      {/* Day tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {DAYS.map(d => {
          const on = d.n === day;
          const count = ARTISTS.filter(a => a.stage === stage.id && a.day === d.n).length;
          return (
            <button key={d.n} onClick={() => { setDay(d.n); setExpanded(true); }} style={{
              flex: 1, padding: "7px 6px", borderRadius: 8,
              background: on ? stage.color : "var(--paper-2)",
              color: on ? "#fff" : "var(--ink)",
              border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: 1.4, opacity: on ? 0.85 : 0.55, fontWeight: 600 }}>{d.label}</span>
              <span className="serif" style={{ fontSize: 13, lineHeight: 1 }}>{count} <span style={{ fontSize: 9, opacity: 0.7 }}>sets</span></span>
            </button>
          );
        })}
      </div>

      {/* Now playing marker (only if today) */}
      {day === NOW.day && nowAtStage && (
        <div onClick={() => onOpenArtist(nowAtStage.id)} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", marginBottom: 8,
          background: stage.color, color: "#fff",
          borderRadius: 12, cursor: "pointer",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 7, background: "#fff",
            boxShadow: "0 0 0 4px rgba(255,255,255,0.3)",
            animation: "pulse 1.6s infinite", flexShrink: 0,
          }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.6, fontWeight: 700, opacity: 0.9 }}>ON STAGE NOW</div>
            <div className="serif" style={{ fontSize: 16, lineHeight: 1.05 }}>{nowAtStage.name}</div>
          </div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1, opacity: 0.9, whiteSpace: "nowrap" }}>
            {nowAtStage.start}–{nowAtStage.end}
          </div>
        </div>
      )}

      {/* Full day lineup */}
      <div style={{ overflowY: "auto", flex: 1, maxHeight: expanded ? "50vh" : 180, paddingBottom: 6 }}>
        {sets.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--muted)" }}>
              No sets scheduled — stage dark tonight
            </div>
          </div>
        )}
        {sets.map(s => {
          const live = s.id === NOW.currentArtistId && day === NOW.day;
          const isSaved = state?.saved?.includes(s.id);
          const toggleSaveSet = (e) => {
            e.stopPropagation();
            if (!state || !setState) return;
            const next = isSaved
              ? state.saved.filter(id => id !== s.id)
              : [...state.saved, s.id];
            setState({ ...state, saved: next });
          };
          return (
            <div key={s.id} onClick={() => onOpenArtist(s.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 4px",
              borderBottom: "1px solid var(--line)",
              cursor: "pointer",
              opacity: live ? 1 : 0.92,
            }}>
              <div style={{ width: 52, flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 11, letterSpacing: 0.3, fontWeight: 600, color: live ? stage.color : "var(--ink)" }}>{s.start}</div>
                <div className="mono" style={{ fontSize: 8.5, letterSpacing: 0.8, color: "var(--muted)" }}>{s.end}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="serif" style={{ fontSize: 17, lineHeight: 1.1, letterSpacing: -0.2 }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                  {s.genre.toUpperCase()}
                </div>
              </div>
              {live && (
                <span className="mono" style={{
                  fontSize: 8, letterSpacing: 1.3, fontWeight: 700,
                  color: "#fff", background: stage.color,
                  padding: "2px 6px", borderRadius: 4,
                }}>LIVE</span>
              )}
              <button onClick={toggleSaveSet} style={{
                background: isSaved ? "var(--ember)" : "transparent",
                border: `1px solid ${isSaved ? "var(--ember)" : "var(--line-2)"}`,
                color: isSaved ? "#fff" : "var(--muted)",
                borderRadius: 999, width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, fontSize: 13,
                transition: "all .15s",
              }}>{isSaved ? "✓" : "+"}</button>
            </div>
          );
        })}
      </div>

      {!expanded && sets.length > 3 && (
        <button onClick={() => setExpanded(true)} style={{
          marginTop: 4, padding: "8px",
          background: "transparent", border: "none",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.3, color: "var(--muted)",
          cursor: "pointer", fontWeight: 600,
        }}>SEE ALL {sets.length} SETS ↓</button>
      )}
    </div>
  );
}

// ── MESSAGE DRAWER ── per-friend chat with offline queue + canned replies
function MessageDrawer({ friend, avatarStage, onClose, onSwitchToMeet }) {
  const [thread, setThread] = React.useState(() => loadThread(friend.id));
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const scrollerRef = React.useRef(null);
  const replyTimer = React.useRef(null);

  React.useEffect(() => {
    markRead(friend.id);
    return () => { if (replyTimer.current) clearTimeout(replyTimer.current); };
  }, [friend.id]);

  React.useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [thread, typing]);

  const friendStage = STAGES.find(s => s.id === (friendStatus(friend.id)?.stage));
  const status = friendStatus(friend.id);
  const statusAge = status ? Math.round((Date.now() - status.ts) / 60000) : null;

  const send = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const stamped = trimmed +
      (avatarStage && /(my (loc|spot)|where|here)/i.test(trimmed) && !/[a-z]field|stage/i.test(trimmed)
        ? ` (${STAGES.find(s => s.id === avatarStage)?.short || ""})` : "");
    const newThread = [...thread, { from: "me", text: stamped, ts: Date.now(), status: navigator.onLine ? "sent" : "queued" }];
    setThread(newThread);
    saveThread(friend.id, newThread);
    setDraft("");
    // Fake reply (stand-in for real backend)
    const [reply, delay] = _fakeReply(stamped);
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      setTyping(false);
      const next = [...newThread, { from: "them", text: reply, ts: Date.now() }];
      setThread(next);
      saveThread(friend.id, next);
    }, delay);
  };

  const sendNativeSMS = async () => {
    const text = `(via Plursky) at ${avatarStage ? STAGES.find(s => s.id === avatarStage)?.name : "EDC"} — meet up?`;
    if (navigator.share) {
      try { await navigator.share({ text, title: `to ${friend.name}` }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: "fadeIn .2s" }}/>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        height: "82%", display: "flex", flexDirection: "column",
        boxShadow: "0 -14px 36px rgba(0,0,0,0.45)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 11,
          padding: "14px 16px 12px", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 42, background: friend.avatarTone,
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Instrument Serif, serif", fontSize: 20, position: "relative", flexShrink: 0,
          }}>
            {friend.name[0]}
            {!navigator.onLine ? null : (
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)", border: "2px solid var(--paper)",
              }}/>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>{friend.name}</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3, textTransform: "uppercase" }}>
              {friendStage
                ? `${friendStage.name} · ${statusAge}m AGO`
                : "STATUS UNKNOWN"}
            </div>
          </div>
          <button onClick={onSwitchToMeet} title="Meet here" style={{
            background: "transparent", border: "1px solid var(--line-2)", color: "var(--ink)",
            borderRadius: 999, padding: "7px 10px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
          }}>📍 MEET</button>
          <button onClick={sendNativeSMS} title="Open in Messages" style={{
            background: "transparent", border: "1px solid var(--line-2)", color: "var(--ink)",
            borderRadius: 999, padding: "7px 10px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
          }}>SMS</button>
          <button onClick={onClose} aria-label="Close" style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--muted)", padding: 4, fontSize: 22, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Offline banner */}
        {!navigator.onLine && (
          <div style={{
            padding: "5px 16px", background: "rgba(232,93,46,0.08)",
            borderBottom: "1px solid rgba(232,93,46,0.18)",
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--ember)", fontWeight: 700 }}>
              ⚠ OFFLINE · MESSAGES QUEUE & SEND WHEN YOU'RE BACK ONLINE
            </span>
          </div>
        )}

        {/* Thread */}
        <div ref={scrollerRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          {thread.length === 0 && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <div className="serif" style={{ fontSize: 18, color: "var(--muted)", fontStyle: "italic" }}>
                No messages yet
              </div>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: "var(--muted)", marginTop: 6 }}>
                TAP A QUICK REPLY ↓
              </div>
            </div>
          )}
          {thread.map((m, i) => {
            const mine = m.from === "me";
            const showTime = i === 0 || (m.ts - thread[i-1].ts) > 1000*60*5;
            return (
              <React.Fragment key={i}>
                {showTime && (
                  <div className="mono" style={{
                    textAlign: "center", fontSize: 8.5, letterSpacing: 1.3,
                    color: "var(--muted)", margin: "8px 0 6px", textTransform: "uppercase",
                  }}>{fmtTime(m.ts)}</div>
                )}
                <div style={{
                  display: "flex", justifyContent: mine ? "flex-end" : "flex-start",
                  marginBottom: 4,
                }}>
                  <div style={{
                    maxWidth: "76%",
                    padding: "8px 12px", borderRadius: 18,
                    background: mine ? "var(--ember)" : "var(--paper-2)",
                    color: mine ? "#fff" : "var(--ink)",
                    fontSize: 14, lineHeight: 1.35,
                    borderBottomRightRadius: mine ? 6 : 18,
                    borderBottomLeftRadius: mine ? 18 : 6,
                  }}>
                    {m.text}
                  </div>
                </div>
                {mine && m.status === "queued" && i === thread.length - 1 && (
                  <div className="mono" style={{ textAlign: "right", fontSize: 8, letterSpacing: 1.2, color: "var(--ember)", marginRight: 4, marginBottom: 4 }}>
                    QUEUED
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {typing && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4 }}>
              <div style={{
                padding: "10px 14px", borderRadius: 18,
                background: "var(--paper-2)", display: "flex", gap: 4,
                borderBottomLeftRadius: 6,
              }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: 6, background: "var(--muted)",
                    animation: `tdot 1.2s ${i * 0.15}s infinite`,
                  }}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick replies */}
        <div className="no-scrollbar" style={{
          display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none",
          padding: "8px 14px 6px", borderTop: "1px solid var(--line)",
        }}>
          {QUICK_REPLIES.map(qr => (
            <button key={qr.tag} onClick={() => send(qr.text)} className="mono" style={{
              flexShrink: 0, padding: "6px 11px", borderRadius: 999,
              background: "var(--paper-2)", color: "var(--ink)",
              border: "1px solid var(--line-2)",
              fontSize: 9.5, letterSpacing: 1.1, fontWeight: 600,
              cursor: "pointer", textTransform: "uppercase",
            }}>{qr.tag}</button>
          ))}
        </div>

        {/* Compose */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px 14px",
        }}>
          <input
            type="text"
            placeholder="Message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(draft); }}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 999,
              background: "var(--paper-2)", border: "1px solid var(--line)",
              fontFamily: "Geist, sans-serif", fontSize: 14,
              color: "var(--ink)", outline: "none",
            }}
          />
          <button onClick={() => send(draft)} disabled={!draft.trim()} style={{
            width: 38, height: 38, borderRadius: 38,
            background: draft.trim() ? "var(--ember)" : "var(--line-2)",
            color: "#fff", border: "none",
            cursor: draft.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background .2s",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19 V5"/><path d="M5 12 L12 5 L19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MapScreen });
