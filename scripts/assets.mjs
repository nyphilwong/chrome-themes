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
 * Zero dependencies — PNGs are written directly with node:zlib.
 *
 * Usage:
 *   npm run assets -- github-dark-dimmed
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SS = 4; // supersampling factor, for antialiased edges

// --- PNG writer ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of w*h*4 */
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter-type byte (0 = None).
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- tiny canvas ---------------------------------------------------------

const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4); // transparent
  }
  set(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = a;
  }
  rect(x, y, w, h, colour) {
    const c = hex(colour);
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.w, x + w); xx++) {
        this.set(xx, yy, c);
      }
    }
  }
  /** Rounded rectangle; `corners` selects which get rounded. */
  roundRect(x, y, w, h, r, colour, corners = { tl: 1, tr: 1, br: 1, bl: 1 }) {
    const c = hex(colour);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const left = xx < r, right = xx >= w - r;
        const top = yy < r, bottom = yy >= h - r;
        let inside = true;
        const test = (cx, cy) => (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r;
        if (left && top && corners.tl) inside = test(r - 0.5, r - 0.5);
        else if (right && top && corners.tr) inside = test(w - r - 0.5, r - 0.5);
        else if (left && bottom && corners.bl) inside = test(r - 0.5, h - r - 0.5);
        else if (right && bottom && corners.br) inside = test(w - r - 0.5, h - r - 0.5);
        if (inside) this.set(x + xx, y + yy, c);
      }
    }
  }
  /** Box-filter downsample by `f`, producing the antialiased result. */
  downsample(f) {
    const w = this.w / f, h = this.h / f;
    const out = new Canvas(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < f; dy++) {
          for (let dx = 0; dx < f; dx++) {
            const i = ((y * f + dy) * this.w + (x * f + dx)) * 4;
            const al = this.px[i + 3] / 255;
            r += this.px[i] * al; g += this.px[i + 1] * al; b += this.px[i + 2] * al;
            a += this.px[i + 3];
          }
        }
        const n = f * f;
        const aa = a / n;
        // Un-premultiply so edge pixels keep their colour rather than darkening.
        const scale = aa > 0 ? 255 / aa / n : 0;
        const i = (y * w + x) * 4;
        out.px[i] = Math.round(Math.min(255, r * scale));
        out.px[i + 1] = Math.round(Math.min(255, g * scale));
        out.px[i + 2] = Math.round(Math.min(255, b * scale));
        out.px[i + 3] = Math.round(aa);
      }
    }
    return out;
  }
}

// --- the mark ------------------------------------------------------------

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
