# Plursky — To-Do List

## 🔧 MANUAL STEPS YOU MUST RUN

These are one-time setup steps that Claude cannot do for you. Run them before the relevant feature reaches users.

- [ ] **Run `crew_message_reports` DDL in Supabase SQL editor** (added 2026-05-15 with v131 UGC moderation). Until this runs, the Report Message button in CrewChat will fail with "relation does not exist." DDL block is at the top of `supabase.jsx` in the `/* ── SQL ── */` doc, under the `-- v131:` comment. Includes the table, an index, RLS enable, and an insert-only anon policy. Verify after running: Supabase Dashboard → Table Editor → `crew_message_reports` exists.
- [ ] **`npx cap sync ios` then archive + submit a v1.1.x update** to ship the native local-notification reminders to iOS App Store users (web users get nothing new from this — web Notification path is unchanged). Required after v131's `@capacitor/local-notifications` install lands.
- [ ] **Widen `crew_messages` insert-policy `crew_code` bound 12 → 40** (added 2026-05-15 with v132 persisted DMs). Until this runs, DM sends fail with "violates row-level security policy" because the `dm-${pidA}-${pidB}` room id is ~24 chars. SQL block is at the top of `supabase.jsx` under the "v132 ONE-TIME MIGRATION" comment — copy the `drop policy if exists … / create policy …` pair into the Supabase SQL editor.

---

## 🎉 LIVE ON THE APP STORE

**Status (2026-05-15):** Plursky Live `1.1 (11)` is **APPROVED FOR DISTRIBUTION**. App Store listing is live (or pending developer release). EDC opens today — launch + festival collide.

### What this unlocks
- iOS binary is **unfrozen** — patch updates (v1.1.1, v1.2, …) can be archived + submitted whenever.
- Website (plursky.com) continues to ship on every push to `main` as before.
- All deferred work below is now in-bounds.

### Operational status (verified live as of 2026-05-13)
- Edge Function: `https://pzoijbqsbbwyuyjinjtj.functions.supabase.co/delete-account` → HTTP 200
- Privacy policy: `https://plursky.com/privacy` → HTTP 200
- Email forward: `hello@plursky.com → jakeoborn@yahoo.com` via Squarespace/Mailgun

---

## 🚀 POST-LAUNCH QUEUE — ship as v1.1.1 / v1.2

Ordered by user-impact-per-engineering-hour. Pick from top.

- [x] **Map redesign** — DONE 2026-05-14 across commits `8f712cd`..`f109803`. RealMap (MapLibre + heatmap + Apple-Maps chrome) shipped, but **reverted to v1.0 SVG `TopDownMap` in `139b50e` (2026-05-15) for EDC night**. Both implementations are in the binary; `MapScreen` calls `TopDownMap`.
- [ ] **Re-enable RealMap post-festival** — once EDC weekend is over, swap `<TopDownMap …>` at `map.jsx:2269` back to `<RealMap …>` (or restore the toggle). RealMap function lives at `map.jsx:2780` with all the polish from the May 14 session preserved. ⚠️ **Do NOT purge `TopDownMap`** — it's the live map until this swap happens.
- [x] **UGC report + block** — DONE 2026-05-15 (v131). `⋯` button on each non-mine `CrewChat` bubble opens an inline menu (Report message / Block sender / Cancel). Report opens a reason sheet (5 chips: spam · harassment · sexual · violence · other + 500-char optional note) and inserts a row into `crew_message_reports` with a snapshot of body+sender+reporter. Block is per-device (`localStorage.plursky_blocked_pids_v1`) and filters blocked senders' messages AND polls AND votes out of render. `BlockedManager` pill above the input shows count + per-pid Unblock buttons. ⚠️ **MANUAL STEP**: run the new `crew_message_reports` DDL block in the Supabase SQL editor before the first user reports a message (see top of `supabase.jsx` — table + index + RLS insert policy). Reports are queryable from the Supabase dashboard for now; an Edge Function → email hello@plursky.com trigger is a future enhancement.
- [x] **Native local notifications** — DONE 2026-05-15 (v131). Installed `@capacitor/local-notifications@^6` (corrected from the TODO's `@capacitor/push-notifications`, which is for server-sent APNs/FCM — Plursky has no backend for that). `chrome.jsx:useNotifications` now branches on `window.Capacitor.Plugins.LocalNotifications`: native gets OS-level scheduled alerts that fire when the app is killed; web keeps the existing setTimeout + `reg.showNotification` fallback. `scheduleReminders` collapses to a single `LocalNotifications.schedule({ at: Date })` call on native (cancels prior slate first). `loadAndReschedule` is a no-op on native because the OS holds the schedule across app lifecycle. Stable int32-safe IDs derived from artist id so cancel/replace is trivial. "How to re-enable" copy + "blocked" copy branch on native (Settings → Plursky → Notifications vs Safari site permissions). ⚠️ **MANUAL STEP**: `npx cap sync ios` then archive + submit a v1.1.x update to reach App Store users. Website users are unchanged.
- [ ] **Apple Music dev token** — `APPLE_DEV_TOKEN` in `spotify.jsx:8` is empty. Get a MusicKit JWT from developer.apple.com → MusicKit identifier. Valid 6 months. Card stays hidden until set (v89 gate).
- [x] **Friend DMs (PING replacement)** — DONE 2026-05-15 (v132). `MessageDrawer` in `map.jsx` now fetches the full thread from `crew_messages` on open with `crew_code = dm-${sortedPidA}-${sortedPidB}` and subscribes to new INSERTs. Threads survive reloads + offline gaps (vs the prior fire-and-forget broadcast). Optimistic stubs + offline outbox queueing carried over from `sbCrewSendMessage`. The old broadcast helpers (`sbDMChannelKey`, broadcast `sbDMSubscribe`/`sbDMSend`) are deleted; the new persisted helpers take their names. `_fakeReply` kept as a fallback for demo friends (LIME/FROG/NEON/PLUM — no presId). ⚠️ **MANUAL STEP**: run the `drop policy / create policy` ALTER block in the SQL doc at the top of `supabase.jsx` (under "v132 ONE-TIME MIGRATION") to widen the `crew_code` length bound from 12 → 40 so DM channel keys are allowed.
- [ ] **Smart search bar** — natural-language lineup queries via a server-side LLM proxy. Replaces the removed v97 BYOK chat.
- [x] **Setup banner smarter dismiss** — DONE 2026-05-15 (v132). `HomeScreen` now auto-persists `setup_banner_dismissed = "1"` the moment `state.saved.length` becomes > 0. Saving a set is a strong signal of engagement, and the nag would just feel patronizing after that. Sticks even if the user later un-saves everything.

---

## ⚙️ STRONGLY RECOMMENDED — operational hardening (no code change)

Pre-launch ops items still pending. Not blocking the App Store submission, but each one trades a small upfront effort for meaningful risk reduction at festival scale.

- [ ] **Enable Supabase backups / PITR** — Supabase Dashboard → Database → Backups. Free tier gives daily 7-day-retention; Pro adds Point-in-Time Recovery (recovers within minutes after a bad migration). The festival is the worst time to find out your only backup is 24h old.
- [ ] **Set up uptime monitoring** — UptimeRobot (free) on:
  - `https://plursky.com/` (GitHub Pages)
  - `https://pzoijbqsbbwyuyjinjtj.functions.supabase.co/delete-account` via OPTIONS (Edge Function health)
  - `https://pzoijbqsbbwyuyjinjtj.supabase.co/rest/v1/` (Supabase REST)
  Alert email → your phone.
- [ ] **Enable Supabase refresh-token rotation** — Dashboard → Auth → Sessions → toggle "Rotate refresh tokens on use." Limits blast radius if a localStorage token leaks.
- [ ] **Tighter rate-limit on `crew_messages` insert** — only if real abuse appears. Add a per-`crew_code` insert-rate trigger in Postgres (reject if >60/min from same row). 6-char code is enough friction for the festival window.

---

## 📅 TIME-SENSITIVE — start now, takes weeks

- [ ] **Spotify Quota Extension Request** — App `2219c68606c54629a8799f467a996a81` is in Development Mode (25-user allowlist). Until Quota Extension is approved → Production Mode, only allowlisted emails can create playlists. v84 modify-existing-playlist workaround is the bridge; quota extension is the real fix (unblocks `POST /users/{id}/playlists` AND `/top-tracks`). **Approval takes ~2-6 weeks. Respond to Spotify follow-up email within 7 days or they close the request.**

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

---

## 📚 LISTING TEXT — paste-ready for future updates

Kept for the next App Store update. The first submission used these verbatim.

### Name
```
Plursky Live
```

### Subtitle (30 chars max — uses 29)
```
Festival companion - EDC 2026
```

### Promotional Text (170 chars max — editable any time without resubmit)
```
Built for EDC Las Vegas 2026 - 250 artists, 9 stages, 3 nights. Spotify match, playlist builder, stage map, crew chat. Free, no ads, works offline at the festival.
```

### Description
```
Your last festival was chaos.

Plursky fixes it. Built for EDC Las Vegas 2026, it turns 250 artists, nine stages, and three sleepless nights into a single clean plan you can hold in your hand.

MATCH THE LINEUP TO YOUR TASTE
Connect Spotify (PKCE - your token never leaves your device) and Plursky lights up every artist you already love across all three nights. Discovers deep cuts you didn't know you needed.

BUILD YOUR PERSONAL PLAYLIST
One tap turns your saved sets into a Spotify playlist sorted FRI to SAT to SUN by stage time. Walk in already knowing the songs.

STAGE MAP + LIVE FRIENDS
See your position, all nine stages, sunrise sets, last shuttle times - and your crew's pins in real time, scoped to a 6-character code only you share.

CREW CHAT
Group thread for whoever's holding the same code. Persistent (late joiners see the history), real-time, zero phone numbers required.

OFFLINE-FIRST
The Vegas desert eats LTE. Plursky precaches the full lineup, stage map, and your saved sets on first load - works fully offline once you're inside the festival.

NO ADS, NO TRACKING, NO RESALE
Plursky is free and stays free. We do not run ads, do not sell your data, and do not store your location anywhere - your GPS is used for the in-app map only.

Privacy policy: plursky.com/privacy
```

### Keywords (100 chars max — uses 87)
```
lineup,vegas,rave,edm,schedule,dj sets,playlist,set times,plur,kandi,stage map,discover
```

### App Review reviewer notes
```
Plursky is a free festival-companion app for EDC Las Vegas 2026 (May 15-17, 2026). No ads, no analytics, no third-party tracking. Works offline once content is precached.

CORE FEATURES (no account required):
  - Lineup: browse all 250 artists across 9 stages, 3 nights
  - Map: stage map with live GPS position (GPS used in-browser only, never sent to server)
  - Save sets: tap a heart to save artists for offline reference
  - Music tab: optional Spotify PKCE OAuth to match the lineup to your top artists. Read-only; tokens stay on device.

TO TEST SIGN IN WITH APPLE (Guideline 4.8):
  1. Tap through the welcome wizard.
  2. Bottom tab bar -> "ME".
  3. Tap "Cloud account" card to expand.
  4. Tap "Sign in with Apple" -> Face ID / Touch ID sheet appears.

TO TEST ACCOUNT DELETION (Guideline 5.1.1(v)):
  After signing in (above), scroll to the bottom of the Cloud account card and tap "DELETE ACCOUNT" -> two-step inline confirm -> "YES, DELETE EVERYTHING". This calls a Supabase Edge Function that hard-deletes both the auth.users row and the user_data row server-side. No retention.

LOCATION USAGE:
  Map tab uses CLLocationManager via the WebView (NSLocationWhenInUseUsageDescription set in Info.plist). Coordinates are used only to draw the user's dot on an in-app SVG map. Never transmitted to any server. See privacy policy at plursky.com/privacy.

CREW CHAT (USER-GENERATED CONTENT):
  Plursky has one chat surface — "Crew Chat" — which is a closed-group thread restricted to users who share a 6-character invite code. There is NO public discovery, NO direct messaging between strangers, and NO user profiles. Structurally this works like a passworded Group iMessage: only people who have been given the code by an existing member can see or post in that room.

  Current moderation: message bodies length-limited 1-500 chars at DB level; messages tied to sender_pid + display name; RLS ensures only crew members of the correct code can read/write the room.

  Planned for a near-term update: in-chat "Report message" + per-pid block list. Plursky commits to responding to user reports of objectionable content within 24 hours of receipt at hello@plursky.com.

The festival is upcoming so the Home tab shows a countdown view. During festival window (May 15-17, 2026) it shows real-time "Now playing" computed from the lineup data.
```

---

## Features (post-MVP — see POST-LAUNCH QUEUE above for priorities)
- [ ] Real friend lookup backend — The PING (1:1 pin drop) system is demo-only (LIME/FROG/NEON/PLUM codes). Real friend lookup needs a server-side code → user mapping. The CREW presence system IS real (Supabase Realtime). Consider deprecating PING in favor of CREW.

## Data / Content
- [ ] Update GPS anchors in `FESTIVAL_CONFIG.gpsAnchors` once Insomniac releases the official 2026 stage map (~2 weeks before festival).

## Done ✓
- [x] **2026-05-13 — Plursky Live `1.0 (3)` submitted to Apple App Review.** All pre-submission blockers resolved: SQL migration run, Supabase Apple provider configured, Edge Function deployed, YouTube key restricted, privacy.html live, iOS build signed + iPhone-only + Plursky-branded icon, screenshots uploaded (5× at both 6.5" and 6.9"), listing text + categories + age rating + App Privacy + Content Rights all filled, `hello@plursky.com` Squarespace forward live and MX-propagated to Mailgun.
- [x] **v107** — iOS App Store rejection-proofing + security/perf hardening.
  - **(1) Native Sign in with Apple** via `@capacitor-community/apple-sign-in@^6` — replaces the web-OAuth redirect with Apple's native Face ID / Touch ID sheet on iOS. Web (plursky.com) still falls back to `signInWithOAuth({provider:"apple"})`. `sbSignInWithApple` branches on `Capacitor.isNativePlatform()`, generates a fresh nonce, calls `SignInWithApple.authorize`, then exchanges the identity token via `_sb.auth.signInWithIdToken({provider:"apple", token, nonce})`. First-name captured from the response on first sign-in only (Apple won't resend).
  - **(2) DELETE ACCOUNT button** in `AccountCard` (Me → Cloud account → expanded) — two-step inline confirm, hits new `delete-account` Edge Function that verifies the JWT and hard-deletes via `auth.admin.deleteUser` + drops the `user_data` row. Required by Guideline 5.1.1(v).
  - **(3) iOS entitlements & Info.plist** — `ios/App/App/App.entitlements` with `com.apple.developer.applesignin` wired into both Debug+Release `CODE_SIGN_ENTITLEMENTS`. Added `NSLocationWhenInUseUsageDescription` (map.jsx geolocation), `ITSAppUsesNonExemptEncryption=false` (skips TestFlight encryption prompt), `UIUserInterfaceStyle=Light` (paper-and-ink design lock).
  - **(4) Privacy policy** — `privacy.html` scaffolded (deploys to `plursky.com/privacy`) tailored to what Plursky actually collects: Supabase auth + saved sets, Spotify PKCE, GPS in-browser only, crew chat, no analytics / ads / payments.
  - **(5) Security hardening** — pinned `supabase-js@2.45.4` with SRI hash in `index.html`; tightened Edge Function CORS from wildcard to a `{plursky.com, capacitor://localhost, http://localhost}` allowlist with `Vary: Origin`; documented HTTP-referrer restriction for the YouTube API key in `artist.jsx:47`.
  - **(6) Resilience** — `RootErrorBoundary` wraps `<App />` in `app.jsx:526`, persists the last crash to `localStorage.plursky_last_crash` and shows a Reload card that wipes SW caches before reloading.
  - **(7) DB performance** — GIN index on `user_data.artist_ids` so `get_artist_save_counts` stops seq-scanning past ~1k users.
  - **(8) v107.1 follow-ups** — notes textarea capped at 500 chars; `UIUserInterfaceStyle=Light` locked; support-email TODO surfaced.
  - **(9) v107.2** — install/A2HS banner suppressed in native iOS build via `Capacitor.isNativePlatform()` check (was pitching users to install the app they were already inside).
  - **(10) iPad drop + build bump** — `TARGETED_DEVICE_FAMILY = "1"`, `CURRENT_PROJECT_VERSION 1 → 2 → 3` (Build 3 carries the branded icon).
  - **(11) Branded icon** — replaced default Capacitor blue-X with the Plursky yellow P-mark (1024×1024, no alpha).
  - **(12) DESIGN.md** — visual-system reference at repo root.
  - **(13) Misc** — `viewport-fit=cover` for notch handling, fixed `<title>` UTF-8 mojibake.
- [x] **v98** — Crew chat (site-wide messaging service v1). `crew_messages` Postgres table + Realtime INSERT subscription, scoped by `crew_code`. Helpers in `supabase.jsx`: `sbCrewFetchMessages`, `sbCrewSendMessage`, `sbCrewSubscribeMessages`. `CrewChat` component renders inside expanded `CrewCard` whenever the user is joined to a crew.
- [x] **v97** — Removed BYOK Ask-Plursky AI chat.
- [x] **v96** — Lineup highlight-on-arrival.
- [x] **v95** — Sticky top strip across all screens.
- [x] **v94** — Timeline grid view on LineupScreen.
- [x] **v93** — Strip placeholder data; Hybrid-C onboarding; configurable reminder lead-time; cloud auto-push on save; battery-saver real-power gating.
- [x] **v92** — Flow cleanup: AI FAB hidden unless key stored, 5→4 tabs, onboarding modal → soft Setup banner, ArtistScreen SCHEDULE handoff, global toast on save.
- [x] **v91** — Drop iPhone frame on real phones / installed PWA.
- [x] **v90** — Memories grid → tappable Your Headliners, Discoveries reasons, Lineup filter collapse.
- [x] **v89** — Apple Music card hidden when token empty. Home banner queue. Me tab CrewCard + AccountCard collapse.
- [x] **v88** — Crew deep-link auto-join; playlist build hardened with shared `fetchWithRetry`.
- [x] **v87** — `fetchPlaylistsWithRetry` for /me/playlists.
- [x] **v86** — `_findPlurskyPlaylist` discriminated return.
- [x] **v85** — Home masthead scrolls inside ScrollBody.
- [x] **v84** — Modify-existing-playlist workaround for blocked POST /users/{id}/playlists.
- [x] **v83** — Track-search playlist build; per-artist track-count voting for name-collision disambiguation.
- [x] **v81** — Pre-flight scope check, OAuth resume after reconnect, scope record from granted scopes.
- [x] **v79** — Crew-scoped presence via `?crew=CODE` deep link.
- [x] **v62** — Dynamic NOW, dynamic alerts, stage vibes, real Realtime crew presence, playlist try/catch, Apple Sign In code, shuttle times.
