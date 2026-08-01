# Rapport de validation — suppression d’une intervention en attente

## Périmètre

La validation a d’abord été exécutée le 20 juillet 2026 sur le projet Supabase
isolé de Project1. Après autorisation explicite du propriétaire, elle a été
répétée sur le projet principal par test transactionnel annulé, puis dans
l’interface publique avec quatre comptes et une intervention entièrement
synthétiques. Les données réelles n’ont pas été modifiées.

## Règle validée

- seul l’Interne propriétaire peut supprimer son intervention ;
- la suppression est autorisée uniquement avant toute évaluation ;
- la demande d’évaluation est supprimée dans la même transaction ;
- l’action produit une trace d’audit ;
- les Seniors et l’Administrateur ne peuvent pas utiliser cette fonction ;
- aucun rôle authentifié ne conserve un droit de suppression directe sur les
  interventions ;
- après confirmation de Supabase, le client retire l’intervention puis redémarre
  une saisie vierge ;
- l’action est placée dans `Paramètres > Mes données > Interventions en attente` ;
  les cartes en attente restent verrouillées dans l’historique.

## Contrôles effectués

1. Simulation transactionnelle sans écriture de la migration
   `202607200002_pending_intervention_deletion.sql` : réussie.
2. Application de la migration sur le projet Supabase isolé : réussie.
3. Test d’intégration croisé avec un Interne propriétaire, un autre Interne, deux
   Seniors et un Administrateur : réussi sans test ignoré.
4. Vérification du refus après évaluation et du refus du `DELETE` direct
   Administrateur : réussie.
5. Annulation transactionnelle du jeu de données synthétique en fin de test :
   réussie.
6. Tests automatisés du dépôt : 12 réussis, 1 test d’intégration distant ignoré
   dans la commande locale standard.
7. TypeScript web, TypeScript mobile et build Vite de production : réussis.
8. Sauvegarde externe chiffrée et vérifiée juste avant production :
   `project1-supabase-2026-07-20T11-23-02-311Z.p1backup`, 10 556 919 octets,
   SHA-256
   `03390f98a1ca6244fc1ec24c032fc2dbc0056005f2b724fdf5f66f2f6355503b`,
   13 tables applicatives et 9 objets Storage.
9. Simulation de la migration sur la production puis `ROLLBACK` : réussie.
10. Application de la migration en production et enregistrement comme onzième
    migration dans `public.app_schema_migrations` : réussis.
11. Test d’intégration complet contre la production dans une transaction annulée :
    réussi sans test ignoré.
12. Préversion Vercel `dpl_FTqin8aPdsQY7xa6ynBjt4Y6EZAR` contrôlée, puis même
    artefact promu en production sous `dpl_65uUse1MAkoddYhGM2Gw4xhk8fJK` :
    statuts `Ready`.
13. Recette authentifiée sur `https://monjournaldebloc.fr` : enregistrement
    confirmé par Supabase, carte en attente verrouillée dans l’historique,
    action présente uniquement dans `Profil > Mes données`, confirmation
    explicite et redémarrage sur une saisie vierge après suppression.
14. Contrôle croisé avant suppression : l’intervention était visible par le
    Senior désigné et l’autre Senior du même établissement, et invisible pour le
    Senior d’un autre établissement.
15. Contrôle Supabase après suppression : 0 intervention et 0 demande
    d’évaluation synthétiques ; aucune erreur de console dans le navigateur.
16. Nettoyage : 0 résidu Auth, profil, intervention, évaluation ou demande ; les
    compteurs sont revenus exactement à 3 comptes Auth, 3 profils,
    3 interventions, 3 évaluations et 0 demande en attente.
17. Dernier contrôle Vercel : aucun journal de niveau erreur trouvé sur le
    déploiement de production.

## État de la production

La migration et le nouveau client sont actifs en production depuis le 20 juillet
2026. Le domaine public sert le fragment `ProfileScreen-BZcTt_vx.js`, identique au
fragment local contrôlé avec le SHA-256
`aa8c6cb0ca0ca6073427b446241f0bd271c68742fc9d0dd8899318cae1bce281`.
La fonction est disponible dans le web et dans l’application mobile qui charge
l’interface web publique. Aucune nouvelle diffusion native en boutique n’a été
effectuée dans cette opération.
