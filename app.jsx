// Main app — iOS frame + routing

function spotifyTokenValid() {
  const token = localStorage.getItem("spotify_token");
  const expires = localStorage.getItem("spotify_expires");
  return !!(token && expires && Date.now() < parseInt(expires));
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

function App() {
  const [showOnboarding, setShowOnboarding] = React.useState(() => {
    try { return localStorage.getItem("onboarded") !== ONBOARD_VERSION; }
    catch { return false; }
  });
  const [state, setState] = React.useState({
    tab: "home",
    saved: ["k9", "k11", "k4", "c5", "w1"],
    spotifyConnected: spotifyTokenValid(),
    artist: null,
    focusStage: null,
    lineupDay: NOW.day,
  });

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
        </div>
        {!state.artist && (
          <TabBar active={state.tab} onChange={t => setState({ ...state, tab: t })} />
        )}
      </div>
      {showOnboarding && (
        <OnboardingModal
          state={state}
          setState={setState}
          onDone={() => setShowOnboarding(false)}
        />
      )}
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
`;
document.head.appendChild(styleTag);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
