#!/usr/bin/env bash
# Integration test stack + Vitest smoke suite.
#
# Layout matches sibling repos:
#   - ../nightwatch: tests/docker-compose.test.yml + tests/setup-test-qdrant.sh (compose up, then setup script)
#   - ../cb-edge/calendar: run-local.sh / stop-local.sh at repo root (docker compose from this project)
#
# Entry points (from paperless-ai repo root):
#   ./run-integration-tests.sh
#   ./stop-integration-tests.sh
#   npm run test:integration
#   npm run test:integration:down
#
# By default this script always runs docker compose down -v when it finishes or is interrupted,
# so test volumes and containers are not left behind. Use --keep-up to leave the stack running.
#
# Flags:
#   --keep-up        do not tear down after tests (for debugging or manual npm test re-runs)
#   --teardown-only  only tear down (same as stop-integration-tests.sh)
#   --no-build       skip image rebuild for paperless-ai (faster iteration)
#   --teardown       no-op (kept for backward compatibility; teardown is now the default)
#
# Requires: Docker, docker compose v2, curl, python3, npm (node_modules installed).

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${TESTS_DIR}/.." && pwd)"
COMPOSE=(docker compose -f "${TESTS_DIR}/docker-compose.test.yml")

KEEP_UP=false
TEARDOWN_ONLY=false
NO_BUILD=false
STACK_STARTED=false
CLEANUP_RAN=false

usage() {
  sed -n '1,35p' "$0" | tail -n +2
}

for arg in "$@"; do
  case "${arg}" in
    --keep-up) KEEP_UP=true ;;
    --teardown-only) TEARDOWN_ONLY=true ;;
    --no-build) NO_BUILD=true ;;
    --teardown) ;; # default behavior now; ignore
    -h|--help) usage; exit 0 ;;
    *)
      echo "unknown option: ${arg}" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[integration-tests] $*"
}

cleanup_stack() {
  if [[ "${KEEP_UP}" == true ]] || [[ "${CLEANUP_RAN}" == true ]]; then
    return 0
  fi
  if [[ "${STACK_STARTED}" != true ]]; then
    return 0
  fi
  CLEANUP_RAN=true
  log "tearing down test stack (docker compose down -v)"
  (cd "${TESTS_DIR}" && "${COMPOSE[@]}" down -v) || true
}

if [[ "${TEARDOWN_ONLY}" == true ]]; then
  (cd "${TESTS_DIR}" && "${COMPOSE[@]}" down -v)
  log "removed compose stack and volumes"
  exit 0
fi

trap cleanup_stack EXIT INT TERM

wait_http_ok() {
  local url=$1
  local name=$2
  local max="${3:-90}"
  local i=0
  while [[ "${i}" -lt "${max}" ]]; do
    if curl -fsS -o /dev/null "${url}" 2>/dev/null; then
      log "${name} ready (${url})"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  log "timeout waiting for ${name} (${url})"
  return 1
}

cd "${TESTS_DIR}"

if [[ ! -f .env.test ]] && [[ -f .env.test.example ]]; then
  log "creating .env.test from .env.test.example"
  cp .env.test.example .env.test
fi

log "starting broker + paperless-ngx"
STACK_STARTED=true
"${COMPOSE[@]}" up -d broker paperless-ngx

log "waiting for Paperless API (seed will also wait; this avoids a race on first boot)"
wait_http_ok "http://127.0.0.1:8000/api/" "paperless-ngx" 120

log "seeding token, tags, and fixtures (tests/seed-paperless.sh)"
"${TESTS_DIR}/seed-paperless.sh"

BUILD_ARGS=()
if [[ "${NO_BUILD}" != true ]]; then
  BUILD_ARGS=(--build)
  log "starting paperless-ai (--build --force-recreate)"
else
  log "starting paperless-ai (--force-recreate, no --build)"
fi
"${COMPOSE[@]}" up -d "${BUILD_ARGS[@]}" --force-recreate paperless-ai

log "waiting for paperless-ai /health/live"
wait_http_ok "http://127.0.0.1:3000/health/live" "paperless-ai" 90

cd "${ROOT}"
log "running Vitest smoke suite (npm test)"
npm test

if [[ "${KEEP_UP}" == true ]]; then
  log "stack left running (--keep-up); tear down with: ./stop-integration-tests.sh or npm run test:integration:down"
fi
