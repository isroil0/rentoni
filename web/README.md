# Rentoni — Frontend

React storefront and SUPER_ADMIN back office for the Rentoni men's shirt business.
Talks to the Express/Prisma API in the repository root.

## Stack

There was no existing frontend in this repository, so the stack below was chosen to sit
naturally alongside the TypeScript backend.

| Concern | Choice |
|---|---|
| Build | Vite 7 |
| UI | React 19 + TypeScript (strict) |
| Routing | React Router 7 |
| Server state | TanStack Query 5 |
| Styling | Tailwind CSS 4 (design tokens in `src/styles.css`) |
| Charts | Recharts |
| Languages | English, Russian, Uzbek — typed dictionaries, no i18n library |
| Tests | Vitest + Testing Library, against a **real** backend |
| Browser check | Playwright driving the locally installed Chrome |

## Running it

The API must be running first (from the repository root):

```bash
npm run migrate && npm run seed && npm run dev   # API on :4000
```

Then, in this directory:

```bash
npm install
npm run dev        # http://localhost:5173
```

`/api` is proxied to `http://localhost:4000` in development, so the app is same-origin
and needs no CORS configuration locally. Point `VITE_API_URL` at another host to talk to
a deployed API instead, and set `VITE_API_PROXY` to change the dev proxy target.

Seeded sign-ins:

```
SUPER_ADMIN   admin@rentoni.test      / Admin@12345
CUSTOMER      customer1@rentoni.test  / Customer@123
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Full suite against a real, freshly seeded backend |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint over `src` and `tests` |
| `npm run verify:ui` | Drives the running app in real Chrome and screenshots every screen |
| `npm run verify:i18n` | Checks all three languages in real Chrome for missing keys and overflow |

## Structure

```
src/
  api/          One module per domain — the only place fetch happens
  lib/          apiClient (tokens, refresh, error mapping), queryClient, formatting
  hooks/        useAuth, useCart, useDebounce
  components/
    ui/         Button, Input, Field, Modal, Drawer, Table, Pagination, Badge, states…
    shop/       ProductCard, ProductImageGallery, VariantSelector, QuantitySelector…
    charts/     Chart tokens, tooltip, table view, sales charts
    layout/     StoreLayout + AdminLayout and their navigation
    guards/     Route guards
  i18n/         Dictionaries (en/ru/uz), provider, plural + interpolation engine
  pages/
    store/      Home, Shop, Product, Cart, Checkout, Order confirmation
    auth/       Login, Register
    account/    Profile, Orders, Order detail, Returns
    admin/      Dashboard, POS, Products, Inventory, Purchases, Sales, Returns,
                Customers, Suppliers, Reports, Audit logs, Settings
```

No component calls `fetch` directly; everything goes through `src/api/*`, which goes
through `src/lib/apiClient.ts`.

## Routes

**Public** `/` · `/shop` · `/products/:id` · `/categories` · `/cart` · `/login` · `/register`

**Customer** `/checkout` · `/order-confirmation/:id` · `/account` · `/account/orders` ·
`/account/orders/:id` · `/account/returns`

**SUPER_ADMIN** `/admin` · `/admin/pos` · `/admin/products` (+ `/new`, `/:id`, `/:id/edit`) ·
`/admin/inventory` (+ `/:variantId`) · `/admin/purchases` (+ `/new`, `/:id`) ·
`/admin/sales` (+ `/:id`) · `/admin/returns` · `/admin/customers` (+ `/:id`) ·
`/admin/suppliers` · `/admin/reports` · `/admin/audit-logs` · `/admin/settings`

## Languages

The interface ships in **English, Russian and Uzbek (Latin)**. The picker sits in the
storefront header, the admin top bar, and under Settings; each option is written in its
own language. The choice persists per browser and sets `<html lang>`.

`src/i18n/locales/en.ts` is the source of truth: `Messages` is derived from its
*structure*, so `ru.ts` and `uz.ts` **cannot compile** with a missing, misspelt or stray
key. There is no runtime "missing translation" surprise, and no translation library —
the engine is about 100 lines over the platform's own `Intl`.

- **Plurals** use `Intl.PluralRules`, so Russian gets its one/few/many forms
  (1 товар / 2 товара / 5 товаров) rather than a naive `n === 1` check.
- **Numbers, currency and dates** reformat with the language: `$1,234.50` in English
  becomes `1 234,50 $` in Russian.
- **Backend error codes** map to localised copy, so an `INSUFFICIENT_STOCK` rejection
  reads correctly in all three languages.
- **Product names, brands and category names are business data** and come from the API
  untranslated — only interface chrome is localised.

Tests assert that all three dictionaries cover exactly the same keys, that every
interpolation placeholder survives translation, that Russian plurals select correctly,
and that less than 15% of strings are shared with English (i.e. it is genuinely
translated, not copy-pasted).

## Authentication

Bearer JWT access token plus a rotating refresh token.

- The **access token lives in memory only** and is never persisted.
- Only the opaque refresh token goes to `localStorage`, so a reload can restore the
  session. `apiClient` refreshes it transparently on a 401 and replays the request once,
  de-duplicating concurrent refreshes.
- Logging out revokes the session server-side, so the token stops working immediately.

## Authorization

Route guards (`RequireAuth`, `RequireRole`, `RequireCustomer`) redirect rather than hide:
a CUSTOMER opening `/admin` is sent to the storefront. **These guards are a usability
layer, not the security boundary** — every admin endpoint is independently protected by
the API, and the tests assert that a customer's token is rejected at the API even when
the UI is bypassed.

## The backend is the source of truth

The frontend renders backend results; it never derives business values.

- Order totals, discounts, taxes and profit come from the API. Checkout sends only
  variant ids and quantities.
- POS totals come from `POST /admin/pos/quote` on every ticket change, so the number on
  screen is the server's.
- Stock availability is whatever the API reports. When a sale is rejected because
  someone else bought the last unit, the UI says so plainly and refetches, rather than
  trying to reconcile stock locally.
- Cost price, margin, supplier data, inventory transactions and audit logs are absent
  from every customer-facing payload — the API omits them, and the customer UI has no
  field to display them.

## Testing

```bash
npm test
```

`tests/globalSetup.ts` migrates a throwaway SQLite database, seeds it, and boots the
real Express API. The suite then exercises the shipped API client against it — there are
no mocked endpoints or fixture responses anywhere.

Files run serially: they share one backend, and several assert on exact stock levels.

Coverage: authentication and session restore, authorization and cross-customer
isolation, the full shopping flow, POS, inventory adjustments and status thresholds,
purchasing and receiving, returns, stock concurrency, protected-data exposure, route
guards, component behaviour, translation completeness and pluralisation, and a smoke
render of every route asserting no console errors.

### Real browser

```bash
npm run verify:ui
```

Drives the running app in the locally installed Chrome: walks the customer journey
through checkout, walks the admin journey through POS and every back-office screen,
asserts a CUSTOMER cannot stay on `/admin`, checks for console errors, failed requests
and horizontal overflow at 1440/820/390 px, and writes screenshots to `.ui-shots/`.

## Notes

- Product images are URLs supplied by the API. The seed data points at a placeholder CDN
  that does not resolve, so `ProductImage` falls back to a neutral shirt mark — the grid
  keeps its shape and the product stays shoppable.
- The app ships a single light theme, matching the brief's "white / light neutral"
  direction. Chart colours were validated for colour-blind separation and contrast
  against the white card surface.
- To add a fourth language, create `src/i18n/locales/<code>.ts` typed as `Messages`
  (TypeScript will list every key you still owe), then add the code to `LOCALES` and
  `LOCALE_LABELS` in `src/i18n/types.ts`.
