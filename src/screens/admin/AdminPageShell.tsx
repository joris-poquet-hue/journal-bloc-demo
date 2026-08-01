import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { ScreenContainer } from '../../components/ScreenContainer';

export function AdminPageShell({
  title,
  subtitle,
  children,
  backLabel,
  onBack,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <ScreenContainer
      bodyClassName="admin-workspace__body"
      frameClassName="admin-workspace__frame"
      frameWidth="wide"
      heroClassName="admin-workspace__hero"
      heroTop={
        onBack ? (
          <button className="admin-breadcrumb-button" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" />
            <span>{backLabel ?? 'Retour'}</span>
          </button>
        ) : undefined
      }
      hideBrandmark
      shellClassName="admin-workspace"
      subtitle={subtitle}
      title={title}
    >
      {children}
    </ScreenContainer>
  );
}
