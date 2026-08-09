# Status

Living document. Records **decisions made** and **behaviour observed**, so theme #2
doesn't require re-deriving any of it.

Last updated: 2026-08-09

---

## Current state

| Theme | Status |
|---|---|
| `github-dark-dimmed` | **Complete** — 26/26 fields, validates clean, packaged to `dist/github-dark-dimmed-1.0.0.zip`. Awaiting visual verification in Chrome. |

The guided walkthrough in `.private/LESSONS.md` was **not used** — the theme was
filled in directly from the palette role map. It's parked and still accurate; use it
next time, when building a more customised theme is worth understanding the mechanics
for.

**Tooling:** complete and tested.

| Script | Purpose | State |
|---|---|---|
| `npm run check` | Validates against Chromium field tables; flags silently-dropped fields | Working |
| `npm run contrast` | WCAG ratios for text-on-surface pairs | Working |
| `npm run package -- <slug>` | Zips to `dist/`, gated on validation | Working |
| `npm run sync` | WSL only — copies themes to `C:\Users\<you>\dev\chrome-themes\themes\` | Working |

**Dev environment:** WSL2 (`Ubuntu-24.04`), Chrome on Windows. Chrome's "Load
unpacked" picker cannot browse the Linux filesystem, and `\\wsl.localhost\...` UNC
paths are unreliable for unpacked extensions. `npm run sync` bridges the gap —
resolves `%USERPROFILE%` via `cmd.exe`, copies, and prints the Windows path. The
Windows destination mirrors the Linux layout (`dev/chrome-themes/themes/<slug>`) so
only the root differs.

It is a **copy, not a symlink** — deliberately. A Windows symlink or junction would
have to target `\\wsl.localhost\...`, which lands back on the unreliable network path
Chrome struggles with (and junctions can't target UNC at all). The cost is that a
forgotten sync silently serves a stale theme. It
refuses to sync unparseable JSON without clobbering the last good copy, and warns
about (but never blocks on) validation errors, since loading a half-finished theme is
the whole point of the lesson flow.

**Multi-theme: already supported, verified end-to-end.** Every script discovers
`themes/*` automatically, loads the matching `palettes/<slug>.json`, and accepts an
optional slug to scope to one theme. Tested by adding a second (light) theme and
running all three scripts across both: independent status, independent palette
cross-check, per-theme packaging. The contrast math is luminance-symmetric, so light
themes work without changes.

Nothing needs building out to add theme #2 — see the recipe below.

---

## Decisions made

| Decision | Choice | Reasoning |
|---|---|---|
| Manifest authoring | **Hand-written, validated** — not generated | Learning goal. A generator would hide exactly the mechanics worth understanding. Revisit at theme #3. |
| Images | **None** — colours only | A flat colour *is* the terminal look. PNGs add HiDPI variants and build weight for no gain. |
| Distribution | **Chrome Web Store, unlisted** | Only path that syncs across machines. Unlisted = installable by URL, absent from search. |
| Colour specification | **Explicit, never derived** | Chrome derives unset fields rather than defaulting them; half-specified themes fail in hard-to-trace ways. |
| Frame surface | Primer *dark* `canvas.default` `#0d1117`, not `dark_dimmed`'s `canvas.inset` | `#1c2128` gave only a 1.08 step against the toolbar — too flat to read as a separate surface. `#0d1117` gives 1.26 and lifts all text pairs to AA. |
| Palette source | Ghostty theme file, verbatim | Guarantees terminal and browser are provably identical values. |
| Surface tones | GitHub Primer `dark_dimmed` tokens | Terminal palettes have no elevation concept; Primer is the upstream the terminal theme derives from, so not invented. |

---

## Observed Chrome behaviour

**Themes get no card on `chrome://extensions`.** Verified in Chromium source —
`chrome/browser/resources/extensions/manager.ts` hits
`assertNotReached('Don't send themes to the chrome://extensions page')` for
`ExtensionType.THEME`. Consequences: no reload button, no enable/disable toggle, no
version display. The dev loop is re-running **Load unpacked** (same path replaces,
doesn't duplicate). Installed themes are managed at **Settings → Appearance**.


Fill this in as you go — this is the highest-value section for future themes,
because it's the stuff no documentation will tell you.

| Field | Chrome version | Honoured? | Notes |
|---|---|---|---|
| `omnibox_background` | _tbd_ | _tbd_ | Known GM3 regression since Chrome 117 — expected to be inconsistent |
| `omnibox_text` | _tbd_ | _tbd_ | |
| `ntp_background` | _tbd_ | _tbd_ | May be overridden by the "Customize Chrome" side panel |
| `ntp_header` | _tbd_ | _tbd_ | |
| `button_background` `[0,0,0,0]` | _tbd_ | _tbd_ | |

> Find your version at `chrome://version`.

---

## Recipe: adding theme #2

Target: ~15 minutes.

1. **Get the source palette.** If it's a Ghostty/iTerm2 theme:
   ```
   curl -sSL "https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/master/ghostty/<Theme%20Name>"
   ```

2. **Create `palettes/<slug>.json`.** Copy `github-dark-dimmed.json` and replace the
   `terminal.*` block verbatim from the source.

3. **Pick the four surface tones.** This is the only real design work, since terminal
   palettes have no elevation:
   - `inset` — one step darker than background (frame, omnibox)
   - `default` — exactly the terminal background (toolbar)
   - `border` — visible against `default` but not text-bright
   - `incognito` — darker than `inset`

   For a light theme, invert: `inset` should be *lighter* than `default`.

4. **Copy the manifest.**
   ```
   cp -r themes/github-dark-dimmed themes/<slug>
   ```
   Update `name`, `description`, reset `version` to `1.0.0`.

5. **Remap.** The field → palette-role mapping in `.private/LESSONS.md` is theme-agnostic.
   Same roles, new hexes.

6. **Verify.**
   ```
   npm run check -- <slug>
   npm run contrast -- <slug>
   ```
   The palette cross-check catches transcription slips automatically.

7. **Load unpacked, look at it, then package.**

---

## Future scope

Not needed now; listed so it isn't re-litigated.

| Item | Trigger |
|---|---|
| Generator (`scripts/build.mjs`) from palette + role map | At theme #3, when hand-mapping stops teaching anything |
| Shared role-map file (field → palette role) | At theme #3 — currently the mapping lives only in the lessons prose |
| CI on push (`npm run check`) | Once more than one person touches this |
| Store icon + screenshots | Only if publishing publicly rather than unlisted |
| A `teach` skill generalising `LESSONS.md` | If this walkthrough format proves useful elsewhere |

---

## Known limitations (won't fix — not fixable)

A theme cannot style: web page content, DevTools, `chrome://` pages (settings,
history, downloads), the PDF viewer, print dialogs, extension popups, or OS-level
context menus.

`chrome://` pages follow Chrome's own dark-mode setting, so set that to Dark
independently. Full coverage of page *content* needs Dark Reader or a userstyle
manager — deliberately out of scope for this repo.
