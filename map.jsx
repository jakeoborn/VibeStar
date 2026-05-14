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

// Beside-style context-aware reply templates. Drafted from what we know
// (my stage, friend's stage, the next saved set, the live artist) so the
// chip row offers a relevant suggestion instead of a generic OMW. v1 is
// rule-based; a future iteration can call the Anthropic API to draft a
// real personalized message when online.
function buildSmartReplies({ myStage, friendStage, nextSavedSet }) {
  const out = [];
  if (myStage) {
    out.push({
      tag: `AT ${myStage.short}`,
      text: `📍 at ${myStage.name} now — come find me`,
      smart: true,
    });
  }
  if (friendStage) {
    out.push({
      tag: `OMW TO ${friendStage.short}`,
      text: `🚀 omw to ${friendStage.name}`,
      smart: true,
    });
  }
  if (nextSavedSet) {
    const a = nextSavedSet.artist;
    const stage = STAGES.find(s => s.id === a.stage);
    const stageName = stage ? stage.name : "the stage";
    if (nextSavedSet.isLive) {
      out.push({
        tag: `${a.name.toUpperCase().slice(0, 8)} LIVE`,
        text: `🎧 ${a.name} is LIVE at ${stageName} — get over here`,
        smart: true,
      });
    } else if (nextSavedSet.minsUntil > 0 && nextSavedSet.minsUntil <= 90) {
      out.push({
        tag: `${a.name.toUpperCase().slice(0, 8)} ${nextSavedSet.minsUntil}M`,
        text: `${a.name} in ${nextSavedSet.minsUntil}m at ${stageName} — meet there?`,
        smart: true,
      });
    }
  }
  return out;
}
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

// ─── Meetups (offline-first) ─────────────────────────────────
// Crew-agreed meeting points that work without a live connection. List
// is localStorage-backed and survives reloads. Each entry pins to a
// stage (or just to a time) so the crew can show up at the same place
// at the same moment without ever messaging at the venue. Sync to
// Supabase is a future follow-up — this layer is purely local for now.
const MEETUPS_KEY = "plursky_meetups_v1";

function readMeetups() {
  try { return JSON.parse(localStorage.getItem(MEETUPS_KEY) || "[]"); }
  catch { return []; }
}
function writeMeetups(arr) {
  try { localStorage.setItem(MEETUPS_KEY, JSON.stringify(arr)); } catch {}
}
function addMeetup({ name, stageId, atTs, notes }) {
  const list = readMeetups();
  list.push({
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name: (name || "").slice(0, 60),
    stageId: stageId || null,
    atTs: Number(atTs) || Date.now(),
    notes: (notes || "").slice(0, 200),
    createdAt: Date.now(),
  });
  // Keep sorted by atTs ascending
  list.sort((a, b) => a.atTs - b.atTs);
  writeMeetups(list);
  return list;
}
function removeMeetup(id) {
  const list = readMeetups().filter(m => m.id !== id);
  writeMeetups(list);
  return list;
}
// Surface only upcoming entries (not in the past). Anything older than
// 30 min is also stale-removed automatically — keeps the list tidy.
function upcomingMeetups() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const list = readMeetups().filter(m => m.atTs > cutoff);
  // Rewrite if we pruned anything stale
  if (list.length !== readMeetups().length) writeMeetups(list);
  return list;
}

// "Last seen" staleness for friend pins. Buckets that match festival reality:
// fresh = the data is trustworthy ("they ARE there"); stale = trust but verify;
// cold = treat as a hint, not a fact. Designed for 4AM-tired eyes.
function formatLastSeen(ts) {
  if (!ts) return { label: "", freshness: "cold", color: "rgba(255,255,255,0.45)" };
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1)  return { label: "NOW",            freshness: "fresh", color: "#2d7a55" };  // var(--success)
  if (mins < 5)  return { label: `${mins}m`,       freshness: "fresh", color: "#2d7a55" };
  if (mins < 15) return { label: `${mins}m`,       freshness: "stale", color: "#f59a36" };  // var(--flare)
  if (mins < 60) return { label: `${mins}m`,       freshness: "cold",  color: "rgba(255,255,255,0.55)" };
  const hrs = Math.floor(mins / 60);
  return     { label: `${hrs}h+`,                  freshness: "cold",  color: "rgba(255,255,255,0.45)" };
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
    // Check live CREW presence first — real lookup, no server needed
    if (typeof sbFindByPingCode === "function") {
      const live = sbFindByPingCode(c);
      if (live) {
        const st = STAGES.find(s => s.id === live.stageId);
        if (st) {
          onDropPin({ x: st.x, y: st.y, label: `${live.name} (${c})` });
          setFeedback({ kind: "ok", text: `Live pin dropped on ${live.name} at ${st.name}.` });
          setTimeout(onClose, 900);
          return;
        }
      }
    }
    // Fall back to demo address book
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
    setFeedback({ kind: "warn", text: `"${c}" isn't in CREW right now. Ask them to join CREW so their code goes live.` });
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

// ── Share Location sheet ─────────────────────────────────────
// Front door for broadcasting *anything* about your location to crew —
// replaces the old one-tap "Crew live" toggle with a Fi-style consent
// moment. Bundles: big start/stop pill, what's-shared checklist (GPS
// + stage), battery cost callout, and an AllTrails-style auto-expire
// picker so sharing dies on its own.

// Next sunrise epoch (UTC ms) computed from FESTIVAL_CONFIG.sunTimes.
// Falls back to festival end if we're past the last sunrise of the run.
function _nextSunriseEpochMs() {
  const now = Date.now();
  const dayKeys = Object.keys(FESTIVAL_CONFIG.dayDates || {}).sort();
  for (const k of dayKeys) {
    const d = FESTIVAL_CONFIG.dayDates[k];
    const rise = (FESTIVAL_CONFIG.sunTimes?.[k]?.rise) || "05:30";
    const [h, m] = rise.split(":").map(Number);
    const epoch = (d.midnightUtc || 0) + h * 3600000 + m * 60000;
    if (epoch > now + 60000) return epoch;       // at least a minute out
  }
  return FESTIVAL_CONFIG.endMs || (now + 4 * 3600000);
}

const _SHARE_EXPIRY_OPTIONS = [
  { key: "1h",       label: "1H",       compute: () => Date.now() + 60 * 60 * 1000 },
  { key: "4h",       label: "4H",       compute: () => Date.now() + 4 * 60 * 60 * 1000 },
  { key: "sunrise",  label: "SUNRISE",  compute: _nextSunriseEpochMs },
  { key: "festival", label: "FESTIVAL", compute: () => FESTIVAL_CONFIG.endMs || (Date.now() + 24 * 3600000) },
];

function _expiryKeyFromState(shareState) {
  if (!shareState?.expiresAt) return "4h";
  const remain = shareState.expiresAt - Date.now();
  if (remain < 90 * 60 * 1000) return "1h";
  if (remain < 5 * 60 * 60 * 1000) return "4h";
  if (shareState.expiresAt < (FESTIVAL_CONFIG.endMs || Infinity) - 60000) return "sunrise";
  return "festival";
}

// Inline "shareable link" row used inside the Share With Crew sheet. Builds
// the public viewer URL from the token, supports navigator.share when
// available, falls back to clipboard. Shows "COPIED" for 1.5s.
function ShareLinkRow({ token }) {
  const [copied, setCopied] = React.useState(false);
  const url = React.useMemo(() => {
    if (typeof window === "undefined") return `share.html?t=${token}`;
    const base = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "/")}`;
    return `${base}share.html?t=${token}`;
  }, [token]);
  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Find me at EDC", text: "Live location on Plursky", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch { /* user canceled or no clipboard */ }
  };
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10, background: "var(--paper-2)",
      marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>🔗</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500 }}>Shareable link</div>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 0.6, color: "var(--muted)",
          marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{url}</div>
      </div>
      <button onClick={onShare} style={{
        background: copied ? "var(--success)" : "var(--ink)",
        color: "var(--paper)", border: "none", borderRadius: 999,
        padding: "7px 12px", cursor: "pointer",
        fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
      }}>{copied ? "COPIED" : "COPY"}</button>
    </div>
  );
}

function ShareLocationSheet({
  onClose, shareState, crewCount, crewCode,
  gpsPos, gpsStatus, myStatusStage,
  onSave, onStop,
}) {
  const [includeGps,   setIncludeGps]   = React.useState(shareState?.includeGps   ?? true);
  const [includeStage, setIncludeStage] = React.useState(shareState?.includeStage ?? true);
  const [expiryKey,    setExpiryKey]    = React.useState(() => _expiryKeyFromState(shareState));

  const active = !!shareState?.active &&
                 (!shareState?.expiresAt || shareState.expiresAt > Date.now());
  const isDenied      = gpsStatus === "denied";
  const isUnavailable = gpsStatus === "unavailable";
  const canShareGps   = !isDenied && !isUnavailable;
  const stage         = myStatusStage ? STAGES.find(s => s.id === myStatusStage) : null;

  const handleStart = () => {
    if (!includeGps && !includeStage) return;
    const opt = _SHARE_EXPIRY_OPTIONS.find(o => o.key === expiryKey) || _SHARE_EXPIRY_OPTIONS[1];
    onSave({
      active: true,
      includeGps: includeGps && canShareGps,
      includeStage,
      expiresAt: opt.compute(),
    });
    onClose();
  };

  const handleStop = () => {
    onStop();
    onClose();
  };

  const _fmtRemaining = () => {
    if (!shareState?.expiresAt) return "";
    const mins = Math.max(0, Math.round((shareState.expiresAt - Date.now()) / 60000));
    if (mins < 60) return `${mins}m left`;
    return `${Math.round(mins / 60)}h left`;
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
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800 }}>SHARE WITH CREW</span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Crew context line */}
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
          marginBottom: 12,
        }}>
          {crewCode
            ? <>● {crewCount || 0} IN CREW · {crewCode}</>
            : <>NO CREW YET — JOIN ONE FIRST</>
          }
        </div>

        {/* Big status pill — visual anchor */}
        <div style={{
          background: active ? "var(--ember)" : "var(--paper-2)",
          color: active ? "#fff" : "var(--ink)",
          border: active ? "none" : "1px solid var(--line-2)",
          borderRadius: 14, padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 10,
          marginBottom: 14,
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: 12,
            background: active ? "rgba(255,255,255,0.92)" : "var(--line-2)",
            animation: active ? "pulse 1.6s infinite" : "none",
          }}/>
          <span className="serif" style={{ fontSize: 17, flex: 1 }}>
            {active ? "Sharing now" : "Not sharing"}
          </span>
          {active && (
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, opacity: 0.85 }}>
              {_fmtRemaining()}
            </span>
          )}
        </div>

        {/* What's shared */}
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700,
          marginBottom: 8,
        }}>WHAT'S SHARED</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            background: "var(--paper-2)",
            cursor: canShareGps ? "pointer" : "not-allowed",
            opacity: canShareGps ? 1 : 0.55,
          }}>
            <input type="checkbox"
              checked={includeGps && canShareGps}
              disabled={!canShareGps}
              onChange={(e) => setIncludeGps(e.target.checked)}
              style={{ accentColor: "var(--ember)", width: 16, height: 16 }}
            />
            <span style={{ fontSize: 18 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500 }}>My GPS location</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                {gpsStatus === "live" && gpsPos
                  ? `LIVE · ±${Math.round(gpsPos.accuracy || 0)}m`
                  : gpsStatus === "locating" ? "FINDING…"
                  : gpsStatus === "denied"   ? "DENIED IN BROWSER"
                  : gpsStatus === "unavailable" ? "UNSUPPORTED"
                  : "OFF"}
              </div>
            </div>
          </label>

          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            background: "var(--paper-2)", cursor: "pointer",
          }}>
            <input type="checkbox"
              checked={includeStage}
              onChange={(e) => setIncludeStage(e.target.checked)}
              style={{ accentColor: "var(--ember)", width: 16, height: 16 }}
            />
            <span style={{ fontSize: 18 }}>🎪</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500 }}>Current stage</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                {stage ? stage.name.toUpperCase() : "NOT SET — TAP “I'M AT” FIRST"}
              </div>
            </div>
          </label>
        </div>

        {/* GPS-denied inline banner */}
        {includeGps && isDenied && (
          <div style={{
            padding: "8px 11px", borderRadius: 999,
            background: "rgba(193,74,74,0.10)", border: "1px solid rgba(193,74,74,0.35)",
            marginBottom: 12,
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "#c14a4a", fontWeight: 700 }}>
              GPS DENIED · ENABLE LOCATION IN BROWSER
            </span>
          </div>
        )}

        {/* Auto-expire picker */}
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700,
          marginBottom: 8,
        }}>AUTO-EXPIRE AFTER</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {_SHARE_EXPIRY_OPTIONS.map(opt => {
            const on = expiryKey === opt.key;
            return (
              <button key={opt.key} onClick={() => setExpiryKey(opt.key)} style={{
                flex: 1, padding: "8px 4px", borderRadius: 999,
                background: on ? "var(--ink)" : "var(--paper-2)",
                color: on ? "var(--paper)" : "var(--ink)",
                border: on ? "none" : "1px solid var(--line-2)",
                fontFamily: "Geist Mono, monospace", fontSize: 9,
                letterSpacing: 1.1, fontWeight: 700, cursor: "pointer",
              }}>{opt.label}</button>
            );
          })}
        </div>

        {/* Shareable link — only meaningful while sharing AND we have a token.
            Copies a URL friends can open without installing Plursky. */}
        {active && shareState?.token && (
          <ShareLinkRow token={shareState.token} />
        )}

        {/* Battery callout */}
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 1.1, color: "var(--muted)",
          marginBottom: 14, textAlign: "center",
        }}>
          ⚡ USES ~1% MORE BATTERY PER HOUR
        </div>

        {/* Primary CTA */}
        {active ? (
          <button onClick={handleStop} style={{
            width: "100%", padding: "12px 16px", borderRadius: 999,
            background: "var(--paper-2)", color: "var(--ink)",
            border: "1px solid var(--line-2)", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10,
            letterSpacing: 1.3, fontWeight: 700,
          }}>STOP SHARING</button>
        ) : (
          <button onClick={handleStart}
            disabled={(!includeGps || !canShareGps) && !includeStage}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 999,
              background: ((!includeGps || !canShareGps) && !includeStage)
                ? "var(--paper-2)" : "var(--ember)",
              color: ((!includeGps || !canShareGps) && !includeStage)
                ? "var(--muted)" : "#fff",
              border: "none",
              cursor: ((!includeGps || !canShareGps) && !includeStage) ? "default" : "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 10,
              letterSpacing: 1.3, fontWeight: 700,
            }}>START SHARING</button>
        )}
      </div>
    </div>
  );
}

// ── Meetups sheet ──────────────────────────────────────────────
// List + create form for offline-first crew meetup primitives. Same
// backdrop + paper pattern as ShareLocationSheet/IAmAtSheet.
function MeetupsSheet({ onClose }) {
  const [list, setList] = React.useState(() => upcomingMeetups());
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [stageId, setStageId] = React.useState(STAGES[0]?.id || "");
  const [whenLocal, setWhenLocal] = React.useState(() => {
    // Default to 1 hour from now, formatted for <input type="datetime-local">
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [notes, setNotes] = React.useState("");

  const reset = () => {
    setCreating(false);
    setName("");
    setStageId(STAGES[0]?.id || "");
    setNotes("");
  };

  const handleSave = () => {
    const atTs = new Date(whenLocal).getTime();
    if (!atTs || Number.isNaN(atTs)) return;
    const finalName = name.trim() || (STAGES.find(s => s.id === stageId)?.name || "Meetup");
    const next = addMeetup({ name: finalName, stageId, atTs, notes: notes.trim() });
    setList(next.filter(m => m.atTs > Date.now() - 30 * 60 * 1000));
    reset();
  };
  const handleRemove = (id) => {
    const next = removeMeetup(id);
    setList(next.filter(m => m.atTs > Date.now() - 30 * 60 * 1000));
  };

  const fmtWhen = (ts) => {
    try {
      const d = new Date(ts);
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const mins = Math.round((ts - Date.now()) / 60000);
      const rel = mins < 60 ? `IN ${Math.max(1, mins)}M`
                : mins < 24 * 60 ? `IN ${Math.round(mins / 60)}H`
                : `${d.toLocaleDateString([], { weekday: "short" }).toUpperCase()}`;
      return { primary: time, rel: sameDay ? rel : `${rel} · ${d.toLocaleDateString([], { weekday: "short" })}` };
    } catch { return { primary: "—", rel: "" }; }
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
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800 }}>MEETUPS</span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700, marginBottom: 12 }}>
          AGREE ON A PLACE + TIME BEFORE SERVICE DIES
        </div>

        {/* List */}
        {list.length === 0 && !creating && (
          <div style={{
            padding: "20px 12px", borderRadius: 12,
            background: "var(--paper-2)", textAlign: "center", marginBottom: 12,
          }}>
            <div className="serif" style={{ fontSize: 17, marginBottom: 4 }}>No meetups yet</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)" }}>
              CREATE ONE BELOW
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {list.map(m => {
              const stage = m.stageId ? STAGES.find(s => s.id === m.stageId) : null;
              const tFmt = fmtWhen(m.atTs);
              return (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 12,
                  background: "var(--paper-2)",
                  borderLeft: stage ? `3px solid ${stage.color}` : "3px solid var(--line-2)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="serif" style={{ fontSize: 16, lineHeight: 1.2 }}>{m.name}</div>
                    <div className="mono" style={{
                      fontSize: 9, letterSpacing: 1.1, color: "var(--muted)",
                      marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap",
                    }}>
                      {stage && <span style={{ color: stage.color, fontWeight: 700 }}>{stage.name.toUpperCase()}</span>}
                      <span>{tFmt.primary}</span>
                      <span style={{ opacity: 0.6 }}>· {tFmt.rel}</span>
                    </div>
                  </div>
                  <button onClick={() => handleRemove(m.id)} aria-label="Remove" style={{
                    background: "transparent", border: "none", color: "var(--muted)",
                    fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4,
                  }}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Create form */}
        {!creating ? (
          <button onClick={() => setCreating(true)} style={{
            width: "100%", padding: "12px 16px", borderRadius: 999,
            background: "var(--ember)", color: "#fff", border: "none",
            cursor: "pointer", fontFamily: "Geist Mono, monospace",
            fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
          }}>+ NEW MEETUP</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Sunrise at Kinetic" maxLength={60}
              style={{
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--line-2)", background: "var(--paper)",
                fontFamily: "Geist", fontSize: 14, color: "var(--ink)",
              }}/>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {STAGES.map(s => {
                const on = stageId === s.id;
                return (
                  <button key={s.id} onClick={() => setStageId(s.id)} style={{
                    padding: "6px 4px", borderRadius: 8,
                    background: on ? s.color : "var(--paper-2)",
                    color: on ? "#fff" : "var(--ink)",
                    border: on ? "none" : "1px solid var(--line-2)",
                    fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 0.8,
                    fontWeight: on ? 700 : 500, cursor: "pointer",
                  }}>{s.short}</button>
                );
              })}
            </div>
            <input type="datetime-local"
              value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)}
              style={{
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--line-2)", background: "var(--paper)",
                fontFamily: "Geist", fontSize: 14, color: "var(--ink)",
              }}/>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)" maxLength={200} rows={2}
              style={{
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--line-2)", background: "var(--paper)",
                fontFamily: "Geist", fontSize: 13, color: "var(--ink)", resize: "none",
              }}/>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={reset} style={{
                flex: 1, padding: "10px 12px", borderRadius: 999,
                background: "var(--paper-2)", color: "var(--ink)",
                border: "1px solid var(--line-2)", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
              }}>CANCEL</button>
              <button onClick={handleSave} style={{
                flex: 1, padding: "10px 12px", borderRadius: 999,
                background: "var(--ember)", color: "#fff", border: "none", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
              }}>SAVE</button>
            </div>
          </div>
        )}
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
    const readLead = () => {
      try {
        const raw = parseInt(localStorage.getItem("plursky_reminder_lead_min") || "", 10);
        if ([5, 15, 30, 60].includes(raw)) return raw;
      } catch {}
      return 15;
    };
    const tick = () => {
      const now = Date.now();
      const leadMin = readLead();
      savedIds.forEach(id => {
        if (firedRef.current.has(id)) return;
        const a = ARTISTS.find(x => x.id === id);
        if (!a) return;
        const startMs = _setStartRealMs(a);
        if (!startMs) return;
        const minsUntil = (startMs - now) / 60000;
        // Fire once when 0..leadMin minutes out
        if (minsUntil > 0 && minsUntil <= leadMin) {
          firedRef.current.add(id);
          try {
            const stage = STAGES.find(s => s.id === a.stage);
            new Notification(`${a.name} in ${Math.round(minsUntil)} min`, {
              body: `${stage?.name || a.stage} · ${fmt12(a.start)}`,
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
  const isAlert = w.code >= 95 || w.windMph >= 25 || (w.code >= 61 && w.code <= 82);
  return (
    <div style={{
      width: "100%", display: "flex", alignItems: "center", gap: 8,
      padding: "5px 11px", marginTop: 6, borderRadius: 999,
      background: isAlert ? "rgba(232,93,46,0.10)" : "var(--paper-2)",
      border: `1px solid ${isAlert ? "rgba(232,93,46,0.45)" : "var(--line)"}`,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <span className="mono" style={{
        fontSize: 8.5, letterSpacing: 1.2, fontWeight: 700, flexShrink: 0,
        color: isAlert ? "var(--ember)" : "var(--muted)",
      }}>LVMS</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: "var(--ink)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{w.tempF}°F · {label}</span>
      <span className="mono" style={{
        fontSize: 9, letterSpacing: 0.8, fontWeight: 600, color: "var(--muted)", flexShrink: 0,
      }}>{w.windMph} MPH</span>
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
      width: "100%", display: "flex", alignItems: "center", gap: 8,
      padding: "5px 11px", marginTop: 6,
      background: "linear-gradient(90deg, #f59a36 0%, #e85d2e 60%, #a78bfa 100%)",
      color: "#fff", border: "none", borderRadius: 999,
      cursor: "pointer", textAlign: "left",
      boxShadow: "0 3px 10px rgba(245,154,54,0.30)",
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🌅</span>
      <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, fontWeight: 800, opacity: 0.92, flexShrink: 0 }}>SUNRISE</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{isUp ? "Sun's up — head to the lotus" : "Hold the line"}</span>
      <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1, fontWeight: 800, flexShrink: 0 }}>
        {isUp ? "NOW" : `${minsUntil}M`} · {walkLabel}M
      </span>
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

  // "LIVE — 38m" vs "IN 0h 24m" framing
  const headline = next.isLive
    ? `LIVE · ${next.minsLeft}M`
    : next.minsUntil < 60
        ? `IN ${next.minsUntil}M`
        : `IN ${Math.floor(next.minsUntil/60)}H ${next.minsUntil%60}M`;
  // Walk vs start-time tension flag
  const willBeLate = !next.isLive && walk.hi >= next.minsUntil && next.minsUntil > 0;

  return (
    <button onClick={() => onSelect(stage.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 9,
      padding: "6px 10px", marginTop: 6,
      background: next.isLive ? "var(--ember)" : "var(--ink)",
      color: next.isLive ? "#fff" : "var(--paper)",
      border: "none", borderRadius: 12,
      cursor: "pointer", textAlign: "left",
      boxShadow: next.isLive ? "0 3px 10px rgba(232,93,46,0.30)" : "0 2px 6px rgba(26,18,13,0.15)",
    }}>
      <div style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: stage.color }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{
          fontSize: 8, letterSpacing: 1.3, fontWeight: 700, opacity: 0.7, lineHeight: 1.1,
        }}>{next.isLive ? "★ NEXT — LIVE" : "★ NEXT"}</div>
        <div className="serif" style={{
          fontSize: 14.5, lineHeight: 1.15, letterSpacing: -0.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {next.artist.name}
          <span className="mono" style={{ fontSize: 9, letterSpacing: 0.8, opacity: 0.6, marginLeft: 6 }}>
            {stage.short} · {fmt12(next.artist.start)}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.1, fontWeight: 800, lineHeight: 1.1 }}>
          {headline}
        </div>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 0.9, fontWeight: 600,
          opacity: willBeLate ? 1 : 0.7,
          color: willBeLate ? "#fbbf24" : "inherit",
          marginTop: 1,
        }}>{walkLabel}M{willBeLate ? " ⚠" : ""}</div>
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
  // "Real map (BETA)" — MapLibre overlay experiment. Persisted so toggling
  // survives reloads; default OFF so v1.0 users see the same SVG map.
  const [realMap, setRealMap] = React.useState(() => {
    try { return localStorage.getItem("plursky_real_map") === "1"; } catch { return false; }
  });
  const [pingOpen, setPingOpen] = React.useState(false);
  const [iAmAtOpen, setIAmAtOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [meetupsOpen, setMeetupsOpen] = React.useState(false);
  // Local meetup list, refreshed on a 30s tick so the "IN 5M" countdowns
  // stay sensible and stale entries (>30 min past) clear themselves.
  const [meetups, setMeetups] = React.useState(() => upcomingMeetups());
  React.useEffect(() => {
    const id = setInterval(() => setMeetups(upcomingMeetups()), 30000);
    return () => clearInterval(id);
  }, []);
  // Also refresh whenever the meetups sheet closes (likely added/removed one)
  React.useEffect(() => {
    if (!meetupsOpen) setMeetups(upcomingMeetups());
  }, [meetupsOpen]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [myStatusStage, setMyStatusStage] = React.useState(() => getMyStatus()?.stage || null);
  // shareState replaces the legacy `crewLive` boolean — single source of
  // truth for "what am I broadcasting and until when". Persisted so the
  // share survives app reloads but always respects the expiresAt watchdog.
  const [shareState, setShareState] = React.useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("plursky_share_state") || "null");
      if (s && s.expiresAt && s.expiresAt <= Date.now()) return null; // expired
      return s;
    } catch { return null; }
  });
  const isSharing = !!shareState?.active &&
                    (!shareState?.expiresAt || shareState.expiresAt > Date.now());
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
        // Prefer real GPS (set via Share With Crew → "📍 My GPS location");
        // fall back to stage centroid when only stage is broadcast.
        let x, y;
        if (e.gps && Number.isFinite(e.gps.lat) && Number.isFinite(e.gps.lng)) {
          const m = gpsToMap(e.gps.lat, e.gps.lng);
          x = Math.max(2, Math.min(98, m.x));
          y = Math.max(2, Math.min(98, m.y));
        } else {
          const st = e.stageId ? STAGES.find(s => s.id === e.stageId) : null;
          if (!st) return null;
          x = st.x; y = st.y;
        }
        return {
          id, name: e.name || "?",
          color: e.color || "#888",
          x, y, gps: e.gps || null,
          stageId: e.stageId, ts: e.ts,
        };
      }).filter(Boolean);
  }, [crewSnap, myPresId]);

  // Persist shareState whenever it changes (or clear it when nulled).
  React.useEffect(() => {
    try {
      if (shareState) localStorage.setItem("plursky_share_state", JSON.stringify(shareState));
      else localStorage.removeItem("plursky_share_state");
    } catch {}
  }, [shareState]);

  // Drive Supabase presence from shareState. Joining is once-per-active-cycle
  // so we don't churn the channel on every GPS tick; pos/stage updates flow
  // through dedicated effects below.
  React.useEffect(() => {
    if (!isSharing) { sbPresenceLeave(); return; }
    const stageId = shareState.includeStage ? (myStatusStage || STAGES[0].id) : null;
    const gps = (shareState.includeGps && gpsPos)
      ? { lat: gpsPos.lat, lng: gpsPos.lng, accuracy: gpsPos.accuracy }
      : undefined;
    sbPresenceJoin({ name: crewName || "Anon", stageId, gps });
    return () => { /* leave handled by the next effect run or unmount */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSharing]);

  // Unified broadcast heartbeat — fan out GPS/stage updates to both Supabase
  // Realtime presence (crew view) and the live_shares row (public link). One
  // effect avoids duplicate work; both write paths are idempotent.
  React.useEffect(() => {
    if (!isSharing) return;
    const gps = (shareState?.includeGps && gpsPos)
      ? { lat: gpsPos.lat, lng: gpsPos.lng, accuracy: gpsPos.accuracy }
      : undefined;
    const stageId = shareState?.includeStage ? (myStatusStage || STAGES[0].id) : null;
    if (gps || stageId !== undefined) sbPresenceUpdate({ gps, stageId });
    if (shareState?.token) sbLiveShareUpdate(shareState.token, { gps, stageId });
  }, [
    isSharing, shareState?.includeGps, shareState?.includeStage, shareState?.token,
    gpsPos?.lat, gpsPos?.lng, gpsPos?.accuracy, myStatusStage,
  ]);

  // Live share lifecycle: mint a token on first activation, upsert the row,
  // tear down on stop. Cleanup function fires when isSharing flips off or
  // shareState is cleared by the expiry watchdog.
  React.useEffect(() => {
    if (!isSharing) return;
    // First time → generate token, then wait for next render to actually start.
    if (!shareState.token) {
      const token = sbGenerateShareToken();
      setShareState(s => s ? { ...s, token } : s);
      return;
    }
    sbLiveShareStart({
      token: shareState.token,
      pid: sbGetMyPresId?.() || "anon",
      name: crewName || "Friend",
      expiresAt: shareState.expiresAt,
      gps: (shareState.includeGps && gpsPos)
        ? { lat: gpsPos.lat, lng: gpsPos.lng, accuracy: gpsPos.accuracy }
        : undefined,
      stageId: shareState.includeStage ? (myStatusStage || STAGES[0].id) : null,
    });
    const tokenCapture = shareState.token;
    return () => { sbLiveShareStop(tokenCapture); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSharing, shareState?.token]);

  // Auto-expiry watchdog. Schedules a one-shot timer for the remaining
  // window so we wake exactly when sharing should stop, without polling.
  React.useEffect(() => {
    if (!shareState?.active || !shareState.expiresAt) return;
    const remaining = shareState.expiresAt - Date.now();
    if (remaining <= 0) { setShareState(null); return; }
    const id = setTimeout(() => setShareState(null), Math.min(remaining, 2147483000));
    return () => clearTimeout(id);
  }, [shareState?.active, shareState?.expiresAt]);

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
      <div style={{ padding: "6px 12px 8px", background: "var(--paper)", borderBottom: "1px solid var(--line)", position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          background: "var(--paper-2)",
          borderRadius: 999, padding: "6px 6px 6px 11px",
          border: "1px solid var(--line)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7"/><path d="M20 20 L16 16"/>
          </svg>
          <input
            type="text"
            placeholder="Search stages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontFamily: "Geist, sans-serif", fontSize: 13,
            }}
          />
          {liveAvatar?.offSite && (
            <span title={`${liveAvatar.mi.toFixed(1)} mi from venue · showing demo`} className="mono" style={{
              fontSize: 8.5, letterSpacing: 1.1, fontWeight: 700,
              color: "#b8651b", background: "rgba(245,154,54,0.12)",
              border: "1px solid rgba(245,154,54,0.4)",
              padding: "2px 7px", borderRadius: 999, flexShrink: 0,
            }}>{liveAvatar.mi.toFixed(0)}MI OFF</span>
          )}
          <button onClick={() => setGpsLive(g => !g)} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: gpsActive ? "var(--ember)" : "var(--paper)",
            color: gpsActive ? "#fff" : "var(--muted)",
            border: gpsActive ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, padding: "3px 9px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            cursor: "pointer", flexShrink: 0,
          }}>
            {gpsActive && (
              <span style={{
                width: 5, height: 5, borderRadius: 5, background: "#fff",
                animation: gpsStatus === "live" ? "pulse 1.4s infinite" : "none",
              }}/>
            )}
            {gpsLabel}
          </button>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Map options" title="Options" style={{
            background: menuOpen ? "var(--ink)" : "var(--paper)",
            color: menuOpen ? "var(--paper)" : "var(--muted)",
            border: menuOpen ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, width: 26, height: 22, padding: 0,
            fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>⋯</button>
        </div>

        {/* Overflow menu popover */}
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{
              position: "fixed", inset: 0, zIndex: 5,
            }}/>
            <div style={{
              position: "absolute", top: 44, right: 12, zIndex: 6,
              background: "var(--paper)", border: "1px solid var(--line-2)",
              borderRadius: 12, padding: 5, minWidth: 220,
              boxShadow: "0 10px 28px rgba(26,18,13,0.20)",
            }}>
              {[
                { id: "notify", label: "🔔  Reminders",
                  active: notifyEnabled,
                  onToggle: async () => {
                    if (typeof Notification === "undefined") return;
                    if (Notification.permission === "denied") return;
                    if (notifyEnabled) { writeNotifyEnabled(false); setNotifyEnabled(false); return; }
                    let perm = Notification.permission;
                    if (perm === "default") {
                      try { perm = await Notification.requestPermission(); } catch { perm = "denied"; }
                    }
                    if (perm !== "granted") { setNotifyEnabled(false); return; }
                    writeNotifyEnabled(true); setNotifyEnabled(true);
                  },
                },
                { id: "compass", label: "⌖  Compass mode",
                  active: compass && compassStatus === "live",
                  onToggle: () => { if (compass) { setCompass(false); setCompassStatus("off"); } else enableCompass(); },
                },
                { id: "crowd",  label: "🔥  Crowd heatmap",   active: showHeat,   onToggle: () => setShowHeat(s => !s) },
                { id: "labels", label: "🏷  Landmark labels", active: showLabels, onToggle: () => setShowLabels(s => !s) },
                { id: "realmap", label: "🌎  Real map (BETA)", active: realMap, onToggle: () => {
                  const next = !realMap;
                  setRealMap(next);
                  try { localStorage.setItem("plursky_real_map", next ? "1" : "0"); } catch {}
                } },
              ].map(item => (
                <div key={item.id} role="button" onClick={item.onToggle} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                }}>
                  <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{item.label}</span>
                  <span style={{
                    width: 30, height: 18, borderRadius: 18,
                    background: item.active ? "var(--ember)" : "var(--line-2)",
                    position: "relative", flexShrink: 0, transition: "background 0.15s",
                  }}>
                    <span style={{
                      position: "absolute", top: 2, left: item.active ? 14 : 2,
                      width: 14, height: 14, borderRadius: 14,
                      background: "#fff", transition: "left 0.18s",
                    }}/>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {gpsLive && gpsStatus === "denied" && (
          <div style={{
            marginTop: 6, padding: "4px 10px", borderRadius: 999,
            background: "rgba(193,74,74,0.10)", border: "1px solid rgba(193,74,74,0.35)",
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "#c14a4a", fontWeight: 700 }}>
              GPS DENIED · ENABLE LOCATION IN BROWSER
            </span>
          </div>
        )}

        {/* Find-nearest quick actions — slim icon-only round buttons */}
        {!search && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {[
              { type: "water",  label: "Water",  emoji: "💧", color: "#38bdf8" },
              { type: "med",    label: "Medic",  emoji: "✚",  color: "#f87171" },
              { type: "toilet", label: "Toilet", emoji: "🚻", color: "#94a3b8" },
              { type: "charge", label: "Charge", emoji: "⚡", color: "#facc15" },
              { type: "locker", label: "Locker", emoji: "🔒", color: "#a78bfa" },
            ].map(c => (
              <button key={c.type} title={c.label} aria-label={c.label} onClick={() => {
                const matches = (typeof AMENITIES !== "undefined" ? AMENITIES : []).filter(a => a.type === c.type);
                if (!matches.length) return;
                const nearest = matches
                  .map(a => ({ ...a, _d: Math.hypot(a.x - avatar.x, a.y - avatar.y) }))
                  .sort((a, b) => a._d - b._d)[0];
                setMeetTarget({ x: nearest.x, y: nearest.y, label: nearest.label, isAmenity: true });
                setMeetMode(true);
              }} style={{
                flex: 1, height: 30, borderRadius: 999,
                background: "var(--paper-2)", border: `1px solid ${c.color}55`,
                color: "var(--ink)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, padding: 0,
              }}>{c.emoji}</button>
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
        {realMap ? (
          <RealMap
            avatar={avatar} stages={STAGES}
            crewFriends={crewFriends}
            selected={selectedStage} meetTarget={meetTarget}
            onPickStage={(id) => { setSelectedStage(id); setPeek(false); }}
          />
        ) : (
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
        )}

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
          borderRadius: 14, padding: 6,
          boxShadow: "0 6px 20px rgba(26,18,13,0.12)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "bottom 0.3s",
        }}>
          <button onClick={() => {
            if (meetMode) { setMeetMode(false); setMeetTarget(null); setMeetGroup([]); }
            else { setMeetMode(true); }
          }} style={{
            background: meetMode ? "var(--ember)" : "var(--ink)",
            color: "#fff",
            border: "none", borderRadius: 999, padding: "6px 11px",
            fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>{meetMode ? "× CANCEL" : "MEET UP"}</button>
          <button onClick={() => setMoreOpen(o => !o)} aria-label="More actions" title="Ping / Crew / I'm at" style={{
            position: "relative",
            background: moreOpen ? "var(--ink)" : "var(--paper-2)",
            color: moreOpen ? "var(--paper)" : "var(--ink)",
            border: moreOpen ? "none" : "1px solid var(--line-2)",
            borderRadius: 999, width: 32, height: 26, padding: 0,
            cursor: "pointer", flexShrink: 0,
            fontSize: 16, fontWeight: 700, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            ⋯
            {(isSharing || myStatusStage) && (
              <span style={{
                position: "absolute", top: -2, right: -2,
                width: 8, height: 8, borderRadius: 8,
                background: isSharing
                  ? "var(--success)"
                  : (myStatusStage ? (STAGES.find(s => s.id === myStatusStage)?.color || "var(--ember)") : "var(--ember)"),
                border: "1.5px solid var(--paper)",
              }}/>
            )}
          </button>
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
                <button key={f.id}
                  onClick={() => setChatFriend({ id: f.id, presId: f.id, name: f.name, avatarTone: f.color, x: f.x, y: f.y })}
                  style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                    padding: "3px 8px 3px 5px", borderRadius: 999,
                    background: `${f.color}22`,
                    border: `1px solid ${f.color}`,
                    fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 0.4, fontWeight: 600,
                    color: "var(--ink)", cursor: "pointer",
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: 7, background: f.color, animation: "pulse 1.6s infinite", flexShrink: 0 }}/>
                  {f.name.toUpperCase()}
                  <span style={{ fontSize: 7.5, opacity: 0.7, letterSpacing: 0.8, color: st?.color }}>
                    {st?.short || ""}{age}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* More-actions popover (PING / CREW / I'M AT) */}
        {moreOpen && (
          <>
            <div onClick={() => setMoreOpen(false)} style={{
              position: "absolute", inset: 0, zIndex: 6,
            }}/>
            <div style={{
              position: "absolute", left: 10, right: 10,
              bottom: stage || meetMode ? 184 : 54, zIndex: 7,
              background: "var(--paper)", border: "1px solid var(--line-2)",
              borderRadius: 14, padding: 5,
              boxShadow: "0 10px 28px rgba(26,18,13,0.20)",
            }}>
              <button onClick={() => { setPingOpen(true); setMoreOpen(false); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 11px", background: "transparent", border: "none",
                borderRadius: 8, cursor: "pointer", color: "var(--ink)", textAlign: "left",
              }}>
                <span style={{ fontSize: 14, width: 18 }}>◉</span>
                <span style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500, flex: 1 }}>Ping code</span>
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", fontWeight: 700 }}>SHARE / DROP</span>
              </button>
              <button onClick={() => { setShareOpen(true); setMoreOpen(false); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 11px",
                background: isSharing ? "rgba(45,122,85,0.10)" : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer",
                color: "var(--ink)", textAlign: "left",
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 14,
                  background: isSharing ? "var(--success)" : "var(--line-2)",
                  animation: isSharing ? "pulse 1.6s infinite" : "none",
                }}/>
                <span style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500, flex: 1 }}>
                  Share with crew{crewFriends.length > 0 ? ` · ${crewFriends.length}` : ""}
                </span>
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: isSharing ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
                  {isSharing ? "ON" : "OFF"}
                </span>
              </button>
              {(() => {
                const ms = myStatusStage ? STAGES.find(s => s.id === myStatusStage) : null;
                return (
                  <button onClick={() => { setIAmAtOpen(true); setMoreOpen(false); }} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 11px", background: "transparent", border: "none",
                    borderRadius: 8, cursor: "pointer", color: "var(--ink)", textAlign: "left",
                  }}>
                    <span style={{ fontSize: 14, width: 18 }}>📍</span>
                    <span style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500, flex: 1 }}>I'm at…</span>
                    <span className="mono" style={{
                      fontSize: 8.5, letterSpacing: 1, fontWeight: 700,
                      color: ms ? ms.color : "var(--muted)",
                    }}>{ms ? ms.short : "PICK STAGE"}</span>
                  </button>
                );
              })()}
              <button onClick={() => { setMeetupsOpen(true); setMoreOpen(false); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 11px", background: "transparent", border: "none",
                borderRadius: 8, cursor: "pointer", color: "var(--ink)", textAlign: "left",
              }}>
                <span style={{ fontSize: 14, width: 18 }}>🗓</span>
                <span style={{ fontFamily: "Geist", fontSize: 13, fontWeight: 500, flex: 1 }}>Meetups</span>
                <span className="mono" style={{
                  fontSize: 8.5, letterSpacing: 1, color: meetups.length ? "var(--ember)" : "var(--muted)", fontWeight: 700,
                }}>{meetups.length ? `${meetups.length} UPCOMING` : "NONE"}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Chat drawer — opens on friend tap (when not in meet mode) */}
      {chatFriend && (
        <MessageDrawer
          friend={chatFriend}
          myPresId={myPresId}
          avatarStage={selectedStage}
          saved={state.saved}
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
            // If already sharing, the dedicated stage-update effect will
            // re-broadcast on the next render. We no longer auto-start
            // broadcasting from "I'm at" — the user goes through the
            // Share With Crew sheet's consent moment for that.
          }}
        />
      )}

      {shareOpen && (
        <ShareLocationSheet
          shareState={shareState}
          crewCount={crewFriends.length}
          crewCode={sbGetOrCreateGroupCode?.() || ""}
          gpsPos={gpsPos}
          gpsStatus={gpsStatus}
          myStatusStage={myStatusStage}
          onClose={() => setShareOpen(false)}
          onSave={(s) => setShareState(s)}
          onStop={() => setShareState(null)}
        />
      )}

      {meetupsOpen && (
        <MeetupsSheet onClose={() => setMeetupsOpen(false)} />
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

// ─── Map styles (kept simple, all free / no token required) ──────
const REAL_MAP_STYLES = {
  stylized: {
    label: "STYLIZED",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
  satellite: {
    label: "SATELLITE",
    // Inline raster style: Esri World Imagery tiles, free for non-commercial.
    // If commercial use becomes a concern, swap to Mapbox/MapTiler satellite.
    style: {
      version: 8,
      sources: {
        sat: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Imagery © Esri, Maxar",
        },
      },
      layers: [{ id: "sat", type: "raster", source: "sat" }],
    },
  },
};

// Inject the keyframes/classes we use on map markers exactly once.
// Lives in the document head so swapping the map style doesn't drop it.
function _ensureRealMapStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("plursky-realmap-styles")) return;
  const el = document.createElement("style");
  el.id = "plursky-realmap-styles";
  el.textContent = [
    "@keyframes plursky-stage-pulse {",
    "  0%,100% { transform: scale(1); }",
    "  50%     { transform: scale(1.35); }",
    "}",
    "@keyframes plursky-halo-pulse {",
    "  0%   { transform: scale(0.7); opacity: 0.55; }",
    "  100% { transform: scale(2.2); opacity: 0; }",
    "}",
    ".plursky-stage-selected { animation: plursky-stage-pulse 1.6s ease-in-out infinite; }",
    ".plursky-avatar-halo {",
    "  position: absolute; top: 50%; left: 50%;",
    "  width: 40px; height: 40px; margin: -20px 0 0 -20px;",
    "  border-radius: 999px; background: rgba(245,154,54,0.55);",
    "  animation: plursky-halo-pulse 2.2s ease-out infinite;",
    "  pointer-events: none;",
    "}",
  ].join("\n");
  document.head.appendChild(el);
}

// ─── MapLibre lazy loader ───────────────────────────────────────
// Loaded only when the user toggles the "Real map (BETA)" experiment.
// Adds ~330KB of JS to the page, so we keep it off the initial bundle.
let _mapLibrePromise = null;
function _loadMapLibre() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (_mapLibrePromise) return _mapLibrePromise;
  _mapLibrePromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    s.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error("maplibregl missing"));
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
  return _mapLibrePromise;
}

// Inverse of gpsToMap. Given a 100-space (x, y) inside the LVMS infield,
// return (lat, lng). Same 3-point affine, solved in the other direction.
function mapToGps(x, y) {
  const A = MAP_AFFINE.x;  // [ax, ay, cx]
  const B = MAP_AFFINE.y;  // [bx, by, cy]
  const det = A[0]*B[1] - A[1]*B[0];
  const lat = ( B[1]*(x - A[2]) - A[1]*(y - B[2])) / det;
  const lng = (-B[0]*(x - A[2]) + A[0]*(y - B[2])) / det;
  return { lat, lng };
}

// ─── RealMap ────────────────────────────────────────────────────
// MapLibre-based festival map. Real LVMS geography, native pinch-zoom
// and pan, tilted pitch for a 3D feel. Stage markers + avatar + route
// line are overlay layers projected from the existing 100-space x/y
// via mapToGps(). Behind the "Real map (BETA)" toggle in the More menu;
// when off, MapScreen falls back to the SVG TopDownMap.
function RealMap({ avatar, stages, crewFriends = [], selected, meetTarget, onPickStage }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const stageMarkersRef = React.useRef({});
  const avatarMarkerRef = React.useRef(null);
  const friendMarkersRef = React.useRef({}); // id -> { marker, lastSig }
  const onPickStageRef = React.useRef(onPickStage);
  const [loaded, setLoaded] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [styleKey, setStyleKey] = React.useState(() => {
    try { return localStorage.getItem("plursky_real_map_style") || "stylized"; } catch { return "stylized"; }
  });

  React.useEffect(() => { onPickStageRef.current = onPickStage; }, [onPickStage]);

  // Init MapLibre once on mount
  React.useEffect(() => {
    _ensureRealMapStyles();
    let cancelled = false;
    _loadMapLibre().then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      const center = FESTIVAL_CONFIG.gps;
      const initialStyle = REAL_MAP_STYLES[styleKey] || REAL_MAP_STYLES.stylized;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: initialStyle.style || initialStyle.url,
        center: [center.lng, center.lat],
        zoom: 15.4,
        pitch: 55,
        bearing: 0,
        attributionControl: false,
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;

      // Style-dependent layers (route line, 3D buildings) get torn down on
      // setStyle(), so we re-add them every time a new style finishes loading.
      const setupOverlayLayers = () => {
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
          });
        }
        if (!map.getLayer("route")) {
          map.addLayer({
            id: "route", type: "line", source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#e85d2e",
              "line-width": 4,
              "line-opacity": 0.9,
              "line-dasharray": [2, 1.5],
            },
          });
        }
        // 3D building extrusions — only on vector styles. The Liberty style
        // ships a `building` source-layer in the OMT schema; raster satellite
        // styles don't, so the addLayer would no-op (try/catch protects).
        if (!map.getLayer("plursky-3d-buildings")) {
          try {
            const sources = map.getStyle().sources || {};
            const omtSrc = Object.keys(sources).find(id => sources[id].type === "vector");
            if (omtSrc) {
              map.addLayer({
                id: "plursky-3d-buildings",
                source: omtSrc,
                "source-layer": "building",
                type: "fill-extrusion",
                minzoom: 13,
                paint: {
                  "fill-extrusion-color": [
                    "interpolate", ["linear"], ["coalesce", ["get", "render_height"], 5],
                    0,  "#3a2a55",
                    20, "#5b3d7a",
                    60, "#7b4d9a",
                  ],
                  "fill-extrusion-height": ["coalesce", ["get", "render_height"], 5],
                  "fill-extrusion-base":   ["coalesce", ["get", "render_min_height"], 0],
                  "fill-extrusion-opacity": 0.78,
                },
              });
            }
          } catch {}
        }
      };

      // One-shot setup that runs after the first style finishes loading.
      // Markers (DOM overlays) persist across setStyle(), so we add them once.
      map.on("load", () => {
        if (cancelled) return;

        // Constrain panning to the festival footprint + small buffer so users
        // can't accidentally pan to Reno.
        const b = FESTIVAL_CONFIG.venue.festivalBounds;
        map.setMaxBounds([[b.west - 0.008, b.south - 0.008], [b.east + 0.008, b.north + 0.008]]);

        // Stage markers — dot + floating label
        stages.forEach(s => {
          const { lat, lng } = mapToGps(s.x, s.y);
          const dot = document.createElement("div");
          dot.className = "plursky-stage-marker";
          dot.style.cssText =
            "width:24px;height:24px;border-radius:999px;cursor:pointer;" +
            `background:${s.color};` +
            "border:2px solid rgba(255,255,255,0.95);" +
            `box-shadow:0 0 18px ${s.color}aa,0 2px 8px rgba(0,0,0,0.5);`;
          dot.title = s.name;
          dot.addEventListener("click", (e) => {
            e.stopPropagation();
            onPickStageRef.current && onPickStageRef.current(s.id);
          });
          stageMarkersRef.current[s.id] = new maplibregl.Marker({ element: dot })
            .setLngLat([lng, lat])
            .addTo(map);

          const labelEl = document.createElement("div");
          labelEl.style.cssText =
            "background:rgba(6,4,18,0.88);color:#fff;" +
            "border:1px solid rgba(255,255,255,0.22);" +
            "padding:3px 9px;border-radius:999px;" +
            "font-family:'Geist Mono',monospace;font-size:9px;" +
            "letter-spacing:1.2px;font-weight:700;white-space:nowrap;" +
            "pointer-events:none;transform:translate(0,-34px);";
          labelEl.textContent = s.name.toUpperCase();
          new maplibregl.Marker({ element: labelEl, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(map);
        });

        // Avatar — outer halo (pulse animation) + inner amber dot
        const avWrap = document.createElement("div");
        avWrap.style.cssText = "position:relative;width:18px;height:18px;pointer-events:none;";
        const halo = document.createElement("div");
        halo.className = "plursky-avatar-halo";
        const avDot = document.createElement("div");
        avDot.style.cssText =
          "position:absolute;inset:0;border-radius:999px;" +
          "background:#f59a36;border:2px solid rgba(255,255,255,0.95);" +
          "box-shadow:0 0 16px rgba(245,154,54,0.9),0 2px 6px rgba(0,0,0,0.5);";
        avWrap.appendChild(halo);
        avWrap.appendChild(avDot);
        const avLatLng = mapToGps(avatar.x, avatar.y);
        avatarMarkerRef.current = new maplibregl.Marker({ element: avWrap })
          .setLngLat([avLatLng.lng, avLatLng.lat])
          .addTo(map);

        setupOverlayLayers();
        setLoaded(true);
      });

      // Every time a NEW style finishes loading (after setStyle), re-add the
      // route line + 3D buildings. Markers persist; layers don't.
      map.on("styledata", () => {
        if (cancelled || !mapRef.current) return;
        setupOverlayLayers();
      });

      map.on("error", (e) => {
        if (cancelled) return;
        const msg = (e && e.error && e.error.message) || "tile load failed";
        // Tile fetch errors fire constantly while panning out-of-bounds;
        // only surface the first one.
        setErr(prev => prev || msg);
      });
    }).catch(e => {
      if (!cancelled) setErr(e.message || "library failed to load");
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
      stageMarkersRef.current = {};
      avatarMarkerRef.current = null;
      friendMarkersRef.current = {};
    };
  }, []);

  // Avatar follows GPS / demo position
  React.useEffect(() => {
    if (!loaded || !avatarMarkerRef.current) return;
    const { lat, lng } = mapToGps(avatar.x, avatar.y);
    avatarMarkerRef.current.setLngLat([lng, lat]);
  }, [loaded, avatar.x, avatar.y]);

  // Crew friend markers — Instagram-style avatar circles. Reconcile diffs on
  // every crewFriends change: add new, move existing, remove dropped. Stable
  // marker DOM nodes so positions animate smoothly.
  React.useEffect(() => {
    if (!loaded || !mapRef.current || !window.maplibregl) return;
    const map = mapRef.current;
    const live = friendMarkersRef.current;
    const seenIds = new Set();

    crewFriends.forEach(f => {
      seenIds.add(f.id);
      const lat = f.gps?.lat ?? mapToGps(f.x, f.y).lat;
      const lng = f.gps?.lng ?? mapToGps(f.x, f.y).lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const seen = formatLastSeen(f.ts);
      const initial = (f.name?.[0] || "?").toUpperCase();
      // Signature changes when display-affecting fields change — avoid
      // re-rendering DOM when only position changes (positions update via
      // setLngLat on the same element).
      const sig = `${initial}|${f.color}|${seen.color}|${seen.freshness}|${seen.label}|${f.name}`;

      let entry = live[f.id];
      if (!entry) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;";
        entry = { marker: new window.maplibregl.Marker({ element: wrap, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map), wrap, sig: "" };
        live[f.id] = entry;
      }
      if (entry.sig !== sig) {
        entry.wrap.innerHTML =
          `<div style="width:30px;height:30px;border-radius:999px;background:${f.color};` +
          `border:2px solid rgba(255,255,255,0.95);box-shadow:0 3px 12px ${f.color}aa,0 0 0 1px rgba(0,0,0,0.4);` +
          `display:flex;align-items:center;justify-content:center;color:#fff;` +
          `font-family:'Instrument Serif',serif;font-size:17px;line-height:1;` +
          `opacity:${seen.freshness === "cold" ? 0.78 : 1};">${initial}</div>` +
          `<div style="display:flex;align-items:center;gap:4px;` +
          `background:rgba(6,4,18,0.86);color:#fff;` +
          `border:1px solid rgba(255,255,255,0.18);` +
          `padding:2px 7px;border-radius:999px;` +
          `font-family:'Geist Mono',monospace;font-size:8px;letter-spacing:1.1px;` +
          `font-weight:700;white-space:nowrap;">` +
          `<span style="width:5px;height:5px;border-radius:5px;background:${seen.color};` +
          `${seen.freshness === "fresh" ? "animation:pulse 1.6s infinite;" : ""}"></span>` +
          `${f.name.toUpperCase()}${seen.label && seen.freshness !== "fresh" ? ` · ${seen.label}` : ""}` +
          `</div>`;
        entry.sig = sig;
      }
      entry.marker.setLngLat([lng, lat]);
    });

    // Remove markers for friends no longer in the snap
    Object.keys(live).forEach(id => {
      if (!seenIds.has(id)) {
        try { live[id].marker.remove(); } catch {}
        delete live[id];
      }
    });
  }, [loaded, crewFriends]);

  // Selected stage pulses via CSS animation. flyTo cinematically swings the
  // camera in toward the marker — the single biggest "amazing" gain for one
  // line of map code.
  React.useEffect(() => {
    if (!loaded) return;
    Object.entries(stageMarkersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement();
      el.classList.toggle("plursky-stage-selected", id === selected);
    });
    if (!selected || !mapRef.current) return;
    const s = stages.find(st => st.id === selected);
    if (!s) return;
    const { lat, lng } = mapToGps(s.x, s.y);
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 16.6,
      pitch: 58,
      duration: 1400,
      essential: true,
    });
  }, [loaded, selected, stages]);

  // Swap the basemap style when the user toggles Stylized / Satellite.
  // styledata listener re-adds overlay layers; markers persist across swaps.
  React.useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const cfg = REAL_MAP_STYLES[styleKey];
    if (!cfg) return;
    try {
      mapRef.current.setStyle(cfg.style || cfg.url);
    } catch (e) { /* swallow — initial-load races sometimes */ }
  }, [loaded, styleKey]);

  // Route line: avatar → selected stage / meet target
  React.useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const target = meetTarget || (selected ? stages.find(s => s.id === selected) : null);
    const src = mapRef.current.getSource("route");
    if (!src) return;
    if (!target) {
      src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] } });
      return;
    }
    const a = mapToGps(avatar.x, avatar.y);
    const t = mapToGps(target.x, target.y);
    src.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [t.lng, t.lat]] },
    });
  }, [loaded, avatar.x, avatar.y, selected, meetTarget, stages]);

  const pickStyle = (k) => {
    setStyleKey(k);
    try { localStorage.setItem("plursky_real_map_style", k); } catch {}
  };

  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: "#060412",
    }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }}/>

      {/* Style switcher — Stylized / Satellite. Top-right, above the map. */}
      {loaded && (
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 4,
          display: "flex", background: "rgba(6,4,18,0.78)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 999, padding: 3, gap: 2,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}>
          {Object.entries(REAL_MAP_STYLES).map(([k, cfg]) => {
            const on = styleKey === k;
            return (
              <button key={k} onClick={() => pickStyle(k)} style={{
                background: on ? "var(--ember)" : "transparent",
                color: "#fff", border: "none",
                padding: "5px 11px", borderRadius: 999,
                fontFamily: "'Geist Mono',monospace", fontSize: 9,
                letterSpacing: 1.3, fontWeight: 700,
                cursor: "pointer", transition: "background 0.15s",
              }}>{cfg.label}</button>
            );
          })}
        </div>
      )}

      {!loaded && !err && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.7)",
          fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: 1.3,
        }}>LOADING MAP…</div>
      )}
      {err && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "#f87171",
          fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: 1.3,
          gap: 6, padding: 20, textAlign: "center",
        }}>
          <div>MAP ERROR</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, maxWidth: 240 }}>{err}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 8, marginTop: 4 }}>
            Tip: turn off "Real map (BETA)" in the More menu to fall back to the SVG map.
          </div>
        </div>
      )}
    </div>
  );
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

        {crewFriends.map(f => {
          const seen    = formatLastSeen(f.ts);
          const initial = (f.name?.[0] || "?").toUpperCase();
          return (
            <div key={`crew-${f.id}`} style={{
              position: "absolute", left: `${f.x}%`, top: `${f.y}%`,
              transform: `translate(-50%, calc(-100% - 4px))${counterRot}`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              pointerEvents: "none",
              opacity: seen.freshness === "cold" ? 0.78 : 1,
            }}>
              {/* Avatar circle — Instagram-style, color background, serif initial */}
              <div style={{
                width: 32, height: 32, borderRadius: 999,
                background: f.color,
                border: "2px solid rgba(255,255,255,0.95)",
                boxShadow: `0 4px 14px ${f.color}aa, 0 0 0 1px rgba(0,0,0,0.45)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff",
                fontFamily: "Instrument Serif, serif", fontSize: 18, fontWeight: 400,
                lineHeight: 1,
              }}>{initial}</div>
              {/* Name + last-seen pill */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(6,4,18,0.85)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                padding: "2px 7px", borderRadius: 999,
                fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.1, fontWeight: 700,
                whiteSpace: "nowrap",
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: 5,
                  background: seen.color,
                  animation: seen.freshness === "fresh" ? "pulse 1.6s infinite" : "none",
                }}/>
                {f.name.toUpperCase()}
                {seen.label && seen.freshness !== "fresh" && (
                  <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
                    · {seen.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}

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
            {fmt12(nowAtStage.start)}–{fmt12(nowAtStage.end)}
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
                <div className="mono" style={{ fontSize: 11, letterSpacing: 0.3, fontWeight: 600, color: live ? stage.color : "var(--ink)" }}>{fmt12(s.start)}</div>
                <div className="mono" style={{ fontSize: 8.5, letterSpacing: 0.8, color: "var(--muted)" }}>{fmt12(s.end)}</div>
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
// Pass myPresId + friend.presId to enable real Supabase Realtime DMs.
// Falls back to the demo bot when either presId is absent or Supabase is unconfigured.
function MessageDrawer({ friend, myPresId, avatarStage, saved = [], onClose, onSwitchToMeet }) {
  const isRealDM = !!(myPresId && friend.presId && typeof sbDMSubscribe === "function");
  const dmKey = isRealDM ? sbDMChannelKey(myPresId, friend.presId) : null;

  const [thread, setThread] = React.useState(() => loadThread(friend.id));
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const scrollerRef = React.useRef(null);
  const replyTimer = React.useRef(null);
  const threadRef = React.useRef(thread);
  threadRef.current = thread;

  React.useEffect(() => {
    markRead(friend.id);
    return () => { if (replyTimer.current) clearTimeout(replyTimer.current); };
  }, [friend.id]);

  // Subscribe to Supabase DM channel when real DM is available
  React.useEffect(() => {
    if (!isRealDM) return;
    return sbDMSubscribe(dmKey, (payload) => {
      if (payload.from === myPresId) return; // echo guard
      const incoming = { from: "them", text: payload.text, ts: payload.ts || Date.now() };
      const updated = [...threadRef.current, incoming];
      setThread(updated);
      saveThread(friend.id, updated);
      setTyping(false);
    });
  }, [dmKey]);

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

    if (isRealDM) {
      // Real Supabase broadcast — no bot reply
      sbDMSend(dmKey, { from: myPresId, text: stamped, ts: Date.now() });
    } else {
      // Demo bot
      const [reply, delay] = _fakeReply(stamped);
      setTyping(true);
      replyTimer.current = setTimeout(() => {
        setTyping(false);
        const next = [...newThread, { from: "them", text: reply, ts: Date.now() }];
        setThread(next);
        saveThread(friend.id, next);
      }, delay);
    }
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
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
              {friendStage
                ? `${friendStage.name} · ${statusAge}m AGO`
                : "STATUS UNKNOWN"}
              {isRealDM && (
                <span style={{ color: "var(--success)", letterSpacing: 1 }}>● LIVE</span>
              )}
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
          {(() => {
            const myStage = avatarStage ? STAGES.find(s => s.id === avatarStage) : null;
            const friendStage = friend?.stage ? STAGES.find(s => s.id === friend.stage) : null;
            const nextSavedSet = saved && saved.length ? findNextSavedSet(saved) : null;
            const smart = buildSmartReplies({ myStage, friendStage, nextSavedSet });
            const all = [...smart, ...QUICK_REPLIES];
            return all.map((qr, i) => (
              <button key={`${qr.tag}-${i}`} onClick={() => send(qr.text)} className="mono" style={{
                flexShrink: 0, padding: "6px 11px", borderRadius: 999,
                background: qr.smart ? "var(--ember)" : "var(--paper-2)",
                color: qr.smart ? "#fff" : "var(--ink)",
                border: qr.smart ? "none" : "1px solid var(--line-2)",
                fontSize: 9.5, letterSpacing: 1.1, fontWeight: 600,
                cursor: "pointer", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {qr.smart && <span style={{ fontSize: 9 }}>✨</span>}
                {qr.tag}
              </button>
            ));
          })()}
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

Object.assign(window, { MapScreen, getMyPingCode });
