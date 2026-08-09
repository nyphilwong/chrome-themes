#!/usr/bin/env node
/**
 * Contrast report for a theme's text-on-surface pairs.
 *
 * Chrome will happily render unreadable text. This tells you before you ship.
 * Ratios are WCAG 2.1 relative luminance.
 *
 * Usage:
 *   npm run contrast
 *   npm run contrast -- github-dark-dimmed
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Which surface each text/icon colour actually sits on.
 * `on` is a fallback chain — Chrome falls back the same way.
 */
const PAIRS = [
  ["toolbar_text", ["toolbar"]],
  ["toolbar_button_icon", ["toolbar"]],
  ["bookmark_text", ["toolbar"]],
  ["tab_text", ["toolbar"]],
  ["tab_background_text", ["background_tab", "frame"]],
  ["tab_background_text_inactive", ["background_tab_inactive", "frame_inactive", "frame"]],
  ["omnibox_text", ["omnibox_background", "toolbar"]],
  ["ntp_text", ["ntp_background"]],
  ["ntp_link", ["ntp_background"]],
  ["tab_background_text_incognito", ["background_tab_incognito", "frame_incognito"]],
  ["tab_background_text_incognito_inactive", ["background_tab_incognito_inactive", "frame_incognito_inactive", "frame_incognito"]],
];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);
const red = (s) => c("31", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

function grade(r) {
  if (r >= 7) return green("AAA");
  if (r >= 4.5) return green("AA ");
  if (r >= 3) return yellow("AA-large");
  return red("FAIL");
}

function report(dir) {
  const p = join(ROOT, "themes", dir, "manifest.json");
  if (!existsSync(p)) return;

  let colors;
  try {
    colors = JSON.parse(readFileSync(p, "utf8")).theme?.colors ?? {};
  } catch {
    console.log(`\n${bold(dir)}  ${red("manifest.json is not valid JSON")}`);
    return;
  }

  const get = (k) => {
    const v = colors[k];
    return Array.isArray(v) && v.length >= 3 ? v.slice(0, 3) : null;
  };

  console.log(`\n${bold(dir)}`);

  const rows = [];
  let skipped = 0;

  for (const [fgKey, bgChain] of PAIRS) {
    const fg = get(fgKey);
    const bgKey = bgChain.find((k) => get(k));
    if (!fg || !bgKey) { skipped++; continue; }
    const bg = get(bgKey);
    rows.push([fgKey, hex(fg), bgKey, hex(bg), ratio(fg, bg)]);
  }

  if (rows.length === 0) {
    console.log(dim("  nothing to check yet — fill in some colors first"));
    return;
  }

  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w2 = Math.max(...rows.map((r) => r[2].length));

  for (const [fgKey, fgHex, bgKey, bgHex, r] of rows) {
    const flag = r < 4.5 ? "  <-- below AA" : "";
    console.log(
      `  ${fgKey.padEnd(w0)} ${dim(fgHex)}  on ${bgKey.padEnd(w2)} ${dim(bgHex)}  ` +
      `${r.toFixed(2).padStart(5)}  ${grade(r)}${dim(flag)}`
    );
  }

  // Surface elevation: how distinguishable is the tab strip from the toolbar?
  const frame = get("frame");
  const toolbar = get("toolbar");
  if (frame && toolbar) {
    const step = ratio(frame, toolbar);
    const note = step < 1.05 ? "  (very flat — surfaces may look merged)" : "";
    console.log(
      dim(`\n  surface step  frame ${hex(frame)} vs toolbar ${hex(toolbar)}  ${step.toFixed(2)}${note}`)
    );
  }

  if (skipped) console.log(dim(`\n  ${skipped} pair(s) skipped — colours not set yet`));
}

const filter = process.argv[2];
const themesDir = join(ROOT, "themes");
const dirs = existsSync(themesDir)
  ? readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((d) => !filter || d === filter)
  : [];

for (const d of dirs) report(d);

console.log(
  dim("\n  AA needs 4.5 for normal text. Deliberate de-emphasis below that is a\n") +
  dim("  choice, not a bug — just make it a choice you made on purpose.\n")
);
