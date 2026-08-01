# Recette web, mobile et qualité — Lot 8

## Ce qui est automatisé

La CI exécute à chaque pull request et à chaque envoi sur `main` :

- les tests unitaires et de conformité ;
- le typage du web et du mobile ;
- la compilation de production ;
- l’audit des dépendances ;
- la validation de la configuration Android, iPhone et iPad ;
- les migrations Supabase à blanc sur une base de test isolée ;
- le parcours croisé Interne–Senior sur cette même base ;
- les parcours E2E Interne, Senior et Administrateur ;
- la connexion publique et les contrôles WCAG A/AA sur Chrome, Edge, Firefox
  et WebKit.

Les tâches `supabase-isolated` et `e2e-authenticated` doivent rester obligatoires
dans la protection de la branche `main`. Les secrets GitHub suivants sont
nécessaires :

- `SUPABASE_TEST_POSTGRES_URL` ;
- `E2E_AUTH_BASE_URL`, qui doit viser un déploiement de test et jamais la
  production ;
- les identifiants et mots de passe `E2E_INTERNAL_*`, `E2E_SENIOR_*` et
  `E2E_ADMIN_*`.

## Commandes locales

```sh
npm test
npm run typecheck
npm run build
npm run test:a11y
npm run test:e2e:public
npm run mobile:config:check
npm run typecheck --prefix mobile
```

Le parcours authentifié et la migration à blanc exigent une base isolée :

```sh
npm run db:migrate:test:dry-run
npm run test:integration:supabase
npm run test:e2e:roles
```

## Matrice manuelle des navigateurs

À chaque version candidate, renseigner la date, le système, la version du
navigateur, le testeur et le résultat.

| Navigateur | Contrôle automatique | Contrôle manuel requis |
| --- | --- | --- |
| Chrome | Chromium/Chrome en CI | Connexion et parcours principal |
| Edge | Edge en CI | Connexion et parcours principal sous Windows |
| Firefox | Firefox en CI | Connexion et parcours principal |
| Safari | WebKit sur macOS en CI | Safari réel sur Mac, iPhone et iPad |

Pour chaque navigateur réel :

1. se connecter avec chaque rôle sur l’environnement de test ;
2. vérifier l’historique partagé Interne–Senior ;
3. contrôler les filtres Senior et l’évaluation par le Senior désigné ;
4. vérifier les exports et l’ouverture du client de messagerie ;
5. fermer complètement le navigateur et confirmer la fin de session web ;
6. vérifier qu’aucune erreur technique en anglais n’est visible.

## Accessibilité manuelle

Les contrôles automatisés ne remplacent pas les essais suivants :

- clavier seul : ordre de tabulation, focus visible, activation par Entrée et
  Espace, fermeture des fenêtres par Échap ;
- VoiceOver sur macOS et iOS ;
- TalkBack sur Android ;
- zoom navigateur à 200 % ;
- contraste et compréhension des messages sans dépendre uniquement de la
  couleur.

Les parcours minimum sont la connexion, l’enregistrement d’une intervention,
l’historique, l’évaluation Senior et la gestion des profils Administrateur.

## Recette mobile

### Android réel

Le profil `preview` produit une distribution interne installable. Créer l’APK
avec :

```sh
npm run build:android:preview --prefix mobile
```

Sur un téléphone réel, vérifier le mode portrait, la biométrie après une
première connexion classique, la reprise après mise en arrière-plan, la perte
réseau, les liens de messagerie, le sélecteur de photo et la réconciliation
Interne–Senior.

### iPhone et iPad sans abonnement Apple

Le profil `ios-simulator` prépare une application autonome pour les simulateurs :

```sh
npm run build:ios:simulator --prefix mobile
```

Tester au minimum un iPhone et un iPad en portrait. Ne lancer ni
`build:ios` ni `submit:ios` tant que l’abonnement Apple Developer est différé.
Un essai sur appareils iOS réels restera nécessaire avant toute publication.

## Sauvegardes et restauration

- chaque matin, contrôler que le LaunchAgent a un code de sortie `0` et qu’une
  nouvelle archive chiffrée existe ;
- chaque mois, exécuter `npm run backup:verify` sur la dernière archive ;
- chaque trimestre, restaurer intégralement une archive dans un projet Supabase
  isolé et jetable, puis vérifier les comptes, interventions et objets Storage ;
- consigner la date, l’archive, la cible isolée, les nombres de lignes et
  d’objets, ainsi que le résultat ;
- ne jamais utiliser la production comme cible d’exercice.

Le lanceur quotidien effectue jusqu’à trois tentatives lorsque le réseau du Mac
n’est pas encore stable au réveil.
