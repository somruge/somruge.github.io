# somruge.github.io

Personal website, deployed via GitHub Pages.

Live at: https://somruge.github.io

## Files

- `index.html` — content and structure
- `style.css` — styling (light/dark mode via `prefers-color-scheme`)
- `script.js` — nav menu, scroll-reveal, active-link highlighting
- `game.js` — the "Sprint Dash" balloon-pop mini-game
- `favicon.svg`, `og-image.png` — brand mark and social preview image

No build step — just edit the files and push to `main`. GitHub Pages redeploys automatically
(usually within a minute or two).

## Cache-busting

`style.css`, `script.js`, and `game.js` are linked with a `?v=N` query string in `index.html`.
Browsers cache these files for up to 10 minutes, so **bump the version number** (e.g. `?v=3` →
`?v=4`) any time you change one of them — otherwise visitors may keep seeing the old cached
version for a while after you push.
