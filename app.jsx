// Main app — iOS frame + routing

function spotifyTokenValid() {
  const token = localStorage.getItem("spotify_token");
  const expires = localStorage.getItem("spotify_expires");
  if (token && expires && Date.now() < parseInt(expires)) return true;
  // Expired but has a refresh token — getValidToken() will renew silently on next API call
  return !!localStorage.getItem("spotify_refresh_token");
}

const ONBOARD_VERSION = "v1";

// First-launch flow — three quick steps that surface features users would
// otherwise have to discover by browsing into Me / Music. Each step can be
// skipped, but doing them once sets up the most valuable hooks (Spotify
// matching, push reminders, name personalisation) before the festival.
function OnboardingModal({ onDone, setState, state }) {
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState(() => {
    try { return localStorage.getItem("user_name") || ""; } catch { return ""; }
  });
  const { supported: notifSupported, perm: notifPerm, enable: enableNotifs } = useNotifications();

  const finish = () => {
    try {
      localStorage.setItem("onboarded", ONBOARD_VERSION);
      if (name.trim()) localStorage.setItem("user_name", name.trim());
    } catch {}
    onDone();
  };
  const next = () => setStep(s => s + 1);

  const STEPS = [
    {
      kicker: "WELCOME",
      title: <>Welcome to <span style={{ fontStyle: "italic", color: "var(--ember)" }}>Plursky</span></>,
      body: "Your offline-first companion for EDC Las Vegas 2026. Lineup, stage map, friends, sunrise sets — all in one place.",
      input: (
        <input
          type="text"
          placeholder="What should we call you?"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{
            width: "100%", padding: "12px 14px", marginTop: 12,
            background: "var(--paper-2)", border: "1px solid var(--line-2)",
            borderRadius: 12, fontFamily: "Geist, sans-serif", fontSize: 15,
            color: "var(--ink)", outline: "none",
          }}/>
      ),
      cta: { label: name.trim() ? `CONTINUE AS ${name.trim().toUpperCase()}` : "CONTINUE", onClick: next },
    },
    {
      kicker: "STEP 2 OF 3",
      title: <>Match the <span style={{ fontStyle: "italic", color: "var(--ember)" }}>lineup</span> to your Spotify</>,
      body: "Connect Spotify and we'll mark every artist you already love across all 175 sets, plus surface deep-cut discoveries you don't know yet.",
      cta: state.spotifyConnected
        ? { label: "✓ ALREADY CONNECTED — CONTINUE", onClick: next }
        : { label: "CONNECT SPOTIFY", onClick: () => startSpotifyAuth() },
      skip: { label: "SKIP", onClick: next },
    },
    {
      kicker: "STEP 3 OF 3",
      title: <>Reminders before each <span style={{ fontStyle: "italic", color: "var(--ember)" }}>set</span></>,
      body: notifSupported
        ? "Get a push 15 minutes before any saved set starts — including the sunrise sets at Kinetic Field. We don't track you, no account needed."
        : "Push notifications aren't supported in this browser. You can still set custom alarms from the Lineup page.",
      cta: !notifSupported
        ? { label: "GOT IT", onClick: finish }
        : notifPerm === "granted"
          ? { label: "✓ ENABLED — FINISH", onClick: finish }
          : { label: "ENABLE NOTIFICATIONS", onClick: async () => { await enableNotifs(); finish(); } },
      skip: notifSupported && notifPerm !== "granted" ? { label: "MAYBE LATER", onClick: finish } : null,
    },
  ];

  const cur = STEPS[step];

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      background: "rgba(13,8,4,0.55)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end", animation: "fadeIn .25s",
    }}>
      <div style={{
        background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        width: "100%", padding: "16px 22px 26px",
        boxShadow: "0 -16px 50px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 38, height: 4, borderRadius: 4, background: "var(--line-2)" }}/>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 3,
              background: i <= step ? "var(--ember)" : "var(--line)",
              transition: "background .2s",
            }}/>
          ))}
        </div>

        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>
          {cur.kicker}
        </div>
        <div className="serif" style={{ fontSize: 32, lineHeight: 1.05, letterSpacing: -0.4, marginBottom: 12 }}>
          {cur.title}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 18 }}>
          {cur.body}
        </div>

        {cur.input}

        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          <button onClick={cur.cta.onClick} style={{
            background: "var(--ink)", color: "var(--paper)", border: "none",
            borderRadius: 999, padding: "13px 18px",
            fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 700,
            cursor: "pointer",
          }}>{cur.cta.label}</button>
          {cur.skip && (
            <button onClick={cur.skip.onClick} style={{
              background: "transparent", color: "var(--muted)", border: "none",
              padding: "8px 12px",
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
              cursor: "pointer",
            }}>{cur.skip.label}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const _FID = FESTIVAL_CONFIG.id;
const _SAVED_KEY = `${_FID}_saved_v1`;

// ── Global command-palette search ────────────────────────────
// Searches all ~200 artists by name, stage, genre, or day keyword.
// Lives in App so it overlays any tab without prop-drilling.
function SearchModal({ onClose, onSelectArtist }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);

  const query = q.trim().toLowerCase();
  const DAY_MAP = { fri: 1, friday: 1, "day 1": 1, sat: 2, saturday: 2, "day 2": 2, sun: 3, sunday: 3, "day 3": 3 };
  const dayFilter = DAY_MAP[query];

  const results = query.length === 0 ? [] : ARTISTS.filter(a => {
    if (dayFilter) return a.day === dayFilter;
    const stage = STAGES.find(s => s.id === a.stage);
    return (
      a.name.toLowerCase().includes(query) ||
      a.genre.toLowerCase().includes(query) ||
      stage.name.toLowerCase().includes(query) ||
      stage.short.toLowerCase().includes(query) ||
      (stage.vibe || "").toLowerCase().includes(query) ||
      (["legend","legendary","sunrise","b2b"].includes(query) && isLegendary(a))
    );
  }).sort((a, b) => {
    const aStart = a.name.toLowerCase().startsWith(query);
    const bStart = b.name.toLowerCase().startsWith(query);
    if (aStart !== bStart) return aStart ? -1 : 1;
    if (a.day !== b.day) return a.day - b.day;
    return toNightMin(a.start) - toNightMin(b.start);
  });

  const QUICK = [
    { label: "★ Legendary / B2B", q: "legendary" },
    { label: "Sunrise sets",       q: "sunrise"   },
    { label: "Kinetic Field",      q: "kinetic"   },
    { label: "Tech House",         q: "tech house"},
    { label: "Techno",             q: "techno"    },
    { label: "Trance",             q: "trance"    },
    { label: "Friday",             q: "fri"       },
    { label: "Saturday",           q: "sat"       },
    { label: "Sunday",             q: "sun"       },
  ];

  const DAY_LABEL = { 1: "FRI", 2: "SAT", 3: "SUN" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      {/* Input row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 16px 12px",
        borderBottom: "1px solid var(--line)",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><path d="M21 21 L16.65 16.65"/>
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Artist, stage, genre, day…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontFamily: "Geist, sans-serif", fontSize: 17, color: "var(--ink)",
          }}
          onKeyDown={e => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && results[0]) { onSelectArtist(results[0].id); onClose(); }
          }}
        />
        {q && (
          <button onClick={() => setQ("")} style={{
            background: "var(--paper-2)", border: "none", borderRadius: 99,
            width: 20, height: 20, color: "var(--muted)", fontSize: 13,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        )}
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: "var(--ember)",
          fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.1, fontWeight: 700,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>CLOSE</button>
      </div>

      {/* Results / suggestions */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {query.length === 0 ? (
          <div style={{ padding: "14px 16px" }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", marginBottom: 10 }}>QUICK SEARCH</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK.map(t => (
                <button key={t.label} onClick={() => setQ(t.q)} style={{
                  background: "var(--paper-2)", border: "1px solid var(--line-2)",
                  borderRadius: 999, padding: "5px 12px", cursor: "pointer",
                  fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1, color: "var(--ink)",
                }}>{t.label}</button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--muted)", fontStyle: "italic" }}>No results</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 6 }}>TRY A STAGE NAME OR GENRE</div>
          </div>
        ) : (
          <>
            <div className="mono" style={{ padding: "10px 16px 4px", fontSize: 9, letterSpacing: 1.5, color: "var(--muted)" }}>
              {results.length} RESULT{results.length !== 1 ? "S" : ""}
            </div>
            {results.map(a => {
              const stage = STAGES.find(s => s.id === a.stage);
              const leg = isLegendary(a);
              return (
                <button key={a.id} onClick={() => { onSelectArtist(a.id); onClose(); }} style={{
                  display: "flex", gap: 10, padding: "10px 16px",
                  borderBottom: "1px solid var(--line)", width: "100%",
                  background: "transparent", cursor: "pointer", textAlign: "left",
                  alignItems: "center", border: "none", borderBottom: "1px solid var(--line)",
                }}>
                  <div style={{ width: 4, alignSelf: "stretch", background: stage.color, borderRadius: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <span className="serif" style={{ fontSize: 19, lineHeight: 1.05, letterSpacing: -0.2 }}>{a.name}</span>
                      {leg && <span className="mono" style={{ fontSize: 7.5, letterSpacing: 1, color: "#fbbf24", fontWeight: 800 }}>★ DON'T MISS</span>}
                    </div>
                    <div style={{ display: "flex", gap: 5, marginTop: 2, alignItems: "center" }}>
                      <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: stage.color, fontWeight: 600, textTransform: "uppercase" }}>{stage.short}</span>
                      <span style={{ color: "var(--muted)" }}>·</span>
                      <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)" }}>{DAY_LABEL[a.day]} {a.start}–{a.end}</span>
                      <span style={{ color: "var(--muted)" }}>·</span>
                      <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase" }}>{a.genre}</span>
                    </div>
                  </div>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18 L15 12 L9 6"/>
                  </svg>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [showOnboarding, setShowOnboarding] = React.useState(() => {
    try { return localStorage.getItem("onboarded") !== ONBOARD_VERSION; }
    catch { return false; }
  });
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [state, setState] = React.useState(() => {
    let saved;
    try {
      const raw = localStorage.getItem(_SAVED_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    return {
      tab: "home",
      saved: saved ?? ["k9", "k11", "k4", "c5", "w1"],
      spotifyConnected: spotifyTokenValid(),
      artist: null,
      focusStage: null,
      lineupDay: NOW.day,
    };
  });

  React.useEffect(() => {
    try { localStorage.setItem(_SAVED_KEY, JSON.stringify(state.saved)); } catch {}
  }, [state.saved]);

  let body;
  if (state.artist) body = <ArtistScreen state={state} setState={setState} />;
  else if (state.tab === "home")    body = <HomeScreen    state={state} setState={setState} />;
  else if (state.tab === "map")     body = <MapScreen     state={state} setState={setState} />;
  else if (state.tab === "lineup")  body = <LineupScreen  state={state} setState={setState} />;
  else if (state.tab === "spotify") body = <SpotifyScreen state={state} setState={setState} />;
  else if (state.tab === "me")      body = <MeScreen      state={state} setState={setState} />;

  // status bar tint — dark pane on map, light elsewhere
  const statusBarStyle = state.tab === "map" && !state.artist ? "light" : "dark";

  return (
    <IOSDevice dark={statusBarStyle === "light"}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: 54 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {body}
          {/* Search FAB — floats above TabBar, accessible from any screen */}
          {!state.artist && !searchOpen && (
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search artists"
              style={{
                position: "absolute", bottom: 16, right: 16, zIndex: 30,
                width: 42, height: 42, borderRadius: 42,
                background: "var(--ink)", color: "var(--paper)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21 L16.65 16.65"/>
              </svg>
            </button>
          )}
        </div>
        {!state.artist && (
          <TabBar active={state.tab} onChange={t => setState({ ...state, tab: t })} />
        )}
      </div>
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelectArtist={(id) => setState({ ...state, artist: id })}
        />
      )}
      {showOnboarding && (
        <OnboardingModal
          state={state}
          setState={setState}
          onDone={() => setShowOnboarding(false)}
        />
      )}
      <BatterySaverToast />
    </IOSDevice>
  );
}

// Keyframes
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes pulse  { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.1); } }
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes tdot   { 0%,60%,100% { transform: translateY(0); opacity: 0.4 } 30% { transform: translateY(-5px); opacity: 1 } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  /* Iso-mode sprite bob — bounces along the post-rotation Y axis so the
     character feels alive when standing on the tilted ground plane. */
  @keyframes isoBob { 0%,100% { translate: 0 0; } 50% { translate: 0 -6px; } }
  @keyframes isoShadowPulse { 0%,100% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; } 50% { transform: translate(-50%, -50%) scale(0.82); opacity: 0.35; } }
`;
document.head.appendChild(styleTag);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
