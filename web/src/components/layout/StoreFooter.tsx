import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { useT } from '@/i18n';

export function StoreFooter() {
  const t = useT();
  const { data: categories } = useQuery({
    queryKey: qk.catalog.categories(),
    queryFn: () => CatalogApi.listCategories(),
    staleTime: 5 * 60_000,
  });

  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-ink-900 text-xs font-bold text-white">
              R
            </span>
            Rentoni
          </div>
          <p className="mt-3 max-w-xs text-sm text-ink-600">{t('app.tagline')}</p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className="text-sm font-semibold text-ink-900">
            {t('footer.shop')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>
              <Link to="/shop" className="hover:text-ink-900">
                {t('footer.allShirts')}
              </Link>
            </li>
            {(categories ?? []).slice(0, 4).map((category) => (
              <li key={category.id}>
                <Link to={`/shop?categoryId=${category.id}`} className="hover:text-ink-900">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-account">
          <h2 id="footer-account" className="text-sm font-semibold text-ink-900">
            {t('footer.account')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>
              <Link to="/account" className="hover:text-ink-900">
                {t('nav.account')}
              </Link>
            </li>
            <li>
              <Link to="/account/orders" className="hover:text-ink-900">
                {t('nav.orders')}
              </Link>
            </li>
            <li>
              <Link to="/account/returns" className="hover:text-ink-900">
                {t('nav.returns')}
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:text-ink-900">
                {t('nav.cart')}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-ink-900">{t('footer.contact')}</h2>
          <address className="mt-3 space-y-2 text-sm not-italic text-ink-600">
            <p>Rentoni Shirts</p>
            <p>
              <a href="mailto:isroil55673600@gmail.com" className="hover:text-ink-900">
                isroil55673600@gmail.com
              </a>
            </p>
            <p>{t('footer.hours')}</p>
          </address>
        </div>
      </div>

      <div className="border-t border-ink-200 px-4 py-5 text-center text-xs text-ink-500 sm:px-6 lg:px-8">
        {t('footer.rights', { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
