import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

type InterventionFlowCardProps = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function InterventionFlowCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  children,
}: InterventionFlowCardProps) {
  return (
    <section className={['flow-card', className].filter(Boolean).join(' ')}>
      {title || description || Icon || action ? (
        <header className="flow-card__header">
          <div className="flow-card__heading">
            {Icon ? (
              <span className="flow-card__icon" aria-hidden="true">
                <Icon strokeWidth={2.1} />
              </span>
            ) : null}
            <div className="flow-card__copy">
              {title ? <h2>{title}</h2> : null}
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          {action ? <div className="flow-card__action">{action}</div> : null}
        </header>
      ) : null}

      <div className="flow-card__content">{children}</div>
    </section>
  );
}
