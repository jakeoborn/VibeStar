// Artist detail — shown as a modal-style pane when state.artist is set

const ARTIST_NOTES_KEY = "artist_notes_v1";
function _getArtistNotes() {
  try { return JSON.parse(localStorage.getItem(ARTIST_NOTES_KEY) || "{}"); }
  catch { return {}; }
}

function ArtistScreen({ state, setState }) {
  const a = ARTISTS.find(ar => ar.id === state.artist);
  if (!a) return null;
  const stage = STAGES.find(s => s.id === a.stage);
  const artistImages = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem("artist_images_v1") || "{}"); } catch { return {}; }
  }, []);
  const heroPhoto = artistImages[a.name.toLowerCase()];
  const saved = state.saved.includes(a.id);
  const [note, setNote] = React.useState(() => _getArtistNotes()[a.id] || "");
  const handleNote = (text) => {
    setNote(text);
    const notes = _getArtistNotes();
    if (text.trim()) notes[a.id] = text; else delete notes[a.id];
    try { localStorage.setItem(ARTIST_NOTES_KEY, JSON.stringify(notes)); } catch {}
  };

  // ── Preview player state ──────────────────────────────────
  const audioRef = React.useRef(null);
  const [preview,     setPreview]     = React.useState(null); // null | "loading" | "none" | {url,name}
  const [playing,     setPlaying]     = React.useState(false);
  const [waveHeights, setWaveHeights] = React.useState([5,9,14,10,18,13,8,15,18,11,6]);

  const isSpotifyConnected = () => {
    const token   = localStorage.getItem("spotify_token");
    const expires = localStorage.getItem("spotify_expires");
    return !!(token && expires && Date.now() < parseInt(expires));
  };

  // Stop audio and reset when navigating away
  React.useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  // Animate waveform while playing
  React.useEffect(() => {
    if (!playing) { setWaveHeights([5,9,14,10,18,13,8,15,18,11,6]); return; }
    const id = setInterval(() => {
      setWaveHeights(prev => prev.map(h => Math.max(3, Math.min(20, h + (Math.random() - 0.5) * 7))));
    }, 120);
    return () => clearInterval(id);
  }, [playing]);

  const handlePreview = async () => {
    if (!isSpotifyConnected()) return;
    if (preview === "loading" || preview === "none") return;

    // First tap — fetch the preview URL
    if (!preview) {
      setPreview("loading");
      const result = await fetchPreviewUrl(a.name);
      if (!result) { setPreview("none"); return; }
      setPreview(result);
      audioRef.current = new Audio(result.url);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.play();
      setPlaying(true);
      return;
    }

    // Already loaded — toggle play/pause
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const connected = isSpotifyConnected();

  return (
    <Screen bg="var(--paper)">
      {/* Hero */}
      <div style={{
        height: 260, position: "relative",
        background: heroPhoto ? "var(--ink)" : a.img,
        backgroundImage: heroPhoto ? `url(${heroPhoto})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center top",
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
            {a.genre.toUpperCase()}
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

        {/* Personal note */}
        <div style={{ marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            MY NOTE
            {note.trim() && <span style={{ width: 5, height: 5, borderRadius: 5, background: "var(--ember)" }} />}
          </div>
          <textarea
            value={note}
            onChange={e => handleNote(e.target.value)}
            placeholder="heard at Ultra 2024 · Alex recommended · must see"
            rows={2}
            style={{
              width: "100%", padding: "10px 12px", boxSizing: "border-box",
              background: "var(--paper-2)", border: "1px solid var(--line-2)",
              borderRadius: 12, resize: "none",
              fontFamily: "Geist, sans-serif", fontSize: 14, lineHeight: 1.4,
              color: "var(--ink)", outline: "none",
            }}
          />
        </div>

        {/* ── Preview player ────────────────────────────────── */}
        <div style={{
          background: "var(--ink)", color: "var(--paper)",
          borderRadius: 16, padding: 14, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {/* Play/Pause button */}
          <button onClick={handlePreview} style={{
            width: 44, height: 44, borderRadius: 44, border: "none",
            background: !connected ? "rgba(247,237,224,0.1)"
              : playing ? "var(--ember)"
              : "#1DB954",
            cursor: connected && preview !== "none" ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "background 0.2s",
          }}>
            {preview === "loading" ? (
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.35)",
                borderTopColor: "#fff",
                animation: "spin 0.75s linear infinite",
              }} />
            ) : playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                <rect x="5" y="4" width="4" height="16" rx="1"/>
                <rect x="15" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M8 5 L19 12 L8 19 Z"/>
              </svg>
            )}
          </button>

          {/* Track info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 16, lineHeight: 1.1 }}>
              {preview && typeof preview === "object" ? preview.name : "30-sec Preview"}
            </div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "rgba(247,237,224,0.5)", marginTop: 3 }}>
              {!connected     ? "CONNECT SPOTIFY TO PREVIEW"
               : preview === "none"    ? "NO PREVIEW AVAILABLE"
               : preview === "loading" ? "LOADING…"
               : playing               ? "PLAYING · VIA SPOTIFY"
               :                         "TAP TO PLAY · 30 SEC"}
            </div>
          </div>

          {/* Animated waveform */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 22, flexShrink: 0 }}>
            {waveHeights.map((h, i) => (
              <div key={i} style={{
                width: 2.5, height: h,
                background: playing
                  ? (i % 2 === 0 ? "var(--ember)" : "#f59a36")
                  : connected ? "#1DB954" : "rgba(247,237,224,0.2)",
                borderRadius: 2,
                transition: "height 0.12s ease, background 0.3s",
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
