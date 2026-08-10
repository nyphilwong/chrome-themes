/**
 * Minimal PNG writer and raster canvas.
 *
 * Shared by scripts/assets.mjs (Web Store artwork) and scripts/images.mjs
 * (theme images shipped inside the extension). Zero dependencies — PNGs are
 * assembled by hand and compressed with node:zlib.
 */

import { deflateSync } from "node:zlib";

// --- PNG encoding --------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
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

/** @param rgba Uint8Array of w*h*4 */
export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline carries a leading filter-type byte. Filter 2 (Up) predicts
  // each pixel from the one above, which collapses vertical gradients — the
  // dominant shape in everything this module draws — to near-zero deltas.
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const off = y * (stride + 1);
    raw[off] = 2;
    for (let i = 0; i < stride; i++) raw[off + 1 + i] = (row[i] - prev[i]) & 0xff;
    prev = row;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- colour --------------------------------------------------------------

export const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

export const toHex = (rgb) =>
  "#" + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Linear interpolation between two RGB triples. `t` in [0,1]. */
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// --- canvas --------------------------------------------------------------

export class Canvas {
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
    const c = typeof colour === "string" ? hex(colour) : colour;
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.w, x + w); xx++) {
        this.set(xx, yy, c);
      }
    }
  }

  /**
   * Vertical gradient across the whole canvas.
   * `stops` is [[offset0to1, "#hex"], ...] in ascending order.
   * `ease` shapes the interpolation between stops.
   */
  vGradient(stops, ease = (t) => t) {
    const pts = stops.map(([o, c]) => [o, typeof c === "string" ? hex(c) : c]);
    for (let y = 0; y < this.h; y++) {
      const t = this.h === 1 ? 0 : y / (this.h - 1);
      let i = 0;
      while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
      const [o0, c0] = pts[i];
      const [o1, c1] = pts[i + 1] ?? pts[i];
      const span = o1 - o0;
      const local = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - o0) / span));
      const c = mix(c0, c1, ease(local));
      for (let x = 0; x < this.w; x++) this.set(x, y, c);
    }
  }

  roundRect(x, y, w, h, r, colour, corners = { tl: 1, tr: 1, br: 1, bl: 1 }) {
    const c = typeof colour === "string" ? hex(colour) : colour;
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

  /** Box-filter downsample by `f`, producing antialiased edges. */
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
