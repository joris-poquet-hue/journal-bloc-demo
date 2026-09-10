import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';

import { SUPPORT_EMAIL } from '../supportConfig';

const LAST_UPDATED_LABEL = '10 septembre 2026';
const PUBLISHER_ADDRESS = '14 rue Nicolas Appert, 44100 Nantes, France';

function ExternalLegalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function LegalNoticeSection() {
  return (
    <section className="legal-document__part" id="mentions-legales">
      <h2>Mentions légales</h2>

      <section>
        <h3>Édition et publication</h3>
        <p>
          <strong>Mon Journal de Bloc</strong> est édité par Joris Poquet,
          personne physique domiciliée au {PUBLISHER_ADDRESS}, qui assure
          également la direction de la publication.
        </p>
      </section>

      <section>
        <h3>Hébergement</h3>
        <p>Le site et son interface web sont hébergés par Vercel Inc.</p>
        <p>
          <ExternalLegalLink href="https://vercel.com/legal/privacy-notice">
            Informations légales et confidentialité de Vercel
          </ExternalLegalLink>
        </p>
      </section>

      <section>
        <h3>Objet et limites du service</h3>
        <p>
          Mon Journal de Bloc est un outil de suivi pédagogique destiné aux
          internes en chirurgie, à leurs seniors et aux administrateurs du
          service. Il permet notamment de consigner des interventions, de réaliser
          des évaluations et de suivre une progression.
        </p>
        <p>
          Le service n’est ni un dossier médical, ni un dispositif médical, ni un
          outil d’aide à la décision clinique. Il ne remplace aucune règle
          professionnelle, décision médicale ou procédure de l’établissement.
        </p>
      </section>

      <section>
        <h3>Propriété intellectuelle et responsabilité</h3>
        <p>
          La structure du service, ses textes, éléments graphiques et logiciels
          sont protégés par les règles applicables à la propriété intellectuelle,
          sous réserve des droits de leurs auteurs ou titulaires respectifs. Leur
          réutilisation est limitée aux usages autorisés par la loi ou par un
          accord écrit préalable.
        </p>
        <p>
          L’éditeur veille à l’exactitude, à la sécurité et à la disponibilité du
          service, sans pouvoir garantir une absence totale d’erreur ou
          d’interruption. Les services accessibles par des liens externes restent
          responsables de leurs contenus et de leurs pratiques.
        </p>
      </section>

      <section>
        <h3>Droit applicable</h3>
        <p>
          Le service et la présente page sont soumis au droit français.
        </p>
      </section>
    </section>
  );
}

function PrivacySection() {
  return (
    <section className="legal-document__part" id="confidentialite">
      <h2>Politique de confidentialité</h2>
      <p className="legal-document__lead">
        L’éditeur est responsable des traitements de données personnelles décrits
        ci-dessous. Ces données sont utilisées uniquement pour fournir, sécuriser
        et administrer le service, ainsi que pour assurer le suivi pédagogique.
        Elles ne sont ni vendues ni exploitées à des fins de publicité ciblée.
      </p>

      <section>
        <h3>Données traitées et usages</h3>
        <p>Selon le rôle et les fonctions utilisés, le service traite :</p>
        <ul>
          <li>
            les informations de compte et de profil : nom, prénom, identifiant,
            adresse e-mail, rôle, établissement, semestre et avatar facultatif ;
          </li>
          <li>
            les données pédagogiques et professionnelles : interventions,
            contexte structuré non nominatif, senior associé, évaluations,
            commentaires, scores, statistiques, progression et trophées ;
          </li>
          <li>
            les contenus personnels : bloc-notes privé, préférences et brouillon
            temporaire d’intervention ;
          </li>
          <li>
            les données techniques nécessaires à la sécurité : sessions,
            appareils sous un libellé générique, confirmations d’adresse e-mail,
            tentatives de connexion pseudonymisées et traces d’actions sensibles ;
          </li>
          <li>
            les informations techniques nécessaires aux notifications lorsque
            l’utilisateur les active.
          </li>
        </ul>
        <p>
          Les informations proviennent de l’administrateur qui crée le compte, de
          l’utilisateur et des seniors qui réalisent les évaluations. Le service
          calcule également des statistiques, des scores de progression et des
          trophées à partir des interventions et des évaluations. Ces indicateurs
          sont exclusivement pédagogiques et ne produisent aucune décision
          juridique ou médicale automatisée.
        </p>
        <p>
          Les traitements nécessaires au compte, à l’utilisation du service et au
          suivi pédagogique reposent sur l’exécution du service demandé ; la
          sécurisation et la prévention des abus sur l’intérêt légitime de
          l’éditeur ; les fonctions facultatives sur le consentement ; et les
          réponses aux autorités sur les obligations légales applicables.
        </p>
      </section>

      <section className="legal-document__warning">
        <h3>Données relatives aux patientes</h3>
        <p>
          Les champs libres, le bloc-notes et les commentaires ne doivent jamais
          contenir le nom, les coordonnées, un numéro de dossier, une date de
          naissance complète ou toute autre information permettant d’identifier
          directement ou indirectement une patiente.
        </p>
      </section>

      <section>
        <h3>Caractère obligatoire et accès aux données</h3>
        <p>
          Les informations signalées comme obligatoires sont indispensables pour
          activer un compte, se connecter ou valider une intervention ou une
          évaluation. Sans elles, la fonction concernée ne peut pas aboutir. Les
          variables de contexte clinique, l’avatar, le bloc-notes et les
          autorisations mobiles restent facultatifs, sauf indication contraire
          dans le formulaire.
        </p>
        <p>
          Chaque interne accède à ses propres données. Les seniors autorisés de
          son établissement consultent uniquement les informations pédagogiques
          prévues par leur rôle, à l’exclusion du bloc-notes privé et de l’adresse
          e-mail de l’interne. Les administrateurs habilités disposent des accès
          nécessaires à l’administration du service. Les prestataires techniques
          et les autorités légalement habilitées n’y accèdent que dans les limites
          requises par leur mission ou par une demande valable.
        </p>
      </section>

      <section>
        <h3>Conservation, stockage et sécurité</h3>
        <ul>
          <li>
            le compte et l’historique pédagogique sont conservés pendant la vie
            du compte ; un compte désactivé subsiste jusqu’à sa réactivation ou à
            sa suppression définitive par un administrateur ;
          </li>
          <li>
            une suppression définitive retire les données de la base active ; les
            sauvegardes chiffrées déjà créées expirent au plus tard sous 30 jours ;
          </li>
          <li>
            le brouillon chiffré d’intervention est conservé au maximum 72 heures
            et supprimé plus tôt après enregistrement, abandon ou déconnexion ;
          </li>
          <li>
            le bloc-notes conserve au maximum 50 versions privées, espacées d’au
            moins cinq minutes, jusqu’à leur remplacement ou à la suppression du
            compte ;
          </li>
          <li>
            les compteurs pseudonymisés de tentatives de connexion sont purgés en
            moins de deux heures après leur dernière mise à jour, sauf blocage
            temporaire encore actif ;
          </li>
          <li>
            les sessions restent actives jusqu’à leur expiration ou leur
            révocation ; la session web expire après 30 minutes d’inactivité.
          </li>
        </ul>
        <p>
          Le site n’utilise pas de cookie publicitaire. La connexion web repose
          sur un cookie de session strictement nécessaire, non persistant et
          protégé. Sur mobile, la session peut être conservée dans le trousseau
          sécurisé du système. La biométrie, les notifications et certaines
          préférences techniques restent facultatives ; les modèles biométriques
          demeurent sous le contrôle du système d’exploitation.
        </p>
        <p>
          Les mesures de protection comprennent notamment le chiffrement des
          communications, les contrôles d’accès par rôle et établissement, les
          sessions révocables, le stockage mobile sécurisé, les sauvegardes
          chiffrées et la traçabilité des actions sensibles.
        </p>
      </section>

      <section>
        <h3>Prestataires et transferts internationaux</h3>
        <p>
          Le service s’appuie notamment sur Supabase pour l’authentification, la
          base de données et le stockage. Les prestataires techniques cités sur
          cette page, ou certains de leurs sous-traitants, peuvent traiter des
          données hors de l’Espace économique européen. Ces opérations sont
          encadrées par leurs accords de protection des données et, lorsque cela
          est requis, par les clauses contractuelles types applicables.
        </p>
        <ul className="legal-document__external-links">
          <li>
            <ExternalLegalLink href="https://vercel.com/legal/dpa">
              Accord de traitement des données de Vercel
            </ExternalLegalLink>
          </li>
          <li>
            <ExternalLegalLink href="https://supabase.com/privacy">
              Politique de confidentialité de Supabase
            </ExternalLegalLink>
          </li>
        </ul>
      </section>

      <section>
        <h3>Contact et exercice de vos droits</h3>
        <p>
          Selon le traitement concerné, toute personne peut demander l’accès, la
          rectification, l’effacement, la limitation ou la portabilité de ses
          données, s’opposer à un traitement fondé sur l’intérêt légitime et
          retirer son consentement à une fonction facultative. Une réponse est
          apportée dans le délai réglementaire, en principe un mois.
        </p>
        <p>
          Les demandes et signalements de sécurité peuvent être adressés à{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Une preuve
          d’identité n’est demandée que si elle est nécessaire pour protéger les
          données d’un tiers. Il est également possible de déposer une
          réclamation auprès de la{' '}
          <ExternalLegalLink href="https://www.cnil.fr/fr/plaintes">
            Commission nationale de l’informatique et des libertés (CNIL)
          </ExternalLegalLink>
          .
        </p>
      </section>
    </section>
  );
}

export function LegalInformationScreen() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      'Informations légales et confidentialité — Mon Journal de Bloc';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="legal-page">
      <div className="legal-page__frame">
        <header className="legal-page__header">
          <a className="legal-page__back" href="/">
            <ArrowLeft aria-hidden="true" />
            Retour à l’application
          </a>
          <img
            alt="Mon Journal de Bloc"
            className="legal-page__logo"
            src="/images/brand/MonJDB_logoH.png"
          />
          <div className="legal-page__title-row">
            <span className="legal-page__icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div>
              <p>Mon Journal de Bloc</p>
              <h1>Informations légales et confidentialité</h1>
            </div>
          </div>
          <p className="legal-page__intro">
            Une présentation claire de l’éditeur, du cadre d’utilisation du
            service et de la protection des données personnelles.
          </p>
          <p className="legal-page__updated">
            Dernière mise à jour : {LAST_UPDATED_LABEL}
          </p>
        </header>

        <nav aria-label="Sommaire de la page" className="legal-page__navigation">
          <span>Sur cette page</span>
          <a href="#mentions-legales">Mentions légales</a>
          <a href="#confidentialite">Politique de confidentialité</a>
        </nav>

        <article className="legal-document">
          <LegalNoticeSection />
          <PrivacySection />
        </article>

        <footer className="legal-page__footer">
          <span>Mon Journal de Bloc</span>
          <span>Dernière mise à jour : {LAST_UPDATED_LABEL}</span>
        </footer>
      </div>
    </main>
  );
}
