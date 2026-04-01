#!/usr/bin/env bash
# Tear down tests/docker-compose.test.yml and volumes.
# Same idea as ../cb-edge/calendar/stop-local.sh — run from the project root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "${ROOT}/tests/run-integration-tests.sh" --teardown-only
