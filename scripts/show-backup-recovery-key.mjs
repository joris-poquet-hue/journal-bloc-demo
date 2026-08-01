#!/usr/bin/env node

import { readEncodedBackupKey } from './external-backup-lib.mjs';

if (!process.stdout.isTTY) {
  throw new Error(
    'Cette commande doit être lancée directement dans un Terminal afin que la clé ne soit pas copiée dans un journal.'
  );
}

const encodedKey = await readEncodedBackupKey();

console.log('Clé de récupération Project1 :');
console.log(encodedKey);
console.log();
console.log(
  'Conservez cette clé dans un gestionnaire de mots de passe ou sur un support physique distinct du Mac et d’iCloud.'
);
