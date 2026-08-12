# chrome-themes

Chrome themes matched to terminal colour schemes, so the browser frame and the
terminal are literally the same values.

| Theme | Source palette | Status |
|---|---|---|
| `github-dark-dimmed` | Ghostty `GitHub Dark Dimmed` | In progress |

---

## Quick start

```bash
npm run check                            # validate every theme
npm run check -- github-dark-dimmed      # validate one
npm run contrast                         # WCAG contrast report
npm run sync                             # WSL: copy themes where Chrome can see them
npm run package -- github-dark-dimmed    # -> dist/<slug>-<version>.zip
```

No dependencies. Node 18+ (developed on 24).

## Install link

Please click [here](https://chromewebstore.google.com/detail/cnooomakhmnmdjjhipgdahlgcabdgjpb?utm_source=item-share-cb)

## Install locally

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → pick `themes/github-dark-dimmed/`

**Themes never appear as a card on `chrome://extensions`** — that page rejects them
by design, so there's no reload button. To apply a change, run **Load unpacked**
again; the picker remembers the folder, and re-loading the same path replaces the
theme rather than duplicating it. Your active theme is listed under
**Settings → Appearance**.

Only one theme can be active at a time; Settings → Appearance → Reset to default
restores stock Chrome.

### On WSL

The repo is on the Linux filesystem but Chrome runs on Windows, and its picker can't
browse Linux paths. Run `npm run sync` — it copies each theme to the Windows side,
mirroring the Linux layout so only the root differs:

```
/home/<you>/dev/chrome-themes/themes/<slug>     edit here
C:\Users\<you>\dev\chrome-themes\themes\<slug>  Chrome loads this
```

**It's a copy, not a symlink** — re-run it after every edit, before reloading in
Chrome. If an edit doesn't show up, an un-synced copy is the usual reason.

Override the destination with `CHROME_THEMES_WIN_DIR=/mnt/c/some/path` (used verbatim;
theme folders are created inside it). On non-WSL systems `sync` detects that and
no-ops.

## Layout

```
palettes/<slug>.json     colour source of truth (hex)
themes/<slug>/           manifest.json — the entire theme
scripts/validate.mjs     the error message Chrome refuses to give you
scripts/contrast.mjs     WCAG ratios per text-on-surface pair
scripts/package.mjs      zero-dependency ZIP writer, gated on validation
scripts/sync.mjs         WSL bridge — copies themes to the Windows filesystem
docs/SCOPE.md            complete field reference, read from Chromium source
docs/STATUS.md           decisions, observed Chrome behaviour, theme #2 recipe
.private/                local-only, gitignored — LESSONS.md + spec/plan artifacts
```

Adding a theme means one file in `palettes/` and one directory in `themes/`. Every
script discovers themes automatically and takes an optional slug to scope to one:
`npm run check -- <slug>`.

## Why a validator

Chrome validates themes in two places, and neither is helpful on its own:

- **Manifest load** rejects malformed colour values by refusing to load the entire
  extension — with an error that never says *which* field is wrong.
- **Theme pack build** drops unknown field names and out-of-range channels
  **silently**. A typo'd field is indistinguishable from one you forgot.

`npm run check` mirrors both layers from Chromium source, labels each finding `fatal`
or `silent`, and names the field. It also diffs the manifest against the role map in
`palettes/<slug>.json`, catching a valid colour in the wrong field — which neither
Chrome layer can detect.

## What a theme can and cannot style

**Can:** window frame, tab strip, toolbar, bookmarks bar, New Tab Page.

**Cannot:** web page content, DevTools, `chrome://` pages, PDF viewer, print dialogs,
extension popups, context menus.

Chrome's chrome will match your terminal. The pages inside it will not — that needs
Chrome's own dark mode plus something like Dark Reader.

## Publishing

Local unpacked installs don't sync across machines. To use a theme everywhere,
including a work profile signed into a different Google account, publish it to the
Chrome Web Store as **unlisted**:

1. Register once at the [developer dashboard](https://chrome.google.com/webstore/devconsole)
   — **$5, one time, covers every theme you ever publish**
2. `npm run package -- <slug>` and upload the zip
3. Set visibility to **Unlisted** — no public listing, installable by URL

Themes sync per Google Account. A work profile on a different account needs the
install URL once; after that it follows that account. Managed work profiles may block
extension installs by policy — if so, an admin has to allowlist the extension ID.

## Learning path

Start at `.private/LESSONS.md` — a guided walkthrough that builds a theme by hand,
one concept per lesson, with `npm run check` as the feedback loop.

It lives in `.private/` and is therefore **not committed** — it's a personal working
document, not part of the shipped repo. A fresh clone won't have it.
