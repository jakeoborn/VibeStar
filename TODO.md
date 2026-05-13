# Plursky — To-Do List

## ☕ MORNING PLAYBOOK — pick up here

Everything below is paste-ready and ordered. Last verified all backend endpoints (Edge Function, privacy.html, Supabase REST) live + healthy as of midnight 2026-05-13.

### Step 1 — re-archive (~5 min)

Source change `2f94824` already pushed: iPad dropped, build bumped to 2. You just need to upload it.

```
1. Open ios/App/App.xcworkspace in Xcode (close + reopen if it was already
   open — forces pbxproj reload).
2. Top device dropdown -> "Any iOS Device (arm64)".
3. Product -> Archive (~3 min).
4. Organizer opens -> Distribute App -> App Store Connect -> Upload.
5. Wait 10-30 min for Apple processing email.
```

### Step 2 — take 5 iPhone screenshots (~3 min)

Already-booted iPhone 17 Pro Max simulator (UDID `2C7EC62E-BBED-41BB-ABD3-23388EB7F8FE`) has the latest Plursky build installed. Use Claude Desktop's computer-use to:

1. Bring Simulator to front, focus iPhone 17 Pro Max.
2. Launch Plursky if not already running.
3. Tap through welcome wizard with any name.
4. Capture these 5 tabs in order. Each shot = press `⌘S` in Simulator. Files save to `~/Desktop/Simulator Screenshot - … .png` at 1320×2868.

   1. **HOME** — masthead, countdown card. (Reference: `screenshots/REFERENCE-home-tab.png`)
   2. **LINEUP** — tap the **⊞ GRID** toggle in top-right first, then shot.
   3. **MAP** — venue map view.
   4. **MUSIC** — unconnected state showing "Match the lineup to your Spotify" is fine.
   5. **ME** — tap "Cloud account" to **expand**, so the Sign in with Apple button is visible.

5. Drag all 5 PNGs into App Store Connect → your app → iOS 6.9" Display slot.

### Step 3 — Squarespace email forward (~5 min)

```
1. https://account.squarespace.com/domains -> plursky.com
2. Email & G Suite (or Email Forwarding)
3. + Add Forwarding Address
   - from: hello       (just the prefix)
   - to:   jakeoborn@yahoo.com
4. Save. (Optional: add support -> same address as backup.)
```

Apple sends test mail to the public Support Email during review — must be live before submit.

### Step 4 — fill the App Store Connect listing

All paste-ready text in the section below (`📋 APP STORE LISTING TEXT — PASTE-READY`).

Required toggles:
- **Sign-In Required**: **No**
- **Bundle ID**: `com.plursky.app`
- **Build**: pick **Build 2** (uploaded above)
- **Primary Category**: Music
- **Secondary Category**: Entertainment
- **Age Rating**: run questionnaire — all "None" except *Alcohol, Tobacco, or Drug References = Infrequent/Mild* and *User-Generated Content = Yes*. Expected outcome: **12+**.

### Step 5 — Submit for Review

When Build 2 finishes processing (you'll get an email), select it in the Build section, then **Add for Review** → **Submit**.

Apple review takes ~24-48h. They will:
- Test Sign in with Apple (Me → Cloud account)
- Test DELETE ACCOUNT
- Browse the lineup
- Check the privacy policy URL
- Send a test email to your support address

---

## 📋 APP STORE LISTING TEXT — PASTE-READY

### Name
```
Plursky Live
```

### Subtitle (30 chars max — uses 29)
```
Festival companion - EDC 2026
```

### Promotional Text (170 chars max — uses 165; editable any time without resubmit)
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

### What's New
```
Initial release. Built for EDC Las Vegas 2026 - 250 artists, 9 stages, 3 nights. Spotify match, playlist build, stage map, crew chat, Sign in with Apple, offline-first.
```

### URLs
- **Marketing URL**: `https://plursky.com`
- **Support URL**: `https://plursky.com`
- **Privacy Policy URL**: `https://plursky.com/privacy`
- **Support Email** (public): `hello@plursky.com`

### App Review Information
- **Sign-In Required**: No
- **Demo Account**: leave blank
- **Contact Email** (internal — Apple only): `jakeoborn@yahoo.com`
- **Contact Phone**: [your number]
- **Notes for Reviewer**:
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

  The festival is upcoming so the Home tab shows a countdown view. During festival window (May 15-17, 2026) it shows real-time "Now playing" computed from the lineup data.
  ```

### App Privacy Questionnaire
| Category | Declaration |
|---|---|
| Contact Info → Email Address | Linked to user · App Functionality |
| Identifiers → User ID | Linked to user · App Functionality |
| User Content → Other User Content | Linked to user · App Functionality (saved sets + notes + crew chat) |
| Location → Precise Location | NOT linked to user · App Functionality · Not Used for Tracking |
| Diagnostics | None |
| Tracking | No |

---

## 🚀 BEFORE FIRST APP STORE UPLOAD — hard blockers

Ordered roughly in execution sequence — each step assumes the ones above it are done.

### 1. Backend / data
- [ ] **Run v107 SQL migration** — Supabase → SQL Editor → paste the block at the top of `supabase.jsx`. New in v107: the GIN index on `user_data.artist_ids` (keeps `get_artist_save_counts` fast past ~1k users). All CREATEs are `if not exists`, safe to re-run.
- [ ] **Supabase Dashboard → Auth → Providers → Apple** — toggle ON. Add `com.plursky.app` to **Authorized Client IDs** so `signInWithIdToken` accepts identity tokens from the iOS app. (No .p8 needed for the native flow; only required if you want web-OAuth refresh tokens.)
- [ ] **Deploy `delete-account` Edge Function** — required by Apple Guideline 5.1.1(v):
  ```
  brew install supabase/tap/supabase                 # if not installed
  supabase login                                     # opens browser
  supabase link --project-ref pzoijbqsbbwyuyjinjtj
  supabase functions deploy delete-account
  ```
  Do **not** run `supabase secrets set SUPABASE_*` — the `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` env vars are reserved and auto-injected into every Edge Function by the Supabase runtime. The CLI refuses them with "Env name cannot start with SUPABASE_" by design. After deploy, verify with:
  ```
  curl -i -X OPTIONS https://pzoijbqsbbwyuyjinjtj.functions.supabase.co/delete-account \
       -H "Origin: https://plursky.com"
  ```
  Expect HTTP 200 with `Access-Control-Allow-Origin: https://plursky.com`.

### 2. Third-party hardening
- [ ] **Restrict YouTube API key** — Google Cloud Console → APIs & Services → Credentials → the YouTube key in `artist.jsx:47` → Application restrictions → HTTP referrers → allow `https://plursky.com/*` and `capacitor://localhost/*`. Under API restrictions, limit to "YouTube Data API v3" only. Without this the key is freely usable by anyone who views source.

### 3. Deploy the web build
- [ ] **Publish privacy.html** — push the `privacy.html` we scaffolded to `main`; GitHub Pages will serve it at `https://plursky.com/privacy`. Verify before filling out App Store Connect, since the listing form rejects 404 URLs.

### 4. iOS build
- [ ] **Xcode → Signing & Capabilities** — open `ios/App/App.xcworkspace`. Verify:
  1. Team is set (your Apple Developer account).
  2. `Sign in with Apple` capability appears (auto-detected from `App.entitlements`).
  3. Bundle id is `com.plursky.app`.
  4. Marketing version + build number bump before each TestFlight upload.
- [ ] **Marketing icon** — confirm `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024) is opaque and on-brand. Apple rejects transparent icons.

### 5. App Store Connect
- [ ] **App Privacy questionnaire** — App Store Connect → App Privacy → declare:
  - Identifiers (User ID) — linked to user, for app functionality.
  - User content (Other) — saved sets + notes — linked to user, for app functionality.
  - Location (Precise) — not linked to user, for app functionality, not used for tracking.
  - Diagnostics — None.
- [ ] **Working support email** — `privacy.html` and the App Store listing both point at `hello@plursky.com`. Confirm a real inbox receives mail there (DNS forward, Gmail/iCloud alias, etc.) **before submitting** — Apple sends test mail to it during review, and a bounced support address is a known fast-rejection.
- [ ] **App Store Connect listing** — name, subtitle, screenshots (6.5" + 6.7" iPhone — Plursky's `_useNakedFrame()` already renders full-bleed at those widths), category (Music or Entertainment), age rating, support URL, **privacy policy URL → `https://plursky.com/privacy`**, support email → `hello@plursky.com`.
- [ ] **Archive & upload** — Xcode → Product → Archive → Distribute App → App Store Connect → TestFlight.

---

## ⚙️ STRONGLY RECOMMENDED BEFORE LAUNCH — operational hardening

Not strict blockers, but each one trades small upfront effort for meaningful risk reduction at festival scale.

- [ ] **Enable Supabase backups** — Supabase Dashboard → Database → Backups. Free tier gives daily snapshots with 7-day retention; if you can afford Pro, enable **Point-in-Time Recovery (PITR)** — a bad migration during the festival is the only thing that can permanently lose user data (saved sets + notes), and PITR is the only mitigation that recovers within minutes rather than days.
- [ ] **Set up uptime monitoring** — point UptimeRobot (free) at:
  - `https://plursky.com/` (front-end / GitHub Pages)
  - `https://pzoijbqsbbwyuyjinjtj.functions.supabase.co/delete-account` via `OPTIONS` (Edge Function health)
  - `https://pzoijbqsbbwyuyjinjtj.supabase.co/rest/v1/` (Supabase REST)

  Alert email → your phone, so you find out before the festival crowd does.
- [ ] **Add tighter rate-limit on `crew_messages` insert** — current RLS allows any anon to insert if `length(body) between 1 and 500`. Optional defence: add a per-`crew_code` insert-rate trigger in Postgres (e.g. reject if >60 inserts/minute from the same row). Skip unless someone actually abuses it; the 6-char crew code is already enough friction for the festival window.
- [ ] **Enable Supabase refresh-token rotation** — Dashboard → Auth → Sessions → toggle "Rotate refresh tokens on use." Limits the blast radius if a localStorage token leaks.

---

## 📅 TIME-SENSITIVE — start now, takes weeks

- [ ] **Spotify Quota Extension Request** — App `2219c68606c54629a8799f467a996a81` is in Development Mode (25-user allowlist). Until Quota Extension is approved → Production Mode, only allowlisted emails can create playlists. v84 modify-existing-playlist workaround is the bridge; quota extension is the real fix (unblocks `POST /users/{id}/playlists` AND `/top-tracks`). **Approval takes ~2–6 weeks. Respond to Spotify follow-up email within 7 days or they close the request.**

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

## 💡 OPTIONAL — nice to have, not blocking

- [ ] **Apple Music dev token** — `APPLE_DEV_TOKEN` in `spotify.jsx` is empty. Get a MusicKit JWT from developer.apple.com → MusicKit identifier. Valid for 6 months then must be re-signed. The Apple Music card is hidden until the token is set (v89), so leaving this empty just means Apple Music users can't match their library — Spotify users are unaffected.
- [ ] **Real friend lookup backend** — The PING (1:1 pin drop) system is demo-only (LIME/FROG/NEON/PLUM codes). Real friend lookup needs a server-side code → user mapping. The CREW presence system IS real (Supabase Realtime). Consider deprecating PING in favor of CREW.

---

## Features (post-MVP)
- [ ] Friend DMs (PING replacement) — extend the v98 `crew_messages` primitive to a 1:1 room id (`dm-${sortedPidA}-${sortedPidB}`) and swap out `_fakeReply()` in `map.jsx`. Reuses the same table, RLS, and subscribe helper.
- [ ] Smart chat / smart search bar — replace the removed BYOK Ask-Plursky with a single bar that handles natural-language lineup queries ("who's at Kinetic Friday at 11pm?", "build my Saturday") AND artist/stage search. Server-side LLM proxy (we hold the key, rate-limit per device) so it works for every user, not just key-pasters. Falls back to plain fuzzy search when offline.
- [ ] Setup banner smarter dismiss — currently gates on "no name AND no Spotify". Consider auto-dismissing once the user saves their first set (signal of engagement) so it doesn't keep nagging users who clearly figured the app out.

## Data / Content
- [ ] Update GPS anchors in `FESTIVAL_CONFIG.gpsAnchors` once Insomniac releases the official 2026 stage map (~2 weeks before festival).

## Done ✓
- [x] **v107** — iOS App Store rejection-proofing + security/perf hardening.
  - **(1) Native Sign in with Apple** via `@capacitor-community/apple-sign-in@^6` — replaces the web-OAuth redirect with Apple's native Face ID / Touch ID sheet on iOS. Web (plursky.com) still falls back to `signInWithOAuth({provider:"apple"})`. `sbSignInWithApple` branches on `Capacitor.isNativePlatform()`, generates a fresh nonce, calls `SignInWithApple.authorize`, then exchanges the identity token via `_sb.auth.signInWithIdToken({provider:"apple", token, nonce})`. First-name captured from the response on first sign-in only (Apple won't resend).
  - **(2) DELETE ACCOUNT button** in `AccountCard` (Me → Cloud account → expanded) — two-step inline confirm, hits new `delete-account` Edge Function that verifies the JWT and hard-deletes via `auth.admin.deleteUser` + drops the `user_data` row. Required by Guideline 5.1.1(v).
  - **(3) iOS entitlements & Info.plist** — `ios/App/App/App.entitlements` with `com.apple.developer.applesignin` wired into both Debug+Release `CODE_SIGN_ENTITLEMENTS`. Added `NSLocationWhenInUseUsageDescription` (map.jsx geolocation) and `ITSAppUsesNonExemptEncryption=false` (skips the TestFlight encryption prompt).
  - **(4) Privacy policy** — `privacy.html` scaffolded (deploys to `plursky.com/privacy`) tailored to what Plursky actually collects: Supabase auth + saved sets, Spotify PKCE, GPS in-browser only, crew chat, no analytics / ads / payments.
  - **(5) Security hardening** — pinned `supabase-js@2.45.4` with SRI hash in `index.html`; tightened Edge Function CORS from wildcard to a `{plursky.com, capacitor://localhost, http://localhost}` allowlist with `Vary: Origin`; documented HTTP-referrer restriction for the YouTube API key in `artist.jsx:47`.
  - **(6) Resilience** — `RootErrorBoundary` wraps `<App />` in `app.jsx:526`, persists the last crash to `localStorage.plursky_last_crash` and shows a Reload card that wipes SW caches before reloading (so a hot-fixed deploy actually takes effect).
  - **(7) DB performance** — GIN index on `user_data.artist_ids` so `get_artist_save_counts` stops seq-scanning past ~1k users.
  - **(8) Misc** — `viewport-fit=cover` for notch handling, fixed `<title>` UTF-8 mojibake.
  - **Action required**: see "BEFORE FIRST APP STORE UPLOAD" above.
- [x] **v98** — Crew chat (site-wide messaging service v1). `crew_messages` Postgres table + Realtime INSERT subscription, scoped by `crew_code`. Helpers in `supabase.jsx`: `sbCrewFetchMessages`, `sbCrewSendMessage`, `sbCrewSubscribeMessages`. `CrewChat` component renders inside expanded `CrewCard` whenever the user is joined to a crew. Trust model: the 6-char code is the secret; RLS is permissive read/insert with body-length + code-length checks.
- [x] **v97** — Removed BYOK Ask-Plursky AI chat. Almost no real users have an Anthropic API key, so the FAB + Me-tab card + chat.jsx file were dead weight.
- [x] **v96** — Lineup highlight-on-arrival.
- [x] **v95** — Sticky top strip across all screens.
- [x] **v94** — Timeline grid view on LineupScreen.
- [x] **v93** — Strip placeholder data; Hybrid-C onboarding; configurable reminder lead-time; cloud auto-push on save; battery-saver real-power gating.
- [x] **v92** — Flow cleanup: AI FAB hidden unless key stored, 5→4 tabs (Music folded into Me), onboarding modal → soft Setup banner, ArtistScreen SCHEDULE handoff, global toast on save with haptics.
- [x] **v91** — Drop iPhone frame on real phones / installed PWA.
- [x] **v90** — Memories grid → tappable Your Headliners, Discoveries reasons, Lineup filter collapse.
- [x] **v89** — Apple Music card hidden when `APPLE_DEV_TOKEN===""`. Home banner queue. Me tab CrewCard + AccountCard collapse with chevron.
- [x] **v88** — Crew deep-link auto-join; playlist build hardened with shared `fetchWithRetry`.
- [x] **v87** — `fetchPlaylistsWithRetry` for /me/playlists.
- [x] **v86** — `_findPlurskyPlaylist` discriminated return.
- [x] **v85** — Home masthead scrolls inside ScrollBody.
- [x] **v84** — Modify-existing-playlist workaround for blocked POST /users/{id}/playlists.
- [x] **v83** — Track-search playlist build; per-artist track-count voting for name-collision disambiguation.
- [x] **v81** — Pre-flight scope check, OAuth resume after reconnect, scope record from granted scopes.
- [x] **v79** — Crew-scoped presence via `?crew=CODE` deep link.
- [x] **v62** — Dynamic NOW, dynamic alerts, stage vibes, real Realtime crew presence, playlist try/catch, Apple Sign In code, shuttle times.
