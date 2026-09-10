import {
  Laptop,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  beginMfaEnrollment,
  disableMfa,
  loadAccountSecurityStatus,
  revokeAccountSession,
  revokeOtherAccountSessions,
  verifyMfaEnrollment,
  type AccountSecurityStatus,
  type MfaEnrollment,
} from '../services/accountSecurityService';

type SecurityFeedback = {
  message: string;
  tone: 'error' | 'success';
} | null;

function formatSessionDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Date inconnue'
    : date.toLocaleString('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export function AccountSecurityPanel() {
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [feedback, setFeedback] = useState<SecurityFeedback>(null);
  const [operation, setOperation] = useState<string | null>('load');

  const refreshStatus = useCallback(async () => {
    setOperation('load');

    try {
      setStatus(await loadAccountSecurityStatus());
      setFeedback(null);
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Impossible de charger la sécurité du compte.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleBeginEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperation('begin-mfa');
    setFeedback(null);

    try {
      setEnrollment(await beginMfaEnrollment(currentPassword));
      setVerificationCode('');
      setFeedback({
        message:
          'Scanne le QR code puis confirme avec le code temporaire affiché.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Configuration impossible.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  };

  const handleVerifyEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!enrollment) {
      return;
    }

    setOperation('verify-mfa');
    setFeedback(null);

    try {
      await verifyMfaEnrollment(
        currentPassword,
        enrollment.factorId,
        verificationCode
      );
      setEnrollment(null);
      setCurrentPassword('');
      setVerificationCode('');
      await refreshStatus();
      setFeedback({
        message:
          'Double authentification activée. Les autres sessions ont été révoquées.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Vérification impossible.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  };

  const handleDisableMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperation('disable-mfa');
    setFeedback(null);

    try {
      await disableMfa(currentPassword, verificationCode);
      setCurrentPassword('');
      setVerificationCode('');
      await refreshStatus();
      setFeedback({
        message:
          'Double authentification désactivée. Les autres sessions ont été révoquées.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Désactivation impossible.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setOperation(`revoke:${sessionId}`);
    setFeedback(null);

    try {
      await revokeAccountSession(sessionId);
      await refreshStatus();
      setFeedback({ message: 'Appareil déconnecté.', tone: 'success' });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Déconnexion impossible.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  };

  const handleRevokeOthers = async () => {
    setOperation('revoke-others');
    setFeedback(null);

    try {
      const result = await revokeOtherAccountSessions();
      await refreshStatus();
      setFeedback({
        message:
          result.revokedCount > 0
            ? `${result.revokedCount} autre appareil${
                result.revokedCount > 1 ? 's' : ''
              } déconnecté${result.revokedCount > 1 ? 's' : ''}.`
            : 'Aucun autre appareil actif.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Déconnexion impossible.',
        tone: 'error',
      });
    } finally {
      setOperation(null);
    }
  };

  const isBusy = operation !== null;
  const otherSessions =
    status?.sessions.filter((session) => !session.isCurrent) ?? [];

  return (
    <div className="account-security-panel">
      {feedback ? (
        <div
          className={feedback.tone === 'success' ? 'auth-success' : 'auth-error'}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="account-security-card">
        <header className="account-security-card__header">
          <span className="account-security-card__icon" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div>
            <h3>Double authentification</h3>
            <p>
              Un code temporaire protège la connexion en plus du mot de passe.
            </p>
          </div>
        </header>

        {operation === 'load' && !status ? (
          <p className="account-security-loading" role="status">
            <LoaderCircle aria-hidden="true" /> Chargement…
          </p>
        ) : null}

        {status?.mfa.enabled ? (
          <div className="account-security-stack">
            <p className="account-security-state account-security-state--enabled">
              <ShieldCheck aria-hidden="true" /> Protection active
            </p>
            <details className="account-security-details">
              <summary>Désactiver la double authentification</summary>
              <form onSubmit={handleDisableMfa} className="account-security-form">
                <label>
                  <span>Mot de passe actuel</span>
                  <input
                    autoComplete="current-password"
                    disabled={isBusy}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    type="password"
                    value={currentPassword}
                  />
                </label>
                <label>
                  <span>Code de vérification</span>
                  <input
                    autoComplete="one-time-code"
                    disabled={isBusy}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setVerificationCode(
                        event.target.value.replace(/\D/g, '').slice(0, 6)
                      )
                    }
                    pattern="[0-9]{6}"
                    required
                    value={verificationCode}
                  />
                </label>
                <button className="account-button account-button--danger" disabled={isBusy} type="submit">
                  Désactiver
                </button>
              </form>
            </details>
          </div>
        ) : null}

        {status && !status.mfa.enabled && !enrollment ? (
          <form
            className="account-security-form"
            onSubmit={handleBeginEnrollment}
          >
            {status.mfa.requiredForRole ? (
              <p className="account-security-recommendation">
                Cette protection est fortement recommandée pour ton rôle.
              </p>
            ) : null}
            <label>
              <span>Mot de passe actuel</span>
              <input
                autoComplete="current-password"
                disabled={isBusy}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </label>
            <button className="account-button" disabled={isBusy} type="submit">
              Configurer une application d’authentification
            </button>
          </form>
        ) : null}

        {enrollment ? (
          <form
            className="account-security-enrollment"
            onSubmit={handleVerifyEnrollment}
          >
            <p>
              Scanne ce QR code avec ton application d’authentification. En cas
              d’impossibilité, saisis la clé manuellement.
            </p>
            {enrollment.qrCode ? (
              <img
                alt="QR code de configuration de la double authentification"
                className="account-security-enrollment__qr"
                src={enrollment.qrCode}
              />
            ) : null}
            <code className="account-security-enrollment__secret">
              {enrollment.secret}
            </code>
            <p className="account-security-recommendation">
              Conserve cette clé dans un gestionnaire de mots de passe sécurisé :
              elle permet de reconfigurer l’application si tu changes de téléphone.
            </p>
            <label>
              <span>Code à six chiffres</span>
              <input
                autoComplete="one-time-code"
                autoFocus
                disabled={isBusy}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setVerificationCode(
                    event.target.value.replace(/\D/g, '').slice(0, 6)
                  )
                }
                pattern="[0-9]{6}"
                required
                value={verificationCode}
              />
            </label>
            <div className="account-security-actions">
              <button
                className="account-button"
                disabled={isBusy}
                onClick={() => {
                  setEnrollment(null);
                  setCurrentPassword('');
                  setVerificationCode('');
                }}
                type="button"
              >
                Annuler
              </button>
              <button className="account-button" disabled={isBusy} type="submit">
                Activer la protection
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="account-security-card">
        <header className="account-security-card__header">
          <span className="account-security-card__icon" aria-hidden="true">
            <Laptop />
          </span>
          <div>
            <h3>Appareils connectés</h3>
            <p>Contrôle les sessions actives et déconnecte un appareil inconnu.</p>
          </div>
          <button
            aria-label="Actualiser les appareils connectés"
            className="account-security-refresh"
            disabled={isBusy}
            onClick={() => void refreshStatus()}
            type="button"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        </header>

        <div className="account-security-sessions">
          {status?.sessions.map((session) => (
            <article className="account-security-session" key={session.id}>
              <span className="account-security-session__icon" aria-hidden="true">
                {session.clientKind === 'mobile' ? <Smartphone /> : <Laptop />}
              </span>
              <div className="account-security-session__copy">
                <strong>
                  {session.deviceLabel}
                  {session.isCurrent ? ' · Cet appareil' : ''}
                </strong>
                <span>Dernière activité : {formatSessionDate(session.lastSeenAt)}</span>
                <small>Connecté le {formatSessionDate(session.createdAt)}</small>
              </div>
              {!session.isCurrent ? (
                <button
                  aria-label={`Déconnecter ${session.deviceLabel}`}
                  className="account-security-session__revoke"
                  disabled={isBusy}
                  onClick={() => void handleRevokeSession(session.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              ) : null}
            </article>
          ))}
          {status && status.sessions.length === 0 ? (
            <p>Aucun appareil actif.</p>
          ) : null}
        </div>

        {otherSessions.length > 0 ? (
          <button
            className="account-button account-button--danger"
            disabled={isBusy}
            onClick={() => void handleRevokeOthers()}
            type="button"
          >
            Déconnecter tous les autres appareils
          </button>
        ) : null}
      </section>
    </div>
  );
}
