#!/bin/sh
set -eu
order=${1:-broken}
case "$order" in broken|fixed) ;; *) echo 'Choose broken or fixed' >&2; exit 2 ;; esac
if [ ! -f .env ]; then npm run init:demo; fi
docker compose up -d --wait --wait-timeout 240
npm run setup:flagsmith -- "$order"
