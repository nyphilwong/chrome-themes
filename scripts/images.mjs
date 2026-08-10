#!/usr/bin/env node
/**
 * Generate the images shipped INSIDE a theme (not Web Store artwork — that's
 * scripts/assets.mjs).
 *
 * GitHub Dark Dimmed is near-greyscale by design, which makes a colours-only
 * theme read as flat. Two images fix that without leaving the palette:
 *
 *   theme_frame           a vertical sheen behind the tab strip
 *   theme_ntp_background  a soft glow at the top of the new tab page
 *
 * Both are drawn as narrow vertical gradient strips tiled horizontally
 * (`repeat-x`). Chrome does not scale theme images to fit the window, so a
 * fixed-width image would leave gaps on wide monitors — a tiled strip covers
 * any width at any resolution, and costs about a kilobyte.
 *
 * Usage:
 *   npm run images -- github-dark-dimmed
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, encodePNG, hex, mix, toHex } from "./lib/png.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Strips are tiled horizontally, so width only needs to be wide enough to
// avoid per-tile overhead dominating. 16px is plenty.
const STRIP_W = 16;
const FRAME_H = 128;
const NTP_H = 1100;

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npm run images -- <theme-slug>");
  process.exit(1);
}

const palPath = join(ROOT, "palettes", `${slug}.json`);
if (!existsSync(palPath)) {
  console.error(`No palette at palettes/${slug}.json`);
  process.exit(1);
}

const pal = JSON.parse(readFileSync(palPath, "utf8"));
const frame = pal.surfaces.recessed ?? pal.surfaces.inset;
const base = pal.surfaces.default;
const lift = pal.surfaces.inset;
const accent = pal.terminal.cursor ?? pal.terminal.blue;

const outDir = join(ROOT, "themes", slug, "images");
mkdirSync(outDir, { recursive: true });

// Ease-out: most of the change happens early, so the gradient resolves to the
// flat base colour well before the image ends. A linear ramp would still be
// visibly changing at the bottom edge and produce a seam where the image stops
// and the solid background colour takes over.
const easeOut = (t) => 1 - (1 - t) ** 3;

// --- theme_frame: subtle sheen behind the tab strip ----------------------
{
  const cv = new Canvas(STRIP_W, FRAME_H);
  cv.vGradient([[0, lift], [0.55, frame], [1, frame]], easeOut);
  const png = encodePNG(cv.w, cv.h, cv.px);
  writeFileSync(join(outDir, "frame.png"), png);
  console.log(`  frame.png            ${cv.w}x${cv.h}   ${(png.length / 1024).toFixed(2)} KB   ${lift} -> ${frame}`);
}

// --- theme_ntp_background: soft accent glow at the top of the new tab ----
{
  // A 6% wash of the cursor blue over the page background. Enough to register
  // as deliberate, far too little to fight the near-greyscale scheme.
  const tint = toHex(mix(hex(base), hex(accent), 0.06));
  const cv = new Canvas(STRIP_W, NTP_H);
  cv.vGradient([[0, tint], [0.45, base], [1, base]], easeOut);
  const png = encodePNG(cv.w, cv.h, cv.px);
  writeFileSync(join(outDir, "ntp-background.png"), png);
  console.log(`  ntp-background.png   ${cv.w}x${cv.h}  ${(png.length / 1024).toFixed(2)} KB   ${tint} -> ${base}`);
}

console.log(`\nWritten to ${relative(ROOT, outDir)}/`);
console.log("Reference them from the manifest's theme.images block, then run npm run check.");
