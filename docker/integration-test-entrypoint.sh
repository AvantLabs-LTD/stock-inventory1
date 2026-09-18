#!/bin/sh
set -eu

case "${DATABASE_NAME:-}" in
  flux_test_*) ;;
  *) echo "Refusing to run integration tests outside a flux_test_* database" >&2; exit 2 ;;
esac

database_password="$(cat "${DATABASE_PASSWORD_FILE:?DATABASE_PASSWORD_FILE is required}")"
export DATABASE_URL="postgresql://${DATABASE_USER:?DATABASE_USER is required}:${database_password}@${DATABASE_HOST:?DATABASE_HOST is required}:5432/${DATABASE_NAME}?schema=public"

node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts
