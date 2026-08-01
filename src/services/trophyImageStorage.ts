import {
  getAuthenticatedApiHeaders,
  isAuthenticatedApiAvailable,
} from './authenticatedApi';

const TROPHY_IMAGE_UPLOAD_API_PATH = '/api/trophy-image';
const MAX_TROPHY_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

type UploadTrophyImageInput = {
  file: Blob;
  fileName: string;
  imageKey: string;
  trophyId: string;
};

type UploadTrophyImageResult = {
  path: string;
  publicUrl: string;
};

type CleanupTrophyImagesResult = {
  deleted: number;
  retained: number;
};

export async function uploadTrophyImage({
  file,
  fileName,
  imageKey,
  trophyId,
}: UploadTrophyImageInput): Promise<UploadTrophyImageResult> {
  if (!isAuthenticatedApiAvailable()) {
    throw new Error(
      'La connexion sécurisée n’est pas disponible pour téléverser l’image.'
    );
  }

  if (file.size > MAX_TROPHY_IMAGE_SIZE_BYTES) {
    throw new Error(
      'L’image depasse 4 Mo. Reduis sa taille avant de l’envoyer.'
    );
  }

  const response = await fetch(TROPHY_IMAGE_UPLOAD_API_PATH, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(fileName),
      'X-Trophy-Id': trophyId,
      'X-Image-Key': imageKey,
      ...getAuthenticatedApiHeaders(),
    },
    body: file,
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; path?: string; publicUrl?: string }
    | null;

  if (!response.ok || !payload?.publicUrl || !payload.path) {
    throw new Error(
      payload?.error ??
        'Le televersement de l’image vers le serveur a echoue.'
    );
  }

  return {
    path: payload.path,
    publicUrl: payload.publicUrl,
  };
}

export async function cleanupTrophyImages(
  trophyId: string
): Promise<CleanupTrophyImagesResult> {
  if (!isAuthenticatedApiAvailable()) {
    throw new Error(
      'La connexion sécurisée n’est pas disponible pour nettoyer les images.'
    );
  }

  const response = await fetch(TROPHY_IMAGE_UPLOAD_API_PATH, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthenticatedApiHeaders(),
    },
    body: JSON.stringify({ trophyId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { deleted?: number; error?: string; retained?: number }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error ?? 'Le nettoyage des anciennes images a échoué.'
    );
  }

  return {
    deleted: Number(payload?.deleted ?? 0),
    retained: Number(payload?.retained ?? 0),
  };
}
