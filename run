#!/usr/bin/env bash
# ./run.sh dev    start backend (:8000) and frontend (:5173)
# ./run.sh check  lint + typecheck everything (what CI would run)
# ./run.sh fix    autofix everything fixable
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-dev}" in
  dev)
    trap 'kill 0' INT TERM EXIT
    (cd backend && uv run uvicorn app.main:app --reload --port 8000) &

    # Start Vite only once the API answers, otherwise the first proxied
    # request fails with ECONNREFUSED. Gives up after 30s and starts anyway.
    for _ in $(seq 1 60); do
      curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && break
      sleep 0.5
    done

    (cd frontend && pnpm dev) &
    wait
    ;;
  check)
    (cd backend && uv run ruff check . && uv run ruff format --check .)
    uv run --project backend pyright
    (cd frontend && pnpm lint && pnpm typecheck)
    ;;
  fix)
    (cd backend && uv run ruff check --fix . && uv run ruff format .)
    (cd frontend && pnpm lint:fix)
    ;;
  *)
    echo "usage: ./run.sh [dev|check|fix]" >&2
    exit 1
    ;;
esac
