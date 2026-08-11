# store/

Hand-made Web Store listing assets. **Committed** — unlike `dist/`, these are
sources, not build output, and cannot be regenerated.

```
store/<slug>/
└── screenshot-1280x800.png    at least one required; exactly 1280x800 or 640x400
```

Generated artwork (icon, promo tile) is *not* here — `npm run assets` draws those
from the palette into `dist/store/<slug>/`. That command also copies everything from
this directory alongside them, so `dist/store/<slug>/` ends up holding the complete
upload set.

Do not put these inside `themes/<slug>/` — `npm run package` bundles that whole
directory into the extension, and listing artwork has no business shipping to users.
