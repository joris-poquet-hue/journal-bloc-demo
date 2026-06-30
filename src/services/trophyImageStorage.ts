import {
  getPersistentStorageAuthHeaders,
  isPersistentStorageConfigured,
} from './persistentStorage';

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

export async function uploadTrophyImage({
  file,
  fileName,
  imageKey,
  trophyId,
}: UploadTrophyImageInput): Promise<UploadTrophyImageResult> {
  if (!isPersistentStorageConfigured()) {
    throw new Error(
      'La connexion persistante n’est pas disponible pour televerser l’image.'
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
      ...getPersistentStorageAuthHeaders(),
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
