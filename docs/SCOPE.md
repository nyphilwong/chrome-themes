# Scope: `chrome-themes`

A repo housing multiple Chrome themes. First theme: **GitHub Dark Dimmed**, matched to the
Ghostty terminal theme of the same name.

---

## 1. Bottom line

A Chrome theme is **a single `manifest.json` file**. No HTML, no JS, no build step, no
permissions. Zip it, or load the folder unpacked. The first theme is genuinely ~30 minutes
of work; everything else in this doc is the scaffolding that makes theme #2 through #N cheap.

The real constraint is not difficulty — it is **surface area**. See §3.

---

## 2. What a Chrome theme actually is

```json
{
  "manifest_version": 3,
  "name": "GitHub Dark Dimmed",
  "version": "1.0.0",
  "theme": {
    "colors":     { "...": [34, 39, 46] },
    "tints":      { "...": [-1.0, -1.0, -1.0] },
    "images":     { "...": "images/frame.png" },
    "properties": { "...": "no-repeat" }
  }
}
```

- **Colors are RGB integer arrays, not hex.** `[34, 39, 46]`, each channel `0–255`.
- **RGBA is supported**: a 4th element, either int `0`/`1` or a float `0.0–1.0`.
- Tints are HSL floats `0–1.0`, with `-1.0` meaning "leave unchanged".
- Themes are extensions but carry no permissions and no code. Only one can be active at a time.
- Omitting a field is fine — Chrome falls back to its default. There is **no valid
  placeholder value**; a field is either complete or absent.

### Two validation layers, two very different failure modes

This is the single most important thing to know, and it isn't documented anywhere:

| Layer | Source | Checks | On failure |
|---|---|---|---|
| **Manifest load** | `manifest_handlers/theme_handler.cc` | colour/tint **values** are correctly-shaped lists of ints | **Whole extension refuses to load**: `Invalid value for theme colors - colors must be integers` |
| **Theme pack build** | `themes/browser_theme_pack.cc` | field **names**, channel range `0–255`, alpha range | Field **silently dropped**; theme loads looking subtly wrong |

Consequences worth internalising:

- A `"TODO"` string, a 2-element array, or a float channel is **fatal** — nothing loads.
- A typo'd field name (`tolbar_text`) or an out-of-range channel (`[300, 0, 0]`) is
  **silent** — no error anywhere, it just doesn't apply.
- The fatal error never names the offending field. With 24 possible colours, that's
  the main argument for a validator (§6).

### Authoritative field lists

The public docs punt to the Chromium source, so these are read straight from
`chrome/browser/themes/browser_theme_pack.cc` (pack version 106):

**`colors`** — 24 fields:

| Group | Fields |
|---|---|
| Frame | `frame`, `frame_inactive`, `frame_incognito`, `frame_incognito_inactive` |
| Toolbar | `toolbar`, `toolbar_text`, `toolbar_button_icon`, `button_background` |
| Tabs (text) | `tab_text`, `tab_background_text`, `tab_background_text_inactive`, `tab_background_text_incognito`, `tab_background_text_incognito_inactive` |
| Tabs (fill) | `background_tab`, `background_tab_inactive`, `background_tab_incognito`, `background_tab_incognito_inactive` |
| Omnibox | `omnibox_background`, `omnibox_text` |
| Bookmarks | `bookmark_text` |
| New Tab Page | `ntp_background`, `ntp_text`, `ntp_link`, `ntp_header` |

> `ntp_section` also parses but is legacy — it now just back-fills `ntp_header`. Don't use it.

**`tints`** — `frame`, `frame_inactive`, `frame_incognito`, `frame_incognito_inactive`,
`background_tab`, `buttons`

**`images`** — `theme_frame`, `theme_frame_inactive`, `theme_frame_incognito`,
`theme_frame_incognito_inactive`, `theme_frame_overlay`, `theme_frame_overlay_inactive`,
`theme_toolbar`, `theme_tab_background`, `theme_tab_background_inactive`,
`theme_tab_background_incognito`, `theme_tab_background_incognito_inactive`,
`theme_ntp_background`, `theme_ntp_attribution`, `theme_button_background`,
`theme_window_control_background`

**`properties`** — `ntp_background_alignment`, `ntp_background_repeat`, `ntp_logo_alternate`

### Derivation behaviour worth knowing

Chrome fills gaps rather than leaving them default, which changes what you need to specify:

- Set `toolbar` but not `toolbar_text`, and Chrome computes the text colour via
  `BlendForMinContrast` against your toolbar. Usually fine, but it means an unset field is
  *derived*, not *default* — so a half-specified theme can look subtly off in ways that are
  hard to trace.
- `toolbar_button_icon` auto-propagates to hover, pressed, and both throbber states.
- Frame images cascade: inactive → active, incognito-inactive → incognito, everything →
  `theme_frame`.

**Design consequence:** specify colours explicitly rather than relying on derivation. It is
more verbose but it is the difference between a theme you can reason about and one you tweak
by trial and error.

---

## 3. What a theme *cannot* touch

This is the part worth internalising before starting, because it caps the payoff:

| Surface | Themeable? |
|---|---|
| Tab strip, frame, toolbar, bookmarks bar | ✅ Yes |
| New Tab Page | ✅ Mostly (see caveat below) |
| Omnibox / address bar | ⚠️ Unreliable (see below) |
| Web page content | ❌ Never — that's the site's CSS |
| DevTools | ❌ Separate setting in DevTools itself |
| `chrome://` pages (settings, history, downloads) | ❌ Follows Chrome's own dark-mode setting |
| PDF viewer, print dialog, extension popups | ❌ |
| Right-click / context menus | ❌ OS-level widgets |

So: **Chrome's chrome will match Ghostty. The pages inside it will not.** For full coverage
you'd pair this with Chrome's own dark mode plus a per-site solution (Dark Reader or a
userstyle manager) — out of scope here, but worth naming so expectations are set.

### Two live caveats

1. **Omnibox.** Since the Material 3 / "GM3" redesign (Chrome 117+), `omnibox_background` and
   `omnibox_text` are inconsistently honoured — Chrome increasingly derives omnibox colour from
   the toolbar instead. The fields still parse. Set them, expect them to work, but treat the
   result as *verify empirically*, not *guaranteed*. This is a known and actively-discussed
   regression, not something we can fix from the manifest.

2. **New Tab Page.** Modern Chrome's NTP is partly driven by the "Customize Chrome" side panel,
   which can override theme-supplied NTP colours. Needs a hands-on check on your actual Chrome
   version rather than a promise up front.

Neither is a blocker. Both are reasons to build the theme and *look at it* before declaring
a field mapping correct.

---

## 4. Palette — source of truth

Taken verbatim from the Ghostty theme file your config references
(`theme = Github Dark Dimmed`), so the terminal and the browser are provably the same values:

| Role | Hex | RGB |
|---|---|---|
| background | `#22272e` | `34, 39, 46` |
| foreground | `#adbac7` | `173, 186, 199` |
| cursor / accent | `#539bf5` | `83, 155, 245` |
| black (0) | `#545d68` | `84, 93, 104` |
| red (1) | `#f47067` | `244, 112, 103` |
| green (2) | `#57ab5a` | `87, 171, 90` |
| yellow (3) | `#c69026` | `198, 144, 38` |
| blue (4) | `#539bf5` | `83, 155, 245` |
| magenta (5) | `#b083f0` | `176, 131, 240` |
| cyan (6) | `#39c5cf` | `57, 197, 207` |
| white (7) | `#909dab` | `144, 157, 171` |
| br. black (8) | `#636e7b` | `99, 110, 123` |
| br. red (9) | `#ff938a` | `255, 147, 138` |
| br. green (10) | `#6bc46d` | `107, 196, 109` |
| br. yellow (11) | `#daaa3f` | `218, 170, 63` |
| br. blue (12) | `#6cb6ff` | `108, 182, 255` |
| br. magenta (13) | `#dcbdfb` | `220, 189, 251` |
| br. cyan (14) | `#56d4dd` | `86, 212, 221` |
| br. white (15) | `#cdd9e5` | `205, 217, 229` |

A terminal palette has no notion of *elevation*, but browser chrome needs 2–3 stacked
surfaces. Two colours are borrowed from GitHub's Primer `dark_dimmed` tokens — the upstream
source the terminal theme itself derives from, so they're consistent, not invented:

| Token | Hex | RGB | Use |
|---|---|---|---|
| dark `canvas.default` | `#0d1117` | `13, 17, 23` | recessed — frame, tab strip, omnibox |
| `canvas.inset` | `#1c2128` | `28, 33, 40` | available; unused after the contrast bump |
| `canvas.default` | `#22272e` | `34, 39, 46` | base — toolbar (= terminal bg) |
| `border.default` | `#444c56` | `68, 76, 86` | separators, NTP header |

---

## 5. Proposed mapping (theme #1)

Contrast ratios computed against the actual surface each element sits on:

| Manifest field | Colour | Ratio | Rationale |
|---|---|---|---|
| `frame` | `#0d1117` | — | Recessed titlebar; inactive tabs blend into it |
| `frame_inactive` | `#0d1117` | — | Differentiate via text, not fill |
| `toolbar` | `#22272e` | — | **Exact terminal background** — the money shot |
| `toolbar_text` | `#adbac7` | 7.60 AAA | |
| `toolbar_button_icon` | `#adbac7` | 7.60 AAA | Propagates to hover/pressed/throbber |
| `tab_text` | `#adbac7` | 7.60 AAA | Active tab sits on `toolbar` |
| `background_tab` | `#0d1117` | — | Flush with frame, GitHub-style |
| `tab_background_text` | `#909dab` | 5.85 AA | Dimmer than active, still legible |
| `tab_background_text_inactive` | `#768390` | 4.88 AA | Unfocused window — dimmer, still AA |
| `bookmark_text` | `#adbac7` | 7.60 AAA | |
| `omnibox_background` | `#0d1117` | — | Recessed pill *(subject to §3 caveat)* |
| `omnibox_text` | `#adbac7` | 8.19 AAA | |
| `ntp_background` | `#22272e` | — | |
| `ntp_text` | `#adbac7` | 7.60 AAA | |
| `ntp_link` | `#6cb6ff` | 6.99 AA | Bright blue beats accent `#539bf5` (5.28) |
| `ntp_header` | `#444c56` | — | |
| `button_background` | `[0,0,0,0]` | — | Transparent — uses the RGBA form |

Two notes on the numbers:

- The first pass used Primer `dark_dimmed`'s own `canvas.inset` (`#1c2128`) for the frame,
  giving a **1.08** step against the toolbar. In practice that was too flat to read as
  separate surfaces. Dropping the frame to Primer's *dark* `canvas.default` (`#0d1117`)
  raises it to **1.26** — still restrained, but actually legible.
- That change also lifted every text pair to AA or better. `tab_background_text_inactive`
  went from 4.18 (under AA) to **4.88**, so there is no longer a deliberate sub-AA
  compromise anywhere in the theme.

Incognito variants (`frame_incognito`, `background_tab_incognito`, …) should go a step darker
still, so incognito stays visually distinct: `#010409` (Primer dark `canvas.inset`).

---

## 6. Proposed repo structure

Optimised for "adding theme #2 is trivial":

```
chrome-themes/
├── README.md                      # what this is, install instructions
├── docs/
│   └── SCOPE.md                   # this file
├── palettes/
│   └── github-dark-dimmed.json    # hex palette, single source of truth
├── themes/
│   └── github-dark-dimmed/
│       ├── manifest.json          # generated — the whole theme
│       └── images/                # only if we add any (§7)
├── scripts/
│   ├── build.mjs                  # palette + mapping -> manifest.json
│   ├── validate.mjs               # catch silently-dropped fields
│   └── package.mjs                # -> dist/<name>-<version>.zip
└── dist/                          # gitignored build output
```

**Why generate the manifest rather than hand-write it?**

Hand-writing 24 RGB triples is where hex→RGB typos live, and Chrome won't tell you about
them. A build step lets you author in hex against named palette roles and get correct RGB
arrays out. It also means theme #2 is a palette file plus a mapping, not a fresh
copy-paste-and-hope.

Worth being honest about the trade-off: for a single theme this is over-engineering, and a
hand-written manifest would be fine. It pays off at theme #2 or #3. Since the stated goal is
a multi-theme repo, I'd build it — but it's a reasonable thing to defer to a v2 if you'd
rather see one theme working first.

**Validator should catch:**
- Colour keys not in the 24-field table (typos → silent no-op)
- Channels outside `0–255`, non-integer values
- Malformed RGBA 4th elements (must be int `0`/`1` or float `0.0–1.0`)
- Tints outside `0–1.0` that aren't `-1.0`
- Missing `manifest_version` / `name` / `version`
- Optionally: contrast ratios, as a report

Zero dependencies — plain Node, no `package.json` needed beyond `"type": "module"`.

---

## 7. Optional extras (explicitly *not* in v1)

| Feature | Verdict |
|---|---|
| `theme_frame` PNG (gradient/texture) | Skip — a flat colour *is* the terminal look |
| `theme_ntp_background` wallpaper | Skip — fights `ntp_background`, and NTP is contested (§3) |
| Store icon (128×128) | Only needed if publishing |
| Screenshots | Only needed if publishing |
| CI validate-on-push | Nice; add once the validator exists |

The strong recommendation is **colours only, no images**. Images add build weight, need
`@2x` variants for HiDPI, and would actively work against the goal of matching a flat
terminal background.

---

## 8. Installation & distribution

**Local (recommended for personal use):**
`chrome://extensions` → enable Developer mode → *Load unpacked* → pick
`themes/github-dark-dimmed/`. Applies instantly. Iterating is: edit manifest → click reload.

Caveat: Chrome shows a "Disable developer mode extensions" nag on some channels, and
unpacked extensions don't sync across machines.

**Packed `.crx`:** self-contained, but Chrome blocks installing `.crx` files from outside the
Web Store, so this is only useful with enterprise policy. Not worth it.

**Chrome Web Store:** $5 one-time developer registration, then per-theme review (usually
fast for themes, since there's no code). Gets you sync across machines and a clean install.
Worth it only if you want it on multiple machines or want to share it.

**Decided: Chrome Web Store, unlisted.** It's the only route that syncs across
machines, which is the actual requirement. Unlisted means no public listing and no
search presence — installable only by URL — while going through the same review as a
public item. The $5 registration is one-time and covers every theme published from
that account, forever.

Cross-account caveat: themes sync *per Google Account*. A work profile signed into a
different account needs the install URL once, then follows that account. Managed
profiles may block extension installs by policy, in which case an admin has to
allowlist the extension ID — not something the manifest can work around.

Develop unpacked, publish when it survives daily use.

---

## 9. Decisions

All resolved — see [`STATUS.md`](STATUS.md) for the full table with reasoning.

The one that changed from this document's original recommendation: **no build script.**
A generator would hide exactly the mechanics that are the point of building this by
hand. The manifest is hand-written and machine-*validated* instead, which catches the
transcription errors a generator would have prevented while keeping the learning.
Revisit at theme #3.

---

## 10. Effort estimate

| Task | Estimate |
|---|---|
| Theme #1 manifest + install + eyeball | ~30 min |
| Palette JSON + build script | ~1 hr |
| Validator | ~1 hr |
| README + install docs | ~30 min |
| Packaging script | ~30 min |
| Web Store submission (if chosen) | ~1 hr + review wait |
| **Total (local-only, full scaffolding)** | **~3.5 hrs** |
| **Minimum viable (manifest only)** | **~30 min** |

Each subsequent theme after the scaffolding lands: **~15 minutes.**

---

## Sources

- [Chrome: What are themes?](https://developer.chrome.com/docs/extensions/develop/ui/themes)
- [Chrome: Themes (MV2 docs, fuller field discussion)](https://developer.chrome.com/docs/extensions/mv2/themes)
- `chrome/browser/themes/browser_theme_pack.cc` — [Chromium source](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/themes/browser_theme_pack.cc), pack version 106 (authoritative field tables)
- [Ghostty `GitHub Dark Dimmed` theme file](https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/master/ghostty/GitHub%20Dark%20Dimmed) (iTerm2-Color-Schemes)
- [Omnibox theming regression thread](https://support.google.com/chrome/thread/425300890/custom-theme-issue-omnibox-background-no-longer-consistent?hl=en) — Chrome support community
