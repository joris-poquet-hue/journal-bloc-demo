import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('le web propose la suppression uniquement lorsqu’une photo existe', () => {
  const profileScreen = readProjectFile('src/screens/ProfileScreen.tsx');

  assert.match(profileScreen, /const handleRemovePhoto = async \(\) =>/);
  assert.match(
    profileScreen,
    /selectedInternal\.avatarImageSrc \? \([\s\S]*Supprimer la photo de profil[\s\S]*\) : null/
  );
  assert.match(
    profileScreen,
    /updateInternalProfileSettings\(selectedInternal\.id, \{\s*avatarImageSrc: null,\s*\}\)/
  );
  assert.match(profileScreen, /disabled=\{isUpdatingPhoto\}/);
  assert.match(profileScreen, /Revenir à l’affichage de mes initiales/);
  assert.match(profileScreen, /openSheet\('photo-removal'\)/);
  assert.match(profileScreen, /role=\{activeSheet === 'photo-removal' \? 'alertdialog' : 'dialog'\}/);
  assert.match(profileScreen, /Supprimer définitivement/);
  assert.match(
    profileScreen,
    /const closeSheetIfPhotoIdle = \(\) => \{\s*if \(!isUpdatingPhoto\) \{\s*closeSheet\(\)/
  );
});

test('le résultat web distingue bien une photo supprimée d’une photo remplacée', () => {
  const appContext = readProjectFile('src/context/AppContext.tsx');

  assert.match(
    appContext,
    /input\.avatarImageSrc[\s\S]*La photo de profil a bien été mise à jour\.[\s\S]*La photo de profil a bien été supprimée\./
  );
});

test('la RPC transforme explicitement la suppression en NULL', () => {
  const migration = readProjectFile(
    'supabase/migrations/202607150002_remove_profile_current_rotation.sql'
  );

  assert.match(
    migration,
    /when p_update_avatar then nullif\(trim\(coalesce\(p_avatar_image_src, ''\)\), ''\)/
  );
  assert.match(
    migration,
    /grant execute on function public\.update_own_profile_settings[\s\S]*to authenticated/
  );
});
