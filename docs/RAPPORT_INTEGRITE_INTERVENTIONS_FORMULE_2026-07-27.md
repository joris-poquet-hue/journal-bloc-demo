# Lot 4 — Intégrité des interventions, évaluations et formule

Date : 27 juillet 2026
Statut : migrations `202607270006` et `202607270007` et nouveau client actifs
en production ; historique hérité transformé et Lot 4 terminé

## Résultat

Le Lot 4 prépare désormais les garanties suivantes :

- chaque nouvelle intervention reçoit, dans la transaction atomique, un
  instantané versionné de la définition réellement utilisée ;
- la base valide les champs applicables, la compatibilité des choix, la liste
  exacte des étapes et l’échelle protégée `NA`, `0`, `1`, `2`, `3`, `4` ;
- une checklist manquante, surnuméraire, dupliquée ou incompatible est refusée ;
- le score d’autonomie est calculé par PostgreSQL à partir des réponses brutes,
  de l’évaluation Senior, de l’instantané et de la formule officielle publiée ;
- le nouveau client n’envoie plus de score ni d’identité de Senior à la fonction
  d’évaluation ;
- les formules officielles possèdent un identifiant et une version, avec une
  seule version publiée à la fois ;
- publier une formule retire atomiquement la précédente, recalcule les scores,
  alimente les statistiques à partir des scores serveur, recalcule les trophées
  et écrit une trace d’audit ;
- les données brutes d’une intervention et toute évaluation validée sont
  protégées contre l’édition ou la suppression directe, y compris depuis une
  session Administrateur ;
- les écrans et exports historiques utilisent en priorité les libellés et étapes
  de l’instantané, et non le catalogue courant.

## Historique hérité

La migration de schéma ne remplit volontairement aucun instantané ancien.

La fonction `preview_legacy_intervention_snapshot_report()` produit un rapport
agrégé et un hash déterministe sans écrire de donnée. La fonction
`apply_legacy_intervention_snapshots()` exige :

1. le hash exact du dernier rapport ;
2. la confirmation littérale `APPLIQUER HISTORIQUE HERITE` ;
3. une session Administrateur active ;
4. l’absence d’intervention dont la définition de catalogue est introuvable.

Si les interventions ou le catalogue changent entre le rapport et l’écriture,
le hash change et l’opération est automatiquement refusée.

Le remplissage hérité conserve toutes les réponses brutes. Lorsque les clés de
la checklist correspondent exactement au catalogue actuel, le mode
`current_catalog_assumption` est utilisé. Sinon, le mode
`raw_checklist_fallback` conserve les clés historiques et évite de les
transformer silencieusement.

## Rapport signé obtenu pendant la simulation

La migration `202607270006` a été exécutée dans une transaction de production
entièrement annulée. La fonction de prévisualisation temporairement disponible
pendant cette simulation a produit le rapport suivant :

- 3 interventions historiques ;
- 3 interventions évaluées ;
- 0 définition manquante ;
- 0 checklist nécessitant un repli sur les données brutes ;
- 2 interventions pour `custom-1782819006335`, rattachées par hypothèse à la
  définition actuelle version 2 ;
- 1 intervention pour `custom-1783237156067`, rattachée par hypothèse à la
  définition actuelle version 1 ;
- hash du rapport :
  `dcd38d1d294ef96eb6df74a2b6e973b4d2e600422a10311aebfdd71e0114a0aa`.

Les trois lignes sont classées `current_catalog_assumption` : aucune anomalie
technique n’est détectée, mais la correspondance avec les versions actuelles du
catalogue a été explicitement validée par le propriétaire avant l’écriture.

Les trois instantanés ont ensuite été appliqués avec le hash signé. Le rapport
post-opération confirme qu’il ne reste aucune intervention sans instantané :

- 0 intervention historique restante ;
- 0 définition manquante ;
- 0 repli sur une checklist brute ;
- nouveau hash du rapport vide :
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.

## Sauvegarde préalable

Une sauvegarde externe chiffrée et restaurable a été créée avant la simulation :

- date : 27 juillet 2026 à 12 h 42, heure de Paris ;
- contenu : 15 tables applicatives et 9 objets Storage ;
- taille chiffrée : 10 597 061 octets ;
- SHA-256 de l’archive :
  `398061d7a53237c135518013be9d9695ef6e725347d7a2dd9313aa128c0e884e`.

Une seconde sauvegarde a été créée et vérifiée avant la migration
`202607270007` :

- date : 27 juillet 2026 à 12 h 55, heure de Paris ;
- contenu : 16 tables applicatives et 9 objets Storage ;
- taille chiffrée : 10 622 692 octets ;
- SHA-256 de l’archive :
  `375008f239b85cf88d485b720981944d39e506f70c7c3633a30ac511090fb1ad`.

Une troisième sauvegarde a été créée et vérifiée avant la transformation
historique :

- date : 27 juillet 2026 à 13 h 05, heure de Paris ;
- contenu : 16 tables applicatives et 9 objets Storage ;
- taille chiffrée : 10 622 371 octets ;
- SHA-256 de l’archive :
  `f475a2ae2077ed96545c5cbf432537977da7e4bac673d30ed03f90a58fc5a65c`.

## Déploiement sans interruption préparé

La migration est découpée en deux étapes :

1. `202607270006_intervention_integrity_formula.sql` ajoute le schéma et les
   nouvelles fonctions. Cette étape est appliquée en production. Des
   adaptateurs temporaires maintiennent l’ancien client, mais ignorent son score
   et son horodatage ;
2. le nouveau client utilise `create_intervention()` et
   `save_intervention_evaluation()`. Il a été déployé en production le
   27 juillet 2026 ;
3. `202607270007_enforce_intervention_score_authority.sql` retire les deux
   anciennes signatures après vérification du nouveau déploiement. Cette étape
   est appliquée et vérifiée en production ;
4. `202607270008_fix_legacy_snapshot_application.sql` corrige de manière
   versionnée la référence de ligne complète utilisée uniquement par
   l’opération historique. Elle a été sauvegardée, simulée puis appliquée avant
   une nouvelle simulation complète de la transformation.

Cette séquence évite une période pendant laquelle l’enregistrement ou
l’évaluation seraient indisponibles.

## Vérifications réalisées

- contrôle TypeScript web : réussi ;
- contrôle TypeScript mobile : réussi ;
- tests automatisés : 59 réussis, 1 test d’intégration Supabase ignoré faute de
  base de test configurée dans l’environnement courant ;
- compilation web de production : réussie ;
- sauvegarde externe chiffrée : créée et vérifiée ;
- simulation transactionnelle Supabase de `202607270006` : réussie et annulée ;
- application réelle de `202607270006` : réussie ;
- vérification post-migration : 3 interventions et 3 évaluations intactes ;
- préversion Vercel `dpl_A11f3oFUbrGZMHwK2qaFccuaooMa` : `READY`, contrôlée ;
- promotion sans reconstruction du même artefact :
  `dpl_BMsjR7pK7W7zGnWMJr1w3ZPDdKgH`, `READY` ;
- domaine public `https://monjournaldebloc.fr` : HTTP 200 et bundle contrôlé
  `index-BLk4d4F4.js` ;
- bundle public : nouveaux RPC présents, anciennes signatures absentes ;
- API de connexion présente, session anonyme refusée et aucun journal Vercel
  d’erreur après déploiement ;
- simulation transactionnelle de `202607270007` : réussie et annulée ;
- parcours croisé transactionnel avant application : réussi et annulé ;
- application réelle de `202607270007` : réussie ;
- vérification PostgreSQL post-migration : RPC canoniques présents et anciennes
  signatures absentes ;
- parcours croisé transactionnel post-migration : réussi et annulé ;
- aucune donnée synthétique laissée par les tests ;
- une intervention réelle enregistrée à 12 h 45 utilise déjà le nouvel
  instantané et possède sa demande d’évaluation en attente ;
- les trois interventions héritées restent inchangées et constituent les seules
  lignes sans instantané avant leur transformation validée ;
- rapport historique signé pendant la simulation : réussi ;
- rapport historique officiel post-migration : hash identique, aucune écriture ;
- première simulation de transformation : annulée sur une erreur de typage,
  sans écriture ;
- migration corrective `202607270008` : simulée, appliquée et vérifiée ;
- seconde simulation complète : 3 instantanés et 3 scores calculables, puis
  transaction annulée ;
- transformation réelle : 3 instantanés appliqués et 3 scores recalculés ;
- recalcul des trophées : 0 attribution et 0 retrait ;
- contrôle d’intégrité final : 4 interventions sur 4 avec instantané et aucun
  score sans formule ;
- rapport historique final : 0 intervention restante ;
- dernier parcours croisé Interne–Seniors : réussi dans une transaction annulée.

## Conclusion

Toutes les étapes prévues du Lot 4 sont terminées en production. Les futures
modifications de formule restent soumises au mécanisme de publication atomique,
au recalcul rétroactif et aux règles de sauvegarde et de validation du contexte.
