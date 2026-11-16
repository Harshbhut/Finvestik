# Finvestik: quick working instructions

Static GitHub Pages site, plain HTML/CSS/JavaScript; Python collectors update committed JSON. No app build or package manager is required.

## Read only what the task needs
- Homepage: `index.html`, `static/css/mybio.css`.
- Shared theme/nav: `static/js/main.js`, `static/css/style.css`.
- Scanner: `stock-universe/index.html`, `static/js/stock-universe.js`.
- Charts: `stock-universe/rrg.html`; calculator: `position-calculator/index.html`.
- Data automation: `scripts/`, `.github/workflows/`; see `docs/data-pipeline.md`.
- UI changes: read `docs/design-guidelines.md`.
- Never paste or read whole generated JSON files into context. Historical JSON is ~71 MB. Inspect keys or small samples with Python instead. Do not inspect git history or unrelated pages unless needed.

## Routine commands
- Preview: `python -m http.server 8000 --bind 127.0.0.1` from repo root.
- Offline checks: `python tools/check.py` (requires Node for JS syntax).
- Frontend regressions: `node tools/frontend-check.cjs` (XSS, storage, refresh and CSV fixtures).
- Data regression checks: `python -m unittest discover -s scripts/tests -v` (install `scripts/requirements.txt` if needed).
- Full generated JSON validation: `python tools/check.py --full-data` only for data changes.

## Change rules
- Keep plain JS and existing URLs, JSON field names, theme and navigation behavior.
- Use textContent / DOM APIs for data from APIs, files or storage. Escape text and attributes before inserting any data into HTML. Encode URL components.
- Never put secrets in browser code or committed files. Never interpolate workflow inputs into shell code; use validated environment variables.
- Preserve last known good market data on network, parsing or validation failures. Publish version metadata only after successful data writes.
- Do not run collectors against live providers merely to test a refactor. Use fixtures and mocks.
- Do not commit generated data unless a refresh is requested. Never change market formulas silently.
- For UI work, check 375px mobile and desktop, keyboard navigation, both themes, browser errors and table/chart scrolling.
- Run targeted checks, then shared checks once. Report what changed, tests and remaining limitations. Do not claim audit or mobile coverage beyond actual checks.
