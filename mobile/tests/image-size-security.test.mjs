import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
let imageSize;
let findBox;

try {
  imageSize = require('image-size');
  ({ findBox } = require('image-size/dist/types/utils'));
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
}

test('image-size est absent ou refuse un bloc ICNS de longueur nulle', () => {
  if (!imageSize) {
    assert.throws(() => require.resolve('image-size'), { code: 'MODULE_NOT_FOUND' });
    return;
  }

  const maliciousIcns = Uint8Array.from([
    0x69, 0x63, 0x6e, 0x73, // icns
    0x00, 0x00, 0x00, 0x10, // longueur totale
    0x69, 0x63, 0x30, 0x37, // ic07
    0x00, 0x00, 0x00, 0x00, // longueur d'entrée malveillante
  ]);

  assert.throws(() => imageSize(maliciousIcns), /Invalid ICNS entry length/);
});

test('image-size est absent ou sa recherche HEIF/JXL avance avec une taille nulle', () => {
  if (!findBox) {
    assert.throws(() => require.resolve('image-size'), { code: 'MODULE_NOT_FOUND' });
    return;
  }

  const zeroSizedBox = Uint8Array.from([
    0x00, 0x00, 0x00, 0x00,
    0x66, 0x74, 0x79, 0x70, // ftyp
    0x00, 0x00, 0x00, 0x00,
    0x6d, 0x65, 0x74, 0x61, // meta
  ]);

  assert.equal(findBox(zeroSizedBox, 'inexistant', 0), undefined);
});
