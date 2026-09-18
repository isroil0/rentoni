# Running the backend on Railway

The frontend is configured to call the Railway service directly — see
`web/.env.production`. Everything below is what the Railway service itself needs.

## Start command

Nixpacks auto-detects the Node app: it runs `npm run build`, then `npm start`.
`start` is:

```
prisma migrate deploy && node dist/server.js
```

Migrations run on every boot because Railway has no separate release phase.
`migrate deploy` is idempotent, so repeated boots are harmless.

> This is the fix for `The table \`main.settings\` does not exist in the current
> database.` — the schema had never been created.

## Required environment variables

Set these in the Railway service's **Variables** tab.

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | **Without it the API returns internal file paths and database errors to clients**, and the strict CORS allowlist is not enforced. |
| `JWT_ACCESS_SECRET` | 32+ random chars | Boot fails in production if missing or short. |
| `JWT_REFRESH_SECRET` | 32+ random chars, different from the access secret | As above. |
| `CORS_ORIGINS` | comma-separated origins of the deployed frontend, e.g. `https://rentoni.uz,https://www.rentoni.uz` | Cross-origin frontend; anything not listed gets 403. No trailing slashes — an origin is scheme+host+port only. |
| `DATABASE_URL` | `file:/data/prod.db` (see volume below) | Defaults to `file:./dev.db`, which lives on ephemeral disk. |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | real values | These have *development fallbacks* (`admin@rentoni.test` / `Admin@12345`). Override them before seeding. |
| `ADMIN_SETUP_TOKEN` | a long random string | Required by `POST /api/auth/bootstrap-admin`, which creates the first SUPER_ADMIN. Clear it once the account exists. |

Generate secrets with `openssl rand -hex 32`.

`PORT` is injected by Railway; do not set it.

## SQLite needs a volume

Railway's container filesystem is **ephemeral** — it is wiped on every deploy and
restart. Without a volume, every product, order and customer is lost on the next
push, and the schema is silently recreated empty.

1. Service → **Settings → Volumes → New Volume**, mount path `/data`.
2. Set `DATABASE_URL=file:/data/prod.db`.
3. Redeploy.

If the store is going to carry real sales data, move to Postgres instead —
Railway provisions one in a click. That is a schema-provider change in
`prisma/schema.prisma` plus regenerated migrations, not a drop-in swap.

## Creating the first admin

```sh
curl -X POST https://rentoni-production.up.railway.app/api/auth/bootstrap-admin \
  -H 'Content-Type: application/json' \
  -d '{"setupToken":"<ADMIN_SETUP_TOKEN>","email":"you@example.com","password":"<strong password>","name":"Store Owner"}'
```

It refuses to run once a SUPER_ADMIN exists.

## Verifying a deploy

```sh
B=https://rentoni-production.up.railway.app
curl -s $B/api/health                      # {"status":"ok"}
curl -s $B/api/products | head -c 120      # 200 with a data array, not a 500
curl -s $B/api/products/999999             # must NOT contain a /app/dist/... path
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://evil.example' -X POST $B/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"x"}'   # 403
```
