# Rapport de recette réelle Interne–Senior en production — 20 juillet 2026

## Objectif et précautions

Cette recette a vérifié le parcours réellement visible par les utilisateurs sur
`https://monjournaldebloc.fr`, puis les autorisations Supabase après un changement
d'établissement. Elle a été exécutée uniquement avec quatre comptes synthétiques
et deux noms d'établissement réservés à la recette.

Avant toute création, une sauvegarde externe chiffrée et restaurable a été créée
et vérifiée :

- archive : `project1-supabase-2026-07-20T10-16-17-336Z.p1backup` ;
- taille : 10 553 083 octets ;
- SHA-256 :
  `48a0c7c2debe8d606571e531622e11e5fb6dfd7d99a6561c6984a5a859ccb0c1` ;
- contenu vérifié : 13 tables applicatives et 9 objets Supabase Storage.

L'identifiant isolant cette recette était `r20260720101932155cb1`. Aucun mot de
passe synthétique n'est conservé dans ce rapport.

## Parcours réalisé dans l'interface de production

### Enregistrement par l'Interne — conforme

L'Interne synthétique a enregistré une salpingectomie complète avec un Senior
désigné. L'interface n'a affiché le succès qu'après le retour de la fonction
atomique Supabase. L'intervention est ensuite apparue dans l'historique de
l'Interne avec l'état « En attente d'évaluation ».

### Visibilité Senior du même établissement — écart critique dans l'interface

Un autre Senior du même établissement, non désigné pour l'évaluation, pouvait
lire l'intervention et le profil de l'Interne au travers des politiques RLS
Supabase. Pourtant, son interface affichait « Aucun interne disponible ».

Le backend respecte donc la règle d'établissement, mais l'écran Senior applique
encore un filtre de présentation fondé sur les « Relations récentes » ou « Mes
internes ». Il empêche l'accès effectif à l'historique auquel le Senior est
pourtant autorisé.

### Évaluation par le Senior désigné — conforme

Le Senior désigné a vu l'intervention dans « Interventions à évaluer », puis a
enregistré :

- performance 4, « Compatible autonomie supervisée » ;
- difficulté 2, « Intermédiaire » ;
- un commentaire synthétique de recette.

Après validation, la demande a disparu de la liste d'attente. L'Interne a retrouvé
dans son historique le score de 65 %, les niveaux, la difficulté et le commentaire
du Senior. Aucun bouton de modification ou de suppression n'était proposé après
l'évaluation, conformément au verrouillage attendu.

### Suppression avant évaluation — écart critique

Avant l'évaluation, la carte en attente n'ouvrait aucun détail permettant sa
suppression. Le code client bloque l'ouverture d'une intervention non validée et
les politiques RLS de production n'autorisent actuellement la suppression que
pour l'administrateur. La règle permettant à l'Interne propriétaire de supprimer
sa propre intervention tant qu'elle n'est pas évaluée n'est donc pas disponible,
ni dans l'interface ni dans les autorisations serveur.

## Changement d'établissement

Après le déplacement de l'Interne de l'établissement A vers l'établissement B,
les lectures authentifiées au travers des règles Supabase ont donné :

| Compte synthétique | Interventions visibles | Internes visibles |
| --- | ---: | ---: |
| Interne déplacé | 1 | 0 |
| Senior désigné de l'ancien établissement | 0 | 0 |
| Autre Senior de l'ancien établissement | 0 | 0 |
| Senior du nouvel établissement | 1 | 1 |

La révocation de l'ancien établissement et la récupération de tout l'historique
par le nouvel établissement sont donc conformes dans Supabase.

En revanche, après une nouvelle connexion, l'interface du Senior du nouvel
établissement affichait encore « Aucun interne disponible ». Le même écart client
empêche donc aussi l'accès effectif à l'historique après déplacement.

## Correctif appliqué après la recette

À la suite de cette observation, le code client commun au web et à l'application
a été corrigé afin de :

- donner accès à « Tous les internes », « Mes internes » et « Relations récentes »
  au moyen de la carte cyclique historique ;
- utiliser « Tous les internes » comme vue initiale ;
- conserver « Mes internes » comme raccourci de favoris sans effet sur les
  autorisations ;
- conserver « Relations récentes » comme filtre d'affichage uniquement ;
- adapter le conteneur mobile qui ouvre automatiquement « Mes internes » après la
  configuration des favoris.

Le test de contrat ajouté, les contrôles TypeScript web et mobile et la
compilation web réussissent. Une préversion Vercel du correctif a ensuite été
vérifiée puis promue sur `https://monjournaldebloc.fr` le 20 juillet 2026. Le
fragment Senior servi par le domaine public contient bien les trois filtres et
correspond exactement au build local contrôlé.

Après contrôle du premier rendu, le propriétaire a demandé le rétablissement de
la présentation cyclique historique. Cette présentation a été restaurée sans
modifier les trois filtres ni leur portée, puis rediffusée le 20 juillet 2026.
« Tous les internes » reste la valeur initiale.

## Recette de confirmation après le second correctif

Après activation de la suppression atomique et diffusion du nouveau client, une
seconde recette authentifiée a été exécutée sur le site public avec un nouveau
jeu de quatre comptes synthétiques. L'Interne a enregistré une salpingectomie
complète. Supabase contenait alors exactement une intervention et une demande
d'évaluation propres à la recette.

Les lectures authentifiées ont confirmé que :

- le Senior désigné voyait l'Interne et l'intervention ;
- l'autre Senior du même établissement voyait le même Interne et la même
  intervention ;
- le Senior d'un autre établissement ne voyait ni l'Interne ni l'intervention ;
- « Mes internes » n'intervenait dans aucune de ces autorisations.

Dans l'historique de l'Interne, la carte en attente est restée verrouillée et
aucune action de suppression n'y était exposée. Dans
`Profil > Mes données > Interventions en attente`, la même intervention était
présente. Après la confirmation « Supprimer et recommencer », le client a attendu
Supabase puis a ouvert une nouvelle saisie vierge. Le contrôle serveur a alors
confirmé zéro intervention et zéro demande d'évaluation synthétiques.

Le navigateur n'a produit aucune erreur de console. Les quatre comptes et profils
temporaires ont été supprimés et tous les compteurs contrôlés sont revenus
exactement à leur valeur initiale.

## Résultats consolidés

| Règle vérifiée | Résultat |
| --- | --- |
| Enregistrement atomique confirmé par Supabase avant succès | Conforme |
| Intervention visible par le Senior désigné | Conforme |
| Évaluation réservée au Senior désigné | Conforme |
| Résultat de l'évaluation visible par l'Interne | Conforme |
| Lecture RLS pour tous les Seniors du même établissement | Conforme côté Supabase |
| Accès dans l'interface pour tous les Seniors du même établissement | Conforme après correctif et recette authentifiée |
| Indépendance des autorisations vis-à-vis de « Mes internes » | Conforme côté Supabase et dans le client diffusé |
| Suppression par l'Interne avant évaluation | Conforme dans l'interface et côté serveur |
| Verrouillage après évaluation | Conforme dans l'interface et côté serveur |
| Révocation des anciens accès après déplacement | Conforme côté Supabase |
| Accès du nouvel établissement à tout l'historique | Conforme côté Supabase ; client diffusé |

Un avertissement technique non bloquant a également été observé après plusieurs
connexions successives dans le même contexte navigateur : plusieurs instances du
client d'authentification Supabase utilisaient la même clé de stockage. Aucune
erreur fonctionnelle n'en a résulté pendant la recette, mais ce point mérite une
vérification lors du durcissement des sessions.

## Nettoyage et contrôle de non-résidu

Avant nettoyage, la recette contenait quatre comptes Auth, quatre profils, une
intervention, une évaluation et une demande d'évaluation synthétiques.

Après nettoyage automatisé :

- résidus Auth synthétiques : 0 ;
- profils synthétiques : 0 ;
- interventions synthétiques : 0 ;
- évaluations synthétiques : 0 ;
- demandes synthétiques : 0.

Les compteurs de production sont exactement revenus à leur valeur initiale :
3 comptes Auth, 3 profils, 3 interventions, 3 évaluations et 0 demande en attente.
Les données réelles n'ont pas été modifiées.

## Conclusion

Le socle atomique et les autorisations Supabase sont validés sur un parcours réel
de production. Les trois filtres Senior et la suppression atomique d'une
intervention en attente par son Interne propriétaire sont diffusés et contrôlés
sur le site public. Le nettoyage final n'a laissé aucun résidu synthétique.
