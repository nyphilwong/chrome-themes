#!/usr/bin/env node
/**
 * Generate Chrome Web Store listing artwork from a theme's palette.
 *
 * The store requires a 128x128 icon and a 440x280 small promo tile. Both are
 * drawn here from the palette itself, so the artwork is literally the theme's
 * colours — a stylised browser window showing the frame/toolbar/omnibox
 * relationship the theme is actually about.
 *
 * Screenshots are NOT generated: a store screenshot should show the real
 * product. Take one of your actual browser (see docs/PUBLISHING.md).
 *
 * Usage:
 *   npm run assets -- github-dark-dimmed
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, encodePNG } from "./lib/png.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SS = 4; // supersampling factor, for antialiased edges

/**
 * A stylised browser window: recessed tab strip with one active tab lifting
 * into the toolbar, an inset omnibox, and the page area below. It shows the
 * exact surface relationship the theme defines.
 */
function drawBrowser(cv, x, y, w, h, p, radius) {
  const frame = p.recessed, toolbar = p.toolbar, page = p.page;
  const R = (n) => Math.round(n);

  // Whole window sits on the frame (darkest) surface.
  cv.roundRect(x, y, w, h, radius, frame);

  const topGap = R(h * 0.09);
  const tabH   = R(h * 0.17);
  const barH   = R(h * 0.23);
  const inset  = R(w * 0.08);
  const tabW   = R(w * 0.34);
  const tabR   = R(radius * 0.6);

  // Active tab: rounded on top only, so it merges into the toolbar band and
  // reads as one lifted surface — which is exactly how Chrome renders it.
  cv.roundRect(x + inset, y + topGap, tabW, tabH + tabR, tabR, toolbar,
    { tl: 1, tr: 1, br: 0, bl: 0 });

  // A second, inactive tab. Without it the tab strip has nothing to contrast
  // against and the mark collapses into a single blob at 128px.
  cv.roundRect(x + inset + tabW + R(w * 0.035), y + topGap + R(tabH * 0.22),
    R(tabW * 0.72), tabH, tabR, p.tabIdle, { tl: 1, tr: 1, br: 0, bl: 0 });

  // Toolbar band.
  const barY = y + topGap + tabH;
  cv.rect(x, barY, w, barH, toolbar);

  // Omnibox pill, recessed back to the frame colour.
  const oh = R(barH * 0.40);
  const oy = barY + R((barH - oh) / 2);
  cv.roundRect(x + inset, oy, w - inset * 2, oh, R(oh / 2), frame);

  // Accent dot at the left of the omnibox — the theme's cursor colour.
  const dot = R(oh * 0.52);
  cv.roundRect(x + inset + R(oh * 0.34), oy + R((oh - dot) / 2), dot, dot, R(dot / 2), p.accent);

  // Page area below the toolbar, the lightest of the three surfaces so the
  // stack reads clearly at small sizes.
  const py = barY + barH;
  cv.roundRect(x, py, w, y + h - py, radius, page, { tl: 0, tr: 0, br: 1, bl: 1 });
}

// --- run -----------------------------------------------------------------

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npm run assets -- <theme-slug>");
  process.exit(1);
}

const palPath = join(ROOT, "palettes", `${slug}.json`);
if (!existsSync(palPath)) {
  console.error(`No palette at palettes/${slug}.json`);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(palPath, "utf8"));

// Icon artwork favours legibility over literal accuracy: the "page" area uses
// the lightest surface token so the three stacked surfaces stay distinct at
// 128px. Every colour is still drawn from the theme's own palette.
const p = {
  recessed: raw.surfaces.recessed ?? raw.surfaces.inset,
  toolbar: raw.surfaces.default,
  page: raw.surfaces.overlay ?? raw.surfaces.inset,
  tabIdle: raw.surfaces.inset,
  accent: raw.terminal.cursor ?? raw.terminal.blue,
  border: raw.surfaces.border,
};

const outDir = join(ROOT, "dist", "store", slug);
mkdirSync(outDir, { recursive: true });

// --- 128x128 store icon: 96x96 of artwork with 16px transparent padding.
{
  const cv = new Canvas(128 * SS, 128 * SS);
  drawBrowser(cv, 16 * SS, 16 * SS, 96 * SS, 96 * SS, p, 18 * SS);
  const png = encodePNG(128, 128, cv.downsample(SS).px);
  writeFileSync(join(outDir, "store-icon-128.png"), png);
  console.log(`  store-icon-128.png        128x128   ${(png.length / 1024).toFixed(1)} KB`);
}

// --- 440x280 small promo tile.
{
  const cv = new Canvas(440 * SS, 280 * SS);
  // Background must differ from the window's page surface, or the bottom of
  // the window dissolves into it.
  cv.rect(0, 0, 440 * SS, 280 * SS, p.tabIdle);
  drawBrowser(cv, 76 * SS, 44 * SS, 288 * SS, 192 * SS, p, 14 * SS);
  const png = encodePNG(440, 280, cv.downsample(SS).px);
  writeFileSync(join(outDir, "promo-tile-440x280.png"), png);
  console.log(`  promo-tile-440x280.png    440x280   ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\nWritten to ${relative(ROOT, outDir)}/`);
console.log("Still needed: at least one 1280x800 screenshot of the real browser.");
console.log("See docs/PUBLISHING.md.");
