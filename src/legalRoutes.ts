export const LEGAL_INFORMATION_PATH = '/informations-legales';

const LEGACY_LEGAL_INFORMATION_PATHS = [
  '/mentions-legales',
  '/politique-confidentialite',
] as const;

export function isLegalInformationPath(pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';

  return (
    normalizedPathname === LEGAL_INFORMATION_PATH ||
    LEGACY_LEGAL_INFORMATION_PATHS.some(
      (legacyPath) => normalizedPathname === legacyPath
    )
  );
}
