# Rapport d'activation Interne–Senior en production — 20 juillet 2026

## Préparation

- Une archive chiffrée supplémentaire a été créée immédiatement avant la
  migration puis vérifiée indépendamment.
- La migration avait préalablement réussi sur le projet Supabase isolé.
- Une simulation transactionnelle sur la production avait également réussi sans
  laisser de modification.

## Migration appliquée

La migration
`202607200001_atomic_intervention_realtime_authorization.sql` a été appliquée et
enregistrée dans `public.app_schema_migrations`.

Les contrôles post-migration ont confirmé :

- la présence de `public.evaluation_requests` avec RLS activé ;
- la lecture de cette table pour `authenticated`, sans écriture directe ;
- la présence des fonctions atomiques d'enregistrement et d'évaluation ;
- les politiques de lecture des interventions, évaluations et demandes ;
- la publication Realtime de `interventions`, `intervention_evaluations` et
  `evaluation_requests` ;
- la conservation des trois profils, trois interventions et trois évaluations
  existants.

La table `evaluation_requests` contient zéro ligne après migration, ce qui est
cohérent : les trois interventions historiques disposent déjà d'une évaluation
validée. Les nouvelles interventions évaluables créeront leur demande dans la
même transaction que l'intervention.

## Test croisé transactionnel

Un parcours synthétique complet a ensuite été exécuté dans une transaction de
production, puis annulé par `ROLLBACK` :

- refus d'un Senior d'un autre établissement lors de la désignation ;
- création atomique d'une intervention et de sa demande ;
- idempotence en cas de répétition du même identifiant de mutation ;
- visibilité pour tous les Seniors du même établissement sans dépendance à
  « Mes internes » ;
- absence de lecture depuis un autre établissement ;
- évaluation refusée au Senior non désigné et à l'administrateur ;
- évaluation acceptée uniquement pour le Senior désigné ;
- visibilité immédiate de l'évaluation pour l'Interne ;
- révocation des accès de l'ancien établissement après déplacement ;
- récupération de l'historique et de l'évaluation par le nouvel établissement ;
- présence des tables requises dans Supabase Realtime.

## Contrôle de non-résidu

Après le test :

- comptes Auth : 3 ;
- profils : 3 ;
- interventions : 3 ;
- évaluations : 3 ;
- demandes d'évaluation en attente : 0 ;
- profils synthétiques résiduels : 0 ;
- définitions d'intervention synthétiques résiduelles : 0.

## Extension — suppression atomique avant évaluation

Après une nouvelle sauvegarde externe chiffrée et vérifiée, la migration
`202607200002_pending_intervention_deletion.sql` a suivi la même procédure
sensible :

- simulation transactionnelle sur la production puis `ROLLBACK` : réussie ;
- application en production : réussie ;
- présence dans `public.app_schema_migrations` : confirmée, pour un total de
  11 migrations applicatives ;
- retrait du droit `DELETE` direct pour les rôles authentifiés : confirmé ;
- suppression réservée à l'Interne propriétaire avant toute évaluation :
  confirmée ;
- suppression atomique de la demande d'évaluation et écriture de l'audit :
  confirmées ;
- refus après évaluation et refus pour le Senior et l'Administrateur : confirmés.

Le test d'intégration complet a réussi contre la production dans une transaction
entièrement annulée. Une recette publique distincte a ensuite créé puis supprimé
une intervention synthétique avec le client déployé. Après suppression, les
compteurs synthétiques d'interventions et de demandes étaient tous deux à zéro.
Le nettoyage des quatre comptes temporaires a ramené les cinq compteurs contrôlés
exactement à leur état initial.

## Conclusion

Le backend Supabase de synchronisation atomique, les autorisations
Interne–Senior et la suppression atomique avant évaluation sont actifs en
production. Les sauvegardes pré-migration sont disponibles et aucun élément de
test n'a été conservé. Le client correspondant est actif sur le web public ; le
conteneur mobile qui charge cette interface en bénéficie au rechargement, tandis
que toute diffusion native en boutique reste une opération distincte.
