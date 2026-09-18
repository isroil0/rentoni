#!/usr/bin/env bash
#
# Deploy the Rentoni backend to the shared box. Run from your Mac:
#
#     bash deploy-backend.sh production            # build, upload, migrate, restart
#     bash deploy-backend.sh staging
#     bash deploy-backend.sh production --status   # change nothing, just report
#     bash deploy-backend.sh production --logs     # tail that service's journal
#     bash deploy-backend.sh production --rollback # switch back to the previous release
#
# This box is SHARED -- it runs coreflow, rankly, oceanicyork, alivero,
# mahalla-ai, edub, parla, plate and more. Everything here is additive and
# namespaced to rentoni: its own /opt dirs, its own systemd units, its own
# nginx vhosts, its own database files. Nothing belonging to another app is
# touched, and neither is the Rentoni frontend (see deploy-frontend.sh).
#
# The two environments share the VM and nothing else: separate ports,
# services, env files, SQLite database files, logs and nginx vhosts.
# First-time provisioning is documented in deploy.md -- this script deploys,
# it does not create the server-side scaffolding.
#
# The API lives at https://rentoni.uz/api -- one hostname, one vhost, no API
# subdomain. The storefront calls the relative path /api, so the browser is
# always same-origin and CORS never enters the picture.
#
# Note api.rentoni.uz is NOT ours: it already resolves to a live, unrelated
# "Klinika API" on this same box, and claiming that server_name would break it.
#
# Unlike a Go service this ships a Node application, so a release is
# dist/ + prisma/ + a lockfile, and `npm ci --omit=dev` runs on the box. The
# Prisma CLI is a runtime dependency precisely so `migrate deploy` works there.
#
set -euo pipefail

SERVER_IP=169.58.153.42
SERVER_USER=root
TMP_TAR=/tmp/rentoni-backend-deploy.tar.gz

say()  { printf '\n\033[1;36m=== %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"

# ── target ───────────────────────────────────────────────────────────────────
TARGET="${1:-}"
MODE="${2:-deploy}"
case "$TARGET" in
    staging)
        APP_ENV=staging
        DIR=/opt/rentoni-api-staging
        SERVICE=rentoni-api-staging
        ENV_FILE=.env.staging
        PORT=8102
        DB_FILE=staging.db
        URL=https://staging.rentoni.uz
        ;;
    production|prod)
        APP_ENV=production
        DIR=/opt/rentoni-api-prod
        SERVICE=rentoni-api-prod
        ENV_FILE=.env.production
        PORT=8101
        DB_FILE=prod.db
        URL=https://rentoni.uz
        ;;
    *)
        die "usage: bash deploy-backend.sh {staging|production} [--status|--logs|--rollback]"
        ;;
esac

case "$MODE" in
    deploy|--status|--logs|--rollback) ;;
    *) die "unknown option: $MODE" ;;
esac

# Same guard as deploy-frontend.sh: never let a typo point this at another
# app's directory, because the remote half writes into it.
case "$DIR" in
    /opt/rentoni-api-staging|/opt/rentoni-api-prod) ;;
    *) die "REFUSING: DIR ($DIR) is not a Rentoni backend directory" ;;
esac

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}")
SCP=(scp "${SSH_OPTS[@]}")
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o PasswordAuthentication=no \
    "$SERVER_USER@$SERVER_IP" true 2>/dev/null || die "no SSH key access to $SERVER_IP"

# ── read-only modes ──────────────────────────────────────────────────────────
if [[ $MODE == --status ]]; then
    say "Rentoni backend — $APP_ENV"
    "${SSH[@]}" "$SERVER_USER@$SERVER_IP" \
        "DIR=$DIR SERVICE=$SERVICE PORT=$PORT DB_FILE=$DB_FILE ENV_FILE=$ENV_FILE bash -s" <<'REMOTE'
set -uo pipefail
echo "  service:  $(systemctl is-active $SERVICE.service) / $(systemctl is-enabled $SERVICE.service) (must be active/enabled)"
echo "  release:  $(readlink -f $DIR/current 2>/dev/null | xargs basename 2>/dev/null || echo '?')"
echo "  node:     $(node --version 2>/dev/null || echo 'not installed')"
echo "  port:     127.0.0.1:$PORT  ($(ss -tln | grep -c ":$PORT " ) listener)"
echo -n "  health:   "; curl -s --max-time 5 http://127.0.0.1:$PORT/api/health || echo '(no response)"'
echo
# The database lives outside the release directories on purpose: releases are
# rotated and deleted, and the data must not go with them.
if [[ -f "$DIR/data/$DB_FILE" ]]; then
    echo "  database: $DIR/data/$DB_FILE ($(du -h "$DIR/data/$DB_FILE" | cut -f1))"
    echo "  schema:   $(sudo -u rentoni sqlite3 "$DIR/data/$DB_FILE" 'select migration_name from _prisma_migrations order by finished_at desc limit 1' 2>/dev/null || echo '?')"
else
    echo "  database: MISSING ($DIR/data/$DB_FILE)"
fi
echo "  releases: $(ls -1 $DIR/releases 2>/dev/null | tr '\n' ' ')"
REMOTE
    exit 0
fi

if [[ $MODE == --logs ]]; then
    "${SSH[@]}" "$SERVER_USER@$SERVER_IP" "journalctl -u $SERVICE.service -n 80 --no-pager"
    exit 0
fi

if [[ $MODE == --rollback ]]; then
    say "Rolling back $APP_ENV to the previous release"
    warn "this switches the RELEASE only; it does not revert migrations"
    "${SSH[@]}" "$SERVER_USER@$SERVER_IP" "DIR=$DIR SERVICE=$SERVICE PORT=$PORT bash -s" <<'REMOTE'
set -euo pipefail
CURRENT=$(readlink -f "$DIR/current" | xargs basename)
PREV=$(ls -1 "$DIR/releases" | sort | grep -v "^$CURRENT$" | tail -1)
[[ -n "$PREV" ]] || { echo "  no previous release to roll back to"; exit 1; }
echo "  $CURRENT -> $PREV"
ln -sfn "$DIR/releases/$PREV" "$DIR/current"
systemctl restart "$SERVICE.service"
sleep 3
systemctl is-active "$SERVICE.service"
curl -s --max-time 5 "http://127.0.0.1:$PORT/api/health"; echo
REMOTE
    exit 0
fi

# ── verify before building ───────────────────────────────────────────────────
# The Go original gates on gofmt/vet/test. The equivalent here is a type check
# and the full suite, which boots a real API against a throwaway database.
say "Verifying"
npx tsc --noEmit || die "typecheck failed"
npx vitest run >/tmp/rentoni-test.log 2>&1 || { tail -30 /tmp/rentoni-test.log; die "tests failed"; }
ok "typecheck and $(grep -oE 'Tests +[0-9]+ passed' /tmp/rentoni-test.log | tail -1 | grep -oE '[0-9]+') tests pass"

# ── build ────────────────────────────────────────────────────────────────────
VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)
if git rev-parse HEAD >/dev/null 2>&1 && ! git diff-index --quiet HEAD -- 2>/dev/null; then
    warn "working tree is dirty — deploying $VERSION plus uncommitted changes"
    VERSION="$VERSION-dirty"
fi

say "Building $VERSION"
rm -rf dist
npm run build >/dev/null || die "build failed"
[[ -f dist/server.js ]] || die "build produced no dist/server.js"
ok "$(du -sh dist | cut -f1) of compiled JavaScript"

# A release is everything the box needs to `npm ci --omit=dev` and run:
# compiled output, the Prisma schema and migrations, and the exact lockfile.
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD" "$TMP_TAR"' EXIT
cp -R dist "$BUILD/dist"
cp -R prisma "$BUILD/prisma"
cp package.json package-lock.json "$BUILD/"
cp -R docs "$BUILD/docs"          # openapi.yaml is served at /docs by the app
printf '%s\n' "$VERSION" > "$BUILD/VERSION"

tar -czf "$TMP_TAR" -C "$BUILD" .
say "Uploading to $SERVER_IP"
"${SCP[@]}" -q "$TMP_TAR" "$SERVER_USER@$SERVER_IP:$TMP_TAR"
ok "uploaded $(du -h "$TMP_TAR" | cut -f1)"

# ── deploy ───────────────────────────────────────────────────────────────────
say "Deploying $APP_ENV"
"${SSH[@]}" "$SERVER_USER@$SERVER_IP" \
    "DIR=$DIR SERVICE=$SERVICE PORT=$PORT DB_FILE=$DB_FILE ENV_FILE=$ENV_FILE APP_ENV=$APP_ENV bash -s" <<'REMOTE'
set -euo pipefail
TMP_TAR=/tmp/rentoni-backend-deploy.tar.gz

case "$DIR" in /opt/rentoni-api-staging|/opt/rentoni-api-prod) ;; *) echo "refusing: bad DIR"; exit 1 ;; esac
[[ -f "$DIR/$ENV_FILE" ]] || { echo "  ✗ $DIR/$ENV_FILE is missing — see deploy.md"; exit 1; }
command -v node >/dev/null || { echo "  ✗ node is not installed — see deploy.md"; exit 1; }

# Refuse to deploy onto a port another application already owns. On a shared
# box a port collision is silent until two services fight over it.
OWNER=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'users:\(\("[^"]+' | grep -oE '[^"]+$' | head -1 || true)
if [[ -n "$OWNER" && "$OWNER" != "node" ]]; then
    echo "  ✗ REFUSING: port $PORT is already held by '$OWNER', not this service"
    exit 1
fi

# The env file decides which database is touched. Confirm it matches the
# environment being deployed before running migrations against it.
CONFIGURED_DB=$(grep -oE 'DATABASE_URL="?file:[^"]*' "$DIR/$ENV_FILE" | sed -E 's#.*/##')
if [[ "$CONFIGURED_DB" != "$DB_FILE" ]]; then
    echo "  ✗ REFUSING: $ENV_FILE points at '$CONFIGURED_DB' but this is the $APP_ENV deploy (expected '$DB_FILE')"
    exit 1
fi
echo "  target database: $CONFIGURED_DB ✓"

# Unpack into a timestamped release and swap the `current` symlink. The old
# release stays on disk so --rollback is one symlink change.
STAMP=$(date +%Y%m%d-%H%M%S)
REL="$DIR/releases/$STAMP"
mkdir -p "$REL" "$DIR/data"
tar -xzf "$TMP_TAR" -C "$REL"
echo "  release $STAMP unpacked (version $(cat "$REL/VERSION"))"

# Runtime dependencies only. The Prisma CLI is among them by design, so the
# migrate step below does not need the dev toolchain on the server.
# Invoke the CLI by its path inside the release rather than through npx: npx
# resolves the binary but not the project context (it reports @prisma/client as
# missing), and the service user has no reason to have npx on its PATH.
PRISMA="$REL/node_modules/.bin/prisma"

echo "  installing dependencies:"
(cd "$REL" && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3 | sed 's/^/    /')
[[ -x "$PRISMA" ]] || { echo "  ✗ prisma CLI missing from the release — is it still a devDependency?"; exit 1; }
(cd "$REL" && "$PRISMA" generate 2>&1 | grep -E 'Generated|Error' | sed 's/^/    /')

chown -R rentoni:rentoni "$REL"

# Back up production before migrating it. Staging is disposable.
# `.backup` takes a consistent snapshot even while the service is serving.
if [[ "$APP_ENV" == production && -f "$DIR/data/$DB_FILE" ]]; then
    mkdir -p /root/rentoni-backups && chmod 700 /root/rentoni-backups
    DUMP="/root/rentoni-backups/${DB_FILE%.db}-${STAMP}.db.gz"
    sudo -u rentoni sqlite3 "$DIR/data/$DB_FILE" ".backup '/tmp/rentoni-backup-$STAMP.db'"
    gzip -c "/tmp/rentoni-backup-$STAMP.db" > "$DUMP"
    rm -f "/tmp/rentoni-backup-$STAMP.db"
    chmod 600 "$DUMP"
    echo "  backup: $DUMP ($(du -h "$DUMP" | cut -f1))"
fi

echo "  migrating:"
(cd "$REL" && sudo -u rentoni env $(grep -vE '^\s*#' "$DIR/$ENV_FILE" | grep -vE '^\s*$' | xargs -d '\n') \
    "$PRISMA" migrate deploy 2>&1 \
    | grep -vE '^$|^Prisma schema loaded|^Datasource' | sed 's/^/    /')

ln -sfn "$REL" "$DIR/current"
# enable as well as restart: a service that is merely started does not come
# back after a reboot, and nothing about a healthy deploy would reveal that.
systemctl enable "$SERVICE.service" >/dev/null 2>&1
systemctl restart "$SERVICE.service"

# Wait for readiness rather than assuming a started process is a working one.
# The health endpoint runs a query, so a 200 means the database is reachable
# too, not merely that the process is listening.
started=$(date +%s)
for i in $(seq 1 120); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/api/health" || true)
    [[ "$code" == 200 ]] && break
    sleep 1
done
elapsed=$(( $(date +%s) - started ))
if [[ "${code:-}" != 200 ]]; then
    echo "  ✗ $SERVICE did not become ready in ${elapsed}s (last status: ${code:-none})"
    journalctl -u "$SERVICE.service" -n 30 --no-pager | sed 's/^/    /'
    exit 1
fi
echo "  ✓ $SERVICE ready after ${elapsed}s"
if [[ $elapsed -gt 30 ]]; then
    echo "    ! startup took ${elapsed}s; worth knowing why before it takes longer"
fi
curl -s --max-time 5 "http://127.0.0.1:$PORT/api/health" | sed 's/^/    /'; echo

# Keep the five most recent releases. node_modules makes these large, so this
# matters more here than it would for a single static binary.
ls -1 "$DIR/releases" | sort | head -n -5 | while read -r old; do rm -rf "$DIR/releases/$old"; done

rm -f "$TMP_TAR"
REMOTE

say "Checking $URL"
curl -s --max-time 15 "$URL/api/health" | sed 's/^/  health: /'; echo
ok "done — $URL"
