# Adwait Chavan — personal site

An editorial single-page portfolio: cream + terracotta, oversized Anton display type,
Playfair serif accents, and scroll-driven motion. Built as plain HTML/CSS/JS —
no framework, no build step, no `node_modules`.

---

## Run it locally

```bash
./serve.sh
```

Then open **http://localhost:5199**. Any static server works; the script just wraps
`python3 -m http.server`. Pass a different port as the first argument (`./serve.sh 8080`).

Opening `index.html` directly with `file://` mostly works, but the browser blocks a few
things (and the résumé link behaves oddly), so prefer the server.

---

## What's in here

```
personal-site/
├── index.html              all content — edit copy here
├── serve.sh                local static server
├── assets/
│   ├── css/style.css       design tokens + every component
│   ├── js/main.js          all behaviour (no dependencies)
│   ├── img/                photography + generated derivatives
│   ├── video/              trimmed, transcoded travel clips
│   └── docs/               résumé PDF served by the Résumé button
├── tools/
│   └── add-hobby-photos.sh import + crop the badminton / cricket photos
├── case-studies/           three long-form analyses with live models
└── .claude/launch.json     dev-server config for Claude Code's preview pane
```

---

## Add your two hobby photos

Both photos are already in place. To swap either one, save the new photo anywhere
(Desktop is fine — `.HEIC` straight off an iPhone works) and run:

```bash
./tools/add-hobby-photos.sh ~/Desktop/badminton.HEIC ~/Desktop/cricket.jpg
```

That applies EXIF rotation, crops each shot to its tile's aspect ratio around the
subject, resizes for the web, strips metadata, and writes `assets/img/hobby-badminton.jpg`
and `assets/img/hobby-cricket.jpg`.

The `FOCUS_X` / `FOCUS_Y` / zoom values at the top of the script are tuned for the two
photos currently in use — the cricket one is zoomed to 62% so the batting shot fills the
tile rather than sitting small in the middle of the pitch.

Update just one:

```bash
./tools/add-hobby-photos.sh --cricket ~/Desktop/match.jpg
```

If the crop lands badly on a different photo, edit those values (`0` = left/top,
`1` = right/bottom; lower zoom = tighter) and run it again.

Prefer to skip the script? Drop correctly-named files straight into `assets/img/` —
`hobby-badminton.jpg` (portrait, about 3:4.6) and `hobby-cricket.jpg` (landscape, 4:3).
Anything roughly that shape works; `object-fit: cover` handles the rest.

If either file is missing or fails to load, `main.js` adds `.no-photo` to the tile and
the SVG fallback shows instead — the page never renders a broken image.

---

## Case studies

Three long-form analyses live in `case-studies/`, each with its own model file in
`assets/js/`:

| Page | Model | What it does |
|---|---|---|
| `finance-hospital-valuation.html` | `case-finance.js` | Unlevered DCF, 10,000-trial Monte Carlo with correlated drivers, LBO returns and the price a 20% hurdle supports |
| `consulting-cost-to-serve.html` | `case-consulting.js` | MECE margin bridge and a bottom-up segment P&L with a re-pricing simulator |
| `strategy-ai-portfolio.html` | `case-strategy.js` | Risk-adjusted NPV and an exact 0/1 knapsack over twelve initiatives |

`assets/js/charts.js` is a small dependency-free SVG chart library shared by all three
(waterfall, histogram, scatter, stacked columns, lines, range bars, heat table). Charts
render at the host element's measured pixel width and re-render on resize. **Colour is
never written into the SVG** — marks carry semantic classes and `case.css` paints them
from the theme tokens, so the dark-mode toggle needs no redraw.

Every company in the three cases is an illustrative composite, stated as such on each
page. The methods are real; the companies are not.

### Asset versioning — read this before you edit CSS or JS

Every stylesheet and script is referenced with a version query, e.g.
`assets/js/main.js?v=20260921`. GitHub Pages sets long cache lifetimes, so **returning
visitors keep running your old CSS and JS until that token changes.** After editing
anything in `assets/css/` or `assets/js/`, bump the token everywhere:

```bash
cd ~/Desktop/personal-site && grep -rl '?v=' --include='*.html' . | xargs sed -i '' 's/?v=[0-9]\{8\}/?v='"$(date +%Y%m%d)"'/g'
```

Skipping this is the single most likely reason a change looks like it "didn't deploy".

---

## Editing content

Everything lives in `index.html` as ordinary markup — no CMS, no JSON blobs.

- **Projects** — each `<article class="work__row">` holds its own modal content inside
  `<div class="work__detail" hidden>`. Copy a whole block to add a seventh project;
  the number, title and meta line are read straight from the row.
- **Experience** — `<details class="exp__item">` blocks. The first one has `open`.
- **Skills** — set both `data-val="88"` on `.bar` *and* the inline `style="width:88%"`
  on its `<i>`. The inline width is what shows when JavaScript is unavailable; JS
  zeroes it and animates back up to `data-val`.
- **Stats** — `data-count` is the target, `data-dec` the decimal places. The text
  content should already be the final figure, for the same no-JS reason.
- **Résumé** — replace `assets/docs/Adwait-Chavan-Resume.pdf`, keeping the filename.

### The hero headline

The oversized word cycles through a list. Each word is its own `<span class="gword">`
in `index.html` with one `<span>` per letter — add or remove words there and the
JavaScript picks them up automatically. Keep them 7–9 letters so they fill the line
at a similar size, and keep the first one marked `is-active` (it's what shows with
JavaScript disabled).

### Travel slideshow

`#beyond` → the Travelling tile is a cross-fading strip of photos and video clips.
Each `<div class="slide">` carries its own `<span class="slide__place">` caption —
edit those to correct a location. Slides rotate every 4.2s, pause while the pointer
is over the tile, and stop entirely when the tile is off screen or the tab is hidden.
Videos are `preload="none"`, so the clips are only fetched once that tile is reached.

To re-cut a clip from a source video (no ffmpeg needed — this is macOS's own tool):

```bash
avconvert --source ~/Downloads/IMG_1507.MOV --output assets/video/travel-rooftops.mp4 \
  --preset Preset640x480 --start 2 --duration 6 --replace
```

### Colours

All of them are CSS custom properties at the top of `style.css`, defined twice —
once on `:root` (cream) and once under `html[data-theme="dark"]` (charcoal).
Change `--accent` in both places to reskin the whole site.

---

## Behaviour notes

- **The status bar** is fixed to the bottom of the viewport and never scrolls away.
  `--sb-h` in `style.css` sets its height, and `body` reserves that much padding so
  nothing hides behind it. Below 900px the labels swap to short forms (`United States`,
  `Call`, `Email`) via the `.sb__full` / `.sb__short` pair, so all five items still fit
  on a 360px screen.
- **Theme** — cream by default; dark is opt-in through the header toggle and remembered
  in `localStorage`. The OS setting deliberately doesn't override it, because the
  cream palette *is* the design.
- **Motion** — everything respects `prefers-reduced-motion`. Under it, reveals, parallax,
  tilt and the intro are all disabled.
- **Without JavaScript** — the page is fully readable. An inline snippet in `<head>`
  swaps `html.no-js` for `html.js`; the opacity-0 reveal states only apply under
  `html.js`, and the loading overlay is hidden entirely.

  ⚠️ If you add a new reveal rule, **the `.is-in` half needs the `html.js` prefix too**.
  `html.js .reveal` out-specifies a bare `.reveal.is-in`, so the hidden state wins and
  the content never appears. That exact mistake blanked Experience and Education once.
- **Reveals are driven by scroll position**, not IntersectionObserver — a rect check in
  the scroll handler, called synchronously rather than deferred into `requestAnimationFrame`.
  Both of those are deliberate: rAF is suspended in enough situations that it isn't safe
  for deciding whether content is visible at all.
- **Cursor and tilt** are gated behind `hover: hover and pointer: fine`, so touch
  devices get none of it.

---

## Deploying

It's a folder of static files — anything works.

```bash
# GitHub Pages
git init && git add -A && git commit -m "Personal site"
# push, then enable Pages on the default branch, root folder

# Netlify — drag the folder onto app.netlify.com/drop
# Vercel  — vercel deploy (framework preset: Other)
```

Before shipping, update the two absolute-ish bits in `<head>`: `og:image` resolves
relative to the deployed URL, so it works as-is on any host root.
