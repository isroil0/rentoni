import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { StoreLayout } from '@/components/layout/StoreLayout';
import { RedirectIfAuthenticated, RequireCustomer, RequireRole } from '@/components/guards/RouteGuards';
import { LoadingState } from '@/components/ui';
import HomePage from '@/pages/store/HomePage';
import ShopPage from '@/pages/store/ShopPage';
import ProductDetailPage from '@/pages/store/ProductDetailPage';
import CategoriesPage from '@/pages/store/CategoriesPage';
import NotFoundPage from '@/pages/store/NotFoundPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

// The admin bundle is only fetched once someone actually opens the back office, so a
// shopper never downloads the POS, reports or charting code.
const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'));
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'));
const PosPage = lazy(() => import('@/pages/admin/PosPage'));
const ProductsPage = lazy(() => import('@/pages/admin/ProductsPage'));
const ProductFormPage = lazy(() => import('@/pages/admin/ProductFormPage'));
const AdminProductDetailPage = lazy(() => import('@/pages/admin/ProductDetailPage'));
const InventoryPage = lazy(() => import('@/pages/admin/InventoryPage'));
const InventoryDetailPage = lazy(() => import('@/pages/admin/InventoryDetailPage'));
const PurchasesPage = lazy(() => import('@/pages/admin/PurchasesPage'));
const PurchaseFormPage = lazy(() => import('@/pages/admin/PurchaseFormPage'));
const PurchaseDetailPage = lazy(() => import('@/pages/admin/PurchaseDetailPage'));
const SalesPage = lazy(() => import('@/pages/admin/SalesPage'));
const SaleDetailPage = lazy(() => import('@/pages/admin/SaleDetailPage'));
const AdminReturnsPage = lazy(() => import('@/pages/admin/ReturnsPage'));
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/admin/CustomerDetailPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogsPage'));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'));

// Customer account screens are also split out — they need a session to be useful.
const AccountLayout = lazy(() => import('@/pages/account/AccountLayout'));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage'));
const OrdersPage = lazy(() => import('@/pages/account/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/account/OrderDetailPage'));
const AccountReturnsPage = lazy(() => import('@/pages/account/ReturnsPage'));
const CartPage = lazy(() => import('@/pages/store/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/store/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('@/pages/store/OrderConfirmationPage'));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public storefront */}
        <Route element={<StoreLayout />}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="cart" element={<CartPage />} />

          {/* Customer-only shopping and account flows */}
          <Route element={<RequireCustomer />}>
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="order-confirmation/:id" element={<OrderConfirmationPage />} />
            <Route path="account" element={<AccountLayout />}>
              <Route index element={<ProfilePage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="returns" element={<AccountReturnsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Auth */}
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Back office — SUPER_ADMIN only. A CUSTOMER is redirected to the storefront. */}
        <Route element={<RequireRole role="SUPER_ADMIN" redirectTo="/" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<AdminProductDetailPage />} />
            <Route path="products/:id/edit" element={<ProductFormPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory/:variantId" element={<InventoryDetailPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="purchases/new" element={<PurchaseFormPage />} />
            <Route path="purchases/:id" element={<PurchaseDetailPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="sales/:id" element={<SaleDetailPage />} />
            <Route path="returns" element={<AdminReturnsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
