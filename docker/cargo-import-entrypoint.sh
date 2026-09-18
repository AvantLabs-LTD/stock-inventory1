#!/bin/sh
set -eu

test -n "${DATABASE_NAME:-}" || { echo "DATABASE_NAME is required" >&2; exit 2; }
test -f /import/source/custom.db || { echo "Mount a read-only Logix snapshot at /import/source" >&2; exit 2; }
database_password="$(cat "${DATABASE_PASSWORD_FILE:?DATABASE_PASSWORD_FILE is required}")"
export DATABASE_URL="postgresql://${DATABASE_USER:?DATABASE_USER is required}:${database_password}@${DATABASE_HOST:?DATABASE_HOST is required}:5432/${DATABASE_NAME}?schema=public"

exec node scripts/cargo-import.mjs /import/source "$@"
