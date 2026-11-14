# Run `make` (or `make help`) to list targets.
# Needs: uv, pnpm, curl (curl is only used by `dev` to wait for the API).

API_PORT ?= 8000
API_CMD  := uv run --directory backend uvicorn app.main:app --reload --port $(API_PORT)
WEB_CMD  := pnpm --dir frontend run dev

.DEFAULT_GOAL := help
.PHONY: help install dev api web web-when-ready build \
        check lint lint-api lint-web typecheck typecheck-api typecheck-web format-check \
        fix fix-api fix-web db-reset clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# Setup
install: ## Install backend and frontend dependencies
	uv sync --directory backend
	pnpm --dir frontend install

# Run
dev: ## Start the whole stack (API :8000, Vite :5173). Ctrl-C stops both
	@$(MAKE) --no-print-directory -j2 api web-when-ready

# Internal: starts Vite once the API answers, so the first proxied request
# doesn't fail with ECONNREFUSED. Gives up after 30s.
web-when-ready:
	@for i in $$(seq 1 60); do \
		curl -sf http://localhost:$(API_PORT)/api/health >/dev/null 2>&1 && exec $(WEB_CMD); \
		sleep 0.5; \
	done; \
	echo "API did not come up on :$(API_PORT) within 30s" >&2; exit 1

api: ## Start only the backend
	$(API_CMD)

web: ## Start only the frontend (needs the API running for /api calls)
	$(WEB_CMD)

build: ## Production build of the frontend
	pnpm --dir frontend run build

# Quality checks
check: lint typecheck format-check ## Everything CI would run

lint: lint-api lint-web ## ruff + eslint
lint-api: ## ruff check
	uv run --directory backend ruff check .
lint-web: ## eslint
	pnpm --dir frontend run lint

typecheck: typecheck-api typecheck-web ## pyright + tsc
typecheck-api: ## pyright (config lives in the repo root)
	uv run --project backend pyright
typecheck-web: ## tsc
	pnpm --dir frontend run typecheck

format-check: ## ruff format --check (eslint already covers frontend formatting)
	uv run --directory backend ruff format --check .

# Autofix
fix: fix-api fix-web ## Autofix lint and formatting everywhere
fix-api: ## ruff check --fix + ruff format
	uv run --directory backend ruff check --fix .
	uv run --directory backend ruff format .
fix-web: ## eslint --fix
	pnpm --dir frontend run lint:fix

# Housekeeping
db-reset: ## Delete the SQLite DB (recreated on next API start)
	rm -f backend/app.db

clean: ## Remove build output and tool caches (keeps node_modules and .venv)
	rm -rf frontend/dist backend/.ruff_cache
	find backend -name __pycache__ -type d -prune -exec rm -rf {} +