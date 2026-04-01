#!/usr/bin/env bash
# Seed Paperless-ngx (token, tags, uploads) and write tests/.env.test for docker compose + npm test.
# With docker-first config (PR 02), paperless-ai needs no setup wizard — only PAPERLESS_API_TOKEN in .env.test.
#
# Run from repo root: ./tests/seed-paperless.sh
# Prerequisites: broker + paperless-ngx from tests/docker-compose.test.yml are up and healthy.
#
# Idempotent: safe when the DB already has smoke fixtures (e.g. compose stack was already running).

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURES_DIR="${TESTS_DIR}/fixtures"

PAPERLESS_BASE="${PAPERLESS_BASE:-http://127.0.0.1:8000}"
PAPERLESS_AI_BASE="${PAPERLESS_AI_BASE:-http://127.0.0.1:3000}"

ENV_TEST_OUT="${TESTS_DIR}/.env.test"
EXAMPLE_ENV="${TESTS_DIR}/.env.test.example"

log() {
  echo "[seed] $*" >&2
}

wait_http_ok() {
  local url=$1
  local name=$2
  local max="${3:-60}"
  local i=0
  while [[ $i -lt $max ]]; do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then
      log "${name} is up (${url})"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  log "timeout waiting for ${name}"
  return 1
}

# GET /api/{endpoint}/?page_size=200 and print id of first object with matching name, or exit 1.
lookup_id_by_name() {
  local endpoint="$1"
  local want_name="$2"
  curl -fsS "${PAPERLESS_BASE}/api/${endpoint}?page_size=200" "${AUTH_HEADER[@]}" | python3 -c "
import json, sys
want = sys.argv[1]
d = json.load(sys.stdin)
for o in d.get('results', []):
    if o.get('name') == want:
        print(o['id'])
        raise SystemExit(0)
raise SystemExit(1)
" "${want_name}"
}

ensure_tag() {
  local name="$1"
  local color="$2"
  local id=""
  id="$(lookup_id_by_name "tags/" "${name}" 2>/dev/null || true)"
  if [[ -n "${id}" ]]; then
    log "reusing tag ${name} (id=${id})"
    echo "${id}"
    return
  fi
  curl -fsS -X POST "${PAPERLESS_BASE}/api/tags/" \
    "${AUTH_HEADER[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"color\":\"${color}\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

ensure_correspondent() {
  local name="$1"
  local id=""
  id="$(lookup_id_by_name "correspondents/" "${name}" 2>/dev/null || true)"
  if [[ -n "${id}" ]]; then
    log "reusing correspondent ${name} (id=${id})"
    echo "${id}"
    return
  fi
  curl -fsS -X POST "${PAPERLESS_BASE}/api/correspondents/" \
    "${AUTH_HEADER[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

ensure_document_type() {
  local name="$1"
  local id=""
  id="$(lookup_id_by_name "document_types/" "${name}" 2>/dev/null || true)"
  if [[ -n "${id}" ]]; then
    log "reusing document type ${name} (id=${id})"
    echo "${id}"
    return
  fi
  curl -fsS -X POST "${PAPERLESS_BASE}/api/document_types/" \
    "${AUTH_HEADER[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

if [[ ! -f "${ENV_TEST_OUT}" && -f "${EXAMPLE_ENV}" ]]; then
  log "creating ${ENV_TEST_OUT} from .env.test.example (docker compose needs this file)"
  cp "${EXAMPLE_ENV}" "${ENV_TEST_OUT}"
fi

log "waiting for Paperless API at ${PAPERLESS_BASE}/api/"
wait_http_ok "${PAPERLESS_BASE}/api/" "paperless-ngx" 90

log "creating API token (POST ${PAPERLESS_BASE}/api/token/)"
TOKEN_JSON="$(curl -fsS -X POST "${PAPERLESS_BASE}/api/token/" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')"
TOKEN="$(echo "${TOKEN_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('key') or '')")"
if [[ -z "${TOKEN}" ]]; then
  log "failed to parse API token from Paperless response: ${TOKEN_JSON}"
  exit 1
fi

AUTH_HEADER=(-H "Authorization: Token ${TOKEN}")

log "creating tags (or reusing if present)"
TAG_A="$(ensure_tag "smoke-tag-a" "#e6194B")"
TAG_B="$(ensure_tag "smoke-tag-b" "#3cb44b")"

log "creating correspondent and document type (or reusing if present)"
CORR_ID="$(ensure_correspondent "Smoke Correspondent")"
DOCTYPE_ID="$(ensure_document_type "Smoke Document Type")"

EXISTING_COUNT="$(curl -fsS "${PAPERLESS_BASE}/api/documents/?page_size=100" "${AUTH_HEADER[@]}" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")"
if [[ "${EXISTING_COUNT}" -ge 3 ]]; then
  log "found ${EXISTING_COUNT} document(s) already; skipping fixture uploads"
else
  log "uploading test documents"
  for f in smoke-doc-1.txt smoke-doc-2.txt smoke-doc-3.txt; do
    curl -fsS -X POST "${PAPERLESS_BASE}/api/documents/post_document/" \
      "${AUTH_HEADER[@]}" \
      -F "document=@${FIXTURES_DIR}/${f}"
  done
fi

log "waiting for documents to appear in index"
COUNT=0
for _ in $(seq 1 90); do
  COUNT="$(curl -fsS "${PAPERLESS_BASE}/api/documents/?page_size=100" "${AUTH_HEADER[@]}" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")"
  if [[ "${COUNT}" -ge 3 ]]; then
    log "found ${COUNT} document(s)"
    break
  fi
  sleep 2
done

if [[ "${COUNT:-0}" -lt 3 ]]; then
  log "expected at least 3 documents, got ${COUNT:-0}"
  exit 1
fi

cat >"${ENV_TEST_OUT}" <<EOF
# Generated by tests/seed-paperless.sh — do not commit
# Loaded by docker compose (paperless-ai) and vitest (host tests)
PAPERLESS_API_TOKEN=${TOKEN}
PAPERLESS_AI_URL=${PAPERLESS_AI_BASE}
API_KEY=test-smoke-api-key
PAPERLESS_TAG_SMOKE_A=${TAG_A}
PAPERLESS_TAG_SMOKE_B=${TAG_B}
PAPERLESS_CORRESPONDENT_ID=${CORR_ID}
PAPERLESS_DOCUMENT_TYPE_ID=${DOCTYPE_ID}
EOF

log "wrote ${ENV_TEST_OUT}"
log "If paperless-ai is already running, recreate it so it picks up the new token: docker compose -f tests/docker-compose.test.yml up -d paperless-ai"
