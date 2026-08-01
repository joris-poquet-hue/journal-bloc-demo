import { ReactNode } from 'react';

type SectionCardProps = {
  title?: string;
  description?: string;
  className?: string;
  headerAction?: ReactNode;
  children: ReactNode;
};

export function SectionCard({
  title,
  description,
  className,
  headerAction,
  children,
}: SectionCardProps) {
  return (
    <section className={['section-card', className].filter(Boolean).join(' ')}>
      {title || description || headerAction ? (
        <header className="section-card__header">
          <div className="section-card__header-main">
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {headerAction ? (
            <div className="section-card__header-action">{headerAction}</div>
          ) : null}
        </header>
      ) : null}
      <div className="section-card__content">{children}</div>
    </section>
  );
}
