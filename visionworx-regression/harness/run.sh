#!/usr/bin/env bash
# TEST HARNESS ONLY — runs the pricing-inheritance regression suite against a
# REAL database boundary: Supabase Postgres 17.6 (same major/minor as
# production) + every VisionWorx360 Pro migration + PostgREST 12.
#
#   usage: harness/run.sh <visionworx-checkout> [vitest args...]
#
# Nothing here talks to the production database. Containers are local and
# throwaway. The suite files are copied into the checkout under
# src/tests/integration/pricingInheritance/ so they import the real production
# modules through the project's "@/..." alias.
set -euo pipefail
VW="$(cd "${1:?path to VisionWorx360 Pro checkout}" && pwd)"; shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

PG_IMAGE="supabase/postgres:17.6.1.175"
REST_IMAGE="postgrest/postgrest:v12.2.12"
PG_PORT="${VW_IT_PG_PORT:-54329}"
REST_PORT="${VW_IT_REST_PORT:-54330}"
JWT_SECRET="vw-it-local-jwt-secret-at-least-32-characters-long"
export PGPASSWORD=postgres

docker network create vwnet >/dev/null 2>&1 || true
docker rm -f vwpg vwrest >/dev/null 2>&1 || true
docker run -d --name vwpg --network vwnet -e POSTGRES_PASSWORD=postgres -p "$PG_PORT:5432" "$PG_IMAGE" >/dev/null
for _ in $(seq 1 90); do
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres -Atc "select 1" >/dev/null 2>&1 && break; sleep 2
done
sleep 3

"$HERE/apply-migrations.sh" "$VW" -h 127.0.0.1 -p "$PG_PORT" -d postgres 2>&1 | grep -v NOTICE

psql -h 127.0.0.1 -p "$PG_PORT" -U supabase_admin -d postgres -qc "ALTER ROLE authenticator WITH LOGIN PASSWORD 'authpass'"
docker run -d --name vwrest --network vwnet -p "$REST_PORT:3000" \
  -e PGRST_DB_URI="postgres://authenticator:authpass@vwpg:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" "$REST_IMAGE" >/dev/null
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$REST_PORT/" >/dev/null && break; sleep 1; done

mkdir -p "$VW/src/tests/integration/pricingInheritance"
# Copy the suite, dropping the host-repo "@ts-nocheck" guard line so the files
# are type-checked normally inside VisionWorx.
for f in "$ROOT"/src/tests/integration/pricingInheritance/*.ts; do
  sed '1{/^\/\/ @ts-nocheck -- HOST-REPO GUARD ONLY/d}' "$f" > "$VW/src/tests/integration/pricingInheritance/$(basename "$f")"
done

cd "$VW"
VW_IT_POSTGREST_URL="http://127.0.0.1:$REST_PORT" \
VW_IT_JWT_SECRET="$JWT_SECRET" \
VW_IT_PG_URL="postgres://supabase_admin:postgres@127.0.0.1:$PG_PORT/postgres" \
  npx vitest run src/tests/integration/pricingInheritance "$@"
