# Deploying Rentoni

Two scripts, run from your Mac:

```bash
bash deploy-backend.sh production     # API  -> https://rentoni.uz/api
bash deploy-frontend.sh production    # site -> https://rentoni.uz
```

Both refuse to do anything until the server-side scaffolding below exists. That
scaffolding is created **once**, by hand, and this document is the record of it.

## The box is shared

`169.58.153.42` runs coreflow, rankly, oceanicyork, alivero, mahalla-ai, edub,
parla, plate and others. Everything Rentoni owns is namespaced:

| | production | staging |
|---|---|---|
| backend dir | `/opt/rentoni-api-prod` | `/opt/rentoni-api-staging` |
| frontend dir | `/opt/rentoni-web-prod` | `/opt/rentoni-web-staging` |
| service | `rentoni-api-prod` | `rentoni-api-staging` |
| port (localhost only) | `8101` | `8102` |
| database | `/opt/rentoni-api-prod/data/prod.db` | `…-staging/data/staging.db` |
| env file | `/opt/rentoni-api-prod/.env.production` | `…/.env.staging` |
| site | `rentoni.uz`, `www.rentoni.uz` | — |
| api | `rentoni.uz/api` (same vhost) | `staging.rentoni.uz/api` |

Nothing outside those paths is written to. Only production DNS exists today;
staging is defined for parity and needs its own DNS before it can be used.

## DNS

```
rentoni.uz        A  169.58.153.42     ← the site, and the API under /api
www.rentoni.uz    A  169.58.153.42
v1.rentoni.uz     A  169.58.153.42     ← resolves, currently unused
api.rentoni.uz    A  169.58.153.42     ← NOT OURS, see below
```

Only the first two are used. `rentoni.uz` and `www.rentoni.uz` are unclaimed on
the box — requests for them currently fall through to nginx's `default_server`,
which is the Rankly admin panel. **That is why rentoni.uz does not open today:**
the browser asks for rentoni.uz, Rankly's vhost answers, and the certificate it
presents says `admin-rankly.abduazim.com`, so Chrome refuses the connection with
`ERR_CERT_COMMON_NAME_INVALID`. Nothing is broken — Rentoni was simply never
deployed. Step 6 and step 8 below are the fix.

## Do not touch api.rentoni.uz

That hostname resolves to this same box and is **already served by a live,
unrelated application** — a FastAPI service identifying itself as "Klinika
API", with its own valid certificate:

```
$ curl https://api.rentoni.uz/health
{"status":"ok"}
$ curl -s https://api.rentoni.uz/openapi.json | jq .info.title
"Klinika API"
```

An nginx vhost with `server_name api.rentoni.uz` would collide with it: nginx
logs `conflicting server name`, one vhost wins arbitrarily, and the loser starts
answering the wrong requests — a live outage for whichever lost.

**Rentoni's API is at `https://rentoni.uz/api`.** Nothing here references
`api.rentoni.uz`, and nothing should until Klinika has been moved off it.

## One hostname, one vhost

There is no API subdomain. `rentoni.uz` serves the built SPA and proxies `/api`
to the backend on localhost:

| path | served by |
|---|---|
| `https://rentoni.uz/` | the static bundle |
| `https://rentoni.uz/api/…` | the backend, proxied to `127.0.0.1:8101` |
| `https://rentoni.uz/docs` | the backend's OpenAPI UI |

The frontend bundle calls the relative path `/api`, so the browser is always
same-origin: no preflights, no CORS in the critical path of ordinary shopping,
and one certificate to renew instead of two.

---

# One-time provisioning

Run as root on the box.

## 1. Confirm the ports and hostnames are free

Do this first. A collision on a shared machine is silent until two services
fight over it, and the deploy script will refuse to continue if something else
already holds the port.

```bash
ss -tlnp | grep -E ':(8101|8102) ' || echo "8101 and 8102 are free"
```

If either is taken, pick another pair and change `PORT=` in
`deploy-backend.sh` and the nginx `proxy_pass` lines together.

Check that no existing vhost already claims the hostnames we are about to add.
Anything listed here must be resolved before continuing, or the new vhost will
fight with the old one:

```bash
grep -rlE 'server_name[^;]*\b(rentoni\.uz|www\.rentoni\.uz)\b' /etc/nginx/sites-enabled/ \
  || echo "rentoni.uz and www.rentoni.uz are unclaimed"

# For reference: this is the vhost that owns api.rentoni.uz. Leave it alone.
grep -rlE 'server_name[^;]*\bapi\.rentoni\.uz\b' /etc/nginx/sites-enabled/
```

Both of ours were unclaimed as of writing.

## 2. Runtime prerequisites

```bash
node --version            # needs >= 20; the app is built and tested on 26
sqlite3 --version         # used for consistent pre-migration backups
nginx -v
certbot --version
```

Install whatever is missing (Node via NodeSource, the rest via apt). Node is
likely already present for another app — check before installing a second copy.

## 3. Service account and directories

The service account owns the release directories and the database. It has no
login shell: nothing needs to log in as it.

```bash
id rentoni >/dev/null 2>&1 || useradd --system --home /opt/rentoni-api-prod --shell /usr/sbin/nologin rentoni

mkdir -p /opt/rentoni-api-prod/{releases,data}
mkdir -p /opt/rentoni-web-prod/releases
chown -R rentoni:rentoni /opt/rentoni-api-prod
chown -R www-data:www-data /opt/rentoni-web-prod

# The database directory must be writable: SQLite creates -wal and -shm
# siblings next to the database file, not just the file itself.
chmod 750 /opt/rentoni-api-prod/data
```

## 4. Environment file

Secrets must be at least 32 characters — the app refuses to boot in production
otherwise, rather than starting with a weak signing key.

```bash
cat > /opt/rentoni-api-prod/.env.production <<EOF
NODE_ENV=production
PORT=8101
API_PREFIX=/api

DATABASE_URL="file:/opt/rentoni-api-prod/data/prod.db"

JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
ACCESS_TOKEN_TTL_MIN=30
REFRESH_TOKEN_TTL_DAYS=7
BCRYPT_ROUNDS=12

# The storefront is same-origin, so nothing in normal use is governed by this.
# It only matters for non-browser clients and anything you later point at the
# API. In production the allowlist is the only thing that grants access --
# there is no private-network fallback outside development.
CORS_ORIGINS="https://rentoni.uz,https://www.rentoni.uz"

RATE_LIMIT_WINDOW_MIN=15
RATE_LIMIT_MAX=600
AUTH_RATE_LIMIT_MAX=20

# Used once, to create the first SUPER_ADMIN (step 9). Clear it afterwards.
ADMIN_SETUP_TOKEN="$(openssl rand -hex 24)"
EOF

chown rentoni:rentoni /opt/rentoni-api-prod/.env.production
chmod 600 /opt/rentoni-api-prod/.env.production
```

Note the `SUPER_ADMIN_*` variables from `.env.example` are deliberately absent:
they are only read by the seed script, which must never run here.

## 5. systemd unit

```bash
cat > /etc/systemd/system/rentoni-api-prod.service <<'EOF'
[Unit]
Description=Rentoni API (production)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=rentoni
Group=rentoni
WorkingDirectory=/opt/rentoni-api-prod/current
EnvironmentFile=/opt/rentoni-api-prod/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3

# The service needs to write exactly one directory: the one holding the
# database. Everything else on the filesystem is read-only to it.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/rentoni-api-prod/data

StandardOutput=journal
StandardError=journal
SyslogIdentifier=rentoni-api-prod

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
```

Do not start it yet — there is no release to run until the first deploy.

## 6. nginx: the site

`rentoni.uz` serves the built SPA and proxies `/api` to the backend on
localhost. Because the API is same-origin from the browser's point of view,
normal traffic involves no CORS at all.

```bash
cat > /etc/nginx/sites-available/rentoni.uz <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name rentoni.uz www.rentoni.uz;
    root /opt/rentoni-web-prod/current;
    index index.html;

    access_log /var/log/nginx/rentoni.uz.access.log;
    error_log  /var/log/nginx/rentoni.uz.error.log;

    client_max_body_size 2m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Hashed filenames, so they can be cached indefinitely.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # index.html must never be cached, or a deploy leaves browsers pinned to
    # asset URLs that no longer exist.
    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8101;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # The app trusts one proxy hop and rate-limits per client IP, so this
        # header is what makes the limiter see real clients instead of nginx.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Client-side routing: any unknown path is the app's to resolve.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/rentoni.uz /etc/nginx/sites-enabled/rentoni.uz
```

## 7. Check the config before reloading

There is deliberately no second vhost: the API is served from the site's own
origin via the `/api/` block above.

`nginx -t` checks **every** enabled vhost on the box, so a syntax error here
would also block reloads for the other applications. A `conflicting server name`
warning means a hostname is claimed twice, which is the failure mode this whole
section exists to avoid:

```bash
nginx -t
nginx -T 2>/dev/null | grep -c 'conflicting server name'   # must be 0
systemctl reload nginx
```

## 8. TLS

DNS already resolves, so this issues and installs the certificate and adds the
HTTP→HTTPS redirect. Two hostnames — ours only. Never add `api.rentoni.uz`
here: it would request a certificate for a host another service is serving.

```bash
certbot --nginx -d rentoni.uz -d www.rentoni.uz \
        --redirect --agree-tos -m admin@rentoni.uz
systemctl list-timers | grep certbot     # renewal should already be scheduled
```

## 9. First deploy

From your Mac, backend first — the frontend's health check calls the API
through nginx and will fail if nothing is listening:

```bash
bash deploy-backend.sh production
bash deploy-frontend.sh production
```

Both scripts health-check `https://rentoni.uz/api/health` at the end, and the
frontend script additionally checks the site root and a deep link (the SPA
fallback). If any of those is not 200 the script fails rather than reporting a
green deploy.

The backend script runs the migrations, so the schema is created on first
deploy. The database starts **empty**: no products, no users.

## 10. Create the first administrator

Do not run `npm run seed` against production — it deletes every table first.
Use the one-time bootstrap endpoint instead, which refuses to run once any
SUPER_ADMIN exists:

```bash
TOKEN=$(ssh root@169.58.153.42 "grep ADMIN_SETUP_TOKEN /opt/rentoni-api-prod/.env.production | cut -d'\"' -f2")

curl -sS -X POST https://rentoni.uz/api/auth/bootstrap-admin \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Store Owner\",\"email\":\"owner@rentoni.uz\",\"password\":\"<a real password>\",\"setupToken\":\"$TOKEN\"}"
```

Then remove the token so the endpoint is dead rather than merely guarded:

```bash
ssh root@169.58.153.42 \
  "sed -i '/ADMIN_SETUP_TOKEN/d' /opt/rentoni-api-prod/.env.production && systemctl restart rentoni-api-prod"
```

Sign in at `https://rentoni.uz/login` and add categories, products and variants
through the dashboard.

---

# Day-to-day

```bash
bash deploy-backend.sh production --status     # service, release, port, db, schema
bash deploy-backend.sh production --logs       # last 80 journal lines
bash deploy-backend.sh production --rollback   # previous release (not migrations)

bash deploy-frontend.sh production --status
bash deploy-frontend.sh production --rollback
```

Both scripts run the full test suite before building, and refuse to deploy if
it fails.

## Backups

Every production backend deploy snapshots the database with `sqlite3 .backup`
(consistent even while serving) to `/root/rentoni-backups/` before migrating.
Five releases are kept on disk for rollback.

Backups are not yet copied off the box. Until they are, a lost VM is a lost
database — worth a nightly `rsync` or object-storage push.

## Things worth knowing

- **Rollback reverts code, not migrations.** If a release ships a destructive
  migration, rolling back the release leaves the new schema in place. Restore
  the pre-deploy backup instead.
- **SQLite means one writer.** Do not run a second instance of the service
  against the same database file, and do not add a second worker process.
- **Product images are URLs.** The API stores links, not files, so images must
  be hosted somewhere reachable; there is no upload endpoint.
- **`api.rentoni.uz` belongs to another service** (Klinika). Rentoni's API is at
  `https://rentoni.uz/api` and the docs at `https://rentoni.uz/docs`. Do not
  point a Rentoni vhost at `api.rentoni.uz` while Klinika is still serving it.
- **`v1.rentoni.uz` resolves but is unused.** If you later want a dedicated API
  hostname, add a vhost modelled on the `/api/` block in step 6, add it to the
  certbot line, and add its origin to `CORS_ORIGINS` — the storefront should
  still keep calling `/api` on its own origin.
