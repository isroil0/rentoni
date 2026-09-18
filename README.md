# Rentoni — Men's Shirt POS + Inventory Backend

Production-ready backend for a men's shirt retail business: point of sale, warehouse /
inventory, purchasing, an online storefront and returns.

The repository contains two packages:

| Path | What it is |
|---|---|
| `/` | The API — Express 5 + Prisma (this document) |
| `/web` | The React storefront and admin dashboard, in English, Russian and Uzbek — see [`web/README.md`](web/README.md) |

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ (developed on Node 26) |
| Language | TypeScript (strict) |
| Framework | Express 5 |
| ORM | Prisma 6 |
| Database | SQLite by default — zero setup. Swap `provider` to `postgresql` for production. |
| Auth | JWT access tokens + rotating opaque refresh tokens, server-side sessions |
| Validation | Zod, at the HTTP boundary |
| Tests | Vitest + Supertest |
| Docs | OpenAPI 3.0, served by Swagger UI at `/docs` |

There was no existing project in this directory, so the stack above was chosen fresh.

## Quick start

```bash
npm install
cp .env.example .env        # then change the secrets
npm run migrate             # apply migrations
npm run seed                # catalogue, stock, 1 SUPER_ADMIN, test customers
npm run dev                 # API on http://localhost:4000
```

Then open **http://localhost:4000/docs** for the interactive API reference.

To run the frontend alongside it, in a second terminal:

```bash
npm run web:install
npm run web:dev             # storefront + admin on http://localhost:5173
```

Seeded credentials (development only):

```
SUPER_ADMIN   admin@rentoni.test      / Admin@12345
CUSTOMER      customer1@rentoni.test  / Customer@123
CUSTOMER      customer2@rentoni.test  / Customer@123
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run migrate` | `prisma migrate deploy` |
| `npm run migrate:dev` | Create + apply a migration in development |
| `npm run seed` | Reset and reseed development data |
| `npm test` | Full automated suite |
| `npm run verify:flow` | Runs the end-to-end business scenario and prints a report |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run web:dev` / `web:build` / `web:test` / `web:lint` | Drive the `web/` package from here |
| `npm run test:all` | Backend suite then frontend suite |

## Roles

There are exactly two roles — `SUPER_ADMIN` and `CUSTOMER`. **POS and Warehouse are
features inside the SUPER_ADMIN dashboard, not separate roles.**

| | SUPER_ADMIN | CUSTOMER |
|---|---|---|
| Catalogue, inventory, POS, purchasing, orders, returns, customers, reports, settings, audit logs | ✅ | ❌ |
| Public product catalogue | ✅ | ✅ |
| Own profile, cart, orders, returns | — | ✅ |
| Cost prices, margins, suppliers, inventory transactions, audit logs | ✅ | ❌ never |
| Other customers' data | ✅ | ❌ never |

Public registration always creates a `CUSTOMER`; `role` is not an accepted request field
anywhere in the API. The first `SUPER_ADMIN` comes from the seed script or from
`POST /api/auth/bootstrap-admin`, which requires the out-of-band `ADMIN_SETUP_TOKEN` and
refuses to run once a `SUPER_ADMIN` exists.

## Architecture

```
src/
  routes/        HTTP surface, one router per audience (auth / public / customer / admin)
  controllers/   Thin: parse the request, call a service, serialise the response
  services/      All business logic and transaction boundaries
  serializers/   Admin vs customer projections — how cost price is kept off public APIs
  validators/    Zod schemas; strict, so unknown fields are rejected
  middleware/    auth, authorize, validate, errorHandler, rateLimit
  db/            Prisma client and the retrying transaction helper
  errors/        AppError + the error-code catalogue
  utils/         money, stock status, pagination, jwt, sequences, dates
```

Business logic lives only in services and is never duplicated across endpoints. The
centralised services are Inventory, Auth, Authorization (middleware), Product, Variant,
Category, Supplier, Purchase, Order, POS, CustomerOrder, Return, Report, Audit and Settings.

## How inventory works

**Stock is never changed silently.** Every movement goes through
`InventoryService.applyChange`, the single place allowed to write to `inventory`, and
each one writes an immutable `inventory_transactions` row recording
`previousQuantity`, the signed `quantity` delta and `newQuantity`.

```
Stock = 25,  sale of 2  ->  previous 25 | change -2 | new 23
```

| Trigger | Type | Effect |
|---|---|---|
| Purchase received | `PURCHASE` | + |
| POS sale completed / online order created | `SALE` | − |
| Return accepted | `RETURN` | + |
| Order cancelled (restock) | `ADJUSTMENT_IN` | + |
| Manual adjustment | `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | ± |
| Damaged goods | `DAMAGE` | − |

Stock status: `quantity = 0` → `OUT_OF_STOCK`; `quantity <= minimumStock` → `LOW_STOCK`;
otherwise `IN_STOCK`.

### Overselling is impossible

The decrement is one atomic guarded statement inside a database transaction:

```sql
UPDATE inventory
   SET quantity = quantity + :delta
 WHERE variant_id = :id
   AND quantity + :delta >= 0
```

If the guard fails the statement matches zero rows and the request is rejected with
`INSUFFICIENT_STOCK`; the surrounding transaction rolls back, so no order, no order item
and no transaction row survives. Two customers racing for the last unit therefore cannot
both succeed — one wins, one gets a 409, and stock lands on `0`, never `-1`. A database
`CHECK (quantity >= 0)` constraint sits behind this as a final backstop.

Transient write contention (SQLite serialises writers) is retried with exponential
backoff by `runInTransaction`, and only surfaces as a retryable `503 SERVICE_BUSY` if it
persists — never as a 500.

## Order flows

**POS** (`source = POS`, `customerId` nullable, `createdBy` = the SUPER_ADMIN):

```
POST /admin/pos/orders                  -> PENDING ticket, stock untouched
POST /admin/pos/orders/:id/complete     -> stock deducted + PAID/COMPLETED, one transaction
POST /admin/pos/orders/:id/cancel       -> CANCELLED, stock restored if it was deducted
```

Passing `completeNow: true` to create runs both steps inside a single transaction — the
normal counter flow. `POST /admin/pos/quote` prices a cart without writing anything.

**Online** (`source = ONLINE`, `customerId` = the customer): the backend authenticates
the customer, validates every variant, checks stock, prices each line from the database,
computes subtotal/discount/total, creates the order and deducts stock — all in one
transaction. Prices, totals, stock figures and discounts sent by the client are rejected
outright by the strict schemas.

**Order items store a price snapshot.** Repricing a variant from $30 to $35 leaves every
historical order showing $30.

### Status transitions

```
PENDING   → CONFIRMED, PAID, COMPLETED, CANCELLED
CONFIRMED → PAID, COMPLETED, CANCELLED
PAID      → COMPLETED, CANCELLED, REFUNDED
COMPLETED → REFUNDED, CANCELLED      (CANCELLED = voiding a sale; restores stock)
CANCELLED → (terminal)
REFUNDED  → (terminal)
```

Anything else returns `INVALID_STATUS_TRANSITION`. Cancelling restores stock exactly once
(guarded by an order-level `stockCommitted` flag) and is refused when returns already
exist against the order, so the same physical units can never be credited twice.

## Returns

A return always references the original order and may never exceed
`ordered − (already accepted + still pending)` for that variant.

- Admin-created returns are `ACCEPTED` immediately: stock increases and a `RETURN`
  transaction is written in the same database transaction.
- Customer-created returns are `REQUESTED` and move no stock until an admin accepts them
  via `POST /admin/returns/:id/accept`. Rejection frees the quantity again.

## Error format

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock for this product variant.",
    "details": { "variantId": 12, "sku": "OXF-W-M", "available": 2, "requested": 5 }
  }
}
```

Every code is defined in `src/errors/codes.ts` with its HTTP status. See
[`docs/API.md`](docs/API.md) for the full catalogue.

## Security

- bcrypt password hashing; hashes are never serialised anywhere.
- JWT access tokens carry a session id that is checked against the database on every
  request, so logout and deactivation take effect immediately rather than at expiry.
- Refresh tokens are opaque, stored only as SHA-256 hashes, and rotate on use; replaying
  one fails.
- Role checks are centralised in `requireRole`; customer-scoped queries are filtered by
  the authenticated user's id at the query level, so a customer cannot address another
  customer's rows even by guessing ids (they get `404`, not `403`).
- Zod schemas are `.strict()`, so unknown fields — including `role` — are rejected.
- Helmet, configurable CORS allow-list, global and per-endpoint rate limiting.
- Errors never leak stack traces in production.
- Audit log entries redact passwords and tokens.
- Foreign keys, unique constraints, `NOT NULL` and 36 `CHECK` constraints in the schema.

## Switching to PostgreSQL

1. In `prisma/schema.prisma` set `provider = "postgresql"`.
2. Point `DATABASE_URL` at your database.
3. `rm -rf prisma/migrations && npx prisma migrate dev --name init --create-only`, then
   re-apply the `CHECK` constraints — `scripts/patch-init-migration.js` documents each one
   (its string edits are written for the SQLite DDL, so review the generated SQL).
4. `npm run migrate && npm run seed`.

No application code changes are required: the concurrency control is a plain conditional
`UPDATE`, which behaves identically under PostgreSQL row locking.

## Testing

```bash
npm test
```

Each test file runs in its own process against its own SQLite database copied from a
pre-migrated template, so suites are isolated and run in parallel.

Coverage: authentication, authorization and data isolation, products/variants/images,
inventory and negative-stock prevention, POS, online orders, returns, concurrency,
reports and audit, the documentation itself, and the full end-to-end business scenario.
