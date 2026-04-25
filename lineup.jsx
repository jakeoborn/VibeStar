// Lineup / schedule screen — day tabs, stage-striped timeline list

function LineupScreen({ state, setState }) {
  const [day, setDay] = React.useState(state.lineupDay || NOW.day);
  const [filter, setFilter] = React.useState("all"); // all | saved
  const [stageFilter, setStageFilter] = React.useState("all"); // all | stage id

  const dayArtists = ARTISTS
    .filter(a => a.day === day)
    .filter(a => filter === "all" || state.saved.includes(a.id))
    .filter(a => stageFilter === "all" || a.stage === stageFilter)
    .sort((a, b) => {
      // EDC runs 19:00→05:00 — treat early AM as "next day" (hour + 24)
      const toSlot = t => { const h = parseInt(t.split(":")[0]); return h < 8 ? h + 24 : h; };
      return toSlot(a.start) - toSlot(b.start);
    });

  // conflicts: 2+ saved sets overlap in time
  const savedToday = ARTISTS.filter(a => a.day === day && state.saved.includes(a.id));
  const conflicts = [];
  for (let i = 0; i < savedToday.length; i++) {
    for (let j = i + 1; j < savedToday.length; j++) {
      if (overlaps(savedToday[i], savedToday[j])) conflicts.push([savedToday[i], savedToday[j]]);
    }
  }

  return (
    <Screen bg="var(--paper)">
      <div style={{ padding: "8px 20px 8px" }}>
        <TopBar title={<span>Lineup</span>} sub={"EDC LAS VEGAS · MAY 15–17"} tight />
      </div>

      {/* Day tabs */}
      <div style={{ display: "flex", gap: 6, padding: "4px 16px 10px", borderBottom: "1px solid var(--line)" }}>
        {DAYS.map(d => {
          const on = d.n === day;
          return (
            <button key={d.n} onClick={() => setDay(d.n)} style={{
              flex: 1,
              padding: "10px 8px",
              borderRadius: 12,
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink)",
              border: on ? "none" : "1px solid var(--line-2)",
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: 1.6, opacity: on ? 0.7 : 0.5 }}>{d.label}</span>
              <span className="serif" style={{ fontSize: 18 }}>{d.date.split(" ")[1]}</span>
            </button>
          );
        })}
      </div>

      {/* Stage filter chips */}
      <div className="no-scrollbar" style={{
        display: "flex", gap: 6, padding: "10px 16px 4px",
        overflowX: "auto", scrollbarWidth: "none",
        borderBottom: "1px solid var(--line)",
      }}>
        {[{ id: "all", name: "All Stages", color: "var(--ink)" }, ...STAGES].map(s => {
          const on = stageFilter === s.id;
          return (
            <button key={s.id} onClick={() => setStageFilter(s.id)} className="mono" style={{
              flexShrink: 0,
              padding: "5px 11px",
              borderRadius: 999,
              background: on ? (s.color || "var(--ink)") : "transparent",
              color: on ? "#fff" : "var(--ink)",
              border: on ? "none" : "1px solid var(--line-2)",
              fontSize: 9.5, letterSpacing: 1.1, textTransform: "uppercase",
              cursor: "pointer", fontWeight: on ? 700 : 400,
            }}>{s.short || s.name}</button>
          );
        })}
      </div>

      {/* Filter row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["all","All"],["saved","Mine"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} className="mono" style={{
              padding: "5px 11px",
              borderRadius: 999,
              background: filter === k ? "var(--ember)" : "transparent",
              color: filter === k ? "#fff" : "var(--muted)",
              border: filter === k ? "none" : "1px solid var(--line-2)",
              fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
              cursor: "pointer",
            }}>{l}{k === "saved" && state.saved.length ? ` · ${state.saved.filter(id => ARTISTS.find(a => a.id === id)?.day === day).length}` : ""}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {state.saved.length > 0 && (
            <ShareLineupButton state={state} />
          )}
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
            {dayArtists.length} SETS
          </div>
        </div>
      </div>

      {conflicts.length > 0 && filter !== "all" && (
        <ConflictResolver
          conflicts={conflicts}
          onKeep={(keepId, dropId) => {
            setState({ ...state, saved: state.saved.filter(id => id !== dropId) });
          }}
          onSplit={(pair) => setState({ ...state, tab: "map", focusStage: pair[0].stage })}
        />
      )}

      <ScrollBody style={{ padding: "0 16px 20px" }}>
        {dayArtists.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--muted)", fontStyle: "italic", marginBottom: 6 }}>
              Nothing saved for this day
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              SWITCH TO "ALL" TO BROWSE
            </div>
          </div>
        )}
        {dayArtists.map(a => {
          const stage = STAGES.find(s => s.id === a.stage);
          const saved = state.saved.includes(a.id);
          return (
            <div key={a.id} style={{
              display: "flex", gap: 10, padding: "12px 0",
              borderBottom: "1px solid var(--line)",
              alignItems: "center",
            }}>
              <div style={{ width: 46, flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>{a.start}</div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1, color: "var(--muted)" }}>{a.end}</div>
              </div>
              <div style={{ width: 4, alignSelf: "stretch", background: stage.color, borderRadius: 3 }} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                   onClick={() => setState({ ...state, tab: "home", artist: a.id })}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, letterSpacing: -0.3 }}>{a.name}</div>
                  <TierStars tier={a.tier} />
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

function ConflictResolver({ conflicts, onKeep, onSplit }) {
  const [idx, setIdx] = React.useState(0);
  if (!conflicts.length) return null;
  const pair = conflicts[idx];
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
                {stg.name.toUpperCase()} · {art.start}–{art.end}
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
        <button onClick={() => onSplit(pair)} style={{
          flex: 1, background: "transparent", border: "1px solid rgba(247,237,224,0.3)",
          color: "var(--paper)", borderRadius: 10, padding: "8px 10px",
          fontFamily: "Geist Mono, monospace", fontSize: 9, letterSpacing: 1.2, fontWeight: 600,
          cursor: "pointer",
        }}>SPLIT THE NIGHT →</button>
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
// Festival is at LVMS in America/Los_Angeles (PDT in May).
// Emit DTSTART/DTEND with TZID so any calendar app picks the right local time.
function _setTimeToLocalDate(day, hhmm) {
  // day=1 → May 15 (Fri), day=2 → May 16, day=3 → May 17
  const d = new Date(2026, 4, 14 + day);
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

  const dtstamp = _icsLocal(new Date());
  const events = saved.map(a => {
    const stage = STAGES.find(s => s.id === a.stage);
    const start = _icsLocal(_setTimeToLocalDate(a.day, a.start));
    const end   = _icsLocal(_setTimeToLocalDate(a.day, a.end));
    const summary = _icsEscape(`${a.name} · ${stage.short}`);
    const desc = _icsEscape(`${a.genre} · ${stage.name}\\nbuilt with Plursky · plursky.com`);
    const loc = _icsEscape(`${stage.name} · Las Vegas Motor Speedway`);
    return [
      "BEGIN:VEVENT",
      `UID:plursky-${a.id}-2026@plursky.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=America/Los_Angeles:${start}`,
      `DTEND;TZID=America/Los_Angeles:${end}`,
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
    "PRODID:-//Plursky//EDC LV 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:My EDC LV 2026",
    "X-WR-TIMEZONE:America/Los_Angeles",
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
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
  const file = new File([blob], "my-edc-2026.ics", { type: "text/calendar" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: "My EDC LV 2026" }); return { ok: true, mode: "share", count: saved.length }; }
    catch (e) { if (e.name === "AbortError") return { ok: true, mode: "abort" }; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "my-edc-2026.ics";
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
            <td class="time">${a.start}<span class="end">${a.end}</span></td>
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

function ShareLineupButton({ state }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null); // 'image' | 'cal' | 'pdf' | null

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
  const has = state.saved.includes(id);
  setState({ ...state, saved: has ? state.saved.filter(x => x !== id) : [...state.saved, id] });
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
    ctx.fillText(a.start, 110, y + 32);
    ctx.fillStyle = "rgba(26,18,13,0.45)";
    ctx.font = '400 20px "Geist Mono", monospace';
    ctx.fillText(a.end, 110, y + 60);

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

Object.assign(window, { LineupScreen, toggleSave, toNightMin, overlaps, shareLineupImage });
