#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.test.yml)
if [[ -f docker-compose.test.override.yml ]]; then
  compose+=(-f docker-compose.test.override.yml)
fi

"${compose[@]}" "$@"
