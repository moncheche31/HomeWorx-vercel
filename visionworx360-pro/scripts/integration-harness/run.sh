#!/usr/bin/env bash
# TEST HARNESS ONLY — runs the pricing-inheritance regression suite against a
# REAL database boundary: Supabase Postgres 17.6 (same major/minor as the
# Lovable Cloud production database) + every migration in supabase/migrations
# + PostgREST 12.
#
#   usage: scripts/integration-harness/run.sh [vitest args...]
#
# Nothing here talks to a hosted database. Containers are local and throwaway.
# Requires Docker, psql and installed node_modules.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VW="$(cd "$HERE/../.." && pwd)"

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

cd "$VW"
VW_IT_POSTGREST_URL="http://127.0.0.1:$REST_PORT" \
VW_IT_JWT_SECRET="$JWT_SECRET" \
VW_IT_PG_URL="postgres://supabase_admin:postgres@127.0.0.1:$PG_PORT/postgres" \
  npx vitest run --config vitest.integration.config.ts "$@"
