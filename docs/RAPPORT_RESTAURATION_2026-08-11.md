# Exercice de restauration — 11 août 2026

## Périmètre autorisé

La copie temporaire de l'archive complète de production a été autorisée
exclusivement vers le projet Supabase isolé
`project1-integration-test-20260811` (`gpqyoyuaqrqozkenqbfl`) pour cet exercice
de restauration et les tests de conformité. La production n'a jamais été
utilisée comme cible.

## Archive contrôlée

- fichier : `project1-supabase-2026-08-11T10-40-08-541Z.p1backup` ;
- empreinte SHA-256 :
  `0f780c8d2cb87e92cd82f0c6507b109c3ff7ba3ec1abb06200bd16b815a8dbbb` ;
- contenu : PostgreSQL, Auth, Storage et migrations ;
- vérification cryptographique : réussie.

## Résultat

- reconstruction complète du schéma `public` isolé : réussie ;
- migrations rejouées : réussies ;
- données applicatives restaurées et vérifiées : 1 222 lignes ;
- objets Storage restaurés puis retéléchargés et vérifiés : 9 ;
- comptes E2E synthétiques Interne, Senior et Administrateur reprovisionnés ;
- connexion des trois rôles : réussie ;
- test croisé Interne–Seniors, évaluation par le Senior désigné et changement
  d'établissement : réussi ;
- tests de sauvegarde et de conformité locaux : 114 réussis, 1 test connecté
  ignoré dans la suite générale puis exécuté séparément avec succès.

## Correctif issu de l'exercice

L'exercice a montré que l'ancien script réaccordait des privilèges génériques
après les migrations, ce qui pouvait annuler certaines révocations de sécurité.
Le script prépare désormais les privilèges par défaut avant les migrations et
laisse ensuite chaque migration appliquer ses restrictions définitives. La
table historique `app_state`, lorsqu'elle existe dans une ancienne archive,
reste inaccessible aux rôles `anon` et `authenticated`.

La reconstruction destructive du schéma `public` exige à la fois l'option
`--rebuild-public-schema` et `PROJECT1_RESTORE_DRILL=1`. Elle est donc réservée
aux cibles isolées explicitement préparées pour un exercice.
