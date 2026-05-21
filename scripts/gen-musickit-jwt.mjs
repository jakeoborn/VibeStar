#!/usr/bin/env node
// Generates a 6-month MusicKit developer token (JWT) so the Apple Music card
// in Plursky can light up. This token is the `APPLE_DEV_TOKEN` constant at
// the top of `spotify.jsx`.
//
// One-time setup on Apple Developer:
//   1. developer.apple.com → Certificates, Identifiers & Profiles → Keys
//   2. Click "+", give it a name (e.g. "Plursky MusicKit"), enable MusicKit
//   3. Pick the MusicKit identifier (create one if needed; bundle-form like
//      `music.com.plursky.app`)
//   4. Download the resulting AuthKey_XXXXXXXXXX.p8 — Apple only lets you
//      download once, so save it somewhere safe
//   5. Note the Key ID (the 10-char string in the filename)
//
// Then edit the THREE constants below (TEAM_ID, KEY_ID, ORIGIN if set)
// and run:
//
//   node scripts/gen-musickit-jwt.mjs                                # default ~/Downloads/AuthKey_<KEY_ID>.p8
//   node scripts/gen-musickit-jwt.mjs /path/to/AuthKey_XXXX.p8       # explicit path
//   node scripts/gen-musickit-jwt.mjs ... | pbcopy                   # straight to clipboard
//
// Paste the output into `APPLE_DEV_TOKEN` in spotify.jsx. The card will
// auto-show once the constant is non-empty. Regenerate every ~6 months
// (Apple's hard cap is 6 months — they reject `exp` farther out).
//
// The .p8 never leaves your machine — only the resulting JWT is printed,
// which is safe to ship in the public bundle (MusicKit dev tokens are
// designed to be client-side, and the `origin` claim restricts which
// websites can use it).

import fs from "node:fs";
import crypto from "node:crypto";
import { homedir } from "node:os";

// ── EDIT THESE ────────────────────────────────────────────────
const TEAM_ID  = "X54Q9P743S";   // Plursky Apple Developer team (matches gen-apple-jwt.mjs)
const KEY_ID   = "REPLACE_ME";   // 10-char Key ID from the .p8 filename
// Optional: restrict the token to specific origins. Leave empty array for
// no restriction (token works from any origin including capacitor://localhost
// inside the iOS WebView). Add "https://plursky.com" once you want to lock
// the public bundle's token to the website + native app only.
const ORIGINS  = [];
// ──────────────────────────────────────────────────────────────

if (KEY_ID === "REPLACE_ME") {
  console.error("✗ Edit KEY_ID in this script first (the 10-char ID from your AuthKey_XXXX.p8 filename).");
  process.exit(1);
}

const argPath = process.argv[2];
const keyPath = argPath
  ? argPath.replace(/^~/, homedir())
  : `${homedir()}/Downloads/AuthKey_${KEY_ID}.p8`;

if (!fs.existsSync(keyPath)) {
  console.error(`✗ Key file not found: ${keyPath}`);
  console.error("  Pass the path explicitly: node scripts/gen-musickit-jwt.mjs /path/to/AuthKey_XXX.p8");
  process.exit(1);
}

const pem = fs.readFileSync(keyPath, "utf8");

const now = Math.floor(Date.now() / 1000);
const sixMonthsSec = 15777000; // Apple's documented hard cap = ~6 months

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

const header  = { alg: "ES256", kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + sixMonthsSec,
  ...(ORIGINS.length ? { origin: ORIGINS } : {}),
};

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const signature = crypto
  .sign("SHA256", Buffer.from(signingInput), { key: pem, dsaEncoding: "ieee-p1363" })
  .toString("base64url");

const jwt = `${signingInput}.${signature}`;
process.stdout.write(jwt);
