#!/usr/bin/env bash
# Πλήρης αυτόματος έλεγχος σε ΤΟΠΙΚΗ βάση δοκιμών στο Docker: δεν αγγίζει την κανονική εφαρμογή
# ούτε τη βάση της. Βήματα: βάση δοκιμών από την αρχή → tests της βάσης (pgTAP) → build με τα
# στοιχεία της τοπικής βάσης → server στη θύρα 3000 → όλοι οι έλεγχοι του e2e/run.mjs στον browser.
# Εικόνες στο e2e/shots/.
#
#   bash e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=e2e/.logs
mkdir -p "$LOGS"
PORT=3000

if curl -s -o /dev/null "http://localhost:$PORT/login"; then
  echo "Η θύρα $PORT χρησιμοποιείται ήδη: σταματήστε πρώτα τον άλλο server."
  exit 1
fi

[ -d node_modules ] || npm ci --no-audit --no-fund >"$LOGS/npm.log" 2>&1
[ -d e2e/node_modules ] || npm ci --prefix e2e --no-audit --no-fund >"$LOGS/npm-e2e.log" 2>&1

bash e2e/stack-up.sh
echo "Βάση δοκιμών από την αρχή (migrations του έργου)…"
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase db reset >"$LOGS/db-reset.log" 2>&1
# Tests της βάσης (pgTAP): θέλουν άδεια βάση, γι' αυτό τρέχουν πριν από τους ελέγχους στον browser.
echo "Tests της βάσης…"
npx supabase test db >"$LOGS/db-test.log" 2>&1 || { tail -20 "$LOGS/db-test.log"; exit 1; }
grep -E '^(Files|Result)' "$LOGS/db-test.log" || true

# Στοιχεία της τοπικής βάσης (όχι της κανονικής): περνούν στο build πάνω από το .env.local.
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY|MAILPIT_URL)=')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
export MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:54324}"

echo "Build της εφαρμογής…"
npx next build >"$LOGS/build.log" 2>&1 || { tail -20 "$LOGS/build.log"; exit 1; }

node node_modules/next/dist/bin/next start -p "$PORT" -H localhost >"$LOGS/server.log" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:$PORT/login" && break
  sleep 1
done

echo "Έλεγχοι…"
BASE_URL="http://localhost:$PORT" node e2e/run.mjs "$@"
