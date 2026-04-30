# Plursky — To-Do List

## Needs External Setup (can't do in code alone)
- [ ] **Spotify Quota Extension Request** — App `2219c68606c54629a8799f467a996a81` is in Development Mode (25-user allowlist). Until Quota Extension is approved → Production Mode, only allowlisted emails can create playlists. Required so EDC attendees can use BUILD MY PLAYLIST. Submit at developer.spotify.com → app → "Extension Request". Approval takes ~2–6 weeks; needs use case description, screenshots/video of integration, and a public app URL (plursky.com).
- [ ] **Apple Sign In — Supabase Dashboard config** — Enable Apple provider in Supabase Dashboard → Auth → Providers. Requires Apple Developer account with Sign in with Apple capability, Apple Service ID, and private key.
- [ ] **Apple Music dev token** — `APPLE_DEV_TOKEN` in `spotify.jsx` is empty. Get a MusicKit JWT from developer.apple.com → MusicKit identifier. Valid for 6 months then must be re-signed. Card shows "add your token" notice in-app already.
- [ ] **Real friend lookup backend** — The PING (1:1 pin drop) system is demo-only (LIME/FROG/NEON/PLUM codes). Real friend lookup needs a server-side code → user mapping. The CREW presence system IS real (Supabase Realtime). Consider deprecating PING in favor of CREW.

## Features
- [ ] Real-time friend DMs — `_fakeReply()` in `map.jsx` is a bot. Replace with Supabase Realtime channel messages.
- [x] Post-festival state — after `FESTIVAL_CONFIG.endMs`, the app shows day 1 as default. Consider a "festival over" screen or recap mode.

## Data / Content
- [ ] Update GPS anchors in `FESTIVAL_CONFIG.gpsAnchors` once Insomniac releases the official 2026 stage map (~2 weeks before festival).
- [x] Verify shuttle times: unified to `05:45` in both `lastShuttleHHMM` and ESSENTIALS entry (v63).

## Done ✓
- [x] Dynamic NOW — home tab shows real clock-based "now playing" (v62)
- [x] Dynamic alerts — computed from saved sets during festival (v62)
- [x] Stage vibes in lineup tab (v62)
- [x] Crew multi-pin presence — real Supabase Realtime (v62)
- [x] Playlist bug fix — try/catch wrapping (v62)
- [x] Apple Sign In code (v62) — needs Supabase config above
