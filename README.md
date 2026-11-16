# Finvestik

Static trading tools and educational pages hosted with GitHub Pages at https://www.finvestik.com/.

## Work locally or with Codex

Open this repository in Codex and describe the desired change. `AGENTS.md` gives a small task map and verification commands so agents can read the relevant files without loading large datasets.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Visit http://127.0.0.1:8000. There is no application build step. Root-relative URLs require serving from the repository root; opening HTML directly as a file is unsupported.

```sh
python tools/check.py
node tools/frontend-check.cjs
python -m pip install -r scripts/requirements.txt
python -m unittest discover -s scripts/tests -v
```

Node.js 22+ and Python 3.12+ are used for checks. The website itself does not require Python or Node on the hosting server.

## Map

| Path | Purpose |
| --- | --- |
| `index.html` | Homepage |
| `education/` | Learning and legal pages |
| `stock-universe/` | Scanner and relative rotation charts |
| `position-calculator/` | Position sizing |
| `custom-index/` | Custom index tool |
| `static/css/`, `static/js/`, `static/images/` | Shared browser assets |
| `static/data/` | Published scanner snapshot and version |
| `scripts/` | Collectors and intermediate generated data |
| `.github/workflows/` | Scheduled data updates and checks |

See [design guidelines](docs/design-guidelines.md), [data pipeline](docs/data-pipeline.md), and [security notes](docs/security.md). Changes in a Codex checkout become live only after they reach the repository's configured publishing branch and deployment succeeds.
