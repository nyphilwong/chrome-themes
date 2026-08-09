#!/usr/bin/env node
/**
 * Copy a theme onto the Windows filesystem so Chrome can load it.
 *
 * Why this exists: on WSL the repo lives on the Linux filesystem, but Chrome runs
 * on Windows. Its "Load unpacked" picker starts on the Windows side and won't
 * browse Linux paths. You *can* paste a \\wsl.localhost\... UNC path, but Chrome
 * treats it as a network location and unpacked extensions from there are flaky.
 *
 * Copying to C:\Users\<you>\dev\chrome-themes\themes\<slug> avoids the whole problem,
 * and mirrors the Linux layout so only the root differs.
 *
 * This is a copy, not a symlink — a Windows symlink would have to target
 * \\wsl.localhost\..., which is the same unreliable network path (and junctions
 * can't target UNC at all). Re-run after every edit.
 *
 * Usage:
 *   npm run sync                        # all themes
 *   npm run sync -- github-dark-dimmed  # one
 *
 * Override the destination with CHROME_THEMES_WIN_DIR (a Linux-side path, e.g.
 * /mnt/c/Users/me/somewhere).
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);
const red = (s) => c("31", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

function isWSL() {
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

/** Ask Windows where the user profile is, then translate to a /mnt path. */
function windowsProfileDir() {
  let winPath;
  try {
    winPath = execFileSync("cmd.exe", ["/c", "echo %USERPROFILE%"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
  if (!/^[A-Za-z]:\\/.test(winPath)) return null;
  try {
    return execFileSync("wslpath", ["-u", winPath], { encoding: "utf8" }).trim();
  } catch {
    // Fallback: C:\Users\x -> /mnt/c/Users/x
    const drive = winPath[0].toLowerCase();
    return `/mnt/${drive}/` + winPath.slice(3).split("\\").join("/");
  }
}

function toWindowsPath(linuxPath) {
  try {
    return execFileSync("wslpath", ["-w", linuxPath], { encoding: "utf8" }).trim();
  } catch {
    return linuxPath;
  }
}

// --- run -----------------------------------------------------------------

if (!isWSL()) {
  console.log(
    "Not running under WSL — no sync needed.\n" +
    "Load the theme directly from themes/<slug>/."
  );
  process.exit(0);
}

// An explicit override is used verbatim — you asked for that exact directory.
// Otherwise mirror the Linux layout, so the only difference is the root:
//   /home/pwong/dev/chrome-themes/themes/<slug>
//   C:\Users\pwong\dev\chrome-themes\themes\<slug>
let destRoot = process.env.CHROME_THEMES_WIN_DIR;

if (!destRoot) {
  const profile = windowsProfileDir();
  if (!profile || !existsSync(profile)) {
    console.error(red("Could not locate your Windows user profile."));
    console.error("Set the destination manually, e.g.:");
    console.error(dim("  CHROME_THEMES_WIN_DIR=/mnt/c/Users/you/dev/chrome-themes/themes npm run sync"));
    process.exit(1);
  }
  destRoot = join(profile, "dev", "chrome-themes", "themes");
}
const filter = process.argv[2];
const themesDir = join(ROOT, "themes");

const dirs = readdirSync(themesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((d) => !filter || d === filter);

if (dirs.length === 0) {
  console.error(red(filter ? `No theme named "${filter}".` : "No themes found."));
  process.exit(1);
}

mkdirSync(destRoot, { recursive: true });

for (const slug of dirs) {
  const src = join(themesDir, slug);
  const dest = join(destRoot, slug);

  // Sanity: never copy something that isn't parseable JSON — Chrome would just
  // refuse to load and the error would look like a sync problem.
  try {
    JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
  } catch (e) {
    console.error(`${red("error")}  ${slug}: manifest.json is not valid JSON — ${e.message}`);
    console.error(dim("       not synced; fix it and re-run"));
    process.exitCode = 1;
    continue;
  }

  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });

  console.log(`${green("synced")} ${bold(slug)}`);
  console.log(`       ${toWindowsPath(dest)}`);
}

// Surface silently-dropped fields, but never block: loading a half-finished
// theme is the whole point of the lesson flow.
try {
  execFileSync(process.execPath, [join(ROOT, "scripts", "validate.mjs"), ...(filter ? [filter] : [])], {
    stdio: ["ignore", "ignore", "ignore"],
  });
} catch {
  console.log(
    `\n${yellow("note")}   validation reported errors — Chrome will silently ignore` +
    `\n       those fields. Run ${bold("npm run check")} for details.`
  );
}

console.log(
  `\n${dim("In Chrome: chrome://extensions -> Load unpacked -> paste the path above.")}\n` +
  `${dim("Themes never get a card on that page, so there is no reload button —")}\n` +
  `${dim("re-run Load unpacked to apply changes. The picker remembers the folder,")}\n` +
  `${dim("so it is usually just: Load unpacked -> Enter.")}`
);
