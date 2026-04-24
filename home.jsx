// Home / "Today" screen — now playing + schedule preview

function HomeScreen({ state, setState }) {
  const [alertsOpen, setAlertsOpen] = React.useState(false);
  const [offline, setOffline] = React.useState(state.offline || false);
  const unread = (state.alerts || ALERTS).filter(a => a.unread).length;

  const current = ARTISTS.find(a => a.id === NOW.currentArtistId);
  const next    = ARTISTS.find(a => a.id === NOW.nextArtistId);
  const stageOf = id => STAGES.find(s => s.id === id);

  const totalMin = 90;
  const progress = NOW.elapsedMin / totalMin;
  const minsLeft = totalMin - NOW.elapsedMin;

  // Upcoming today for saved lineup
  const savedToday = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(a => a && a.day === NOW.day && a.id !== NOW.currentArtistId)
    .slice(0, 4);

  return (
    <Screen bg="var(--paper)">
      {/* Masthead */}
      <div style={{
        padding: "8px 20px 14px",
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Wordmark size={16} />
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
        <div className="serif" style={{ fontSize: 36, lineHeight: 0.95, letterSpacing: -0.5 }}>
          Friday at <span style={{ fontStyle: "italic", color: "var(--ember)" }}>EDC</span>
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: "var(--muted)", marginTop: 6 }}>
          LAS VEGAS MOTOR SPEEDWAY · MAY 15–17 · 97°F · SUNSET 19:52
        </div>
      </div>

      <ScrollBody style={{ padding: "16px 16px 24px" }}>
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
              UP NEXT · IN 48 MIN
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

        {/* Your schedule */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="serif" style={{ fontSize: 24, letterSpacing: -0.3 }}>
            Your night, <span style={{ fontStyle: "italic" }}>mapped</span>
          </div>
          <button onClick={() => setState({ ...state, tab: "lineup" })} className="mono" style={{
            background: "none", border: "none", fontSize: 10, letterSpacing: 1.2,
            color: "var(--muted)", cursor: "pointer", textTransform: "uppercase",
          }}>All →</button>
        </div>

        {savedToday.length === 0 ? (
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
        ) : savedToday.map(a => (
          <SetRow key={a.id} artist={a} onClick={() => setState({ ...state, tab: "home", artist: a.id })} />
        ))}

        {/* Safety/info strip */}
        <div style={{
          marginTop: 18,
          background: "var(--night)",
          borderRadius: 16,
          padding: 16,
          color: "var(--paper)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="var(--flare)" strokeWidth="1.4" />
            <path d="M12 7 V13" stroke="var(--flare)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="16" r="0.8" fill="var(--flare)" />
          </svg>
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 16, lineHeight: 1.1 }}>Hydrate. Wind gust 18mph at 23:00.</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "rgba(247,237,224,0.55)", marginTop: 3 }}>
              MEDICS · MAP → LOOKOUT POINT
            </div>
          </div>
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
        <AlertsDrawer alerts={state.alerts || ALERTS} onClose={() => {
          setAlertsOpen(false);
          // mark read
          setState({ ...state, alerts: (state.alerts || ALERTS).map(a => ({ ...a, unread: false })) });
        }} onOpenMap={() => { setAlertsOpen(false); setState({ ...state, tab: "map" }); }}
          onOpenLineup={() => { setAlertsOpen(false); setState({ ...state, tab: "lineup" }); }}
        />
      )}
    </Screen>
  );
}

function SetRow({ artist, onClick }) {
  const stage = STAGES.find(s => s.id === artist.stage);
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 4px",
      borderBottom: "1px solid var(--line)",
      cursor: "pointer",
    }}>
      <div className="mono" style={{
        fontSize: 11, letterSpacing: 1, width: 44,
        color: "var(--ink)",
      }}>{artist.start}</div>
      <div style={{
        width: 3, alignSelf: "stretch", background: stage.color, borderRadius: 3,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="serif" style={{ fontSize: 20, lineHeight: 1.1 }}>{artist.name}</div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>
          {stage.name.toUpperCase()} · {artist.genre.toUpperCase()}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M9 6 L15 12 L9 18" />
      </svg>
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

Object.assign(window, { HomeScreen });