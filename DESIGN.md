# Plursky — Visual Design System

A festival-companion app for EDC Las Vegas. Aesthetic: **desert-dawn editorial.**
Warm paper, ink, ember; serif display + mono caps. Reads like a printed
program zine, behaves like a phone app. **Not** dark-mode, **not** neon-rave,
**not** Material — those are explicit non-goals.

Source of truth: `index.html` `:root { … }` + `.serif` + `.mono` classes.
All tokens below come straight from there or from observed usage frequency
in `*.jsx`. When in doubt, grep the codebase — the existing patterns win.

---

## Palette

CSS variables (declared in `index.html`):

| Token | Hex / rgba | Role |
|---|---|---|
| `--ink`     | `#1a120d` | Body text, dark surfaces, primary buttons |
| `--paper`   | `#f7ede0` | Base background (everywhere) |
| `--paper-2` | `#eee0cb` | Card / inset background |
| `--dune`    | `#d9bf94` | Soft accent (rare) |
| `--ember`   | `#e85d2e` | **Primary CTA**, destructive, "alive" highlights |
| `--flare`   | `#f59a36` | Secondary warm accent (orange-yellow) |
| `--horizon` | `#7b3d9a` | Cool counterpoint to ember (purple) |
| `--night`   | `#1a1030` | Deep-night surfaces (sparingly) |
| `--dusk`    | `#2a1a3d` | Between night + horizon |
| `--sky`     | `#6f8fb8` | Cool blue accent |
| `--line`    | `rgba(26,18,13,0.12)` | Hairline borders on light surfaces |
| `--line-2`  | `rgba(26,18,13,0.22)` | Stronger borders / dividers |
| `--muted`   | `rgba(26,18,13,0.55)` | Secondary text |
| `--success` | `#2d7a55` | Confirmation, "● SYNCED" badges |

Stage-specific accents live in `data.jsx` (`STAGES[].color`). Don't invent new
top-level palette entries; pull from these.

---

## Typography

Three families, loaded from Google Fonts in `index.html`:

| Family | Use | Apply via |
|---|---|---|
| **Instrument Serif** (400, italic 400) | Display, card titles, "voice" — italic for emphasis | `className="serif"` |
| **Geist** (300–700) | Body, paragraphs, inputs | Default (`body { font-family: 'Geist' … }`) |
| **Geist Mono** (400, 500) | Labels, badges, all-caps metadata | `className="mono"` |

### Type scale (observed frequencies)

| Size | Font | Use |
|---|---|---|
| 36–42 | Serif | Page hero (`privacy.html`, error boundary) |
| 22    | Serif | Section heading ("Friends at EDC", "Crew Mode") |
| 17–18 | Serif | Card title |
| 13–15 | Geist | Body copy, inputs |
| 11–12 | Geist | Secondary body, button labels |
| 9–10  | **Mono caps** | Labels, "TAP TO CONNECT", "● 4 LIVE" — the dominant atom |
| 7.5–8.5 | Mono caps | Tiny metadata under avatars |

Mono caps always carry `letterSpacing: 1.1–1.4`. They are *written* in uppercase
in JSX (not transformed via CSS) so the source reads like the screen.

---

## Spacing

Even integers, mostly 2px increments. No formal scale token — just observed
defaults that feel right.

| Px | Use |
|---|---|
| 4   | Hairline gaps inside chips |
| 6–8 | Gap between adjacent controls |
| 10–12 | Card inner padding (compact) |
| 14–16 | Card inner padding (normal) |
| 20    | Card-to-card vertical rhythm |
| 22–28 | Section break |

Top-pad respects iOS safe area via `var(--top-pad)` → `env(safe-area-inset-top)`.
Always add `viewport-fit=cover` to consume this.

---

## Border radii (by frequency, n = grep)

| px | Count | Use |
|---|---|---|
| **999** | 100× | Pill buttons, avatars, chips |
| **10**  | 40×  | Buttons, inputs |
| **12**  | 35×  | Cards |
| **14**  | 27×  | Larger cards / containers |
| **8**   | 22×  | Small chips |
| **16**  | 12×  | Hero cards, modals |

Avoid 4–6 unless intentional (they read as "Material" / Android).

---

## Components

### Primary CTA button
```jsx
<button style={{
  background: "var(--ember)", color: "#fff",
  border: "none", borderRadius: 999, padding: "9px 14px",
  fontFamily: "Geist Mono, monospace",
  fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
}}>GO LIVE</button>
```

### Secondary / outline button
```jsx
<button style={{
  background: "transparent", border: "1px solid var(--line-2)",
  borderRadius: 10, padding: "10px 14px",
  fontFamily: "Geist Mono, monospace",
  fontSize: 10, letterSpacing: 1.2, color: "var(--muted)",
}}>SIGN OUT</button>
```

### Card
```jsx
<div style={{
  background: "var(--paper-2)",     // or var(--paper) over paper-2 contexts
  border: "1px solid var(--line)",  // omit when on paper-2
  borderRadius: 14, padding: 16,
}}>…</div>
```

### Mono label
```jsx
<div className="mono" style={{
  fontSize: 9, letterSpacing: 1.3, color: "var(--muted)",
}}>TAP TO PERSONALIZE</div>
```

### Status dot prefix
Convention: a leading `●` in mono caps signals a real-time/live state.
Color encodes the state — `var(--success)` for OK, `var(--ember)` for warning.

---

## Motion

- Transitions: `.15s` is the house default for hovers/state changes; `.2s` for
  larger layout shifts; `.3s` for cross-screen.
- Easing: browser default `ease` (no custom curves) — keeps things calm.
- Animations: subtle bobs (`isoBob`, `lineupFlash`); never bouncy.
- The frame **does not** use page transitions — tab switches are instant.

---

## iOS chrome

- On installed PWA / phone viewports (`<= 500px` or `display-mode: standalone`),
  the iPhone bezel is **dropped** (v91) via `_useNakedFrame()`. Don't design
  anything that depends on a visible frame.
- A 22px sticky `StatusStrip` (v95) sits above every tab body showing local
  day/time + offline + battery-saver badges. Stays out of modal overlays via
  inset:0 covers.

---

## Non-goals

- **No dark mode.** The "night" tokens exist for specific surfaces (e.g. the
  CrewCard dark hero); the app is fundamentally paper-and-ink.
- **No iconography library.** Inline SVG only. Stroke width 1.8, round caps.
- **No CSS-in-JS framework.** Inline `style={{ … }}` objects directly, with
  occasional `className="serif"/"mono"` shortcuts.
- **No Tailwind / utility classes.** Existing styles win over abstractions.
- **No new font families.** Three is the budget; the contrast is the design.

---

## When in doubt

Grep first:
```
grep -h "fontSize:" *.jsx | sort | uniq -c | sort -rn | head
grep -h "borderRadius:" *.jsx | sort | uniq -c | sort -rn | head
```
Match the modal frequency. If you genuinely need a new value, leave a comment
explaining why this case warrants breaking the pattern.
