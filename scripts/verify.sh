#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run verify
