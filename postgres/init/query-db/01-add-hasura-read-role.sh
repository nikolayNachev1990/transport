#!/bin/bash
# query-db is the one genuine cross-service access case: Hasura reads it
# (PLAN-backend.md's "Четене: само през Hasura над query_db") without
# owning it. Same dedicated-role-plus-revoked-PUBLIC pattern proven with
# fleet_service -> auth_db, applied here on top of query_service's own
# ownership of this instance.
set -euo pipefail

# psql defaults to a database named after --username when --dbname is
# omitted, not $POSTGRES_DB — found for real (query-db failed to init
# with 'database "query_service" does not exist" until this was explicit).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER hasura WITH PASSWORD '$HASURA_DB_PASSWORD';
  GRANT CONNECT ON DATABASE query_db TO hasura;
  GRANT USAGE ON SCHEMA public TO hasura;
EOSQL
