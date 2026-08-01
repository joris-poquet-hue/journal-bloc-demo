const { randomBytes, randomUUID } = require('crypto');

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
  generateAccessKey,
  generatePendingAuthEmail,
  isAccessKey,
  toPendingAuthPassword,
};
