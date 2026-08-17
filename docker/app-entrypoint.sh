#!/bin/sh
set -eu

database_password="$(cat "${DATABASE_PASSWORD_FILE:?DATABASE_PASSWORD_FILE is required}")"
jwt_secret="$(cat "${JWT_SECRET_FILE:?JWT_SECRET_FILE is required}")"

export DATABASE_URL="postgresql://${DATABASE_USER:?DATABASE_USER is required}:${database_password}@${DATABASE_HOST:?DATABASE_HOST is required}:5432/${DATABASE_NAME:?DATABASE_NAME is required}?schema=public"
export NEXTAUTH_SECRET="${jwt_secret}"

exec "$@"
