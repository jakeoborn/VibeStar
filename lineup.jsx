// Lineup / schedule screen — day tabs, stage-striped timeline list

// "Legendary" moments — auto-detected from the data so vets can surface
// the rare stuff (sunrise sets, B2Bs) without manual curation. Sunrise =
// any Kinetic Field set ending between 05:00 and 05:30 PT. B2B = any
// artist name with a "b2b" segment.
function isLegendary(a) {
  const name = (a.name || "").toLowerCase();
  if (name.includes("b2b") || name.includes("vs.") || name.includes(" x ")) return true;
  if (a.stage === "kinetic") {
    const [h, m] = a.end.split(":").map(Number);
    if (h >= 5 && h < 6) return true; // sunrise window
  }
  return false;
}

// ── ICS calendar export ──────────────────────────────────────
function _msToIcsDate(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

function _artistMs(artist, hhmm) {
  const day = FESTIVAL_CONFIG.dayDates[artist.day];
  if (!day) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return day.midnightUtc + (h < 8 ? 86400000 : 0) + h * 3600000 + m * 60000;
}

async function exportSavedSetsICS(savedIds) {
  const artists = ARTISTS.filter(a => savedIds.includes(a.id))
    .sort((a, b) => (a.day - b.day) || (a.start < b.start ? -1 : 1));
  if (!artists.length) return;

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
    `PRODID:-//Plursky//${FESTIVAL_CONFIG.name}//EN`,
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  artists.forEach(a => {
    const stage = STAGES.find(s => s.id === a.stage);
    const startMs = _artistMs(a, a.start);
    const endMs   = _artistMs(a, a.end);
    if (!startMs || !endMs) return;
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART:${_msToIcsDate(startMs)}`,
      `DTEND:${_msToIcsDate(endMs)}`,
      `SUMMARY:${a.name}${stage ? " @ " + stage.name : ""}`,
      `DESCRIPTION:${FESTIVAL_CONFIG.name}`,
      `LOCATION:${FESTIVAL_CONFIG.location}`,
      `UID:plursky-${a.id}@plursky.app`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n");
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const fileName = `${FESTIVAL_CONFIG.id}-plursky.ics`;
  const shareFile = new File([blob], fileName, { type: "text/plain" });
  if (navigator.canShare?.({ files: [shareFile] }) && navigator.share) {
    try { await navigator.share({ files: [shareFile], title: `My ${FESTIVAL_CONFIG.shortName || FESTIVAL_CONFIG.name}` }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    window.open(`data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`, "_blank");
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// ── Build My Night wizard ─────────────────────────────────────
function NightWizard({ state, setState, onClose }) {
  const [activeDay, setActiveDay] = React.useState(() => {
    const best = DAYS.map(d => ({
      n: d.n,
      count: ARTISTS.filter(a => a.day === d.n && state.saved.includes(a.id)).length,
    })).reduce((b, d) => d.count > b.count ? d : b, { n: 1, count: 0 });
    return best.n;
  });

  const [local, setLocal] = React.useState(() => new Set(state.saved));

  const dayStats = DAYS.map(d => {
    const sets = ARTISTS.filter(a => a.day === d.n && local.has(a.id));
    let clashes = 0;
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++)
        if (overlaps(sets[i], sets[j])) clashes++;
    return { ...d, count: sets.length, clashes };
  });

  const sorted = ARTISTS
    .filter(a => a.day === activeDay && local.has(a.id))
    .sort((a, b) => toNightMin(a.start) - toNightMin(b.start));

  const conflictIds = new Set();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (overlaps(sorted[i], sorted[j])) { conflictIds.add(sorted[i].id); conflictIds.add(sorted[j].id); }

  // Build interleaved timeline: sets + gap items
  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    items.push({ type: "set", artist: sorted[i] });
    if (i < sorted.length - 1) {
      const gS = toNightMin(sorted[i].end), gE = toNightMin(sorted[i + 1].start);
      if (gE > gS + 5) {
        const gapMin = gE - gS;
        const fits = ARTISTS.filter(a =>
          a.day === activeDay && !local.has(a.id) &&
          toNightMin(a.start) >= gS && toNightMin(a.start) < gE - 14
        ).sort((a, b) => b.tier - a.tier).slice(0, 3);
        items.push({ type: "gap", gapMin, endOf: sorted[i].end, startOf: sorted[i + 1].start, fits });
      }
    }
  }

  const drop = id => setLocal(p => { const n = new Set(p); n.delete(id); return n; });
  const add  = id => setLocal(p => new Set([...p, id]));

  const handleSave = () => {
    setState(st => ({ ...st, saved: Array.from(local) }));
    onClose();
  };

  const autoFill = () => {
    const candidates = ARTISTS.filter(a => a.day === activeDay)
      .sort((a, b) => (b.tier - a.tier) || (toNightMin(a.start) - toNightMin(b.start)));
    const picked = [];
    for (const a of candidates) {
      if (picked.length >= 8) break;
      if (!picked.some(p => overlaps(p, a))) picked.push(a);
    }
    setLocal(prev => {
      const merged = new Set(prev);
      // Remove existing day sets then add optimal picks
      ARTISTS.filter(a => a.day === activeDay).forEach(a => merged.delete(a.id));
      picked.forEach(a => merged.add(a.id));
      return merged;
    });
  };

  const sunrise = FESTIVAL_CONFIG.sunTimes[activeDay]?.rise;
  const fmtGap = m => m >= 60 ? `${Math.floor(m / 60)}H ${m % 60}M` : `${m}M`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 18px 12px",
        paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--line)",
      }}>
        <button onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 36, background: "var(--paper-2)",
          border: "1px solid var(--line-2)", fontSize: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>←</button>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.8, fontWeight: 700, textAlign: "center" }}>BUILD MY NIGHT</div>
          <div className="mono" style={{ fontSize: 8, letterSpacing: 1.2, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
            {Array.from(local).length} SETS SAVED
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from(local).length > 0 && (<>
            <button
              onClick={() => exportSavedSetsICS(Array.from(local))}
              title="Export to calendar"
              style={{
                width: 36, height: 36, borderRadius: 36,
                background: "var(--paper-2)", border: "1px solid var(--line-2)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                <path d="M8 14h2v2H8z" fill="var(--ink)" stroke="none"/>
              </svg>
            </button>
            <button
              onClick={() => {
                const ids = Array.from(local);
                const lines = [1, 2, 3].flatMap(day => {
                  const d = FESTIVAL_CONFIG.dayDates[day];
                  const dayArtists = ARTISTS.filter(a => a.day === day && ids.includes(a.id))
                    .sort((a, b) => toNightMin(a.start) - toNightMin(b.start));
                  if (!dayArtists.length) return [];
                  return [`${d.short} · ${d.name.toUpperCase()}`,
                    ...dayArtists.map(a => `  ${fmt12(a.start)}  ${a.name}`), ""];
                });
                const text = [`My ${FESTIVAL_CONFIG.name} lineup (${ids.length} sets):`, "", ...lines].join("\n").trim();
                if (navigator.share) { navigator.share({ title: "My EDC lineup", text }).catch(() => {}); }
                else { try { navigator.clipboard.writeText(text); } catch {} }
              }}
              title="Share lineup"
              style={{
                width: 36, height: 36, borderRadius: 36,
                background: "var(--paper-2)", border: "1px solid var(--line-2)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49"/>
              </svg>
            </button>
          </>)}
          <button onClick={autoFill} title="Auto-fill best non-clashing sets for this day" style={{
            background: "var(--horizon)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 13px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
          }}>✦ AUTO</button>
          <button onClick={handleSave} style={{
            background: "var(--ember)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 16px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
          }}>SAVE ✓</button>
        </div>
      </div>

      {/* Day tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 16px 10px", borderBottom: "1px solid var(--line)" }}>
        {dayStats.map(d => {
          const on = d.n === activeDay;
          return (
            <button key={d.n} onClick={() => setActiveDay(d.n)} style={{
              flex: 1, padding: "8px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center",
              background: on ? "var(--ink)" : "var(--paper-2)",
              border: on ? "none" : "1px solid var(--line)",
              transition: "all .15s",
            }}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: on ? "rgba(247,237,224,0.55)" : "var(--muted)" }}>{d.short}</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: on ? "var(--paper)" : "var(--ink)", lineHeight: 1.15 }}>{d.count}</div>
              {d.clashes > 0
                ? <div className="mono" style={{ fontSize: 8, color: "var(--ember)", letterSpacing: 0.8, marginTop: 1 }}>⚠ {d.clashes} CLASH</div>
                : d.count > 0
                  ? <div className="mono" style={{ fontSize: 8, color: on ? "rgba(247,237,224,0.4)" : "var(--muted)", letterSpacing: 0.8, marginTop: 1 }}>● CLEAN</div>
                  : <div style={{ height: 12 }} />
              }
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "14px 16px 40px" }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div className="serif" style={{ fontSize: 24, fontStyle: "italic", color: "var(--muted)" }}>Nothing saved</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.3, color: "var(--muted)", marginTop: 8 }}>
              SAVE SETS IN LINEUP FIRST
            </div>
          </div>
        ) : (
          <>
            {items.map((item, idx) => {
              if (item.type === "set") {
                const a = item.artist;
                const stage = STAGES.find(s => s.id === a.stage);
                const clash = conflictIds.has(a.id);
                return (
                  <div key={a.id} style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}>
                    {/* Time */}
                    <div className="mono" style={{ width: 36, flexShrink: 0, fontSize: 9, letterSpacing: 0.5, color: "var(--muted)", textAlign: "right", paddingTop: 11 }}>
                      {fmt12(a.start)}
                    </div>
                    {/* Block */}
                    <div style={{
                      flex: 1,
                      background: clash ? "var(--ink)" : "var(--paper-2)",
                      border: `1px solid ${clash ? "var(--ember)" : "var(--line)"}`,
                      borderLeft: `4px solid ${stage.color}`,
                      borderRadius: 12, padding: "9px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: clash ? "var(--paper)" : "var(--ink)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.name}
                          </div>
                          <div className="mono" style={{ fontSize: 8.5, letterSpacing: 0.9, color: clash ? "rgba(247,237,224,0.5)" : "var(--muted)", marginTop: 3 }}>
                            {stage.short} · {fmt12(a.start)}–{fmt12(a.end)}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {clash && <span className="mono" style={{ fontSize: 7.5, letterSpacing: 1, color: "var(--ember)", fontWeight: 700 }}>⚠ CLASH</span>}
                          <button onClick={() => drop(a.id)} style={{
                            background: "rgba(232,93,46,0.12)", border: "1px solid rgba(232,93,46,0.25)",
                            borderRadius: 999, padding: "3px 9px", cursor: "pointer",
                            fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1, color: "var(--ember)",
                          }}>DROP</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === "gap") {
                return (
                  <div key={`gap-${idx}`} style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}>
                    <div style={{ width: 36, flexShrink: 0, paddingTop: 7 }}>
                      <div className="mono" style={{ fontSize: 8, color: "var(--muted)", textAlign: "right", letterSpacing: 0.5 }}>{item.endOf}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                        <span className="mono" style={{ fontSize: 8, letterSpacing: 1.2, color: "var(--muted)", whiteSpace: "nowrap" }}>
                          FREE · {fmtGap(item.gapMin)}
                        </span>
                        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                      </div>
                      {item.fits.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 4 }}>
                          {item.fits.map(f => {
                            const fs = STAGES.find(s => s.id === f.stage);
                            return (
                              <button key={f.id} onClick={() => add(f.id)} style={{
                                background: `${fs.color}12`, border: `1px dashed ${fs.color}`,
                                borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                                fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 0.8,
                                color: "var(--ink)",
                              }}>
                                + {f.name} {fmt12(f.start)} {fs.short}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })}

            {/* Sunrise */}
            {sunrise && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                <div className="mono" style={{ width: 36, flexShrink: 0, fontSize: 8.5, color: "var(--flare)", textAlign: "right", letterSpacing: 0.5 }}>{sunrise}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, var(--flare), transparent)` }} />
                  <span className="mono" style={{ fontSize: 8, letterSpacing: 1.4, color: "var(--flare)", fontWeight: 700 }}>☀ SUNRISE</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Bottom-sheet filter modal — replaces the in-page expanding filter
// drawer + active-filter chip strip with a single sectioned sheet.
// Stages its own copy of the filter state so users can experiment;
// commits via onApply or wipes via onReset. Live count on the
// primary CTA so users see how many sets they'll land on before
// they tap Apply.
function LineupFilterSheet({
  onClose, day, dayGenres, savedIds = [],
  initial,           // { filter, tierFilter, stageFilter, genreFilter, sortBy }
  onApply, onReset,
}) {
  const [f, setF] = React.useState(initial);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const savedCount = savedIds.length;
  const savedSet = React.useMemo(() => new Set(savedIds), [savedIds]);

  // Live preview count — apply the staged filters against ARTISTS for the
  // current day. Mirrors LineupScreen's dayArtists filter chain.
  const matchCount = React.useMemo(() => {
    return ARTISTS
      .filter(a => a.day === day)
      .filter(a => f.filter === "all" || savedSet.has(a.id))
      .filter(a => f.stageFilter === "all" || a.stage === f.stageFilter)
      .filter(a => f.genreFilter === "all" || a.genre === f.genreFilter)
      .filter(a => {
        if (f.tierFilter === "all") return true;
        if (f.tierFilter === "head") return a.tier === 3;
        if (f.tierFilter === "prime") return a.tier === 2;
        if (f.tierFilter === "open") return a.tier === 1;
        if (f.tierFilter === "legend") return isLegendary(a);
        return true;
      }).length;
  }, [f, day, savedSet]);

  const chip = (on, accent) => ({
    flexShrink: 0, padding: "6px 12px", borderRadius: 999,
    background: on ? (accent || "var(--ink)") : "var(--paper-2)",
    color: on ? "#fff" : "var(--ink)",
    border: on ? "none" : "1px solid var(--line-2)",
    fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.1,
    fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
  });
  const sectionLabel = {
    fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700,
    fontFamily: "Geist Mono, monospace", marginBottom: 6, marginTop: 4,
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(13,10,8,0.55)",
      zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 460,
        background: "var(--paper)", color: "var(--ink)",
        borderRadius: "16px 16px 0 0",
        padding: "16px 18px 18px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 800 }}>FILTERS</span>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--muted)",
            fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
          {/* SHOW — all vs only mine */}
          <div style={sectionLabel}>SHOW</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "all",   label: "ALL" },
              { id: "saved", label: `MINE${savedCount ? ` · ${savedCount}` : ""}`, accent: "var(--ember)" },
            ].map(o => (
              <button key={o.id} onClick={() => set("filter", o.id)}
                style={chip(f.filter === o.id, o.accent)}>{o.label}</button>
            ))}
          </div>

          {/* TIER */}
          <div style={sectionLabel}>TIER</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "all",    label: "ALL TIERS" },
              { id: "legend", label: "★ LEGENDARY",   accent: "#fbbf24" },
              { id: "head",   label: "HEADLINERS",    accent: "var(--ember)" },
              { id: "prime",  label: "PRIME TIME",    accent: "var(--horizon)" },
              { id: "open",   label: "OPENERS",       accent: "var(--success)" },
            ].map(t => (
              <button key={t.id} onClick={() => set("tierFilter", t.id)}
                style={chip(f.tierFilter === t.id, t.accent)}>{t.label}</button>
            ))}
          </div>

          {/* STAGE */}
          <div style={sectionLabel}>STAGE</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => set("stageFilter", "all")}
              style={chip(f.stageFilter === "all")}>ALL STAGES</button>
            {STAGES.map(s => (
              <button key={s.id} onClick={() => set("stageFilter", s.id)}
                style={chip(f.stageFilter === s.id, s.color)}>{s.short || s.name}</button>
            ))}
          </div>

          {/* GENRE — only if there's enough variety on the day */}
          {dayGenres.length > 0 && (
            <>
              <div style={sectionLabel}>GENRE</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                <button onClick={() => set("genreFilter", "all")}
                  style={chip(f.genreFilter === "all")}>ALL GENRES</button>
                {dayGenres.map(g => (
                  <button key={g} onClick={() => set("genreFilter", g)}
                    style={chip(f.genreFilter === g, "var(--horizon)")}>{g.toUpperCase()}</button>
                ))}
              </div>
            </>
          )}

          {/* SORT */}
          <div style={sectionLabel}>SORT BY</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "time",  label: "TIME" },
              { id: "tier",  label: "TIER" },
              { id: "stage", label: "STAGE" },
            ].map(o => (
              <button key={o.id} onClick={() => set("sortBy", o.id)}
                style={chip(f.sortBy === o.id)}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{
          display: "flex", gap: 8, paddingTop: 12,
          borderTop: "1px solid var(--line)",
          marginTop: 6,
        }}>
          <button onClick={() => onReset()} className="mono" style={{
            padding: "11px 16px", borderRadius: 999,
            background: "transparent", color: "var(--muted)",
            border: "1px solid var(--line-2)", cursor: "pointer",
            fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
          }}>RESET</button>
          <button onClick={() => onApply(f)} className="mono" style={{
            flex: 1, padding: "11px 14px", borderRadius: 999,
            background: "var(--ember)", color: "#fff",
            border: "none", cursor: "pointer",
            fontSize: 10, letterSpacing: 1.3, fontWeight: 700,
          }}>APPLY · {matchCount} {matchCount === 1 ? "SET" : "SETS"}</button>
        </div>
      </div>
    </div>
  );
}

function LineupScreen({ state, setState }) {
  // Highlight-on-arrival: ArtistScreen "SCHEDULE" hands off `lineupHighlight`.
  // Force the day to that artist's day so the flash actually has a target,
  // even if state.lineupDay was set to something else by an earlier route.
  const highlightId = state.lineupHighlight || null;
  const [day, setDay] = React.useState(() => {
    if (highlightId) {
      const a = ARTISTS.find(x => x.id === highlightId);
      if (a) return a.day;
    }
    return state.lineupDay || NOW.day;
  });
  const [filter, setFilter] = React.useState("all"); // all | saved
  const [stageFilter, setStageFilter] = React.useState("all"); // all | stage id
  const [tierFilter, setTierFilter] = React.useState("all"); // all | head | prime | open | legend
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [genreFilter, setGenreFilter] = React.useState("all");

  // After the screen renders, scroll the highlighted card/block into view and
  // let the CSS flash play. Then clear the highlight so re-mounts don't fire
  // the animation again. Querying the DOM (vs. holding a ref through both
  // list + grid views) keeps this independent of which view is active.
  React.useEffect(() => {
    if (!highlightId) return;
    const scroller = setTimeout(() => {
      const el = document.querySelector('[data-lineup-highlight="true"]');
      if (el) try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    }, 100);
    const clearer = setTimeout(() => {
      setState(s => ({ ...s, lineupHighlight: null }));
    }, 2400);
    return () => { clearTimeout(scroller); clearTimeout(clearer); };
  }, [highlightId]);
  // Filter panel collapses by default — three chip rows (tier/stage/genre)
  // were dominating the top of the screen even when the user wasn't using
  // them. Active filters surface as dismissable chips so a user can clear
  // them without re-opening the panel.
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState(() => {
    try { return localStorage.getItem('plursky_lineup_view') || 'list'; } catch { return 'list'; }
  });
  React.useEffect(() => { try { localStorage.setItem('plursky_lineup_view', viewMode); } catch {} }, [viewMode]);
  // v138: per-day section refs so the FRI/SAT/SUN tabs scroll-to-section
  // when grid view is on (the grid shows all 3 days in one continuous page).
  const gridSectionRefs = React.useRef({});

  // v140: force a re-render every 30 s so the NOW indicator line on the
  // grid, the "● LIVE" pills, and the time-cursor on the saved-sets
  // sidebar all advance without needing the user to close-and-reopen
  // the app. NOW is a Proxy that recomputes on each access — the only
  // thing missing was a trigger to recommit React's rendered output.
  const [, _tickT] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(_tickT, 30000);
    return () => clearInterval(id);
  }, []);

  // v139: a single rAF-throttled scroll listener on the ScrollBody does
  // two things at once:
  //   (a) saves scrollTop to sessionStorage so navigating into an artist
  //       and coming back restores the exact position — fixes the "go to
  //       SAT, tap an artist, come back, end up on FRI" bug;
  //   (b) keeps the FRI/SAT/SUN day picker highlight in sync with whichever
  //       section the user has scrolled into the top of the viewport.
  // On mount we restore from sessionStorage in a rAF so layout is committed
  // first. On unmount + remount the listener re-attaches.
  const SCROLL_KEY = "plursky_lineup_scroll_v1";
  React.useEffect(() => {
    if (viewMode !== "grid") return;
    const root = document.querySelector('[data-lineup-scroll]');
    if (!root) return;

    const restoreId = requestAnimationFrame(() => {
      try {
        const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || "0", 10);
        if (y > 0) root.scrollTop = y;
      } catch {}
    });

    let pending = false;
    const tick = () => {
      const rootTop = root.getBoundingClientRect().top;
      // Persist position
      try { sessionStorage.setItem(SCROLL_KEY, String(root.scrollTop)); } catch {}
      // Day picker sync — section whose top edge is at or just above the
      // ScrollBody's top edge, and whose bottom is still below.
      let bestDay = null;
      for (const dn of [1, 2, 3]) {
        const el = gridSectionRefs.current[dn];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top - rootTop <= 100 && r.bottom - rootTop > 100) bestDay = dn;
      }
      if (bestDay) setDay(bestDay);
      pending = false;
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(tick);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(tick); // initial sync

    return () => {
      cancelAnimationFrame(restoreId);
      root.removeEventListener("scroll", onScroll);
    };
  }, [viewMode]);

  // Reset stored scroll position when leaving grid view so list-mode users
  // who later flip to grid get a fresh top-of-page on first switch.
  React.useEffect(() => {
    if (viewMode === "list") {
      try { sessionStorage.removeItem(SCROLL_KEY); } catch {}
    }
  }, [viewMode]);
  // Sort: time (chronological), tier (headliners first), stage (grouped by stage order)
  const [sortBy, setSortBy] = React.useState("time");
  // Active-filter count powers the badge on the FILTERS trigger button — replaces
  // the old in-page dismissable-chip strip. "filter !== all" (Mine vs All) and
  // sortBy counted because they're meaningful state diverging from defaults.
  const activeFilterCount = (tierFilter !== "all" ? 1 : 0)
                          + (stageFilter !== "all" ? 1 : 0)
                          + (genreFilter !== "all" ? 1 : 0)
                          + (filter !== "all" ? 1 : 0)
                          + (sortBy !== "time" ? 1 : 0);
  React.useEffect(() => setGenreFilter("all"), [day]);

  const matchesActive = (a) => {
    if (filter !== "all" && !state.saved.includes(a.id)) return false;
    if (stageFilter !== "all" && a.stage !== stageFilter) return false;
    if (genreFilter !== "all" && a.genre !== genreFilter) return false;
    if (tierFilter === "head"   && a.tier !== 3) return false;
    if (tierFilter === "prime"  && a.tier !== 2) return false;
    if (tierFilter === "open"   && a.tier !== 1) return false;
    if (tierFilter === "legend" && !isLegendary(a)) return false;
    return true;
  };

  const spotifyMatchedIds = React.useMemo(() => {
    try { return new Set(JSON.parse(localStorage.getItem('spotify_matched_ids_v1') || '[]')); }
    catch { return new Set(); }
  }, []);

  const dayGenres = React.useMemo(() => {
    const freq = {};
    ARTISTS.filter(a => a.day === day).forEach(a => {
      if (a.genre) freq[a.genre] = (freq[a.genre] || 0) + 1;
    });
    return Object.entries(freq)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);
  }, [day]);

  const dayArtists = ARTISTS
    .filter(a => a.day === day)
    .filter(a => filter === "all" || state.saved.includes(a.id))
    .filter(a => stageFilter === "all" || a.stage === stageFilter)
    .filter(a => genreFilter === "all" || a.genre === genreFilter)
    .filter(a => {
      if (tierFilter === "all") return true;
      if (tierFilter === "head") return a.tier === 3;
      if (tierFilter === "prime") return a.tier === 2;
      if (tierFilter === "open") return a.tier === 1;
      if (tierFilter === "legend") return isLegendary(a);
      return true;
    })
    .sort((a, b) => {
      // EDC runs 19:00→05:00 — treat early AM as "next day" (hour + 24)
      const toSlot = t => { const h = parseInt(t.split(":")[0]); return h < 8 ? h + 24 : h; };
      // Apply sort: time (default) | tier (headliners first, then time) | stage (group by stage)
      if (sortBy === "tier") {
        if (a.tier !== b.tier) return b.tier - a.tier;
      } else if (sortBy === "stage") {
        const ai = STAGES.findIndex(s => s.id === a.stage);
        const bi = STAGES.findIndex(s => s.id === b.stage);
        if (ai !== bi) return ai - bi;
      }
      return toSlot(a.start) - toSlot(b.start);
    });

  // Per-day saved counts + conflict counts for the 3-day overview ribbon.
  const dayStats = DAYS.map(d => {
    const savedThisDay = ARTISTS.filter(x => x.day === d.n && state.saved.includes(x.id));
    let clashes = 0;
    for (let i = 0; i < savedThisDay.length; i++)
      for (let j = i + 1; j < savedThisDay.length; j++)
        if (overlaps(savedThisDay[i], savedThisDay[j])) clashes++;
    return { ...d, count: savedThisDay.length, clashes };
  });
  const totalSaved = dayStats.reduce((s, d) => s + d.count, 0);

  // conflicts: 2+ saved sets overlap in time
  const savedToday = ARTISTS.filter(a => a.day === day && state.saved.includes(a.id));
  // v141: pairs the user has explicitly "kept both" on — we still show them
  // as conflicts in the per-card ⚠ chip (information stays available) but
  // skip them in the top-level ConflictResolver card so it stops nagging.
  const CONFLICT_ACK_KEY = "plursky_conflicts_kept_both_v1";
  const _pairKey = (idA, idB) => [idA, idB].sort().join("|");
  const [ackedPairs, setAckedPairs] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CONFLICT_ACK_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const ackPair = (idA, idB) => {
    setAckedPairs(prev => {
      const next = new Set(prev);
      next.add(_pairKey(idA, idB));
      try { localStorage.setItem(CONFLICT_ACK_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const conflicts = [];
  // conflictById: artist.id → array of saved set names this artist clashes with.
  // Powers the per-card ⚠ chip so users can spot WHICH saved sets clash, not
  // just the day-tab total.
  const conflictById = {};
  for (let i = 0; i < savedToday.length; i++) {
    for (let j = i + 1; j < savedToday.length; j++) {
      if (overlaps(savedToday[i], savedToday[j])) {
        const a = savedToday[i], b = savedToday[j];
        if (!ackedPairs.has(_pairKey(a.id, b.id))) {
          conflicts.push([a, b]);
        }
        // Per-card chip stays even after KEEP BOTH so the warning info
        // doesn't disappear — the only thing that hides is the resolver card.
        (conflictById[a.id] = conflictById[a.id] || []).push(b.name);
        (conflictById[b.id] = conflictById[b.id] || []).push(a.name);
      }
    }
  }

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px 8px" }}>
        <TopBar title={<span>Lineup</span>} sub={`${FESTIVAL_CONFIG.brand.toUpperCase()} · ${FESTIVAL_CONFIG.dates.toUpperCase()}`} tight />
      </div>

      {/* Day tabs — now with per-day saved + conflict badges baked in so a
          vet can see at a glance which night needs schedule attention. */}
      <div style={{ display: "flex", gap: 6, padding: "4px 16px 10px", borderBottom: "1px solid var(--line)" }}>
        {dayStats.map(d => {
          const on = d.n === day;
          return (
            <button key={d.n} onClick={() => {
              setDay(d.n);
              // In grid mode the page renders all 3 days continuously; the
              // tab acts as a scroll-to-section anchor.
              if (viewMode === "grid") {
                const el = gridSectionRefs.current[d.n];
                if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }} style={{
              flex: 1,
              padding: "10px 8px",
              borderRadius: 12,
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink)",
              border: on ? "none" : "1px solid var(--line-2)",
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              position: "relative",
            }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: on ? 0.7 : 0.5 }}>{d.label}</span>
              <span className="serif" style={{ fontSize: 18 }}>{d.date.split(" ")[1]}</span>
              {d.count > 0 && (
                <span className="mono" style={{
                  fontSize: 8, letterSpacing: 1, fontWeight: 700,
                  color: on ? "rgba(247,237,224,0.7)" : "var(--muted)",
                  marginTop: 1,
                }}>
                  {d.count} SAVED{d.clashes > 0 ? ` · ${d.clashes}⚠` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Compact toolbar: view mode segment + single FILTERS trigger.
          All filter/sort dimensions live inside the bottom sheet now —
          no more in-page expanding drawer + active-chip strip. The
          badge count on the trigger replaces the strip's signaling. */}
      <div className="no-scrollbar" style={{
        display: "flex", alignItems: "center", gap: 6, padding: "10px 16px 8px",
        overflowX: "auto", scrollbarWidth: "none",
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{
          flexShrink: 0, display: "inline-flex",
          border: "1px solid var(--line-2)", borderRadius: 999, padding: 2, gap: 2,
        }}>
          {[["list","☰ LIST"],["grid","⊞ GRID"]].map(([k,l]) => {
            const on = viewMode === k;
            return (
              <button key={k} onClick={() => setViewMode(k)} className="mono" style={{
                padding: "3px 9px", borderRadius: 999, border: "none",
                background: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper)" : "var(--ink)",
                fontSize: 9, letterSpacing: 1, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>{l}</button>
            );
          })}
          <button onClick={() => setState({ ...state, tab: "map", focusStage: stageFilter !== "all" ? stageFilter : undefined })} className="mono" style={{
            padding: "3px 9px", borderRadius: 999, border: "none",
            background: "transparent", color: "var(--ink)",
            fontSize: 9, letterSpacing: 1, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap",
          }}>◎ MAP</button>
        </div>
        <button onClick={() => setFilterSheetOpen(true)} className="mono" style={{
          flexShrink: 0, padding: "5px 11px", borderRadius: 999,
          background: activeFilterCount > 0 ? "var(--ember)" : "transparent",
          color: activeFilterCount > 0 ? "#fff" : "var(--ink)",
          border: activeFilterCount > 0 ? "none" : "1px solid var(--line-2)",
          fontSize: 9.5, letterSpacing: 1.1, cursor: "pointer",
          fontWeight: 700, whiteSpace: "nowrap",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span>FILTERS</span>
          {activeFilterCount > 0 && (
            <span style={{
              background: "rgba(255,255,255,0.28)",
              borderRadius: 999, padding: "1px 7px",
              fontSize: 8.5, fontWeight: 800,
            }}>{activeFilterCount}</span>
          )}
        </button>
        {sortBy !== "time" && (
          <span className="mono" style={{
            flexShrink: 0, padding: "5px 9px", borderRadius: 999,
            background: "var(--paper-2)", color: "var(--muted)",
            border: "1px solid var(--line-2)",
            fontSize: 9, letterSpacing: 1.1, fontWeight: 700,
            whiteSpace: "nowrap",
          }}>SORT: {sortBy.toUpperCase()}</span>
        )}
      </div>

      {/* Actions row — MY NIGHT / SHARE / SURPRISE / SETS COUNT.
          The All/Mine toggle that used to live here moved into the
          bottom-sheet "Show" section so all filtering is in one place. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "10px 20px", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {totalSaved >= 2 && (
            <button onClick={() => setWizardOpen(true)} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: dayStats.some(d => d.clashes > 0) ? "var(--ember)" : "var(--ink)",
              color: "var(--paper)", border: "none",
              borderRadius: 999, padding: "5px 12px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            }}>
              {dayStats.some(d => d.clashes > 0) ? "⚠" : "✦"} MY NIGHT
            </button>
          )}
          {state.saved.length > 0 && (
            <ShareLineupButton state={state} />
          )}
          <button onClick={() => {
            const savedArtists = ARTISTS.filter(a => state.saved.includes(a.id));
            const savedGenres = new Set(savedArtists.map(a => a.genre));
            const unsaved = ARTISTS.filter(a => !state.saved.includes(a.id));
            const pool = savedGenres.size
              ? unsaved.filter(a => savedGenres.has(a.genre))
              : unsaved;
            if (!(pool.length ? pool : unsaved).length) return;
            const pick = (pool.length ? pool : unsaved)[Math.floor(Math.random() * (pool.length || unsaved.length))];
            setState({ ...state, artist: pick.id });
          }} className="mono" title="Discover a random artist that matches your taste" style={{
            padding: "5px 10px", borderRadius: 999,
            background: "var(--horizon)", color: "#fff", border: "none",
            fontSize: 9, letterSpacing: 1.2, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap",
          }}>✦ SURPRISE</button>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
            {dayArtists.length} SETS
          </div>
        </div>
      </div>

      {wizardOpen && (
        <NightWizard state={state} setState={setState} onClose={() => setWizardOpen(false)} />
      )}

      {conflicts.length > 0 && filter !== "all" && (
        <ConflictResolver
          conflicts={conflicts}
          onKeep={(keepId, dropId) => {
            setState({ ...state, saved: state.saved.filter(id => id !== dropId) });
          }}
          onKeepBoth={(pair) => ackPair(pair[0].id, pair[1].id)}
          onSplit={(pair) => setState({ ...state, tab: "map", focusStage: pair[0].stage })}
        />
      )}

      {stageFilter !== "all" && (() => {
        const stage = STAGES.find(s => s.id === stageFilter);
        if (!stage?.vibe) return null;
        return (
          <div style={{
            margin: "0 16px 10px",
            padding: "10px 12px",
            borderRadius: 12,
            borderLeft: `3px solid ${stage.color}`,
            background: `${stage.color}12`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: stage.vibeNote ? 5 : 0 }}>
              <span className="mono" style={{
                fontSize: 8.5, letterSpacing: 1.2, fontWeight: 800,
                color: stage.color, textTransform: "uppercase",
              }}>{stage.vibe}</span>
              {stage.peak && (
                <span className="mono" style={{ fontSize: 7.5, letterSpacing: 1, color: "var(--muted)", fontWeight: 600 }}>
                  · PEAKS {stage.peak}
                </span>
              )}
              {stage.desc && (
                <span className="mono" style={{ fontSize: 7.5, letterSpacing: 0.9, color: "var(--muted)", marginLeft: "auto" }}>
                  {stage.desc.toUpperCase()}
                </span>
              )}
            </div>
            {stage.vibeNote && (
              <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--ink)", fontStyle: "italic" }}>
                {stage.vibeNote}
              </div>
            )}
          </div>
        );
      })()}

      <ScrollBody data-lineup-scroll style={{ padding: viewMode === "grid" ? "0 0 80px" : "0 16px 90px" }}>
        {/* "Save the Day" empty-state CTA — when no sets are saved for the
            selected day, a single ember card batch-saves every tier-3
            headliner. Disappears once the day has any save. */}
        {savedToday.length === 0 && (() => {
          const dayHeads = ARTISTS.filter(a => a.day === day && a.tier === 3);
          if (dayHeads.length === 0) return null;
          const dayLabel = DAYS.find(d => d.n === day)?.label || `Day ${day}`;
          const headIds = dayHeads.map(h => h.id);
          return (
            <button
              onClick={() => setState(s => ({ ...s, saved: [...new Set([...s.saved, ...headIds])] }))}
              style={{
                width: viewMode === "grid" ? "calc(100% - 32px)" : "100%",
                display: "flex", alignItems: "center", gap: 12,
                background: "var(--ember)", color: "#fff", border: "none",
                borderRadius: 14, padding: "13px 16px",
                margin: viewMode === "grid" ? "12px 16px 14px" : "12px 0 14px",
                cursor: "pointer", textAlign: "left",
                boxShadow: "0 4px 16px rgba(232,93,46,0.30)",
                fontFamily: "inherit",
              }}>
              <span style={{
                flexShrink: 0, width: 38, height: 38, borderRadius: 999,
                background: "rgba(255,255,255,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, lineHeight: 1,
              }}>✦</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="serif" style={{ fontSize: 18, lineHeight: 1.05, color: "#fff" }}>
                  Save all headliners for {dayLabel}
                </div>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, marginTop: 3, opacity: 0.9, fontWeight: 700 }}>
                  +{dayHeads.length} SETS · TAP TO ADD
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, letterSpacing: 1.3, fontWeight: 800, flexShrink: 0 }}>
                SAVE →
              </span>
            </button>
          );
        })()}
        {viewMode === "grid" && !(filter === "saved" && state.saved.length === 0) && (
          // v138: all-3-days continuous grid + per-day saved-sets sidebar.
          // The day tabs above scroll to the matching section instead of
          // filtering — feels like one long page rather than three tabbed
          // schedules. Each section has its own sidebar slice so the user
          // can see what they picked for that night at a glance.
          [1, 2, 3].map(dn => {
            const dayMeta = DAYS.find(x => x.n === dn);
            const dayArt  = ARTISTS.filter(a => a.day === dn);
            return (
              <div
                key={dn}
                ref={el => { gridSectionRefs.current[dn] = el; }}
                style={{ scrollMarginTop: 12 }}
              >
                {dn !== 1 && (
                  <div style={{
                    height: 1, background: "var(--line-2)",
                    margin: "26px 16px 0",
                  }}/>
                )}
                <div
                  data-day-header={dn}
                  style={{
                    position: "sticky", top: 0, zIndex: 6,
                    display: "flex", alignItems: "baseline", gap: 10,
                    padding: "12px 16px 8px",
                    background: "var(--paper)",
                    borderBottom: "1px solid var(--line)",
                  }}>
                  <div className="serif" style={{ fontSize: 22 }}>{dayMeta?.label || `Day ${dn}`}</div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700 }}>
                    · {(dayMeta?.date || "").toUpperCase()}
                  </div>
                  <div className="mono" style={{ marginLeft: "auto", fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700 }}>
                    {dayArt.length} SETS
                  </div>
                </div>
                <div style={{ display: "flex", gap: 0, alignItems: "stretch", padding: "0 0 10px" }}>
                  <SavedSidebar day={dn} state={state} setState={setState} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TimelineGrid
                      day={dn}
                      allDayArtists={dayArt}
                      state={state}
                      setState={setState}
                      matchesActive={matchesActive}
                      conflictById={conflictById}
                      spotifyMatchedIds={spotifyMatchedIds}
                      highlightId={highlightId}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
        {viewMode === "list" && dayArtists.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--muted)", fontStyle: "italic", marginBottom: 6 }}>
              {state.saved.length === 0 ? "No sets saved yet" : "Nothing saved for this day"}
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              {state.saved.length === 0
                ? "TAP ANY [+] TO SAVE YOUR FIRST SET"
                : 'SWITCH TO "ALL" TO BROWSE'}
            </div>
            {state.saved.length === 0 && filter !== "all" && (
              <button onClick={() => setFilter("all")} className="mono" style={{
                marginTop: 14, padding: "8px 16px", borderRadius: 999,
                background: "var(--ink)", color: "var(--paper)", border: "none",
                fontSize: 10, letterSpacing: 1.4, fontWeight: 700, cursor: "pointer",
              }}>BROWSE ALL SETS</button>
            )}
          </div>
        )}
        {viewMode === "grid" && filter === "saved" && state.saved.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--muted)", fontStyle: "italic", marginBottom: 6 }}>
              No sets saved yet
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              SWITCH TO ALL — TAP ANY SET TO SAVE
            </div>
            <button onClick={() => setFilter("all")} className="mono" style={{
              marginTop: 14, padding: "8px 16px", borderRadius: 999,
              background: "var(--ink)", color: "var(--paper)", border: "none",
              fontSize: 10, letterSpacing: 1.4, fontWeight: 700, cursor: "pointer",
            }}>BROWSE ALL SETS</button>
          </div>
        )}
        {viewMode === "list" && dayArtists.map(a => {
          const stage = STAGES.find(s => s.id === a.stage);
          const saved = state.saved.includes(a.id);
          const clashWith = conflictById[a.id];
          const isHighlighted = highlightId === a.id;
          // FotMob-style LIVE pill — green pulsing dot + LIVE caps when
          // the set is currently playing. Uses existing toNightMin so a
          // set that runs past midnight still reads correctly.
          const isLive = (() => {
            if (a.day !== NOW.day || !NOW.time) return false;
            const nm = toNightMin(NOW.time), sm = toNightMin(a.start), em = toNightMin(a.end);
            return sm <= nm && nm < em;
          })();
          return (
            <div key={a.id}
              data-lineup-highlight={isHighlighted ? "true" : undefined}
              style={{
                display: "flex", gap: 10, padding: "12px 8px",
                margin: "0 -8px",
                borderBottom: "1px solid var(--line)",
                alignItems: "center",
                borderRadius: isHighlighted ? 10 : 0,
                animation: isHighlighted ? "lineupFlash 1.8s ease-out" : undefined,
              }}>
              <div style={{ width: 46, flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>{fmt12(a.start)}</div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1, color: "var(--muted)" }}>{fmt12(a.end)}</div>
                {isLive && (
                  <div className="mono" style={{
                    marginTop: 4, fontSize: 8, letterSpacing: 1, fontWeight: 800,
                    color: "var(--success)", background: "rgba(45,122,85,0.14)",
                    border: "0.5px solid rgba(45,122,85,0.55)",
                    padding: "1px 5px", borderRadius: 4,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: 5,
                      background: "var(--success)",
                      animation: "pulse 1.4s infinite",
                    }}/>LIVE
                  </div>
                )}
                {clashWith && (
                  <div className="mono" title={`Overlaps with ${clashWith.join(", ")}`} style={{
                    marginTop: 4, fontSize: 8, letterSpacing: 0.8, fontWeight: 800,
                    color: "var(--ember)", background: "rgba(232,93,46,0.12)",
                    border: "0.5px solid rgba(232,93,46,0.55)",
                    padding: "1px 4px", borderRadius: 4,
                    display: "inline-block",
                  }}>⚠ CLASH</div>
                )}
              </div>
              <div style={{ width: 4, alignSelf: "stretch", background: stage.color, borderRadius: 3 }} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                   onClick={() => setState({ ...state, artist: a.id })}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                  <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, letterSpacing: -0.3 }}>{a.name}</div>
                  <TierStars tier={a.tier} />
                  {isLegendary(a) && (
                    <span className="mono" style={{
                      fontSize: 8, letterSpacing: 1.2, fontWeight: 800,
                      color: "#fbbf24", background: "rgba(251,191,36,0.14)",
                      padding: "1px 6px", borderRadius: 999,
                      border: "0.5px solid rgba(251,191,36,0.6)",
                    }}>★ DON'T MISS</span>
                  )}
                  {spotifyMatchedIds.has(a.id) && (
                    <span className="mono" style={{
                      fontSize: 8, letterSpacing: 1.2, fontWeight: 700,
                      color: "#1DB954", background: "rgba(29,185,84,0.12)",
                      padding: "1px 6px", borderRadius: 999,
                      border: "0.5px solid rgba(29,185,84,0.5)",
                    }}>♫</span>
                  )}
                  {(() => { const n = window.sbGetCrewCount?.(a.id) || 0; return n > 0 ? (
                    <span className="mono" style={{
                      fontSize: 8, letterSpacing: 1, fontWeight: 700,
                      color: "var(--horizon)", background: "rgba(123,61,154,0.12)",
                      padding: "1px 6px", borderRadius: 999,
                      border: "0.5px solid rgba(123,61,154,0.5)",
                    }}>👥 {n}</span>
                  ) : null; })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: stage.color, fontWeight: 600, textTransform: "uppercase" }}>
                    {stage.name}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--muted)" }}>·</span>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase" }}>
                    {a.genre}
                  </span>
                </div>
                {stage.vibe && (
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="mono" style={{
                      fontSize: 8, letterSpacing: 1.1, fontWeight: 700,
                      color: stage.color,
                      padding: "1px 6px", borderRadius: 999,
                      background: `${stage.color}1a`,
                      border: `0.5px solid ${stage.color}55`,
                      textTransform: "uppercase",
                    }}>{stage.vibe}</span>
                    {stage.peak && (
                      <span className="mono" style={{ fontSize: 7.5, letterSpacing: 0.9, color: "var(--muted)" }}>
                        PEAKS {stage.peak}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => toggleSave(state, setState, a.id)} style={{
                width: 36, height: 36, borderRadius: 36,
                background: saved ? "var(--ember)" : "transparent",
                border: saved ? "none" : "1px solid var(--line-2)",
                color: saved ? "#fff" : "var(--ink)",
                cursor: "pointer",
                fontSize: 18, fontWeight: 300,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{saved ? "✓" : "+"}</button>
            </div>
          );
        })}
      </ScrollBody>

      {filterSheetOpen && (
        <LineupFilterSheet
          day={day}
          dayGenres={dayGenres}
          savedIds={state.saved || []}
          initial={{ filter, tierFilter, stageFilter, genreFilter, sortBy }}
          onClose={() => setFilterSheetOpen(false)}
          onApply={(f) => {
            setFilter(f.filter);
            setTierFilter(f.tierFilter);
            setStageFilter(f.stageFilter);
            setGenreFilter(f.genreFilter);
            setSortBy(f.sortBy);
            setFilterSheetOpen(false);
          }}
          onReset={() => {
            setFilter("all");
            setTierFilter("all");
            setStageFilter("all");
            setGenreFilter("all");
            setSortBy("time");
            setFilterSheetOpen(false);
          }}
        />
      )}
    </Screen>
  );
}

// Treat times before 08:00 as "next day" so 23:00 < 01:30 etc. compares correctly.
function toNightMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h < 8 ? h + 24 : h) * 60 + m;
}
function overlaps(a, b) {
  const aS = toNightMin(a.start), aE = toNightMin(a.end);
  const bS = toNightMin(b.start), bE = toNightMin(b.end);
  return aS < bE && bS < aE;
}

// Shared grid time-mapping constants — used by both TimelineGrid (the
// 9-stage schedule) and SavedSidebar (the user's picks for that night).
// Keeping them at module scope means each saved set in the sidebar lines
// up vertically with the corresponding set block in the grid.
const GRID_START_MIN = 19 * 60;            // 19:00
const GRID_END_MIN   = (24 + 5) * 60 + 30; // 05:30 next day
const GRID_PX_PER_MIN = 1.8;
const GRID_TOTAL_H = (GRID_END_MIN - GRID_START_MIN) * GRID_PX_PER_MIN;
const GRID_HEADER_H = 36; // matches the sticky stage header height in TimelineGrid
function _minToTop(m) {
  return (Math.max(GRID_START_MIN, Math.min(GRID_END_MIN, m)) - GRID_START_MIN) * GRID_PX_PER_MIN;
}

// v139: time-aligned saved-sets sidebar. Each entry positions absolutely
// at the corresponding time row so the column reads like a personal vertical
// schedule next to the full grid. Tap an entry to open the artist page; tap
// the small × to un-save the set right there.
function SavedSidebar({ day, state, setState }) {
  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(a => a && a.day === day)
    .sort((a, b) => a.start.localeCompare(b.start));

  const unsave = (id, e) => {
    e.stopPropagation();
    setState(s => ({ ...s, saved: s.saved.filter(x => x !== id) }));
  };

  return (
    <div style={{
      flex: "0 0 100px", boxSizing: "border-box",
      borderRight: "1px solid var(--line)",
      background: "var(--paper)",
      position: "relative",
    }}>
      {/* Header matches the grid's sticky stage-header height so the rows
          below align with the time gutter pixel-for-pixel. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 5,
        height: GRID_HEADER_H,
        display: "flex", alignItems: "center",
        padding: "0 8px",
        background: "var(--paper)",
        borderBottom: "1px solid var(--line-2)",
      }}>
        <div className="mono" style={{
          fontSize: 8.5, letterSpacing: 1.2, color: "var(--muted)",
          fontWeight: 700,
        }}>MY SETS · {saved.length}</div>
      </div>
      <div style={{ position: "relative", height: GRID_TOTAL_H }}>
        {saved.length === 0 ? (
          <div style={{
            position: "absolute", top: 14, left: 6, right: 6,
            padding: "10px 6px", textAlign: "center",
            fontSize: 9, lineHeight: 1.3, color: "var(--muted)",
            border: "1px dashed var(--line-2)", borderRadius: 8,
          }}>
            Tap any set in the grid to add
          </div>
        ) : saved.map(a => {
          const stage = STAGES.find(s => s.id === a.stage);
          const startMin = toNightMin(a.start);
          const endMin   = toNightMin(a.end);
          const top      = _minToTop(startMin);
          const blockH   = Math.max(34, _minToTop(endMin) - top);
          const isLive = (() => {
            if (a.day !== NOW.day || !NOW.time) return false;
            const nm = toNightMin(NOW.time);
            return startMin <= nm && nm < endMin;
          })();
          return (
            <button
              key={a.id}
              onClick={() => setState(s => ({ ...s, artist: a.id }))}
              style={{
                position: "absolute",
                top, left: 4, right: 4, height: blockH,
                display: "flex", alignItems: "stretch", gap: 5,
                padding: "4px 4px 4px 5px",
                background: stage ? `${stage.color}1a` : "var(--paper-2)",
                border: isLive ? "1px solid var(--success)" : `1px solid ${stage?.color || "var(--line-2)"}40`,
                borderLeft: `3px solid ${stage?.color || "var(--line-2)"}`,
                borderRadius: 6,
                cursor: "pointer", textAlign: "left",
                overflow: "hidden",
              }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: "var(--ink)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  lineHeight: 1.1,
                }}>{a.name}</div>
                <div className="mono" style={{
                  fontSize: 7.5, letterSpacing: 0.5, fontWeight: 600,
                  color: isLive ? "var(--success)" : "var(--muted)",
                }}>
                  {isLive ? "● LIVE" : `${a.start}–${a.end}`}
                </div>
              </div>
              <span
                role="button"
                aria-label={`Remove ${a.name}`}
                onClick={(e) => unsave(a.id, e)}
                style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: 999,
                  background: "rgba(0,0,0,0.06)", color: "var(--muted)",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, lineHeight: 1,
                  alignSelf: "flex-start",
                }}>×</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineGrid({ day, allDayArtists, state, setState, matchesActive, conflictById, spotifyMatchedIds, highlightId }) {
  const COL_W = 76;
  const GUTTER_W = 38;
  // Time constants are hoisted to module scope so SavedSidebar can share
  // them. Alias here so the rest of the component reads the same way.
  const PX_PER_MIN = GRID_PX_PER_MIN;
  const TOTAL_H = GRID_TOTAL_H;
  const minToTop = _minToTop;

  const HOURS = [];
  for (let h = 19; h <= 24 + 5; h++) {
    HOURS.push({ label: `${String(h % 24).padStart(2, "0")}:00`, mins: h * 60 });
  }

  // NOW indicator — only when viewing today
  let nowTop = null;
  if (NOW.day === day && NOW.time) {
    const nm = toNightMin(NOW.time);
    if (nm >= GRID_START_MIN && nm <= GRID_END_MIN) nowTop = minToTop(nm);
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "visible", width: "100%", paddingBottom: 20 }}>
      <div style={{ minWidth: GUTTER_W + STAGES.length * COL_W, position: "relative" }}>
        {/* Sticky stage header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          display: "flex", background: "var(--paper)",
          borderBottom: "1px solid var(--line-2)",
        }}>
          <div style={{ width: GUTTER_W, flexShrink: 0 }} />
          {STAGES.map(s => (
            <div key={s.id} style={{
              width: COL_W, flexShrink: 0,
              padding: "8px 4px 7px",
              textAlign: "center",
              borderLeft: "1px solid var(--line)",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: 8,
                background: s.color, margin: "0 auto 3px",
              }} />
              <div className="mono" style={{
                fontSize: 8.5, letterSpacing: 0.8, fontWeight: 700,
                color: "var(--ink)",
              }}>{s.short}</div>
            </div>
          ))}
        </div>

        {/* Body: time gutter + stage columns */}
        <div style={{ display: "flex", position: "relative" }}>
          {/* Time gutter */}
          <div style={{ width: GUTTER_W, flexShrink: 0, position: "relative", height: TOTAL_H }}>
            {HOURS.map(h => (
              <div key={h.label} className="mono" style={{
                position: "absolute",
                top: minToTop(h.mins) - 5,
                right: 6,
                fontSize: 8.5, letterSpacing: 0.5,
                color: "var(--muted)", fontWeight: 600,
              }}>{h.label}</div>
            ))}
          </div>

          {/* Stage columns */}
          {STAGES.map(stage => {
            const stageArtists = allDayArtists.filter(a => a.stage === stage.id);
            return (
              <div key={stage.id} style={{
                width: COL_W, flexShrink: 0,
                position: "relative", height: TOTAL_H,
                borderLeft: "1px solid var(--line)",
              }}>
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div key={h.label} style={{
                    position: "absolute", left: 0, right: 0,
                    top: minToTop(h.mins), height: 1,
                    background: "var(--line)",
                  }} />
                ))}
                {/* Set blocks */}
                {stageArtists.map(a => {
                  const start = toNightMin(a.start);
                  const end = toNightMin(a.end);
                  const top = minToTop(start);
                  const height = Math.max(20, minToTop(end) - top);
                  const active = matchesActive(a);
                  const saved = state.saved.includes(a.id);
                  const clash = !!conflictById[a.id];
                  const matched = spotifyMatchedIds && spotifyMatchedIds.has && spotifyMatchedIds.has(a.id);
                  const isHighlighted = highlightId === a.id;
                  // tier-3 (headliner) gets a stronger fill so anchors pop
                  const fillAlpha = a.tier === 3 ? "40" : "26";
                  return (
                    <div key={a.id}
                      data-lineup-highlight={isHighlighted ? "true" : undefined}
                      onClick={() => setState({ ...state, artist: a.id })}
                      style={{
                        position: "absolute",
                        top, left: 2, right: 2,
                        height,
                        background: `${stage.color}${active || isHighlighted ? fillAlpha : "0c"}`,
                        borderLeft: `3px solid ${active || isHighlighted ? stage.color : stage.color + "55"}`,
                        borderRadius: 4,
                        padding: "3px 5px 3px 6px",
                        cursor: "pointer",
                        overflow: "hidden",
                        // When dimmed by filters, force the highlighted block back to full opacity
                        // so the SCHEDULE handoff lands on something the user can actually see.
                        opacity: active || isHighlighted ? 1 : 0.28,
                        boxShadow: clash && active ? "inset 0 0 0 1.5px var(--ember)" : "none",
                        zIndex: isHighlighted ? 6 : undefined,
                        animation: isHighlighted ? "lineupFlash 1.8s ease-out" : undefined,
                        display: "flex", flexDirection: "column",
                      }}>
                      <div className="serif" style={{
                        fontSize: 10.5, fontWeight: 700, lineHeight: 1.05,
                        color: "var(--ink)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        paddingRight: saved ? 9 : 0,
                      }}>{a.name}</div>
                      <div className="mono" style={{
                        fontSize: 7.5, letterSpacing: 0.4,
                        color: "var(--muted)", marginTop: 1,
                      }}>{fmt12(a.start)}{height > 34 ? `–${fmt12(a.end)}` : ""}</div>
                      {saved && (
                        <span style={{
                          position: "absolute", top: 2, right: 4,
                          fontSize: 9, color: "var(--ember)", fontWeight: 800,
                          lineHeight: 1,
                        }}>★</span>
                      )}
                      {!saved && matched && height > 26 && (
                        <span style={{
                          position: "absolute", top: 3, right: 4,
                          fontSize: 8, color: "#1DB954", fontWeight: 800,
                          lineHeight: 1,
                        }}>♫</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* NOW line spans across all columns */}
          {nowTop != null && (
            <div style={{
              position: "absolute",
              left: GUTTER_W, right: 0,
              top: nowTop, height: 0,
              borderTop: "2px solid var(--ember)",
              boxShadow: "0 0 8px rgba(232,93,46,0.55)",
              zIndex: 4,
              pointerEvents: "none",
            }}>
              <span className="mono" style={{
                position: "absolute",
                left: -GUTTER_W + 4, top: -8,
                fontSize: 7.5, letterSpacing: 0.6,
                color: "#fff", fontWeight: 800,
                background: "var(--ember)",
                padding: "1px 4px", borderRadius: 3,
              }}>NOW</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictResolver({ conflicts, onKeep, onKeepBoth, onSplit }) {
  const [idx, setIdx] = React.useState(0);
  // If the current index falls out of range because a conflict was just
  // resolved (state mutation upstream re-renders us with a shorter list),
  // clamp back into bounds.
  const safeIdx = Math.min(idx, Math.max(0, conflicts.length - 1));
  if (!conflicts.length) return null;
  const pair = conflicts[safeIdx];
  const [a, b] = pair;
  const sA = STAGES.find(s => s.id === a.stage);
  const sB = STAGES.find(s => s.id === b.stage);
  const overlapStart = a.start > b.start ? a.start : b.start;
  const overlapEnd = a.end < b.end ? a.end : b.end;

  const next = () => {
    setIdx(i => (i + 1 < conflicts.length ? i + 1 : i));
  };

  return (
    <div style={{
      margin: "0 16px 14px",
      padding: 14,
      borderRadius: 16,
      background: "var(--ink)",
      color: "var(--paper)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2">
            <polygon points="12,3 22,20 2,20" strokeLinejoin="round"/>
            <path d="M12 10 V14" strokeLinecap="round"/>
            <circle cx="12" cy="17" r="0.7" fill="var(--ember)"/>
          </svg>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--ember)", fontWeight: 700 }}>
            CONFLICT {idx + 1}/{conflicts.length}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "rgba(247,237,224,0.55)" }}>
          OVERLAP {overlapStart}–{overlapEnd}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[a, b].map((art, i) => {
          const stg = i === 0 ? sA : sB;
          return (
            <div key={art.id} style={{
              background: "rgba(247,237,224,0.06)", borderRadius: 12, padding: "9px 10px",
              borderLeft: `3px solid ${stg.color}`,
            }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1.05 }}>{art.name}</div>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: "rgba(247,237,224,0.55)", marginTop: 3 }}>
                {stg.name.toUpperCase()} · {fmt12(art.start)}–{fmt12(art.end)}
              </div>
              <button onClick={() => onKeep(art.id, i === 0 ? b.id : a.id)} style={{
                marginTop: 8, width: "100%",
                background: stg.color, color: "#fff", border: "none",
                borderRadius: 8, padding: "6px 8px",
                fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                cursor: "pointer",
              }}>KEEP THIS</button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onKeepBoth?.(pair)} style={{
          flex: 1, background: "rgba(247,237,224,0.08)",
          border: "1px solid rgba(247,237,224,0.3)",
          color: "var(--paper)", borderRadius: 10, padding: "8px 10px",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
          cursor: "pointer",
        }}>KEEP BOTH ↺</button>
        <button onClick={() => onSplit(pair)} style={{
          flex: 1, background: "transparent", border: "1px solid rgba(247,237,224,0.3)",
          color: "var(--paper)", borderRadius: 10, padding: "8px 10px",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
          cursor: "pointer",
        }}>SPLIT NIGHT →</button>
        {conflicts.length > 1 && (
          <button onClick={next} style={{
            background: "transparent", border: "1px solid rgba(247,237,224,0.3)",
            color: "rgba(247,237,224,0.65)", borderRadius: 10, padding: "8px 12px",
            fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
            cursor: "pointer",
          }}>NEXT</button>
        )}
      </div>
    </div>
  );
}

function TierStars({ tier }) {
  const colors = { 3: "#f59a36", 2: "var(--muted)", 1: "rgba(26,18,13,0.25)" };
  return (
    <span style={{ display: "inline-flex", gap: 1.5, alignItems: "center" }}>
      {[1, 2, 3].map(i => (
        <svg key={i} width="9" height="9" viewBox="0 0 24 24"
          fill={i <= tier ? colors[tier] : "rgba(26,18,13,0.12)"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </span>
  );
}

// ── .ics calendar export ──
// Festival timezone + day → date map come from FESTIVAL_CONFIG so this
// works for any festival once the config is loaded. Emit DTSTART/DTEND
// with TZID so any calendar app picks the right local time.
function _setTimeToLocalDate(day, hhmm) {
  const meta = FESTIVAL_CONFIG.dayDates[day];
  const d = new Date(meta.y, meta.m, meta.d);
  const [h, m] = hhmm.split(":").map(Number);
  // Times before 08:00 are early-morning of the next calendar day
  if (h < 8) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}
function _icsLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function _icsEscape(s) {
  return String(s || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
}

async function exportLineupICS(state) {
  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(Boolean)
    .sort((a, b) => a.day - b.day || toNightMin(a.start) - toNightMin(b.start));
  if (saved.length === 0) return { ok: false, reason: "empty" };

  const tz = FESTIVAL_CONFIG.tz;
  const fid = FESTIVAL_CONFIG.id;
  const fname = FESTIVAL_CONFIG.shortName;
  const venue = FESTIVAL_CONFIG.locationShort;
  const dtstamp = _icsLocal(new Date());
  const events = saved.map(a => {
    const stage = STAGES.find(s => s.id === a.stage);
    const start = _icsLocal(_setTimeToLocalDate(a.day, a.start));
    const end   = _icsLocal(_setTimeToLocalDate(a.day, a.end));
    const summary = _icsEscape(`${a.name} · ${stage.short}`);
    const desc = _icsEscape(`${a.genre} · ${stage.name}\\nbuilt with Plursky · plursky.com`);
    const loc = _icsEscape(`${stage.name} · ${venue}`);
    return [
      "BEGIN:VEVENT",
      `UID:plursky-${a.id}-${fid}@plursky.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${tz}:${start}`,
      `DTEND;TZID=${tz}:${end}`,
      `SUMMARY:${summary}`,
      `LOCATION:${loc}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      `DESCRIPTION:${summary} starts in 15 min`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  }).join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Plursky//${fname}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:My ${fname}`,
    `X-WR-TIMEZONE:${tz}`,
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    events,
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const fileName = `my-${fid}.ics`;
  // Use text/plain for the share file — text/calendar is NOT in the Web Share API
  // allowlist on iOS, causing canShare() to return false silently.
  // iOS Calendar and most apps still recognise .ics by filename extension.
  const shareFile = new File([blob], fileName, { type: "text/plain" });
  if (navigator.canShare?.({ files: [shareFile] }) && navigator.share) {
    try { await navigator.share({ files: [shareFile], title: `My ${fname}` }); return { ok: true, mode: "share", count: saved.length }; }
    catch (e) { if (e.name === "AbortError") return { ok: true, mode: "abort" }; }
  }
  // iOS PWA: link.download is blocked; open a data: URL instead which Safari
  // recognises as a calendar file and offers the "Add to Calendar" prompt.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    const dataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    window.open(dataUrl, "_blank");
    return { ok: true, mode: "download", count: saved.length };
  }
  // Desktop / Android: anchor download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { ok: true, mode: "download", count: saved.length };
}

// ── Printable lineup PDF (browser native) ──
// Opens a print-friendly HTML view in a new window and triggers Print.
// User saves as PDF from the OS print dialog — no PDF library required.
function printLineupPDF(state) {
  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(Boolean)
    .sort((a, b) => a.day - b.day || toNightMin(a.start) - toNightMin(b.start));
  if (saved.length === 0) return { ok: false, reason: "empty" };

  const dayLabel = { 1: "FRI · MAY 15", 2: "SAT · MAY 16", 3: "SUN · MAY 17" };
  const stages = [...new Set(saved.map(a => a.stage))].length;
  const grouped = { 1: [], 2: [], 3: [] };
  saved.forEach(a => grouped[a.day].push(a));

  const dayBlock = (day, list) => list.length === 0 ? "" : `
    <section class="day">
      <h2>${dayLabel[day]}<span class="cnt">${list.length} sets</span></h2>
      <table>
        <colgroup><col class="ctime"><col><col class="cstage"></colgroup>
        ${list.map(a => {
          const st = STAGES.find(s => s.id === a.stage);
          return `<tr>
            <td class="time">${fmt12(a.start)}<span class="end">${fmt12(a.end)}</span></td>
            <td>
              <div class="name">${a.name.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>
              <div class="genre">${a.genre}</div>
            </td>
            <td class="stage" style="border-left-color:${st.color}">${st.name}</td>
          </tr>`;
        }).join("")}
      </table>
    </section>`;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>My EDC LV 2026 — Plursky</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Geist',system-ui,sans-serif;color:#1a120d;background:#f7ede0;padding:48px 56px;font-size:13px;line-height:1.5}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a120d;padding-bottom:14px;margin-bottom:30px}
  .brand{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:3px;font-weight:600;opacity:0.65}
  h1{font-family:'Instrument Serif',serif;font-size:48px;line-height:0.95;letter-spacing:-1px;margin-top:6px}
  h1 em{color:#e85d2e;font-style:italic}
  .meta{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:1.6px;text-align:right;color:rgba(26,18,13,0.55)}
  .meta b{color:#1a120d;font-weight:600;font-size:14px}
  .day{margin-bottom:34px;page-break-inside:avoid}
  .day h2{font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:2.5px;font-weight:700;color:#e85d2e;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline}
  .cnt{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:1.4px;color:rgba(26,18,13,0.5);font-weight:500}
  table{width:100%;border-collapse:collapse}
  col.ctime{width:90px}
  col.cstage{width:180px}
  tr{border-bottom:1px solid rgba(26,18,13,0.12)}
  td{padding:10px 6px;vertical-align:middle}
  td.time{font-family:'Geist Mono',monospace;font-size:14px;font-weight:600}
  td.time .end{display:block;font-weight:400;font-size:9.5px;letter-spacing:1px;color:rgba(26,18,13,0.5);margin-top:1px}
  .name{font-family:'Instrument Serif',serif;font-size:24px;line-height:1.1;letter-spacing:-0.3px}
  .genre{font-family:'Geist Mono',monospace;font-size:9.5px;letter-spacing:1.3px;color:rgba(26,18,13,0.5);margin-top:3px;text-transform:uppercase}
  td.stage{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:1.6px;font-weight:700;text-align:right;border-left:3px solid;padding-left:14px;text-transform:uppercase}
  footer{margin-top:36px;padding-top:14px;border-top:1px solid rgba(26,18,13,0.18);display:flex;justify-content:space-between;font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:1.4px;color:rgba(26,18,13,0.55)}
  footer em{font-family:'Instrument Serif',serif;font-size:14px;color:#1a120d;font-style:italic;letter-spacing:0}
  @media print{
    body{padding:24px 32px;background:#fff}
    .head{margin-bottom:22px}
    .day{margin-bottom:26px}
  }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="brand">PLURSKY</div>
      <h1>My EDC <em>plan</em></h1>
    </div>
    <div class="meta">
      <b>${saved.length}</b> SETS · <b>${stages}</b> STAGES<br>
      LAS VEGAS MOTOR SPEEDWAY<br>
      MAY 15–17 · 2026
    </div>
  </div>
  ${dayBlock(1, grouped[1])}
  ${dayBlock(2, grouped[2])}
  ${dayBlock(3, grouped[3])}
  <footer>
    <span>plursky.com</span>
    <em>Three nights under the electric sky</em>
  </footer>
</body></html>`;

  const w = window.open("", "plursky-print", "width=900,height=1100");
  if (!w) return { ok: false, reason: "popup_blocked" };
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give fonts a moment to load before triggering Print
  setTimeout(() => { try { w.print(); } catch {} }, 500);
  return { ok: true };
}

async function copyScheduleText(state) {
  const ids = state.saved;
  if (!ids.length) return { ok: false, reason: "empty" };
  const lines = [1, 2, 3].flatMap(day => {
    const d = FESTIVAL_CONFIG.dayDates[day];
    const artists = ARTISTS.filter(a => a.day === day && ids.includes(a.id))
      .sort((a, b) => toNightMin(a.start) - toNightMin(b.start));
    if (!artists.length) return [];
    return [
      `${d.short} · ${d.name.toUpperCase()}`,
      ...artists.map(a => {
        const stage = STAGES.find(s => s.id === a.stage);
        return `  ${fmt12(a.start)}  ${a.name}  @  ${stage ? stage.name : a.stage}`;
      }),
      "",
    ];
  });
  const text = [`My ${FESTIVAL_CONFIG.name} lineup (${ids.length} sets):`, "", ...lines].join("\n").trim();
  try {
    if (navigator.share) {
      await navigator.share({ title: `My ${FESTIVAL_CONFIG.name} lineup`, text });
      return { ok: true };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch { return { ok: false }; }
}

function ShareLineupButton({ state }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null); // 'image' | 'cal' | 'pdf' | 'txt' | null

  const wrap = (key, fn) => async () => {
    if (busy) return;
    setOpen(false); setBusy(true);
    const r = await fn(state);
    setBusy(false);
    if (r?.ok) { setDone(key); setTimeout(() => setDone(null), 1800); }
    else if (r?.reason === "popup_blocked") {
      alert("Popup blocked — allow popups for plursky.com and try again.");
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} disabled={busy} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 999,
        background: done ? "var(--success)" : "var(--ink)",
        color: "var(--paper)", border: "none",
        fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
        cursor: busy ? "wait" : "pointer", textTransform: "uppercase",
        opacity: busy ? 0.65 : 1,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4 V14"/><path d="M7 9 L12 4 L17 9"/><path d="M5 14 V20 H19 V14"/>
        </svg>
        {done === "image" ? "SAVED"
          : done === "cal" ? "ADDED"
          : done === "pdf" ? "PRINTED"
          : done === "txt" ? "COPIED"
          : busy ? "…" : "SHARE"}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: "fixed", inset: 0, zIndex: 60, background: "transparent",
          }}/>
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 61,
            background: "var(--paper)", border: "1px solid var(--line-2)",
            borderRadius: 12, padding: 5, minWidth: 200,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          }}>
            <ShareMenuItem icon="img"  label="Image for stories" sub="1080×1920 PNG" onClick={wrap("image", shareLineupImage)} />
            <ShareMenuItem icon="cal"  label="Add to calendar"   sub=".ics with 15-min reminders" onClick={wrap("cal", exportLineupICS)} />
            <ShareMenuItem icon="prn"  label="Print schedule"    sub="Save as PDF from print dialog" onClick={wrap("pdf", async (s) => printLineupPDF(s))} />
            <ShareMenuItem icon="txt"  label="Copy as text"      sub="Paste anywhere" onClick={wrap("txt", copyScheduleText)} />
          </div>
        </>
      )}
    </div>
  );
}

function ShareMenuItem({ icon, label, sub, onClick }) {
  const ico =
    icon === "img" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17 L9 12 L14 16 L17 13 L21 17"/></svg> :
    icon === "cal" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9 H21"/><path d="M8 3 V7"/><path d="M16 3 V7"/></svg> :
    icon === "txt" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8 H16"/><path d="M8 12 H16"/><path d="M8 16 H12"/></svg> :
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9 V3 H18 V9"/><rect x="3" y="9" width="18" height="9" rx="1"/><rect x="6" y="14" width="12" height="6"/></svg>;
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      padding: "9px 10px", borderRadius: 8,
      background: "transparent", border: "none", cursor: "pointer",
      textAlign: "left", color: "var(--ink)",
      fontFamily: "inherit", transition: "background .15s",
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <span style={{ color: "var(--ember)", display: "flex" }}>{ico}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span className="mono" style={{ display: "block", fontSize: 9, letterSpacing: 1.1, color: "var(--muted)", marginTop: 1, textTransform: "uppercase" }}>{sub}</span>
      </span>
    </button>
  );
}

function toggleSave(state, setState, id) {
  try { navigator.vibrate([30]); } catch {}
  const has = state.saved.includes(id);
  const next = has ? state.saved.filter(x => x !== id) : [...state.saved, id];
  setState({ ...state, saved: next });
  try {
    const a = ARTISTS.find(x => x.id === id);
    const label = a?.name ? a.name.toUpperCase() : "SET";
    window.plurskyToast?.(has ? `REMOVED · ${label}` : `SAVED · ${next.length} SETS`);
  } catch {}
}

// ── Share lineup image (canvas → PNG → Web Share / download) ──
async function shareLineupImage(state) {
  const saved = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(Boolean)
    .sort((a, b) => a.day - b.day || toNightMin(a.start) - toNightMin(b.start));

  if (saved.length === 0) return { ok: false, reason: "empty" };

  // Make sure custom fonts are loaded before drawing — canvas needs them ready
  try { await document.fonts?.ready; } catch {}

  // 1080×1920 = IG/TikTok story aspect
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  // Paper-tone gradient ground
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    "#f7ede0");
  bg.addColorStop(0.55, "#eee0cb");
  bg.addColorStop(1,    "#e6d3b6");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Sun-glow corner — distinct EDC desert vibe
  const glow = ctx.createRadialGradient(W * 0.85, 220, 30, W * 0.85, 220, 600);
  glow.addColorStop(0, "rgba(245,154,54,0.42)");
  glow.addColorStop(1, "rgba(245,154,54,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(26,18,13,0.55)";
  ctx.font = '600 22px "Geist Mono", monospace';
  ctx.fillText("PLURSKY · MY EDC LV 2026", 80, 130);

  ctx.fillStyle = "#1a120d";
  ctx.font = '108px "Instrument Serif", serif';
  ctx.fillText("My EDC", 80, 280);
  ctx.font = 'italic 108px "Instrument Serif", serif';
  ctx.fillStyle = "#e85d2e";
  ctx.fillText("plan", 380, 280);

  ctx.fillStyle = "rgba(26,18,13,0.6)";
  ctx.font = '500 26px "Geist Mono", monospace';
  const stages = [...new Set(saved.map(a => a.stage))].length;
  ctx.fillText(`${saved.length} SETS · ${stages} STAGES · 3 NIGHTS`, 80, 340);

  // Set list
  let y = 470;
  let lastDay = null;
  const dayMeta = { 1: { label: "FRI", date: "MAY 15" }, 2: { label: "SAT", date: "MAY 16" }, 3: { label: "SUN", date: "MAY 17" } };

  for (const a of saved) {
    if (a.day !== lastDay) {
      lastDay = a.day;
      // Day section header
      const dm = dayMeta[a.day];
      ctx.fillStyle = "rgba(26,18,13,0.18)";
      ctx.fillRect(80, y - 20, W - 160, 1);
      ctx.fillStyle = "#1a120d";
      ctx.font = '500 28px "Geist Mono", monospace';
      ctx.fillText(`${dm.label} · ${dm.date}`, 80, y + 18);
      ctx.fillStyle = "rgba(26,18,13,0.4)";
      const dayCount = saved.filter(s => s.day === a.day).length;
      ctx.textAlign = "right";
      ctx.fillText(`${dayCount} SETS`, W - 80, y + 18);
      ctx.textAlign = "left";
      y += 70;
    }

    const stage = STAGES.find(s => s.id === a.stage);

    // Stage colour stripe
    ctx.fillStyle = stage.color;
    ctx.fillRect(80, y, 6, 78);

    // Time
    ctx.fillStyle = "#1a120d";
    ctx.font = '500 28px "Geist Mono", monospace';
    ctx.fillText(fmt12(a.start), 110, y + 32);
    ctx.fillStyle = "rgba(26,18,13,0.45)";
    ctx.font = '400 20px "Geist Mono", monospace';
    ctx.fillText(fmt12(a.end), 110, y + 60);

    // Name + stage
    ctx.fillStyle = "#1a120d";
    ctx.font = '46px "Instrument Serif", serif';
    let name = a.name;
    if (ctx.measureText(name).width > 760) {
      while (ctx.measureText(name + "…").width > 760 && name.length > 0) name = name.slice(0, -1);
      name = name + "…";
    }
    ctx.fillText(name, 250, y + 38);

    ctx.fillStyle = stage.color;
    ctx.font = '600 18px "Geist Mono", monospace';
    ctx.fillText(stage.name.toUpperCase() + " · " + a.genre.toUpperCase(), 250, y + 64);

    y += 92;
    if (y > H - 180) break; // safety: don't overflow story height
  }

  // Footer
  ctx.fillStyle = "#1a120d";
  ctx.font = '500 22px "Geist Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("plursky.com", W / 2, H - 110);

  ctx.fillStyle = "rgba(26,18,13,0.45)";
  ctx.font = 'italic 26px "Instrument Serif", serif';
  ctx.fillText("Three nights under the electric sky", W / 2, H - 70);

  // Export
  return new Promise((resolve) => {
    cv.toBlob(async (blob) => {
      if (!blob) { resolve({ ok: false, reason: "encode_fail" }); return; }
      const file = new File([blob], "my-edc-2026.png", { type: "image/png" });
      // Try Web Share API w/ files first (iOS 15+, Android Chrome)
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: "My EDC 2026 plan" });
          resolve({ ok: true, mode: "share" });
          return;
        } catch (e) {
          if (e.name === "AbortError") { resolve({ ok: true, mode: "abort" }); return; }
          // fall through to download
        }
      }
      // Fallback: trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "my-edc-2026.png";
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve({ ok: true, mode: "download" });
    }, "image/png");
  });
}

Object.assign(window, { LineupScreen, NightWizard, toggleSave, toNightMin, overlaps, shareLineupImage });
