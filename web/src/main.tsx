import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import { ToastProvider } from './components/ui';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { I18nProvider } from './i18n';
import { CurrencyLoader } from './components/CurrencyLoader';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ToastProvider>
              <AuthProvider>
                <CartProvider>
                  <CurrencyLoader />
                  <App />
                </CartProvider>
              </AuthProvider>
            </ToastProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
