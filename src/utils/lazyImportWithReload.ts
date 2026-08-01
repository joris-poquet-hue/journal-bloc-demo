const CHUNK_RELOAD_SESSION_KEY = 'journal-bord:chunk-reload-pending';

function isChunkLoadError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('failed to fetch dynamically imported module') ||
    normalizedMessage.includes('error loading dynamically imported module') ||
    normalizedMessage.includes('importing a module script failed') ||
    normalizedMessage.includes('chunkloaderror')
  );
}

export async function lazyImportWithReload<T>(importer: () => Promise<T>) {
  try {
    const module = await importer();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
    }
    return module;
  } catch (error) {
    if (
      typeof window !== 'undefined' &&
      isChunkLoadError(error) &&
      !window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)
    ) {
      window.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1');
      window.location.reload();
      return new Promise<never>(() => {});
    }

    throw error;
  }
}
