import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CartApi } from '@/api/cart.api';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { useAuth } from './useAuth';
import type { Cart, CartItem, CustomerProduct, CustomerVariant } from '@/api/types';

/**
 * Cart state.
 *
 * Signed-in customers get the real server cart, which the backend re-prices and
 * re-checks for availability on every read. Guests get a local cart that stores nothing
 * but variant ids and quantities — prices and availability are still resolved from the
 * live catalogue, never from anything cached in the browser. On sign-in the guest cart
 * is merged into the server cart and cleared.
 */

const GUEST_CART_KEY = 'rentoni.guestCart';

interface GuestLine {
  variantId: number;
  productId: number;
  quantity: number;
}

function readGuestCart(): GuestLine[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuestLine[];
    return Array.isArray(parsed)
      ? parsed.filter((l) => Number.isInteger(l?.variantId) && Number.isInteger(l?.productId) && l.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

function writeGuestCart(lines: GuestLine[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — the cart simply won't persist */
  }
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  readyForCheckout: boolean;
  isLoading: boolean;
  isGuest: boolean;
  addItem: (input: { variantId: number; productId: number; quantity: number }) => Promise<void>;
  setQuantity: (variantId: number, quantity: number) => Promise<void>;
  removeItem: (variantId: number) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Builds display lines for a guest cart from live catalogue data. */
function guestLinesToItems(lines: GuestLine[], products: CustomerProduct[]): CartItem[] {
  const variantIndex = new Map<number, { product: CustomerProduct; variant: CustomerVariant }>();
  for (const product of products) {
    for (const variant of product.variants) variantIndex.set(variant.id, { product, variant });
  }

  return lines.flatMap<CartItem>((line, index) => {
    const found = variantIndex.get(line.variantId);
    if (!found) return [];
    const { product, variant } = found;
    return [
      {
        id: index,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        quantity: line.quantity,
        unitPrice: variant.price,
        lineTotal: variant.price * line.quantity,
        available: variant.inStock,
        purchasable: variant.inStock,
      },
    ];
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isCustomer, initializing } = useAuth();
  const queryClient = useQueryClient();
  const [guestLines, setGuestLines] = useState<GuestLine[]>(() => readGuestCart());
  const [merging, setMerging] = useState(false);

  const useServerCart = isAuthenticated && isCustomer;

  const serverCart = useQuery({
    queryKey: qk.cart(),
    queryFn: () => CartApi.get(),
    enabled: useServerCart && !initializing,
  });

  // Guest lines are resolved against the live catalogue so displayed prices and
  // availability always come from the backend.
  const guestProductIds = useMemo(
    () => [...new Set(guestLines.map((l) => l.productId))].sort((a, b) => a - b),
    [guestLines],
  );

  const guestProducts = useQuery({
    queryKey: ['guestCartProducts', guestProductIds],
    queryFn: async () => {
      const results = await Promise.allSettled(guestProductIds.map((id) => CatalogApi.getProduct(id)));
      return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    },
    enabled: !useServerCart && guestProductIds.length > 0,
  });

  useEffect(() => {
    writeGuestCart(guestLines);
  }, [guestLines]);

  // On sign-in, push anything collected as a guest into the server cart.
  useEffect(() => {
    if (!useServerCart || guestLines.length === 0 || merging) return;
    let cancelled = false;
    (async () => {
      setMerging(true);
      try {
        for (const line of guestLines) {
          await CartApi.addItem(line.variantId, line.quantity).catch(() => undefined);
        }
        if (!cancelled) {
          setGuestLines([]);
          await queryClient.invalidateQueries({ queryKey: qk.cart() });
        }
      } finally {
        if (!cancelled) setMerging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useServerCart, guestLines, merging, queryClient]);

  const items = useMemo<CartItem[]>(() => {
    if (useServerCart) return serverCart.data?.items ?? [];
    return guestLinesToItems(guestLines, guestProducts.data ?? []);
  }, [useServerCart, serverCart.data, guestLines, guestProducts.data]);

  const cart: Cart | undefined = serverCart.data;

  const addItem = useCallback(
    async (input: { variantId: number; productId: number; quantity: number }) => {
      if (useServerCart) {
        const updated = await CartApi.addItem(input.variantId, input.quantity);
        queryClient.setQueryData(qk.cart(), updated);
        return;
      }
      setGuestLines((current) => {
        const existing = current.find((l) => l.variantId === input.variantId);
        if (existing) {
          return current.map((l) =>
            l.variantId === input.variantId ? { ...l, quantity: l.quantity + input.quantity } : l,
          );
        }
        return [...current, input];
      });
    },
    [useServerCart, queryClient],
  );

  const setQuantity = useCallback(
    async (variantId: number, quantity: number) => {
      if (useServerCart) {
        const updated = await CartApi.setQuantity(variantId, quantity);
        queryClient.setQueryData(qk.cart(), updated);
        return;
      }
      setGuestLines((current) =>
        quantity <= 0
          ? current.filter((l) => l.variantId !== variantId)
          : current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
      );
    },
    [useServerCart, queryClient],
  );

  const removeItem = useCallback(
    async (variantId: number) => {
      if (useServerCart) {
        const updated = await CartApi.removeItem(variantId);
        queryClient.setQueryData(qk.cart(), updated);
        return;
      }
      setGuestLines((current) => current.filter((l) => l.variantId !== variantId));
    },
    [useServerCart, queryClient],
  );

  const clear = useCallback(async () => {
    if (useServerCart) {
      const updated = await CartApi.clear();
      queryClient.setQueryData(qk.cart(), updated);
      return;
    }
    setGuestLines([]);
  }, [useServerCart, queryClient]);

  const refresh = useCallback(async () => {
    if (useServerCart) {
      await queryClient.invalidateQueries({ queryKey: qk.cart() });
    } else {
      await queryClient.invalidateQueries({ queryKey: ['guestCartProducts'] });
    }
  }, [useServerCart, queryClient]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = useServerCart
      ? (cart?.subtotal ?? 0)
      : items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      readyForCheckout: items.length > 0 && items.every((item) => item.purchasable),
      isLoading: useServerCart ? serverCart.isLoading : guestProducts.isLoading,
      isGuest: !useServerCart,
      addItem,
      setQuantity,
      removeItem,
      clear,
      refresh,
    };
  }, [
    useServerCart,
    cart,
    items,
    serverCart.isLoading,
    guestProducts.isLoading,
    addItem,
    setQuantity,
    removeItem,
    clear,
    refresh,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}
