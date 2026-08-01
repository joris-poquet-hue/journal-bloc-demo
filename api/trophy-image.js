const { randomUUID } = require('crypto');
const {
  SUPABASE_ANON_KEY,
  authenticateApplicationSession,
  createSupabaseApplicationJwt,
  getRequestBody,
  requireAdmin,
} = require('../src/serverAuth.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TROPHY_IMAGES_BUCKET =
  process.env.SUPABASE_TROPHY_IMAGES_BUCKET || 'trophy-images';
const MAX_TROPHY_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const TROPHY_IMAGE_EXTENSIONS = new Map([
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function getSupabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function sanitizePathSegment(value, fallback) {
  const sanitizedValue = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitizedValue || fallback;
}

function encodeStoragePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function hasExpectedImageSignature(buffer, contentType) {
  if (contentType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    );
  }

  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
  }

  if (contentType === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }

  if (contentType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

async function readErrorMessage(response) {
  const payload = await response.json().catch(() => null);

  if (payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  return null;
}

function getBodyBuffer(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on('data', (chunk) => {
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalLength += nextChunk.length;

      if (totalLength > MAX_TROPHY_IMAGE_SIZE_BYTES) {
        reject(new Error('FILE_TOO_LARGE'));
        request.destroy();
        return;
      }

      chunks.push(nextChunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    request.on('error', reject);
  });
}

async function ensureBucket() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: TROPHY_IMAGES_BUCKET,
      name: TROPHY_IMAGES_BUCKET,
      public: false,
    }),
  });

  const errorMessage = await readErrorMessage(response);
  const bucketAlreadyExists =
    response.status === 409 ||
    (response.status === 400 &&
      typeof errorMessage === 'string' &&
      errorMessage.toLowerCase().includes('already exists'));

  if (response.ok || bucketAlreadyExists) {
    return;
  }

  throw new Error(errorMessage || 'Impossible de preparer le bucket Supabase.');
}

function getStoragePathFromUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value, 'https://project1.invalid');

    if (url.pathname === '/api/trophy-image') {
      const proxiedPath = url.searchParams.get('path');

      return proxiedPath || null;
    }
  } catch {
    return null;
  }

  const marker = `/storage/v1/object/public/${TROPHY_IMAGES_BUCKET}/`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  const encodedPath = value.slice(markerIndex + marker.length).split('?')[0];

  try {
    return encodedPath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return null;
  }
}

async function loadTrophyDefinition(trophyId) {
  const searchParams = new URLSearchParams({
    id: `eq.${trophyId}`,
    limit: '1',
    select: 'id,status,definition',
  });
  const definitionResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/trophy_definitions?${searchParams.toString()}`,
    {
      headers: getSupabaseHeaders(),
    }
  );

  if (!definitionResponse.ok) {
    throw new Error('Impossible de vérifier la définition du trophée.');
  }

  const definitions = await definitionResponse.json();
  return Array.isArray(definitions) ? definitions[0] ?? null : null;
}

async function canReadSurpriseTrophy(identity, trophyId) {
  const searchParams = new URLSearchParams({
    limit: '1',
    select: 'id',
    trophy_id: `eq.${trophyId}`,
  });
  const jwt = createSupabaseApplicationJwt(identity);
  const awardsResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/trophy_awards?${searchParams.toString()}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jwt}`,
      },
    }
  );

  if (!awardsResponse.ok) {
    return false;
  }

  const awards = await awardsResponse.json();
  return Array.isArray(awards) && awards.length > 0;
}

async function serveTrophyImage(request, response) {
  const identity = await authenticateApplicationSession(request);

  if (!identity) {
    return sendJson(response, 401, { error: 'Une authentification est requise.' });
  }

  const requestUrl = new URL(request.url, 'https://project1.invalid');
  const trophyId = String(requestUrl.searchParams.get('trophyId') ?? '').trim();
  const path = String(requestUrl.searchParams.get('path') ?? '').trim();
  const normalizedTrophyPath = `${sanitizePathSegment(trophyId, '')}/`;

  if (
    !trophyId ||
    !path ||
    path.startsWith('/') ||
    path.includes('..') ||
    !normalizedTrophyPath ||
    !path.startsWith(normalizedTrophyPath)
  ) {
    return sendJson(response, 400, { error: 'Chemin d’image invalide.' });
  }

  const trophy = await loadTrophyDefinition(trophyId);

  if (!trophy) {
    return sendJson(response, 404, { error: 'Image introuvable.' });
  }

  if (identity.profile.role !== 'admin') {
    if (trophy.status !== 'active') {
      return sendJson(response, 404, { error: 'Image introuvable.' });
    }

    const isSurprise = trophy.definition?.visibility === 'surprise';

    if (isSurprise && !(await canReadSurpriseTrophy(identity, trophyId))) {
      return sendJson(response, 404, { error: 'Image introuvable.' });
    }
  }

  const objectResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeStoragePath(
      `${TROPHY_IMAGES_BUCKET}/${path}`
    )}`,
    {
      headers: getSupabaseHeaders(),
    }
  );

  if (!objectResponse.ok) {
    return sendJson(response, 404, { error: 'Image introuvable.' });
  }

  response.statusCode = 200;
  response.setHeader(
    'Content-Type',
    objectResponse.headers.get('content-type') || 'application/octet-stream'
  );
  // Access can change when a trophy is earned, deactivated or when the active
  // account changes in the same browser. Never reuse a protected image from a
  // previous authenticated session.
  response.setHeader('Cache-Control', 'private, no-store');
  response.end(Buffer.from(await objectResponse.arrayBuffer()));
}

function collectReferencedStoragePaths(value, referencedPaths) {
  const storagePath = getStoragePathFromUrl(value);

  if (storagePath) {
    referencedPaths.add(storagePath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedStoragePaths(item, referencedPaths));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) =>
      collectReferencedStoragePaths(item, referencedPaths)
    );
  }
}

async function loadReferencedTrophyImagePaths() {
  const searchParams = new URLSearchParams({ select: 'definition' });
  const [definitionsResponse, draftsResponse] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/trophy_definitions?${searchParams.toString()}`,
      { headers: getSupabaseHeaders() }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/trophy_definition_drafts?${searchParams.toString()}`,
      { headers: getSupabaseHeaders() }
    ),
  ]);

  if (!definitionsResponse.ok || !draftsResponse.ok) {
    throw new Error('Impossible de vérifier les images utilisées.');
  }

  const rows = [
    ...((await definitionsResponse.json()) ?? []),
    ...((await draftsResponse.json()) ?? []),
  ];
  const referencedPaths = new Set();

  if (Array.isArray(rows)) {
    rows.forEach((row) =>
      collectReferencedStoragePaths(row?.definition, referencedPaths)
    );
  }

  return referencedPaths;
}

async function listTrophyImagePaths(trophyId) {
  const paths = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const listResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(
        TROPHY_IMAGES_BUCKET
      )}`,
      {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit,
          offset,
          prefix: `${trophyId}/`,
          sortBy: { column: 'name', order: 'asc' },
        }),
      }
    );

    if (!listResponse.ok) {
      throw new Error('Impossible de lister les anciennes images du trophée.');
    }

    const objects = await listResponse.json();
    const fileObjects = Array.isArray(objects)
      ? objects.filter((object) => object?.id && typeof object.name === 'string')
      : [];

    fileObjects.forEach((object) => {
      const objectPath = object.name.startsWith(`${trophyId}/`)
        ? object.name
        : `${trophyId}/${object.name}`;
      paths.push(objectPath);
    });

    if (!Array.isArray(objects) || objects.length < limit) {
      break;
    }

    offset += limit;
  }

  return paths;
}

async function deleteStoragePaths(paths) {
  if (!paths.length) {
    return;
  }

  const deleteResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(
      TROPHY_IMAGES_BUCKET
    )}`,
    {
      method: 'DELETE',
      headers: {
        ...getSupabaseHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: paths }),
    }
  );

  if (!deleteResponse.ok) {
    throw new Error('Impossible de supprimer les anciennes images du trophée.');
  }
}

async function cleanupTrophyImages(trophyId) {
  const [referencedPaths, trophyImagePaths] = await Promise.all([
    loadReferencedTrophyImagePaths(),
    listTrophyImagePaths(trophyId),
  ]);
  const unusedPaths = trophyImagePaths.filter(
    (storagePath) => !referencedPaths.has(storagePath)
  );

  await deleteStoragePaths(unusedPaths);

  return {
    deleted: unusedPaths.length,
    retained: trophyImagePaths.length - unusedPaths.length,
  };
}

module.exports = async function handler(request, response) {
  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'Le stockage Supabase n’est pas configuré sur ce déploiement.',
    });
  }

  if (request.method === 'GET') {
    try {
      return await serveTrophyImage(request, response);
    } catch (error) {
      console.error('Unable to serve protected trophy image.', error);
      return sendJson(response, 502, {
        error: 'Impossible de charger l’image du trophée.',
      });
    }
  }

  let adminIdentity;

  try {
    adminIdentity = await requireAdmin(request);
  } catch (error) {
    console.error('Unable to verify trophy upload session.', error);
    return sendJson(response, 503, { error: 'Impossible de vérifier la session.' });
  }

  if (!adminIdentity) {
    return sendJson(response, 401, { error: 'Accès non autorisé.' });
  }

  if (request.method === 'DELETE') {
    let body;

    try {
      body = await getRequestBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Corps JSON invalide.' });
    }

    const trophyId = sanitizePathSegment(body?.trophyId, '');

    if (!trophyId) {
      return sendJson(response, 400, { error: 'Identifiant de trophée invalide.' });
    }

    try {
      const cleanupResult = await cleanupTrophyImages(trophyId);

      return sendJson(response, 200, cleanupResult);
    } catch (error) {
      console.error('Unable to clean up trophy images.', error);
      return sendJson(response, 502, {
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de nettoyer les images du trophée.',
      });
    }
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  const contentType = String(
    request.headers['content-type'] || 'application/octet-stream'
  )
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const trophyId = sanitizePathSegment(request.headers['x-trophy-id'], 'trophy');
  const imageKey = sanitizePathSegment(request.headers['x-image-key'], 'image');

  if (!TROPHY_IMAGE_EXTENSIONS.has(contentType)) {
    return sendJson(response, 400, {
      error: 'Utilisez une image PNG, JPEG, WebP ou GIF.',
    });
  }

  let fileBuffer;

  try {
    fileBuffer = await getBodyBuffer(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
      return sendJson(response, 413, {
        error: 'L’image dépasse la limite de 4 Mo.',
      });
    }

    return sendJson(response, 400, {
      error: 'Impossible de lire l’image téléversée.',
    });
  }

  if (!fileBuffer.length) {
    return sendJson(response, 400, {
      error: 'L’image téléversée est vide.',
    });
  }

  if (!hasExpectedImageSignature(fileBuffer, contentType)) {
    return sendJson(response, 400, {
      error: 'Le contenu du fichier ne correspond pas à une image valide.',
    });
  }

  const extension = TROPHY_IMAGE_EXTENSIONS.get(contentType);
  const filePath = `${trophyId}/${imageKey}-${Date.now()}-${randomUUID()}.${extension}`;

  try {
    await ensureBucket();
  } catch (error) {
    return sendJson(response, 502, {
      error:
        error instanceof Error
          ? error.message
          : 'Impossible de préparer l’espace de stockage.',
    });
  }

  const uploadResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeStoragePath(
      `${TROPHY_IMAGES_BUCKET}/${filePath}`
    )}`,
    {
      method: 'POST',
      headers: {
        ...getSupabaseHeaders(),
        'Content-Type': contentType,
        'Cache-Control': '3600',
        'x-upsert': 'true',
      },
      body: fileBuffer,
    }
  );

  if (!uploadResponse.ok) {
    const errorMessage = await readErrorMessage(uploadResponse);

    return sendJson(response, uploadResponse.status, {
      error:
        errorMessage || 'Impossible de televerser l image dans Supabase Storage.',
    });
  }

  return sendJson(response, 200, {
    path: filePath,
    publicUrl: `/api/trophy-image?trophyId=${encodeURIComponent(
      trophyId
    )}&path=${encodeURIComponent(filePath)}`,
  });
};
