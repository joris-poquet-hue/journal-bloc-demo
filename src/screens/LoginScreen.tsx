import { FormEvent, useState } from 'react';

import { useAppContext } from '../context/AppContext';

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

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="login-demo-card__icon" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 11.25v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 8h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
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
  } = useAppContext();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isPasswordChangeMode = passwordChangeChallenge != null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);

    if (isPasswordChangeMode) {
      const result = await completePasswordChangeChallenge(
        nextPassword,
        confirmPassword
      );
      setIsLoggingIn(false);

      if (result.success) {
        setErrorMessage('');
        setPassword('');
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
    setNextPassword('');
    setConfirmPassword('');
    setErrorMessage('');
  };

  return (
    <main className="login-page">
      <div className="login-page__halo login-page__halo--one" />
      <div className="login-page__halo login-page__halo--two" />
      <div className="login-page__line" />

      <div className="login-page__frame">
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

        <section aria-labelledby="login-title" className="login-card">
          <div className="login-card__header">
            <h1 id="login-title">
              {isPasswordChangeMode ? 'Créer votre mot de passe' : 'Connexion'}
            </h1>
            {!isPasswordChangeMode ? (
              <p>Accédez à votre espace interne ou senior.</p>
            ) : null}
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {isPasswordChangeMode ? (
              <>
                <div className="login-note login-note--panel">
                  <span>Choisissez maintenant un mot de passe personnel.</span>
                </div>

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
                      placeholder="Identifiant"
                      type="text"
                      value={loginId}
                    />
                  </span>
                </label>

                <label className="login-field">
                  <span className="login-field__label">Mot de passe</span>
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
                      placeholder="Mot de passe"
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
                  ? 'Mettre à jour le mot de passe'
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
            ) : null}

            <p className="login-note">
              <ShieldIcon />
              <span>Identifiants générés par l’administrateur du service.</span>
            </p>
          </form>
        </section>

        <aside className="login-demo-card" aria-label="Version de démonstration">
          <InfoIcon />
          <div>
            <p className="login-demo-card__title">Version de démonstration</p>
            <p className="login-demo-card__subtitle">En cours de développement…</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
