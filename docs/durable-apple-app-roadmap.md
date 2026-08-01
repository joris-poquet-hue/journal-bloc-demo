# Mon Journal de Bloc: socle durable web + app Apple

> Document historique. Les décisions de session, de stockage local et de mode
> hors ligne décrites dans les anciennes étapes sont remplacées par
> `CONTEXTE_PROJET.md` et par le rapport du Lot 3. Le client web ne reçoit plus
> de jeton Supabase et l’application n’embarque plus de cache métier hors ligne.

## Objectif

Construire une base commune pour la version web et la future app iPhone/iPad, avec les memes comptes, les memes donnees et une synchronisation fiable.

La version actuelle reste utilisable pendant la migration. Le premier objectif est de sortir progressivement du stockage local et du tableau JSON global `app_state`, sans casser les ecrans existants.

## Architecture cible

- Web: React/Vite conserve pour la version navigateur.
- Mobile Apple et Android: coque native React Native + Expo qui embarque la vue web responsive canonique.
- Backend commun: Supabase Auth, Postgres, Row Level Security et Storage.
- Contrat partage: types TypeScript communs pour les entites metier.
- Synchronisation: mutations idempotentes via `client_mutation_id`, puis cache local mobile pour le mode hors-ligne.

Decision produit: l'experience admin reste une interface web/ordinateur. L'application Apple cible uniquement les roles `internal` et `senior`.

## Modele de donnees cible

- `profiles`: comptes applicatifs avec role `internal`, `senior` ou `admin`.
- `senior_internal_assignments`: internes suivis par chaque senior.
- `surgical_intervention_definitions`: catalogue des interventions et definitions personnalisees.
- `interventions`: interventions saisies par les internes.
- `intervention_evaluations`: evaluations seniors rattachees aux interventions.
- `notebook_documents`: carnet personnel par interne.
- `trophy_definitions`: configuration admin des trophees.
- `trophy_awards`: trophees attribues aux internes.
- `activity_log`: journal d'activite.
- `legacy_app_state_imports`: zone de migration depuis l'ancien stockage.

## Ordre de migration recommande

1. Appliquer la migration Supabase `202607010001_durable_backend_foundation.sql` sur un environnement de test.
2. Creer les comptes Supabase Auth et lier chaque utilisateur a `profiles.auth_user_id`.
3. Ecrire un script d'import depuis les anciennes cles `app_state`.
4. Brancher la version web en lecture sur les nouvelles tables, tout en gardant le stockage actuel comme filet de securite.
5. Basculer les ecritures web table par table: profils, interventions, evaluations, notebook, trophees.
6. Creer l'app Expo et connecter son login au meme backend.
7. Ajouter le cache mobile et la synchronisation differee pour les blocs sans reseau.

## Decisions techniques

- Les mots de passe ne doivent plus etre stockes dans les profils applicatifs.
- Les roles applicatifs vivent dans `profiles.role`, pas dans le client.
- Les seniors accedent aux internes via `senior_internal_assignments`.
- Les roles Interne et Senior partagent exactement les memes ecrans responsives sur le web et dans l'app.
- Les images de trophees restent dans Supabase Storage avec le bucket `trophy-images`.

## Prochain lot

- Ajouter un client Supabase cote web.
- Ajouter un service `backendRepository` qui lit les nouvelles tables.
- Preparer le script d'import de `app_state` vers les tables normalisees.
- Remplacer progressivement `persistentStorage.ts` par ce repository.

## Etape 2: client web et repository

Le client web est volontairement leger et sans dependance externe pour cette phase. Il utilise les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, puis enverra le jeton d'acces Supabase Auth avec `setSupabaseAccessToken()` quand l'authentification sera branchee.

Le service `backendRepository` sait deja lire:

- les profils et seniors visibles;
- le catalogue des interventions;
- les interventions d'un interne ou les internes suivis par un senior;
- les evaluations;
- les carnets;
- les trophees et attributions;
- le journal d'activite.

Tant que l'auth Supabase n'est pas branchee dans l'interface, ce repository reste une couche de preparation. La version web continue donc de fonctionner avec le stockage persistant actuel.

## Etape 3: import legacy app_state

Le script `scripts/import-legacy-app-state.mjs` prepare la bascule depuis l'ancien stockage `app_state` vers les tables normalisees.

Commandes:

- `npm run db:migrate:durable`: applique la migration SQL du socle durable sur Supabase.
- `npm run db:verify:durable`: recompte les lignes des nouvelles tables.
- `npm run migrate:legacy:dry-run`: lit `app_state`, transforme les donnees et affiche les volumes sans ecrire.
- `npm run migrate:legacy:apply`: applique les upserts dans les nouvelles tables.

Le script de migration SQL charge `SUPABASE_POSTGRES_URL_NON_POOLING` depuis l'environnement ou `.env.production.local`. Le script d'import charge `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` depuis l'environnement ou depuis `.env.local`. Il cree des UUID deterministes a partir des anciens IDs texte pour garder les relations stables entre profils, interventions, evaluations et trophees.

Ce que l'import couvre:

- profils internes, seniors et profil admin applicatif;
- affectations senior-interne;
- definitions d'interventions personnalisees et definitions placeholder pour les procedures deja utilisees;
- interventions, evaluations et carnets;
- trophees admin et anciens badges deja attribues;
- journal d'activite et retours de test.

Ce que l'import ne fait pas encore:

- creer les comptes Supabase Auth;
- remplir `profiles.auth_user_id`;
- remplacer le flux de connexion actuel dans l'interface.

Etat apres import:

- `profiles`: 2
- `surgical_intervention_definitions`: 1
- `interventions`: 1
- `trophy_definitions`: 1
- `activity_log`: 33
- `legacy_app_state_imports`: 9

## Prochaine etape: authentification Supabase

Le schema durable et les donnees legacy sont en place. La suite consiste a creer ou lier les comptes Supabase Auth, puis a remplir `profiles.auth_user_id`. Tant que cette liaison n'est pas faite, les politiques RLS existent mais l'interface web continue d'utiliser l'ancien flux de connexion.

Commandes Option A:

- `npm run auth:prepare`: genere `supabase/auth-users.local.json` avec les profils sans compte Auth lie.
- Completer les champs `email` avec les vrais emails. Ce fichier est ignore par Git.
- `npm run auth:invite:dry-run`: verifie le plan d'invitation sans creer de compte.
- `npm run auth:invite`: invite les utilisateurs Supabase Auth et renseigne `profiles.auth_user_id`.
- `npm run auth:sync-passwords:dry-run`: verifie que chaque profil lie possede un mot de passe legacy disponible.
- `npm run auth:sync-passwords`: synchronise les mots de passe Supabase Auth avec les mots de passe legacy actuels et verifie la connexion.

La variable optionnelle `SUPABASE_AUTH_REDIRECT_TO` peut etre ajoutee dans `.env.local` pour definir l'URL ouverte apres invitation.

## Etape 4: app mobile Expo

Le dossier `mobile/` contient la coque native Expo pour iPhone, iPad et Android.
Elle charge `https://monjournaldebloc.fr/?native-app=1` dans une WebView native:
la version responsive Interne/Senior est donc l'unique interface a maintenir et
les modifications web recentes sont automatiquement disponibles dans l'app apres
leur deploiement. L'URL peut etre remplacee avec
`EXPO_PUBLIC_MONJDB_WEB_URL` dans `mobile/.env.local`.

Etat actuel:

- nom d'app Expo: `Mon Journal de Bloc`;
- interface canonique partagee avec les vues web mobiles Interne et Senior;
- authentification, donnees et navigation gerees par la meme application web;
- blocage explicite des sessions Admin quand `native-app=1` est present;
- liens externes ouverts hors de l'app, liens du domaine conserves dans l'app;
- rechargement natif en cas d'erreur ou d'arret du contenu web;
- configuration locale Expo via `mobile/.env.local`, ignoree par Git.

Commandes mobiles:

- `cd mobile && npm run typecheck`: verifie TypeScript.
- `cd mobile && npm run start`: lance Expo.
- `cd mobile && npm run ios`: lance l'app dans le simulateur iOS si Xcode est disponible.
- `cd mobile && npm run build:android`: prepare un build Android avec EAS.

Les evolutions fonctionnelles doivent maintenant etre developpees une seule fois
dans les vues web responsives. La coque Expo reste limitee aux responsabilites
natives: publication, cycle de vie, liens externes et futures notifications.

## Etape 5: premiere synchronisation web interne

La version web conserve le flux legacy comme filet de securite, mais tente maintenant une connexion Supabase Auth apres un login interne reussi.

Etat actuel:

- le web utilise `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`;
- l'identifiant legacy `joris.poquet` est temporairement mappe vers `joris-poquet@hotmail.fr`;
- apres login interne, le web charge le profil Supabase lie a l'utilisateur Auth;
- le catalogue d'interventions, les interventions, le carnet et l'activite visibles via RLS sont fusionnes dans l'etat web local;
- les interventions Supabase sont rattachees au profil web deja connecte pour eviter les problemes d'IDs legacy pendant la transition.
- les nouvelles interventions web utilisent maintenant des UUID compatibles Postgres;
- apres une sauvegarde web interne, l'intervention est aussi envoyee vers `interventions` en arriere-plan quand le profil durable est connu.

Objectif de test:

- creer une intervention dans l'app mobile;
- se connecter au web avec `joris.poquet`;
- verifier que l'intervention mobile apparait dans l'historique web.

Limites volontaires:

- le rattachement senior durable est laisse a `null` tant que les seniors legacy ne sont pas tous lies a Supabase Auth;
- les ecritures autres que les interventions seront branchees ensuite, ecran par ecran.
