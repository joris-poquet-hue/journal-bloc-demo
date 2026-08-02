import { FormEvent, useEffect, useState } from 'react';

import { PUBLIC_SITE_VERSION } from '../appMetadata';
import { useAppContext } from '../context/AppContext';
import { buildSupportMailto } from '../supportConfig';
import { PASSWORD_POLICY_HELP } from '../utils/passwordPolicy';

function UserIcon() {
  return (
    <svg aria-hidden="true" className="login-field__icon" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="login-field__icon" fill="none" viewBox="0 0 24 24">
      <path
        d="M7.25 10.25V8a4.75 4.75 0 0 1 9.5 0v2.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.5 10.25h11a1.75 1.75 0 0 1 1.75 1.75v6.5a1.75 1.75 0 0 1-1.75 1.75h-11a1.75 1.75 0 0 1-1.75-1.75V12a1.75 1.75 0 0 1 1.75-1.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 14.5v2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="login-note__icon" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3.75 5.75 6.3v4.85c0 4.05 2.55 7.65 6.25 9.1 3.7-1.45 6.25-5.05 6.25-9.1V6.3L12 3.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m9.25 12.15 1.8 1.8 3.95-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function LoginScreen() {
  const {
    cancelPasswordChangeChallenge,
    completePasswordChangeChallenge,
    login,
    passwordChangeChallenge,
    requestPasswordRecovery,
  } = useAppContext();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isPasswordChangeMode = passwordChangeChallenge != null;
  const contactHref = buildSupportMailto({
    subject: 'Contact — Mon Journal de Bloc',
    body: [
      'Bonjour,',
      '',
      'Je souhaite vous contacter au sujet de Mon Journal de Bloc.',
      '',
    ].join('\n'),
  });

  useEffect(() => {
    if (!passwordChangeChallenge) {
      setContactEmail('');
      return;
    }

    setContactEmail(passwordChangeChallenge.contactEmail ?? '');
  }, [passwordChangeChallenge]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);

    if (isPasswordChangeMode) {
      const result = await completePasswordChangeChallenge(
        contactEmail,
        password,
        nextPassword,
        confirmPassword
      );
      setIsLoggingIn(false);

      if (result.success) {
        setErrorMessage('');
        setStatusMessage(result.message);
        setPassword('');
        setContactEmail('');
        setNextPassword('');
        setConfirmPassword('');
        return;
      }

      setErrorMessage(result.message);
      return;
    }

    const result = await login(loginId, password);
    setIsLoggingIn(false);

    if (result.status === 'authenticated') {
      setErrorMessage('');
      return;
    }

    if (result.status === 'password-change-required') {
      setErrorMessage('');
      setNextPassword('');
      setConfirmPassword('');
      return;
    }

    setErrorMessage(result.message ?? 'Identifiant ou mot de passe incorrect.');
  };

  const handleCancelPasswordChange = () => {
    cancelPasswordChangeChallenge();
    setPassword('');
    setContactEmail('');
    setNextPassword('');
    setConfirmPassword('');
    setErrorMessage('');
  };

  const handlePasswordRecovery = async () => {
    setErrorMessage('');
    setStatusMessage('');

    if (!loginId.trim()) {
      setErrorMessage('Renseigne d’abord ton identifiant.');
      return;
    }

    setIsLoggingIn(true);
    const result = await requestPasswordRecovery(loginId);
    setIsLoggingIn(false);

    if (result.success) {
      setStatusMessage(result.message);
      return;
    }

    setErrorMessage(result.message);
  };

  return (
    <main className="login-page">
      <div className="login-page__halo login-page__halo--one" />
      <div className="login-page__halo login-page__halo--two" />
      <div className="login-page__line" />

      <div className="login-page__frame">
        <header className="login-web-story">
          <span className="login-web-story__logo-stage">
            <img
              alt="Mon Journal de Bloc"
              className="login-web-story__logo"
              src="/images/brand/MonJDB_logoH.png"
            />
          </span>
          <h1>
            Observe tes progrès.
            <br />
            Construis ton autonomie.
          </h1>
          <p>
            Toutes tes interventions, évaluations et réussites réunies au même
            endroit.
          </p>
          <span className="login-web-story__path" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </header>

        <header className="login-brand">
          <span className="login-brand__logo-shell" aria-hidden="true">
            <img
              alt="Mon Journal de Bloc"
              className="login-brand__logo"
              src="/images/brand/MonJDB_logoH.png"
            />
          </span>
          <div className="login-brand__copy">
            <p className="login-brand__title">
              Journal opératoire des internes en chirurgie
            </p>
            <p className="login-brand__subtitle">
              Suivi, progression au bloc et autonomie opératoire
            </p>
          </div>
        </header>

        <section
          aria-label={
            isPasswordChangeMode ? 'Création du mot de passe' : 'Connexion'
          }
          className="login-card"
        >
          <header className="login-card__header login-card__header--web">
            <span>
              {isPasswordChangeMode ? 'Sécurisation du compte' : 'Accès personnel'}
            </span>
            <h2>
              {isPasswordChangeMode
                ? 'Création du mot de passe'
                : 'Bienvenue'}
            </h2>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            {isPasswordChangeMode ? (
              <>
                {passwordChangeChallenge?.isFirstLogin ? (
                  <>
                    <p className="login-note login-note--compact">
                      Première connexion : renseigne ton adresse e-mail puis
                      choisis ton mot de passe personnel. Un lien te sera envoyé
                      pour activer le compte.
                    </p>

                    <label className="login-field">
                      <span className="login-field__label">Adresse e-mail</span>
                      <span className="login-field__control">
                        <UserIcon />
                        <input
                          autoCapitalize="none"
                          autoComplete="email"
                          autoCorrect="off"
                          className="login-field__input"
                          onChange={(event) => {
                            setContactEmail(event.target.value);
                            setErrorMessage('');
                          }}
                          placeholder="prenom.nom@exemple.fr"
                          type="email"
                          value={contactEmail}
                        />
                      </span>
                    </label>

                  </>
                ) : null}

                <p className="login-note login-note--compact">
                  {PASSWORD_POLICY_HELP}
                </p>

                <label className="login-field">
                  <span className="login-field__label">Nouveau mot de passe</span>
                  <span className="login-field__control">
                    <LockIcon />
                    <input
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect="off"
                      className="login-field__input"
                      onChange={(event) => {
                        setNextPassword(event.target.value);
                        setErrorMessage('');
                      }}
                      placeholder="Nouveau mot de passe"
                      type="password"
                      value={nextPassword}
                    />
                  </span>
                </label>

                <label className="login-field">
                  <span className="login-field__label">Confirmer le mot de passe</span>
                  <span className="login-field__control">
                    <LockIcon />
                    <input
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect="off"
                      className="login-field__input"
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setErrorMessage('');
                      }}
                      placeholder="Confirmer le mot de passe"
                      type="password"
                      value={confirmPassword}
                    />
                  </span>
                </label>
              </>
            ) : (
              <>
                <label className="login-field">
                  <span className="login-field__label">Identifiant</span>
                  <span className="login-field__control">
                    <UserIcon />
                    <input
                      autoCapitalize="none"
                      autoComplete="username"
                      autoCorrect="off"
                      className="login-field__input"
                      onChange={(event) => {
                        setLoginId(event.target.value);
                        setErrorMessage('');
                      }}
                      type="text"
                      value={loginId}
                    />
                  </span>
                </label>

                <label className="login-field">
                  <span className="login-field__label">
                    Mot de passe ou clé d’accès
                  </span>
                  <span className="login-field__control">
                    <LockIcon />
                    <input
                      autoCapitalize="none"
                      autoComplete="current-password"
                      autoCorrect="off"
                      className="login-field__input"
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setErrorMessage('');
                      }}
                      type="password"
                      value={password}
                    />
                  </span>
                </label>
              </>
            )}

            {errorMessage ? (
              <p className="auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            {statusMessage ? (
              <p className="auth-success" role="status">
                {statusMessage}
              </p>
            ) : null}

            <button
              className="login-submit"
              disabled={isLoggingIn}
              type="submit"
            >
              {isLoggingIn
                ? isPasswordChangeMode
                  ? 'Mise à jour...'
                  : 'Connexion...'
                : isPasswordChangeMode
                  ? passwordChangeChallenge?.isFirstLogin
                    ? 'Finaliser mon compte'
                    : 'Mettre à jour le mot de passe'
                  : 'Se connecter'}
            </button>

            {isPasswordChangeMode ? (
              <button
                className="login-submit login-submit--secondary"
                onClick={handleCancelPasswordChange}
                type="button"
              >
                Retour à l'écran de connexion
              </button>
            ) : (
              <button
                className="login-submit login-submit--secondary"
                disabled={isLoggingIn}
                onClick={handlePasswordRecovery}
                type="button"
              >
                Mot de passe oublié
              </button>
            )}

            <div className="login-footer">
              <p className="login-note">
                <ShieldIcon />
                <span>Accès gérés par administrateur local</span>
              </p>
              <p className="login-meta">
                <a
                  aria-label="Contacter l’assistance par e-mail"
                  className="login-meta__contact"
                  href={contactHref}
                >
                  Contact
                </a>
                <span aria-hidden="true" className="login-meta__separator">
                  ·
                </span>
                <span>Version {PUBLIC_SITE_VERSION}</span>
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
