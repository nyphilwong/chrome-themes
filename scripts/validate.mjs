#!/usr/bin/env node
/**
 * Validate Chrome theme manifests.
 *
 * Chrome checks themes in TWO places, and they behave completely differently:
 *
 *   1. Manifest load  (chrome/common/extensions/manifest_handlers/theme_handler.cc)
 *      Malformed colour/tint VALUES abort the whole extension:
 *        "Invalid value for theme colors - colors must be integers"
 *      It never says which field. Field NAMES are not checked at all.
 *
 *   2. Theme pack build  (chrome/browser/themes/browser_theme_pack.cc, version 106)
 *      Unknown field names, channels outside 0-255, and out-of-range alpha are
 *      dropped SILENTLY. The theme loads and just... isn't quite right.
 *
 * So this script reports two severities: `fatal` (Chrome refuses to load) and
 * `silent` (Chrome loads and quietly ignores the field). It also diffs the
 * manifest against the role map in palettes/<slug>.json, which catches the case
 * neither Chrome layer can: a perfectly valid colour in the wrong field.
 *
 * Usage:
 *   npm run check
 *   npm run check -- github-dark-dimmed
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Chromium source of truth (browser_theme_pack.cc) --------------------

const COLORS = new Set([
  "background_tab", "background_tab_inactive",
  "background_tab_incognito", "background_tab_incognito_inactive",
  "bookmark_text", "button_background",
  "frame", "frame_inactive", "frame_incognito", "frame_incognito_inactive",
  "ntp_background", "ntp_header", "ntp_link", "ntp_text",
  "omnibox_background", "omnibox_text",
  "tab_background_text", "tab_background_text_inactive",
  "tab_background_text_incognito", "tab_background_text_incognito_inactive",
  "tab_text", "toolbar", "toolbar_button_icon", "toolbar_text",
]);

const TINTS = new Set([
  "background_tab", "buttons",
  "frame", "frame_inactive", "frame_incognito", "frame_incognito_inactive",
]);

const IMAGES = new Set([
  "theme_frame", "theme_frame_inactive",
  "theme_frame_incognito", "theme_frame_incognito_inactive",
  "theme_frame_overlay", "theme_frame_overlay_inactive",
  "theme_toolbar",
  "theme_tab_background", "theme_tab_background_inactive",
  "theme_tab_background_incognito", "theme_tab_background_incognito_inactive",
  "theme_ntp_background", "theme_ntp_attribution",
  "theme_button_background", "theme_window_control_background",
]);

const PROPERTIES = new Set([
  "ntp_background_alignment", "ntp_background_repeat", "ntp_logo_alternate",
]);

const ALIGNMENTS = new Set(["top", "bottom", "left", "right", "center"]);
const REPEATS = new Set(["repeat", "repeat-x", "repeat-y", "no-repeat"]);

// --- output --------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => c("31", s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

const hexToRgb = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const rgbToHex = (rgb) =>
  "#" + rgb.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");

// --- palette + role map --------------------------------------------------

function loadPalette(slug) {
  const p = join(ROOT, "palettes", `${slug}.json`);
  if (!existsSync(p)) return null;

  let raw;
  try {
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    return { broken: `palettes/${slug}.json is not valid JSON — ${e.message}` };
  }

  const byRgb = new Map();
  const byRole = new Map();
  for (const group of ["terminal", "surfaces", "text"]) {
    for (const [name, hex] of Object.entries(raw[group] ?? {})) {
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      byRole.set(`${group}.${name}`, rgb);
      const key = rgb.join(",");
      if (!byRgb.has(key)) byRgb.set(key, `${group}.${name}`);
    }
  }

  const chrome = raw.chrome ?? {};
  return {
    byRgb,
    byRole,
    roles: chrome.colors ?? {},
    expectTints: chrome.tints ?? [],
    expectProps: chrome.properties ?? [],
  };
}

// --- value checks --------------------------------------------------------

/** Layer 1: would Chrome refuse to load the extension entirely? */
function colorFatal(v) {
  if (!Array.isArray(v)) return "must be an array — Chrome will refuse to load the theme";
  if (v.length !== 3 && v.length !== 4) {
    return `must have 3 or 4 elements, got ${v.length} — Chrome will refuse to load`;
  }
  for (let i = 0; i < 3; i++) {
    if (!Number.isInteger(v[i])) {
      return `channel ${i} must be an integer, got ${JSON.stringify(v[i])} — Chrome will refuse to load`;
    }
  }
  if (v.length === 4 && typeof v[3] !== "number") {
    return "alpha must be a number — Chrome will refuse to load";
  }
  return null;
}

/** Layer 2: would Chrome load, then quietly drop this field? */
function colorSilent(v) {
  for (let i = 0; i < 3; i++) {
    if (v[i] < 0 || v[i] > 255) {
      return `channel ${i} is ${v[i]}, outside 0-255 — Chrome drops this field silently`;
    }
  }
  if (v.length === 4) {
    const a = v[3];
    const isFlag = Number.isInteger(a) && (a === 0 || a === 1);
    const isFraction = !Number.isInteger(a) && a >= 0 && a <= 1;
    if (!isFlag && !isFraction) {
      return `alpha ${a} must be int 0|1 or a decimal 0.0-1.0 — Chrome drops this field silently`;
    }
  }
  return null;
}

function tintFatal(v) {
  if (!Array.isArray(v)) return "must be an array — Chrome will refuse to load";
  if (v.length !== 3) return `must have exactly 3 elements, got ${v.length} — Chrome will refuse to load`;
  for (const [i, x] of v.entries()) {
    if (typeof x !== "number") {
      return `element ${i} must be a number, got ${JSON.stringify(x)} — Chrome will refuse to load`;
    }
  }
  return null;
}

function tintSilent(v) {
  for (const [i, x] of v.entries()) {
    if (x !== -1 && (x < 0 || x > 1)) {
      return `element ${i} is ${x}; must be -1 (unchanged) or 0.0-1.0`;
    }
  }
  return null;
}

function propertyError(key, value) {
  if (key === "ntp_logo_alternate") return value === 0 || value === 1 ? null : "must be 0 or 1";
  if (key === "ntp_background_repeat") {
    return REPEATS.has(value) ? null : `must be one of: ${[...REPEATS].join(", ")}`;
  }
  if (key === "ntp_background_alignment") {
    if (typeof value !== "string") return "must be a string";
    const bad = value.split(/\s+/).filter(Boolean).filter((p) => !ALIGNMENTS.has(p));
    return bad.length ? `unknown alignment: ${bad.join(", ")}` : null;
  }
  return null;
}

// --- validate one theme --------------------------------------------------

function validateTheme(slug) {
  const themeDir = join(ROOT, "themes", slug);
  const manifestPath = join(themeDir, "manifest.json");
  const fatal = [], silent = [], warn = [], pending = [];

  if (!existsSync(manifestPath)) {
    return { slug, fatal: ["no manifest.json"], silent, warn, pending, done: 0, total: 0 };
  }

  let m;
  try {
    m = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return {
      slug,
      fatal: [`manifest.json is not valid JSON — ${e.message}`],
      silent, warn, pending, done: 0, total: 0,
    };
  }

  for (const key of ["manifest_version", "name", "version"]) {
    if (m[key] === undefined) fatal.push(`missing required top-level key "${key}"`);
  }
  if (m.manifest_version !== undefined && m.manifest_version !== 3) {
    warn.push(`manifest_version is ${m.manifest_version}; 3 is current`);
  }
  if (m.permissions || m.background || m.content_scripts || m.action) {
    fatal.push("a theme must not declare code or permissions — remove those keys");
  }
  if (!m.theme) {
    fatal.push('missing "theme" key — without it this is an extension, not a theme');
    return { slug, fatal, silent, warn, pending, done: 0, total: 0 };
  }

  const pal = loadPalette(slug);
  if (pal?.broken) warn.push(pal.broken);

  const colors = m.theme.colors ?? {};
  const tints = m.theme.tints ?? {};
  const props = m.theme.properties ?? {};
  const images = m.theme.images ?? {};

  let done = 0;
  const roles = pal?.roles ?? {};
  const expectTints = pal?.expectTints ?? [];
  const expectProps = pal?.expectProps ?? [];
  const total =
    Object.keys(roles).length + expectTints.length + expectProps.length ||
    Object.keys(colors).length + Object.keys(tints).length + Object.keys(props).length;

  // --- colors present in the manifest
  for (const [key, v] of Object.entries(colors)) {
    if (!COLORS.has(key)) {
      silent.push(`colors."${key}" is not a real field — Chrome ignores it silently`);
      continue;
    }
    const f = colorFatal(v);
    if (f) { fatal.push(`colors."${key}" ${f}`); continue; }
    const s = colorSilent(v);
    if (s) { silent.push(`colors."${key}" ${s}`); continue; }

    done++;

    // Role check — the thing neither Chrome layer can catch.
    const role = roles[key];
    if (!role) continue;
    if (role === "transparent") {
      if (!(v.length === 4 && v[3] === 0)) {
        warn.push(`colors."${key}" should be fully transparent — expected [0, 0, 0, 0]`);
      }
      continue;
    }
    const want = pal?.byRole.get(role);
    if (!want) continue;
    if (want.join(",") !== v.slice(0, 3).join(",")) {
      const got = rgbToHex(v);
      const actual = pal.byRgb.get(v.slice(0, 3).join(","));
      warn.push(
        `colors."${key}" is ${got}` +
        (actual ? ` (${actual})` : "") +
        ` — spec says ${role} ${rgbToHex(want)}`
      );
    }
  }

  // --- tints
  for (const [key, v] of Object.entries(tints)) {
    if (!TINTS.has(key)) {
      silent.push(`tints."${key}" is not a real field — Chrome ignores it silently`);
      continue;
    }
    const f = tintFatal(v);
    if (f) { fatal.push(`tints."${key}" ${f}`); continue; }
    const s = tintSilent(v);
    if (s) { silent.push(`tints."${key}" ${s}`); continue; }
    done++;
  }

  // --- properties
  for (const [key, v] of Object.entries(props)) {
    if (!PROPERTIES.has(key)) {
      silent.push(`properties."${key}" is not a real field — Chrome ignores it silently`);
      continue;
    }
    const e = propertyError(key, v);
    if (e) { silent.push(`properties."${key}" ${e}`); continue; }
    done++;
  }

  // --- images
  for (const [key, v] of Object.entries(images)) {
    if (!IMAGES.has(key)) {
      silent.push(`images."${key}" is not a real field — Chrome ignores it silently`);
      continue;
    }
    if (typeof v !== "string") { fatal.push(`images."${key}" must be a path string`); continue; }
    if (!existsSync(join(themeDir, v))) {
      fatal.push(`images."${key}" points at a missing file: ${v}`);
      continue;
    }
    done++;
  }

  // --- what's still missing, per the role map
  for (const key of Object.keys(roles)) if (!(key in colors)) pending.push(`colors.${key}`);
  for (const key of expectTints) if (!(key in tints)) pending.push(`tints.${key}`);
  for (const key of expectProps) if (!(key in props)) pending.push(`properties.${key}`);

  return { slug, fatal, silent, warn, pending, done, total };
}

// --- run -----------------------------------------------------------------

const args = process.argv.slice(2);
const strict = args.includes("--strict"); // also fail on silent drops + unfinished fields
const filter = args.find((a) => !a.startsWith("--"));
const themesDir = join(ROOT, "themes");
const dirs = existsSync(themesDir)
  ? readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((d) => !filter || d === filter)
  : [];

if (dirs.length === 0) {
  console.error(red(filter ? `No theme named "${filter}".` : "No themes found."));
  process.exit(1);
}

let failed = false;

for (const slug of dirs) {
  const r = validateTheme(slug);
  const clean = r.fatal.length === 0 && r.silent.length === 0;
  const complete = clean && r.total > 0 && r.pending.length === 0;

  const badge = r.fatal.length
    ? red("WILL NOT LOAD")
    : r.silent.length
      ? yellow("LOADS, FIELDS IGNORED")
      : complete
        ? green("READY")
        : yellow("IN PROGRESS");

  console.log(`\n${bold(r.slug)}  ${badge}  ${dim(`${r.done}/${r.total} fields`)}`);

  for (const e of r.fatal) console.log(`  ${red("fatal")}  ${e}`);
  for (const e of r.silent) console.log(`  ${yellow("silent")} ${e}`);
  for (const w of r.warn) console.log(`  ${yellow("spec")}   ${w}`);

  if (r.pending.length) {
    const show = r.pending.slice(0, 6).join("  ");
    const more = r.pending.length > 6 ? `  (+${r.pending.length - 6} more)` : "";
    console.log(`  ${dim("todo")}   ${show}${dim(more)}`);
  }

  if (complete) {
    console.log(`  ${green("ok")}     ready to load and package`);
  }
  if (r.fatal.length) failed = true;
  if (strict && (r.silent.length || r.pending.length)) failed = true;
}

console.log(
  `\n${dim("fatal  = Chrome refuses to load the extension at all")}\n` +
  `${dim("silent = Chrome loads it and quietly ignores that field")}\n` +
  `${dim("spec   = valid, but not the colour the palette role map calls for")}\n`
);

process.exit(failed ? 1 : 0);
