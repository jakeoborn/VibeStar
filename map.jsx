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
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

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
// Las Vegas Motor Speedway. Three stage anchors give us an affine transform
// from (lat, lng) → SVG (mapX, mapY) on the 0-100 grid.
const STAGE_GPS = {
  kinetic: { lat: 36.27512, lng: -115.0118 }, // mainstage, north end of infield
  cosmic:  { lat: 36.27370, lng: -115.0148 }, // open-air, west / left
  basspod: { lat: 36.27075, lng: -115.0123 }, // south / bottom
};
const FESTIVAL_LAT = 36.27370;
const FESTIVAL_LNG = -115.0125;
const ON_SITE_RADIUS_MI = 0.5; // ~800m — anything farther is treated as off-site

// 3-point Cramer affine: [mapX, mapY] = M · [lat, lng, 1]
function _solveMapAffine() {
  const find = (id) => STAGES.find(s => s.id === id);
  const A = { ...STAGE_GPS.kinetic, mx: find("kinetic").x, my: find("kinetic").y };
  const B = { ...STAGE_GPS.cosmic,  mx: find("cosmic").x,  my: find("cosmic").y };
  const C = { ...STAGE_GPS.basspod, mx: find("basspod").x, my: find("basspod").y };
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
function useGeolocation(enabled) {
  const [pos, setPos] = React.useState(null);
  const [status, setStatus] = React.useState("idle"); // idle | locating | live | denied | unavailable
  React.useEffect(() => {
    if (!enabled) { setStatus("idle"); return; }
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("locating");
    let alive = true;
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
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => { alive = false; navigator.geolocation.clearWatch(id); };
  }, [enabled]);
  return { pos, status };
}

function MapScreen({ state, setState }) {
  const [selectedStage, setSelectedStage] = React.useState(state.focusStage || null);
  const [gpsLive, setGpsLive] = React.useState(true);
  const [demoAvatar, setDemoAvatar] = React.useState(AVATAR_START);
  const [friends, setFriends] = React.useState(FRIENDS);
  const [peek, setPeek] = React.useState(false);
  const [meetMode, setMeetMode] = React.useState(false);
  const [meetTarget, setMeetTarget] = React.useState(null);
  const [meetWith, setMeetWith] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [heading, setHeading] = React.useState(0);
  const [chatFriend, setChatFriend] = React.useState(null);

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

  // Demo wander tick — only runs when not pinned to real on-site GPS
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
        if (meetMode && meetTarget && f.id === meetWith) {
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
    }, 600);
    return () => clearInterval(id);
  }, [useDemo, selectedStage, meetMode, meetTarget, meetWith]);

  // Heading derivation when real GPS is on-site and walking toward a goal
  React.useEffect(() => {
    if (!isLiveOnSite) return;
    const goal = meetMode && meetTarget ? meetTarget
               : selectedStage ? STAGES.find(s => s.id === selectedStage)
               : null;
    if (!goal) return;
    setHeading(Math.atan2(goal.y - avatar.y, goal.x - avatar.x));
  }, [isLiveOnSite, avatar.x, avatar.y, selectedStage, meetMode, meetTarget]);

  const stage = selectedStage ? STAGES.find(s => s.id === selectedStage) : null;
  const nowAtStage = stage ? ARTISTS.find(a => a.stage === stage.id && a.day === NOW.day) : null;
  const dx = stage ? stage.x - avatar.x : 0;
  const dy = stage ? stage.y - avatar.y : 0;
  const dist = Math.sqrt(dx*dx + dy*dy);
  // Speedway is ~1.5km × 0.8km — full diagonal ≈ 25 min walk.
  // Normalized coords 0-100; ~1.8 min per unit gives realistic walking times.
  const minsWalk = Math.max(2, Math.round(dist * 1.8));
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
    setMeetTarget({ x, y, label: meetWith ? `Meet ${friends.find(f=>f.id===meetWith).name}` : "Meet here" });
  };

  const suggestMidpoint = (friendId) => {
    const f = friends.find(fr => fr.id === friendId);
    setMeetWith(friendId);
    setMeetTarget({ x: (avatar.x + f.x) / 2, y: (avatar.y + f.y) / 2, label: `Meet ${f.name}` });
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
      </div>

      {/* MAP + PEEK WINDOW */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--paper-2)" }}>
        <WellnessPill />
        <TopDownMap
          avatar={avatar} heading={heading} friends={friends} stages={STAGES}
          selected={selectedStage} meetMode={meetMode} meetTarget={meetTarget} meetWith={meetWith}
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
                {meetTarget.label.toUpperCase()} · BOTH WALKING
              </>
            ) : "PICK A FRIEND OR TAP MAP"}
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
            if (meetMode) { setMeetMode(false); setMeetTarget(null); setMeetWith(null); }
            else { setMeetMode(true); }
          }} style={{
            background: meetMode ? "var(--ember)" : "var(--ink)",
            color: "#fff",
            border: "none", borderRadius: 999, padding: "7px 11px",
            fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>{meetMode ? "× CANCEL" : "MEET UP"}</button>
          <div className="no-scrollbar" style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
            {friends.map(f => {
              const d = Math.round(Math.sqrt((f.x-avatar.x)**2 + (f.y-avatar.y)**2) * 1.8);
              const active = meetWith === f.id;
              const unread = unreadCount(f.id);
              const handleClick = () => {
                if (meetMode) { suggestMidpoint(f.id); return; }
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
            setMeetWith(chatFriend.id);
            const f = friends.find(fr => fr.id === chatFriend.id);
            if (f) setMeetTarget({ x: (avatar.x + f.x) / 2, y: (avatar.y + f.y) / 2, label: `Meet ${f.name}` });
            setChatFriend(null);
          }}
        />
      )}

      {/* BOTTOM SHEET */}
      {(stage || (meetMode && meetTarget)) && (
        <BottomSheet
          stage={stage} nowAtStage={nowAtStage} dist={dist} minsWalk={minsWalk}
          peek={peek} setPeek={setPeek}
          meetMode={meetMode} meetTarget={meetTarget} friends={friends} meetWith={meetWith} avatar={avatar}
          onClose={() => setSelectedStage(null)}
          onCancelMeet={() => { setMeetMode(false); setMeetTarget(null); setMeetWith(null); }}
          onOpenArtist={(id) => setState({ ...state, tab: "home", artist: id })}
        />
      )}
    </Screen>
  );
}

// ---- TOP-DOWN NAVIGATION MAP ----
function TopDownMap({ avatar, heading, friends, stages, selected, meetMode, meetTarget, meetWith, onPickStage, onClick }) {
  const sel = stages.find(s => s.id === selected);

  const anchorFor = (s) => {
    if (s.y < 20) return "S";
    if (s.y > 78) return "N";
    if (s.x < 25) return "E";
    if (s.x > 72) return "W";
    return "S";
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--paper-2)", overflow: "hidden" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
        onClick={onClick}
        style={{ position: "absolute", inset: 0, cursor: meetMode ? "crosshair" : "default", display: "block" }}>
        <defs>
          <radialGradient id="mapGround" cx="50%" cy="45%" r="70%">
            <stop offset="0%"  stopColor="#f4ead8"/>
            <stop offset="60%" stopColor="#ead8b8"/>
            <stop offset="100%" stopColor="#d9bf94"/>
          </radialGradient>
          <pattern id="mapDots" width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="0.22" fill="rgba(26,18,13,0.07)"/>
          </pattern>
          <filter id="stageglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Ground */}
        <rect x="0" y="0" width="100" height="100" fill="url(#mapGround)"/>
        <rect x="0" y="0" width="100" height="100" fill="url(#mapDots)"/>

        {/* Speedway oval — Las Vegas Motor Speedway track */}
        <ellipse cx="50" cy="50" rx="44" ry="46" fill="none" stroke="rgba(26,18,13,0.06)" strokeWidth="5"/>
        <ellipse cx="50" cy="50" rx="44" ry="46" fill="none" stroke="rgba(26,18,13,0.32)" strokeWidth="0.4"/>
        <ellipse cx="50" cy="50" rx="39" ry="41" fill="none" stroke="rgba(26,18,13,0.18)" strokeWidth="0.25" strokeDasharray="1 1.5"/>

        {/* Infield warm wash */}
        <ellipse cx="50" cy="50" rx="36" ry="38" fill="rgba(245,154,54,0.06)"/>

        {/* Main pedestrian paths — ink-toned for legibility on paper */}
        <path d="M50,12 Q50,51 50,91" stroke="rgba(247,237,224,0.55)" strokeWidth="3.8" fill="none" strokeLinecap="round"/>
        <path d="M50,12 Q50,51 50,91" stroke="rgba(26,18,13,0.18)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray="2 1.6"/>
        <path d="M14,50 Q50,52 86,50" stroke="rgba(247,237,224,0.45)" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
        <path d="M14,50 Q50,52 86,50" stroke="rgba(26,18,13,0.14)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="2 1.6"/>
        {/* Diagonal connector paths */}
        <path d="M22,22 Q36,36 50,51" stroke="rgba(26,18,13,0.14)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
        <path d="M78,22 Q64,36 50,51" stroke="rgba(26,18,13,0.14)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>

        {/* Daisy Lane central plaza — ember accent */}
        <rect x="37" y="43" width="26" height="16" fill="rgba(245,154,54,0.10)" stroke="rgba(232,93,46,0.45)" strokeWidth="0.35" rx="2"/>
        <circle cx="50" cy="51" r="3.5" fill="none" stroke="rgba(232,93,46,0.45)" strokeWidth="0.3"/>
        <circle cx="50" cy="51" r="1.2" fill="rgba(232,93,46,0.7)"/>

        {/* Route line to selected stage or meet point */}
        {(sel || meetTarget) && (() => {
          const target = meetTarget || sel;
          return (
            <g>
              <path d={`M ${avatar.x},${avatar.y} L ${target.x},${target.y}`}
                stroke={meetTarget ? "#e85d2e" : "#f59a36"}
                strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.22"/>
              <path d={`M ${avatar.x},${avatar.y} L ${target.x},${target.y}`}
                stroke={meetTarget ? "#e85d2e" : "#f59a36"}
                strokeWidth="0.7" fill="none" strokeLinecap="round" strokeDasharray="2 1.5"/>
            </g>
          );
        })()}

        {/* Stage markers */}
        {stages.map(s => {
          const on = s.id === selected;
          const r = 2.8 + (s.size - 1) * 1.1;
          return (
            <g key={s.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onPickStage(s.id); }}>
              {on && (
                <circle cx={s.x} cy={s.y} r={r + 1} fill="none" stroke={s.color} strokeWidth="0.5" opacity="0.9">
                  <animate attributeName="r" values={`${r};${r+6};${r}`} dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={s.x} cy={s.y} r={r + 1.8} fill={s.color} opacity={on ? 0.18 : 0.09} filter="url(#stageglow)"/>
              <circle cx={s.x} cy={s.y} r={r} fill={s.color} opacity={on ? 1 : 0.88}/>
              <circle cx={s.x} cy={s.y} r={r * 0.38} fill="rgba(255,255,255,0.9)"/>
            </g>
          );
        })}

        {/* Friends */}
        {friends.map(f => {
          const focused = f.id === meetWith;
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

      {/* HTML label overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", left: "50%", top: "43%",
          transform: "translate(-50%, -130%)",
          fontFamily: "Geist Mono, monospace", fontSize: 7.5, letterSpacing: 2.2, fontWeight: 700,
          color: "rgba(232,93,46,0.85)",
        }}>DAISY LANE</div>

        {stages.map(s => {
          const on = s.id === selected;
          const anchor = anchorFor(s);
          const pos = { left: `${s.x}%`, top: `${s.y}%` };
          const off = 20;
          const tx = {
            N: { transform: `translate(-50%, calc(-100% - ${off}px))` },
            S: { transform: `translate(-50%, ${off}px)` },
            E: { transform: `translate(${off}px, -50%)` },
            W: { transform: `translate(calc(-100% - ${off}px), -50%)` },
          }[anchor];
          return (
            <div key={s.id} onClick={(e) => { e.stopPropagation(); onPickStage(s.id); }}
              style={{
                position: "absolute", ...pos, ...tx,
                pointerEvents: "auto", cursor: "pointer",
                background: on ? s.color : "rgba(247,237,224,0.96)",
                color: on ? "#fff" : "var(--ink)",
                border: `1px solid ${on ? s.color : "var(--line-2)"}`,
                padding: on ? "4px 10px" : "3px 8px",
                borderRadius: 999,
                fontFamily: "Geist Mono, monospace",
                fontSize: on ? 9.5 : 8.5,
                letterSpacing: 1.3, fontWeight: 700,
                whiteSpace: "nowrap",
                backdropFilter: "blur(8px)",
                boxShadow: on ? `0 4px 14px ${s.color}66` : "0 2px 6px rgba(26,18,13,0.10)",
                transition: "all 0.15s",
              }}>
              {s.name.toUpperCase()}
            </div>
          );
        })}

        {friends.map(f => f.id === meetWith && (
          <div key={f.id} style={{
            position: "absolute", left: `${f.x}%`, top: `${f.y}%`,
            transform: "translate(-50%, 14px)",
            background: f.color, color: "#fff",
            padding: "2px 7px", borderRadius: 999,
            fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 1.2, fontWeight: 700,
            boxShadow: `0 3px 10px ${f.color}66`, pointerEvents: "none",
          }}>
            {f.name.toUpperCase()}
          </div>
        ))}

        <div style={{
          position: "absolute", left: `${avatar.x}%`, top: `${avatar.y}%`,
          transform: "translate(-50%, -22px)",
          background: "rgba(245,154,54,0.95)", color: "#fff",
          padding: "2px 8px", borderRadius: 999,
          fontFamily: "Geist Mono, monospace", fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700,
          pointerEvents: "none", boxShadow: "0 3px 10px rgba(245,154,54,0.45)",
        }}>YOU</div>
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
function BottomSheet({ stage, nowAtStage, dist, minsWalk, peek, setPeek, meetMode, meetTarget, friends, meetWith, avatar, onClose, onCancelMeet, onOpenArtist }) {
  if (meetMode && meetTarget) {
    const f = friends.find(fr => fr.id === meetWith);
    const youDist = Math.sqrt((meetTarget.x-avatar.x)**2 + (meetTarget.y-avatar.y)**2);
    const youMins = Math.max(1, Math.round(youDist * 1.8));
    const fMins = f ? Math.max(1, Math.round(Math.sqrt((meetTarget.x-f.x)**2 + (meetTarget.y-f.y)**2) * 1.8)) : 0;
    const eta = Math.max(youMins, fMins);
    return (
      <div style={{ background: "var(--paper)", color: "var(--ink)", padding: "14px 16px 12px", borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: "0 -10px 30px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 38, background: "var(--ember)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2 C8 2 5 5 5 9 c0 5 7 13 7 13 s7-8 7-13 c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--ember)", fontWeight: 700 }}>MEETING</div>
            <div className="serif" style={{ fontSize: 20, lineHeight: 1.05 }}>{f ? `You + ${f.name}` : "Pinned spot"}</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>ETA ~{eta} MIN · BOTH ROUTING LIVE</div>
          </div>
          <button onClick={onCancelMeet} style={{ background: "transparent", border: "1px solid var(--line-2)", color: "var(--muted)", borderRadius: 999, padding: "7px 10px", cursor: "pointer", fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 600 }}>END</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "var(--paper-2)", borderRadius: 10, padding: "7px 10px" }}>
            <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: "var(--muted)" }}>YOUR ETA</div>
            <div className="serif" style={{ fontSize: 18, marginTop: 2 }}>{youMins} <span style={{ fontSize: 11 }}>min</span></div>
          </div>
          {f && (
            <div style={{ background: "var(--paper-2)", borderRadius: 10, padding: "7px 10px" }}>
              <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: f.color }}>{f.name.toUpperCase()} ETA</div>
              <div className="serif" style={{ fontSize: 18, marginTop: 2 }}>{fMins} <span style={{ fontSize: 11 }}>min</span></div>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (!stage) return null;
  return <StageLineupSheet stage={stage} minsWalk={minsWalk} dist={dist} peek={peek} setPeek={setPeek} onClose={onClose} onOpenArtist={onOpenArtist} nowAtStage={nowAtStage}/>;
}

function StageLineupSheet({ stage, minsWalk, dist, peek, setPeek, onClose, onOpenArtist, nowAtStage }) {
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
            {minsWalk} MIN WALK · ~{Math.round(dist*22)}M · {totalAcrossDays} SETS OVER 3 NIGHTS
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><path d="M9 6 L15 12 L9 18"/></svg>
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
