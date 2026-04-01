#!/usr/bin/env bash
# Repo-root entry for the Docker integration stack + smoke tests.
# Same idea as ../cb-edge/calendar/run-local.sh — run this from the project root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "${ROOT}/tests/run-integration-tests.sh" "$@"
