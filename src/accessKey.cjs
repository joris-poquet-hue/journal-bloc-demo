const { createHmac, randomBytes, randomUUID } = require('crypto');

const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ACCESS_KEY_CHARACTER_COUNT = 8;

function generateUnbiasedAlphabetCharacter() {
  const acceptableByteLimit =
    256 - (256 % ACCESS_KEY_ALPHABET.length);

  while (true) {
    const value = randomBytes(1)[0];

    if (value < acceptableByteLimit) {
      return ACCESS_KEY_ALPHABET[value % ACCESS_KEY_ALPHABET.length];
    }
  }
}

function generateAccessKey() {
  const characters = Array.from(
    { length: ACCESS_KEY_CHARACTER_COUNT },
    generateUnbiasedAlphabetCharacter
  );

  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}

function deriveAccessKey(operationId, secret) {
  const normalizedOperationId = String(operationId ?? '').trim().toLowerCase();
  const normalizedSecret = String(secret ?? '');

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizedOperationId
    )
  ) {
    throw new Error('Invalid provisional access-key operation identifier.');
  }

  if (Buffer.byteLength(normalizedSecret, 'utf8') < 32) {
    throw new Error(
      'PROVISIONAL_ACCESS_KEY_SECRET must contain at least 32 bytes.'
    );
  }

  const acceptableByteLimit =
    256 - (256 % ACCESS_KEY_ALPHABET.length);
  const characters = [];
  let counter = 0;

  while (characters.length < ACCESS_KEY_CHARACTER_COUNT) {
    const digest = createHmac('sha256', normalizedSecret)
      .update(`provisional-access-key:v1:${normalizedOperationId}:${counter}`)
      .digest();

    for (const value of digest) {
      if (value < acceptableByteLimit) {
        characters.push(ACCESS_KEY_ALPHABET[value % ACCESS_KEY_ALPHABET.length]);

        if (characters.length === ACCESS_KEY_CHARACTER_COUNT) {
          break;
        }
      }
    }

    counter += 1;
  }

  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}

function isAccessKey(value) {
  return new RegExp(
    `^[${ACCESS_KEY_ALPHABET}]{4}-[${ACCESS_KEY_ALPHABET}]{4}$`
  ).test(String(value ?? '').trim().toUpperCase());
}

function toPendingAuthPassword(accessKey) {
  const normalizedAccessKey = String(accessKey ?? '').trim().toUpperCase();

  if (!isAccessKey(normalizedAccessKey)) {
    throw new Error('Invalid provisional access key.');
  }

  // Supabase applies its full password-complexity policy to admin password
  // updates. This fixed envelope leaves the user-facing key unchanged while
  // ensuring every initial Auth secret contains all required character classes.
  return `A${normalizedAccessKey}a1!`;
}

function generatePendingAuthEmail() {
  return `activation+${randomUUID()}@auth.monjournaldebloc.fr`;
}

module.exports = {
  ACCESS_KEY_ALPHABET,
  deriveAccessKey,
  generateAccessKey,
  generatePendingAuthEmail,
  isAccessKey,
  toPendingAuthPassword,
};
