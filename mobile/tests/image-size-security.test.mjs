import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const imageSize = require('image-size');
const { findBox } = require('image-size/dist/types/utils');

test('un bloc ICNS de longueur nulle est refusé sans bloquer la boucle Node', () => {
  const maliciousIcns = Uint8Array.from([
    0x69, 0x63, 0x6e, 0x73, // icns
    0x00, 0x00, 0x00, 0x10, // longueur totale
    0x69, 0x63, 0x30, 0x37, // ic07
    0x00, 0x00, 0x00, 0x00, // longueur d'entrée malveillante
  ]);

  assert.throws(() => imageSize(maliciousIcns), /Invalid ICNS entry length/);
});

test('la recherche de boîte HEIF/JXL avance même avec une taille nulle', () => {
  const zeroSizedBox = Uint8Array.from([
    0x00, 0x00, 0x00, 0x00,
    0x66, 0x74, 0x79, 0x70, // ftyp
    0x00, 0x00, 0x00, 0x00,
    0x6d, 0x65, 0x74, 0x61, // meta
  ]);

  assert.equal(findBox(zeroSizedBox, 'inexistant', 0), undefined);
});
