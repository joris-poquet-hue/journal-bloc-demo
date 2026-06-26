import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

type InterventionFlowLayoutProps = {
  step: 1 | 2 | 3;
  title: string;
  subtitle: string;
  onBack: () => void;
  children: ReactNode;
};

export function InterventionFlowLayout({
  step,
  title,
  subtitle,
  onBack,
  children,
}: InterventionFlowLayoutProps) {
  return (
    <main className="screen-shell intervention-flow">
      <div className="screen-shell__frame intervention-flow__frame">
        <header className="intervention-flow__header">
          <button
            aria-label="Retour"
            className="intervention-flow__back"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" strokeWidth={2.4} />
          </button>

          <div className="intervention-flow__progress" aria-hidden="true">
            <span className="intervention-flow__progress-line" />
            {[1, 2, 3].map((item) => (
              <span
                className={`intervention-flow__progress-dot ${
                  item < step
                    ? 'intervention-flow__progress-dot--complete'
                    : ''
                } ${item === step ? 'intervention-flow__progress-dot--active' : ''}`.trim()}
                key={item}
              />
            ))}
          </div>

          <span className="intervention-flow__step-label">Étape {step} sur 3</span>
          <h1 className="intervention-flow__title">{title}</h1>
          <p className="intervention-flow__subtitle">{subtitle}</p>
        </header>

        <div className="screen-body intervention-flow__body">{children}</div>
      </div>
    </main>
  );
}
