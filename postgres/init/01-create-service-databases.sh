#!/bin/bash
# BRIEF.md rule #1: no service reads another service's database. Enforced
# here, at the Postgres level, not by discipline — each service gets its
# own database AND its own login role, and PUBLIC's implicit CONNECT is
# revoked so only that role (and the superuser) can even open a
# connection to it. A role's implicit ownership privileges (not the
# revoked PUBLIC grant) are what let it keep connecting to its own
# database — verified for real in stage 10, not assumed.
set -euo pipefail

create_service_db() {
  local role="$1"
  local db="$2"
  local password="$3"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER $role WITH PASSWORD '$password';
    CREATE DATABASE $db OWNER $role;
    REVOKE CONNECT ON DATABASE $db FROM PUBLIC;
EOSQL
}

create_service_db auth_service    auth_db    "$AUTH_DB_PASSWORD"
create_service_db fleet_service   fleet_db   "$FLEET_DB_PASSWORD"
create_service_db order_service   order_db   "$ORDER_DB_PASSWORD"
create_service_db billing_service billing_db "$BILLING_DB_PASSWORD"
create_service_db files_service   files_db   "$FILES_DB_PASSWORD"
create_service_db track_service   track_db   "$TRACK_DB_PASSWORD"
create_service_db routing_service routing_db "$ROUTING_DB_PASSWORD"
create_service_db notify_service  notify_db  "$NOTIFY_DB_PASSWORD"
create_service_db ai_service      ai_db      "$AI_DB_PASSWORD"
create_service_db query_service   query_db   "$QUERY_DB_PASSWORD"

# Hasura needs somewhere to store its OWN operational state (hdb_catalog:
# tracked tables, permissions, event/cron bookkeeping) — by default that
# lives inside whichever database HASURA_GRAPHQL_DATABASE_URL points at,
# which would mean Hasura creating and owning a schema inside query_db, a
# database query-service owns (PLAN-backend.md's own "отделна база на
# услуга" rule, and "hasura: четене от query_db... писане: НЕ" — Hasura
# isn't supposed to write there at all). So Hasura gets its own database
# for that via HASURA_GRAPHQL_METADATA_DATABASE_URL, owned outright by
# its own role, and a SEPARATE, read-only-scoped grant onto query_db
# (CONNECT + schema USAGE, no CREATE, no table grants — those come in
# stage 22 once query-service actually has tables to track). Verified for
# real against a live Hasura container: with this split, Hasura's catalog
# initializes cleanly in hasura_metadata_db and /healthz comes back 200
# with zero privilege errors against query_db.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE USER hasura WITH PASSWORD '$HASURA_DB_PASSWORD';
  CREATE DATABASE hasura_metadata_db OWNER hasura;
  REVOKE CONNECT ON DATABASE hasura_metadata_db FROM PUBLIC;
  GRANT CONNECT ON DATABASE query_db TO hasura;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname query_db <<-EOSQL
  GRANT USAGE ON SCHEMA public TO hasura;
EOSQL
