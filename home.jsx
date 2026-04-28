// Home / "Today" screen — now playing + schedule preview

// All festival timing constants come from FESTIVAL_CONFIG (data.jsx) so
// the same code works for any festival once a config is loaded.
const FESTIVAL_START_MS = FESTIVAL_CONFIG.startMs;
const FESTIVAL_END_MS   = FESTIVAL_CONFIG.endMs;

// Convert an HH:MM in "festival night" coords (>=18:00 today, <12:00 next
// day) to absolute Date for the given festival day. Anchors to the day's
// midnight in the festival's tz (stored in FESTIVAL_CONFIG.dayDates).
function festivalNightDate(day, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const dayMeta = FESTIVAL_CONFIG.dayDates[day];
  if (!dayMeta) return new Date(NaN);
  const isOvernight = h < 12; // 00:00–11:59 belongs to the *next* calendar day
  const dayMs = dayMeta.midnightUtc + (isOvernight ? 86400000 : 0);
  return new Date(dayMs + h * 3600000 + m * 60000);
}

function fmtCountdown(ms) {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h >= 1) return `${h}H ${m.toString().padStart(2, "0")}M`;
  return `${m} MIN`;
}

// ── NWS weather (free, keyless, browser-CORS-friendly) ──
// Caches forecast in localStorage for 1h so we don't hammer the API on
// every render. Returns the *next* daily period (e.g., "Tonight" or
// "Friday") with shortForecast + temperature + wind.
async function fetchEdcForecast() {
  try {
    const cacheKey = `forecast_${FESTIVAL_CONFIG.id}`;
    const cacheRaw = localStorage.getItem(cacheKey);
    if (cacheRaw) {
      const c = JSON.parse(cacheRaw);
      if (Date.now() - c.fetchedAt < 3600000) return c.data;
    }
    const points = await fetch(FESTIVAL_CONFIG.weatherEndpoint, {
      headers: { Accept: "application/geo+json" },
    }).then(r => r.ok ? r.json() : null);
    if (!points) return null;
    const forecast = await fetch(points.properties.forecast, {
      headers: { Accept: "application/geo+json" },
    }).then(r => r.ok ? r.json() : null);
    if (!forecast) return null;
    const data = forecast.properties.periods.slice(0, 6);
    localStorage.setItem(`forecast_${FESTIVAL_CONFIG.id}`, JSON.stringify({ fetchedAt: Date.now(), data }));
    return data;
  } catch { return null; }
}

function useNwsForecast() {
  const [result, setResult] = React.useState({ periods: null, fromCache: false, fetchedAt: null });
  React.useEffect(() => {
    let alive = true;
    // Check cache before fetching so we can surface the age
    const cacheKey = `forecast_${FESTIVAL_CONFIG.id}`;
    let fromCache = false, fetchedAt = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const c = JSON.parse(raw);
        if (Date.now() - c.fetchedAt < 3600000) { fromCache = true; fetchedAt = c.fetchedAt; }
      }
    } catch {}
    fetchEdcForecast().then(p => {
      if (!alive) return;
      // After fetch, re-read timestamp (may have been refreshed)
      if (!fromCache) {
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) fetchedAt = JSON.parse(raw).fetchedAt;
        } catch {}
      }
      setResult({ periods: p, fromCache, fetchedAt });
    });
    return () => { alive = false; };
  }, []);
  return result;
}

const _WEATHER_ALERT_RE = /thunderstorm|tornado|lightning|wind advisory|excessive heat|dust storm|flash flood|\bhail\b|severe weather/i;

function useWeatherAlert() {
  const [alert, setAlert] = React.useState(null);
  React.useEffect(() => {
    fetchEdcForecast().then(periods => {
      if (!periods) return;
      for (const p of periods) {
        const text = (p.shortForecast || "") + " " + (p.detailedForecast || "");
        const m = text.match(_WEATHER_ALERT_RE);
        if (m) { setAlert({ shortForecast: p.shortForecast, keyword: m[0] }); return; }
      }
    });
  }, []);
  return alert;
}

// Pre-festival: pick the period named "Friday" (opening day) or the next
// "Tonight". During-festival: use the upcoming period.
function pickRelevantPeriod(periods) {
  if (!periods?.length) return null;
  const now = Date.now();
  const future = periods.filter(p => new Date(p.endTime).getTime() > now);
  if (future.length) return future[0];
  return periods[0];
}

// Tonight info card — sunset/sunrise, weather, last-shuttle warning.
// Visible pre-festival (focused on opening day) and during-festival
// (focused on tonight).
function TonightCard({ state, setState }) {
  const { periods, fromCache, fetchedAt } = useNwsForecast();
  const period = pickRelevantPeriod(periods);
  const cacheAgeLabel = (() => {
    if (!fromCache || !fetchedAt) return null;
    const mins = Math.round((Date.now() - fetchedAt) / 60000);
    if (mins < 2) return null;
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
  })();
  const day = NOW.day; // 1, 2, or 3 during festival
  const sunTimes = FESTIVAL_CONFIG.sunTimes;
  const sun = sunTimes[day];
  const now = Date.now();
  const isPreEvent = now < FESTIVAL_START_MS;

  // Next sunrise & sunset to display
  const sunsetMs = festivalNightDate(day, sun.set).getTime();
  const sunriseMs = festivalNightDate(day, sun.rise).getTime();
  const nextSunsetMs = sunsetMs > now ? sunsetMs
    : (day < 3 ? festivalNightDate(day + 1, sunTimes[day + 1].set).getTime() : null);
  const nextSunriseMs = sunriseMs > now ? sunriseMs
    : (day < 3 ? festivalNightDate(day + 1, sunTimes[day + 1].rise).getTime() : null);

  // Last shuttle: only relevant in the wee hours after midnight on a
  // festival night.
  const lastShuttleMs = festivalNightDate(day, FESTIVAL_CONFIG.lastShuttleHHMM).getTime();
  const inShuttleWindow = !isPreEvent && now < lastShuttleMs && (lastShuttleMs - now) < 4 * 3600000;
  const shuttleMins = Math.floor((lastShuttleMs - now) / 60000);
  const shuttleUrgent = inShuttleWindow && shuttleMins < 60;

  const sunriseSet = nextSunriseMs ? fmtCountdown(nextSunriseMs - now) : null;
  const sunsetSet = nextSunsetMs ? fmtCountdown(nextSunsetMs - now) : null;

  // Find the artist playing at next sunrise (legendary "sunrise set")
  const sunriseArtistId = (() => {
    if (!nextSunriseMs) return null;
    const d = new Date(nextSunriseMs);
    const utcH = d.getUTCHours(), utcM = d.getUTCMinutes();
    const pdtH = (utcH + 24 - 7) % 24;
    const sunriseDay = (() => {
      const days = [festivalNightDate(1, sun.rise), festivalNightDate(2, sunTimes[2].rise), festivalNightDate(3, sunTimes[3].rise)];
      const idx = days.findIndex(x => Math.abs(x.getTime() - nextSunriseMs) < 60000);
      return idx + 1;
    })();
    const target = `${pdtH.toString().padStart(2, "0")}:${utcM.toString().padStart(2, "0")}`;
    return ARTISTS.find(a =>
      a.day === sunriseDay && a.stage === "kinetic"
      && toNightMin(a.start) <= toNightMin(target) && toNightMin(a.end) > toNightMin(target)
    );
  })();

  const card = (label, value, sub, accent) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.4, color: "rgba(247,237,224,0.55)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "Geist Mono, monospace", fontSize: 18, fontWeight: 600, color: accent || "var(--paper)", marginTop: 3, lineHeight: 1 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.1, color: "rgba(247,237,224,0.6)", marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{
      marginTop: 18,
      background: "var(--night)",
      borderRadius: 16,
      padding: "14px 16px 16px",
      color: "var(--paper)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Aurora glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(120% 60% at 80% 0%, rgba(245,154,54,0.18), transparent 55%), radial-gradient(80% 50% at 10% 110%, rgba(167,139,250,0.18), transparent 60%)",
        pointerEvents: "none",
      }}/>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "rgba(247,237,224,0.6)" }}>
            {isPreEvent ? "OPENING NIGHT" : `TONIGHT · DAY ${day}`}
          </div>
          {period && (
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "rgba(247,237,224,0.5)", display: "flex", alignItems: "center", gap: 5 }}>
              NWS · {period.name.toUpperCase()}
              {cacheAgeLabel && (
                <span style={{
                  background: "rgba(247,237,224,0.1)", border: "1px solid rgba(247,237,224,0.18)",
                  borderRadius: 4, padding: "1px 5px", fontSize: 7.5, letterSpacing: 1,
                }}>
                  CACHED · {cacheAgeLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {sunsetSet && card("SUNSET", sun.set, sunsetSet ? `IN ${sunsetSet}` : null, "var(--flare)")}
          {sunriseSet && card(
            "SUNRISE",
            sun.rise,
            sunriseArtistId ? `${sunriseArtistId.name.toUpperCase()} · KINETIC` : `IN ${sunriseSet}`,
            "#fbbf24"
          )}
          {period && card(
            "WEATHER",
            `${period.temperature}°${period.temperatureUnit}`,
            `${period.windSpeed} ${period.windDirection}`,
            "#a8d4ff"
          )}
        </div>

        {inShuttleWindow && (
          <button
            onClick={() => setState({ ...state, tab: "map" })}
            style={{
              marginTop: 14, width: "100%",
              background: shuttleUrgent ? "var(--ember)" : "rgba(247,237,224,0.08)",
              border: shuttleUrgent ? "none" : "1px solid rgba(247,237,224,0.2)",
              color: "var(--paper)",
              borderRadius: 10, padding: "10px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
              textAlign: "left",
            }}>
            <span>🚌  LAST SHUTTLE TO STRIP</span>
            <span style={{ color: shuttleUrgent ? "#fff" : "var(--flare)" }}>
              {shuttleMins > 0 ? `${shuttleMins} MIN` : "DEPARTED"}
            </span>
          </button>
        )}

        {!inShuttleWindow && sunriseArtistId && !isPreEvent && (
          <button
            onClick={() => setState({ ...state, tab: "home", artist: sunriseArtistId.id })}
            style={{
              marginTop: 14, width: "100%",
              background: "rgba(247,237,224,0.06)", border: "1px solid rgba(247,237,224,0.18)",
              color: "var(--paper)", borderRadius: 10, padding: "9px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
              textAlign: "left",
            }}>
            <span>🌅  SUNRISE SET · {sunriseArtistId.name.toUpperCase()}</span>
            <span style={{ color: "#fbbf24" }}>{sunriseSet}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function preEventCountdown() {
  const now = Date.now();
  if (now >= FESTIVAL_START_MS) return null;
  const diff = FESTIVAL_START_MS - now;
  return {
    days:  Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    mins:  Math.floor((diff / 60000) % 60),
    secs:  Math.floor((diff / 1000) % 60),
  };
}

// Bumps every 30s so countdown stays accurate without spamming renders
function useTick(intervalMs) {
  const [, setT] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setT(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// Walk-time lookup keyed by alphabetically-sorted stage-id pair.
// Midpoints of the lo/hi bands from map.jsx WALK_PAIRS. Fallback for
// any unlisted pair: ~0.4 min per SVG unit.
const _WALK_MIN = {
  "basspod,bionic":  13, "basspod,circuit": 8,  "basspod,cosmic":  11,
  "basspod,kinetic": 8,  "basspod,neon":    12, "basspod,quantum": 12,
  "basspod,stereo":  10, "basspod,waste":   8,  "bionic,circuit":  18,
  "bionic,cosmic":   8,  "bionic,kinetic":  9,  "bionic,neon":     15,
  "bionic,quantum":  12, "bionic,stereo":   6,  "bionic,waste":    9,
  "circuit,cosmic":  15, "circuit,kinetic": 20, "circuit,neon":    7,
  "circuit,quantum": 11, "circuit,stereo":  14, "circuit,waste":   12,
  "cosmic,kinetic":  13, "cosmic,neon":     16, "cosmic,quantum":  16,
  "cosmic,stereo":   8,  "cosmic,waste":    9,  "kinetic,neon":    12,
  "kinetic,quantum": 7,  "kinetic,stereo":  10, "kinetic,waste":   8,
  "neon,quantum":    9,  "neon,stereo":     12, "neon,waste":      15,
  "quantum,stereo":  9,  "quantum,waste":   16, "stereo,waste":    9,
};
function stageWalkMinutes(fromId, toId) {
  if (fromId === toId) return 0;
  const key = fromId < toId ? `${fromId},${toId}` : `${toId},${fromId}`;
  if (_WALK_MIN[key] != null) return _WALK_MIN[key];
  const a = STAGES.find(s => s.id === fromId), b = STAGES.find(s => s.id === toId);
  if (!a || !b) return 0;
  return Math.max(2, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 0.4));
}

// What's playing at every stage right now (uses current NOW.time)
function liveAcrossStages() {
  const now = toNightMin(NOW.time);
  return STAGES.map(s => {
    const live = ARTISTS.find(a => {
      if (a.stage !== s.id || a.day !== NOW.day) return false;
      const start = toNightMin(a.start), end = toNightMin(a.end);
      return now >= start && now < end;
    });
    return { stage: s, artist: live };
  });
}

// Build Tonight's Plan: saved sets sorted by start, with prev-stage walk
// times and "leave by" warnings when transitions would make you late.
function buildTonightsPlan(state) {
  const nowMin = toNightMin(NOW.time);
  const sets = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(a => a && a.day === NOW.day)
    .sort((x, y) => toNightMin(x.start) - toNightMin(y.start));

  return sets.map((a, i) => {
    const prev      = sets[i - 1];
    const walk      = prev ? stageWalkMinutes(prev.stage, a.stage) : 0;
    const startMin  = toNightMin(a.start);
    const endMin    = toNightMin(a.end);
    const minsUntil = startMin - nowMin;
    const isLive    = nowMin >= startMin && nowMin < endMin;
    const isPast    = nowMin >= endMin;
    const leaveBy   = walk > 0 ? startMin - walk : null;
    // Tight transition flag — only meaningful if previous set actually overlaps walk window
    const prevEnd   = prev ? toNightMin(prev.end) : null;
    const tight     = prev && walk > 0 && (startMin - prevEnd) < walk;
    const conflict  = prev && overlaps(prev, a);
    return { artist: a, prev, walk, minsUntil, isLive, isPast, leaveBy, tight, conflict };
  });
}

function HomeScreen({ state, setState }) {
  const [alertsOpen, setAlertsOpen] = React.useState(false);
  const [firstTimerOpen, setFirstTimerOpen] = React.useState(false);
  const [offline, setOffline] = React.useState(state.offline || false);
  const [weatherAlertDismissed, setWeatherAlertDismissed] = React.useState(false);
  const weatherAlert = useWeatherAlert();
  const unread = (state.alerts || ALERTS).filter(a => a.unread).length;
  // Pre-event newcomers haven't seen the first-timer guide yet — show a
  // prominent CTA card until they open it once. After that the small badge
  // in the alerts row keeps it discoverable without nagging.
  const ftSeen = (() => {
    try { return localStorage.getItem("ft_guide_seen") === "1"; }
    catch { return false; }
  })();
  const [ftDismissed, setFtDismissed] = React.useState(ftSeen);

  // Re-render every minute so the pre-event countdown stays accurate
  useTick(60000);
  const countdown = preEventCountdown();

  const current = ARTISTS.find(a => a.id === NOW.currentArtistId);
  const next    = ARTISTS.find(a => a.id === NOW.nextArtistId);
  const stageOf = id => STAGES.find(s => s.id === id);

  const totalMin = 90;
  const progress = NOW.elapsedMin / totalMin;
  const minsLeft = totalMin - NOW.elapsedMin;

  // Up Next countdown derived from clock — was hardcoded "48 MIN"
  const upNextMin = Math.max(0, toNightMin(next.start) - toNightMin(NOW.time));
  const tonight   = buildTonightsPlan(state);
  const liveStrip = liveAcrossStages();

  return (
    <Screen bg="var(--paper)">
      {/* Masthead */}
      <div style={{
        padding: "8px 20px 14px",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wordmark size={16} />
            <FestivalChip compact />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setOffline(o => !o)} title="Offline mode" style={{
              display: "flex", alignItems: "center", gap: 4,
              background: offline ? "var(--ink)" : "transparent",
              color: offline ? "var(--paper)" : "var(--muted)",
              border: offline ? "none" : "1px solid var(--line-2)",
              borderRadius: 999, padding: "3px 8px",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
              cursor: "pointer",
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                {offline
                  ? <><path d="M4 4 L20 20"/><path d="M2 8 Q6 4 10 4.5 M22 8 Q18 4 14 4.5"/><path d="M6 12 Q12 7 18 12" opacity="0.5"/></>
                  : <><path d="M2 8 Q12 -2 22 8"/><path d="M5 12 Q12 5 19 12"/><path d="M8 16 Q12 12 16 16"/><circle cx="12" cy="19.5" r="0.8" fill="currentColor"/></>
                }
              </svg>
              {offline ? "OFF" : "LIVE"}
            </button>
            <button onClick={() => setAlertsOpen(true)} style={{
              position: "relative", background: "transparent", border: "none",
              padding: 4, cursor: "pointer", color: "var(--ink)",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9 C6 5.5 8.5 3 12 3 C15.5 3 18 5.5 18 9 L18 13 L20 16 L4 16 L6 13 Z"/>
                <path d="M10 19 Q12 21 14 19"/>
              </svg>
              {unread > 0 && (
                <span style={{
                  position: "absolute", top: 2, right: 2,
                  width: 8, height: 8, borderRadius: 8,
                  background: "var(--ember)", border: "1.5px solid var(--paper)",
                }}/>
              )}
            </button>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              DAY {NOW.day} · {NOW.time}
            </div>
          </div>
        </div>
        {countdown ? (
          <>
            <div className="serif" style={{ fontSize: 36, lineHeight: 0.95, letterSpacing: -0.5 }}>
              Under the <span style={{ fontStyle: "italic", color: "var(--ember)" }}>electric sky</span> in
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10 }}>
              <CountdownPart n={countdown.days}  label="DAYS" />
              <CountdownPart n={countdown.hours} label="HRS" />
              <CountdownPart n={countdown.mins}  label="MIN" />
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: "var(--muted)", marginTop: 8 }}>
              {FESTIVAL_CONFIG.locationShort.toUpperCase()} · {FESTIVAL_CONFIG.dates.toUpperCase()}
            </div>
          </>
        ) : (
          <>
            <div className="serif" style={{ fontSize: 36, lineHeight: 0.95, letterSpacing: -0.5 }}>
              {FESTIVAL_CONFIG.dayDates[NOW.day]?.name || "Day " + NOW.day} at <span style={{ fontStyle: "italic", color: "var(--ember)" }}>{FESTIVAL_CONFIG.brand}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: "var(--muted)", marginTop: 6 }}>
              {FESTIVAL_CONFIG.locationShort.toUpperCase()} · {FESTIVAL_CONFIG.dates.toUpperCase()}
            </div>
          </>
        )}
      </div>

      <InstallBanner />

      {/* First-timer guide is still available, but tucked behind a small
          link rather than a hero CTA — the app's default voice is for vets,
          not newcomers. The link sits next to the countdown so it's
          discoverable without dominating the screen. */}
      {countdown && !ftDismissed && (
        <div style={{ padding: "10px 20px 0" }}>
          <button onClick={() => setFirstTimerOpen(true)} style={{
            background: "transparent", border: "1px solid var(--line-2)",
            borderRadius: 999, padding: "5px 10px",
            color: "var(--muted)", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.3, fontWeight: 600,
          }}>
            FIRST EDC? READ THE BASICS →
          </button>
        </div>
      )}

      <ScrollBody style={{ padding: "16px 16px 24px" }}>
        {/* Weather alert banner */}
        {weatherAlert && !weatherAlertDismissed && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)",
            borderRadius: 14, padding: "12px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "#fbbf24", fontWeight: 700, marginBottom: 3 }}>
                NWS WEATHER ALERT
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>
                {weatherAlert.shortForecast} — check the weather card below for details.
              </div>
            </div>
            <button onClick={() => setWeatherAlertDismissed(true)} style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0,
            }}>×</button>
          </div>
        )}

        {/* Live festival sections — hidden pre-event */}
        {!countdown && (
          <>
            {/* NOW PLAYING hero card */}
            <div style={{
              background: current.img,
              borderRadius: 22,
              padding: 18,
              color: "#fff",
              position: "relative",
              overflow: "hidden",
              marginBottom: 14,
            }}>
              {/* Grain / vignette */}
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.18), transparent 60%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.35) 100%)",
                pointerEvents: "none",
              }} />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 7, background: "#fff",
                    boxShadow: "0 0 0 4px rgba(255,255,255,0.25)",
                    animation: "pulse 1.6s ease-in-out infinite",
                  }} />
                  <span className="mono" style={{ fontSize: 10, letterSpacing: 2, fontWeight: 600 }}>
                    NOW PLAYING · {stageOf(current.stage).name.toUpperCase()}
                  </span>
                </div>

                <div className="serif" style={{ fontSize: 38, lineHeight: 0.96, letterSpacing: -0.5, marginBottom: 4 }}>
                  {current.name}
                </div>
                <div className="mono" style={{ fontSize: 11, letterSpacing: 1.4, opacity: 0.85, marginBottom: 22 }}>
                  {current.genre.toUpperCase()} · {current.start}–{current.end}
                </div>

                {/* Progress */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: "#fff" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, opacity: 0.8 }}>
                    {NOW.elapsedMin} MIN IN
                  </span>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, opacity: 0.8 }}>
                    {minsLeft} MIN LEFT
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={() => setState({ ...state, tab: "map", focusStage: current.stage })}
                    style={homeBtn("solid")}>
                    Navigate to stage
                  </button>
                  <button onClick={() => setState({ ...state, tab: "home", artist: current.id })}
                    style={homeBtn("ghost")}>
                    Details
                  </button>
                </div>
              </div>
            </div>

            {/* UP NEXT strip */}
            <div style={{
              background: "var(--paper-2)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              padding: 14,
              marginBottom: 18,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <ArtistSwatch artist={next} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "var(--muted)" }}>
                  UP NEXT · {upNextMin > 0 ? `IN ${upNextMin} MIN` : "STARTING"}
                </div>
                <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, marginTop: 2 }}>
                  {next.name}
                </div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                  {stageOf(next.stage).name.toUpperCase()} · {next.start}
                </div>
              </div>
              <button onClick={() => setState({ ...state, tab: "home", artist: next.id })} style={{
                background: "var(--ink)", color: "var(--paper)", border: "none",
                borderRadius: 999, padding: "8px 12px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 500,
              }}>OPEN</button>
            </div>

            {/* LIVE ACROSS STAGES — what's on right now at every stage */}
            <LiveAcrossStrip strip={liveStrip} setState={setState} state={state} />

            {/* TONIGHT'S PLAN — chronological saved sets with walking ETAs + leave-by */}
            <TonightsPlan plan={tonight} setState={setState} state={state} />
          </>
        )}

        {/* Tonight: sunrise/sunset · weather · last-shuttle countdown */}
        <TonightCard state={state} setState={setState} />

        {/* Don't-miss strip — auto-detected legendary moments (sunrise sets
            + B2B collabs) for the relevant day. Vets came for THESE, so they
            sit prominently between the night card and the artist gossip. */}
        <DontMissStrip day={countdown ? 1 : NOW.day} state={state} setState={setState} />
      </ScrollBody>

      {/* Offline banner */}
      {offline && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          background: "var(--ink)", color: "var(--paper)",
          padding: "6px 20px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          zIndex: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4 L20 20"/><circle cx="12" cy="18" r="1" fill="currentColor"/>
          </svg>
          <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, fontWeight: 600 }}>
            OFFLINE · LAST SYNC 10:41 PM · LINEUP & MAP AVAILABLE
          </span>
        </div>
      )}

      {/* Alerts drawer */}
      {alertsOpen && (
        <AlertsDrawer alerts={state.alerts || ALERTS} onClose={() => {
          setAlertsOpen(false);
          // mark read
          setState({ ...state, alerts: (state.alerts || ALERTS).map(a => ({ ...a, unread: false })) });
        }} onOpenMap={() => { setAlertsOpen(false); setState({ ...state, tab: "map" }); }}
          onOpenLineup={() => { setAlertsOpen(false); setState({ ...state, tab: "lineup" }); }}
        />
      )}

      {/* First-timer guide drawer — bundles gate hours, bag policy, lingo,
          survival tips, and a recommended day-1 plan in one scrollable sheet. */}
      {firstTimerOpen && (
        <FirstTimerGuide onClose={() => {
          setFirstTimerOpen(false);
          setFtDismissed(true);
          try { localStorage.setItem("ft_guide_seen", "1"); } catch {}
        }}
        onOpenMap={() => { setFirstTimerOpen(false); setState({ ...state, tab: "map" }); }}
        onOpenLineup={() => { setFirstTimerOpen(false); setState({ ...state, tab: "lineup" }); }}
        />
      )}
    </Screen>
  );
}

function LiveAcrossStrip({ strip, state, setState }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", fontWeight: 600 }}>
          LIVE ACROSS STAGES
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ember)" }}>
          {strip.filter(s => s.artist).length}/{strip.length} ON
        </span>
      </div>
      <div className="no-scrollbar" style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", marginRight: -16, paddingRight: 16 }}>
        {strip.map(({ stage, artist }) => (
          <button
            key={stage.id}
            onClick={() => artist
              ? setState({ ...state, tab: "home", artist: artist.id })
              : setState({ ...state, tab: "map", focusStage: stage.id })}
            style={{
              flexShrink: 0, width: 132, textAlign: "left",
              padding: "9px 11px", borderRadius: 13,
              background: artist ? "var(--paper-2)" : "transparent",
              border: `1px solid ${artist ? "var(--line)" : "var(--line-2)"}`,
              borderLeft: `3px solid ${stage.color}`,
              cursor: "pointer",
              opacity: artist ? 1 : 0.55,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {artist && (
                <span style={{
                  width: 6, height: 6, borderRadius: 6, background: stage.color,
                  boxShadow: `0 0 0 3px ${stage.color}33`,
                  animation: "pulse 1.6s ease-in-out infinite",
                  flexShrink: 0,
                }}/>
              )}
              <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: stage.color, fontWeight: 700 }}>
                {stage.short}
              </span>
            </div>
            <div className="serif" style={{
              fontSize: 14, lineHeight: 1.1, marginTop: 4,
              color: artist ? "var(--ink)" : "var(--muted)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {artist ? artist.name : "Stage dark"}
            </div>
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
              {artist ? `${artist.start}–${artist.end}` : stage.name.toUpperCase()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TonightsPlan({ plan, state, setState }) {
  const tightCount = plan.filter(p => p.tight || p.conflict).length;
  const conflicts = plan.filter(p => p.conflict).map(p => [p.prev, p.artist]);
  const [resolverOpen, setResolverOpen] = React.useState(false);
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="serif" style={{ fontSize: 24, letterSpacing: -0.3 }}>
          Tonight's <span style={{ fontStyle: "italic" }}>plan</span>
        </div>
        <button onClick={() => setState({ ...state, tab: "lineup" })} className="mono" style={{
          background: "none", border: "none", fontSize: 10, letterSpacing: 1.2,
          color: "var(--muted)", cursor: "pointer", textTransform: "uppercase",
        }}>All →</button>
      </div>

      {plan.length === 0 ? (
        <div style={{
          border: "1px dashed var(--line-2)", borderRadius: 14, padding: "20px 16px",
          textAlign: "center",
        }}>
          <div className="serif" style={{ fontSize: 18, color: "var(--muted)", fontStyle: "italic" }}>
            No sets saved for tonight
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 6 }}>
            TAP + ON ANY ARTIST TO ADD
          </div>
        </div>
      ) : (
        <>
          {tightCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 10px", marginBottom: 10,
              background: "rgba(232,93,46,0.07)", borderRadius: 8,
              border: "1px solid rgba(232,93,46,0.2)",
            }}>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: "var(--ember)" }}>
                ⚠ {tightCount} TIGHT TRANSITION{tightCount > 1 ? "S" : ""} · CHECK LEAVE-BY TIMES
              </span>
              {conflicts.length > 0 && (
                <button onClick={() => setResolverOpen(r => !r)} style={{
                  background: resolverOpen ? "transparent" : "var(--ember)",
                  color: resolverOpen ? "var(--ember)" : "#fff",
                  border: resolverOpen ? "1px solid var(--ember)" : "none",
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                }}>
                  {resolverOpen ? "CLOSE ×" : "RESOLVE →"}
                </button>
              )}
            </div>
          )}
          {resolverOpen && conflicts.length > 0 && (
            <div style={{ margin: "0 -4px 10px" }}>
              <ConflictResolver
                conflicts={conflicts}
                onKeep={(keepId, dropId) => {
                  setState({ ...state, saved: state.saved.filter(id => id !== dropId) });
                  setResolverOpen(false);
                }}
                onSplit={() => setResolverOpen(false)}
              />
            </div>
          )}
          {plan.map(p => <PlanRow key={p.artist.id} entry={p} state={state} setState={setState} />)}
        </>
      )}
    </>
  );
}

function PlanRow({ entry, state, setState }) {
  const { artist: a, prev, walk, minsUntil, isLive, isPast, leaveBy, tight, conflict } = entry;
  const stage = STAGES.find(s => s.id === a.stage);
  const leaveByLabel = leaveBy != null ? (() => {
    const m = ((leaveBy % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  })() : null;

  return (
    <div>
      {/* Walking transition pill from previous set */}
      {prev && walk > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 0 4px 56px", marginBottom: 2,
        }}>
          <div style={{ width: 1, height: 18, background: tight ? "var(--ember)" : "var(--line-2)" }}/>
          <span className="mono" style={{
            fontSize: 9, letterSpacing: 1.2,
            color: tight ? "var(--ember)" : "var(--muted)",
            fontWeight: tight ? 700 : 500,
          }}>
            {walk} MIN WALK · {prev.stage === a.stage ? "SAME STAGE" : `${STAGES.find(s=>s.id===prev.stage).short} → ${stage.short}`}
            {tight && leaveByLabel && ` · LEAVE BY ${leaveByLabel}`}
          </span>
        </div>
      )}

      {/* The set row */}
      <div onClick={() => setState({ ...state, tab: "home", artist: a.id })}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 4px",
          borderBottom: "1px solid var(--line)",
          cursor: "pointer",
          opacity: isPast ? 0.45 : 1,
          background: conflict ? "rgba(232,93,46,0.04)" : "transparent",
        }}>
        <div style={{ width: 44 }}>
          <div className="mono" style={{
            fontSize: 11, letterSpacing: 1,
            color: isLive ? stage.color : "var(--ink)",
            fontWeight: isLive ? 700 : 500,
          }}>{a.start}</div>
          <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)" }}>
            {isLive ? "LIVE" : isPast ? "DONE" : minsUntil < 60 ? `${minsUntil}m` : `${Math.floor(minsUntil/60)}h${(minsUntil%60).toString().padStart(2,"0")}`}
          </div>
        </div>
        <div style={{ width: 3, alignSelf: "stretch", background: stage.color, borderRadius: 3 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="serif" style={{ fontSize: 20, lineHeight: 1.1, textDecoration: isPast ? "line-through" : "none" }}>{a.name}</div>
            {isLive && (
              <span className="mono" style={{
                fontSize: 8, letterSpacing: 1.3, color: "#fff", background: stage.color,
                padding: "1px 5px", borderRadius: 3, fontWeight: 700,
              }}>LIVE</span>
            )}
            {conflict && (
              <span className="mono" style={{
                fontSize: 8, letterSpacing: 1.3, color: "var(--ember)",
                padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                border: "1px solid var(--ember)",
              }}>CLASH</span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>
            {stage.name.toUpperCase()} · {a.genre.toUpperCase()}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M9 6 L15 12 L9 18" />
        </svg>
      </div>
    </div>
  );
}

function CountdownPart({ n, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div className="serif" style={{
        fontSize: 56, lineHeight: 0.92, letterSpacing: -1.5,
        color: "var(--ink)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {String(n).padStart(2, "0")}
      </div>
      <div className="mono" style={{
        fontSize: 9, letterSpacing: 1.5, color: "var(--muted)",
        marginTop: 2, fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}

function homeBtn(kind) {
  const base = {
    border: "none", cursor: "pointer",
    borderRadius: 999, padding: "11px 16px",
    fontFamily: "Geist Mono, monospace",
    fontSize: 11, letterSpacing: 1.2, fontWeight: 500,
    textTransform: "uppercase",
  };
  if (kind === "solid")  return { ...base, background: "#fff", color: "var(--ink)" };
  if (kind === "ghost")  return { ...base, background: "rgba(255,255,255,0.15)", color: "#fff", backdropFilter: "blur(6px)" };
  return base;
}

function AlertsDrawer({ alerts, onClose, onOpenMap, onOpenLineup }) {
  const iconFor = (k) => {
    const c = { reminder: "var(--flare)", friend: "var(--ember)", safety: "var(--horizon)", conflict: "var(--ember)", drop: "var(--success)" }[k] || "var(--ink)";
    return c;
  };
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 9, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }}/>
      <div style={{
        marginTop: "auto", background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        maxHeight: "78%", display: "flex", flexDirection: "column",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.35)", position: "relative",
      }}>
        <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "var(--muted)" }}>LIVE FEED</div>
            <div className="serif" style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>Alerts</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--line-2)", borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2 }}>CLOSE</button>
        </div>
        <div style={{ overflowY: "auto", padding: "6px 14px 18px" }}>
          {alerts.map(a => {
            const onClick = a.kind === "conflict" ? onOpenLineup : a.kind === "friend" ? onOpenMap : null;
            return (
              <div key={a.id} onClick={onClick} style={{
                display: "flex", gap: 12, padding: "12px 6px",
                borderBottom: "1px solid var(--line)",
                cursor: onClick ? "pointer" : "default",
                opacity: a.unread ? 1 : 0.7,
              }}>
                <div style={{ width: 6, borderRadius: 6, background: iconFor(a.kind), flexShrink: 0, alignSelf: "stretch", opacity: a.unread ? 1 : 0.4 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div className="serif" style={{ fontSize: 16, lineHeight: 1.15 }}>{a.title}</div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: 1, color: "var(--muted)", whiteSpace: "nowrap" }}>{a.time}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.35 }}>{a.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Don't-miss strip ───────────────────────────────────────────────
// Surfaces auto-detected legendary moments (sunrise sets, B2B collabs)
// for the given festival day. Same isLegendary logic as lineup.jsx so
// vets see the same callouts whether they're browsing or skimming home.
function DontMissStrip({ day, state, setState }) {
  const moments = React.useMemo(() => {
    return ARTISTS
      .filter(a => a.day === day && (typeof isLegendary === "function" ? isLegendary(a) : false))
      .sort((a, b) => toNightMin(a.start) - toNightMin(b.start))
      .slice(0, 6);
  }, [day]);
  if (!moments.length) return null;
  const dayMeta = FESTIVAL_CONFIG.dayDates[day];
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="serif" style={{ fontSize: 22 }}>
          Don't <span style={{ fontStyle: "italic", color: "#fbbf24" }}>miss</span>
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)" }}>
          {dayMeta?.name?.toUpperCase() || `DAY ${day}`} · LEGENDARY
        </span>
      </div>
      <div className="no-scrollbar" style={{
        display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none",
        marginRight: -16, paddingRight: 16,
      }}>
        {moments.map(a => {
          const stage = STAGES.find(s => s.id === a.stage);
          const isSunrise = stage?.id === "kinetic" && parseInt(a.end) >= 5 && parseInt(a.end) < 6;
          return (
            <button key={a.id} onClick={() => setState({ ...state, tab: "home", artist: a.id })} style={{
              flexShrink: 0, width: 168, padding: "10px 11px", textAlign: "left",
              borderRadius: 14, border: "1px solid rgba(251,191,36,0.45)",
              background: "linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(232,93,46,0.06) 100%)",
              cursor: "pointer",
            }}>
              <div className="mono" style={{ fontSize: 8, letterSpacing: 1.4, color: "#b8651b", fontWeight: 800 }}>
                {isSunrise ? "🌅 SUNRISE SET" : "★ B2B COLLAB"}
              </div>
              <div className="serif" style={{
                fontSize: 16, lineHeight: 1.1, marginTop: 5,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{a.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 4, textTransform: "uppercase" }}>
                {stage?.short || ""} · {a.start}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── First-timer guide ──────────────────────────────────────────────
// Concise sections covering the things a Plursky-newcomer needs before they
// arrive at LVMS. Sourced from the official EDC Festival Guide (gates, bag
// policy, sunrise sets) and harm-reduction guidance from DanceSafe.
const FT_SECTIONS = [
  {
    id: "gates",
    icon: "🚪",
    title: "Gates & entry",
    items: [
      "Gates open 4 PM Friday-Sunday. Music runs 7 PM – 5:30 AM.",
      "Bring a valid government-issued photo ID. 18+ event.",
      "Wristband activates online before you arrive — don't show up with it un-paired.",
      "One re-entry per day, only between 4 PM and midnight.",
      "Clear bag, max 12\" × 6\" × 12\". Hydration packs OK if empty.",
    ],
  },
  {
    id: "lingo",
    icon: "🗣️",
    title: "Words you'll hear",
    items: [
      "PLUR — Peace, Love, Unity, Respect. The unspoken code.",
      "Kandi — beaded bracelets. Trade them with strangers.",
      "Totem — tall flag/sign so your group can find you in the crowd.",
      "Sunrise set — the legendary final set as the sun comes up at Kinetic Field.",
      "Headliner — top-billed act, usually 11 PM – 5 AM at the biggest stages.",
      "B2B — back-to-back DJ set; two artists trading on the decks.",
    ],
  },
  {
    id: "survive",
    icon: "💧",
    title: "Survive the desert",
    items: [
      "Drink water before you're thirsty. Free refill stations all over the map (tap the 💧 chip).",
      "Days are warm (~70°F), nights are cold (~50°F). Bring a light jacket.",
      "Earplugs. Your future self will thank you.",
      "Eat real food before headliners. The food halls in Daisy Lane stay open all night.",
      "If you or a friend feels off, the Ground Control & GroundedSpace tents are no-questions-asked safe spaces.",
    ],
  },
  {
    id: "travel",
    icon: "🚌",
    title: "Getting there & back",
    items: [
      "Shuttles run from Strip hotels all night. Last departure ~5:30 AM.",
      "Driving: lots fill 6–8 PM, exiting at 5 AM is a 90-min crawl.",
      "Rideshare: Uber/Lyft pickup is the South Lot — tap the 🚗 button on the map for one-tap deep links.",
      "Phone signal at the venue is unreliable. Set a meeting point with your group BEFORE entering.",
    ],
  },
  {
    id: "day1",
    icon: "🌅",
    title: "Recommended Day 1",
    items: [
      "Arrive by 7 PM. Walk the perimeter once to find your bearings — it's huge.",
      "Hit Kinetic Field for the opening; the stage drop at sundown is the moment.",
      "Anchor for one full headliner set, then wander. Don't try to chase 12 sets.",
      "Eat at midnight. Sleep is for after the sunrise set.",
      "End at Cosmic Meadow, Stereo Bloom, or stay at Kinetic for the sunrise.",
    ],
  },
];

function FirstTimerGuide({ onClose, onOpenMap, onOpenLineup }) {
  const [openIdx, setOpenIdx] = React.useState(0); // first section open by default
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 9, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}/>
      <div style={{
        marginTop: "auto", background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        maxHeight: "85%", display: "flex", flexDirection: "column",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.4)", position: "relative",
      }}>
        <div style={{
          padding: "14px 18px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--line)",
          background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "var(--ember)", fontWeight: 700 }}>
              FIRST TIME AT EDC
            </div>
            <div className="serif" style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>
              The basics
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--line-2)",
            borderRadius: 999, padding: "6px 12px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
          }}>CLOSE</button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 14px 18px" }}>
          {FT_SECTIONS.map((s, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={s.id} style={{
                marginTop: 8, background: "var(--paper)",
                border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden",
              }}>
                <button onClick={() => setOpenIdx(isOpen ? -1 : i)} style={{
                  width: "100%", padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 12,
                  background: isOpen ? "var(--paper-2)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <span className="serif" style={{ flex: 1, fontSize: 17, lineHeight: 1 }}>{s.title}</span>
                  <span className="mono" style={{
                    fontSize: 10, color: "var(--muted)", fontWeight: 700,
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}>›</span>
                </button>
                {isOpen && (
                  <ul style={{
                    listStyle: "none", margin: 0, padding: "4px 14px 14px 50px",
                  }}>
                    {s.items.map((it, k) => (
                      <li key={k} style={{
                        position: "relative", marginTop: 8,
                        fontSize: 13, lineHeight: 1.4, color: "var(--ink)",
                      }}>
                        <span style={{
                          position: "absolute", left: -14, top: 6,
                          width: 5, height: 5, borderRadius: 5,
                          background: "var(--ember)",
                        }}/>
                        {it}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Quick-jump CTAs */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={onOpenMap} style={{
              flex: 1, padding: "10px 12px",
              background: "var(--ink)", color: "var(--paper)",
              border: "none", borderRadius: 10, cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            }}>EXPLORE MAP</button>
            <button onClick={onOpenLineup} style={{
              flex: 1, padding: "10px 12px",
              background: "var(--paper)", color: "var(--ink)",
              border: "1px solid var(--line-2)", borderRadius: 10, cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
            }}>BROWSE LINEUP</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen });