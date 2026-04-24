// Artist detail — shown as a modal-style pane when state.artist is set

function ArtistScreen({ state, setState }) {
  const a = ARTISTS.find(ar => ar.id === state.artist);
  if (!a) return null;
  const stage = STAGES.find(s => s.id === a.stage);
  const saved = state.saved.includes(a.id);

  return (
    <Screen bg="var(--paper)">
      {/* Hero */}
      <div style={{
        height: 260, position: "relative",
        background: a.img,
        color: "#fff",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 40%, rgba(26,18,13,0.85) 100%)",
        }} />
        <button onClick={() => setState({ ...state, artist: null })} style={{
          position: "absolute", top: 14, left: 14,
          width: 38, height: 38, borderRadius: 38,
          background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "#fff", cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>←</button>

        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6 }}>
          <Pill tone="outline" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", backdropFilter: "blur(8px)", borderColor: "rgba(255,255,255,0.3)" }}>
            DAY {a.day} · {a.start}
          </Pill>
        </div>

        <div style={{ position: "absolute", bottom: 14, left: 18, right: 18 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.4, opacity: 0.85, marginBottom: 6 }}>
            {a.country} · {a.genre.toUpperCase()}
          </div>
          <div className="serif" style={{ fontSize: 48, lineHeight: 0.9, letterSpacing: -1 }}>{a.name}</div>
        </div>
      </div>

      <ScrollBody style={{ padding: "18px 20px 24px" }}>
        {/* Stage & time */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: 14,
          background: "var(--paper-2)",
          borderRadius: 14,
          marginBottom: 16,
        }}>
          <div style={{ width: 6, alignSelf: "stretch", background: stage.color, borderRadius: 3 }} />
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 20, lineHeight: 1 }}>{stage.name}</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
              {DAYS.find(d => d.n === a.day).label} · {a.start}–{a.end}
            </div>
          </div>
          <button onClick={() => setState({ ...state, tab: "map", focusStage: a.stage, artist: null })} style={{
            background: "transparent", border: "1px solid var(--line-2)",
            borderRadius: 999, padding: "8px 12px",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2,
            cursor: "pointer",
          }}>ON MAP</button>
        </div>

        {/* Bio */}
        <div className="serif" style={{ fontSize: 20, lineHeight: 1.35, marginBottom: 18, textWrap: "pretty" }}>
          {a.bio}
        </div>

        {/* Spotify-style preview */}
        <div style={{
          background: "var(--ink)", color: "var(--paper)",
          borderRadius: 16, padding: 14, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 42,
            background: "var(--success)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
              <path d="M8 5 L19 12 L8 19 Z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 16 }}>Essential Tracks</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "rgba(247,237,224,0.55)", marginTop: 2 }}>
              3 MIN PREVIEW · VIA SPOTIFY
            </div>
          </div>
          {/* Waveform */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 22 }}>
            {[8,14,18,12,20,16,10,16,20,14,8].map((h,i) => (
              <div key={i} style={{
                width: 2, height: h,
                background: i < 4 ? "var(--success)" : "rgba(247,237,224,0.3)",
                borderRadius: 2,
              }} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => toggleSave(state, setState, a.id)} style={{
            flex: 1,
            padding: "14px",
            borderRadius: 14,
            background: saved ? "var(--ink)" : "var(--ember)",
            color: saved ? "var(--paper)" : "#fff",
            border: "none", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 500,
          }}>{saved ? "✓ SAVED TO LINEUP" : "+ ADD TO LINEUP"}</button>
          <button style={{
            width: 54,
            borderRadius: 14,
            background: "transparent",
            border: "1px solid var(--line-2)",
            cursor: "pointer", fontSize: 20,
          }}>♡</button>
        </div>
      </ScrollBody>
    </Screen>
  );
}

Object.assign(window, { ArtistScreen });
