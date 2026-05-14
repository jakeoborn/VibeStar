#!/usr/bin/env node
// Generates a 6-month Sign in with Apple client secret JWT for Supabase.
// Paste the output into Supabase Auth → Providers → Apple → Secret Key.
// Regenerate every ~6 months (Apple's max).
//
// Usage:
//   node scripts/gen-apple-jwt.mjs                              # uses default key path
//   node scripts/gen-apple-jwt.mjs /path/to/AuthKey_XXXX.p8     # explicit path
//   node scripts/gen-apple-jwt.mjs ~/Downloads/AuthKey_*.p8 | pbcopy   # copy directly to clipboard
//
// The .p8 secret never leaves your machine — only the resulting JWT
// gets printed, which is safe to paste into Supabase's dashboard.

import fs from "node:fs";
import crypto from "node:crypto";
import { homedir } from "node:os";

// Edit these three if Apple Developer details change:
const TEAM_ID    = "X54Q9P743S";          // Plursky Apple Developer team
const KEY_ID     = "WXR4WNDFSY";          // Key ID from the .p8 filename
const SERVICES_ID = "com.plursky.app.web"; // Services ID (the "sub" claim)

// Resolve key path — CLI arg OR default to ~/Downloads/AuthKey_<KEY_ID>.p8
const argPath = process.argv[2];
const keyPath = argPath
  ? argPath.replace(/^~/, homedir())
  : `${homedir()}/Downloads/AuthKey_${KEY_ID}.p8`;

if (!fs.existsSync(keyPath)) {
  console.error(`✗ Key file not found: ${keyPath}`);
  console.error(`  Pass the path explicitly: node scripts/gen-apple-jwt.mjs /path/to/AuthKey_XXX.p8`);
  process.exit(1);
}

const pem = fs.readFileSync(keyPath, "utf8");

const now = Math.floor(Date.now() / 1000);
const sixMonthsSec = 6 * 30 * 24 * 60 * 60;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

const header  = { alg: "ES256", kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + sixMonthsSec,
  aud: "https://appleid.apple.com",
  sub: SERVICES_ID,
};

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const signature = crypto
  .sign("SHA256", Buffer.from(signingInput), { key: pem, dsaEncoding: "ieee-p1363" })
  .toString("base64url");

const jwt = `${signingInput}.${signature}`;

// Write to stdout — no newline so `| pbcopy` works cleanly.
process.stdout.write(jwt);
