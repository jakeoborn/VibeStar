// Screen shell + bottom tab nav + shared atoms

function Screen({ children, bg = "var(--paper)", pad = true, ink = "var(--ink)" }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: bg,
      color: ink,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function ScrollBody({ children, style }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
      ...style,
    }}>
      {children}
    </div>
  );
}

function TopBar({ title, right, sub, tight }) {
  return (
    <div style={{
      padding: tight ? "6px 20px 10px" : "10px 20px 14px",
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 12,
    }}>
      <div>
        {sub && <div className="mono" style={{
          fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase",
          color: "var(--muted)", marginBottom: 4,
        }}>{sub}</div>}
        <div className="serif" style={{ fontSize: 34, lineHeight: 0.95, letterSpacing: -0.5 }}>
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}

// Bottom tab nav — 5 tabs, labels + icons drawn as SVG
function TabBar({ active, onChange }) {
  const tabs = [
    { id: "home",    label: "Today",  icon: HomeIcon },
    { id: "map",     label: "Map",    icon: MapIcon },
    { id: "lineup",  label: "Lineup", icon: LineupIcon },
    { id: "spotify", label: "Music",  icon: MusicIcon },
    { id: "me",      label: "Me",     icon: MeIcon },
  ];
  return (
    <div style={{
      background: "var(--paper-2)",
      borderTop: "1px solid var(--line)",
      padding: "8px 10px 10px",
      display: "flex",
      justifyContent: "space-around",
    }}>
      {tabs.map(t => {
        const Icon = t.icon;
        const on = active === t.id;
        return (
          <button key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 8px",
              color: on ? "var(--ink)" : "var(--muted)",
              minWidth: 54,
            }}>
            <Icon on={on} />
            <span className="mono" style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const stroke = (on) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: on ? 1.8 : 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

function HomeIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5 L12 5.5 M12 18.5 L12 21.5 M2.5 12 L5.5 12 M18.5 12 L21.5 12" />
      <path d="M5.5 5.5 L7.5 7.5 M16.5 16.5 L18.5 18.5 M5.5 18.5 L7.5 16.5 M16.5 7.5 L18.5 5.5" opacity="0.55"/>
    </svg>
  );
}
function MapIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <path d="M3 6 L9 4 L15 6 L21 4 L21 18 L15 20 L9 18 L3 20 Z" />
      <path d="M9 4 L9 18 M15 6 L15 20" />
    </svg>
  );
}
function LineupIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <path d="M4 6 L20 6 M4 12 L20 12 M4 18 L14 18" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
function MusicIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
      <path d="M9.5 17 L9.5 5 L19.5 3 L19.5 15" />
    </svg>
  );
}
function MeIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={stroke(on)}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20 C 5 16, 8.5 14, 12 14 C 15.5 14, 19 16, 19 20" />
    </svg>
  );
}

// Generic pill
function Pill({ children, tone = "ink", style }) {
  const tones = {
    ink:    { bg: "var(--ink)", fg: "var(--paper)" },
    outline:{ bg: "transparent", fg: "var(--ink)", border: "1px solid var(--line-2)" },
    ember:  { bg: "var(--ember)", fg: "#fff" },
    paper:  { bg: "var(--paper)", fg: "var(--ink)", border: "1px solid var(--line)" },
    night:  { bg: "var(--night)", fg: "var(--paper)" },
  };
  const t = tones[tone];
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 9px", borderRadius: 999,
      background: t.bg, color: t.fg, border: t.border || "none",
      fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 500,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

// Artist color swatch (small disk/thumbnail)
function ArtistSwatch({ artist, size = 44 }) {
  const initials = artist.name.split(/\s+/).map(w => w[0]).slice(0,2).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: size,
      background: artist.img,
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Instrument Serif, serif",
      fontSize: size * 0.42,
      flexShrink: 0,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
    }}>
      {initials}
    </div>
  );
}

// Plursky logo mark — a small sun/circle + wordmark
function Wordmark({ size = 18, color = "var(--ink)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color }}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        {[0,45,90,135,180,225,270,315].map(a => {
          const rad = a * Math.PI / 180;
          return (
            <line key={a}
              x1={12 + Math.cos(rad) * 7}
              y1={12 + Math.sin(rad) * 7}
              x2={12 + Math.cos(rad) * 10}
              y2={12 + Math.sin(rad) * 10}
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          );
        })}
      </svg>
      <span className="mono" style={{ fontSize: size * 0.72, letterSpacing: 3, fontWeight: 500 }}>PLURSKY</span>
    </div>
  );
}

// ── PWA install prompt ────────────────────────────────────────
// Android (Chrome/Edge): captures beforeinstallprompt and exposes prompt().
// iOS (Safari): no native install prompt — show "Add to Home Screen" hint.
// Standalone (already installed): suppress everything.
function useInstallPrompt() {
  const [deferred, setDeferred] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("install_dismissed") === "1"
  );

  React.useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferred(e); };
    const installed = () => {
      setDeferred(null);
      try { localStorage.setItem("install_dismissed", "1"); } catch {}
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  const canInstall = !dismissed && !isStandalone && (deferred || isIOS);

  return {
    canInstall,
    isIOS,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setDeferred(null);
      } catch {}
    },
    dismiss: () => {
      try { localStorage.setItem("install_dismissed", "1"); } catch {}
      setDismissed(true);
    },
  };
}

function InstallBanner() {
  const ip = useInstallPrompt();
  if (!ip.canInstall) return null;

  return (
    <div style={{
      margin: "8px 16px 0",
      padding: "10px 12px",
      borderRadius: 14,
      background: "var(--ink)",
      color: "var(--paper)",
      display: "flex", alignItems: "center", gap: 11,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: "linear-gradient(135deg, var(--ember), var(--horizon))",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span className="serif" style={{ fontSize: 22, color: "#fff", fontStyle: "italic" }}>P</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--flare)", fontWeight: 700 }}>
          INSTALL PLURSKY
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.35, marginTop: 2, color: "rgba(247,237,224,0.85)" }}>
          {ip.isIOS
            ? <>Tap <span style={{ display: "inline-flex", verticalAlign: "middle", padding: "0 2px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 L12 16"/><path d="M7 8 L12 3 L17 8"/><rect x="5" y="13" width="14" height="8" rx="1.5"/>
                </svg></span> then <strong style={{ color: "var(--paper)" }}>Add to Home Screen</strong> for offline + full-screen.</>
            : <>Add to home screen for offline lineup + full-screen map.</>}
        </div>
      </div>
      {!ip.isIOS && (
        <button onClick={ip.install} style={{
          background: "var(--ember)", color: "#fff", border: "none",
          borderRadius: 999, padding: "7px 12px", cursor: "pointer",
          fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
          flexShrink: 0,
        }}>INSTALL</button>
      )}
      <button onClick={ip.dismiss} aria-label="Dismiss" style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: "rgba(247,237,224,0.55)", padding: 4, flexShrink: 0,
        fontSize: 18, lineHeight: 1,
      }}>×</button>
    </div>
  );
}

// ── Push notifications scaffolding ────────────────────────────
// No backend yet — but the SW push handler is in place, so once a backend
// (Supabase Edge Fn / Firebase / native app) wires up Web Push, this just
// needs the subscribe endpoint and we're live.
//
// For now we use registration.showNotification directly to schedule
// foreground reminders for saved sets (works while the tab/PWA is open).
// Background reminders need either a server with VAPID + push subscription,
// or the native app — both planned.
function useNotifications() {
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = React.useState(supported ? Notification.permission : "unsupported");

  const enable = async () => {
    if (!supported) return "unsupported";
    if (perm === "granted") return "granted";
    const result = await Notification.requestPermission();
    setPerm(result);
    return result;
  };

  const showLocal = async (title, opts = {}) => {
    if (!supported || perm !== "granted") return false;
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        await reg.showNotification(title, {
          icon: "/og.svg", badge: "/og.svg",
          vibrate: [80, 40, 80],
          ...opts,
        });
      } else {
        new Notification(title, opts);
      }
      return true;
    } catch { return false; }
  };

  return { supported, perm, enable, showLocal };
}

// Schedules in-tab reminders for upcoming saved sets.
// Uses NOW.time as the festival clock (demo mode); during the real festival
// this would run off the wall clock with `new Date()`.
const _SCHEDULED = new Map(); // setId → timeout handle
function scheduleReminders(state, showLocal) {
  // Clear stale handles
  _SCHEDULED.forEach(h => clearTimeout(h));
  _SCHEDULED.clear();

  const nowMin = (typeof toNightMin !== "undefined" ? toNightMin(NOW.time) : 0);
  const fests = state.saved
    .map(id => ARTISTS.find(a => a.id === id))
    .filter(a => a && a.day === NOW.day);

  fests.forEach(a => {
    const startMin = toNightMin(a.start);
    const minsUntil15 = startMin - 15 - nowMin;
    if (minsUntil15 <= 0 || minsUntil15 > 180) return; // only schedule if within 3hr
    const stage = STAGES.find(s => s.id === a.stage);
    const handle = setTimeout(() => {
      showLocal(`${a.name} starts in 15 min`, {
        body: `${stage.name} · ${a.start}`,
        tag: `set-${a.id}`,
        data: { url: "/" },
      });
    }, minsUntil15 * 60 * 1000);
    _SCHEDULED.set(a.id, handle);
  });
  return _SCHEDULED.size;
}

function NotificationsCard({ state }) {
  const { supported, perm, enable, showLocal } = useNotifications();
  const [scheduled, setScheduled] = React.useState(0);
  const [flash, setFlash] = React.useState(null); // 'enabled' | 'tested' | 'scheduled'

  // When granted, auto-schedule on save list change
  React.useEffect(() => {
    if (perm === "granted") setScheduled(scheduleReminders(state, showLocal));
  }, [perm, state.saved.join(",")]);

  const onEnable = async () => {
    const r = await enable();
    if (r === "granted") {
      const n = scheduleReminders(state, showLocal);
      setScheduled(n);
      setFlash("enabled"); setTimeout(() => setFlash(null), 2000);
    }
  };

  const onTest = async () => {
    const ok = await showLocal("Plursky reminder · TEST", {
      body: "This is what set-start alerts will look like.",
      tag: "plursky-test",
    });
    if (ok) { setFlash("tested"); setTimeout(() => setFlash(null), 1800); }
  };

  if (!supported) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: 12,
        background: "var(--paper)", border: "1px solid var(--line)",
        marginBottom: 12,
      }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--muted)", fontWeight: 700 }}>
          NOTIFICATIONS · UNSUPPORTED
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>
          Your browser doesn't support web notifications. Install Plursky to your home screen for the full experience.
        </div>
      </div>
    );
  }

  const label = perm === "granted" ? "ENABLED" : perm === "denied" ? "BLOCKED" : "OFF";
  const labelColor = perm === "granted" ? "var(--success)" : perm === "denied" ? "#f87171" : "var(--muted)";

  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "var(--paper)", border: "1px solid var(--line)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700 }}>
          REMINDERS
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: labelColor, fontWeight: 700 }}>
          {flash === "enabled" ? "✓ ENABLED" : flash === "tested" ? "✓ TEST SENT" : label}
        </span>
      </div>
      <div className="serif" style={{ fontSize: 19, lineHeight: 1.1, marginBottom: 4 }}>
        15-min head-up before each set
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: perm === "denied" ? 8 : 12 }}>
        {perm === "granted"
          ? `${scheduled} reminder${scheduled === 1 ? "" : "s"} scheduled for tonight. Background pushes ship with the native app.`
          : perm === "denied"
            ? "Notifications are blocked for this site."
            : "Get a notification 15 minutes before each saved set so you don't miss a thing."}
      </div>
      {perm === "denied" && (
        <div style={{
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
          borderRadius: 10, padding: "10px 12px", marginBottom: 12,
        }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>
            HOW TO RE-ENABLE
          </div>
          {/iPhone|iPad|iPod/.test(navigator.userAgent) ? (
            <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.55 }}>
              iPhone: <strong>Settings</strong> → <strong>Apps</strong> → <strong>Safari</strong> → <strong>Notifications</strong> → find <em>plursky.com</em> → Allow
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.55 }}>
              Tap the <strong>lock icon</strong> (or <strong>ⓘ</strong>) in your browser's address bar → <strong>Site settings</strong> → <strong>Notifications</strong> → set to <strong>Allow</strong>, then reload.
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {perm !== "granted" && perm !== "denied" && (
          <button onClick={onEnable} style={{
            background: "var(--ember)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 14px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
          }}>ENABLE</button>
        )}
        {perm === "granted" && (
          <button onClick={onTest} style={{
            background: "transparent", color: "var(--ink)", border: "1px solid var(--line-2)",
            borderRadius: 999, padding: "8px 14px", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
          }}>SEND A TEST</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Festival switcher (Phase 2)
// ─────────────────────────────────────────────────────────────
// Small "EDC LV 2026 ▾" pill that opens a sheet listing every
// festival in FESTIVALS_REGISTRY. Selectable festivals reload the
// page with their config; "coming soon" festivals are visible as
// a roadmap preview but not selectable.
function FestivalChip({ compact = false, accent = "var(--ink)" }) {
  const [open, setOpen] = React.useState(false);
  const canSwitch = FESTIVALS_REGISTRY.filter(f => f.available).length > 1;
  const entry = FESTIVALS_REGISTRY.find(f => f.config.id === FESTIVAL_CONFIG.id);
  return (
    <>
      <div
        onClick={canSwitch ? () => setOpen(true) : undefined}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--paper-2)", border: "1px solid var(--line-2)",
          color: accent,
          borderRadius: 999, padding: compact ? "3px 8px 3px 7px" : "4px 10px 4px 8px",
          fontFamily: "Geist Mono, monospace",
          fontSize: compact ? 9 : 9.5, letterSpacing: 1.2, fontWeight: 700,
          cursor: canSwitch ? "pointer" : "default", whiteSpace: "nowrap",
          userSelect: "none",
        }}>
        <span style={{ fontSize: compact ? 11 : 12 }}>{entry?.emoji || "🎪"}</span>
        <span>{FESTIVAL_CONFIG.shortName.toUpperCase()}</span>
        {canSwitch && (
          <svg width={compact ? 8 : 9} height={compact ? 8 : 9} viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5 L6 7.5 L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {open && <FestivalSwitcher onClose={() => setOpen(false)} />}
    </>
  );
}

function FestivalSwitcher({ onClose }) {
  const activeId = FESTIVAL_CONFIG.id;
  const onPick = (id, available) => {
    if (!available || id === activeId) { onClose(); return; }
    setActiveFestivalAndReload(id);
  };
  const byRegion = {};
  FESTIVALS_REGISTRY.forEach(f => {
    (byRegion[f.region] = byRegion[f.region] || []).push(f);
  });
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 60,
      background: "rgba(13,8,4,0.55)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end",
      animation: "fadeIn .2s",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--paper)", color: "var(--ink)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        width: "100%", padding: "14px 20px 24px",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.4)",
        maxHeight: "85%", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--line-2)" }}/>
        </div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: "var(--muted)", marginBottom: 4 }}>
          PICK A FESTIVAL
        </div>
        <div className="serif" style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 18 }}>
          Where are you raving?
        </div>

        {Object.entries(byRegion).map(([region, fests]) => (
          <div key={region} style={{ marginBottom: 18 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>
              {region.toUpperCase()}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {fests.map(f => {
                const isActive = f.config.id === activeId;
                const dimmed = !f.available;
                return (
                  <button key={f.config.id} onClick={() => onPick(f.config.id, f.available)}
                    disabled={!f.available && !isActive}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 14,
                      background: isActive ? f.accent : "var(--paper-2)",
                      color: isActive ? "#fff" : "var(--ink)",
                      border: `1px solid ${isActive ? f.accent : "var(--line-2)"}`,
                      cursor: f.available ? "pointer" : "default",
                      opacity: dimmed && !isActive ? 0.55 : 1,
                      textAlign: "left", fontFamily: "inherit",
                      transition: "transform .12s",
                    }}>
                    <span style={{ fontSize: 22 }}>{f.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="serif" style={{ fontSize: 18, lineHeight: 1.05, fontWeight: 400 }}>
                        {f.config.name}
                      </div>
                      <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1, marginTop: 3, opacity: 0.85 }}>
                        {f.config.location.toUpperCase()} · {f.config.dates.toUpperCase()}
                      </div>
                    </div>
                    {isActive && (
                      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "rgba(255,255,255,0.25)" }}>
                        ACTIVE
                      </div>
                    )}
                    {!isActive && !f.available && (
                      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, padding: "3px 7px", borderRadius: 999, background: "var(--paper)", color: "var(--muted)", border: "1px solid var(--line-2)" }}>
                        SOON
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
          More festivals coming through 2026.<br/>
          Switching reloads the app with the new festival's data.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Battery-saver mode
// ─────────────────────────────────────────────────────────────
// Three modes: "off" | "on" | "auto" (default).
//   auto = battery <25% on a non-charging device  OR  02:00–06:00 wall-clock.
// When active, body.bs-on disables all keyframe animations, transitions,
// and backdrop-filter blurs, then dims via brightness/saturate. Geolocation
// (map.jsx) and the demo-wander tick read window._BS.active to throttle.
const BATTERY_SAVER_KEY = "battery_saver_mode";
const _BS = (window._BS = window._BS || {
  mode: (() => {
    try { return localStorage.getItem(BATTERY_SAVER_KEY) || "auto"; }
    catch { return "auto"; }
  })(),
  battery: null,         // { level: 0..1, charging: bool } when supported
  active: false,
  listeners: new Set(),  // (active) => void
});

function _bsCompute() {
  if (_BS.mode === "on")  return true;
  if (_BS.mode === "off") return false;
  // auto
  let lateNight = false;
  try {
    const h = new Date().getHours();
    lateNight = h >= 2 && h < 6;
  } catch {}
  const lowBatt = _BS.battery && !_BS.battery.charging && _BS.battery.level < 0.25;
  return lateNight || !!lowBatt;
}
function _bsApply() {
  const next = _bsCompute();
  if (next === _BS.active && document.body.classList.contains("bs-on") === next) {
    return; // idempotent fast-path
  }
  _BS.active = next;
  if (typeof document !== "undefined") {
    document.body.classList.toggle("bs-on", next);
  }
  _BS.listeners.forEach(fn => { try { fn(next); } catch {} });
}
function setBatterySaverMode(mode) {
  if (!["off", "on", "auto"].includes(mode)) return;
  _BS.mode = mode;
  try { localStorage.setItem(BATTERY_SAVER_KEY, mode); } catch {}
  _bsApply();
}

// One-time init: hook the Battery Status API when available, recompute on
// the hour for the auto night-window, and inject the CSS overrides.
if (!window._bsInited) {
  window._bsInited = true;

  (async () => {
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        const sync = () => {
          _BS.battery = { level: b.level, charging: b.charging };
          _bsApply();
        };
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
        sync();
      } else {
        _bsApply();
      }
    } catch { _bsApply(); }
  })();

  // Re-evaluate the night-window every 5 min (cheap, lets auto-mode flip on
  // at 02:00 without waiting for an unrelated battery event).
  setInterval(_bsApply, 5 * 60 * 1000);

  const tag = document.createElement("style");
  tag.id = "bs-css";
  tag.textContent = `
    body.bs-on, body.bs-on * {
      animation: none !important;
      transition: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    body.bs-on .ios-frame, body.bs-on .stage {
      filter: brightness(0.72) saturate(0.85);
    }
    body.bs-on .bs-hide { display: none !important; }
  `;
  document.head.appendChild(tag);
}

function useBatterySaver() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    _BS.listeners.add(force);
    return () => _BS.listeners.delete(force);
  }, []);
  return {
    active:  _BS.active,
    mode:    _BS.mode,
    battery: _BS.battery,    // { level, charging } | null
    setMode: setBatterySaverMode,
  };
}

// One-shot toast that appears when auto-mode flips ON. Once the user has
// seen it for this session, we suppress until a fresh page load.
function BatterySaverToast() {
  const { active, mode, battery } = useBatterySaver();
  const [shown, setShown] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (active && mode === "auto" && !shown && !dismissed) {
      setShown(true);
      const t = setTimeout(() => setDismissed(true), 6000);
      return () => clearTimeout(t);
    }
  }, [active, mode, shown, dismissed]);

  if (!shown || dismissed) return null;
  const reason = (battery && !battery.charging && battery.level < 0.25)
    ? `${Math.round(battery.level * 100)}% battery — dimmed for the long stretch.`
    : "Late-night mode — dimmed and animations paused.";
  return (
    <div className="bs-hide" style={{
      position: "absolute", left: 16, right: 16, top: 60, zIndex: 80,
      padding: "10px 14px", borderRadius: 14,
      background: "var(--ink)", color: "var(--paper)",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    }}>
      <span style={{ fontSize: 16 }}>🔋</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: "var(--flare)", fontWeight: 700 }}>
          BATTERY SAVER ON
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2, color: "rgba(247,237,224,0.85)" }}>
          {reason}
        </div>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: "rgba(247,237,224,0.6)", fontSize: 18, lineHeight: 1, padding: 4,
      }}>×</button>
    </div>
  );
}

// Settings card for MeScreen — segmented control + live battery readout.
function BatterySaverCard() {
  const { active, mode, battery, setMode } = useBatterySaver();
  const segs = [
    { id: "off",  label: "OFF" },
    { id: "auto", label: "AUTO" },
    { id: "on",   label: "ON" },
  ];
  const battPct = battery ? Math.round(battery.level * 100) : null;
  const battColor = battPct == null ? "var(--muted)"
    : battPct > 50 ? "var(--success)"
    : battPct > 20 ? "var(--flare)"
    : "#f87171";

  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "var(--paper)", border: "1px solid var(--line)",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700 }}>
          BATTERY SAVER
        </div>
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: active ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
          {active ? "✓ ACTIVE" : "STANDBY"}
        </span>
      </div>
      <div className="serif" style={{ fontSize: 19, lineHeight: 1.1, marginBottom: 4 }}>
        Stretch the phone past sunrise
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
        Dims the screen, freezes animations, and slows GPS polling.
        Auto kicks in at 2 AM or when battery drops under 25%.
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4,
        background: "var(--paper-2)", borderRadius: 999, padding: 3,
        border: "1px solid var(--line)",
      }}>
        {segs.map(s => {
          const on = mode === s.id;
          return (
            <button key={s.id} onClick={() => setMode(s.id)} style={{
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink)",
              border: "none", borderRadius: 999, padding: "7px 10px",
              fontFamily: "Geist Mono, monospace", fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700,
              cursor: "pointer",
            }}>{s.label}</button>
          );
        })}
      </div>

      {battPct != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{
            position: "relative", width: 28, height: 13,
            border: "1.4px solid var(--ink)", borderRadius: 3,
          }}>
            <div style={{
              position: "absolute", top: 1, left: 1, bottom: 1,
              width: `${Math.max(0, Math.min(100, battPct)) * 0.24}px`,
              background: battColor, borderRadius: 1,
            }}/>
            <div style={{
              position: "absolute", right: -3, top: 3, bottom: 3, width: 2,
              background: "var(--ink)", borderRadius: 1,
            }}/>
          </div>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: "var(--ink)", fontWeight: 600 }}>
            {battPct}% {battery.charging ? "· CHARGING" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  Screen, ScrollBody, TopBar, TabBar, Pill, ArtistSwatch, Wordmark,
  useInstallPrompt, InstallBanner,
  useNotifications, NotificationsCard, scheduleReminders,
  FestivalChip, FestivalSwitcher,
  useBatterySaver, BatterySaverCard, BatterySaverToast, setBatterySaverMode,
});
