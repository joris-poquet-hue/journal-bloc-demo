const { randomUUID } = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TROPHY_IMAGES_BUCKET =
  process.env.SUPABASE_TROPHY_IMAGES_BUCKET || 'trophy-images';
const ADMIN_LOGIN_ID = 'adminbeta';
const ADMIN_PASSWORD = 'Fred3132848002!';
const MAX_TROPHY_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

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

function normalizeCredentialValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAuthorizedAdmin(request) {
  const loginId = normalizeCredentialValue(request.headers['x-app-login-id']);
  const password = normalizeCredentialValue(request.headers['x-app-password']);

  return (
    loginId === normalizeCredentialValue(ADMIN_LOGIN_ID) &&
    password === normalizeCredentialValue(ADMIN_PASSWORD)
  );
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

function getExtension(fileName, contentType) {
  const normalizedFileName = String(fileName ?? '').trim();
  const fileNameSegments = normalizedFileName.split('.');

  if (fileNameSegments.length > 1) {
    const extension = fileNameSegments[fileNameSegments.length - 1]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (extension) {
      return extension;
    }
  }

  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  if (contentType === 'image/gif') {
    return 'gif';
  }

  return 'jpg';
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
      public: true,
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

module.exports = async function handler(request, response) {
  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'Le stockage Supabase n est pas configure sur ce deploiement.',
    });
  }

  if (!isAuthorizedAdmin(request)) {
    return sendJson(response, 401, { error: 'Acces non autorise.' });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Methode non autorisee.' });
  }

  const contentType = String(
    request.headers['content-type'] || 'application/octet-stream'
  );
  const encodedFileName = String(request.headers['x-file-name'] || '');
  const trophyId = sanitizePathSegment(request.headers['x-trophy-id'], 'trophy');
  const imageKey = sanitizePathSegment(request.headers['x-image-key'], 'image');

  if (!contentType.startsWith('image/')) {
    return sendJson(response, 400, {
      error: 'Seules les images peuvent etre televersees.',
    });
  }

  let fileBuffer;

  try {
    fileBuffer = await getBodyBuffer(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
      return sendJson(response, 413, {
        error: 'L image depasse la limite de 4 Mo.',
      });
    }

    return sendJson(response, 400, {
      error: 'Impossible de lire l image televersee.',
    });
  }

  if (!fileBuffer.length) {
    return sendJson(response, 400, {
      error: 'L image televersee est vide.',
    });
  }

  const fileName = decodeURIComponent(encodedFileName || 'image');
  const extension = getExtension(fileName, contentType);
  const filePath = `${trophyId}/${imageKey}-${Date.now()}-${randomUUID()}.${extension}`;

  try {
    await ensureBucket();
  } catch (error) {
    return sendJson(response, 502, {
      error:
        error instanceof Error
          ? error.message
          : 'Impossible de preparer le bucket de stockage.',
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
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${encodeStoragePath(
      `${TROPHY_IMAGES_BUCKET}/${filePath}`
    )}`,
  });
};
