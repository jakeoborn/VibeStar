// Spotify / Music + Me (profile/friends) screens

function SpotifyScreen({ state, setState }) {
  const connected = state.spotifyConnected;

  const recs = ARTISTS.slice(0, 6);

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Music</span>} sub="SOUNDTRACK" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 24px" }}>
        {/* Connect card */}
        <div style={{
          borderRadius: 20, padding: 20,
          background: connected ? "var(--success)" : "var(--ink)",
          color: "var(--paper)",
          marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="#1DB954" style={{ position: "absolute", top: 16, right: 16, opacity: 0.9 }}>
            <circle cx="12" cy="12" r="11" fill="#1DB954" />
            <path d="M6 10 Q12 8 18 11" stroke="#000" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <path d="M7 13 Q12 11.5 17 14" stroke="#000" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <path d="M8 15.8 Q12 14.5 16 16.5" stroke="#000" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: 0.7, marginBottom: 8 }}>
            {connected ? "CONNECTED" : "CONNECT SPOTIFY"}
          </div>
          <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: -0.3, marginBottom: 12, maxWidth: "70%" }}>
            {connected
              ? <>Your festival mix is <span style={{ fontStyle: "italic" }}>ready</span></>
              : <>We'll build your <span style={{ fontStyle: "italic" }}>perfect</span> lineup</>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.45, marginBottom: 16, maxWidth: "90%" }}>
            {connected
              ? "12 artists auto-saved based on your top tracks from the last 6 months."
              : "Link your account and we'll suggest sets based on your top tracks, genres, and recent plays."}
          </div>
          <button onClick={() => setState({ ...state, spotifyConnected: !connected })} style={{
            background: "var(--paper)", color: "var(--ink)", border: "none",
            borderRadius: 999, padding: "11px 18px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 500,
          }}>{connected ? "DISCONNECT" : "CONNECT ACCOUNT"}</button>
        </div>

        {/* Recommended */}
        <div className="serif" style={{ fontSize: 24, letterSpacing: -0.3, marginBottom: 2 }}>
          {connected ? "From your top artists" : "Popular this year"}
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginBottom: 14 }}>
          TAP + TO SAVE · ♪ TO PREVIEW
        </div>

        {recs.map(a => (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 0", borderBottom: "1px solid var(--line)",
          }}>
            <ArtistSwatch artist={a} size={48} />
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                 onClick={() => setState({ ...state, tab: "home", artist: a.id })}>
              <div className="serif" style={{ fontSize: 18, lineHeight: 1.1 }}>{a.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>
                {a.genre} · {STAGES.find(s => s.id === a.stage).name}
              </div>
            </div>
            <button style={{
              width: 34, height: 34, borderRadius: 34,
              background: "var(--success)", border: "none", color: "#fff",
              cursor: "pointer", fontSize: 14,
            }}>▶</button>
            <button onClick={() => toggleSave(state, setState, a.id)} style={{
              width: 34, height: 34, borderRadius: 34,
              background: state.saved.includes(a.id) ? "var(--ember)" : "transparent",
              color: state.saved.includes(a.id) ? "#fff" : "var(--ink)",
              border: state.saved.includes(a.id) ? "none" : "1px solid var(--line-2)",
              cursor: "pointer", fontSize: 18, fontWeight: 300,
            }}>{state.saved.includes(a.id) ? "✓" : "+"}</button>
          </div>
        ))}
      </ScrollBody>
    </Screen>
  );
}

function MeScreen({ state, setState }) {
  const friends = [
    { name: "Remi",   color: "#e85d2e", at: "Sun Temple",   dist: "Here" },
    { name: "Juno",   color: "#7b3d9a", at: "Mirage",       dist: "4 min walk" },
    { name: "Cass",   color: "#f59a36", at: "Dust Chapel",  dist: "8 min walk" },
    { name: "Theo",   color: "#6f8fb8", at: "En route",     dist: "Approaching" },
  ];
  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px" }}>
        <TopBar title={<span>Me</span>} sub="EDC · LAS VEGAS 2026" tight />
      </div>

      <ScrollBody style={{ padding: "10px 20px 24px" }}>
        {/* Profile card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "16px",
          background: "var(--paper-2)",
          borderRadius: 16,
          marginBottom: 18,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 60,
            background: "linear-gradient(135deg, var(--ember), var(--horizon))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Instrument Serif, serif", fontSize: 26, color: "#fff",
          }}>A</div>
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>Ava Torres</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3 }}>
              3-DAY PASS · GA+ · WRISTBAND #EDC-9122
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { n: state.saved.length, l: "SAVED" },
            { n: "3.2", l: "KM TODAY" },
            { n: "7", l: "STAMPS" },
          ].map(s => (
            <div key={s.l} style={{
              padding: 14, borderRadius: 12,
              background: "var(--paper)",
              border: "1px solid var(--line)",
              textAlign: "center",
            }}>
              <div className="serif" style={{ fontSize: 28, lineHeight: 1 }}>{s.n}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Friends */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="serif" style={{ fontSize: 22 }}>Friends at EDC</div>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>4 LIVE</span>
        </div>

        {friends.map(f => (
          <div key={f.name} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            marginBottom: 8,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 38,
              background: f.color, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 18,
              position: "relative",
            }}>{f.name[0]}
              <div style={{
                position: "absolute", bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: 11,
                background: "var(--success)",
                border: "2px solid var(--paper)",
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1 }}>{f.name}</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 3, textTransform: "uppercase" }}>
                {f.at} · {f.dist}
              </div>
            </div>
            <button onClick={() => setState({ ...state, tab: "map" })} style={{
              background: "transparent", border: "1px solid var(--line-2)",
              borderRadius: 999, padding: "6px 10px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
            }}>LOCATE</button>
          </div>
        ))}

        {/* Memories / photo feed */}
        <div className="serif" style={{ fontSize: 22, marginTop: 20, marginBottom: 10 }}>Memories</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ARTISTS.slice(0, 6).map(a => (
            <div key={a.id} style={{
              aspectRatio: "1/1", borderRadius: 10,
              background: a.img,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5))",
              }}/>
              <div style={{ position: "absolute", bottom: 5, left: 6, right: 6, color: "#fff" }} className="mono">
                <span style={{ fontSize: 8, letterSpacing: 1, opacity: 0.9 }}>{a.start}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 20 }} />
      </ScrollBody>
    </Screen>
  );
}

Object.assign(window, { SpotifyScreen, MeScreen });
