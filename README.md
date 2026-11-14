# PiiShooter

```bash
./run.sh dev     # backend :8000 (API docs at /docs), frontend :5173
./run.sh check   # ruff + pyright + eslint + tsc
./run.sh fix     # autofix lint/format issues
```

Open this folder in VS Code and accept the recommended extensions to get autofix on save.

## Backend (`backend/app/`)

| Folder | Holds |
| --- | --- |
| `core/` | settings (`config.py`), password + JWT helpers (`security.py`) |
| `db/` | engine/session (`session.py`), declarative `Base` (`base.py`) |
| `models/` | SQLAlchemy tables. Register new ones in `models/__init__.py` |
| `schemas/` | Pydantic request/response shapes |
| `api/` | `deps.py` (auth dependency), `routes/` (one file per resource), `router.py` (wires them up) |

Adding a resource: model in `models/`, schemas in `schemas/`, route file in `api/routes/`
(see `redact.py`), then include it in `api/router.py`. Routers included with
`dependencies=protected` require login; add `user: CurrentUser` to get the caller. Tables are created on startup; if you change an existing
model, delete `backend/app.db`.

Config is in `backend/.env` (`DATABASE_URL`, `SECRET_KEY`).

## Frontend (`frontend/src/`)

| Folder | Holds |
| --- | --- |
| `app/` | providers, routes, Mantine theme, query client |
| `features/<name>/` | everything for one feature: pages, components, `api.ts`, `hooks.ts`, `types.ts` |
| `components/` | UI shared across features (layout, route guard) |
| `lib/` | helpers with no UI (the `api()` fetch wrapper) |

`features/redaction_page/` is the template to copy. Import with `@/` (maps to `src/`).

### Styling

Colors, fonts and corner radius are set in `app/theme.ts`; Mantine turns that into CSS
variables that every component uses. Dark/light mode is the toggle in the header.
Use style props (`<Text c="dimmed" mt="md">`) for one-offs, or a `Foo.module.css` next to
the component for anything custom.
