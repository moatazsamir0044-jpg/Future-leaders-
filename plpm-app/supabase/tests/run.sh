#!/usr/bin/env bash
# Build a throwaway PostgreSQL database from supabase/migrations and assert the
# RLS policies and workflow triggers behave. Requires a running PostgreSQL that
# the current user can create databases on; honours the usual PG* env vars.
#
#   ./supabase/tests/run.sh
set -euo pipefail

DB="${PLPM_TEST_DB:-plpm_test}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations="$here/../migrations"

echo "==> rebuilding $DB"
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB;" -c "create database $DB;" postgres

echo "==> applying Supabase shim"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$here/_supabase_shim.sql"

echo "==> applying migrations"
for f in "$migrations"/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done

echo "==> running policy tests"
# NOTICEs carry the PASS lines; a failed expectation raises and ON_ERROR_STOP aborts.
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$here/rls_policies.test.sql" 2>&1 \
  | sed -n 's/.*NOTICE:  //p'

echo "==> ok"
