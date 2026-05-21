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
    // When stage is dark, find the next artist starting on this stage today
    const upcoming = !live ? ARTISTS
      .filter(a => a.stage === s.id && a.day === NOW.day && toNightMin(a.start) > now)
      .sort((a, b) => toNightMin(a.start) - toNightMin(b.start))[0] || null
      : null;
    const minsUntil = upcoming ? toNightMin(upcoming.start) - now : null;
    return { stage: s, artist: live, upcoming, minsUntil };
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

// Compute live alerts from the user's saved sets for the current festival day.
// Returns upcoming-set reminders (≤30 min away) and overlap conflicts.
// Falls back to the static ALERTS demo when nothing is saved or pre-event.
function computeAlerts(savedIds, day, timeStr) {
  if (!savedIds?.length) return [];
  const nowMin = toNightMin(timeStr);
  const todaySaved = ARTISTS
    .filter(a => a.day === day && savedIds.includes(a.id))
    .sort((a, b) => toNightMin(a.start) - toNightMin(b.start));
  const out = [];

  for (const a of todaySaved) {
    const s = toNightMin(a.start);
    const minsAway = s - nowMin;
    if (minsAway > 0 && minsAway <= 30) {
      const stage = STAGES.find(st => st.id === a.stage);
      out.push({
        id: `remind_${a.id}`, kind: "reminder",
        title: `${a.name} in ${minsAway} min`,
        body: `${stage?.name || a.stage} · ${fmt12(a.start)}`,
        time: timeStr, unread: true,
      });
    }
  }

  for (let i = 0; i < todaySaved.length - 1; i++) {
    const a = todaySaved[i], b = todaySaved[i + 1];
    if (overlaps(a, b)) {
      out.push({
        id: `conflict_${a.id}_${b.id}`, kind: "conflict",
        title: "Schedule conflict",
        body: `${a.name} and ${b.name} overlap at ${b.start}.`,
        time: timeStr, unread: true,
      });
    }
  }

  return out;
}

function PostFestivalRecap({ state, setState }) {
  const savedIds = state.saved || [];
  const byDay = [1, 2, 3].map(day => ({
    day,
    meta: FESTIVAL_CONFIG.dayDates[day],
    artists: ARTISTS.filter(a => a.day === day && savedIds.includes(a.id))
      .sort((a, b) => toNightMin(a.start) - toNightMin(b.start)),
  })).filter(d => d.artists.length);

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #1a0a2e 0%, #0d1b2a 60%, #0a1628 100%)",
        borderRadius: 22, padding: "28px 22px 24px", marginBottom: 14,
        color: "#fff", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,100,30,0.18), transparent 70%)",
          pointerEvents: "none",
        }}/>
        <div style={{ position: "relative" }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
            {FESTIVAL_CONFIG.name.toUpperCase()} · {FESTIVAL_CONFIG.dates.toUpperCase()}
          </div>
          <div className="serif" style={{ fontSize: 34, lineHeight: 0.95, letterSpacing: -0.5, marginBottom: 6 }}>
            That was{" "}
            <span style={{ fontStyle: "italic", color: "var(--ember)" }}>electric.</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 12, lineHeight: 1.5 }}>
            {savedIds.length
              ? `You saved ${savedIds.length} set${savedIds.length !== 1 ? "s" : ""} across ${byDay.length} night${byDay.length !== 1 ? "s" : ""}. See you under the electric sky next year.`
              : "The festival is over. See you under the electric sky next year."}
          </div>
        </div>
      </div>

      {/* Saved sets recap grouped by day */}
      {byDay.length > 0 && (
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 18, padding: "16px 16px 8px", marginBottom: 14,
        }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", fontWeight: 600, marginBottom: 14 }}>
            YOUR SAVED SETS
          </div>
          {byDay.map(({ day, meta, artists }) => (
            <div key={day} style={{ marginBottom: 14 }}>
              <div className="mono" style={{
                fontSize: 8.5, letterSpacing: 1.8, color: "var(--ember)",
                fontWeight: 700, marginBottom: 8,
              }}>
                {meta.short} · {meta.name.toUpperCase()}
              </div>
              {artists.map(a => {
                const stage = STAGES.find(s => s.id === a.stage);
                return (
                  <button key={a.id}
                    onClick={() => setState({ ...state, tab: "home", artist: a.id })}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)",
                      padding: "8px 0", cursor: "pointer", textAlign: "left",
                    }}>
                    <ArtistSwatch artist={a} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="serif" style={{ fontSize: 16, lineHeight: 1.1, color: "var(--ink)" }}>
                        {a.name}
                      </div>
                      <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 1 }}>
                        {stage ? stage.short : ""} · {fmt12(a.start)}–{fmt12(a.end)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {savedIds.length === 0 && (
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--line)",
          borderRadius: 18, padding: 20, textAlign: "center", marginBottom: 14,
        }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)" }}>
            NO SAVED SETS — NEXT YEAR, START PLANNING EARLY
          </div>
        </div>
      )}
    </div>
  );
}

// ── Day-strip segmented control ────────────────────────────────────
// Apple Sports–style "YESTERDAY · TODAY · UPCOMING" pill at the top of
// the Home tab. Single ember-active segment, mono caps. Sub-tab state
// lives on the HomeScreen, not in `state.tab` (which still routes the
// app's main 4 tabs).
function DayStrip({ value, onChange, hasYesterday, hasUpcoming }) {
  const tabs = [
    { id: "yesterday", label: "YESTERDAY", enabled: hasYesterday },
    { id: "today",     label: "TODAY",     enabled: true },
    { id: "upcoming",  label: "UPCOMING",  enabled: hasUpcoming },
  ];
  return (
    <div style={{
      display: "flex", gap: 0,
      background: "var(--paper-2)", border: "1px solid var(--line)",
      borderRadius: 999, padding: 3,
    }}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => t.enabled && onChange(t.id)}
            disabled={!t.enabled}
            className="mono"
            style={{
              flex: 1, padding: "8px 6px",
              background: active ? "var(--ember)" : "transparent",
              color: active ? "#fff" : (t.enabled ? "var(--muted)" : "rgba(26,18,13,0.25)"),
              border: "none", borderRadius: 999,
              cursor: t.enabled ? "pointer" : "default",
              fontFamily: "Geist Mono, monospace",
              fontSize: 9.5, letterSpacing: 1.3, fontWeight: 700,
              transition: "background 0.15s, color 0.15s",
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── F1-style "Tonight" hero ────────────────────────────────────────
// Full-bleed hero card at the top of the TODAY tab. Four phases:
//   1. Pre-festival (countdown still running)  — Round-style date strip
//   2. During-festival, before first set       — "Doors in Xh Ym" + headliner
//   3. During-festival, mid-night              — "● LIVE · Now at <stage>"
//   4. Post-festival                           — caller renders PostFestivalRecap
// Accent = stage colour of the relevant artist (mainstage red as fallback).
function F1TonightHero({ state, setState }) {
  const now = Date.now();
  const isPreEvent  = now < FESTIVAL_START_MS;
  const isPostEvent = now > FESTIVAL_END_MS;
  const day = NOW.day;
  const dayMeta = FESTIVAL_CONFIG.dayDates[day];
  const savedIds = state.saved || [];

  // The currently-live artist (anywhere on grounds), preferring mainstage.
  const live = (() => {
    if (isPreEvent || isPostEvent) return null;
    const nowMin = toNightMin(NOW.time);
    const allLive = ARTISTS.filter(a => {
      if (a.day !== day) return false;
      return nowMin >= toNightMin(a.start) && nowMin < toNightMin(a.end);
    });
    return allLive.find(a => a.stage === FESTIVAL_CONFIG.mainStageId)
      || [...allLive].sort((a, b) => (b.tier || 0) - (a.tier || 0))[0]
      || null;
  })();

  // Headliner pick: highest-tier saved set tonight, else highest-tier scheduled artist of the day.
  const headliner = (() => {
    const savedTonight = ARTISTS
      .filter(a => a.day === day && savedIds.includes(a.id))
      .sort((a, b) => (b.tier || 0) - (a.tier || 0)
        || (toNightMin(b.end) - toNightMin(b.start)) - (toNightMin(a.end) - toNightMin(a.start)));
    if (savedTonight.length) return savedTonight[0];
    return [...ARTISTS]
      .filter(a => a.day === day)
      .sort((a, b) => (b.tier || 0) - (a.tier || 0))[0] || null;
  })();

  const featured = live || headliner;
  const stage = featured ? STAGES.find(s => s.id === featured.stage) : null;
  const accent = stage?.color || "var(--ember)";
  const photo  = useArtistPhoto(featured?.name || "");

  // Pre-event countdown delta to "doors" (festival start)
  const preCountdown = isPreEvent ? FESTIVAL_START_MS - now : null;
  const preLabel = preCountdown != null ? fmtCountdown(preCountdown) : null;
  const preDays  = preCountdown != null ? Math.floor(preCountdown / 86400000) : null;

  // Tonight-but-pre-doors: first set of day hasn't started yet
  const firstSetMs = dayMeta && !isPreEvent && !isPostEvent
    ? (() => {
        const todays = ARTISTS.filter(a => a.day === day)
          .sort((x, y) => toNightMin(x.start) - toNightMin(y.start));
        const first = todays[0];
        if (!first) return null;
        return festivalNightDate(day, first.start).getTime();
      })()
    : null;
  const beforeFirstSet = !isPreEvent && !isPostEvent && firstSetMs && now < firstSetMs;
  const doorsLabel = beforeFirstSet ? fmtCountdown(firstSetMs - now) : null;

  // Phase enum — caller already handles post-festival via PostFestivalRecap.
  const phase = isPreEvent ? "pre" : live ? "live" : beforeFirstSet ? "doors" : "between";

  return (
    <div style={{
      background: "linear-gradient(160deg, var(--ink) 0%, #2a1a1f 60%, var(--ink) 100%)",
      borderRadius: 16, padding: 0, marginBottom: 18,
      color: "#fff", position: "relative", overflow: "hidden",
      border: `1px solid ${accent}55`,
    }}>
      {/* Accent stripe along the top edge — F1 brand-bar feel */}
      <div style={{ height: 4, background: accent }}/>

      {/* Background photo if we have one, with vignette */}
      {phase !== "pre" && photo && (
        <div style={{
          position: "absolute", top: 4, left: 0, right: 0, bottom: 0,
          backgroundImage: `url(${photo})`,
          backgroundSize: "cover", backgroundPosition: "center 18%",
          opacity: 0.32,
        }}/>
      )}
      {phase !== "pre" && (
        <div style={{
          position: "absolute", top: 4, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(120% 80% at 80% 0%, ${accent}30, transparent 55%), linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.55) 100%)`,
          pointerEvents: "none",
        }}/>
      )}

      <div style={{ position: "relative", padding: "16px 18px 18px" }}>
        {/* Header chip-row: round number + date */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="mono" style={{
            fontSize: 9, letterSpacing: 1.8, color: accent, fontWeight: 800,
          }}>
            {phase === "pre"
              ? `${FESTIVAL_CONFIG.brand.toUpperCase()} ${FESTIVAL_CONFIG.year}`
              : phase === "live"
                ? `● LIVE · ${stage?.name?.toUpperCase() || ""}`
                : `TONIGHT · ${dayMeta?.name?.toUpperCase() || "DAY " + day}`}
          </div>
          <div className="mono" style={{
            fontSize: 8.5, letterSpacing: 1.4, color: "rgba(255,255,255,0.55)", fontWeight: 600,
          }}>
            {phase === "pre"
              ? FESTIVAL_CONFIG.dates.toUpperCase()
              : `NIGHT ${day} / 3`}
          </div>
        </div>

        {/* Pre-festival: countdown + date */}
        {phase === "pre" && (
          <>
            <div className="serif" style={{ fontSize: 30, lineHeight: 0.96, letterSpacing: -0.5, marginBottom: 6 }}>
              {FESTIVAL_CONFIG.dayDates[1]?.short} · <span style={{ fontStyle: "italic", color: accent }}>{FESTIVAL_CONFIG.brand}</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, marginBottom: 14 }}>
              {FESTIVAL_CONFIG.locationShort} · gates open Friday 4PM.
            </div>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 10,
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: accent, fontWeight: 800 }}>
                STARTS IN
              </div>
              <div style={{
                fontFamily: "Geist Mono, monospace", fontSize: 22, fontWeight: 600,
                color: "#fff", letterSpacing: 0.5, fontVariantNumeric: "tabular-nums",
                marginLeft: "auto",
              }}>
                {preDays != null && preDays > 0 ? `${preDays}D ` : ""}{preLabel || "—"}
              </div>
            </div>
          </>
        )}

        {/* Live phase: now-playing artist */}
        {phase === "live" && featured && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{
                width: 7, height: 7, borderRadius: 7, background: accent,
                boxShadow: `0 0 0 4px ${accent}33`,
                animation: "pulse 1.6s ease-in-out infinite",
              }}/>
              <span className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
                NOW · {featured.genre.toUpperCase()}
              </span>
            </div>
            <div className="serif" style={{ fontSize: 34, lineHeight: 0.95, letterSpacing: -0.4, marginBottom: 6 }}>
              {featured.name}
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>
              {fmt12(featured.start)} – {fmt12(featured.end)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setState({ ...state, tab: "map", focusStage: featured.stage })}
                style={homeBtn("solid")}>Navigate</button>
              <button onClick={() => setState({ ...state, tab: "home", artist: featured.id })}
                style={homeBtn("ghost")}>Details</button>
            </div>
          </>
        )}

        {/* Doors-not-yet-open phase */}
        {phase === "doors" && (
          <>
            <div className="serif" style={{ fontSize: 30, lineHeight: 0.96, letterSpacing: -0.4, marginBottom: 6 }}>
              {dayMeta?.name || ("Day " + day)}{" "}
              <span style={{ fontStyle: "italic", color: accent }}>Night</span>
            </div>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14,
              padding: "8px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: accent, fontWeight: 800 }}>
                DOORS IN
              </div>
              <div style={{
                fontFamily: "Geist Mono, monospace", fontSize: 20, fontWeight: 600,
                color: "#fff", letterSpacing: 0.5, fontVariantNumeric: "tabular-nums",
                marginLeft: "auto",
              }}>
                {doorsLabel || "SOON"}
              </div>
            </div>
            {featured && (
              <button
                onClick={() => setState({ ...state, tab: "home", artist: featured.id })}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12, padding: "10px 12px", cursor: "pointer",
                  textAlign: "left", color: "#fff",
                }}>
                <div style={{ width: 3, alignSelf: "stretch", background: accent, borderRadius: 3, minHeight: 36 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.4, color: accent, fontWeight: 700 }}>
                    {savedIds.includes(featured.id) ? "YOUR HEADLINER" : "TONIGHT'S HEADLINER"}
                  </div>
                  <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, marginTop: 2 }}>
                    {featured.name}
                  </div>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                    {stage?.short || ""} · {fmt12(featured.start)}
                  </div>
                </div>
              </button>
            )}
          </>
        )}

        {/* Between-sets phase (festival on, no artist live on any stage). */}
        {phase === "between" && (
          <>
            <div className="serif" style={{ fontSize: 30, lineHeight: 0.96, letterSpacing: -0.4, marginBottom: 6 }}>
              Stage <span style={{ fontStyle: "italic", color: accent }}>changeover</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, marginBottom: 12 }}>
              Decks are quiet between sets — your next pick is queued below.
            </div>
            {featured && (
              <button
                onClick={() => setState({ ...state, tab: "home", artist: featured.id })}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12, padding: "10px 12px", cursor: "pointer",
                  textAlign: "left", color: "#fff",
                }}>
                <div style={{ width: 3, alignSelf: "stretch", background: accent, borderRadius: 3, minHeight: 36 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.4, color: accent, fontWeight: 700 }}>
                    UP NEXT TONIGHT
                  </div>
                  <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, marginTop: 2 }}>
                    {featured.name}
                  </div>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                    {stage?.short || ""} · {fmt12(featured.start)}
                  </div>
                </div>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── F1 podium-style "Last night" recap ────────────────────────────
// Renders for night 2 & 3 when the user actually attended the prior
// night. Top-3 of YOUR saved sets, ranked by tier × duration; 1st
// gets the big serif treatment, 2nd & 3rd flank as smaller cards.
// If you saved nothing, falls back to the night's top-billed sets.
function LastNightRecap({ state, setState }) {
  const day = NOW.day;
  const prevDay = day - 1;
  if (prevDay < 1 || prevDay > 3) return null;
  const meta = FESTIVAL_CONFIG.dayDates[prevDay];
  const savedIds = state.saved || [];

  // Score = tier (1-3) weighted by set duration in minutes
  const score = a => {
    const dur = Math.max(20, toNightMin(a.end) - toNightMin(a.start));
    return (a.tier || 1) * 100 + dur;
  };

  const yoursLastNight = ARTISTS
    .filter(a => a.day === prevDay && savedIds.includes(a.id))
    .sort((a, b) => score(b) - score(a));

  // No saves last night — fall back to top-tier scheduled sets so the
  // tab isn't an empty void.
  const podiumSource = yoursLastNight.length
    ? yoursLastNight
    : ARTISTS.filter(a => a.day === prevDay).sort((a, b) => score(b) - score(a));

  const top3 = podiumSource.slice(0, 3);
  if (!top3.length) return null;

  // Counts row
  const setsCaught = yoursLastNight.length;
  const totalMin = yoursLastNight.reduce(
    (sum, a) => sum + Math.max(0, toNightMin(a.end) - toNightMin(a.start)), 0
  );
  const stageCounts = yoursLastNight.reduce((acc, a) => {
    acc[a.stage] = (acc[a.stage] || 0) + 1; return acc;
  }, {});
  const topStageId = Object.entries(stageCounts).sort((x, y) => y[1] - x[1])[0]?.[0];
  const topStage   = topStageId ? STAGES.find(s => s.id === topStageId) : null;

  const PodiumRow = ({ artist, place }) => {
    const stage = STAGES.find(s => s.id === artist.stage);
    const heights = { 1: 78, 2: 60, 3: 48 };
    const colors  = { 1: "var(--ember)", 2: "var(--flare)", 3: "var(--horizon)" };
    return (
      <button onClick={() => setState({ ...state, tab: "home", artist: artist.id })}
        style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          alignItems: "stretch", background: "transparent",
          border: "none", padding: 0, cursor: "pointer", textAlign: "left",
        }}>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.4, color: colors[place], fontWeight: 800,
          marginBottom: 4,
        }}>
          {place === 1 ? "1ST · HEADLINER" : place === 2 ? "2ND" : "3RD"}
        </div>
        <div style={{
          height: heights[place],
          background: stage?.color || "var(--paper-2)",
          borderRadius: 10,
          padding: "8px 10px",
          color: "#fff",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
        }}>
          <div className="serif" style={{
            fontSize: place === 1 ? 17 : 13, lineHeight: 1.05,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {artist.name}
          </div>
          <div className="mono" style={{
            fontSize: 8, letterSpacing: 1, color: "rgba(255,255,255,0.85)", marginTop: 2,
          }}>
            {stage?.short || ""} · {fmt12(artist.start)}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Title */}
      <div className="serif" style={{ fontSize: 32, lineHeight: 0.95, letterSpacing: -0.4, marginBottom: 4 }}>
        {meta?.name || ("Day " + prevDay)}{" "}
        <span style={{ fontStyle: "italic", color: "var(--ember)" }}>Night</span>
      </div>
      <div className="mono" style={{
        fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", fontWeight: 600, marginBottom: 14,
      }}>
        {meta?.short} · {yoursLastNight.length ? "YOUR PODIUM" : "TOP BILLED"}
      </div>

      {/* Stat row */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 14,
        background: "var(--paper-2)", border: "1px solid var(--line)",
        borderRadius: 12, overflow: "hidden",
      }}>
        {[
          { label: "SETS",      value: setsCaught || "—" },
          { label: "HOURS",     value: totalMin ? (totalMin / 60).toFixed(1) : "—" },
          { label: "TOP STAGE", value: topStage?.short || "—", color: topStage?.color },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: "10px 12px",
            borderLeft: i > 0 ? "1px solid var(--line)" : "none",
          }}>
            <div className="mono" style={{
              fontSize: 8.5, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 600,
            }}>{s.label}</div>
            <div style={{
              fontFamily: "Geist Mono, monospace", fontSize: 18, fontWeight: 600,
              color: s.color || "var(--ink)", marginTop: 3, lineHeight: 1,
            }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Podium: 2 / 1 / 3 layout to mimic actual podium heights */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        {top3[1] ? <PodiumRow artist={top3[1]} place={2} /> : <div style={{ flex: 1 }}/>}
        {top3[0] ? <PodiumRow artist={top3[0]} place={1} /> : <div style={{ flex: 1 }}/>}
        {top3[2] ? <PodiumRow artist={top3[2]} place={3} /> : <div style={{ flex: 1 }}/>}
      </div>

      {!yoursLastNight.length && (
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.3, color: "var(--muted)",
          textAlign: "center", marginTop: 12,
        }}>
          NO SAVED SETS LAST NIGHT — SHOWING TOP-BILLED INSTEAD
        </div>
      )}
    </div>
  );
}

// ── UPCOMING tab content ──────────────────────────────────────────
// Pre-festival: teaser cards for nights 1+2+3. During festival:
// tomorrow's headliner-to-watch list. Empty on the final night.
function UpcomingTeaser({ state, setState }) {
  const now = Date.now();
  const isPreEvent = now < FESTIVAL_START_MS;
  const savedIds = state.saved || [];

  // Which days to surface
  const upcomingDays = (() => {
    if (isPreEvent) return [1, 2, 3];
    const next = NOW.day + 1;
    return next <= 3 ? [next] : [];
  })();

  if (!upcomingDays.length) {
    return (
      <div style={{
        border: "1px dashed var(--line-2)", borderRadius: 14,
        padding: "24px 16px", textAlign: "center",
      }}>
        <div className="serif" style={{ fontSize: 18, color: "var(--muted)", fontStyle: "italic" }}>
          No more nights ahead
        </div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", marginTop: 6,
        }}>
          THIS IS THE LAST NIGHT — MAKE IT COUNT
        </div>
      </div>
    );
  }

  return (
    <div>
      {upcomingDays.map(day => {
        const meta = FESTIVAL_CONFIG.dayDates[day];
        const dayStartMs = festivalNightDate(day, "18:00").getTime();
        const countdownLabel = dayStartMs > now ? fmtCountdown(dayStartMs - now) : null;
        // Pick up to 4 highlights: saved sets first, then top-tier non-saved.
        const todays = ARTISTS.filter(a => a.day === day);
        const saved  = todays.filter(a => savedIds.includes(a.id))
          .sort((a, b) => (b.tier || 0) - (a.tier || 0));
        const topPicks = todays
          .filter(a => !savedIds.includes(a.id))
          .sort((a, b) => (b.tier || 0) - (a.tier || 0));
        const highlights = [...saved, ...topPicks].slice(0, 4);

        return (
          <div key={day} style={{
            marginBottom: 14,
            background: "var(--paper-2)", border: "1px solid var(--line)",
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div className="mono" style={{
                  fontSize: 9, letterSpacing: 1.4, color: "var(--ember)", fontWeight: 700,
                }}>
                  {meta?.short} · {meta?.name?.toUpperCase()}
                </div>
                <div className="serif" style={{ fontSize: 24, lineHeight: 1.05, marginTop: 2 }}>
                  {meta?.name} <span style={{ fontStyle: "italic", color: "var(--muted)" }}>night</span>
                </div>
              </div>
              {countdownLabel && (
                <div className="mono" style={{
                  fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 600,
                  textAlign: "right",
                }}>
                  IN {countdownLabel}
                </div>
              )}
            </div>

            {highlights.length === 0 ? (
              <div className="mono" style={{
                fontSize: 9, letterSpacing: 1.3, color: "var(--muted)",
                padding: "10px 0", textAlign: "center",
              }}>
                NO SETS SCHEDULED
              </div>
            ) : (
              highlights.map(a => {
                const stage = STAGES.find(s => s.id === a.stage);
                const isSaved = savedIds.includes(a.id);
                return (
                  <button key={a.id}
                    onClick={() => setState({ ...state, tab: "home", artist: a.id })}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      background: "transparent", border: "none",
                      borderBottom: "1px solid var(--line-2)",
                      padding: "8px 0", cursor: "pointer", textAlign: "left",
                    }}>
                    <div style={{
                      width: 3, alignSelf: "stretch", background: stage?.color,
                      borderRadius: 3, minHeight: 30,
                    }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div className="serif" style={{ fontSize: 16, lineHeight: 1.1, color: "var(--ink)" }}>
                          {a.name}
                        </div>
                        {isSaved && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill={stage?.color} stroke="none">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                          </svg>
                        )}
                      </div>
                      <div className="mono" style={{
                        fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 1,
                      }}>
                        {stage?.short} · {fmt12(a.start)}–{fmt12(a.end)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function HomeScreen({ state, setState }) {
  const [alertsOpen, setAlertsOpen] = React.useState(false);
  const [firstTimerOpen, setFirstTimerOpen] = React.useState(false);
  const [offline, setOffline] = React.useState(state.offline || false);
  const [weatherAlertDismissed, setWeatherAlertDismissed] = React.useState(false);
  const [homeSubTab, setHomeSubTab] = React.useState("today");
  const [notifNudgeDismissed, setNotifNudgeDismissed] = React.useState(() => {
    try { return localStorage.getItem("notif_nudge_dismissed") === "1"; } catch { return false; }
  });
  const [setupBannerDismissed, setSetupBannerDismissed] = React.useState(() => {
    try { return localStorage.getItem("setup_banner_dismissed") === "1"; } catch { return false; }
  });
  // Once the user saves their first set, they've engaged — auto-dismiss the
  // setup nudge so we stop nagging. Persisted so it stays dismissed even if
  // they later un-save everything.
  React.useEffect(() => {
    if (setupBannerDismissed) return;
    if ((state.saved?.length || 0) === 0) return;
    try { localStorage.setItem("setup_banner_dismissed", "1"); } catch {}
    setSetupBannerDismissed(true);
  }, [state.saved?.length, setupBannerDismissed]);
  const { perm: notifPerm, enable: enableNotifs } = useNotifications();
  const weatherAlert = useWeatherAlert();
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
  const isPostFestival = Date.now() > FESTIVAL_END_MS;

  // Offline prep: prefetch photos for any saved sets we haven't cached yet,
  // so the schedule + artist screens render with hero images even when EDC's
  // LTE is saturated. Uses Deezer (no auth) to avoid Spotify token dependency.
  React.useEffect(() => {
    const saved = state.saved || [];
    if (!saved.length || !navigator.onLine) return;
    let cached = {};
    try { cached = JSON.parse(localStorage.getItem("artist_images_v1") || "{}"); } catch {}
    const missing = saved
      .map(id => ARTISTS.find(a => a.id === id))
      .filter(a => a && !cached[a.name.toLowerCase()])
      .slice(0, 12); // throttle: 12 per session, rest fill in on revisit
    missing.forEach(a => {
      if (typeof fetchDeezerPhoto !== "function") return;
      fetchDeezerPhoto(a.name).then(img => {
        if (!img) return;
        try {
          const imgs = JSON.parse(localStorage.getItem("artist_images_v1") || "{}");
          if (!imgs[a.name.toLowerCase()]) {
            imgs[a.name.toLowerCase()] = img;
            localStorage.setItem("artist_images_v1", JSON.stringify(imgs));
          }
        } catch {}
      });
    });
  }, [state.saved?.length]);

  const current = ARTISTS.find(a => a.id === NOW.currentArtistId) || null;
  const next    = ARTISTS.find(a => a.id === NOW.nextArtistId) || null;
  const stageOf = id => STAGES.find(s => s.id === id);
  const currentPhoto = useArtistPhoto(current?.name || "");

  const totalMin = current ? Math.max(1, toNightMin(current.end) - toNightMin(current.start)) : 90;
  const progress = current ? Math.min(1, NOW.elapsedMin / totalMin) : 0;
  const minsLeft = current ? Math.max(0, totalMin - NOW.elapsedMin) : 0;
  const upNextMin = next ? Math.max(0, toNightMin(next.start) - toNightMin(NOW.time)) : 0;
  const tonight   = buildTonightsPlan(state);
  const liveStrip = liveAcrossStages();

  // Computed alerts from saved sets — replaces static demo ALERTS during festival
  const _dynAlerts = !countdown && state.saved?.length
    ? computeAlerts(state.saved, NOW.day, NOW.time)
    : [];
  const alerts = _dynAlerts.length ? _dynAlerts : (state.alerts || ALERTS);
  const unread = alerts.filter(a => a.unread).length;

  return (
    <Screen bg="var(--paper)">
      <ScrollBody style={{ padding: "0 0 70px" }}>
      {/* Masthead — scrolls with content (was previously pinned, now flows
          naturally so the home tab stops feeling like a fixed-header app) */}
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
              {offline ? "OFF" : (!countdown && !isPostFestival ? "LIVE" : "ON")}
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
            {!countdown && !isPostFestival && (
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
                DAY {NOW.day} · {NOW.time}
              </div>
            )}
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
        ) : isPostFestival ? (
          <>
            <div className="serif" style={{ fontSize: 36, lineHeight: 0.95, letterSpacing: -0.5 }}>
              {FESTIVAL_CONFIG.brand} <span style={{ fontStyle: "italic", color: "var(--ember)" }}>{FESTIVAL_CONFIG.year}</span> — that's a wrap.
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: "var(--muted)", marginTop: 6, marginBottom: 14 }}>
              {FESTIVAL_CONFIG.locationShort.toUpperCase()} · {FESTIVAL_CONFIG.dates.toUpperCase()}
            </div>
            {/* v151: post-festival recap hero CTA — the Home tab was a dead
                slate after the festival ended. Now it teases the Recap
                with the attended-set count, so a user opening the app
                Tuesday morning has somewhere to go that isn't "ME tab,
                scroll down". */}
            {(() => {
              const attendedCount = (typeof window.getAttendedCount === "function" ? window.getAttendedCount() : 0);
              if (attendedCount === 0) return null;
              return (
                <button
                  onClick={() => setState(s => ({ ...s, tab: "recap" }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", marginTop: 6, padding: "13px 14px",
                    background: "linear-gradient(135deg, var(--ink) 0%, var(--horizon) 90%, var(--ember) 130%)",
                    border: "none", borderRadius: 16,
                    color: "var(--paper)", cursor: "pointer", textAlign: "left",
                    boxShadow: "0 4px 18px rgba(123,61,154,0.28)",
                  }}>
                  <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>✦</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="serif" style={{ fontSize: 19, lineHeight: 1.05 }}>
                      Your <span style={{ fontStyle: "italic", color: "var(--flare)" }}>weekend</span>, recapped
                    </div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "rgba(247,237,224,0.7)", marginTop: 4, fontWeight: 700 }}>
                      {attendedCount} SET{attendedCount === 1 ? "" : "S"} CAUGHT · TAP TO SEE THE FULL RECAP
                    </div>
                  </div>
                  <span style={{ fontSize: 18, opacity: 0.75 }}>→</span>
                </button>
              );
            })()}
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

      {/* Banner queue: at most one of {install, notif, weather} renders at a
          time. Priority order = install > notif > weather. The install prompt
          is the most actionable (and only shows when canInstall=true), so it
          wins. Without this gate, three nudges could stack on first launch. */}
      {(() => {
        const ip = useInstallPrompt();
        // Setup nudge — replaces the old blocking onboarding modal. Shows
        // when the user hasn't picked a name AND hasn't connected Spotify
        // (signal that they're truly new), and is dismissable.
        let userName = "";
        try { userName = localStorage.getItem("user_name") || ""; } catch {}
        const showSetup = !setupBannerDismissed && !userName && !state.spotifyConnected;
        const showInstall = !showSetup && ip.canInstall;
        const showNotif   = !showSetup && !showInstall && state.saved.length > 0 && notifPerm === "default" && !notifNudgeDismissed;
        const showWeather = !showSetup && !showInstall && !showNotif && weatherAlert && !weatherAlertDismissed;
        if (showSetup) return (
          <div style={{ padding: "8px 16px 0" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "linear-gradient(135deg, rgba(232,93,46,0.12), rgba(123,61,154,0.10))",
              border: "1px solid rgba(232,93,46,0.4)",
              borderRadius: 14, padding: "11px 13px",
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>✦</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>
                Personalize Plursky — name, Spotify, reminders.
              </div>
              <button onClick={() => window.plurskyOpenOnboarding?.()} style={{
                background: "var(--ink)", color: "var(--paper)", border: "none",
                borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                flexShrink: 0,
              }}>SET UP</button>
              <button onClick={() => {
                try { localStorage.setItem("setup_banner_dismissed", "1"); } catch {}
                setSetupBannerDismissed(true);
              }} style={{
                background: "transparent", border: "none", color: "var(--muted)",
                fontSize: 17, cursor: "pointer", flexShrink: 0, lineHeight: 1,
              }}>×</button>
            </div>
          </div>
        );
        if (showInstall) return <InstallBanner />;
        if (showNotif) return (
          <div style={{ padding: "8px 16px 0" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(123,61,154,0.1)", border: "1px solid rgba(123,61,154,0.35)",
              borderRadius: 14, padding: "11px 13px",
            }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>🔔</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}>
                Get notified 15 min before each saved set
              </div>
              <button onClick={async () => {
                await enableNotifs();
                setNotifNudgeDismissed(true);
                try { localStorage.setItem("notif_nudge_dismissed", "1"); } catch {}
              }} style={{
                background: "var(--horizon)", color: "#fff", border: "none",
                borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                flexShrink: 0,
              }}>ENABLE</button>
              <button onClick={() => {
                setNotifNudgeDismissed(true);
                try { localStorage.setItem("notif_nudge_dismissed", "1"); } catch {}
              }} style={{
                background: "transparent", border: "none", color: "var(--muted)",
                fontSize: 17, cursor: "pointer", flexShrink: 0, lineHeight: 1,
              }}>×</button>
            </div>
          </div>
        );
        if (showWeather) return (
          <div style={{ padding: "8px 16px 0" }}>
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)",
              borderRadius: 14, padding: "12px 14px",
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
          </div>
        );
        return null;
      })()}

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

      {/* Day-strip segmented control (Apple Sports–style). Sub-tab state is
          local to HomeScreen; the master `state.tab` still drives the main
          4-tab nav at the bottom of the app. */}
      <div style={{ padding: "10px 16px 4px" }}>
        <DayStrip
          value={homeSubTab}
          onChange={setHomeSubTab}
          hasYesterday={!countdown && !isPostFestival && NOW.day > 1}
          hasUpcoming={countdown || (!isPostFestival && NOW.day < 3)}
        />
      </div>

      <div style={{ padding: "16px 16px 24px" }}>
        {/* ── YESTERDAY tab ───────────────────────────────────── */}
        {homeSubTab === "yesterday" && (
          <LastNightRecap state={state} setState={setState} />
        )}

        {/* ── UPCOMING tab ────────────────────────────────────── */}
        {homeSubTab === "upcoming" && (
          <UpcomingTeaser state={state} setState={setState} />
        )}

        {/* ── TODAY tab ───────────────────────────────────────── */}
        {homeSubTab === "today" && <>

        {/* Post-festival recap — on TODAY when the festival has wrapped. */}
        {isPostFestival && <PostFestivalRecap state={state} setState={setState} />}

        {/* F1-style hero card — pre/during phases (post handled above). */}
        {!isPostFestival && <F1TonightHero state={state} setState={setState} />}

        {/* Live festival sections — hidden pre-event and post-festival */}
        {!countdown && !isPostFestival && (
          <>
            {/* NOW PLAYING hero card — hidden during stage changeovers */}
            {current && <div style={{
              background: currentPhoto ? "#000" : current.img,
              borderRadius: 22,
              padding: 18,
              color: "#fff",
              position: "relative",
              overflow: "hidden",
              marginBottom: 14,
            }}>
              {/* Real artist photo as background */}
              {currentPhoto && (
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `url(${currentPhoto})`,
                  backgroundSize: "cover", backgroundPosition: "center 15%",
                  opacity: 0.55,
                }}/>
              )}
              {/* Grain / vignette */}
              <div style={{
                position: "absolute", inset: 0,
                background: currentPhoto
                  ? "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.6) 100%)"
                  : "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.18), transparent 60%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.35) 100%)",
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
                  {current.genre.toUpperCase()} · {fmt12(current.start)}–{fmt12(current.end)}
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
                  {(() => {
                    const isSaved = (state.saved || []).includes(current.id);
                    return (
                      <button
                        onClick={() => {
                          try { navigator.vibrate([30]); } catch {}
                          const saved = state.saved || [];
                          setState({ ...state, saved: isSaved
                            ? saved.filter(id => id !== current.id)
                            : [...saved, current.id] });
                        }}
                        title={isSaved ? "Unsave set" : "Save set"}
                        style={{
                          marginLeft: "auto", background: "transparent",
                          border: "1.5px solid rgba(255,255,255,0.4)",
                          borderRadius: 999, width: 36, height: 36,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", color: isSaved ? "#fff" : "rgba(255,255,255,0.6)",
                          flexShrink: 0,
                        }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>}

            {/* UP NEXT strip */}
            {next && <div style={{
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
                  {stageOf(next.stage).name.toUpperCase()} · {fmt12(next.start)}
                </div>
              </div>
              <button onClick={() => setState({ ...state, tab: "home", artist: next.id })} style={{
                background: "var(--ink)", color: "var(--paper)", border: "none",
                borderRadius: 999, padding: "8px 12px", cursor: "pointer",
                fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 500,
              }}>OPEN</button>
            </div>}

            {/* LIVE ACROSS STAGES — what's on right now at every stage */}
            <LiveAcrossStrip strip={liveStrip} setState={setState} state={state} />

            {/* TONIGHT'S PLAN — chronological saved sets with walking ETAs + leave-by */}
            <TonightsPlan plan={tonight} setState={setState} state={state} />
          </>
        )}

        {/* Tonight: sunrise/sunset · weather · last-shuttle countdown */}
        {!isPostFestival && <TonightCard state={state} setState={setState} />}

        {/* Don't-miss strip — auto-detected legendary moments (sunrise sets
            + B2B collabs) for the relevant day. Vets came for THESE, so they
            sit prominently between the night card and the artist gossip. */}
        {!isPostFestival && <DontMissStrip day={countdown ? 1 : NOW.day} state={state} setState={setState} />}

        {/* Friend's shared lineup — appears when ?lineup= deep link was opened. */}
        {state.friendLineup?.length > 0 && (
          <FriendLineupBanner state={state} setState={setState} />
        )}

        {/* Reminders card — surfaces 15-min push opt-in on home when user has
            saved sets so it's discoverable, not buried on the Music tab. */}
        {state.saved?.length > 0 && typeof NotificationsCard === "function" && (
          <div style={{ marginTop: 18 }}>
            <NotificationsCard state={state} />
          </div>
        )}

        {/* Pre-festival lineup preview — visible only during countdown */}
        {countdown && (() => {
          const savedIds = state.saved || [];
          const byDay = [1, 2, 3].map(day => ({
            day,
            meta: FESTIVAL_CONFIG.dayDates[day],
            artists: ARTISTS.filter(a => a.day === day && savedIds.includes(a.id))
              .sort((a, b) => toNightMin(a.start) - toNightMin(b.start)),
          })).filter(d => d.artists.length);
          if (!byDay.length) return (
            <div style={{
              background: "var(--paper-2)", border: "1px solid var(--line)",
              borderRadius: 16, padding: "16px 16px", marginTop: 18, textAlign: "center",
            }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)" }}>
                NO SAVED SETS YET — BROWSE THE LINEUP ↓
              </div>
            </div>
          );
          return (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <div className="serif" style={{ fontSize: 22 }}>
                  Your <span style={{ fontStyle: "italic", color: "var(--ember)" }}>lineup</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)" }}>
                    {savedIds.length} SETS
                  </span>
                  <ShareLineupButton savedIds={savedIds} />
                </div>
              </div>
              <div style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 18, padding: "14px 16px 6px",
              }}>
                {byDay.map(({ day, meta, artists }) => {
                  // Pre-compute conflicts + transitions so each row knows its
                  // relationship to the previous saved set. Mirrors the live
                  // PlanRow logic but for the pre-festival preview.
                  const rows = artists.map((a, i) => {
                    const prev = artists[i - 1];
                    const walk = prev ? stageWalkMinutes(prev.stage, a.stage) : 0;
                    const prevEnd = prev ? toNightMin(prev.end) : null;
                    const startMin = toNightMin(a.start);
                    const tight = prev && walk > 0 && (startMin - prevEnd) < walk;
                    const conflict = prev && overlaps(prev, a);
                    return { a, prev, walk, tight, conflict };
                  });
                  const conflictCount = rows.filter(r => r.conflict).length;
                  return (
                  <div key={day} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div className="mono" style={{
                        fontSize: 8.5, letterSpacing: 1.8, color: "var(--ember)",
                        fontWeight: 700,
                      }}>
                        {meta.short} · {meta.name.toUpperCase()}
                      </div>
                      {conflictCount > 0 && (
                        <span className="mono" style={{
                          fontSize: 7.5, letterSpacing: 1.2, color: "var(--ember)",
                          padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                          border: "1px solid var(--ember)",
                        }}>{conflictCount} CLASH</span>
                      )}
                    </div>
                    {rows.map(({ a, prev, walk, tight, conflict }) => {
                      const stage = STAGES.find(s => s.id === a.stage);
                      return (
                        <div key={a.id}>
                          {prev && walk > 0 && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "2px 0 2px 46px",
                            }}>
                              <div style={{ width: 1, height: 14, background: tight ? "var(--ember)" : "var(--line-2)" }}/>
                              <span className="mono" style={{
                                fontSize: 8, letterSpacing: 1.1,
                                color: tight ? "var(--ember)" : "var(--muted)",
                                fontWeight: tight ? 700 : 500,
                              }}>
                                {walk} MIN WALK · {prev.stage === a.stage ? "SAME STAGE" : `${STAGES.find(s=>s.id===prev.stage)?.short} → ${stage?.short}`}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => setState({ ...state, artist: a.id })}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, width: "100%",
                              background: conflict ? "rgba(232,93,46,0.06)" : "transparent",
                              border: "none", borderBottom: "1px solid var(--line-2)",
                              padding: "8px 6px", cursor: "pointer", textAlign: "left",
                            }}>
                            <ArtistSwatch artist={a} size={36} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div className="serif" style={{ fontSize: 16, lineHeight: 1.1, color: "var(--ink)" }}>
                                  {a.name}
                                </div>
                                {conflict && (
                                  <span className="mono" style={{
                                    fontSize: 7.5, letterSpacing: 1.2, color: "var(--ember)",
                                    padding: "1px 4px", borderRadius: 3, fontWeight: 700,
                                    border: "1px solid var(--ember)",
                                  }}>CLASH</span>
                                )}
                              </div>
                              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 1 }}>
                                {stage ? stage.short : ""} · {fmt12(a.start)}–{fmt12(a.end)}
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        </>}{/* end TODAY tab */}
      </div>
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
        <AlertsDrawer alerts={alerts} onClose={() => {
          setAlertsOpen(false);
          setState({ ...state, alerts: alerts.map(a => ({ ...a, unread: false })) });
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
  const savedSet = new Set(state.saved || []);
  const liveCount = strip.filter(s => s.artist).length;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", fontWeight: 600 }}>
          LIVE ACROSS STAGES
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ember)" }}>
          {liveCount}/{strip.length} ON
        </span>
      </div>
      <div className="no-scrollbar" style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", marginRight: -16, paddingRight: 16 }}>
        {strip.map(({ stage, artist, upcoming, minsUntil }) => {
          const isSaved   = artist   && savedSet.has(artist.id);
          const nextSaved = upcoming && savedSet.has(upcoming.id);
          return (
            <button
              key={stage.id}
              onClick={() => {
                if (artist)   return setState({ ...state, tab: "home", artist: artist.id });
                if (upcoming) return setState({ ...state, tab: "home", artist: upcoming.id });
                setState({ ...state, tab: "map", focusStage: stage.id });
              }}
              style={{
                flexShrink: 0, width: 136, textAlign: "left",
                padding: "9px 11px", borderRadius: 13,
                background: isSaved
                  ? `${stage.color}18`
                  : artist ? "var(--paper-2)" : "transparent",
                border: `1px solid ${isSaved ? stage.color + "55" : artist ? "var(--line)" : "var(--line-2)"}`,
                borderLeft: `3px solid ${stage.color}`,
                cursor: "pointer",
                opacity: (artist || upcoming) ? 1 : 0.45,
              }}>

              {/* Stage label row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
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
                {isSaved && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill={stage.color} stroke="none">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                )}
              </div>

              {/* Artist name or "dark" state */}
              {artist ? (
                <>
                  <div className="serif" style={{
                    fontSize: 14, lineHeight: 1.1, marginTop: 4,
                    color: "var(--ink)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {artist.name}
                  </div>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                    {fmt12(artist.start)}–{fmt12(artist.end)}
                  </div>
                </>
              ) : upcoming ? (
                <>
                  <div style={{
                    fontSize: 11, lineHeight: 1.15, marginTop: 4,
                    color: nextSaved ? stage.color : "var(--muted)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    fontStyle: "italic",
                  }}>
                    {upcoming.name}
                  </div>
                  <div className="mono" style={{ fontSize: 8, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                    IN {minsUntil}m · {fmt12(upcoming.start)}
                  </div>
                </>
              ) : (
                <>
                  <div className="serif" style={{ fontSize: 13, lineHeight: 1.1, marginTop: 4, color: "var(--muted)" }}>
                    Stage dark
                  </div>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>
                    {stage.name.toUpperCase()}
                  </div>
                </>
              )}
            </button>
          );
        })}
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
            {leaveByLabel && ` · LEAVE BY ${leaveByLabel}`}
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
          }}>{fmt12(a.start)}</div>
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
                {stage?.short || ""} · {fmt12(a.start)}
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

// ── Lineup sharing ───────────────────────────────────────────
// Encode/decode happens via the ?lineup=id1,id2 query param parsed in app.jsx
// state init. The link is fully self-contained — no server, no friend graph,
// no privacy model. Drop it in iMessage / Snap / WhatsApp and the receiver
// sees your saved sets next to their own.

function _buildShareUrl(savedIds) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?lineup=${savedIds.join(",")}`;
}

function ShareLineupButton({ savedIds }) {
  const [flash, setFlash] = React.useState(null); // 'shared' | 'copied'
  if (!savedIds?.length) return null;

  const onShare = async () => {
    const url = _buildShareUrl(savedIds);
    const text = `My EDC lineup — ${savedIds.length} sets saved on Plursky`;
    // navigator.share lights up the OS share sheet on iOS/Android — clipboard
    // is the desktop / unsupported-browser fallback.
    if (navigator.share) {
      try {
        await navigator.share({ title: "My EDC lineup", text, url });
        setFlash("shared"); setTimeout(() => setFlash(null), 1800);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // user cancelled the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setFlash("copied"); setTimeout(() => setFlash(null), 1800);
    } catch {
      prompt("Copy your lineup link:", url);
    }
  };

  return (
    <button onClick={onShare} className="mono" style={{
      background: flash ? "var(--success)" : "var(--ink)",
      color: "var(--paper)", border: "none", borderRadius: 999,
      padding: "5px 10px", cursor: "pointer",
      fontSize: 8.5, letterSpacing: 1.3, fontWeight: 700,
      transition: "background 0.2s",
    }}>
      {flash === "shared" ? "✓ SHARED" : flash === "copied" ? "✓ COPIED" : "↗ SHARE"}
    </button>
  );
}

function FriendLineupBanner({ state, setState }) {
  const friendIds = state.friendLineup || [];
  const savedSet = new Set(state.saved || []);
  const overlap = friendIds.filter(id => savedSet.has(id));
  const fresh = friendIds.filter(id => !savedSet.has(id));
  const [expanded, setExpanded] = React.useState(false);

  const dismiss = () => setState({ ...state, friendLineup: null, friendName: null });

  const addAll = () => {
    const merged = [...new Set([...(state.saved || []), ...friendIds])];
    setState({ ...state, saved: merged });
  };
  const addOverlap = () => {
    // Already-overlapping IDs are by definition already saved — meaningful only
    // when the friend has sets you don't yet. Falls back to addAll otherwise.
    if (!fresh.length) return;
    const merged = [...new Set([...(state.saved || []), ...fresh])];
    setState({ ...state, saved: merged });
  };

  return (
    <div style={{
      marginTop: 18, padding: "16px 16px 14px",
      borderRadius: 18,
      background: "linear-gradient(135deg, rgba(123,61,154,0.12), rgba(232,93,46,0.08))",
      border: "1px solid rgba(123,61,154,0.3)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: "var(--horizon)", fontWeight: 700 }}>
          SHARED WITH YOU{state.friendName ? ` · ${state.friendName.toUpperCase()}` : ""}
        </span>
        <button onClick={dismiss} style={{
          background: "transparent", border: "none", color: "var(--muted)",
          cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
        }}>×</button>
      </div>
      <div className="serif" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 4 }}>
        {state.friendName ? state.friendName : "Your friend"}'s <span style={{ fontStyle: "italic", color: "var(--ember)" }}>lineup</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink)", opacity: 0.75, lineHeight: 1.5, marginBottom: 12 }}>
        {friendIds.length} sets saved · {overlap.length} match yours
        {fresh.length > 0 && ` · ${fresh.length} new to you`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setExpanded(e => !e)} className="mono" style={{
          background: "var(--ink)", color: "var(--paper)", border: "none",
          borderRadius: 999, padding: "8px 14px", cursor: "pointer",
          fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
        }}>{expanded ? "HIDE SETS" : "VIEW SETS"}</button>
        {fresh.length > 0 && (
          <button onClick={addOverlap} className="mono" style={{
            background: "var(--ember)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 14px", cursor: "pointer",
            fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
          }}>+ ADD {fresh.length} NEW</button>
        )}
        <button onClick={addAll} className="mono" style={{
          background: "transparent", color: "var(--ink)",
          border: "1px solid var(--line-2)",
          borderRadius: 999, padding: "8px 14px", cursor: "pointer",
          fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
        }}>+ ADD ALL</button>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {[1, 2, 3].map(day => {
            const dayArtists = friendIds
              .map(id => ARTISTS.find(a => a.id === id))
              .filter(a => a && a.day === day)
              .sort((a, b) => toNightMin(a.start) - toNightMin(b.start));
            if (!dayArtists.length) return null;
            const meta = FESTIVAL_CONFIG.dayDates[day];
            return (
              <div key={day} style={{ marginBottom: 10 }}>
                <div className="mono" style={{
                  fontSize: 8.5, letterSpacing: 1.6, color: "var(--horizon)",
                  fontWeight: 700, marginBottom: 6,
                }}>
                  {meta.short} · {meta.name.toUpperCase()}
                </div>
                {dayArtists.map(a => {
                  const stage = STAGES.find(s => s.id === a.stage);
                  const isOverlap = savedSet.has(a.id);
                  return (
                    <button key={a.id} onClick={() => setState({ ...state, artist: a.id })}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        background: "transparent", border: "none",
                        borderBottom: "1px solid var(--line-2)",
                        padding: "6px 0", cursor: "pointer", textAlign: "left",
                      }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 999,
                        background: isOverlap ? "var(--success)" : stage?.color || "var(--muted)",
                        flexShrink: 0,
                      }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="serif" style={{ fontSize: 14, lineHeight: 1.15, color: "var(--ink)" }}>
                          {a.name}
                        </div>
                        <div className="mono" style={{ fontSize: 8, letterSpacing: 1, color: "var(--muted)", marginTop: 1 }}>
                          {stage?.short} · {fmt12(a.start)}
                        </div>
                      </div>
                      {isOverlap && (
                        <span className="mono" style={{
                          fontSize: 7.5, letterSpacing: 1, color: "var(--success)",
                          fontWeight: 700,
                        }}>MATCH</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { HomeScreen, FriendLineupBanner, ShareLineupButton });