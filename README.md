<!-- ─────────────────────────── JARVYZ SATELLITE ─────────────────────────── -->

# people

[![JarvYZ](https://img.shields.io/badge/JARVYZ-Satellite-blue.svg?logoColor=white)](../../README.md)
[![Version](https://img.shields.io/badge/VERSION-0.1.0-blue.svg?logo=git&logoColor=white)](pyproject.toml)
[![Python](https://img.shields.io/badge/PYTHON-3.10–3.12-blue.svg?logo=python&logoColor=white)](pyproject.toml)
[![License](https://img.shields.io/badge/LICENSE-MIT-blue.svg?logo=opensourceinitiative&logoColor=white)](pyproject.toml)
[![Kind](https://img.shields.io/badge/KIND-service-blue.svg?logoColor=white)](#)
[![Port](https://img.shields.io/badge/PORT-9003-blue.svg?logoColor=white)](#)
[![Creator](https://img.shields.io/badge/CREATOR-Yeon-blue.svg?logo=github&logoColor=white)](https://github.com/YeonV)
[![Blade](https://img.shields.io/badge/A.K.A-Blade-darkred.svg?logo=github&logoColor=white)](https://github.com/YeonV)

<p align="left">
  <img src="ui/public/logo.svg" alt="JarvYZ" width="200">
</p>

> `yz-people` — Per-person voice samples + meta. Substrate for the xtts clone, speaker embedder, and wakeword corpus.

### Techs

[![FastAPI](https://img.shields.io/badge/x-FastAPI-blue.svg?logo=fastapi&logoColor=white&label=)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/x-React-blue.svg?logo=react&logoColor=white&label=)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/x-TypeScript-blue.svg?logo=typescript&logoColor=white&label=)](https://www.typescriptlang.org/)

**Run** `python -m yz_people` &nbsp;·&nbsp; **API** `/api/people/*`

<!-- ───────────────────────────────────────────────────────────────────────── -->

<details>
<summary><b>Documentation</b></summary>

Standalone HTTP service for per-person voice samples + meta — substrate
for the xtts voice clone, the eventual speaker embedder, and the
wakeword-trainer corpus.

A **satellite** in the JarvYZ ecosystem (alongside `satellites/yz-music`
and `satellites/wakeword-trainer`). Has its own life outside JarvYZ —
you can run it on its own box, point any number of clients at it
(JarvYZ, a CLI, your own UI), and it doesn't know or care who's calling.

## Run standalone

```bash
pip install -e .
python -m yz_people     # listens on http://127.0.0.1:9003
```

Or override via env:

```bash
PEOPLE_HOST=0.0.0.0 PEOPLE_PORT=9003 JWT_PEOPLE_ROOT=/path/to/people \
  python -m yz_people
```

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ok, version, python, platform, data_root}` |
| `GET` | `/people` | list people + bucket counts |
| `GET` | `/script` | the enrollment scene script |
| `POST` | `/people` | create a person `{slug, display_name?, language?, can_command?, is_wake_owner?}` |
| `GET` | `/{slug}` | full record (meta + auto_meta + bucket listings) |
| `PUT` | `/{slug}` | patch meta fields (only present keys are touched) |
| `DELETE` | `/{slug}` | hard-delete person + all recordings |
| `POST` | `/{slug}/recordings/{bucket}` | upload one WAV (multipart) |
| `DELETE` | `/{slug}/recordings/{bucket}/{name}` | delete one WAV |
| `GET` | `/{slug}/recordings/{bucket}/{name}` | stream a WAV back |
| `GET` | `/settings` | satellite settings snapshot |
| `PATCH` | `/settings` | mutate settings (currently: `data_root`) |
| `WS` | `/events` | server-pushed `{event: 'people', kind, ...}` mutations |
| `GET` | `/` | the bundled SPA (index.html) — anything not matching a route above falls through to the StaticFiles mount |

Note: list/create live at `/people` (not bare `/`) because `/` is the
SPA mount. The JarvYZ-side proxy maps `GET /api/people` → `/people` and
`POST /api/people` → `/people` for the same reason.

Buckets: `clone_source`, `speaker_ref`, `wake_positives`, `wake_negatives`.

## Data layout

```
<data_root>/<slug>/
├── meta.json            # user-curated (display_name, language, can_command, is_wake_owner, ...)
├── auto_meta.json       # Loom-synthesized facts (empty today; LOOM_PLAN tracks)
├── clone_source/        # WAVs for xtts voice clone training
├── speaker_ref/         # WAVs for the eventual speaker embedder
├── wake_positives/      # WAVs forwarded to wakeword-trainer corpus
└── wake_negatives/      # WAVs forwarded to wakeword-trainer corpus
```

`<data_root>` defaults to `~/.jarvyz/people/`. Override via:

- `JWT_PEOPLE_ROOT` env (at boot)
- `PATCH /settings {data_root: "..."}` (runtime; persisted to
  `<settings_root>/settings.json`)

`<settings_root>` is `~/.jarvyz/satellites/people/` (parallel to where
the other satellites keep their state), overridable via
`JWT_PEOPLE_SETTINGS_ROOT`.

## UI build pipeline

The same UI ships in two modes:

### 1. Standalone SPA — `npm run build:pages`

Outputs to `../people/static/`. Mounted by the satellite at `/`. After
this build, `pip install`-and-run gives a working UI at
`http://127.0.0.1:9003/` with no extra steps.

### 2. Dynamic-module IIFE — `npm run ship`

```bash
cd ui
npm run ship          # = build:lib + install-to-frontend
```

Produces `dist-lib/yz-people.iife.js` and copies it to BOTH
`frontend/public/modules/` and `web/static/modules/`. JarvYZ loads it
via `@yz-dev/react-dynamic-module` at `/dev/people`. Either build mode
reads the SAME source under `ui/src/` — only the entry point + bundle
shape differ.

### Building a wheel (for distribution)

```bash
bash scripts/build_wheel.sh
```

Installs UI deps if missing, runs `build:pages` into `yz_people/static/`,
then `python -m build`. Resulting wheel includes the SPA so `pip install`
+ `python -m yz_people` works out of the box.

## Tests

```bash
cd ui
npm install
npm run test:e2e      # Playwright smoke tests against the standalone SPA
```

Covers: SPA shell renders, `/health`, `/people`, `/script` shapes,
`/settings` round-trip, create-and-delete a smoke-test person,
`/events` WS initial-frame.

`playwright.config.ts` auto-spawns the satellite via `webServer` with
`reuseExistingServer: true`, so tests share a satellite that JarvYZ
auto-spawned or that you started by hand.

## Use with JarvYZ

JarvYZ's `web/api/people_satellite.py` is a thin proxy that forwards
`/api/people/*` to this satellite. Configure via
`settings.people.satellite_url` (default `http://127.0.0.1:9003`).
Auto-spawned on first hit when running locally.

The JarvYZ-embedded UI lives at `/dev/people`. The page is a thin
`useDynamicModule(...)` loader at `frontend/src/pages/Dev/People/
PeoplePage.tsx` (~110 lines) — all the actual React lives in
`ui/src/`, loaded as the IIFE from `/modules/yz-people.iife.js`.


</details>
