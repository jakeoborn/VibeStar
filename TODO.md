# Plursky — To-Do List

## Needs External Setup (can't do in code alone)
- [ ] **Spotify Quota Extension Request** — App `2219c68606c54629a8799f467a996a81` is in Development Mode (25-user allowlist). Until Quota Extension is approved → Production Mode, only allowlisted emails can create playlists. v84 modify-existing-playlist workaround is the bridge; quota extension is the real fix (unblocks `POST /users/{id}/playlists` AND `/top-tracks`). Approval takes ~2–6 weeks. Respond to Spotify follow-up email within 7 days or they close the request.

  **Submission workflow:**
  1. Sign in at https://developer.spotify.com/dashboard with the dev account that owns the app
  2. Open Plursky app → click "Request Extension" / "Extend Quota" (top of page or under App Settings)
  3. Fill out form — see prepared answers below
  4. Record 1–2 min demo video, upload to YouTube unlisted
  5. Take 3–5 screenshots
  6. Submit; check email for follow-up questions

  **Form answers (copy/paste):**
  - Commercial use? → **No** (free PWA, no monetization)
  - App URL → `https://plursky.com`
  - User estimates → "~5,000 in first festival year, growing"
  - App description:
    > Plursky is a free Progressive Web App for attendees of EDC Las Vegas 2026 (~150K attendees). It uses Spotify to (1) match the user's top + followed artists against the festival's 250+ artist lineup so they discover sets they'll like, (2) build a personalized Spotify playlist of their saved sets sorted FRI→SAT→SUN by stage time. No commercial use. No data resold or stored — all listening data stays in-browser via PKCE.
  - Integration description:
    > User connects Spotify via PKCE OAuth. We call /me/top/artists, /me/following, /me/tracks, /me/recently-played to derive their music taste, then match against our hand-curated EDC lineup data. Optional second flow: user taps "Build My Playlist" which calls POST /users/{id}/playlists to create a "My EDC Lineup" playlist, then /search?type=track + POST /playlists/{id}/tracks to fill it with each saved artist's top tracks. All listening insights are surfaced read-only — the playlist write is the only mutation.

  **Endpoints used:**
  ```
  GET    /v1/me
  GET    /v1/me/top/artists
  GET    /v1/me/top/tracks
  GET    /v1/me/following?type=artist
  GET    /v1/me/player/recently-played
  GET    /v1/me/tracks (saved library)
  GET    /v1/me/playlists
  GET    /v1/search?type=artist,track
  GET    /v1/artists/{id}
  POST   /v1/users/{id}/playlists          ← blocked currently, key ask
  POST   /v1/playlists/{id}/tracks
  PUT    /v1/playlists/{id}
  PUT    /v1/playlists/{id}/tracks
  DELETE /v1/playlists/{id}/tracks
  ```

  **Scopes requested:**
  ```
  user-top-read user-read-recently-played user-library-read
  user-read-private user-read-email user-follow-read
  playlist-read-private playlist-modify-public playlist-modify-private
  ```

  **Demo video script (1–2 min, QuickTime / Win+G):**
  1. Open `plursky.com` → tap Music tab
  2. Tap **Connect Spotify** → grant scopes
  3. Show top-artist matches lit up in lineup
  4. Save 5–10 sets in Lineup tab
  5. Tap **BUILD MY PLAYLIST** → success → open in Spotify
  6. Show resulting playlist with tracks

- [ ] **Apple Sign In — Supabase Dashboard config** — Enable Apple provider in Supabase Dashboard → Auth → Providers. Requires Apple Developer account with Sign in with Apple capability, Apple Service ID, and private key.
- [ ] **Apple Music dev token** — `APPLE_DEV_TOKEN` in `spotify.jsx` is empty. Get a MusicKit JWT from developer.apple.com → MusicKit identifier. Valid for 6 months then must be re-signed. Card shows "add your token" notice in-app already.
- [ ] **Real friend lookup backend** — The PING (1:1 pin drop) system is demo-only (LIME/FROG/NEON/PLUM codes). Real friend lookup needs a server-side code → user mapping. The CREW presence system IS real (Supabase Realtime). Consider deprecating PING in favor of CREW.

## Features
- [ ] Real-time friend DMs — `_fakeReply()` in `map.jsx` is a bot. Replace with Supabase Realtime channel messages.
- [ ] Lineup highlight-on-arrival — ArtistScreen "SCHEDULE" button (v92) only sets `state.lineupDay`. Add `state.lineupHighlight = artistId` and have LineupScreen scroll the matching card into view + flash it briefly, then clear the highlight.
- [ ] AskPlurskyChat key-saved toast — when a user adds an Anthropic key from the Me-tab entry (v92), show a confirmation that the FAB is now active. Today the chat just transitions silently.
- [ ] Sticky top strip on mobile — small persistent "DAY · TIME" / battery-saver / offline indicator strip across all screens. Audit item #4 from the v92 flow audit, not yet implemented.
- [ ] Setup banner smarter dismiss — currently gates on "no name AND no Spotify". Consider auto-dismissing once the user saves their first set (signal of engagement) so it doesn't keep nagging users who clearly figured the app out.
- [x] Post-festival state — after `FESTIVAL_CONFIG.endMs`, the app shows day 1 as default. Consider a "festival over" screen or recap mode.

## Data / Content
- [ ] Update GPS anchors in `FESTIVAL_CONFIG.gpsAnchors` once Insomniac releases the official 2026 stage map (~2 weeks before festival).
- [x] Verify shuttle times: unified to `05:45` in both `lastShuttleHHMM` and ESSENTIALS entry (v63).

## Done ✓
- [x] **v94** — Timeline grid view on LineupScreen. ☰ LIST / ⊞ GRID toggle (persisted in `plursky_lineup_view`). Grid: 9 stages × time (19:00→05:30) with hour rules, sticky stage header, NOW line on today's day, saved★ + Spotify♫ markers, conflict glow, tier-3 stronger fill. Filters dim non-matching blocks instead of hiding so empty space still reads as "no matching set on this stage."
- [x] **v93** — Strip placeholder data (no more Ava Torres / fake stats / fake crew / seeded saves / late-night battery flicker / pre-event LIVE+DAY badges). Hybrid-C onboarding (auto-fire welcome wizard, contextual empty states). Labeled SEARCH FAB. Configurable reminder lead-time (5/15/30/60 min) in NotificationsCard. Cloud auto-push on save when signed in (1s debounce) + one-time toast nudge after first save. Removed per-row `stage.vibeNote` clutter. Battery-saver `auto` now requires real <25% AND festival context (window OR saved set ≤24h). Marketing copy: "offline-first" → "online-first … works offline" (app.jsx welcome, manifest.json, og.svg).
- [x] **v92** — Flow cleanup: AI FAB hidden unless key stored, 5→4 tabs (Music folded into Me), onboarding modal → soft Setup banner, ArtistScreen SCHEDULE handoff, global toast on save with haptics.
- [x] **v91** — Drop iPhone frame on real phones / installed PWA. Naked full-bleed mode via `_useNakedFrame()` (max-width:500px || display-mode:standalone || navigator.standalone).
- [x] **v90** — Memories grid → tappable Your Headliners (saved tier-3 only), Discoveries reasons, Lineup filter collapse (3 rows → single ▼ FILTERS toggle with active-count badge + chips).
- [x] **v89** — Apple Music card hidden when `APPLE_DEV_TOKEN===""`. Home banner queue (one of install/notif/weather). Me tab CrewCard + AccountCard collapse with chevron.
- [x] **v88** — Crew deep-link (`?crew=CODE`) auto-join via `plursky_crew_autojoin` flag + Me-tab routing + broadcast echo on first-sight pid. Playlist build hardened with shared `fetchWithRetry` (searchOne + PUT/POST track writes); concurrency 6→4.
- [x] **v87** — `fetchPlaylistsWithRetry` for /me/playlists list + per-playlist tracks. Stops false "your playlists weren't scanned" banner during 429 throttle.
- [x] **v86** — `_findPlurskyPlaylist` discriminated return (`{playlist}` | `{error}`).
- [x] **v85** — Home masthead scrolls inside ScrollBody (was pinned).
- [x] **v84** — Modify-existing-playlist workaround for blocked POST /users/{id}/playlists. User creates "Plursky" playlist manually once; we PUT first batch, POST rest.
- [x] **v83** — Track-search playlist build (replaces blocked /top-tracks). Per-artist track-count voting for name-collision disambiguation.
- [x] **v81** — Pre-flight scope check, OAuth resume after reconnect, scope record from granted scopes.
- [x] **v79** — Crew-scoped presence via `?crew=CODE` deep link.
- [x] Dynamic NOW — home tab shows real clock-based "now playing" (v62)
- [x] Dynamic alerts — computed from saved sets during festival (v62)
- [x] Stage vibes in lineup tab (v62)
- [x] Crew multi-pin presence — real Supabase Realtime (v62)
- [x] Playlist bug fix — try/catch wrapping (v62)
- [x] Apple Sign In code (v62) — needs Supabase config above
