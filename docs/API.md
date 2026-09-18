# API Reference

Base URL: `http://localhost:4000/api`
Interactive reference (Swagger UI): `http://localhost:4000/docs`
Machine-readable spec: `docs/openapi.yaml`, also served at `/openapi.json`

This document is the written companion to the OpenAPI spec. A test
(`tests/docs.test.ts`) asserts that the spec documents every route the application
registers and no routes that do not exist.

---

## Conventions

**Envelope**

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { ... } }   // meta present on list endpoints

// failure
{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }
```

**Pagination** — `?page=1&limit=20` (max `limit` 100).

```json
"meta": { "page": 1, "limit": 20, "total": 51, "totalPages": 3, "hasNext": true, "hasPrev": false }
```

**Money** — decimal numbers in major units (`30`, `30.5`). Stored internally as integer
cents so no floating-point drift accumulates.

**Dates** — ISO 8601. Report endpoints take either `?preset=today|week|month|year` or an
explicit `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

---

## Authentication

Bearer JWT access tokens plus opaque, rotating refresh tokens.

```
Authorization: Bearer <accessToken>
```

Each access token carries a **session id** that is verified against the database on every
request. That is what makes logout and account deactivation take effect immediately
instead of at token expiry.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register. **Always creates a `CUSTOMER`**; `role` is not an accepted field. |
| POST | `/auth/login` | — | Returns `{ user, accessToken, refreshToken, expiresAt }` |
| POST | `/auth/refresh` | — | Rotates the session; the presented refresh token is revoked |
| POST | `/auth/logout` | any | Revokes the current session |
| POST | `/auth/logout-all` | any | Revokes every session for the user |
| GET | `/auth/me` | any | Current user (never includes the password hash) |
| GET | `/auth/sessions` | any | Active sessions |
| POST | `/auth/change-password` | any | Changes the password and revokes all sessions |
| POST | `/auth/bootstrap-admin` | — | One-time creation of the first `SUPER_ADMIN` |

**Password rules** — at least 8 characters containing a letter and a digit.

**`POST /auth/register`**

```json
{ "name": "Jane Buyer", "email": "jane@example.com", "phone": "+15550100", "password": "Passw0rd!" }
```

**`POST /auth/bootstrap-admin`** requires the server's `ADMIN_SETUP_TOKEN` and returns
`409 SETUP_ALREADY_COMPLETE` once any `SUPER_ADMIN` exists:

```json
{ "name": "Owner", "email": "owner@shop.com", "password": "Admin@12345", "setupToken": "<ADMIN_SETUP_TOKEN>" }
```

---

## Roles and authorization

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Everything under `/admin/**` |
| `CUSTOMER` | Public catalogue + `/customer/**`, strictly own data |

Enforcement is centralised in `requireRole`. Customer-scoped queries filter by the
authenticated user's id **at the query level**, so another customer's id yields
`404 ORDER_NOT_FOUND` rather than `403` — the API does not confirm that the row exists.

A `CUSTOMER` can never: modify stock, modify products, change prices, see cost prices or
margins, see suppliers, see profit, see inventory transactions, see audit logs, see other
customers, see other customers' orders, or reach any `/admin/**` endpoint.

---

## Public catalogue (no authentication)

| Method | Path | Description |
|---|---|---|
| GET | `/products` | Browse, search, filter, paginate |
| GET | `/products/:id` | Detail: colours, sizes, prices, availability, images |
| GET | `/categories` | Active categories with product counts |

**Filters:** `search`, `categoryId`, `brand`, `color`, `size`, `sku`, `barcode`,
`minPrice`, `maxPrice`, `availability`, `sort`, `page`, `limit`.

```
GET /api/products?search=Oxford&color=White&size=M&minPrice=20&maxPrice=40&availability=IN_STOCK&page=1&limit=20
```

Customer-facing responses contain **no** cost price, margin, supplier, `minimumStock`,
inventory transaction or internal note. Stock is exposed as a status only:

```json
{
  "id": 1, "name": "Oxford Classic Shirt", "brand": "Rentoni",
  "colors": ["White", "Black", "Blue"], "sizes": ["S", "M", "L", "XL"],
  "priceFrom": 30, "priceTo": 30, "availability": "IN_STOCK",
  "variants": [
    { "id": 2, "sku": "OXF-W-M", "color": "White", "size": "M",
      "price": 30, "availability": "IN_STOCK", "inStock": true }
  ]
}
```

Exact counts appear only if the `customer.expose_exact_stock` setting is set to `"true"`.

---

## Customer endpoints (`CUSTOMER` only)

| Method | Path | Description |
|---|---|---|
| GET / PUT | `/customer/profile` | Own profile (name, phone, email only) |
| GET / DELETE | `/customer/cart` | Own cart / empty it |
| POST | `/customer/cart/items` | Add a variant |
| PATCH / DELETE | `/customer/cart/items/:variantId` | Set quantity (0 removes) / remove |
| POST | `/customer/orders` | Place an order |
| GET | `/customer/orders` | Own orders |
| GET | `/customer/orders/:id` | One own order |
| POST | `/customer/orders/:id/cancel` | Cancel an eligible own order |
| GET | `/customer/orders/:orderId/return-eligibility` | Returnable quantity per line |
| POST | `/customer/returns` | Request a return |
| GET | `/customer/returns` | Own returns |
| GET | `/customer/returns/:id` | One own return |

**`POST /customer/orders`**

```json
{ "items": [{ "variantId": 2, "quantity": 2 }], "paymentMethod": "CARD" }
```
or check out the saved cart:
```json
{ "fromCart": true }
```

The backend authenticates the customer, validates each variant, checks stock, reads the
price from the database, computes subtotal, discount and total, creates the order and
deducts stock — all in one transaction. Client-supplied prices, totals, stock or
discounts are rejected outright (`VALIDATION_ERROR`), never trusted.

---

## Admin endpoints (`SUPER_ADMIN` only)

### Categories
`GET|POST /admin/categories` · `GET|PUT|DELETE /admin/categories/:id`

### Products
`GET|POST /admin/products` · `GET|PUT|DELETE /admin/products/:id`
`POST /admin/products/:id/variants`
`POST /admin/products/:id/images` · `DELETE /admin/products/:id/images/:imageId` ·
`POST /admin/products/:id/images/:imageId/primary`

Create a product with its whole variant matrix in one call:

```json
{
  "categoryId": 1,
  "name": "Oxford Classic Shirt",
  "brand": "Rentoni",
  "images": [{ "url": "https://cdn.example.com/oxford.jpg", "isPrimary": true }],
  "variants": [
    { "sku": "OXF-W-M", "color": "White", "size": "M",
      "costPrice": 18, "sellingPrice": 30, "minimumStock": 5, "initialStock": 20 }
  ]
}
```

`DELETE` deactivates by default. `?hard=true` permanently deletes and is refused with
`409` once the product has order or purchase history.

### Variants
`GET|POST /admin/variants` · `GET|PUT|DELETE /admin/variants/:id` ·
`GET /admin/variants/lookup?code=<sku|barcode>`

SKU is unique catalogue-wide; barcode is unique when provided; `(productId, color, size)`
is unique, so `White + M` cannot be added twice to the same product.

### Inventory
| Method | Path | Description |
|---|---|---|
| GET | `/admin/inventory` | Stock per variant; filter by `status`, `search`, `categoryId`, `productId` |
| GET | `/admin/inventory/:variantId` | Stock for one variant |
| GET | `/admin/inventory/low-stock` | `quantity <= minimumStock` |
| GET | `/admin/inventory/out-of-stock` | `quantity = 0` |
| GET | `/admin/inventory/transactions` | Full movement history |
| POST | `/admin/inventory/adjust` | Adjust stock |

**Adjust** — supply exactly one of `quantity` (relative, with `type`) or `setQuantity`
(absolute):

```json
{ "variantId": 2, "type": "DAMAGE", "quantity": 2, "note": "Water damage" }
{ "variantId": 2, "setQuantity": 35, "note": "Stock count correction" }
```

Always writes an inventory transaction and an audit entry, and never allows a negative
result (`409 INSUFFICIENT_STOCK`).

### POS
| Method | Path | Description |
|---|---|---|
| GET | `/admin/pos/search?q=` | Product / SKU / barcode / colour search |
| POST | `/admin/pos/quote` | Price the cart; writes nothing |
| POST | `/admin/pos/orders` | Create a sale |
| POST | `/admin/pos/orders/:id/complete` | Deduct stock, take payment, complete |
| POST | `/admin/pos/orders/:id/cancel` | Void, restoring stock |
| GET | `/admin/pos/orders/:id/receipt` | Receipt payload |

```json
{
  "items": [{ "sku": "OXF-W-M", "quantity": 2 }],
  "discount": 0,
  "paymentMethod": "CASH",
  "completeNow": true
}
```

Lines may use `variantId`, `sku` or `barcode`; repeated references to the same variant
are merged. `discount` (absolute) and `discountPercent` are mutually exclusive, and a
discount larger than the subtotal is rejected with `DISCOUNT_TOO_LARGE`.

### Orders
`GET /admin/orders` (filters: `status`, `source`, `paymentStatus`, `customerId`,
`search`, `from`, `to`) · `GET /admin/orders/:id` ·
`POST /admin/orders/:id/cancel` · `POST /admin/orders/:id/status`

### Suppliers and purchasing
`GET|POST /admin/suppliers` · `GET|PUT|DELETE /admin/suppliers/:id`
`GET|POST /admin/purchases` · `GET /admin/purchases/:id` ·
`POST /admin/purchases/:id/receive` · `POST /admin/purchases/:id/cancel`

```json
{
  "supplierId": 1,
  "items": [{ "variantId": 2, "quantity": 20, "unitCost": 18 }],
  "receiveNow": false
}
```

Receiving increases stock for every line, writes a `PURCHASE` transaction per line and
flips the purchase to `RECEIVED` — atomically. A second receive returns
`409 PURCHASE_ALREADY_RECEIVED`; stock is never doubled.

### Returns
`GET|POST /admin/returns` · `GET /admin/returns/:id` ·
`GET /admin/returns/eligibility/:orderId` ·
`POST /admin/returns/:id/accept` · `POST /admin/returns/:id/reject`

```json
{
  "orderId": 7,
  "items": [{ "variantId": 2, "quantity": 1, "reason": "Wrong size" }],
  "autoAccept": true
}
```

### Customers
`GET /admin/customers` · `GET /admin/customers/:id` ·
`PATCH /admin/customers/:id/status`

Deactivating a customer immediately revokes all of their sessions.

### Dashboard and reports
| Path | Contents |
|---|---|
| `GET /admin/dashboard/summary` | Today's sales, revenue, orders, items sold, total inventory units, low-stock and out-of-stock counts, total customers, returns and purchasing activity |
| `GET /admin/reports/sales` | Totals plus breakdowns by day, source and payment method |
| `GET /admin/reports/inventory` | Valuation at cost and retail, by status and category |
| `GET /admin/reports/products` | Best and slowest sellers with per-variant profit |
| `GET /admin/reports/purchases` | Purchasing activity by supplier |
| `GET /admin/reports/returns` | Returns by reason and by variant |
| `GET /admin/reports/profit` | Revenue − cost of goods sold, per day, with margin % |

All accept `?preset=today|week|month|year` or `?from=&to=`.

Revenue counts every order that is not `CANCELLED` or `REFUNDED` — stock is committed at
order creation, so a `PENDING` order is a real sale until it is cancelled.

### Settings and audit
`GET|PUT /admin/settings` · `GET /admin/audit-logs`

| Setting | Default | Meaning |
|---|---|---|
| `customer.expose_exact_stock` | `false` | Include exact stock counts in customer APIs |
| `orders.customer_cancel_window_hours` | `24` | How long a customer may cancel their own order |
| `orders.customer_return_window_days` | `14` | How long a customer may request a return |
| `store.name` / `store.currency` | `Rentoni Shirts` / `USD` | Display values |

Audited actions include inventory adjustments, price changes, product/category/variant
changes, purchase receiving, returns, order cancellation and status changes, customer
account changes and setting updates. Each entry stores `oldValue` and `newValue` as JSON
with passwords and tokens redacted — credentials are never written to the audit log.

---

## Order status transitions

```
PENDING   → CONFIRMED, PAID, COMPLETED, CANCELLED
CONFIRMED → PAID, COMPLETED, CANCELLED
PAID      → COMPLETED, CANCELLED, REFUNDED
COMPLETED → REFUNDED, CANCELLED      (CANCELLED = voiding a sale; restores stock)
CANCELLED → (terminal)
REFUNDED  → (terminal)
```

Any other move returns `409 INVALID_STATUS_TRANSITION` with the allowed targets in
`error.details.allowed`. Cancelling restores stock exactly once and is refused when
returns already exist against the order.

---

## Inventory behaviour

Every stock change is written by one service and always produces an
`inventory_transactions` row:

| Field | Meaning |
|---|---|
| `type` | `PURCHASE` · `SALE` · `RETURN` · `ADJUSTMENT_IN` · `ADJUSTMENT_OUT` · `DAMAGE` |
| `quantity` | Signed delta (`-2` for a sale of 2) |
| `previousQuantity` / `newQuantity` | Stock before and after |
| `referenceType` / `referenceId` | `PURCHASE` · `ORDER` · `RETURN` · `ORDER_CANCELLATION` · `MANUAL` |
| `userId` | Who caused it |

Stock status: `0` → `OUT_OF_STOCK`; `<= minimumStock` → `LOW_STOCK`; else `IN_STOCK`.

Stock can never go negative — see the concurrency section of the README.

---

## Error codes

| Code | HTTP | Default message |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request validation failed. |
| `BAD_REQUEST` | 400 | Bad request. |
| `NOT_FOUND` | 404 | Resource not found. |
| `INTERNAL_ERROR` | 500 | An unexpected error occurred. |
| `RATE_LIMITED` | 429 | Too many requests, please try again later. |
| `CONFLICT` | 409 | The request conflicts with the current state. |
| `SERVICE_BUSY` | 503 | The server is busy processing other requests. Please retry in a moment. |
| `UNAUTHENTICATED` | 401 | Authentication is required. |
| `INVALID_CREDENTIALS` | 401 | Invalid email or password. |
| `INVALID_TOKEN` | 401 | Token is invalid or expired. |
| `SESSION_EXPIRED` | 401 | Session has expired, please log in again. |
| `ACCOUNT_INACTIVE` | 403 | This account has been deactivated. |
| `FORBIDDEN` | 403 | You do not have permission to perform this action. |
| `EMAIL_ALREADY_EXISTS` | 409 | An account with this email already exists. |
| `SETUP_ALREADY_COMPLETE` | 409 | A SUPER_ADMIN account already exists. |
| `CATEGORY_NOT_FOUND` | 404 | Category not found. |
| `CATEGORY_NAME_EXISTS` | 409 | A category with this name already exists. |
| `CATEGORY_HAS_PRODUCTS` | 409 | Category still has products attached. |
| `PRODUCT_NOT_FOUND` | 404 | Product not found. |
| `PRODUCT_INACTIVE` | 409 | This product is not currently available. |
| `PRODUCT_HAS_VARIANTS` | 409 | Product still has variants attached. |
| `VARIANT_NOT_FOUND` | 404 | Product variant not found. |
| `VARIANT_INACTIVE` | 409 | This product variant is not currently available. |
| `DUPLICATE_SKU` | 409 | This SKU is already in use. |
| `DUPLICATE_BARCODE` | 409 | This barcode is already in use. |
| `DUPLICATE_VARIANT` | 409 | This colour and size combination already exists for the product. |
| `IMAGE_NOT_FOUND` | 404 | Product image not found. |
| `INSUFFICIENT_STOCK` | 409 | Not enough stock for this product variant. |
| `INVENTORY_NOT_FOUND` | 404 | Inventory record not found for this variant. |
| `INVALID_ADJUSTMENT` | 422 | Invalid inventory adjustment. |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier not found. |
| `SUPPLIER_INACTIVE` | 409 | This supplier is inactive. |
| `SUPPLIER_HAS_PURCHASES` | 409 | Supplier still has purchases attached. |
| `PURCHASE_NOT_FOUND` | 404 | Purchase not found. |
| `PURCHASE_ALREADY_RECEIVED` | 409 | This purchase has already been received. |
| `PURCHASE_NOT_DRAFT` | 409 | Only draft purchases can be modified. |
| `PURCHASE_CANCELLED` | 409 | This purchase has been cancelled. |
| `ORDER_NOT_FOUND` | 404 | Order not found. |
| `EMPTY_ORDER` | 422 | An order must contain at least one item. |
| `INVALID_STATUS_TRANSITION` | 409 | This order status change is not allowed. |
| `ORDER_NOT_CANCELLABLE` | 409 | This order can no longer be cancelled. |
| `ORDER_ALREADY_COMPLETED` | 409 | This order has already been completed. |
| `ORDER_NOT_PENDING` | 409 | Only pending orders can be completed. |
| `CANCEL_WINDOW_EXPIRED` | 409 | The cancellation window for this order has passed. |
| `DISCOUNT_TOO_LARGE` | 422 | Discount cannot exceed the order subtotal. |
| `CART_EMPTY` | 422 | Your cart is empty. |
| `RETURN_NOT_FOUND` | 404 | Return not found. |
| `ORDER_NOT_RETURNABLE` | 409 | This order is not eligible for returns. |
| `INVALID_RETURN_QUANTITY` | 422 | Return quantity exceeds the quantity eligible for return. |
| `ITEM_NOT_IN_ORDER` | 422 | This variant was not part of the referenced order. |
| `RETURN_ALREADY_PROCESSED` | 409 | This return has already been processed. |
| `RETURN_WINDOW_EXPIRED` | 409 | The return window for this order has passed. |
| `CUSTOMER_NOT_FOUND` | 404 | Customer not found. |
| `CANNOT_MODIFY_SELF` | 409 | You cannot perform this action on your own account. |

Validation failures return `422 VALIDATION_ERROR` with a field-level breakdown:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "field": "items.0.quantity", "message": "Number must be greater than 0", "code": "too_small" }]
  }
}
```
