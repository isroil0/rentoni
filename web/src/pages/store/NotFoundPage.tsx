import { EmptyState, LinkButton } from '@/components/ui';
import { useT } from '@/i18n';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <EmptyState
        title={t('common.pageNotFound')}
        description={t('common.pageNotFoundBody')}
        action={<LinkButton to="/">{t('common.backToHome')}</LinkButton>}
      />
    </div>
  );
}
