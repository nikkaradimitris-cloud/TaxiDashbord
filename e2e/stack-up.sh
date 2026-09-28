#!/usr/bin/env bash
# Ξεκινά Docker και τοπικό Supabase (βάση δοκιμών), αν δεν τρέχουν ήδη.
# Στο cloud περιβάλλον του Claude το Docker δεν ξεκινά μόνο του μετά από επανεκκίνηση.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=e2e/.logs
mkdir -p "$LOGS"

if ! docker info >/dev/null 2>&1; then
  if command -v dockerd >/dev/null 2>&1; then
    rm -f /var/run/docker/containerd/containerd.pid /var/run/docker.pid
    (nohup dockerd >"$LOGS/dockerd.log" 2>&1 &)
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
fi
docker info >/dev/null 2>&1 || { echo "Το Docker δεν ξεκίνησε (δείτε $LOGS/dockerd.log)."; exit 1; }

healthy() {
  curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health 2>/dev/null | grep -q 200 &&
    docker exec supabase_db_TaxiDashbord pg_isready -U postgres >/dev/null 2>&1
}

if ! healthy; then
  # Μόνο ό,τι χρειάζεται η εφαρμογή: βάση, auth, API και Mailpit (email επιβεβαίωσης).
  SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io timeout 900 npx supabase start \
    -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
    >"$LOGS/supabase-start.log" 2>&1 || true
  for _ in $(seq 1 60); do healthy && break; sleep 2; done
fi
healthy || { echo "Το τοπικό Supabase δεν ξεκίνησε (δείτε $LOGS/supabase-start.log)."; exit 1; }
echo "Τοπικό Supabase: έτοιμο"
