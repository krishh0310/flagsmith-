#!/bin/sh
set -eu
expected_exit() {
  expected=$1
  shift
  actual=0
  "$@" || actual=$?
  if [ "$actual" -ne "$expected" ]; then
    echo "Expected exit $expected, got $actual from $*" >&2
    exit 1
  fi
}

npm run setup:flagsmith -- onboarding-broken
node examples/onboarding/serve.ts &
preview=$!
trap 'kill "$preview" 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:4181/ >/dev/null 2>&1 &&
     curl -fsS http://127.0.0.1:4182/ >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Onboarding previews did not become ready.' >&2; exit 1; fi
expected_exit 1 npm run rehearse -- onboarding
npm run setup:flagsmith -- onboarding-fixed
expected_exit 0 npm run rehearse -- onboarding

npm run setup:flagsmith -- pricing-fixed
node scripts/verify-pricing-assignments.ts
expected_exit 0 npm run rehearse -- pricing
expected_exit 0 npm run rehearse -- pricing
npm run setup:flagsmith -- pricing-broken
expected_exit 1 npm run rehearse -- pricing
npm run setup:flagsmith -- pricing-fixed
expected_exit 0 npm run rehearse -- pricing
expected_exit 1 npm run explore -- onboarding team new_onboarding,save_onboarding_progress
node scripts/verify-integration.ts
