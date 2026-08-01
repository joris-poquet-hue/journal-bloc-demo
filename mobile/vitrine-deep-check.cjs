const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shellPath = path.join(__dirname, 'WebAppShell.tsx');
const screenshotDirectory =
  process.env.MONJDB_VITRINE_SCREENSHOT_DIR || '/private/tmp/monjdb-vitrine-audit';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

fs.mkdirSync(screenshotDirectory, { recursive: true });

function extractNativeScript() {
  const source = fs.readFileSync(shellPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    'WebAppShell.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let expression = '';

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'NATIVE_CONTEXT_SCRIPT' &&
      node.initializer
    ) {
      expression = node.initializer.getText(sourceFile);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!expression) {
    throw new Error('NATIVE_CONTEXT_SCRIPT introuvable.');
  }

  return Function(
    'Platform',
    'NATIVE_SUPABASE_CONFIG',
    `return ${expression}`
  )(
    { OS: 'ios' },
    { anonKey: 'fixture-anon-key', url: 'https://fixture.local' }
  );
}

function createCard({ image, progress, title, unlocked = true }) {
  const progressMarkup = progress
    ? `<div aria-label="${progress.current} sur ${progress.target}" aria-valuemax="${progress.target}" aria-valuemin="0" aria-valuenow="${progress.current}" class="internal-trophy-card__progress" role="progressbar"><span style="width:${Math.round((progress.current / progress.target) * 100)}%"></span></div>`
    : '';
  const visualMarkup = image
    ? `<img alt="${title}" class="internal-trophy-card__image" src="${image}">`
    : '<div aria-hidden="true" class="internal-trophy-card__mystery">?</div>';

  return `<article class="internal-trophy-card internal-trophy-card--${
    unlocked ? 'unlocked' : 'locked'
  }"><button aria-label="Voir le détail du trophée ${title}" class="internal-trophy-card__trigger" type="button"></button><div class="internal-trophy-card__visual">${visualMarkup}</div><div class="internal-trophy-card__copy"><strong>${title}</strong>${progressMarkup}</div></article>`;
}

function createFixtureHtml() {
  const assets = 'http://127.0.0.1:5173/images/badges';
  const firstMeeting = `${assets}/colpocleisis-as.png`;
  const silver = `${assets}/salpingectomie-operateur-principal-10.png`;
  const earnedCards = [
    createCard({ image: firstMeeting, title: 'Première rencontre' }),
    createCard({ image: silver, title: 'Salpingectomie' }),
  ].join('');
  const progressCard = createCard({
    progress: { current: 12, target: 30 },
    title: 'Salpingectomie',
    unlocked: false,
  });

  return `<!doctype html>
  <html lang="fr-FR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
      <link rel="stylesheet" href="http://127.0.0.1:5173/src/styles.css">
      <title>Audit vitrine mobile</title>
    </head>
    <body>
      <div id="root">
        <div class="app-shell app-shell--with-bottom-nav">
          <main class="screen-shell trophy-screen">
            <div class="screen-shell__frame trophy-screen__frame">
              <section class="screen-hero">
                <button class="trophy-screen__back" type="button">Retour</button>
                <div class="screen-hero__row screen-hero__row--with-action">
                  <div class="screen-hero__copy">
                    <h1 class="screen-hero__title">Mes trophées</h1>
                    <p class="screen-hero__subtitle">Les trophées obtenus lors de ta progression au bloc.</p>
                  </div>
                  <div class="trophy-hero-illustration"></div>
                </div>
              </section>
              <div class="screen-body trophy-screen__body">
                <section class="trophy-summary-card">
                  <div class="trophy-summary-card__item"><div class="trophy-summary-card__icon trophy-summary-card__icon--gold"></div><div class="trophy-summary-card__copy"><strong>2</strong><span>débloqués</span></div></div>
                  <div class="trophy-summary-card__divider"></div>
                  <div class="trophy-summary-card__item"><div class="trophy-summary-card__icon trophy-summary-card__icon--clock"></div><div class="trophy-summary-card__copy"><strong>1</strong><span>en cours</span></div></div>
                </section>
                <section class="trophy-section" data-fixture-section="earned">
                  <header class="trophy-section__header"><h2>Mes trophées remportées</h2><button class="trophy-section__link" type="button">Voir tout</button></header>
                  <div class="trophy-card-grid">${earnedCards}</div>
                </section>
                <section class="trophy-section" data-fixture-section="progress">
                  <header class="trophy-section__header"><h2>Mes trophées en cours</h2><button class="trophy-section__link" type="button">Voir tout</button></header>
                  <div class="trophy-card-grid">${progressCard}</div>
                </section>
              </div>
            </div>
          </main>
          <nav class="bottom-nav">
            <button class="bottom-nav__item bottom-nav__item--active" type="button"><span>Accueil</span></button>
            <button class="bottom-nav__item" type="button"><span>Progression</span></button>
            <button class="bottom-nav__add" type="button"><span class="bottom-nav__add-circle">+</span><span class="bottom-nav__add-label">Ajouter</span></button>
            <button class="bottom-nav__item" type="button"><span>Fiches</span></button>
            <button class="bottom-nav__item" type="button"><span>Profil</span></button>
          </nav>
        </div>
      </div>
      <section data-fixture-history-score="true" style="position:absolute;left:0;top:0;width:300px;padding:16px;box-sizing:border-box;background:#fff;">
        <div class="history-score-card">
          <div class="history-score-gauge" style="--history-score: 42%"><span>42%</span></div>
          <div class="history-score-card__copy">
            <div class="history-score-trend history-score-trend--empty">
              <p>Vous n'avez pas encore enregistré assez d'interventions pour évaluer votre progression</p>
            </div>
          </div>
        </div>
      </section>
      <section data-fixture-senior-evaluation="true" style="position:absolute;left:0;top:160px;width:300px;padding:16px;box-sizing:border-box;background:#fff;">
        <div class="history-senior-evaluation">
          <div class="history-senior-evaluation__row">
            <span>Difficulté de l’intervention</span>
            <strong class="history-difficulty-badge"><span class="history-difficulty-badge__label">Standard</span></strong>
          </div>
          <div class="history-senior-evaluation__row">
            <span>Performance de l’interne</span>
            <strong class="history-info-badge history-info-badge--performance"><span>Performance intermédiaire</span></strong>
          </div>
        </div>
      </section>
      <main class="screen-shell" data-fixture-history-detail="true" style="position:absolute;left:0;top:320px;width:375px;box-sizing:border-box;background:#f4fafb;">
        <div class="screen-shell__frame">
          <header class="screen-hero">
            <div class="screen-hero__row">
              <div class="screen-hero__copy">
                <h1 class="screen-hero__title">Détail de l’intervention</h1>
              </div>
            </div>
          </header>
          <div class="screen-body">
            <button class="history-back-button" data-fixture-original-back="true" type="button">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg>
              <span>Retour</span>
            </button>
            <section class="section-card history-detail-card">
              <div class="section-card__content">
                <div class="history-detail-card__header">
                  <div class="approach-icon"></div>
                  <div>
                    <h2>Salpingectomie</h2>
                    <span>Cœlioscopie</span>
                  </div>
                  <span class="dashboard-status-pill dashboard-status-pill--valid">Évaluée</span>
                </div>
                <div class="history-detail-grid">
                  <div class="history-detail-row"><span>Date et heure</span><strong>17/07/2026 · 08:45</strong></div>
                  <div class="history-detail-row"><span>Senior</span><strong>Dr Marie Dupont</strong></div>
                  <div class="history-detail-row"><span>Intervention</span><strong>Salpingectomie</strong></div>
                  <div class="history-detail-row"><span>Indication</span><strong>Grossesse extra-utérine</strong></div>
                  <div class="history-detail-row"><span>Voie d’abord</span><strong>Cœlioscopie</strong></div>
                </div>
              </div>
            </section>
            <section class="section-card">
              <header class="section-card__header"><div class="section-card__header-main"><h2>Score d’autonomie opératoire</h2></div></header>
              <div class="section-card__content"><div class="history-score-card"></div></div>
            </section>
            <section class="section-card">
              <header class="section-card__header"><div class="section-card__header-main"><h2>Auto-évaluation de l’interne</h2></div></header>
              <div class="section-card__content"><div class="history-step-list"></div></div>
            </section>
            <section class="section-card">
              <header class="section-card__header"><div class="section-card__header-main"><h2>Évaluation du senior</h2></div></header>
              <div class="section-card__content">
                <div class="history-senior-evaluation">
                  <div class="history-senior-evaluation__row"><span>Difficulté de l’intervention</span><strong>Standard</strong></div>
                  <div class="history-senior-evaluation__row"><span>Performance globale de l’interne</span><strong>Performance intermédiaire</strong></div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <script>
        window.localStorage.setItem('journal-bord:supabase-session:v1', JSON.stringify({ access_token: 'fixture-token', user: { id: 'fixture-user' } }));
        document.querySelector('[data-fixture-original-back]').addEventListener('click', () => {
          document.documentElement.dataset.fixtureBackClicked = 'true';
        });
        document.addEventListener('click', (event) => {
          const trigger = event.target.closest('.internal-trophy-card__trigger');
          const card = trigger?.closest('.internal-trophy-card');

          if (
            !trigger ||
            !card ||
            card.classList.contains('monjdb-native-earned-tier-card') ||
            card.classList.contains('monjdb-native-next-tier-card')
          ) {
            return;
          }

          const title = card.querySelector('.internal-trophy-card__copy strong')?.textContent?.trim() || 'Trophée';
          const image = card.querySelector('.internal-trophy-card__image')?.src || '';
          const backdrop = document.createElement('div');
          backdrop.className = 'trophy-detail-backdrop';
          const detailText = card.querySelector('.internal-trophy-card__progress')
            ? 'Prochain palier : Or · 12 sur 30 interventions'
            : 'Niveau Argent · Palier Argent débloqué.';
          backdrop.innerHTML = '<section aria-modal="true" class="trophy-detail-dialog" role="dialog"><button aria-label="Fermer le détail du trophée" class="trophy-detail-dialog__close" type="button">×</button><div class="trophy-detail-dialog__visual">' + (image ? '<img alt="" src="' + image + '">' : '') + '</div><div class="trophy-detail-dialog__copy"><h2>' + title + '</h2><p>' + detailText + '</p><time class="trophy-detail-dialog__date" datetime="2026-07-10T08:00:00.000Z">10 juillet 2026</time></div></section>';
          const close = () => backdrop.remove();
          backdrop.addEventListener('click', close);
          backdrop.querySelector('.trophy-detail-dialog').addEventListener('click', (detailEvent) => detailEvent.stopPropagation());
          backdrop.querySelector('.trophy-detail-dialog__close').addEventListener('click', close);
          card.after(backdrop);
        });
        window.openFixtureCollection = () => {
          document.querySelector('.account-sheet-backdrop')?.remove();
          const backdrop = document.createElement('div');
          backdrop.className = 'account-sheet-backdrop';
          backdrop.innerHTML = '<div aria-modal="true" class="account-sheet trophy-section-sheet" role="dialog"><div class="account-sheet__header"><div class="account-sheet__heading"><span>Mes trophées</span><h3>Mes trophées remportées</h3></div><button aria-label="Fermer la fenêtre" class="account-sheet__close" type="button">×</button></div><div class="trophy-section-sheet__grid">${earnedCards}</div></div>';
          backdrop.querySelector('.account-sheet__close').addEventListener('click', () => backdrop.remove());
          document.body.append(backdrop);
        };
        document.querySelector('[data-fixture-section="earned"] .trophy-section__link').addEventListener('click', window.openFixtureCollection);
      </script>
    </body>
  </html>`;
}

function fixtureApiPayload(url) {
  const parsed = new URL(url);
  const pathName = parsed.pathname;
  const assets = 'http://127.0.0.1:5173/images/badges';

  if (pathName.endsWith('/profiles')) {
    return [
      {
        created_at: '2026-01-01T08:00:00.000Z',
        id: 'fixture-profile',
        last_login_at: '2026-07-15T08:00:00.000Z',
      },
    ];
  }

  if (pathName.endsWith('/trophy_definitions')) {
    return [
      {
        id: 'first-meeting',
        title: 'Première rencontre',
        definition: {
          conditions: [{ type: 'profile_login_count' }],
          description: 'Première connexion.',
        },
      },
      {
        id: 'salpingectomy-levels',
        title: 'Salpingectomie',
        definition: {
          associatedProcedure: 'salpingectomy',
          description: 'Progression en salpingectomie.',
          format: 'levels',
          levels: [
            { imageSrc: `${assets}/salpingectomie-operateur-principal-1.png`, label: 'Bronze', threshold: 1, tier: 'bronze' },
            { imageSrc: `${assets}/salpingectomie-operateur-principal-10.png`, label: 'Argent', threshold: 10, tier: 'silver' },
            { imageSrc: `${assets}/salpingectomie-operateur-principal-20.png`, label: 'Or', threshold: 30, tier: 'gold' },
          ],
          operativeScope: 'procedure',
          trackedRole: 'primary_operator',
        },
      },
    ];
  }

  if (pathName.endsWith('/interventions')) {
    return Array.from({ length: 12 }, (_, index) => ({
      approach: 'laparoscopy',
      autonomy_score: 3,
      id: `fixture-intervention-${index + 1}`,
      indication: 'fixture',
      intervention_date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      procedure_id: 'salpingectomy',
      role: 'primary_operator',
      saved_at: `2026-07-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
    }));
  }

  if (pathName.endsWith('/intervention_evaluations')) {
    return [];
  }

  if (pathName.endsWith('/trophy_awards')) {
    return [
      { awarded_at: '2026-01-01T08:00:00.000Z', trophy_id: 'first-meeting' },
      { awarded_at: '2026-07-10T08:00:00.000Z', trophy_id: 'salpingectomy-levels' },
    ];
  }

  return [];
}

async function measurePage(page) {
  return page.evaluate(() => {
    const earnedGrid = document.querySelector(
      '[data-fixture-section="earned"] .trophy-card-grid'
    );
    const progressGrid = document.querySelector(
      '[data-fixture-section="progress"] .trophy-card-grid'
    );
    const cards = Array.from(
      earnedGrid.querySelectorAll(':scope > .internal-trophy-card')
    );
    const allProgressSections = Array.from(
      document.querySelectorAll('.trophy-screen .trophy-section')
    ).filter((section) => {
      const heading =
        section
          .querySelector('.trophy-section__header h2')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim()
          .toLocaleLowerCase('fr-FR') || '';
      return (
        heading.includes('en cours') ||
        Boolean(section.querySelector('.internal-trophy-card__progress'))
      );
    });
    const lastSection = document.querySelector(
      '.trophy-screen .trophy-section:last-of-type'
    );
    const lastSectionBottom = lastSection.getBoundingClientRect().bottom + scrollY;
    const elementMetrics = Array.from(document.querySelectorAll('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          bottom: rect.bottom + scrollY,
          className: String(element.className || '').slice(0, 120),
          height: rect.height,
          position: style.position,
          tagName: element.tagName,
          top: rect.top + scrollY,
        };
      })
      .sort((left, right) => right.bottom - left.bottom)
      .slice(0, 12);

    return {
      bodyClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.documentElement.scrollWidth,
      allProgressSectionCount: allProgressSections.length,
      allProgressSectionClasses: allProgressSections.map(
        (section) => section.className
      ),
      cardHeights: cards.map((card) => card.getBoundingClientRect().height),
      cardWidths: cards.map((card) => card.getBoundingClientRect().width),
      documentHeight: document.documentElement.scrollHeight,
      earnedCardCount: cards.length,
      earnedClientWidth: earnedGrid.clientWidth,
      earnedGridLeft: earnedGrid.getBoundingClientRect().left,
      earnedScrollWidth: earnedGrid.scrollWidth,
      earnedScrollLeft: earnedGrid.scrollLeft,
      earnedTitle:
        document.querySelector(
          '[data-fixture-section="earned"] .trophy-section__header h2'
        )?.textContent?.trim() || '',
      earnedVisualOrder: cards
        .map((card) => ({
          awardedAt: card.dataset.awardedAt || '',
          className: card.className,
          left: card.getBoundingClientRect().left,
          order: Number(getComputedStyle(card).order) || 0,
          title:
            card.querySelector('.internal-trophy-card__copy strong')?.textContent?.trim() || '',
        }))
        .sort((left, right) => left.left - right.left),
      extraAfterContent: document.documentElement.scrollHeight - lastSectionBottom,
      imageBoxes: cards.map((card) => {
        const image = card.querySelector('.internal-trophy-card__image');
        const rect = image?.getBoundingClientRect();
        const style = image ? getComputedStyle(image) : null;
        return rect
          ? {
              computedHeight: style.height,
              computedWidth: style.width,
              height: rect.height,
              transform: style.transform,
              width: rect.width,
            }
          : null;
      }),
      lowestElements: elementMetrics,
      progressCardCount: progressGrid.querySelectorAll(
        ':scope > .internal-trophy-card'
      ).length,
      progressCards: Array.from(
        progressGrid.querySelectorAll(':scope > .internal-trophy-card')
      ).map((card) => ({
        className: card.className,
        title:
          card.querySelector('.internal-trophy-card__copy strong')?.textContent?.trim() || '',
      })),
      progressShowAllVisible: Boolean(
        document.querySelector(
          '[data-fixture-section="progress"] .trophy-section__link:not(.monjdb-native-hidden-progress-show-all)'
        )
      ),
      summaryEarned:
        document.querySelector('.trophy-summary-card__item:first-child strong')
          ?.textContent?.trim() || '',
      summaryProgress:
        document.querySelector('.trophy-summary-card__item:last-child strong')
          ?.textContent?.trim() || '',
    };
  });
}

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function runViewport(browser, nativeScript, viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  console.log(`[${label}] démarrage`);
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1 MonJournalDeBlocMobile/1.0',
    viewport,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.route('http://127.0.0.1:5173/__vitrine_fixture__', (route) =>
    route.fulfill({ contentType: 'text/html', body: createFixtureHtml() })
  );
  await page.route('https://fixture.local/**', (route) =>
    route.fulfill({
      body: JSON.stringify(fixtureApiPayload(route.request().url())),
      contentType: 'application/json',
      status: 200,
    })
  );
  await page.goto('http://127.0.0.1:5173/__vitrine_fixture__', {
    waitUntil: 'networkidle',
  });
  console.log(`[${label}] fixture chargée`);
  await page.evaluate(nativeScript);
  console.log(`[${label}] script mobile injecté`);
  await page.waitForSelector('.monjdb-native-earned-tier-card');
  await page.waitForTimeout(100);
  console.log(`[${label}] trophées synchronisés`);

  const emptyScoreLayout = await page.evaluate(() => {
    const fixture = document.querySelector('[data-fixture-history-score]');
    const card = fixture.querySelector('.history-score-card');
    const gauge = fixture.querySelector('.history-score-gauge');
    const copy = fixture.querySelector('.history-score-card__copy');
    const message = fixture.querySelector('p');
    const gaugeRect = gauge.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const result = {
      gridTemplateColumns: getComputedStyle(card).gridTemplateColumns,
      message: message.textContent.trim(),
      messageAtRight: copyRect.left >= gaugeRect.right,
      verticallyAligned:
        Math.abs(
          gaugeRect.top + gaugeRect.height / 2 -
            (copyRect.top + copyRect.height / 2)
        ) <= 2,
    };
    fixture.remove();
    return result;
  });
  assert(
    emptyScoreLayout.message ===
      "Votre progression n'est pas encore disponible",
    'Le message de progression indisponible doit être raccourci.',
    emptyScoreLayout,
  );
  assert(
    emptyScoreLayout.messageAtRight,
    'Le message de progression doit être affiché à droite du cercle.',
    emptyScoreLayout,
  );
  assert(
    emptyScoreLayout.verticallyAligned,
    'Le message de progression doit être centré avec le cercle.',
    emptyScoreLayout,
  );
  console.log(`[${label}] message de progression indisponible validé`);

  const seniorEvaluationLayout = await page.evaluate(() => {
    const fixture = document.querySelector(
      '[data-fixture-senior-evaluation]'
    );
    const rows = Array.from(
      fixture.querySelectorAll('.history-senior-evaluation__row')
    ).map((row) => {
      const labelRect = row.querySelector(':scope > span').getBoundingClientRect();
      const answerRect = row.querySelector(':scope > strong').getBoundingClientRect();
      return {
        answerBelow: answerRect.top >= labelRect.bottom,
        leftAligned: Math.abs(answerRect.left - labelRect.left) <= 1,
      };
    });
    fixture.remove();
    return rows;
  });
  assert(
    seniorEvaluationLayout.every((row) => row.answerBelow),
    'Chaque réponse senior doit apparaître sous son libellé.',
    seniorEvaluationLayout,
  );
  assert(
    seniorEvaluationLayout.every((row) => row.leftAligned),
    'Chaque réponse senior doit être alignée avec son libellé.',
    seniorEvaluationLayout,
  );
  console.log(`[${label}] évaluation senior verticale validée`);

  const historyDetailLayout = await page.evaluate(() => {
    const fixture = document.querySelector('[data-fixture-history-detail]');
    const hero = fixture.querySelector('.screen-hero');
    const detailCard = fixture.querySelector('.history-detail-card');
    const summary = detailCard.querySelector('.history-detail-card__summary');
    const visibleRowLabels = Array.from(
      detailCard.querySelectorAll('.history-detail-row')
    )
      .filter((row) => getComputedStyle(row).display !== 'none')
      .map((row) => row.querySelector(':scope > span').textContent.trim());
    const orderedSections = Array.from(
      fixture.querySelectorAll('.screen-body > .section-card')
    )
      .map((section) => ({
        order: Number(getComputedStyle(section).order) || 0,
        title:
          section.querySelector('.section-card__header-main h2')?.textContent.trim() ||
          (section.classList.contains('history-detail-card') ? 'Détail' : ''),
      }))
      .sort((left, right) => left.order - right.order)
      .map((section) => section.title);
    const performanceLabel = Array.from(
      fixture.querySelectorAll('.history-senior-evaluation__row > span')
    )
      .map((element) => element.textContent.trim())
      .find((text) => text.startsWith('Performance'));

    return {
      backInHero: Boolean(
        hero.querySelector(':scope > .monjdb-native-history-back-button')
      ),
      date: summary?.querySelector('.history-detail-card__date')?.textContent.trim(),
      orderedSections,
      performanceLabel,
      senior: summary?.querySelector('.history-detail-card__senior')?.textContent.trim(),
      statusHidden:
        getComputedStyle(
          detailCard.querySelector('.dashboard-status-pill')
        ).display === 'none',
      visibleRowLabels,
    };
  });
  assert(
    historyDetailLayout.backInHero,
    'Le bouton Retour doit reprendre la position du bouton de la vitrine.',
    historyDetailLayout,
  );
  assert(
    historyDetailLayout.date === '17/07/2026 · 08:45' &&
      historyDetailLayout.senior === 'Dr Marie Dupont',
    'La date et le senior doivent être regroupés dans le résumé.',
    historyDetailLayout,
  );
  assert(
    historyDetailLayout.statusHidden,
    'Le statut Évaluée ne doit plus alourdir la carte résumé.',
    historyDetailLayout,
  );
  assert(
    JSON.stringify(historyDetailLayout.visibleRowLabels) ===
      JSON.stringify(['Indication', 'Voie d’abord']),
    'Seules l’indication et la voie d’abord doivent rester dans la grille.',
    historyDetailLayout,
  );
  assert(
    JSON.stringify(historyDetailLayout.orderedSections) ===
      JSON.stringify([
        'Détail',
        'Score d’autonomie opératoire',
        'Évaluation du senior',
        'Auto-évaluation de l’interne',
      ]),
    'Les sections du détail doivent suivre la hiérarchie de la maquette app.',
    historyDetailLayout,
  );
  assert(
    historyDetailLayout.performanceLabel === 'Performance de l’interne',
    'Le libellé Performance de l’interne doit être utilisé dans l’app.',
    historyDetailLayout,
  );
  await page
    .locator(
      '[data-fixture-history-detail] .monjdb-native-history-back-button'
    )
    .click();
  assert(
    (await page.getAttribute('html', 'data-fixture-back-clicked')) === 'true',
    'Le bouton Retour injecté doit conserver le comportement du bouton original.',
  );
  await page.evaluate(() => {
    document.querySelector('[data-fixture-history-detail]')?.remove();
    delete document.documentElement.dataset.fixtureBackClicked;
  });
  console.log(`[${label}] détail d’intervention app validé`);

  const initial = await measurePage(page);
  assert(initial.earnedCardCount === 3, 'La vitrine doit afficher trois trophées remportés.', initial);
  assert(initial.earnedTitle === 'Mes trophées remportés', 'Le titre de la section remportée doit être accordé au masculin.', initial);
  assert(initial.progressCardCount === 1, 'La vitrine doit afficher un seul trophée en cours.', initial);
  assert(initial.allProgressSectionCount === 1, 'La vitrine ne doit contenir qu’une seule section de trophées en cours.', initial);
  assert(!initial.progressShowAllVisible, 'Voir tout doit rester masqué pour les trophées en cours.', initial);
  assert(new Set(initial.cardHeights.map(Math.round)).size === 1, 'Les cartes remportées doivent avoir la même hauteur.', initial);
  assert(new Set(initial.cardWidths.map(Math.round)).size === 1, 'Les cartes remportées doivent avoir la même largeur.', initial);
  assert(initial.earnedScrollWidth > initial.earnedClientWidth, 'Le carrousel remporté doit défiler horizontalement.', initial);
  assert(initial.earnedScrollLeft <= 2, 'Le carrousel remporté doit démarrer sur le trophée le plus récent.', initial);
  assert(
    Math.abs(
      initial.earnedVisualOrder[0].left - initial.earnedGridLeft
    ) <= 1,
    'Le trophée le plus récent doit être entièrement visible au bord gauche.',
    initial,
  );
  assert(initial.summaryEarned === '3', 'Le compteur remporté doit correspondre exactement aux trois cartes.', initial);
  assert(initial.summaryProgress === '1', 'Le compteur en cours doit correspondre exactement à la carte affichée.', initial);
  assert(
    initial.earnedVisualOrder.map((item) => item.awardedAt).join('|') ===
      [
        '2026-07-10T08:00:00.000Z',
        '2026-07-01T08:00:00.000Z',
        '2026-01-01T08:00:00.000Z',
      ].join('|'),
    'Les trophées remportés doivent être classés du plus récent au plus ancien.',
    initial,
  );
  assert(initial.bodyScrollWidth <= initial.bodyClientWidth + 1, 'La page ne doit pas déborder horizontalement.', initial);
  assert(initial.extraAfterContent <= 125, 'La page contient trop de vide sous la dernière section.', initial);
  console.log(`[${label}] page principale validée`);

  const mainGridBeforeDetail = await page.evaluate(() => {
    const grid = document.querySelector(
      '[data-fixture-section="earned"] .trophy-card-grid'
    );
    return { clientWidth: grid.clientWidth, scrollWidth: grid.scrollWidth };
  });
  await page
    .locator(
      '[data-fixture-section="earned"] .internal-trophy-card:not(.monjdb-native-earned-tier-card) .internal-trophy-card__trigger'
    )
    .first()
    .click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop');
  const mainDetail = await page.evaluate(() => {
    const backdrop = document.querySelector(
      '.monjdb-native-portal-detail-backdrop'
    );
    const source = document.querySelector(
      '.trophy-detail-backdrop[data-monjdb-native-detail-source="true"]'
    );
    const dialog = backdrop.querySelector('.trophy-detail-dialog');
    const backdropRect = backdrop.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const grid = document.querySelector(
      '[data-fixture-section="earned"] .trophy-card-grid'
    );
    return {
      backdrop: {
        bottom: backdropRect.bottom,
        height: backdropRect.height,
        left: backdropRect.left,
        position: getComputedStyle(backdrop).position,
        right: backdropRect.right,
        top: backdropRect.top,
        width: backdropRect.width,
      },
      dialog: {
        bottom: dialogRect.bottom,
        height: dialogRect.height,
        left: dialogRect.left,
        right: dialogRect.right,
        top: dialogRect.top,
        width: dialogRect.width,
      },
      grid: { clientWidth: grid.clientWidth, scrollWidth: grid.scrollWidth },
      sourceVisibility: getComputedStyle(source).visibility,
      text:
        dialog
          .querySelector('.trophy-detail-dialog__copy p')
          ?.textContent?.trim() || '',
    };
  });
  assert(mainDetail.backdrop.position === 'fixed', 'Le détail remporté doit être fixé au-dessus de la page.', mainDetail);
  assert(mainDetail.backdrop.left === 0 && mainDetail.backdrop.top === 0, 'Le détail remporté doit couvrir la fenêtre depuis son origine.', mainDetail);
  assert(mainDetail.backdrop.width === viewport.width, 'Le fond du détail doit couvrir toute la largeur.', mainDetail);
  assert(mainDetail.backdrop.height === viewport.height, 'Le fond du détail doit couvrir toute la hauteur.', mainDetail);
  assert(mainDetail.dialog.left >= 8 && mainDetail.dialog.right <= viewport.width - 8, 'La fiche détaillée doit rester entièrement dans la largeur.', mainDetail);
  assert(mainDetail.dialog.top >= 8 && mainDetail.dialog.bottom <= viewport.height - 8, 'La fiche détaillée doit rester entièrement dans la hauteur.', mainDetail);
  assert(mainDetail.sourceVisibility === 'hidden', 'La copie découpée dans le carrousel doit être masquée.', mainDetail);
  assert(mainDetail.text === 'Palier Argent débloqué', 'Le trophée remporté doit utiliser uniquement la formulation du palier.', mainDetail);
  assert(mainDetail.grid.scrollWidth === mainGridBeforeDetail.scrollWidth, 'L’ouverture du détail ne doit pas agrandir le carrousel.', { mainDetail, mainGridBeforeDetail });
  if (viewport.width === 375) {
    await page.screenshot({
      fullPage: false,
      path: path.join(
        screenshotDirectory,
        'vitrine-detail-remporte-375x812.png'
      ),
    });
  }
  await page.locator('.monjdb-native-portal-detail-backdrop .trophy-detail-dialog__close').click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop', { state: 'detached' });
  assert((await page.locator('.trophy-detail-backdrop').count()) === 0, 'La fiche remportée doit se fermer sans laisser de couche résiduelle.');
  console.log(`[${label}] détail remporté principal validé`);

  await page
    .locator(
      '[data-fixture-section="progress"] .internal-trophy-card__trigger'
    )
    .click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop');
  const progressDetailText = await page
    .locator(
      '.monjdb-native-portal-detail-backdrop .trophy-detail-dialog__copy p'
    )
    .textContent();
  assert(
    progressDetailText?.trim() === 'Prochain palier : Or',
    'Le trophée en cours doit afficher uniquement le prochain palier.',
    progressDetailText
  );
  await page
    .locator(
      '.monjdb-native-portal-detail-backdrop .trophy-detail-dialog__close'
    )
    .click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop', {
    state: 'detached',
  });
  console.log(`[${label}] détail en cours validé`);

  const horizontalScroll = await page.evaluate(async () => {
    const grid = document.querySelector(
      '[data-fixture-section="earned"] .trophy-card-grid'
    );
    const maximum = grid.scrollWidth - grid.clientWidth;
    grid.scrollLeft = maximum;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const reachedEnd = grid.scrollLeft;
    grid.scrollLeft = 0;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { maximum, reachedEnd, returnedToStart: grid.scrollLeft };
  });
  assert(
    Math.abs(horizontalScroll.reachedEnd - horizontalScroll.maximum) <= 1,
    'Le défilement horizontal doit atteindre le dernier trophée.',
    horizontalScroll,
  );
  assert(
    horizontalScroll.returnedToStart <= 2,
    'Le carrousel doit revenir proprement au premier trophée.',
    horizontalScroll,
  );

  await page.locator('[data-fixture-section="earned"] .trophy-section__link').click();
  await page.waitForSelector('.trophy-section-sheet');
  await page.waitForTimeout(100);

  const collection = await page.evaluate(() => {
    const grid = document.querySelector('.trophy-section-sheet__grid');
    const sheet = document.querySelector('.trophy-section-sheet');
    const visualCards = Array.from(
      grid.querySelectorAll(':scope > .internal-trophy-card')
    )
      .map((card) => ({
        awardedAt: card.dataset.awardedAt || '',
        left: card.getBoundingClientRect().left,
      }))
      .sort((left, right) => left.left - right.left);
    return {
      cardCount: grid.querySelectorAll(':scope > .internal-trophy-card').length,
      childCount: grid.children.length,
      clientHeight: grid.clientHeight,
      gridHeight: grid.getBoundingClientRect().height,
      heading:
        sheet.querySelector('.account-sheet__heading h3')?.textContent?.trim() || '',
      scrollHeight: grid.scrollHeight,
      sheetHeight: sheet.getBoundingClientRect().height,
      slotCount: grid.querySelectorAll(':scope > .monjdb-native-collection-slot').length,
      visualAwardOrder: visualCards.map((card) => card.awardedAt),
    };
  });
  assert(collection.cardCount === 3, 'Voir tout doit contenir exactement trois trophées.', collection);
  assert(collection.heading === 'Mes trophées remportés', 'Le titre de Voir tout doit être accordé au masculin.', collection);
  assert(collection.slotCount === 17, 'Voir tout doit compléter exactement vingt emplacements.', collection);
  assert(collection.childCount === 20, 'Voir tout ne doit jamais dépasser vingt éléments dans cet état.', collection);
  assert(collection.sheetHeight <= viewport.height - 16, 'La fenêtre Voir tout doit rester dans l’écran.', collection);
  assert(
    collection.visualAwardOrder.join('|') ===
      [
        '2026-01-01T08:00:00.000Z',
        '2026-07-01T08:00:00.000Z',
        '2026-07-10T08:00:00.000Z',
      ].join('|'),
    'Voir tout doit ranger les trophées du plus ancien au plus récent.',
    collection,
  );
  console.log(`[${label}] collection initiale validée`);

  for (let index = 0; index < 4; index += 1) {
    await page.locator('.account-sheet__close').click();
    await page.locator('[data-fixture-section="earned"] .trophy-section__link').click();
    await page.waitForTimeout(80);
    const repeatedCounts = await page.evaluate(() => {
      const grid = document.querySelector('.trophy-section-sheet__grid');
      return {
        cards: grid.querySelectorAll(':scope > .internal-trophy-card').length,
        children: grid.children.length,
        slots: grid.querySelectorAll(':scope > .monjdb-native-collection-slot').length,
      };
    });
    assert(repeatedCounts.cards === 3, 'Les ouvertures répétées ne doivent pas dupliquer les trophées.', repeatedCounts);
    assert(repeatedCounts.children === 20, 'Les ouvertures répétées doivent conserver vingt emplacements.', repeatedCounts);
    assert(repeatedCounts.slots === 17, 'Les ouvertures répétées doivent conserver dix-sept emplacements vides.', repeatedCounts);
  }
  console.log(`[${label}] ouvertures répétées validées`);

  await page
    .locator(
      '.trophy-section-sheet .internal-trophy-card:not(.monjdb-native-earned-tier-card) .internal-trophy-card__trigger'
    )
    .first()
    .click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop');
  const collectionDetail = await page.evaluate(() => {
    const backdrop = document.querySelector(
      '.monjdb-native-portal-detail-backdrop'
    );
    const dialog = backdrop.querySelector('.trophy-detail-dialog');
    const rect = dialog.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
    };
  });
  assert(collectionDetail.left >= 8 && collectionDetail.right <= viewport.width - 8, 'Le détail ouvert depuis Voir tout doit rester dans la largeur.', collectionDetail);
  assert(collectionDetail.top >= 8 && collectionDetail.bottom <= viewport.height - 8, 'Le détail ouvert depuis Voir tout doit rester dans la hauteur.', collectionDetail);
  if (viewport.width === 375) {
    await page.screenshot({
      fullPage: false,
      path: path.join(
        screenshotDirectory,
        'vitrine-detail-collection-375x812.png'
      ),
    });
  }
  await page.locator('.monjdb-native-portal-detail-backdrop .trophy-detail-dialog__close').click();
  await page.waitForSelector('.monjdb-native-portal-detail-backdrop', { state: 'detached' });
  console.log(`[${label}] détail remporté depuis la collection validé`);

  await page.locator('.trophy-section-sheet .monjdb-native-earned-tier-card .internal-trophy-card__trigger').click();
  await page.waitForSelector('.monjdb-native-earned-tier-dialog');
  const earnedTierDetailText = await page
    .locator('.monjdb-native-earned-tier-dialog .trophy-detail-dialog__copy p')
    .textContent();
  assert(
    earnedTierDetailText?.trim() === 'Palier Bronze débloqué',
    'Le palier remporté injecté doit utiliser la même formulation.',
    earnedTierDetailText
  );
  await page.locator('.monjdb-native-earned-tier-dialog .trophy-detail-dialog__close').click();
  await page.waitForTimeout(50);
  assert(
    (await page.locator('.monjdb-native-earned-tier-dialog').count()) === 0,
    'Le détail du trophée doit se fermer proprement.'
  );
  console.log(`[${label}] détail validé`);

  console.log(`[${label}] capture collection`);
  await page.screenshot({
    fullPage: false,
    path: path.join(screenshotDirectory, `vitrine-${viewport.width}x${viewport.height}.png`),
  });
  console.log(`[${label}] capture collection terminée`);
  await page.locator('.account-sheet__close').click();
  console.log(`[${label}] capture page`);
  await page.screenshot({
    fullPage: false,
    path: path.join(
      screenshotDirectory,
      `vitrine-page-${viewport.width}x${viewport.height}.png`
    ),
  });
  console.log(`[${label}] capture page terminée`);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(50);
  const progressLayout = await page.evaluate(() => {
    const section = document.querySelector('[data-fixture-section="progress"]');
    const card = section.querySelector('.internal-trophy-card');
    const title = section.querySelector('.trophy-section__header h2');
    const navigation = document.querySelector('.bottom-nav');
    return {
      cardHeight: card.getBoundingClientRect().height,
      cardWidth: card.getBoundingClientRect().width,
      cardBottom: card.getBoundingClientRect().bottom,
      navigationTop: navigation.getBoundingClientRect().top,
      titleLineCount: title.querySelectorAll(
        ':scope > .monjdb-native-trophy-progress-title__line'
      ).length,
    };
  });
  assert(progressLayout.cardHeight === 232, 'La carte en cours doit garder la même hauteur.', progressLayout);
  assert(progressLayout.titleLineCount === 2, 'Le titre « Mes trophées / en cours » doit rester sur deux lignes.', progressLayout);
  assert(
    progressLayout.cardBottom <= progressLayout.navigationTop - 8,
    'La barre flottante ne doit pas masquer le bas de la carte en cours.',
    progressLayout,
  );
  await page.screenshot({
    fullPage: false,
    path: path.join(
      screenshotDirectory,
      `vitrine-progress-${viewport.width}x${viewport.height}.png`
    ),
  });

  if (viewport.width === 375) {
    await page.evaluate(() => {
      document.querySelector('.account-sheet-backdrop')?.remove();
      const source = document.querySelector('.monjdb-native-earned-tier-card');
      const backdrop = document.createElement('div');
      backdrop.className = 'account-sheet-backdrop';
      backdrop.innerHTML =
        '<div aria-modal="true" class="account-sheet trophy-section-sheet" role="dialog"><div class="account-sheet__header"><div class="account-sheet__heading"><span>Mes trophées</span><h3>Mes trophées remportés</h3></div><button aria-label="Fermer la fenêtre" class="account-sheet__close" type="button">×</button></div><div class="trophy-section-sheet__grid"></div></div>';
      backdrop
        .querySelector('.trophy-section-sheet__grid')
        .append(source.cloneNode(true));
      backdrop
        .querySelector('.account-sheet__close')
        .addEventListener('click', () => backdrop.remove());
      document.body.append(backdrop);
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.trophy-section-sheet__grid')?.children.length ===
        20
    );
    const singleCollection = await page.evaluate(() => {
      const grid = document.querySelector('.trophy-section-sheet__grid');
      return {
        cards: grid.querySelectorAll(':scope > .internal-trophy-card').length,
        children: grid.children.length,
        slots: grid.querySelectorAll(':scope > .monjdb-native-collection-slot').length,
      };
    });
    assert(singleCollection.cards === 1, 'La collection avec un seul trophée doit conserver une seule image.', singleCollection);
    assert(singleCollection.children === 20, 'La collection avec un seul trophée doit conserver vingt emplacements.', singleCollection);
    assert(singleCollection.slots === 19, 'La collection avec un seul trophée doit montrer dix-neuf emplacements vides.', singleCollection);
    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotDirectory, 'vitrine-collection-un-trophee-375x812.png'),
    });
    await page.locator('.account-sheet__close').click();
  }

  await page.evaluate(() => {
    document.querySelector('.account-sheet-backdrop')?.remove();
    document.querySelector('[data-fixture-profile-card]')?.remove();
    const profileCard = document.createElement('section');
    profileCard.className = 'account-profile-card';
    profileCard.dataset.fixtureProfileCard = 'true';
    profileCard.innerHTML = '<div class="account-profile-card__copy"><h2>Joris Poquet</h2><p class="account-profile-card__status">Interne – Semestre 5</p><div class="account-profile-card__meta"><span>CHU de Nantes</span></div></div><span class="account-profile-card__badge internal-avatar"><img alt="" class="internal-avatar__image" src="http://127.0.0.1:5173/images/badges/colpocleisis-as.png"></span>';
    document.body.append(profileCard);
    const backdrop = document.createElement('div');
    backdrop.className = 'account-sheet-backdrop';
    backdrop.innerHTML = `
      <div aria-modal="true" class="account-sheet" role="dialog">
        <form class="account-sheet__form">
          <div class="account-photo-cropper">
            <div class="account-photo-cropper__viewport">
              <img alt="" class="account-photo-cropper__image" src="http://127.0.0.1:5173/images/badges/colpocleisis-as.png" style="height:220px;transform:translate(0px, 0px);width:330px">
            </div>
            <div class="account-photo-cropper__meta"><strong>portrait.jpg</strong><span>L’aperçu montre le cadrage final du profil.</span></div>
          </div>
          <label class="account-sheet__field"><span>Zoom</span><div class="account-sheet__range-wrap"><input class="account-sheet__range" max="200" min="100" type="range" value="100"><strong class="account-sheet__range-value">100%</strong></div></label>
          <label class="account-sheet__field"><span>Déplacement horizontal</span><div class="account-sheet__range-wrap"><input class="account-sheet__range" max="100" min="-100" type="range" value="0"><strong class="account-sheet__range-value">0</strong></div></label>
          <label class="account-sheet__field"><span>Déplacement vertical</span><div class="account-sheet__range-wrap"><input class="account-sheet__range" max="100" min="-100" type="range" value="0"><strong class="account-sheet__range-value">0</strong></div></label>
          <div class="account-sheet__actions account-sheet__actions--split">
            <button class="flow-button flow-button--secondary" type="button">Annuler</button>
            <button class="flow-button flow-button--primary" type="submit">Enregistrer</button>
          </div>
        </form>
      </div>`;
    document.body.append(backdrop);
  });
  await page.waitForSelector('.monjdb-native-photo-crop-form');
  await page.waitForTimeout(50);

  const cropLayout = await page.evaluate(() => {
    const form = document.querySelector('.monjdb-native-photo-crop-form');
    const viewport = form.querySelector('.account-photo-cropper__viewport');
    const controls = Array.from(
      form.querySelectorAll('.monjdb-native-photo-crop-control')
    );
    const primary = form.querySelector('.flow-button--primary');
    const secondary = form.querySelector('.flow-button--secondary');
    const rect = viewport.getBoundingClientRect();
    const profileCard = document.querySelector('[data-fixture-profile-card]');
    const profileCopy = profileCard.querySelector('.account-profile-card__copy');
    const profileBadge = profileCard.querySelector('.account-profile-card__badge');
    const profileCardRect = profileCard.getBoundingClientRect();
    const profileCopyRect = profileCopy.getBoundingClientRect();
    const profileBadgeRect = profileBadge.getBoundingClientRect();
    return {
      buttonOrder:
        primary.getBoundingClientRect().top <
        secondary.getBoundingClientRect().top,
      controlCount: controls.length,
      controlDisplays: controls.map(
        (control) => getComputedStyle(control).display
      ),
      height: rect.height,
      innerHeight: viewport.clientHeight,
      innerWidth: viewport.clientWidth,
      instruction:
        form
          .querySelector('.account-photo-cropper__meta span')
          ?.textContent?.trim() || '',
      touchAction: getComputedStyle(viewport).touchAction,
      width: rect.width,
      profile: {
        badgeHeight: profileBadgeRect.height,
        badgeWidth: profileBadgeRect.width,
        centered:
          Math.abs(
            profileBadgeRect.top + profileBadgeRect.height / 2 -
              (profileCardRect.top + profileCardRect.height / 2)
          ) <= 1,
        nonOverlapping: profileCopyRect.right <= profileBadgeRect.left,
      },
    };
  });
  assert(cropLayout.innerWidth === 220 && cropLayout.innerHeight === 220, 'La surface utile du recadrage doit correspondre exactement au calcul de 220 px.', cropLayout);
  assert(cropLayout.width > cropLayout.innerWidth && cropLayout.height > cropLayout.innerHeight, 'La bordure ne doit plus réduire la surface utile de l’aperçu.', cropLayout);
  assert(cropLayout.controlCount === 3, 'Les trois anciens réglages doivent être identifiés.', cropLayout);
  assert(cropLayout.controlDisplays.every((display) => display === 'none'), 'Les trois anciens réglages doivent être masqués.', cropLayout);
  assert(cropLayout.touchAction === 'none', 'Le recadrage doit réserver les gestes tactiles.', cropLayout);
  assert(cropLayout.buttonOrder, 'Enregistrer doit apparaître au-dessus d’Annuler.', cropLayout);
  assert(cropLayout.instruction === 'Déplace la photo avec un doigt. Pince pour zoomer.', 'L’instruction doit expliquer le recadrage manuel.', cropLayout);
  assert(cropLayout.profile.badgeWidth === 82 && cropLayout.profile.badgeHeight === 82, 'La photo du compte doit conserver une taille compacte et régulière.', cropLayout);
  assert(cropLayout.profile.centered, 'La photo du compte doit être centrée verticalement avec les informations.', cropLayout);
  assert(cropLayout.profile.nonOverlapping, 'La photo et les informations du compte ne doivent pas se chevaucher.', cropLayout);

  const cropGestures = await page.evaluate(() => {
    const form = document.querySelector('.monjdb-native-photo-crop-form');
    const viewport = form.querySelector('.account-photo-cropper__viewport');
    const inputs = Array.from(form.querySelectorAll('input[type="range"]'));
    const dispatchPointer = (type, pointerId, x, y) =>
      viewport.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId,
          pointerType: 'touch',
        })
      );

    dispatchPointer('pointerdown', 1, 100, 110);
    dispatchPointer('pointermove', 1, 130, 110);
    dispatchPointer('pointerup', 1, 130, 110);
    const horizontalAfterDrag = Number(inputs[1].value);

    dispatchPointer('pointerdown', 11, 80, 110);
    dispatchPointer('pointerdown', 12, 140, 110);
    dispatchPointer('pointermove', 12, 170, 110);
    dispatchPointer('pointerup', 11, 80, 110);
    dispatchPointer('pointerup', 12, 170, 110);

    return {
      horizontalAfterDrag,
      zoomAfterPinch: Number(inputs[0].value),
    };
  });
  assert(cropGestures.horizontalAfterDrag > 0, 'Le déplacement au doigt doit modifier le cadrage horizontal.', cropGestures);
  assert(cropGestures.zoomAfterPinch > 100, 'Le pincement doit modifier le zoom.', cropGestures);

  if (viewport.width === 375) {
    await page.screenshot({
      fullPage: false,
      path: path.join(
        screenshotDirectory,
        'profil-recadrage-manuel-375x812.png'
      ),
    });
  }
  await page.evaluate(() => {
    document.querySelector('.account-sheet-backdrop')?.remove();
    document
      .querySelector('[data-fixture-profile-card]')
      ?.scrollIntoView({ block: 'center' });
  });
  if (viewport.width === 375) {
    await page.screenshot({
      fullPage: false,
      path: path.join(
        screenshotDirectory,
        'profil-carte-alignee-375x812.png'
      ),
    });
  }
  await page.evaluate(async () => {
    document.querySelector('[data-fixture-profile-card]')?.remove();
    const reactModule = await import(
      'http://127.0.0.1:5173/node_modules/.vite/deps/react.js'
    );
    const reactDomModule = await import(
      'http://127.0.0.1:5173/node_modules/.vite/deps/react-dom_client.js'
    );
    const React = reactModule.default || reactModule;
    const ReactDOM = reactDomModule.default || reactDomModule;
    const h = React.createElement;
    const mount = document.createElement('div');
    mount.dataset.reactCropFixture = 'true';
    document.body.append(mount);

    const Range = ({ label, max, min, onChange, value }) =>
      h(
        'label',
        { className: 'account-sheet__field' },
        h('span', null, label),
        h(
          'div',
          { className: 'account-sheet__range-wrap' },
          h('input', {
            className: 'account-sheet__range',
            max,
            min,
            onChange: (event) => onChange(Number(event.target.value)),
            type: 'range',
            value,
          }),
          h(
            'strong',
            { className: 'account-sheet__range-value' },
            String(value)
          )
        )
      );

    const ReactCropFixture = () => {
      const [zoom, setZoom] = React.useState(100);
      const [panX, setPanX] = React.useState(0);
      const [panY, setPanY] = React.useState(0);
      const scale = zoom / 100;
      const drawWidth = 330 * scale;
      const drawHeight = 220 * scale;
      const offsetX = (panX / 100) * Math.max(0, (drawWidth - 220) / 2);
      const offsetY = (panY / 100) * Math.max(0, (drawHeight - 220) / 2);

      React.useEffect(() => {
        window.__monjdbReactCropState = { panX, panY, zoom };
      }, [panX, panY, zoom]);

      return h(
        'div',
        { className: 'account-sheet-backdrop' },
        h(
          'div',
          { className: 'account-sheet' },
          h(
            'form',
            {
              className: 'account-sheet__form',
              onSubmit: (event) => {
                event.preventDefault();
                window.__monjdbReactSavedCrop = { panX, panY, zoom };
              },
            },
            h(
              'div',
              { className: 'account-photo-cropper' },
              h(
                'div',
                { className: 'account-photo-cropper__viewport' },
                h('img', {
                  alt: '',
                  className: 'account-photo-cropper__image',
                  src: 'http://127.0.0.1:5173/images/badges/colpocleisis-as.png',
                  style: {
                    height: `${drawHeight}px`,
                    transform: `translate(${offsetX}px, ${offsetY}px)`,
                    width: `${drawWidth}px`,
                  },
                })
              ),
              h(
                'div',
                { className: 'account-photo-cropper__meta' },
                h('strong', null, 'portrait-react.jpg'),
                h('span', null, 'Aperçu React')
              )
            ),
            h(Range, {
              label: 'Zoom',
              max: 200,
              min: 100,
              onChange: setZoom,
              value: zoom,
            }),
            h(Range, {
              label: 'Déplacement horizontal',
              max: 100,
              min: -100,
              onChange: setPanX,
              value: panX,
            }),
            h(Range, {
              label: 'Déplacement vertical',
              max: 100,
              min: -100,
              onChange: setPanY,
              value: panY,
            }),
            h(
              'div',
              { className: 'account-sheet__actions account-sheet__actions--split' },
              h(
                'button',
                { className: 'flow-button flow-button--secondary', type: 'button' },
                'Annuler'
              ),
              h(
                'button',
                { className: 'flow-button flow-button--primary', type: 'submit' },
                'Enregistrer'
              )
            )
          )
        )
      );
    };

    window.__monjdbReactCropRoot = ReactDOM.createRoot(mount);
    window.__monjdbReactCropRoot.render(h(ReactCropFixture));
  });
  await page.waitForSelector(
    '[data-react-crop-fixture] .monjdb-native-photo-crop-form'
  );
  await page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-react-crop-fixture] .account-photo-cropper__viewport'
    );
    const dispatchPointer = (type, pointerId, x, y) =>
      viewport.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId,
          pointerType: 'touch',
        })
      );

    dispatchPointer('pointerdown', 21, 100, 110);
    dispatchPointer('pointermove', 21, 130, 110);
    dispatchPointer('pointerup', 21, 130, 110);
    dispatchPointer('pointerdown', 31, 80, 110);
    dispatchPointer('pointerdown', 32, 140, 110);
    dispatchPointer('pointermove', 32, 170, 110);
    dispatchPointer('pointerup', 31, 80, 110);
    dispatchPointer('pointerup', 32, 170, 110);
  });
  await page.waitForTimeout(100);
  await page
    .locator(
      '[data-react-crop-fixture] .flow-button--primary'
    )
    .click();
  const reactCrop = await page.evaluate(() => ({
    saved: window.__monjdbReactSavedCrop,
    state: window.__monjdbReactCropState,
    transform: document.querySelector(
      '[data-react-crop-fixture] .account-photo-cropper__image'
    )?.style.transform,
  }));
  assert(reactCrop.state.panX > 0, 'Le déplacement tactile doit atteindre l’état React utilisé par l’aperçu.', reactCrop);
  assert(reactCrop.state.zoom > 100, 'Le pincement doit atteindre l’état React utilisé par l’aperçu.', reactCrop);
  assert(JSON.stringify(reactCrop.saved) === JSON.stringify(reactCrop.state), 'Enregistrer doit utiliser exactement le cadrage affiché par React.', reactCrop);
  assert(reactCrop.transform !== 'translate(0px, 0px)', 'L’aperçu React doit refléter visuellement le déplacement.', reactCrop);
  await page.evaluate(() => {
    window.__monjdbReactCropRoot?.unmount();
    document.querySelector('[data-react-crop-fixture]')?.remove();
  });
  console.log(`[${label}] fidélité React du recadrage validée`);
  console.log(`[${label}] recadrage manuel du profil validé`);

  assert(consoleErrors.length === 0, 'La console navigateur contient des erreurs.', consoleErrors);
  assert(pageErrors.length === 0, 'La page contient des erreurs JavaScript.', pageErrors);

  await context.close();
  return { collection, initial, viewport };
}

async function main() {
  const nativeScript = extractNativeScript();
  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
  });

  try {
    const results = [];

    for (const viewport of [
      { height: 812, width: 375 },
      { height: 852, width: 393 },
      { height: 932, width: 430 },
    ]) {
      results.push(await runViewport(browser, nativeScript, viewport));
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          results: results.map(({ collection, initial, viewport }) => ({
            collection,
            initial: {
              cardHeights: initial.cardHeights,
              cardWidths: initial.cardWidths,
              documentHeight: initial.documentHeight,
              earnedCardCount: initial.earnedCardCount,
              earnedClientWidth: initial.earnedClientWidth,
              earnedGridLeft: initial.earnedGridLeft,
              earnedScrollLeft: initial.earnedScrollLeft,
              earnedScrollWidth: initial.earnedScrollWidth,
              earnedVisualOrder: initial.earnedVisualOrder,
              extraAfterContent: initial.extraAfterContent,
              imageBoxes: initial.imageBoxes,
              progressCardCount: initial.progressCardCount,
              progressCards: initial.progressCards,
              summaryEarned: initial.summaryEarned,
              summaryProgress: initial.summaryProgress,
            },
            viewport,
          })),
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        details: error.details || null,
        message: error.message,
        ok: false,
        stack: error.stack,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
