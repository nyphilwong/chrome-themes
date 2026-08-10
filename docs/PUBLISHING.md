# Publishing to the Chrome Web Store

Goal: an **unlisted** listing — no public listing page, no search presence, installable
by anyone with the link. That's what makes it syncable across your own machines and
shareable with friends and family.

Total cost: **$5, once, ever** — covers every theme you publish from that account.

---

## Step 0 — What you already have

```bash
npm run package -- github-dark-dimmed   # dist/github-dark-dimmed-1.2.0.zip
npm run assets  -- github-dark-dimmed   # dist/store/github-dark-dimmed/
```

| Asset | Status |
|---|---|
| Extension ZIP | Built (includes theme images) |
| Store icon, 128×128 | Generated |
| Small promo tile, 440×280 | Generated |
| **Screenshot, 1280×800** | **You need to take this** — step 2 |
| Marquee promo tile, 1400×560 | Optional, skip |

The icon and promo tile are drawn from the palette itself — a stylised browser window
showing the frame/toolbar/omnibox relationship. No text, per Google's guidance that
promo images should survive being shrunk.

---

## Step 1 — Register the developer account

1. Go to the [developer dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with the Google account you want to **own** this listing

   > Choose deliberately. The listing belongs to this account permanently, and
   > transferring later is awkward. Use your personal account, not work — you want
   > to keep this if you change jobs.

3. Accept the developer agreement
4. Pay the **$5 one-time registration fee** (card required)
5. If prompted, enable **2-Step Verification** — Google requires it on publishing
   accounts

### Trader / non-trader declaration

Mandatory for everyone, from an EU regulation requiring marketplaces to identify
traders. You'll be asked once.

- **Non-trader** — you, for a personal theme you're not selling. Self-declared, no
  address published. Users are told consumer-protection law doesn't apply to your
  listing, which is irrelevant for a free theme.
- **Trader** — acting commercially. Requires verified legal name and public contact
  details.

Pick **non-trader**.

---

## Step 2 — Take the screenshot

At least one is required, at exactly **1280×800** or **640×400**. It should show the
real browser with the theme applied — that's the point of a screenshot.

**Cleanest route** — size the window exactly, then capture just it:

```powershell
# Run in PowerShell on Windows, with Chrome already open
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W{[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int t,bool r);}
"@
$p = Get-Process chrome | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
[W]::MoveWindow($p.MainWindowHandle, 100, 100, 1280, 800, $true)
```

Then focus Chrome and press **Alt + PrintScreen** to capture just that window. Paste
into Paint and confirm it reads 1280×800 before saving as PNG.

**Fallback:** capture anything with `Win + Shift + S`, open in Paint, crop to an 8:5
region, then Resize → Pixels → 1280×800.

**What to show:** a couple of tabs open, bookmarks bar visible, on a page that isn't
distractingly bright. The theme only styles browser chrome, so make the chrome the
subject. GitHub in dark mode is a fitting choice.

Verify the dimensions — the dashboard rejects anything that isn't exact.

---

## Step 3 — Upload

1. Dashboard → **Add new item**
2. Drop in `dist/github-dark-dimmed-1.2.0.zip`
3. Wait for the upload to process

Chrome reads `manifest.json` and detects it's a theme, so some extension-only fields
won't appear.

---

## Step 4 — Store listing tab

| Field | What to put |
|---|---|
| **Title** | `GitHub Dark Dimmed` |
| **Summary** | One line, ≤132 chars. E.g. *"Chrome theme matched to the GitHub Dark Dimmed terminal and editor colour scheme."* |
| **Detailed description** | See below |
| **Category** | Themes |
| **Language** | English |
| **Store icon** | `dist/store/github-dark-dimmed/store-icon-128.png` |
| **Screenshots** | Your 1280×800 from step 2 |
| **Small promo tile** | `dist/store/github-dark-dimmed/promo-tile-440x280.png` |
| **Marquee tile** | Skip — optional |
| **YouTube video** | Skip |

A description worth pasting:

```
A Chrome theme matched to the GitHub Dark Dimmed colour scheme, so your browser
sits alongside your terminal and editor without a jarring colour shift.

The toolbar is set to #22272e — the exact background value from the GitHub Dark
Dimmed terminal theme. Surface tones come from GitHub's Primer design tokens, so
the tab strip, toolbar and omnibox stack the way GitHub's own interface does.

Every text colour meets WCAG AA contrast against the surface it sits on.

Themes only style Chrome's own interface: the window frame, tab strip, toolbar,
bookmarks bar and new tab page. Web page content is unaffected.
```

---

## Step 5 — Privacy tab

Themes contain no code, so this is quick but still mandatory.

- **Single purpose:** *"Applies a colour theme to the Chrome browser interface."*
- **Permissions justification:** none requested — nothing to justify
- **Data usage:** tick that you collect **no user data**, then confirm the three
  certifications (no sale, no unrelated use, no creditworthiness use)

All three are truthful: a theme is a `manifest.json` with colour values and no
runtime code whatsoever.

---

## Step 6 — Distribution tab

| Setting | Value |
|---|---|
| **Visibility** | **Unlisted** |
| Payment | Free |
| Regions | All |

**Unlisted** means: not in search, not in listings, installable by anyone with the
URL. Same review process as public.

> Don't pick **Private** — that restricts installs to trusted-tester accounts you
> enumerate, and the tester list is account-wide rather than per-item. It's built
> for pre-launch testing, not for sharing with family.

---

## Step 7 — Submit

**Submit for review.** Themes usually clear faster than extensions since there's no
code to analyse, but Google commits to no specific turnaround.

Two things to know:

- You can choose to publish automatically on approval, or hold it and publish
  manually.
- If you defer, you have **30 days** to publish after approval, or the submission
  reverts to draft.

---

## Step 8 — After it's live

You'll get a URL like `https://chromewebstore.google.com/detail/<extension-id>`.

**On your own machines:** install once per Google account. It then syncs to every
Chrome signed into that account, and auto-updates.

**Work profile:** a different Google account, so it needs the link once. Managed
profiles may block extension installs by policy — if so, an admin has to allowlist
the extension ID. Nothing in the manifest can work around that.

**Friends and family:** send the link. One click, auto-updates, no developer mode.

Once installed from the store you can **stop using `npm run sync`** — that only
existed for unpacked development.

---

## Publishing an update

1. Bump `version` in `themes/<slug>/manifest.json` — Chrome requires a strictly
   higher version, and the dashboard rejects a re-upload otherwise
2. `npm run check` → must be `READY`
3. `npm run package -- <slug>`
4. Dashboard → your item → **Package** → upload the new ZIP
5. Submit for review again

Store listing text and images persist between updates; you only re-upload those if
they've changed.

---

## Sources

- [Register as a developer](https://developer.chrome.com/docs/webstore/register)
- [Publish your item](https://developer.chrome.com/docs/webstore/publish)
- [Image asset requirements](https://developer.chrome.com/docs/webstore/images)
- [Store listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Distribution and visibility](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Trader/non-trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)
