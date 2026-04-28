// Artist detail — shown as a modal-style pane when state.artist is set

// ── Setlist.fm ─────────────────────────────────────────────────
// Free API key at https://api.setlist.fm — paste yours below.
const SETLISTFM_KEY = "Fjj0gHyGxSTN4TfFc_K76CV-KAoTGE1SksfU";
const _SL_TTL = 24 * 3600000; // cache 24 h

async function fetchSetlists(artistName) {
  if (!SETLISTFM_KEY) return null;
  const cacheKey = `setlist_${artistName.toLowerCase().replace(/\W+/g, "_")}_v1`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c && Date.now() - c.fetchedAt < _SL_TTL) return c.data;
  } catch {}
  try {
    const res = await fetch(
      `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artistName)}&p=1`,
      { headers: { "x-api-key": SETLISTFM_KEY, "Accept": "application/json" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    // Keep up to 3 setlists that actually have songs documented
    const lists = (json.setlist || [])
      .filter(s => (s.sets?.set || []).some(set => (set.song || []).length > 0))
      .slice(0, 3);
    try { localStorage.setItem(cacheKey, JSON.stringify({ data: lists, fetchedAt: Date.now() })); } catch {}
    return lists;
  } catch { return []; }
}

function _slDate(d) {
  // "17-05-2024" → "May 17, 2024"
  const [day, m, y] = d.split("-");
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+day}, ${y}`;
}
function _slIsEdc(sl) {
  const v = (sl.venue?.name || "").toLowerCase();
  const c = (sl.venue?.city?.name || "").toLowerCase();
  return v.includes("edc") || v.includes("las vegas motor") ||
    v.includes("kinetic") || v.includes("cosmic") || v.includes("circuit") ||
    (v.includes("las vegas") && c.includes("las vegas"));
}

// ── YouTube ────────────────────────────────────────────────────
// Free API key (quota: 10 000 units/day) at https://console.cloud.google.com
// Enable "YouTube Data API v3", create an API key, paste below.
const YOUTUBE_KEY = "AIzaSyDl2DjwIVG-cTN-KBaJkMNmtFRKVLvPLOo";
const _YT_TTL = 24 * 3600000;

async function fetchYouTubeSet(artistName) {
  if (!YOUTUBE_KEY) return null;
  const cacheKey = `yt_${artistName.toLowerCase().replace(/\W+/g, "_")}_v1`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c && Date.now() - c.fetchedAt < _YT_TTL) return c.data;
  } catch {}
  try {
    const q = encodeURIComponent(`${artistName} live set full`);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${YOUTUBE_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const items = (json.items || []).filter(i => i.id?.videoId);
    if (!items.length) return null;
    // Prefer results that mention EDC, festival, or live in the title
    const scored = items.map(i => {
      const t = (i.snippet?.title || "").toLowerCase();
      return { i, score: (t.includes("edc") ? 3 : 0) + (t.includes("festival") ? 2 : 0) + (t.includes("live") ? 1 : 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].i;
    const data = {
      videoId: best.id.videoId,
      title: best.snippet?.title || "",
      thumbnail: best.snippet?.thumbnails?.high?.url || best.snippet?.thumbnails?.default?.url || "",
    };
    try { localStorage.setItem(cacheKey, JSON.stringify({ data, fetchedAt: Date.now() })); } catch {}
    return data;
  } catch { return null; }
}

// ── Last.fm ────────────────────────────────────────────────────
// Free API key at https://www.last.fm/api/account/create
const LASTFM_KEY = "aae1625166e1c4fa3197ef44774c4ead";
const _LFM_TTL = 24 * 3600000;

async function fetchLastfm(artistName) {
  if (!LASTFM_KEY) return null;
  const cacheKey = `lfm_${artistName.toLowerCase().replace(/\W+/g, "_")}_v1`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c && Date.now() - c.fetchedAt < _LFM_TTL) return c.data;
  } catch {}
  try {
    const base = `https://ws.audioscrobbler.com/2.0/?format=json&api_key=${LASTFM_KEY}`;
    const enc  = encodeURIComponent(artistName);
    const [infoRes, simRes] = await Promise.all([
      fetch(`${base}&method=artist.getinfo&artist=${enc}`),
      fetch(`${base}&method=artist.getsimilar&artist=${enc}&limit=5`),
    ]);
    const infoJson = infoRes.ok ? await infoRes.json() : null;
    const simJson  = simRes.ok  ? await simRes.json()  : null;

    const info    = infoJson?.artist;
    const similar = (simJson?.similarartists?.artist || []).slice(0, 5);

    // Listeners / play count
    const listeners  = parseInt(info?.stats?.listeners  || "0", 10);
    const playcount  = parseInt(info?.stats?.playcount  || "0", 10);

    // Top tags (skip generic ones)
    const SKIP = new Set(["seen live","male vocalists","all","pop"]);
    const tags = (info?.tags?.tag || [])
      .map(t => t.name)
      .filter(t => !SKIP.has(t.toLowerCase()))
      .slice(0, 5);

    // Bio summary — strip Last.fm attribution footer
    const rawBio = info?.bio?.summary || "";
    const bio = rawBio.replace(/<a[^>]*>.*?<\/a>/gi, "").replace(/<[^>]+>/g, "").trim().split("\n")[0].slice(0, 280);

    const data = { listeners, playcount, tags, bio, similar, url: info?.url || null };
    try { localStorage.setItem(cacheKey, JSON.stringify({ data, fetchedAt: Date.now() })); } catch {}
    return data;
  } catch { return null; }
}

function _fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ── Ticketmaster ───────────────────────────────────────────────
// Free key (5 000 calls/day) at https://developer.ticketmaster.com
const TICKETMASTER_KEY = "GKAPS1SP4GIKOCNfR5iTDyzqR0G2yuxE";
const _TM_TTL = 6 * 3600000; // cache 6 h (events change more often)

async function fetchTicketmaster(artistName) {
  if (!TICKETMASTER_KEY) return null;
  const cacheKey = `tm_${artistName.toLowerCase().replace(/\W+/g, "_")}_v1`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c && Date.now() - c.fetchedAt < _TM_TTL) return c.data;
  } catch {}
  try {
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?keyword=${encodeURIComponent(artistName)}&classificationName=music` +
      `&sort=date,asc&size=6&apikey=${TICKETMASTER_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const events = (json._embedded?.events || []).map(ev => {
      const venue = ev._embedded?.venues?.[0] || {};
      const city  = venue.city?.name || "";
      const state = venue.state?.stateCode || venue.country?.countryCode || "";
      return {
        name:     ev.name,
        date:     ev.dates?.start?.localDate || "",
        time:     ev.dates?.start?.localTime || "",
        venueName: venue.name || "",
        location: [city, state].filter(Boolean).join(", "),
        url:      ev.url || null,
      };
    }).filter(ev => ev.date); // drop events with no date
    const data = events.slice(0, 5);
    try { localStorage.setItem(cacheKey, JSON.stringify({ data, fetchedAt: Date.now() })); } catch {}
    return data;
  } catch { return []; }
}

function _tmDate(d) {
  // "2026-08-14" → "Aug 14, 2026"
  const [y, m, day] = d.split("-");
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]} ${+day}, ${y}`;
}

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

  // ── Last.fm + Setlist.fm + YouTube state ────────────────
  const [lfm,      setLfm]      = React.useState(undefined); // undefined=loading, null=no key/err
  const [setlists, setSetlists] = React.useState(undefined);
  const [slExpanded, setSlExpanded] = React.useState({});
  const [ytVideo,   setYtVideo]   = React.useState(undefined);
  const [ytPlaying, setYtPlaying] = React.useState(false);
  const [tmEvents,  setTmEvents]  = React.useState(undefined);
  React.useEffect(() => {
    setYtPlaying(false);
    fetchLastfm(a.name).then(setLfm);
    fetchSetlists(a.name).then(setSetlists);
    fetchYouTubeSet(a.name).then(setYtVideo);
    fetchTicketmaster(a.name).then(setTmEvents);
  }, [a.id]);

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

        {/* ── Last.fm stats ─────────────────────────────────── */}
        {LASTFM_KEY && lfm && (
          <div style={{ marginBottom: 18 }}>
            {/* Listener + play count row */}
            {(lfm.listeners > 0 || lfm.playcount > 0) && (
              <div style={{
                display: "flex", gap: 10, marginBottom: 12,
              }}>
                {lfm.listeners > 0 && (
                  <div style={{
                    flex: 1, background: "var(--paper-2)", border: "1px solid var(--line)",
                    borderRadius: 12, padding: "10px 14px",
                  }}>
                    <div className="serif" style={{ fontSize: 22, lineHeight: 1, letterSpacing: -0.5 }}>
                      {_fmtCount(lfm.listeners)}
                    </div>
                    <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: "var(--muted)", marginTop: 4 }}>
                      MONTHLY LISTENERS
                    </div>
                  </div>
                )}
                {lfm.playcount > 0 && (
                  <div style={{
                    flex: 1, background: "var(--paper-2)", border: "1px solid var(--line)",
                    borderRadius: 12, padding: "10px 14px",
                  }}>
                    <div className="serif" style={{ fontSize: 22, lineHeight: 1, letterSpacing: -0.5 }}>
                      {_fmtCount(lfm.playcount)}
                    </div>
                    <div className="mono" style={{ fontSize: 8, letterSpacing: 1.3, color: "var(--muted)", marginTop: 4 }}>
                      TOTAL SCROBBLES
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Genre tags */}
            {lfm.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {lfm.tags.map(tag => (
                  <span key={tag} className="mono" style={{
                    fontSize: 9, letterSpacing: 1.1,
                    padding: "4px 10px",
                    background: "var(--paper-2)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 999,
                    color: "var(--muted)",
                  }}>{tag.toUpperCase()}</span>
                ))}
              </div>
            )}

            {/* Bio supplement — only show if not a stub */}
            {lfm.bio && lfm.bio.length > 40 && (
              <div style={{
                fontSize: 13, lineHeight: 1.55, color: "var(--muted)",
                marginBottom: 12,
              }}>
                {lfm.bio}
                {lfm.url && (
                  <a href={lfm.url} target="_blank" rel="noopener noreferrer" style={{
                    fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.1,
                    color: "var(--ember)", textDecoration: "none", marginLeft: 8,
                  }}>LAST.FM ↗</a>
                )}
              </div>
            )}

            {/* Fans also like */}
            {lfm.similar.length > 0 && (() => {
              const inLineup = lfm.similar.filter(s =>
                ARTISTS.some(ar => ar.name.toLowerCase() === s.name.toLowerCase())
              );
              const notInLineup = lfm.similar.filter(s =>
                !ARTISTS.some(ar => ar.name.toLowerCase() === s.name.toLowerCase())
              );
              const displayed = [...inLineup, ...notInLineup].slice(0, 5);
              return (
                <div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginBottom: 8 }}>
                    FANS ALSO LIKE
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {displayed.map(s => {
                      const lineupArtist = ARTISTS.find(ar => ar.name.toLowerCase() === s.name.toLowerCase());
                      return (
                        <button
                          key={s.name}
                          onClick={() => lineupArtist ? setState(st => ({ ...st, artist: lineupArtist.id })) : undefined}
                          style={{
                            background: lineupArtist ? "var(--ember)" : "var(--paper-2)",
                            border: lineupArtist ? "none" : "1px solid var(--line-2)",
                            borderRadius: 999,
                            padding: "6px 12px",
                            fontSize: 12,
                            color: lineupArtist ? "#fff" : "var(--ink)",
                            cursor: lineupArtist ? "pointer" : "default",
                            fontFamily: "Geist, sans-serif",
                            transition: "opacity 0.15s",
                          }}
                        >
                          {lineupArtist && <span style={{ marginRight: 4, fontSize: 10 }}>★</span>}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  {inLineup.length > 0 && (
                    <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "var(--muted)", marginTop: 6 }}>
                      ★ ALSO AT EDC LAS VEGAS
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── YouTube live set ─────────────────────────────── */}
        {(() => {
          const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.name + " live set EDC")}`;
          return (
            <div style={{ marginBottom: 18 }}>
              <div className="mono" style={{
                fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginBottom: 10,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                LIVE SET
                <a href={ytSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.1,
                  color: "var(--muted)", textDecoration: "none",
                }}>SEARCH YOUTUBE ↗</a>
              </div>

              {/* Loading */}
              {YOUTUBE_KEY && ytVideo === undefined && (
                <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>Loading…</div>
              )}

              {/* Thumbnail → tap to embed */}
              {YOUTUBE_KEY && ytVideo && !ytPlaying && (
                <div onClick={() => setYtPlaying(true)} style={{
                  position: "relative", borderRadius: 14, overflow: "hidden",
                  aspectRatio: "16/9", cursor: "pointer",
                  background: "var(--ink)",
                }}>
                  {ytVideo.thumbnail && (
                    <img src={ytVideo.thumbnail} alt={ytVideo.title} style={{
                      width: "100%", height: "100%", objectFit: "cover", display: "block",
                    }} />
                  )}
                  {/* Dark overlay */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 58, height: 58, borderRadius: 58,
                      background: "rgba(255,0,0,0.9)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                        <path d="M8 5 L19 12 L8 19 Z"/>
                      </svg>
                    </div>
                  </div>
                  {/* Title bar */}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 100%)",
                    padding: "28px 12px 10px",
                  }}>
                    <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.3 }}>{ytVideo.title}</div>
                    <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
                      TAP TO PLAY
                    </div>
                  </div>
                </div>
              )}

              {/* Inline iframe after tap */}
              {YOUTUBE_KEY && ytVideo && ytPlaying && (
                <div style={{ borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${ytVideo.videoId}?autoplay=1`}
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {/* No API key — just show the search link as a button */}
              {!YOUTUBE_KEY && (
                <a href={ytSearchUrl} target="_blank" rel="noopener noreferrer" style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "var(--paper-2)", border: "1px solid var(--line)",
                  borderRadius: 12, padding: "12px 14px", textDecoration: "none",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 36, background: "#ff0000",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5 L19 12 L8 19 Z"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>Watch on YouTube</div>
                    <div className="mono" style={{ fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 2 }}>
                      {a.name.toUpperCase()} LIVE SET · EDC
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 14 }}>↗</div>
                </a>
              )}
            </div>
          );
        })()}

        {/* ── Upcoming shows (Ticketmaster) ────────────────── */}
        {TICKETMASTER_KEY && (
          <div style={{ marginBottom: 18 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              UPCOMING SHOWS
              {tmEvents === undefined && <span style={{ fontSize: 8, opacity: 0.7 }}>LOADING…</span>}
            </div>

            {tmEvents !== undefined && tmEvents !== null && tmEvents.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>No upcoming shows found.</div>
            )}

            {Array.isArray(tmEvents) && tmEvents.map((ev, idx) => (
              <div key={idx} style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 12, padding: "11px 14px", marginBottom: 8,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                {/* Date block */}
                <div style={{
                  flexShrink: 0, textAlign: "center",
                  background: "var(--ember)", borderRadius: 8,
                  padding: "6px 10px", minWidth: 42,
                }}>
                  <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "rgba(255,255,255,0.75)" }}>
                    {ev.date ? _tmDate(ev.date).split(" ")[0].toUpperCase() : ""}
                  </div>
                  <div className="serif" style={{ fontSize: 20, lineHeight: 1, color: "#fff", letterSpacing: -0.5 }}>
                    {ev.date ? _tmDate(ev.date).split(" ")[1].replace(",","") : "—"}
                  </div>
                  <div className="mono" style={{ fontSize: 8, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" }}>
                    {ev.date ? ev.date.split("-")[0] : ""}
                  </div>
                </div>

                {/* Venue info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ev.venueName}
                  </div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 0.8, color: "var(--muted)", marginTop: 3 }}>
                    {ev.location}{ev.time ? ` · ${ev.time.slice(0,5)}` : ""}
                  </div>
                </div>

                {/* Ticket link */}
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{
                    flexShrink: 0,
                    fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.1,
                    color: "var(--ember)", textDecoration: "none",
                    border: "1px solid var(--ember)", borderRadius: 999,
                    padding: "5px 9px", whiteSpace: "nowrap",
                  }}>TICKETS ↗</a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Setlist history ───────────────────────────────── */}
        {SETLISTFM_KEY && (
          <div style={{ marginBottom: 18 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              SETLIST HISTORY
              {setlists === undefined && <span style={{ fontSize: 8, opacity: 0.7 }}>LOADING…</span>}
            </div>

            {setlists !== undefined && setlists !== null && setlists.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>No documented setlists found.</div>
            )}

            {Array.isArray(setlists) && setlists.map((sl, idx) => {
              const songs = (sl.sets?.set || []).flatMap(s => s.song || []);
              const isOpen = !!slExpanded[idx];
              const displaySongs = isOpen ? songs : songs.slice(0, 5);
              const isEdc = _slIsEdc(sl);
              const venue = sl.venue?.name || "";
              const city  = sl.venue?.city?.name || "";
              const state = sl.venue?.city?.stateCode || sl.venue?.city?.country?.code || "";
              return (
                <div key={idx} style={{
                  background: "var(--paper-2)", borderRadius: 12,
                  padding: "12px 14px", marginBottom: 10,
                  border: `1px solid ${isEdc ? "rgba(232,93,46,0.4)" : "var(--line)"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      {isEdc && (
                        <div className="mono" style={{ fontSize: 8, letterSpacing: 1.4, color: "var(--ember)", fontWeight: 700, marginBottom: 3 }}>
                          ★ EDC LAS VEGAS
                        </div>
                      )}
                      <div className="mono" style={{ fontSize: 10, letterSpacing: 0.8, color: "var(--ink)", fontWeight: 600 }}>
                        {_slDate(sl.eventDate)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {venue}{city ? ` · ${city}${state ? `, ${state}` : ""}` : ""}
                      </div>
                    </div>
                    {sl.url && (
                      <a href={sl.url} target="_blank" rel="noopener noreferrer" style={{
                        fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1.1,
                        color: "var(--muted)", textDecoration: "none", flexShrink: 0, marginLeft: 8, marginTop: 2,
                      }}>SETLIST.FM ↗</a>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                    {displaySongs.map((song, si) => (
                      <div key={si} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                        <span className="mono" style={{ fontSize: 9, color: "var(--muted)", width: 18, textAlign: "right", flexShrink: 0 }}>{si + 1}</span>
                        <span style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>{song.name}</span>
                        {song.tape && <span className="mono" style={{ fontSize: 8, color: "var(--muted)", letterSpacing: 1 }}>TAPE</span>}
                      </div>
                    ))}
                    {songs.length > 5 && (
                      <button onClick={() => setSlExpanded(e => ({ ...e, [idx]: !e[idx] }))} style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2,
                        color: "var(--ember)", padding: "6px 0 2px", display: "block",
                      }}>
                        {isOpen ? "SHOW LESS ↑" : `+${songs.length - 5} MORE SONGS ↓`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
