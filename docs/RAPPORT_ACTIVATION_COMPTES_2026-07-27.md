# Lot 2 — Activation initiale des comptes

Date de préparation locale : 27 juillet 2026.

## Règles couvertes

Le lot applique les règles de la section 4 de `CONTEXTE_PROJET.md` :

- seul l’Administrateur crée les comptes ;
- l’Administrateur renseigne l’identité, l’établissement et l’identifiant ;
- le serveur génère une clé provisoire cryptographiquement sûre ;
- la clé contient huit caractères non ambigus et s’affiche sous la forme
  `XXXX-XXXX` ;
- elle n’expire pas avant utilisation ;
- elle n’est jamais stockée en clair ;
- l’utilisateur renseigne deux fois son e-mail et choisit son mot de passe à la
  première connexion ;
- la clé devient invalide dès que cette activation est finalisée ;
- une clé perdue peut être régénérée, ce qui invalide immédiatement la
  précédente.

## Architecture retenue

La clé provisoire est utilisée comme secret initial de Supabase Auth. Une
enveloppe technique déterministe, invisible pour l’utilisateur, ajoute les
classes de caractères exigées par la politique de mot de passe Supabase sans
modifier la clé courte `XXXX-XXXX` affichée et saisie. Supabase conserve
uniquement la représentation protégée de ce secret par son mécanisme de hachage
de mot de passe. Aucune colonne applicative, métadonnée de profil ou donnée
`localStorage` ne reçoit la clé en clair.

À la création :

1. l’API serveur génère la clé avec `crypto.randomBytes` ;
2. l’utilisateur Auth reçoit une adresse technique réservée à l’activation ;
3. le profil métier est créé sans adresse e-mail personnelle ;
4. la clé est retournée une seule fois à l’Administrateur ;
5. l’interface la conserve uniquement en mémoire jusqu’à sa fermeture.

À la première connexion :

1. l’utilisateur saisit son identifiant et sa clé ;
2. une session Auth limitée est ouverte ;
3. les politiques RLS refusent toute identité et toute donnée métier tant que
   `must_change_password` est vrai ;
4. l’utilisateur saisit deux fois son adresse e-mail et deux fois son mot de
   passe ;
5. le serveur remplace simultanément l’adresse technique et la clé par l’e-mail
   et le mot de passe personnels ;
6. le profil devient activé et une nouvelle session est renvoyée.

Le marqueur `pending_activation` est placé dans `app_metadata`, inaccessible en
écriture à l’utilisateur, et non dans `user_metadata`.

## Régénération

La régénération est disponible uniquement pour un compte actif qui n’a pas
encore terminé sa première connexion. Elle :

- exige une session Administrateur ;
- vérifie la version du profil ;
- génère une nouvelle clé côté serveur ;
- remplace immédiatement le secret Supabase Auth et invalide donc l’ancienne
  clé ;
- retourne la nouvelle clé une seule fois ;
- écrit une trace dans le journal d’audit.

Un compte déjà activé utilise la récupération de mot de passe par e-mail.

## Protection des données

La migration
`supabase/migrations/202607270003_pending_account_activation_guard.sql` :

- retire l’identité métier aux sessions en attente ;
- ajoute une politique RLS restrictive commune aux tables métier ;
- protège les fonctions Senior exécutées avec des privilèges élevés ;
- interdit d’utiliser l’ancienne fonction de finalisation pour contourner le
  parcours serveur ;
- empêche de comptabiliser une connexion avant l’activation complète.

La migration ne transforme et ne supprime aucune donnée historique.

## Contrôles locaux

- contrôle TypeScript web : réussi ;
- contrôle TypeScript mobile : réussi ;
- compilation Vite de production : réussie ;
- tests automatisés : 44 réussis, 1 test d’intégration ignoré faute de base de
  test dédiée ;
- contrôle syntaxique des fonctions serveur : réussi ;
- contrôle `git diff --check` : réussi ;
- contrôle visuel local de l’écran de connexion : réussi, sans erreur console.

Le test d’intégration Supabase a été étendu pour vérifier qu’une session en
attente ne voit aucun profil ni définition métier et ne peut pas contourner la
première activation. Il doit être exécuté pendant la simulation transactionnelle
avant la migration de production.

## Validation et diffusion en production

Le 27 juillet 2026 :

- une archive chiffrée fraîche a été créée dans la destination iCloud validée,
  puis relue, déchiffrée et vérifiée sans restauration ;
- la migration a été simulée dans une transaction annulée ;
- la recette croisée Interne–Seniors, autorisations et changement
  d’établissement a réussi avant et après la migration ;
- la migration
  `supabase/migrations/202607270003_pending_account_activation_guard.sql` a été
  appliquée une seule fois en production ;
- les totaux réels sont restés inchangés : trois profils, trois interventions,
  trois évaluations et un établissement ;
- les douze tables métier encore présentes portent la politique restrictive
  `activated_session_required` ;
- une recette de bout en bout a créé deux comptes entièrement synthétiques,
  contrôlé les API déployées et supprimé toutes ses données après le test.

La première préversion a révélé que Supabase imposait sa politique complète de
complexité lors de la régénération d’un mot de passe Auth. Le serveur a donc été
adapté pour entourer techniquement la clé visible `XXXX-XXXX` des classes de
caractères requises. Cette enveloppe n’est jamais affichée ni stockée dans les
données applicatives.

La recette finale a confirmé :

- le retour unique de la clé lors de la création ;
- l’invalidation immédiate de la clé précédente après régénération ;
- l’absence totale de données métier dans une session en attente ;
- le remplacement de l’adresse technique par l’e-mail personnel ;
- l’invalidation de la clé après activation ;
- la lecture normale du profil autorisé avec le mot de passe personnel ;
- le retour exact aux totaux initiaux après nettoyage.

La préversion vérifiée `dpl_4X9ETMHMxmU6UfrPhSSMU1LHfXZx` a été promue sans
nouvelle modification fonctionnelle. Le déploiement de production
`dpl_6DkZ3oze1iode5DncU7DcH63PDSc` est `READY` et sert
`https://monjournaldebloc.fr`. Le contrôle post-déploiement n’a trouvé ni log
d’erreur ni réponse HTTP 500.
