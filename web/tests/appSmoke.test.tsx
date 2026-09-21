import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { AuthProvider } from '@/hooks/useAuth';
import { CartProvider } from '@/hooks/useCart';
import { ToastProvider } from '@/components/ui';
import { I18nProvider } from '@/i18n';
import { AuthApi } from '@/api/auth.api';
import { tokenStore } from '@/lib/apiClient';
import { ADMIN, CUSTOMER } from './helpers';

/**
 * Renders the real application at each route against the real API and asserts that the
 * page reaches a meaningful state without logging a React error or warning. This is the
 * check that catches runtime breakage the API-level tests cannot see.
 */
function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* Mirrors main.tsx: the app expects an I18n provider above everything. */}
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>
            <AuthProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthProvider>
          </ToastProvider>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

let consoleErrors: string[] = [];
let consoleWarnings: string[] = [];

beforeEach(() => {
  consoleErrors = [];
  consoleWarnings = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrors.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    consoleWarnings.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  tokenStore.clear();
});

/** React key/prop/act warnings and unhandled render errors — not application 4xx noise. */
function reactProblems() {
  // jsdom has no layout engine, so Recharts' responsive container always measures 0x0
  // and warns. That is an artefact of this environment; charts are verified separately
  // in a real browser, where the container has real dimensions.
  const noise =
    /Not implemented:|jsdom|ResizeObserver|Download the React DevTools|width\(0\) and height\(0\) of chart/i;
  return [...consoleErrors, ...consoleWarnings].filter((line) => !noise.test(line));
}

describe('application smoke (real API)', () => {
  const publicRoutes: [string, RegExp][] = [
    ['/', /Find your perfect shirt/i],
    ['/shop', /Shop shirts/i],
    ['/categories', /Categories/i],
    ['/cart', /your cart/i],
    ['/login', /Sign in/i],
    ['/register', /Create your account/i],
    ['/definitely-not-a-page', /Page not found/i],
  ];

  for (const [path, expected] of publicRoutes) {
    it(`renders ${path} without runtime errors`, async () => {
      renderApp(path);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 10_000 });
      expect(reactProblems(), `console output on ${path}`).toEqual([]);
    });
  }

  it('renders a product detail page with colours, sizes and a price', async () => {
    const { CatalogApi } = await import('@/api/catalog.api');
    const products = await CatalogApi.listProducts({ limit: 1 });
    const product = products.items[0]!;

    renderApp(`/products/${product.id}`);

    await waitFor(() => expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument(), {
      timeout: 10_000,
    });

    // Colour and size pickers are present and labelled.
    expect(screen.getByRole('group', { name: /colour/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /size/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart|out of stock/i })).toBeInTheDocument();

    // Nothing internal leaks onto the page.
    expect(document.body.textContent).not.toMatch(/cost price/i);
    expect(document.body.textContent).not.toMatch(/margin/i);
    expect(document.body.textContent).not.toMatch(/supplier/i);

    expect(reactProblems()).toEqual([]);
  });

  describe('admin routes', () => {
    beforeEach(async () => {
      tokenStore.clear();
      await AuthApi.login(ADMIN.email, ADMIN.password);
    });

    const adminRoutes: [string, RegExp][] = [
      ['/admin', /Today's sales/i],
      ['/admin/pos', /Find a product/i],
      ['/admin/products', /Add product/i],
      ['/admin/inventory', /variants tracked|No inventory records/i],
      ['/admin/purchases', /New purchase/i],
      ['/admin/sales', /orders|No sales found/i],
      ['/admin/returns', /Record a return/i],
      ['/admin/customers', /customers/i],
      ['/admin/reports', /Revenue/i],
      ['/admin/audit-logs', /administrative action/i],
      ['/admin/settings', /Store information/i],
    ];

    for (const [path, expected] of adminRoutes) {
      it(`renders ${path} without runtime errors`, async () => {
        renderApp(path);
        await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 15_000 });
        expect(reactProblems(), `console output on ${path}`).toEqual([]);
      });
    }
  });

  describe('customer account routes', () => {
    beforeEach(async () => {
      tokenStore.clear();
      await AuthApi.login(CUSTOMER.email, CUSTOMER.password);
    });

    const accountRoutes: [string, RegExp][] = [
      ['/account', /Profile/i],
      ['/account/orders', /orders/i],
      ['/account/returns', /returns/i],
    ];

    for (const [path, expected] of accountRoutes) {
      it(`renders ${path} without runtime errors`, async () => {
        renderApp(path);
        await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 10_000 });
        expect(reactProblems(), `console output on ${path}`).toEqual([]);
      });
    }
  });
});
