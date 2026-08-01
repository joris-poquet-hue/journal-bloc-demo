# Lot 1 — Rapport préalable au référentiel des établissements

Date de l'inventaire : 27 juillet 2026
Environnement contrôlé : Supabase de production
Nature du contrôle : lecture seule, sans modification de données

## 1. Objectif

Ce rapport inventorie les noms d'établissements actuellement utilisés avant la
création du référentiel officiel `institutions`.

Conformément au contexte du projet, aucune migration de rattachement ne doit
être lancée avant validation humaine de la correspondance entre les textes
existants et les futurs établissements officiels.

## 2. Valeurs présentes en production

| Valeur actuelle | Profils | Actifs | Internes | Seniors | Administrateurs |
| --- | ---: | ---: | ---: | ---: | ---: |
| `CHU de Nantes` | 2 | 2 | 1 | 1 | 0 |
| valeur vide (`NULL`) | 1 | 1 | 0 | 0 | 1 |

Total : 3 profils.

La valeur vide appartient au compte Administrateur. Elle est conforme au modèle
actuel : seuls les comptes cliniques Interne et Senior doivent être rattachés à
un établissement.

## 3. Doublons et variantes

Aucun doublon, aucune différence de casse et aucune variante orthographique
n'ont été détectés dans les profils de production.

Les noms synthétiques présents dans les tests et les scripts de recette, par
exemple `Établissement A`, `Établissement B` ou `Recette MJDB ...`, ne sont pas
des données de production et ne doivent pas être intégrés au référentiel
officiel.

## 4. Correspondance proposée

| Texte historique | Établissement officiel proposé | Décision requise |
| --- | --- | --- |
| `CHU de Nantes` | `CHU de Nantes` | Validé le 27 juillet 2026 |
| valeur vide de l'Administrateur | Aucun rattachement | Validé le 27 juillet 2026 |

Identifiant technique : il sera généré par la base et restera stable même si
l'établissement est renommé ultérieurement.

## 5. Dépendances techniques constatées

Le champ texte `profiles.institution` est encore utilisé par :

- les politiques RLS de visibilité Interne–Senior ;
- les fonctions de répertoire des profils ;
- la désignation du Senior évaluateur ;
- la gestion de « Mes internes » ;
- l'API de création et de modification des comptes ;
- les formulaires Administrateur ;
- l'affichage des profils ;
- les tests d'autorisation et de déplacement d'établissement ;
- les scripts de recette et d'import historique.

La migration devra donc conserver temporairement `profiles.institution` pendant
la période de transition. Le nouveau champ `profiles.institution_id` sera ajouté
en parallèle, puis les autorisations basculeront vers l'identifiant stable après
vérification des rattachements.

## 6. Point de validation

Le propriétaire du projet a confirmé le 27 juillet 2026 :

1. que le nom officiel à créer est bien `CHU de Nantes` ;
2. que le compte Administrateur doit rester sans établissement.

Cette validation autorise la préparation de la migration. L'application en
production reste inchangée tant que la migration et le client correspondant
n'ont pas été explicitement déployés.
