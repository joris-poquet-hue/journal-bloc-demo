import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(
  await readFile(new URL('../mobile/app.json', import.meta.url), 'utf8')
);
const easConfig = JSON.parse(
  await readFile(new URL('../mobile/eas.json', import.meta.url), 'utf8')
);

const expo = appConfig.expo ?? {};
const ios = expo.ios ?? {};
const android = expo.android ?? {};
const build = easConfig.build ?? {};

assert.equal(
  expo.orientation,
  'portrait',
  'L’application doit rester verrouillée en mode portrait.'
);
assert.equal(
  ios.supportsTablet,
  true,
  'La configuration iOS doit prendre en charge l’iPad.'
);
assert.equal(
  ios.requireFullScreen,
  true,
  'Le plein écran iOS est requis pour garantir le verrouillage en portrait sur iPad.'
);
assert.match(
  ios.bundleIdentifier ?? '',
  /^[a-zA-Z][a-zA-Z0-9.-]+$/,
  'Un identifiant iOS stable est requis.'
);
assert.match(
  android.package ?? '',
  /^[a-zA-Z][a-zA-Z0-9_.]+$/,
  'Un identifiant Android stable est requis.'
);
assert.equal(
  build.preview?.distribution,
  'internal',
  'Le profil Android de recette doit produire une distribution interne installable.'
);
assert.equal(
  build['ios-simulator']?.ios?.simulator,
  true,
  'Un profil iOS Simulator sans publication doit rester disponible.'
);
assert.notEqual(
  build.production?.ios?.simulator,
  true,
  'Le profil de production ne doit pas être confondu avec le simulateur.'
);

console.log(
  'Configuration mobile valide : Android interne, iPhone/iPad en portrait et profil iOS Simulator prêt.'
);
