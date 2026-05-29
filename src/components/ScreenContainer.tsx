import { ReactNode } from 'react';

const CHU_NANTES_LOGO_URI =
  'https://www.chu-nantes.fr/medias/photo/chunantes-logosignaturecmjn_1718962320926-png?ID_FICHE=27909&INLINE=FALSE';

type ScreenContainerProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  frameWidth?: 'default' | 'wide';
  children: ReactNode;
};

export function ScreenContainer({
  eyebrow,
  title,
  subtitle,
  frameWidth = 'default',
  children,
}: ScreenContainerProps) {
  return (
    <main className="screen-shell">
      <img
        alt=""
        aria-hidden="true"
        className="screen-shell__brandmark"
        src={CHU_NANTES_LOGO_URI}
      />
      <div
        className={`screen-shell__frame ${
          frameWidth === 'wide' ? 'screen-shell__frame--wide' : ''
        }`.trim()}
      >
        <header className="screen-hero">
          {eyebrow ? <span className="screen-hero__eyebrow">{eyebrow}</span> : null}
          <h1 className="screen-hero__title">{title}</h1>
          {subtitle ? <p className="screen-hero__subtitle">{subtitle}</p> : null}
        </header>
        <div className="screen-body">{children}</div>
      </div>
    </main>
  );
}
