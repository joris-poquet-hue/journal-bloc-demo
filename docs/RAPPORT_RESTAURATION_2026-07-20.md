# Rapport de vérification de restauration — 20 juillet 2026

## Périmètre

L'exercice a été effectué sur le projet Supabase isolé de Project1. Il n'a utilisé
aucune donnée de production ni aucun contenu médical réel.

Le jeu synthétique comprenait :

- un compte Auth avec une adresse réservée au test et un mot de passe connu ;
- un profil Interne synthétique ;
- une définition d'intervention synthétique ;
- une intervention synthétique liée au profil ;
- un bucket privé et un fichier texte synthétique.

## Déroulement

1. Reconstruction du schéma isolé à partir des dix migrations versionnées.
2. Création du jeu synthétique.
3. Vérification de la connexion Auth avant sauvegarde.
4. Création et contrôle d'une archive chiffrée Project1.
5. Suppression du bucket, des données applicatives et du compte Auth.
6. Vérification que les quatre compteurs principaux étaient à zéro et que la
   connexion Auth échouait.
7. Restauration transactionnelle d'Auth et des données applicatives.
8. Recréation du bucket et transfert du fichier par l'API Storage.
9. Contrôle des nombres de lignes et de l'empreinte SHA-256 du fichier.
10. Nouvelle connexion avec le mot de passe d'origine.
11. Seconde restauration de la même archive pour vérifier l'idempotence.

## Résultats

Tous les contrôles ont réussi :

- mot de passe Auth d'origine utilisable après restauration ;
- identité du profil identique ;
- intervention et identifiant de mutation identiques ;
- contenu du fichier Storage identique ;
- accès serveur `service_role` opérationnel après reconstruction ;
- métadonnée `cacheControl` Storage normalisée ;
- aucune restauration partielle après les essais initialement refusés par les
  permissions Supabase : chaque échec SQL a été annulé par transaction.

## Production

Deux archives chiffrées de production ont été créées dans la destination iCloud
le même jour. La plus récente, produite après les corrections issues de
l'exercice, a été vérifiée indépendamment. Elle contient douze tables
applicatives et neuf objets Storage.

L'archive de production n'a pas été restaurée sur le projet isolé, afin de ne pas
y dupliquer les données réelles.

## Conclusion

La sauvegarde, la vérification d'intégrité et la restauration opérationnelle sont
fonctionnelles. La sauvegarde automatique quotidienne est active avec une
rétention de trente jours. Le propriétaire a confirmé avoir conservé la clé de
récupération sur un support distinct du Mac et d'iCloud. Les exigences de
sauvegarde préalable sont donc satisfaites.
