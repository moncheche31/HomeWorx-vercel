#!/usr/bin/env bash
# TEST HARNESS ONLY. Replays every VisionWorx360 Pro migration, in filename
# order (verified identical to production's supabase_migrations order), into a
# throwaway local Supabase Postgres. Stops on the first error.
#
#   usage: apply-migrations.sh <visionworx-checkout> [psql-conn-args...]
set -euo pipefail
VW="${1:?path to VisionWorx360 Pro checkout}"; shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@")
"${PSQL[@]}" -U supabase_admin -f "$HERE/00_supabase_platform_stub.sql" >/dev/null
# Production data-repair blocks that reprice specific live estimates by
# hard-coded id. On an empty database they raise "not found" by design.
# For each listed file ONLY the trailing top-level `DO $$ ... $$;` block is
# dropped; every CREATE/ALTER before it is still applied. Verified by
# inspection: 20260811131405 is a single DO block (reprices estimate
# 1d815f3b...); 20260828134023 defines nce_unit_scale, tag_estimate_book_sources
# and apply_book_line_pricing (applied) then loops over three live estimate ids
# (dropped); 20260828134203 defines nce_book_lookup and apply_book_line_pricing
# (applied) then hand-restores four live estimate lines and reprices three live
# estimates (dropped). Other migrations that mention live ids use plain
# UPDATE/DELETE statements that simply match zero rows here and run unchanged.
DATA_ONLY_PROD_REPAIRS=(
  20260811131405_aecb0c5c-bcbd-44ea-80e1-4ce04edd2a85.sql
  20260828134023_e999eb57-9959-4601-a6dd-4e0f8b6d07b3.sql
  20260828134203_b7a1bca0-0580-411a-bd1a-a582744cc4d2.sql
)
n=0; skipped=0
for f in $(ls "$VW"/supabase/migrations/*.sql | sort); do
  base="$(basename "$f")"
  if [[ "$base" == 20260828125617_* ]]; then
    "${PSQL[@]}" -U postgres -f "$HERE/01_prod_drift_nce_tables.sql" >/dev/null
  fi
  if printf '%s\n' "${DATA_ONLY_PROD_REPAIRS[@]}" | grep -qx "$base"; then
    last_do=$(grep -n '^DO \$\$' "$f" | tail -1 | cut -d: -f1)
    tmp="$(mktemp --suffix=.sql)"; head -n $((last_do - 1)) "$f" > "$tmp"
    echo "applied $base WITHOUT its trailing production data-repair DO block (lines ${last_do}-end)"
    f="$tmp"; skipped=$((skipped+1))
  fi
  if ! out=$("${PSQL[@]}" -U postgres -f "$f" 2>&1); then
    echo "MIGRATION FAILED: $(basename "$f")" >&2; echo "$out" | tail -20 >&2; exit 1
  fi
  n=$((n+1))
done
echo "applied $n migrations, stripped $skipped production data-repair blocks"
