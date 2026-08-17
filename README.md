# Store Management and Purchase Portal

This repository is transitioning from its legacy SQLite inventory prototype to a PostgreSQL-backed store-management and purchasing portal.

## Run the complete stack

Requirements:

- Docker Desktop or another Docker Engine with Docker Compose v2
- No local Node.js, PostgreSQL, or package installation is required

Start the application and its PostgreSQL database:

```sh
docker compose up --build -d
```

The application is available at <http://localhost:3000>. On first startup, the stack:

1. Generates a database password, JWT signing secret, and administrator password.
2. Stores those values in a private persistent Docker volume.
3. Creates the PostgreSQL database.
4. Applies all committed Prisma migrations.
5. Creates the initial administrator if it does not already exist.
6. Starts the application only after migration and bootstrap succeed.

The default administrator email is `admin@localhost`. Retrieve its generated password with:

```sh
docker compose run --rm init-secrets
docker compose run --rm --entrypoint sh migrate -c "cat /run/app-secrets/bootstrap_admin_password"
```

The password is generated only once. Subsequent starts do not reset an existing administrator.

To choose the initial administrator identity or password, set these variables before the first startup:

```sh
BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
BOOTSTRAP_ADMIN_NAME="System Administrator" \
BOOTSTRAP_ADMIN_PASSWORD="use-a-long-unique-password" \
docker compose up --build -d
```

On PowerShell:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:BOOTSTRAP_ADMIN_NAME = "System Administrator"
$env:BOOTSTRAP_ADMIN_PASSWORD = "use-a-long-unique-password"
docker compose up --build -d
```

`APP_PORT` can override the host port, for example `APP_PORT=8080`.

## Operations

View service state and logs:

```sh
docker compose ps
docker compose logs -f app
```

Stop the stack while preserving data and secrets:

```sh
docker compose down
```

Apply newly committed migrations by rebuilding and starting normally:

```sh
docker compose up --build -d
```

The one-shot `migrate` service runs before the application and uses `prisma migrate deploy`.

## Data persistence and backup

PostgreSQL data and generated secrets are held in the named volumes `postgres-data` and `runtime-secrets`. Do not delete only the secrets volume while retaining the database volume because the generated database password is stored there.

Create a logical database backup:

```sh
docker compose exec -T database pg_dump -U store_app -d store_management -Fc > store-management.backup
```

Never run `docker compose down -v` unless permanent deletion of the database and generated credentials is intended.

## Security

- No passwords or JWT secrets are committed to the repository.
- PostgreSQL is available only on the internal Compose network; it has no published host port.
- The application container runs as an unprivileged user.
- Authentication secrets must contain at least 32 characters.
- The stack health check verifies both the web server and its database connection.
- Upload endpoints must enforce the agreed 5 MB limit and validate file signatures when attachments are implemented.

The old local `.env`, `auth-state.json`, and SQLite database are ignored by Git. They are retained locally for later controlled data reconciliation but are not copied into container images.

## Development commands

All checks can run through the build container; a host Node.js installation is optional:

```sh
docker build --target builder -t store-management-builder .
docker run --rm store-management-builder npm run lint
docker run --rm store-management-builder npm run typecheck
```

Prisma schema changes must be committed as migrations. `prisma db push --accept-data-loss` is intentionally not part of the project scripts.
