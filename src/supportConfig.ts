const DEFAULT_SUPPORT_EMAIL = 'contact@monjournaldebloc.fr';

function resolveSupportEmail(configuredEmail: string | undefined) {
  const candidate = configuredEmail?.trim() ?? '';

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : DEFAULT_SUPPORT_EMAIL;
}

export const SUPPORT_EMAIL = resolveSupportEmail(
  import.meta.env.VITE_SUPPORT_EMAIL
);

export function buildSupportMailto({
  body,
  subject,
}: {
  body?: string;
  subject: string;
}) {
  const query = [
    `subject=${encodeURIComponent(subject)}`,
    body ? `body=${encodeURIComponent(body)}` : null,
  ]
    .filter(Boolean)
    .join('&');

  return `mailto:${SUPPORT_EMAIL}?${query}`;
}
