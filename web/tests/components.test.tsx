import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { VariantSelector, findVariant } from '@/components/shop/VariantSelector';
import { QuantitySelector } from '@/components/shop/QuantitySelector';
import { AvailabilityBadge } from '@/components/shop/AvailabilityBadge';
import { ProductCard } from '@/components/shop/ProductCard';
import { StatusBadge } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { en } from '@/i18n';
import type { CustomerProduct, CustomerVariant } from '@/api/types';

/**
 * These components now read their copy from the dictionary, so every render needs the
 * provider — exactly as the real app supplies it. English is pinned so the assertions
 * stay readable; `i18n.test.tsx` covers the other languages.
 */
function render(ui: React.ReactNode) {
  return rtlRender(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

const variants: CustomerVariant[] = [
  { id: 1, sku: 'OXF-W-S', color: 'White', size: 'S', price: 30, availability: 'IN_STOCK', inStock: true },
  { id: 2, sku: 'OXF-W-M', color: 'White', size: 'M', price: 30, availability: 'LOW_STOCK', inStock: true },
  { id: 3, sku: 'OXF-B-S', color: 'Black', size: 'S', price: 32, availability: 'OUT_OF_STOCK', inStock: false },
];

describe('VariantSelector', () => {
  it('offers only the sizes that exist for the chosen colour', () => {
    render(
      <VariantSelector variants={variants} color="Black" size={null} onColorChange={vi.fn()} onSizeChange={vi.fn()} />,
    );

    const sizeGroup = screen.getByRole('group', { name: /size/i });
    expect(within(sizeGroup).getByRole('button', { name: /^S/ })).toBeInTheDocument();
    // Black has no M variant, so M is not offered at all.
    expect(within(sizeGroup).queryByRole('button', { name: /^M/ })).not.toBeInTheDocument();
  });

  it('marks a sold-out size for screen readers, not just visually', () => {
    render(
      <VariantSelector variants={variants} color="Black" size="S" onColorChange={vi.fn()} onSizeChange={vi.fn()} />,
    );
    const sizeGroup = screen.getByRole('group', { name: /size/i });
    expect(within(sizeGroup).getByRole('button', { name: /out of stock/i })).toBeInTheDocument();
  });

  it('reports the selection through aria-pressed', async () => {
    const onColorChange = vi.fn();
    render(
      <VariantSelector variants={variants} color="White" size="M" onColorChange={onColorChange} onSizeChange={vi.fn()} />,
    );

    const colorGroup = screen.getByRole('group', { name: /colour/i });
    expect(within(colorGroup).getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(colorGroup).getByRole('button', { name: /Black/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(within(colorGroup).getByRole('button', { name: /Black/ }));
    expect(onColorChange).toHaveBeenCalledWith('Black');
  });

  it('resolves the exact variant for a colour and size pair', () => {
    expect(findVariant(variants, 'White', 'M')?.id).toBe(2);
    expect(findVariant(variants, 'Black', 'M')).toBeNull();
    expect(findVariant(variants, null, 'M')).toBeNull();
  });
});

describe('QuantitySelector', () => {
  it('clamps to the available maximum', async () => {
    const onChange = vi.fn();
    render(<QuantitySelector value={3} max={3} onChange={onChange} />);

    const increase = screen.getByRole('button', { name: /increase/i });
    expect(increase).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /decrease/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('never goes below the minimum', () => {
    render(<QuantitySelector value={1} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
  });

  it('labels the field for assistive technology', () => {
    render(<QuantitySelector value={2} onChange={vi.fn()} label="Quantity for OXF-W-M" />);
    expect(screen.getByLabelText('Quantity for OXF-W-M')).toHaveValue(2);
  });
});

describe('AvailabilityBadge', () => {
  it('never reveals an exact count unless one is supplied', () => {
    const { unmount: a } = render(<AvailabilityBadge status="LOW_STOCK" />);
    expect(screen.getByText('Only a few left')).toBeInTheDocument();
    a();

    const { unmount: b } = render(<AvailabilityBadge status="LOW_STOCK" quantity={3} />);
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
    b();

    render(<AvailabilityBadge status="OUT_OF_STOCK" />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('always renders a word, so colour is never the only signal', () => {
    const expected: Record<string, string> = {
      PENDING: en.orderStatus.PENDING,
      COMPLETED: en.orderStatus.COMPLETED,
      CANCELLED: en.orderStatus.CANCELLED,
      REFUNDED: en.orderStatus.REFUNDED,
      OUT_OF_STOCK: en.stockStatus.OUT_OF_STOCK,
    };
    for (const [status, label] of Object.entries(expected)) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('ProductCard', () => {
  const product: CustomerProduct = {
    id: 7,
    name: 'Oxford Classic Shirt',
    description: 'Timeless button-down',
    brand: 'Rentoni',
    category: { id: 1, name: 'Formal Shirts' },
    images: [],
    colors: ['White', 'Black'],
    sizes: ['S', 'M'],
    priceFrom: 30,
    priceTo: 32,
    availability: 'IN_STOCK',
    variants,
  };

  it('shows name, price range, colours and sizes — and no cost price', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Oxford Classic Shirt' })).toBeInTheDocument();
    expect(screen.getByText(`${formatMoney(30)} – ${formatMoney(32)}`)).toBeInTheDocument();
    expect(screen.getByText('White · Black')).toBeInTheDocument();
    expect(screen.getByText('S · M')).toBeInTheDocument();

    // Nothing in the rendered card exposes internal pricing.
    expect(document.body.textContent).not.toContain('Cost');
    expect(document.body.textContent).not.toContain('Margin');
  });

  it('flags a sold-out product', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...product, availability: 'OUT_OF_STOCK' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });
});
