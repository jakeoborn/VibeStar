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
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
        {perm === "granted"
          ? `${scheduled} reminder${scheduled === 1 ? "" : "s"} scheduled for tonight. Background pushes ship with the native app.`
          : perm === "denied"
            ? "Notifications blocked in browser settings. Re-enable there to use reminders."
            : "Get a notification 15 minutes before each saved set so you don't miss a thing."}
      </div>
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

Object.assign(window, {
  Screen, ScrollBody, TopBar, TabBar, Pill, ArtistSwatch, Wordmark,
  useInstallPrompt, InstallBanner,
  useNotifications, NotificationsCard, scheduleReminders,
});
