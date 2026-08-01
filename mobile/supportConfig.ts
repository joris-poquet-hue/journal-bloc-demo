const DEFAULT_SUPPORT_EMAIL = 'contact@monjournaldebloc.fr';
const configuredSupportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';

export const SUPPORT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
  configuredSupportEmail
)
  ? configuredSupportEmail
  : DEFAULT_SUPPORT_EMAIL;

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
