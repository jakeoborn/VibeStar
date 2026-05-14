#!/usr/bin/env node
// Copies the static SPA into dist/ for Capacitor to bundle into the iOS app.
import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const COPY = [
  'index.html',
  'callback.html',
  'privacy.html',
  'manifest.json',
  'sw.js',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'og.svg',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
const jsxFiles = entries.filter(e => e.isFile() && e.name.endsWith('.jsx')).map(e => e.name);

for (const file of [...COPY, ...jsxFiles]) {
  const src = path.join(root, file);
  if (!existsSync(src)) {
    console.warn(`[build] skip missing: ${file}`);
    continue;
  }
  await cp(src, path.join(dist, file));
}

console.log(`[build] dist/ ready (${COPY.length + jsxFiles.length} files)`);
