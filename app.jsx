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
      if (name.trim()) {
        localStorage.setItem("user_name", name.trim());
        localStorage.setItem("plursky_display_name", name.trim());
      }
    } catch {}
    onDone();
  };
  const next = () => setStep(s => s + 1);

  const STEPS = [
    {
      kicker: "WELCOME",
      title: <>Welcome to <span style={{ fontStyle: "italic", color: "var(--ember)" }}>Plursky</span></>,
      body: "Your online-first companion for EDC Las Vegas 2026 — and it still works when service drops at the festival. Lineup, stage map, friends, sunrise sets — all in one place.",
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
                      <span className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--muted)" }}>{DAY_LABEL[a.day]} {fmt12(a.start)}–{fmt12(a.end)}</span>
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

// ── Lightweight global toast (anyone can call window.plurskyToast) ──
// Used by save/unsave heart-tap and other quick confirmations.
function ToastHost() {
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => {
    window.plurskyToast = (text) => {
      setMsg(null);
      requestAnimationFrame(() => setMsg({ text, id: Date.now() }));
      try { navigator.vibrate?.(15); } catch {}
    };
    return () => { delete window.plurskyToast; };
  }, []);
  React.useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1600);
    return () => clearTimeout(t);
  }, [msg?.id]);
  if (!msg) return null;
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 80, zIndex: 95,
      display: "flex", justifyContent: "center", pointerEvents: "none",
    }}>
      <div className="mono" style={{
        background: "var(--ink)", color: "var(--paper)",
        padding: "9px 16px", borderRadius: 999,
        fontSize: 11, letterSpacing: 1.2, fontWeight: 600,
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        animation: "fadeIn .15s",
      }}>{msg.text}</div>
    </div>
  );
}

function App() {
  // First-time visitors get the welcome wizard auto-fired (hybrid C):
  // the wizard collects name + offers Spotify/notifications, but every
  // step is skippable and the empty-state nudges on Home pick up the rest
  // for anyone who skips through.
  const [showOnboarding, setShowOnboarding] = React.useState(() => {
    try { return localStorage.getItem("onboarded") !== ONBOARD_VERSION; }
    catch { return false; }
  });
  const [searchOpen, setSearchOpen] = React.useState(false);
  React.useEffect(() => {
    window.plurskyOpenOnboarding = () => setShowOnboarding(true);
    return () => { delete window.plurskyOpenOnboarding; };
  }, []);
  const { perm: notifPerm, showLocal } = useNotifications();
  const [state, setState] = React.useState(() => {
    let saved;
    try {
      const raw = localStorage.getItem(_SAVED_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}

    // Parse deep-link params: ?artist=ID, ?tab=map, ?stage=kinetic, ?day=1, ?lineup=k9,k11,c5
    const params = new URLSearchParams(window.location.search);
    const dlArtist = params.get("artist");
    const dlTab    = params.get("tab");
    const dlStage  = params.get("stage");
    const dlDay    = params.get("day");
    const dlLineup = params.get("lineup");
    const dlFrom   = params.get("from"); // optional friend name
    const dlCrew   = params.get("crew"); // crew code from a shared invite link
    const validArtist = dlArtist && ARTISTS.find(a => a.id === dlArtist) ? dlArtist : null;
    const validTab    = ["home","map","lineup","spotify","me"].includes(dlTab) ? dlTab : null;
    const validStage  = dlStage && STAGES.find(s => s.id === dlStage || s.short.toLowerCase() === dlStage.toLowerCase()) ? dlStage : null;
    const validDay    = dlDay && [1,2,3].includes(+dlDay) ? +dlDay : null;
    // Decode shared lineup: comma-joined IDs validated against the local lineup so
    // a stale or malicious URL can't inject phantom artists.
    const validFriendIds = dlLineup
      ? dlLineup.split(",").map(s => s.trim()).filter(id => ARTISTS.find(a => a.id === id))
      : [];
    const validFrom = (dlFrom || "").slice(0, 24).replace(/[^a-zA-Z0-9 _.-]/g, "") || null;
    // Crew codes are short alphanumerics — sanitise hard so a malformed link
    // can't poison the localStorage key that scopes our presence channel.
    const validCrew = (dlCrew || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || null;
    if (validCrew) {
      try { localStorage.setItem("plursky_group_code", validCrew); } catch {}
      // Flag for CrewCard mount to auto-join the broadcast channel — otherwise
      // a friend who opens the share link sets the code locally but never
      // subscribes, so neither side sees the other in the crew.
      try { localStorage.setItem("plursky_crew_autojoin", "1"); } catch {}
      // Migrate any active presence to the crew-scoped channel. Safe no-op if
      // the user hasn't joined presence yet — sbPresenceJoin will pick the
      // crew channel automatically the next time it's called.
      try { window.sbPresenceRefresh?.(); } catch {}
    }

    // Clean the URL without reloading (so back button / sharing still works)
    if (dlArtist || dlTab || dlStage || dlDay || dlLineup || dlFrom || dlCrew) {
      try { history.replaceState(null, "", window.location.pathname); } catch {}
    }

    return {
      // Crew deep-link without an explicit tab routes to Me so CrewCard mounts
      // and auto-joins (otherwise the friend never subscribes to broadcasts).
      tab:             (validStage ? "lineup" : validTab) || (validCrew ? "me" : "home"),
      saved:           saved ?? [],
      spotifyConnected: spotifyTokenValid(),
      artist:          validArtist,
      focusStage:      validStage || null,
      lineupDay:       validDay || NOW.day,
      friendLineup:    validFriendIds.length ? validFriendIds : null,
      friendName:      validFriendIds.length ? validFrom : null,
    };
  });

  React.useEffect(() => {
    try { localStorage.setItem(_SAVED_KEY, JSON.stringify(state.saved)); } catch {}
  }, [state.saved]);

  // Auto-schedule push reminders whenever saves change (if permission already granted)
  React.useEffect(() => {
    if (notifPerm === "granted") scheduleReminders(state, showLocal);
  }, [state.saved.join(","), notifPerm]);

  // Cloud-backup auto-push: when the user is signed in to Supabase, push their
  // saved lineup + notes 1s after the most recent change. Silent — the cloud
  // card already shows sync status. When NOT signed in, fire a one-time toast
  // after the first save so users know cloud backup exists.
  React.useEffect(() => {
    if (!state.saved.length) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const user = window.sbGetUser ? await window.sbGetUser() : null;
        if (user && window.sbPush) {
          let notes = {};
          try { notes = JSON.parse(localStorage.getItem("artist_notes_v1") || "{}"); } catch {}
          await window.sbPush(state.saved, notes);
        } else {
          const seen = (() => { try { return localStorage.getItem("cloud_nudge_seen") === "1"; } catch { return false; } })();
          if (!seen && typeof window.plurskyToast === "function") {
            try { localStorage.setItem("cloud_nudge_seen", "1"); } catch {}
            window.plurskyToast("Saved. Sign in on Me tab to back up.");
          }
        }
      } catch {}
    }, 1000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [state.saved.join(",")]);

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
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: "var(--top-pad, 54px)" }}>
        <StatusStrip />
        <div style={{ flex: 1, position: "relative" }}>
          {body}
          {/* Search FAB — floats above TabBar, accessible from any screen.
              Labeled pill so first-time users actually notice it. */}
          {!state.artist && !searchOpen && (
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search artists, stages, genres"
              style={{
                position: "absolute", bottom: 16, right: 16, zIndex: 30,
                height: 42, borderRadius: 999, padding: "0 16px 0 12px",
                background: "var(--ink)", color: "var(--paper)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
                fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 700,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21 L16.65 16.65"/>
              </svg>
              SEARCH
            </button>
          )}
          <ToastHost />
        </div>
        {!state.artist && (
          <TabBar
            active={state.tab === "spotify" ? "me" : state.tab}
            onChange={t => setState({ ...state, tab: t })}
          />
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
  /* Lineup highlight-on-arrival — flashes the card/grid block the user
     just navigated to from the ArtistScreen "SCHEDULE" handoff. */
  @keyframes lineupFlash {
    0%   { box-shadow: 0 0 0 0   rgba(232,93,46,0.55), inset 0 0 0 2px var(--ember); background-color: rgba(232,93,46,0.16); }
    60%  { box-shadow: 0 0 0 10px rgba(232,93,46,0),    inset 0 0 0 2px var(--ember); background-color: rgba(232,93,46,0.10); }
    100% { box-shadow: 0 0 0 0   rgba(232,93,46,0),    inset 0 0 0 0 rgba(232,93,46,0); background-color: transparent; }
  }
  /* Iso-mode sprite bob — bounces along the post-rotation Y axis so the
     character feels alive when standing on the tilted ground plane. */
  @keyframes isoBob { 0%,100% { translate: 0 0; } 50% { translate: 0 -6px; } }
  @keyframes isoShadowPulse { 0%,100% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; } 50% { transform: translate(-50%, -50%) scale(0.82); opacity: 0.35; } }
`;
document.head.appendChild(styleTag);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
