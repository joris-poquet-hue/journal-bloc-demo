# Rapport de mise en place — Lot 8

Date : 27 juillet 2026

## Réalisé

- séparation explicite de l’interface web et de la WebView mobile ;
- première mise en page ordinateur : connexion à deux colonnes, navigation
  latérale Interne et tableau de bord élargi ;
- ajout de Playwright et de contrôles d’accessibilité Axe ;
- ajout des parcours E2E Interne, Senior et Administrateur ;
- matrice publique Chromium, Chrome, Edge, Firefox et WebKit ;
- CI avec tests, typage, audits npm, builds, migration Supabase à blanc et test
  croisé sur base isolée ;
- refus explicite d’exécuter les E2E authentifiés contre la production ;
- traduction des dernières erreurs d’API visibles par l’utilisateur ;
- profil Android interne installable et profil iOS Simulator sans publication ;
- contrôle automatique du portrait, de l’iPad et des identifiants natifs ;
- correction ciblée de la dépendance mobile vulnérable sans régression d’Expo ;
- guide de recette navigateurs, clavier, lecteurs d’écran et appareils réels ;
- sauvegarde quotidienne renforcée par trois tentatives automatiques.

## Vérifications exécutées

- 68 tests réussis et un test Supabase isolé ignoré localement ;
- typage web et mobile réussi ;
- build Vite de production réussi ;
- neuf tests publics réussis sur Chromium, Firefox et WebKit ;
- aucune violation WCAG A/AA détectée sur la connexion ;
- contrôle visuel à 1 440 px : contenu présent, grille ordinateur active, aucune
  surcouche d’erreur et aucune erreur console ;
- aucun problème détecté par `git diff --check` ;
- audits npm web et mobile : zéro vulnérabilité connue ;
- configuration Expo 57 valide pour Android, iPhone et iPad ;
- nouvelle sauvegarde automatique créée avec un code de sortie `0` ;
- archive du 27 juillet 2026 à 12:18:46 UTC déchiffrée et validée : seize tables
  applicatives et neuf objets Storage, sans écriture dans Supabase.

## Contrôles qui exigent encore un environnement externe

- renseigner les secrets GitHub de la base Supabase isolée et des trois comptes
  E2E, puis rendre les tâches correspondantes obligatoires sur `main` ;
- exécuter le test croisé et les migrations à blanc dans cette base isolée ;
- faire la recette manuelle sur Safari réel, Chrome, Firefox et Edge ;
- faire les essais VoiceOver, TalkBack et clavier prévus dans le guide ;
- installer l’APK de recette sur un Android réel ;
- créer puis tester le build iOS Simulator sur un iPhone et un iPad virtuels ;
- conserver la publication Apple désactivée tant que l’abonnement est différé.

Le dernier exercice de restauration complète sur cible isolée est documenté dans
`docs/RAPPORT_RESTAURATION_2026-07-20.md`. La prochaine répétition trimestrielle
doit être consignée de la même manière.
