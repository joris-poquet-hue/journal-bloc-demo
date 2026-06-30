import { Info, LucideProps } from 'lucide-react';
import { Children, ComponentType, ReactNode, useState } from 'react';

type InterventionFlowCardProps = {
  title?: string;
  description?: string;
  icon?: ComponentType<LucideProps>;
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
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const hasContent = Children.toArray(children).length > 0;

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
              {title || description ? (
                <div className="flow-card__title-row">
                  {title ? <h2>{title}</h2> : null}
                  {description ? (
                    <span
                      className={`flow-card__info ${
                        isInfoOpen ? 'flow-card__info--open' : ''
                      }`.trim()}
                    >
                      <button
                        aria-expanded={isInfoOpen}
                        aria-label={`Informations sur ${title ?? 'cette section'}`}
                        className="flow-card__info-button"
                        onBlur={() => setIsInfoOpen(false)}
                        onClick={() => setIsInfoOpen((current) => !current)}
                        onMouseLeave={() => setIsInfoOpen(false)}
                        type="button"
                      >
                        <Info aria-hidden="true" strokeWidth={2.1} />
                      </button>
                      <span className="flow-card__info-tooltip" role="note">
                        {description}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {action ? <div className="flow-card__action">{action}</div> : null}
        </header>
      ) : null}

      {hasContent ? <div className="flow-card__content">{children}</div> : null}
    </section>
  );
}
