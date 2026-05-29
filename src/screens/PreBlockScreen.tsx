import { useEffect, useState } from 'react';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import { techniqueGuides } from '../data/mockData';
import { TechniqueGuide } from '../types';

type GuideView = 'menu' | TechniqueGuide['id'];
type ExpandedFigure = {
  alt: string;
  caption: string;
  src: string;
};

const geuFigures = {
  anatomy: '/images/geu/anatomie-legendee-geu.png',
  salpingotomy: '/images/geu/salpingotomie-technique-detail.png',
  salpingectomy: '/images/geu/salpingectomie-technique-detail.png',
};

function GuideFigure({
  alt,
  caption,
  onOpen,
  src,
}: {
  alt: string;
  caption: string;
  onOpen: (figure: ExpandedFigure) => void;
  src: string;
}) {
  return (
    <figure className="guide-figure">
      <button
        aria-label="Agrandir l’image"
        className="guide-figure__button"
        onClick={() => onOpen({ alt, caption, src })}
        type="button"
      >
        <img alt={alt} className="guide-figure__image" src={src} />
      </button>
      {caption ? (
        <figcaption className="guide-figure__caption">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function PreBlockScreen() {
  const { backToWelcome } = useAppContext();
  const [view, setView] = useState<GuideView>('menu');
  const [expandedFigure, setExpandedFigure] = useState<ExpandedFigure | null>(null);
  const selectedGuide =
    view === 'menu'
      ? null
      : techniqueGuides.find((guide) => guide.id === view) ?? null;

  useEffect(() => {
    if (!expandedFigure) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedFigure(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedFigure]);

  if (view === 'menu') {
    return (
      <ScreenContainer
        eyebrow="Avant le bloc"
        title="Fiches techniques"
        subtitle="Choisis la fiche de rappels à consulter avant l’intervention."
      >
        <SectionCard
          title="Techniques chirurgicales"
          description={`${techniqueGuides.length} fiches sont déjà disponibles.`}
        >
          <div className="action-stack">
            {techniqueGuides.map((guide) => (
              <PrimaryButton
                key={guide.id}
                label={guide.title}
                onPress={() => setView(guide.id)}
              />
            ))}
          </div>
        </SectionCard>

        <PrimaryButton
          label="Retour à l’accueil"
          onPress={backToWelcome}
          variant="secondary"
        />
      </ScreenContainer>
    );
  }

  if (!selectedGuide) {
    return null;
  }

  if (selectedGuide.kind !== 'geu') {
    return (
      <ScreenContainer
        eyebrow="Avant le bloc"
        title={`${selectedGuide.title} : fiche technique`}
      >
        {(selectedGuide.sections ?? []).map((section) => (
          <SectionCard
            key={section.id}
            className="section-card--guide"
            title={section.title}
          >
            <div className="guide-block">
              {section.subsections.map((subsection) => (
                <div key={subsection.id} className="guide-block__section">
                  {subsection.eyebrow ? (
                    <span className="guide-block__label">{subsection.eyebrow}</span>
                  ) : null}
                  {subsection.title ? (
                    <h3 className="guide-block__subheading">{subsection.title}</h3>
                  ) : null}
                  <div className="guide-text-stack">
                    {subsection.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="guide-block__text">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {subsection.bulletItems?.length ? (
                    <ul className="guide-list">
                      {subsection.bulletItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {subsection.imageSrc ? (
                    <GuideFigure
                      alt={subsection.title || section.title}
                      caption={subsection.imageCaption ?? ''}
                      onOpen={setExpandedFigure}
                      src={subsection.imageSrc}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        ))}

        <div className="action-stack">
          <PrimaryButton
            label="Retour aux fiches"
            onPress={() => setView('menu')}
            variant="secondary"
          />
          <PrimaryButton
            label="Retour à l’accueil"
            onPress={backToWelcome}
            variant="secondary"
          />
        </div>

        {expandedFigure ? (
          <div
            aria-modal="true"
            className="lightbox"
            onClick={() => setExpandedFigure(null)}
            role="dialog"
          >
            <div
              className="lightbox__content"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                aria-label="Fermer l’image agrandie"
                className="lightbox__close"
                onClick={() => setExpandedFigure(null)}
                type="button"
              >
                Fermer
              </button>
              <img
                alt={expandedFigure.alt}
                className="lightbox__image"
                src={expandedFigure.src}
              />
              {expandedFigure.caption ? (
                <p className="lightbox__caption">{expandedFigure.caption}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </ScreenContainer>
    );
  }

  const guide = selectedGuide;

  return (
    <ScreenContainer
      eyebrow="Avant le bloc"
      title="GEU : fiche technique"
      subtitle="Repères synthétiques pour la prise en charge chirurgicale d’une grossesse extra-utérine."
    >
      <SectionCard className="section-card--guide" title="Rappels anatomiques">
        <div className="guide-block">
          <div className="guide-block__section">
            <p className="guide-block__text">
              1. Arcade infratubaire. 2. Artère tubaire médiale. 3. Ligament
              utéro-ovarien. 4. Artère utérine. 5. Artère tubaire latérale. 6.
              ligament infundibulo-ovarien. 7. artère ovarique. 8. ligament
              lombo-ovarien. U. utérus. O. ovaire. T. trompe. M. mésosalpinx.
              ①. Jonction interstitielle. ②. Isthme de la trompe. ③. Ampoule
              tubaire. ④. Infundibulum.
            </p>
          </div>

          <GuideFigure
            alt="Schéma anatomique légendé des repères tubaires et annexiels."
            caption=""
            onOpen={setExpandedFigure}
            src={geuFigures.anatomy}
          />
        </div>
      </SectionCard>

      <SectionCard
        className="section-card--guide"
        title="Salpingectomie vs Salpingotomie"
      >
        <div className="guide-block">
          <div className="guide-block__section">
            <p className="guide-block__text">{guide.comparisonOverview}</p>
          </div>

          <div className="guide-block__section">
            <span className="guide-block__label">Littérature</span>
            <ul className="guide-list">
              {(guide.literatureHighlights ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="section-card--guide" title="Salpingectomie">
        <div className="guide-block">
          <div className="guide-block__section">
            <div className="guide-text-stack">
              {(guide.salpingectomyPrinciples ?? []).map((paragraph) => (
                <p key={paragraph} className="guide-block__text">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <GuideFigure
            alt="Schéma de salpingectomie avec trajet de coagulation-section du mésosalpinx."
            caption=""
            onOpen={setExpandedFigure}
            src={geuFigures.salpingectomy}
          />
        </div>
      </SectionCard>

      <SectionCard className="section-card--guide" title="Salpingotomie">
        <div className="guide-block">
          <div className="guide-block__section">
            <p className="guide-block__text">{guide.salpingotomyTechniqueIntro}</p>
            <ul className="guide-list">
              {(guide.salpingotomyGeneralPrinciples ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="guide-text-stack">
            {(guide.salpingotomyTechniqueParagraphs ?? []).map((paragraph) => (
              <p key={paragraph} className="guide-block__text">
                {paragraph}
              </p>
            ))}
          </div>

          {guide.salpingotomyTechniqueNote ? (
            <p className="guide-block__text">{guide.salpingotomyTechniqueNote}</p>
          ) : null}

          <GuideFigure
            alt="Schéma des temps techniques d’une salpingotomie avec repérage du trophoblaste et de l’hémato-salpinx."
            caption=""
            onOpen={setExpandedFigure}
            src={geuFigures.salpingotomy}
          />
        </div>
      </SectionCard>

      <div className="action-stack">
        <PrimaryButton
          label="Retour aux fiches"
          onPress={() => setView('menu')}
          variant="secondary"
        />
        <PrimaryButton
          label="Retour à l’accueil"
          onPress={backToWelcome}
          variant="secondary"
        />
      </div>

      {expandedFigure ? (
        <div
          aria-modal="true"
          className="lightbox"
          onClick={() => setExpandedFigure(null)}
          role="dialog"
        >
          <div
            className="lightbox__content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Fermer l’image agrandie"
              className="lightbox__close"
              onClick={() => setExpandedFigure(null)}
              type="button"
            >
              Fermer
            </button>
            <img
              alt={expandedFigure.alt}
              className="lightbox__image"
              src={expandedFigure.src}
            />
            {expandedFigure.caption ? (
              <p className="lightbox__caption">{expandedFigure.caption}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
