import { ReactNode } from 'react';

const CHU_NANTES_LOGO_URI =
  'https://www.chu-nantes.fr/medias/photo/chunantes-logosignaturecmjn_1718962320926-png?ID_FICHE=27909&INLINE=FALSE';

type ScreenContainerProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  frameWidth?: 'default' | 'wide';
  hideBrandmark?: boolean;
  shellClassName?: string;
  frameClassName?: string;
  heroClassName?: string;
  bodyClassName?: string;
  heroTop?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
};

export function ScreenContainer({
  eyebrow,
  title,
  subtitle,
  frameWidth = 'default',
  hideBrandmark = false,
  shellClassName,
  frameClassName,
  heroClassName,
  bodyClassName,
  heroTop,
  headerAction,
  children,
}: ScreenContainerProps) {
  const hasHeroCopy = Boolean(eyebrow || title || subtitle);

  return (
    <main className={['screen-shell', shellClassName].filter(Boolean).join(' ')}>
      {hideBrandmark ? null : (
        <img
          alt=""
          aria-hidden="true"
          className="screen-shell__brandmark"
          src={CHU_NANTES_LOGO_URI}
        />
      )}
      <div
        className={[
          'screen-shell__frame',
          frameWidth === 'wide' ? 'screen-shell__frame--wide' : '',
          frameClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <header className={['screen-hero', heroClassName].filter(Boolean).join(' ')}>
          {heroTop}
          <div
            className={[
              'screen-hero__row',
              headerAction ? 'screen-hero__row--with-action' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {hasHeroCopy ? (
              <div className="screen-hero__copy">
                {eyebrow ? <span className="screen-hero__eyebrow">{eyebrow}</span> : null}
                {title ? <h1 className="screen-hero__title">{title}</h1> : null}
                {subtitle ? <p className="screen-hero__subtitle">{subtitle}</p> : null}
              </div>
            ) : null}
            {headerAction ? (
              <div className="screen-hero__action">{headerAction}</div>
            ) : null}
          </div>
        </header>
        <div className={['screen-body', bodyClassName].filter(Boolean).join(' ')}>
          {children}
        </div>
      </div>
    </main>
  );
}
