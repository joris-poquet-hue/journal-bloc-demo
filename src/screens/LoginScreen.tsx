import { FormEvent, useState } from 'react';

import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';

export function LoginScreen() {
  const { login } = useAppContext();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const isAuthenticated = login(loginId, password);

    if (isAuthenticated) {
      setErrorMessage('');
      return;
    }

    setErrorMessage('Identifiant ou mot de passe incorrect.');
  };

  return (
    <ScreenContainer
      eyebrow="Connexion"
      title="Accès au journal"
    >
      <SectionCard
        title="Accès réservé"
        description="Les identifiants sont générés localement."
      >
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-stack">
            <span className="field-stack__label">Identifiant</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className="field-input"
              onChange={(event) => {
                setLoginId(event.target.value);
                setErrorMessage('');
              }}
              placeholder="Identifiant"
              type="text"
              value={loginId}
            />
          </label>

          <label className="field-stack">
            <span className="field-stack__label">Mot de passe</span>
            <input
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect="off"
              className="field-input"
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage('');
              }}
              placeholder="Mot de passe"
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <p className="auth-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button className="app-button app-button--primary" type="submit">
            Se connecter
          </button>
        </form>
      </SectionCard>
    </ScreenContainer>
  );
}
