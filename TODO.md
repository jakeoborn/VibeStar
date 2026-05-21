# Plursky — To-Do List

_Last full sweep: 2026-05-20 (post-EDC). Web is at v149; App Store is
still on `1.2 (12)` — everything from v131 onward is website-only until
v1.3 is archived._

## 🚨 SHIP-BLOCKING — the App Store binary is way out of date

7+ weeks of fixes have landed on the website but iOS users on
`1.2 (12)` (still the App Store version) have none of it. Archive +
submit a v1.3 to ship:

- [ ] **`npx cap sync ios`** — copies the new dist/ + registers the
      plugins added since the last archive (`@capacitor/local-notifications`,
      `@capacitor/browser`, `@capacitor/app`) and the `plursky://` URL
      scheme into the Xcode project.
- [ ] **Bump `CURRENT_PROJECT_VERSION 12 → 13`** in
      `ios/App/App.xcodeproj/project.pbxproj` (both Debug + Release
      configurations). `MARKETING_VERSION 1.2 → 1.3` recommended given
      the scope.
- [ ] **Archive in Xcode → Distribute App → App Store Connect →
      Upload**. Then in App Store Connect: create version `1.3`, fill
      "What's New", attach build 13, **Submit for Review**.

### What ships in v1.3 (build 13)

  - **v131** — UGC report + block on CrewChat (Apple G1.2 safety)
  - **v131** — Native local notifications via `@capacitor/local-notifications`
  - **v132** — Persisted 1:1 friend DMs via `crew_messages`
  - **v133** — iOS scroll fix (`contentInset: 'always' → 'never'`),
    native Spotify OAuth via `@capacitor/browser` + `plursky://callback`
  - **v134** — SVG TopDownMap pinch-zoom + pan + zoom buttons
  - **v135** — Memories with EXIF auto-tag, batch import, video support
  - **v137** — Attendance tracking (live GPS auto-detect + manual review),
    real "SETS CAUGHT" stat
  - **v138-v141** — Lineup grid restructure: 1-page all-3-days + saved
    sets sidebar + un-save × + scroll-position restore + day-picker sync
  - **v141** — Tappable Me-tab History rows; Keep Both on conflicts;
    photos never silently skip
  - **v142** — Spotify pill goes to artist page (cached `spotifyId`)
  - **v143-v144** — Setlist proxy (Edge Function) + venue-only setlists
  - **v145-v149** — Festival Recap screen with shareable image card,
    stages visited, walking distance, B2B, attended-sets Spotify
    playlist, hero photo, discovery, crew highlights
  - **v146** — Photo set-detection bug fix (was matching by time-only,
    ignoring date — Saturday photos could land on Friday artists)

### What's-New copy for App Store Connect

```
Built for the morning after the festival.

YOUR WEEKEND, RECAPPED
A new RECAP screen that wraps the festival into a single shareable
card — sets caught, top stage, top genre, walking distance, hidden
gem, headliners caught, your weekend playlist built from what you
actually saw.

MEMORIES, AUTO-TAGGED
Drop in photos and videos from your camera roll. Each one auto-tags
to the right night and artist by EXIF time + GPS.

NATIVE FIXES
Scroll snappier on iPhone. Spotify connect now opens in an in-app
Safari sheet and lands you straight back in Plursky. Set-time
reminders fire even when the app is killed.

CREW + CHAT
Persistent 1-on-1 DMs with crew. Report / Block on any message.
Crew chat highlights in your weekend recap.

PLUS
Pinch + zoom on the festival map. Lineup grid shows all three nights
on one page with your picks pinned in a vertical sidebar.
```

---

## 🔧 MANUAL STEPS YOU MUST RUN

One-time setup steps Claude can't do via tooling.

- [ ] **Spotify Quota Extension Request** (still pending — start now
      since approval takes 2–6 weeks). App
      `2219c68606c54629a8799f467a996a81` is in Development Mode
      (25-user allowlist). Until Quota Extension is approved →
      Production Mode, only allowlisted emails can create playlists.
      v84 modify-existing-playlist workaround is the bridge. Full
      submission workflow + paste-ready form answers in the
      "Spotify Quota Extension" appendix at the bottom of this file.

### ✓ Completed manual steps

- [x] **2026-05-15** — `crew_message_reports` DDL applied
      (`v131_crew_message_reports_ugc_moderation`)
- [x] **2026-05-15** — `crew_messages` policy widened 12 → 40
      (`v132_widen_crew_messages_code_bound`)
- [x] **2026-05-15** — `plursky://callback` added to Spotify dashboard
      Redirect URIs
- [x] **2026-05-17** — `proxy-setlist` Edge Function deployed (CORS
      fix for setlist.fm)

---

## 🟠 PRODUCT GAPS — sessions, not one-liners

Ordered by impact-per-engineering-hour.

- [ ] **Manage storage UI** — Memories writes blobs to IndexedDB with
      no size visibility. A heavy weekend can stash 500MB+. Add a
      "Storage used · X MB · Clear all" row inside Memories (or Me →
      Settings) with per-night and per-moment delete. Uses the
      `navigator.storage.estimate()` web API. (in progress — see
      v150)
- [ ] **Re-enable RealMap post-festival** — both implementations are
      in the binary; `MapScreen` calls `TopDownMap` at `map.jsx:2269`.
      Swap to `<RealMap …>` (or a runtime toggle) to bring back the
      MapLibre + heatmap + Apple-Maps-style chrome. ⚠️ Do NOT purge
      `TopDownMap` — it's the live map.
- [ ] **Apple Music dev token** — code side is done (v152). All that's
      left is YOUR steps on Apple Developer:
      1. developer.apple.com → Certificates, Identifiers & Profiles →
         **Keys** → "+" → name it "Plursky MusicKit" → enable **MusicKit**
         → pick or create a MusicKit identifier (bundle-form like
         `music.com.plursky.app`).
      2. Download the `AuthKey_XXXXXXXXXX.p8` (Apple lets you download
         ONCE — save it).
      3. Edit `KEY_ID` in `scripts/gen-musickit-jwt.mjs` to the 10-char
         ID from the filename.
      4. Run `node scripts/gen-musickit-jwt.mjs | pbcopy`
      5. Paste the JWT into `APPLE_DEV_TOKEN` (top of `spotify.jsx`).
      6. The card auto-unhides; commit + push + sync iOS.
      JWTs expire every ~6 months — recurring task.
- [x] **Capacitor Share for recap card + data export** — DONE 2026-05-20
      (v152). Both `_shareRecapCard` (spotify.jsx) and `sbExportUserData`
      (supabase.jsx) now branch on `Capacitor.isNativePlatform()` and
      use `Capacitor.Plugins.Share.share({ files: [dataUrl] })` first.
      Falls back to `navigator.share` then blob-URL download. Reads the
      blob as a base64 data URL before handing to the plugin — Capacitor
      Share accepts data URLs but not raw File objects.
- [ ] **Paste the App Store ID into `APP_STORE_ID`** (`spotify.jsx`)
      once v1.3 is live. Current rating prompt's web fallback opens a
      generic App Store search; with the real ID it deep-links to the
      Plursky listing.
- [ ] **Lineup virtualization** — list view renders all 300+ artists
      at once. Fine on a fast phone, sluggish on older ones. Wrap in
      a windowing strategy (intersection-observer-based render
      windowing — no library needed).
- [ ] **Per-festival recap archive** — Recap is wired to
      `FESTIVAL_CONFIG` (the current festival). Future festivals will
      overwrite stats unless we snapshot attendance + memories +
      moments per `FESTIVAL_CONFIG.id` and let users tap back to past
      recaps. Right now the recap only ever represents "this
      festival."
- [ ] **Account data export** — Apple is starting to ask. JSON dump
      of `state.saved`, `plursky_attended_v1`, `plursky_moments_v1`
      (metadata only, not blobs), Memories photo IDs, and any cloud
      pull. Trigger from Me → Cloud account card → "Export my data".
- [ ] **Smart search bar** — natural-language lineup queries
      ("something like Lane 8 but darker"). Replaces the removed v97
      BYOK chat. Needs a server-side LLM proxy Edge Function +
      `@anthropic-ai/sdk` (or OpenAI / Cohere); ranks
      lineup artists by similarity to the user's query.
- [ ] **Friend lookup backend** — PING (LIME/FROG/NEON/PLUM codes) is
      demo-only; CREW presence is real. Either: (a) deprecate PING
      entirely so users only see crew code joins, OR (b) build a real
      pid↔code server-side mapping in Supabase (table:
      `friend_codes(code text primary key, pid text)`).

---

## 🟡 POLISH + RISK REDUCTION

- [ ] **Native push notifications** — set-time reminders fire (local
      notifications, v131), but no remote push for "your crew just
      sent a message" or "your saved set starts in 5 min — check the
      map." Lower priority post-festival; bigger value in pre-show
      hype next year.
- [ ] **Notification UX during festival** — Plursky is silent during
      sets you saved unless you've set reminders. Could nudge "Tiësto
      starts in 5 min · Kinetic Field" as a passive bottom-of-screen
      banner.
- [ ] **Onboarding flow bump** — `OnboardingModal` is pinned to
      `ONBOARD_VERSION = "v1"`. Bump if/when the welcome flow changes
      substantively; everyone re-onboards once.
- [ ] **Memory storage soft cap** — once we have storage UI, surface
      a soft warning when IndexedDB exceeds e.g. 80% of
      `storage.estimate().quota`.
- [ ] **Attendance edge cases** — GPS auto-detect only ADDS, never
      removes. If a user walks past a stage briefly, they get marked
      as attending. Need a "Mark not attended" path on the GPS toast.

---

## ⚙️ OPERATIONAL HARDENING (no code change)

Risk-reduction items that don't touch the bundle.

- [ ] **Enable Supabase backups / PITR** — Supabase Dashboard →
      Database → Backups. Free tier gives daily 7-day-retention; Pro
      adds Point-in-Time Recovery.
- [ ] **Set up uptime monitoring** — UptimeRobot (free) on
      `https://plursky.com/`, `proxy-setlist` Edge Function (OPTIONS),
      and `https://pzoijbqsbbwyuyjinjtj.supabase.co/rest/v1/`. Alert
      email → phone.
- [ ] **Enable Supabase refresh-token rotation** — Dashboard → Auth
      → Sessions → "Rotate refresh tokens on use".
- [ ] **Rotate the public setlist.fm + YouTube + Last.fm + TM API
      keys** if any have been heavily used by random visitors. Keys
      are currently HTTP-referrer-restricted in their providers'
      dashboards.

---

## 🟢 SPECULATIVE — 2027 territory

- [ ] **Multi-festival platform** — `FESTIVAL_CONFIG` registry exists
      but only EDC LV 2026 is selectable. EDC Orlando 2027 / Coachella
      / NYE could plug in once the per-festival recap-archive lands.
- [ ] **Insomniac partnership pitch** — post-EDC attendance + memory
      data is real evidence. Use the Recap screen as the demo.
- [ ] **Real-time friends-on-map** — CREW presence broadcast already
      runs; could surface live pins on the festival map.
- [ ] **AR stage finder** — point phone camera, identify stage by
      silhouette, drop a "you are here" pin.
- [ ] **Voice queries / Apple Intelligence** — "when does Tiësto
      play" via Siri shortcut.

---

## 📚 LISTING TEXT — paste-ready for App Store updates

Kept for future version submissions; the first submission used these
verbatim.

### Name
```
Plursky Live
```

### Subtitle (30 chars max)
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

WEEKEND RECAP
Spotify-Wrapped-style summary of your festival — sets caught, top stage, top genre, hidden gem, walking distance, headliners. Sharable as a single image.

OFFLINE-FIRST
The Vegas desert eats LTE. Plursky precaches the full lineup, stage map, and your saved sets on first load - works fully offline once you're inside the festival.

NO ADS, NO TRACKING, NO RESALE
Plursky is free and stays free. We do not run ads, do not sell your data, and do not store your location anywhere - your GPS is used for the in-app map only.

Privacy policy: plursky.com/privacy
```

### Keywords (100 chars max)
```
lineup,vegas,rave,edm,schedule,dj sets,playlist,set times,plur,kandi,stage map,discover
```

### App Review reviewer notes (v1.3)
```
Plursky is a free festival-companion app for EDC Las Vegas 2026 (May 15-17, 2026). No ads, no analytics, no third-party tracking. Works offline once content is precached.

NEW IN v1.3:
  - "Recap" screen on Me tab — post-festival summary, shareable.
  - "SETS YOU CAUGHT" attendance checklist under each night in
    Memories.
  - "Import from camera roll" auto-tags photos/videos to set + night
    via EXIF time + GPS. All blobs stored locally in IndexedDB; no
    upload.
  - In-chat Report message + Block sender on every CrewChat bubble.
  - 1:1 friend DMs persisted via Supabase Realtime (same trust model
    as Crew Chat: 6-char code is the secret).
  - Native Spotify OAuth via SafariViewController + plursky://callback
    URL scheme (replaces the web-redirect-out-and-back pattern).

CORE FEATURES (no account required):
  - Lineup: 250 artists, 9 stages, 3 nights
  - Map: stage map with live GPS (in-browser only, never sent to server)
  - Save sets, mark attended, build Spotify playlist of what you saw
  - Optional Spotify PKCE OAuth to match the lineup. Read-only; tokens
    stay on device.

TO TEST SIGN IN WITH APPLE (Guideline 4.8):
  1. Welcome wizard → "ME" tab → "Cloud account" → "Sign in with Apple"

TO TEST ACCOUNT DELETION (Guideline 5.1.1(v)):
  After signing in, scroll to bottom of Cloud account → "DELETE
  ACCOUNT" → two-step confirm. Calls a Supabase Edge Function that
  hard-deletes both the auth.users row and the user_data row.

UGC SAFETY (Guideline 1.2):
  CrewChat is a closed-group thread restricted to users sharing a
  6-character invite code. NO public discovery, NO direct messaging
  between strangers, NO user profiles. Every non-mine message has a
  "⋯" menu with Report and Block. Reports persist a snapshot of the
  body + sender so deletion can't destroy evidence. Plursky commits
  to 24h response to reports at hello@plursky.com.

LOCATION USAGE:
  Map tab uses CLLocationManager via WebView
  (NSLocationWhenInUseUsageDescription set). Coordinates are used
  in-browser for the map dot AND for attendance auto-detect (matches
  the user's stage anchor distance against current playing set).
  Never transmitted to any server. See privacy policy.
```

---

## 📅 APPENDIX — Spotify Quota Extension Request workflow

**Submission workflow:**
1. Sign in at https://developer.spotify.com/dashboard with the dev
   account that owns app `2219c68606c54629a8799f467a996a81`
2. Open Plursky app → click "Request Extension" / "Extend Quota"
3. Fill out the form (answers below)
4. Record a 1–2 min demo video, upload to YouTube unlisted
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
GET    /v1/me/tracks
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

**Demo video script (1–2 min):**
1. Open `plursky.com` → tap Music tab
2. Tap **Connect Spotify** → grant scopes
3. Show top-artist matches lit up in lineup
4. Save 5–10 sets in Lineup tab
5. Tap **BUILD MY PLAYLIST** → success → open in Spotify
6. Show resulting playlist with tracks
