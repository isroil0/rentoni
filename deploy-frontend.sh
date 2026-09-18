#!/usr/bin/env bash
#
# Deploy the Rentoni frontend to the shared box. Run from your Mac:
#
#     bash deploy-frontend.sh production            # build, upload, swap
#     bash deploy-frontend.sh staging
#     bash deploy-frontend.sh production --status   # change nothing, just report
#     bash deploy-frontend.sh production --rollback # switch back to the previous release
#
# This box is SHARED. Everything here is additive and namespaced to rentoni:
# its own /opt dirs and its own nginx vhost. Nothing belonging to another app
# is touched, and neither is the Rentoni backend (see deploy-backend.sh).
#
# The frontend is a static bundle -- there is no service to restart. nginx
# serves $DIR/current, so a release is live the moment the symlink moves, and
# a rollback is that symlink moving back.
#
# The SPA calls /api on its own origin, which nginx proxies to the backend, so
# the browser is never making a cross-origin request and no CORS configuration
# is involved in normal operation.
#
set -euo pipefail

SERVER_IP=169.58.153.42
SERVER_USER=root
TMP_TAR=/tmp/rentoni-frontend-deploy.tar.gz

say()  { printf '\n\033[1;36m=== %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"

TARGET="${1:-}"
MODE="${2:-deploy}"
case "$TARGET" in
    staging)
        APP_ENV=staging
        DIR=/opt/rentoni-web-staging
        URL=https://staging.rentoni.uz
        ;;
    production|prod)
        APP_ENV=production
        DIR=/opt/rentoni-web-prod
        URL=https://rentoni.uz
        ;;
    *)
        die "usage: bash deploy-frontend.sh {staging|production} [--status|--rollback]"
        ;;
esac

case "$MODE" in
    deploy|--status|--rollback) ;;
    *) die "unknown option: $MODE" ;;
esac

case "$DIR" in
    /opt/rentoni-web-staging|/opt/rentoni-web-prod) ;;
    *) die "REFUSING: DIR ($DIR) is not a Rentoni frontend directory" ;;
esac

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}")
SCP=(scp "${SSH_OPTS[@]}")
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o PasswordAuthentication=no \
    "$SERVER_USER@$SERVER_IP" true 2>/dev/null || die "no SSH key access to $SERVER_IP"

if [[ $MODE == --status ]]; then
    say "Rentoni frontend — $APP_ENV"
    "${SSH[@]}" "$SERVER_USER@$SERVER_IP" "DIR=$DIR bash -s" <<'REMOTE'
set -uo pipefail
echo "  release:  $(readlink -f $DIR/current 2>/dev/null | xargs basename 2>/dev/null || echo '?')"
echo "  version:  $(cat $DIR/current/VERSION 2>/dev/null || echo '?')"
echo "  size:     $(du -sh $DIR/current/ 2>/dev/null | cut -f1)"
echo "  index:    $([[ -f $DIR/current/index.html ]] && echo present || echo MISSING)"
echo "  nginx:    $(nginx -t 2>&1 | grep -c 'successful') config ok"
echo "  releases: $(ls -1 $DIR/releases 2>/dev/null | tr '\n' ' ')"
REMOTE
    exit 0
fi

if [[ $MODE == --rollback ]]; then
    say "Rolling back $APP_ENV to the previous release"
    "${SSH[@]}" "$SERVER_USER@$SERVER_IP" "DIR=$DIR bash -s" <<'REMOTE'
set -euo pipefail
CURRENT=$(readlink -f "$DIR/current" | xargs basename)
PREV=$(ls -1 "$DIR/releases" | sort | grep -v "^$CURRENT$" | tail -1)
[[ -n "$PREV" ]] || { echo "  no previous release to roll back to"; exit 1; }
echo "  $CURRENT -> $PREV"
ln -sfn "$DIR/releases/$PREV" "$DIR/current"
echo "  served from $(readlink -f "$DIR/current")"
REMOTE
    exit 0
fi

# ── verify before building ───────────────────────────────────────────────────
# The frontend suite boots a real backend against a throwaway database, so a
# green run here also means the API contract the bundle expects still holds.
say "Verifying"
npm --prefix web run typecheck >/dev/null 2>&1 || die "typecheck failed"
npm --prefix web run lint >/dev/null 2>&1 || die "lint failed"
npm --prefix web run test >/tmp/rentoni-web-test.log 2>&1 || { tail -30 /tmp/rentoni-web-test.log; die "tests failed"; }
ok "typecheck, lint and $(grep -oE 'Tests +[0-9]+ passed' /tmp/rentoni-web-test.log | tail -1 | grep -oE '[0-9]+') tests pass"

# ── build ────────────────────────────────────────────────────────────────────
VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)
if git rev-parse HEAD >/dev/null 2>&1 && ! git diff-index --quiet HEAD -- 2>/dev/null; then
    warn "working tree is dirty — deploying $VERSION plus uncommitted changes"
    VERSION="$VERSION-dirty"
fi

# No VITE_API_URL: the bundle calls /api on its own origin and nginx proxies it.
say "Building $VERSION"
rm -rf web/dist
npm --prefix web run build >/dev/null || die "build failed"
[[ -f web/dist/index.html ]] || die "build produced no web/dist/index.html"
printf '%s\n' "$VERSION" > web/dist/VERSION
ok "$(du -sh web/dist | cut -f1) of static assets"

tar -czf "$TMP_TAR" -C web/dist .
trap 'rm -f "$TMP_TAR"' EXIT
say "Uploading to $SERVER_IP"
"${SCP[@]}" -q "$TMP_TAR" "$SERVER_USER@$SERVER_IP:$TMP_TAR"
ok "uploaded $(du -h "$TMP_TAR" | cut -f1)"

# ── deploy ───────────────────────────────────────────────────────────────────
say "Deploying $APP_ENV"
"${SSH[@]}" "$SERVER_USER@$SERVER_IP" "DIR=$DIR bash -s" <<'REMOTE'
set -euo pipefail
TMP_TAR=/tmp/rentoni-frontend-deploy.tar.gz

case "$DIR" in /opt/rentoni-web-staging|/opt/rentoni-web-prod) ;; *) echo "refusing: bad DIR"; exit 1 ;; esac

STAMP=$(date +%Y%m%d-%H%M%S)
REL="$DIR/releases/$STAMP"
mkdir -p "$REL"
tar -xzf "$TMP_TAR" -C "$REL"
[[ -f "$REL/index.html" ]] || { echo "  ✗ upload contains no index.html"; rm -rf "$REL"; exit 1; }
chown -R www-data:www-data "$REL"
echo "  release $STAMP unpacked (version $(cat "$REL/VERSION"))"

# One symlink swap; nginx picks it up on the next request with no reload.
ln -sfn "$REL" "$DIR/current"
echo "  ✓ serving $(readlink -f "$DIR/current")"

ls -1 "$DIR/releases" | sort | head -n -5 | while read -r old; do rm -rf "$DIR/releases/$old"; done
rm -f "$TMP_TAR"
REMOTE

say "Checking $URL"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/")
echo "  index:   $code"
# The SPA fallback is the thing most likely to be misconfigured: a deep link
# must return the app, not a 404 from the filesystem.
deep=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/admin/inventory")
echo "  /admin/inventory: $deep (SPA fallback)"
api=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/api/health")
echo "  /api/health: $api (proxied to the backend)"
[[ "$code" == 200 && "$deep" == 200 && "$api" == 200 ]] || die "site did not come up cleanly"
ok "done — $URL"
