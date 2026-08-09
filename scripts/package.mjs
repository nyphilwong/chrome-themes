#!/usr/bin/env node
/**
 * Package a theme into dist/<slug>-<version>.zip, ready for the Chrome Web Store.
 *
 * Refuses to package a theme that doesn't pass `npm run check`, because a theme
 * with silently-dropped fields will pass Web Store review and then look wrong.
 *
 * Writes the ZIP directly (deflate via node:zlib) — no dependencies, and this
 * box has no `zip` binary.
 *
 * Usage:
 *   npm run package -- github-dark-dimmed
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- CRC32 ---------------------------------------------------------------

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

// --- DOS timestamp -------------------------------------------------------

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// --- minimal ZIP writer --------------------------------------------------

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, mtime } of entries) {
    const { time, date } = dosTime(mtime);
    const compressed = deflateRawSync(data, { level: 9 });
    // Only use deflate when it actually helps.
    const useDeflate = compressed.length < data.length;
    const payload = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0, 6);       // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);      // extra length

    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);    // version made by
    central.writeUInt16LE(20, 6);    // version needed
    central.writeUInt16LE(0, 8);     // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);    // extra
    central.writeUInt16LE(0, 32);    // comment
    central.writeUInt16LE(0, 34);    // disk start
    central.writeUInt16LE(0, 36);    // internal attrs
    central.writeUInt32LE(0, 38);    // external attrs
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

// --- collect files -------------------------------------------------------

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full, base));
    } else if (e.isFile()) {
      // ZIP paths always use forward slashes.
      out.push({
        name: relative(base, full).split(sep).join("/"),
        data: readFileSync(full),
        mtime: statSync(full).mtime,
      });
    }
  }
  return out;
}

// --- run -----------------------------------------------------------------

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npm run package -- <theme-slug>");
  process.exit(1);
}

const themeDir = join(ROOT, "themes", slug);
if (!existsSync(join(themeDir, "manifest.json"))) {
  console.error(`No theme at themes/${slug}/manifest.json`);
  process.exit(1);
}

// Gate on validation. --strict also rejects silently-dropped fields and any field
// the palette role map still expects, so a half-finished theme can't ship.
try {
  execFileSync(process.execPath, [join(ROOT, "scripts", "validate.mjs"), slug, "--strict"], {
    stdio: "inherit",
  });
} catch {
  console.error("\nRefusing to package: the theme is incomplete or has errors (see above).");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(themeDir, "manifest.json"), "utf8"));

const entries = walk(themeDir);
const zip = makeZip(entries);

mkdirSync(join(ROOT, "dist"), { recursive: true });
const out = join(ROOT, "dist", `${slug}-${manifest.version}.zip`);
writeFileSync(out, zip);

const kb = (zip.length / 1024).toFixed(1);
console.log(`\nPacked ${entries.length} file(s) -> ${relative(ROOT, out)} (${kb} KB)`);
console.log("Upload at: https://chrome.google.com/webstore/devconsole");
