import { ReactNode } from 'react';

type SectionCardProps = {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  description,
  className,
  children,
}: SectionCardProps) {
  return (
    <section className={['section-card', className].filter(Boolean).join(' ')}>
      {title || description ? (
        <header className="section-card__header">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div className="section-card__content">{children}</div>
    </section>
  );
}
