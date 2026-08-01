# Audit du stockage local et de la synchronisation Supabase — 20 juillet 2026

## Périmètre

Cet audit est une analyse statique du code web, du conteneur mobile actif, des
services d'authentification et des accès Supabase de Project1. Il n'a modifié ni
le code fonctionnel, ni le schéma, ni les données de production.

Les règles de référence sont celles de la section 5 de `CONTEXTE_PROJET.md` :

- Supabase est l'unique source de vérité des données métier ;
- aucune donnée métier ne doit rester durablement dans un stockage navigateur ;
- la session web doit utiliser un cookie serveur non persistant et protégé ;
- seule la session mobile peut être conservée dans Keychain ou Keystore ;
- une réussite ne doit être annoncée qu'après confirmation du serveur ;
- la fin de session doit effacer les données privées présentes en mémoire.

## Conclusion générale

Le backend Supabase normalisé est bien la source utilisée pour charger les
sessions authentifiées et la plupart des écritures importantes attendent sa
confirmation. L'enregistrement et la suppression des interventions ainsi que la
validation des évaluations suivent notamment ce principe.

Après les deux premiers lots de correction locale, les collections métier
principales ne sont plus chargées ni écrites depuis `localStorage`. Les anciennes
clés restent volontairement gelées jusqu'à leur résolution contrôlée et le
bloc-notes attend désormais Supabase avant d'afficher « Enregistré ».

Le stockage côté client n'est toutefois pas encore entièrement conforme à la
règle cible. Le web et la WebView mobile conservent toujours durablement la
session JavaScript. L'ancienne fonctionnalité « Remarques de test » a désormais
été retirée du client et du bootstrap, sans supprimer ses données Supabase
historiques.

La correction doit donc être réalisée avant la refonte visuelle du web. Elle peut
être progressive, mais elle ne doit pas consister à effacer immédiatement toutes
les clés : un contenu de bloc-notes local non synchronisé pourrait être perdu.

## Inventaire des stockages persistants

| Clé ou mécanisme | Contenu actuel | Équivalent Supabase | Conformité |
| --- | --- | --- | --- |
| `journal-bord:supabase-session:v1` | jetons d'accès et de rafraîchissement, utilisateur Auth | Supabase Auth | **Non conforme critique** |
| `journal-bord:internal-profiles:v4` | ancienne copie de profils Internes | `profiles` | copie gelée, plus chargée ni écrite dans l'état actif |
| `journal-bord:saved-interventions:v4` | ancienne copie d'interventions | `interventions` | copie gelée, jamais réimportée automatiquement |
| `journal-bord:notebook-documents:v1` | ancienne copie du bloc-notes personnel | `notebook_documents` | lecture isolée pour récupération explicite uniquement |
| `journal-bord:custom-surgical-interventions:v1` | ancien catalogue et anciennes checklists | `surgical_intervention_definitions` | copie gelée, plus chargée ni écrite dans l'état actif |
| `journal-bord:custom-seniors:v2` | ancien annuaire et ancien profil Senior | `profiles` et annuaire RLS | copie gelée, plus chargée ni écrite dans l'état actif |
| `journal-bord:admin-intervention-evaluations:v1` | ancienne copie des évaluations | `intervention_evaluations` | copie gelée, jamais réimportée automatiquement |
| `journal-bord:activity-log:v1` | ancien journal d'activité | `activity_log` | copie gelée, plus chargée ni écrite dans l'état actif |
| `journal-bord:test-feedback:v1` | anciennes remarques de test | `test_feedback` | fonctionnalité retirée ; clé locale obsolète nettoyée au démarrage |
| `journal-bord:admin-trophies:v1` | ancienne copie des trophées | `trophy_definitions` | aucune lecture métier active ; clé temporairement conservée pour la récupération contrôlée |
| `journal-bord:senior-dashboard-navigation:v2:<seniorId>` | filtre, positions, identifiant de l'Interne sélectionné et clé de procédure | aucune donnée métier nécessaire | partiellement conforme : les positions et le filtre sont des préférences, pas les identifiants personnels |
| `journal-bord:chunk-reload-pending` | indicateur technique d'un rechargement de fragment | aucun | conforme |

Aucun usage applicatif d'IndexedDB, d'un Service Worker ou d'un cache métier
hors ligne n'a été trouvé. Les requêtes métier principales utilisent
`cache: 'no-store'`.

## Écarts prioritaires

### P0 — La session web est stockée dans JavaScript

`src/services/supabaseClient.ts` écrit la session Supabase complète dans
`localStorage`, la relit au démarrage et y conserve notamment le jeton de
rafraîchissement. Aucun mécanisme de cookie `HttpOnly`, `Secure` et `SameSite`
n'est présent dans le code serveur actuel.

Conséquences :

- la fermeture du navigateur ne garantit pas la fin de la session locale ;
- un script exécuté dans l'origine du site peut lire les jetons ;
- la durée de trente minutes d'inactivité n'est pas contrôlée par une session
  serveur ;
- le comportement ne correspond pas à la règle validée du contexte.

### P0 — L'application mobile active utilise aussi le `localStorage` de la WebView

Le point d'entrée `mobile/index.ts` charge `WebAppShell`, pas `mobile/App.tsx`.
La WebView active `domStorageEnabled` et charge directement le site public. Le
script injecté lit la même clé de session `localStorage` que le web.

`mobile/App.tsx` contient bien une implémentation utilisant `expo-secure-store`,
mais cette implémentation n'est pas celle enregistrée comme racine de
l'application. La session de l'application distribuée n'est donc pas actuellement
conservée dans Keychain ou Keystore par ce code.

La WebView conserve également les copies de profils, interventions, évaluations,
bloc-notes et journaux écrites par le site.

### P0 — Le bloc-notes pouvait annoncer un faux succès — corrigé localement

À chaque saisie, `NotebookScreen` met immédiatement à jour l'état React. Cette
mise à jour reçoit aussitôt un nouvel `updatedAt`, ce qui fait passer l'indicateur
visuel à « Enregistré ». La synchronisation Supabase est lancée ensuite dans un
effet asynchrone.

En cas d'échec, une alerte globale finit par être affichée, mais le bloc-notes a
déjà été présenté comme enregistré et son contenu a été conservé dans
`localStorage`. Au prochain chargement authentifié, la version Supabase peut
remplacer cette copie. Il existe donc un risque de perte silencieuse ou de
confusion pour l'utilisateur.

Des saisies rapprochées peuvent également lancer plusieurs écritures concurrentes
fondées sur la même version du document. Aucun test automatisé spécifique à ce
parcours n'a été trouvé.

### P1 — Les données privées n'étaient pas effacées à la déconnexion — corrigé localement

La fonction de déconnexion révoque la session et réinitialise la navigation, mais
elle ne vide pas les profils, interventions, évaluations, bloc-notes, annuaires,
trophées ou journaux présents en mémoire. Elle ne supprime pas non plus leurs clés
`localStorage`.

Les données du dernier utilisateur restent donc sur le navigateur ou dans la
WebView après sa déconnexion, même si l'écran de connexion les masque.

### P1 — Un échec de chargement Admin pouvait laisser un état partiel — corrigé localement

Dans le code audité initialement, l'activation Interne ou Senior exigeait un
bootstrap Supabase réussi, tandis que plusieurs erreurs de chargement Admin
étaient converties en tableaux vides ou en `null` avant d'ouvrir quand même la
session.

Désormais, les trois chargements Admin sont obligatoires, le payload est validé
avant toute mise à jour d'état et la session Supabase est révoquée en cas
d'échec.

### P1 — Les anciennes « Remarques de test » restaient chargées — corrigé localement

Dans le code audité initialement, `AdminScreen` chargeait encore
`test_feedback` depuis Supabase et écrivait le résultat dans `localStorage`,
alors même que le formulaire n'était plus relié au rendu courant.

Ce code actif a été supprimé. Les lignes Supabase historiques restent conservées
et leur éventuelle suppression demeure soumise à une autorisation distincte.

### P2 — La navigation Senior conservait des identifiants personnels — corrigé localement

Le filtre actif et les positions de défilement peuvent légitimement rester une
préférence de session. En revanche, la clé contient l'identifiant du Senior et la
valeur contient l'identifiant de l'Interne sélectionné. Le contexte n'autorise le
stockage local que pour des préférences sans donnée personnelle ou métier.

La persistance ne contient désormais que le filtre de population et les positions
de défilement. L'ancienne clé liée au Senior est supprimée lorsqu'il ouvre son
tableau de bord.

### P2 — La couche `app_state` était encore présente — corrigé localement

Les fonctions génériques `loadPersistentArray` et `savePersistentArray` ne sont
plus utilisées par le contexte principal. L'API `/api/app-state` refuse les
écritures globales avec le statut 410, mais conserve une lecture Admin vers la
table historique `app_state`. Les messages de synchronisation emploient encore
le vocabulaire de l'ancien modèle « enregistré localement puis synchronisé ».

Le service client générique et la fonction serveur `/api/app-state` ont été
supprimés. L'authentification des requêtes d'images de trophées utilise désormais
un module dédié sans fonction de lecture ou d'écriture de collections métier.

## Points déjà conformes ou renforcés

- Une intervention n'est ajoutée à l'état local qu'après la réponse de la fonction
  Supabase atomique.
- La suppression d'une intervention en attente et l'évaluation Senior attendent
  toutes deux la confirmation de Supabase.
- Les modifications de comptes, de catalogue, de favoris Senior et de trophées
  passent par des opérations serveur avant la mise à jour visible.
- Les sessions Interne et Senior rechargent un état complet depuis Supabase à la
  connexion, au retour au premier plan, au retour du réseau et toutes les cinq
  secondes lorsque la page est visible.
- Realtime accélère le rafraîchissement sans être l'unique mécanisme.
- Aucun brouillon d'intervention n'est persisté hors ligne.
- La clé locale historique des trophées Admin n'est plus utilisée comme source
  métier.

## Plan de correction recommandé

### Étape 1 — Sécuriser le bloc-notes et la déconnexion

1. Sérialiser ou temporiser les écritures du bloc-notes.
2. N'afficher « Enregistré » qu'avec la version et la date retournées par
   Supabase.
3. Afficher une erreur locale au bloc-notes et permettre de réessayer sans
   considérer la copie en mémoire comme enregistrée.
4. Effacer toutes les données privées en mémoire lors de la déconnexion.
5. Ajouter des tests : réussite serveur, perte réseau, conflit de version,
   déconnexion et changement de compte sur le même appareil.

### Étape 2 — Retirer les copies métier de `localStorage`

1. Charger les états métier avec des tableaux vides, puis uniquement depuis
   Supabase après authentification.
2. Supprimer les effets qui écrivent les profils, interventions, bloc-notes,
   définitions, Seniors, évaluations, remarques et journaux dans `localStorage`.
3. Faire échouer explicitement l'ouverture d'un espace si son bootstrap Supabase
   n'est pas complet, notamment pour l'Administrateur.
4. Conserver uniquement les préférences d'interface autorisées et retirer les
   identifiants de personnes de `sessionStorage`.
5. Prévoir une transition contrôlée avant d'effacer les anciennes clés : comparer
   d'abord le bloc-notes local au document Supabase et proposer une récupération
   explicite si les contenus diffèrent. Ne jamais réimporter automatiquement une
   ancienne intervention ou évaluation locale.

### Étape 3 — Remplacer la session web

1. Créer une session serveur non persistante avec cookie `HttpOnly`, `Secure` et
   `SameSite`.
2. Contrôler côté serveur l'inactivité de trente minutes.
3. Faire transiter les appels nécessitant l'identité par une couche serveur afin
   que les jetons Supabase ne soient plus accessibles au JavaScript du navigateur.
4. Vérifier la révocation globale sur plusieurs navigateurs et appareils.

Cette étape est une évolution d'architecture : le client appelle aujourd'hui
directement l'API REST Supabase avec le jeton utilisateur. Elle doit être traitée
séparément des suppressions mécaniques de clés.

### Étape 4 — Sécuriser la session mobile active

Deux options doivent être étudiées avant implémentation :

- conserver la WebView et créer un pont natif d'authentification qui garde la
  session dans `SecureStore` et ne transmet au web que l'état temporaire nécessaire
  en mémoire ;
- faire de l'implémentation React Native sécurisée la véritable application et
  abandonner progressivement l'authentification dans la WebView.

Dans les deux cas, les données métier continuent à venir exclusivement de
Supabase et le stockage DOM de la WebView ne doit plus contenir de copie privée.

### Étape 5 — Nettoyer les couches historiques

1. Supprimer le code client et serveur résiduel des « Remarques de test ».
2. Retirer les chargeurs de trophées locaux inutilisés.
3. Retirer ou isoler définitivement `persistentStorage.ts` et `/api/app-state`.
4. Conserver les données historiques Supabase tant que leur suppression n'a pas
   reçu une autorisation explicite.

## Ordre conseillé

Le premier lot de code devrait couvrir uniquement le bloc-notes, l'effacement de
l'état à la déconnexion et les tests de changement de compte. Il réduit le risque
de perte et de fuite sans imposer immédiatement la refonte complète des sessions.

Le deuxième lot retire ensuite les copies métier du navigateur. La session web
et le pont mobile sécurisé constituent un troisième chantier, plus architectural,
qui doit être conçu et recetté sur le web, iPhone, iPad et Android avant sa mise en
production.

## État du lot 1 après correction locale

Le premier lot recommandé ci-dessus a été implémenté localement le 20 juillet
2026, sans déploiement et sans modification des données de production :

- le bloc-notes temporise les saisies et sérialise les écritures ;
- l'état « Enregistré » n'est affiché qu'après la réponse de Supabase ;
- une erreur de sauvegarde reste visible dans l'écran et propose une nouvelle
  tentative ;
- une saisie encore temporisée est transmise avant la fermeture de l'écran ;
- les sauvegardes en retard sont invalidées si le compte actif change ;
- la déconnexion vide les profils, interventions, bloc-notes, évaluations,
  annuaires, trophées et journaux présents dans l'état React ;
- les écritures métier vers les anciennes clés `localStorage` ont été retirées :
  leur contenu existant est gelé et ne peut plus être écrasé par une connexion ou
  une déconnexion ;
- aucune ancienne clé métier n'est supprimée automatiquement dans ce lot, afin
  de permettre la future récupération contrôlée.

Les contrôles locaux réussissent : typecheck web, suite de tests, build web de
production et typecheck du conteneur mobile. Les tests ajoutés couvrent la file
de sauvegarde, la reprise après une erreur réseau, la confirmation Supabase avant
succès et la protection contre une réponse tardive d'un ancien compte.

À l'issue du lot 1, les anciennes clés métier devaient encore être résolues puis nettoyées, mais elles
ne participent plus à l'état actif. Les écarts portant sur la session web
JavaScript, la session de la WebView mobile, le bootstrap Admin et les
« Remarques de test » restent ouverts.

## État du lot 2 — récupération locale contrôlée

Le deuxième lot local a été engagé sans déploiement ni modification de la
production :

- les états actifs des profils, interventions, bloc-notes, définitions, Seniors,
  évaluations et journaux commencent vides et sont alimentés uniquement par le
  bootstrap Supabase authentifié ;
- les anciennes interventions, évaluations et autres collections locales ne sont
  jamais proposées à la réimportation ;
- un lecteur isolé examine uniquement l'ancienne clé du bloc-notes de l'Interne
  connecté ;
- aucune proposition n'est affichée lorsque la copie est vide, invalide,
  identique à Supabase ou rattachée à un autre Interne ;
- lorsqu'une copie différente existe, l'écran Bloc-notes affiche les dates et un
  aperçu, puis propose soit de conserver Supabase, soit de restaurer la copie
  locale ;
- la restauration demande une confirmation explicite, attend la réussite de
  Supabase et ne supprime la copie locale concernée qu'ensuite ;
- conserver Supabase supprime également uniquement la copie de l'Interne après
  son choix explicite ; les éventuelles copies d'autres comptes sont préservées.

Les contrôles locaux réussissent : typecheck web, 21 tests réussis, build web de
production et typecheck mobile. Un test d'intégration croisé Supabase reste
ignoré sans base de test dédiée.

Les prochaines corrections concernent désormais l'architecture de session web
et mobile. Les anciennes clés gelées non liées au bloc-notes pourront être
supprimées après validation explicite, puisqu'elles ne participent plus au
fonctionnement de l'application.

## État du lot 3 — retrait des Remarques de test et bootstrap Admin strict

Le troisième lot a été préparé pour le déploiement de production sans migration
de base :

- les types, états React, effets, gestionnaires et appels backend des
  « Remarques de test » ont été supprimés ;
- le bootstrap Supabase ne lit plus la table `test_feedback` ;
- l'ancienne API générique `app-state` n'accepte plus cette clé ;
- le script de migration historique conserve la source brute dans les archives
  d'import, mais ne crée plus de lignes `test_feedback` ;
- la clé locale obsolète est supprimée au démarrage ;
- les tables, migrations et éventuelles lignes Supabase historiques sont
  conservées et aucune suppression distante n'est exécutée ;
- le chargement Admin exige désormais simultanément l'annuaire, les affectations
  et le bootstrap complet ;
- aucune collection Admin n'est appliquée avant validation du payload et la
  session Supabase est révoquée si le chargement échoue.

Les contrôles automatisés couvrent l'absence de la fonctionnalité dans le client,
la conservation des données historiques, l'ordre du bootstrap Admin et la
révocation de session en cas d'échec.

## Déploiement de production du 20 juillet 2026

Les lots 1 à 3 ont été déployés ensemble sur Vercel après validation locale :

- projet : `monjournaldeblocbeta` ;
- déploiement : `dpl_ARSmxn2KXwwR4uFyRgCJKP34UGQJ` ;
- état Vercel : `READY` ;
- domaine public : `https://monjournaldebloc.fr` ;
- réponse du domaine après déploiement : HTTP 200 ;
- les empreintes JavaScript et CSS servies correspondent à l'artefact de
  production validé ;
- le bundle public contient le contrôle strict du bootstrap Admin et le parcours
  de récupération du bloc-notes ;
- aucune erreur Vercel n'a été trouvée lors du contrôle post-déploiement ;
- aucune migration Supabase et aucune suppression de donnée distante n'ont été
  exécutées.

L'application mobile active utilisant le site dans sa WebView charge cette
version au prochain démarrage ou rechargement réseau, sans nécessiter un nouveau
build iOS ou Android pour ce lot.

## État du lot 4 — nettoyages mineurs avant les sessions

Ce lot n'applique aucune migration et ne supprime aucune ancienne copie
métier gelée :

- la navigation Senior ne persiste plus l'identifiant du Senior, de l'Interne
  sélectionné ou de la procédure consultée ;
- seules la préférence de filtre et les positions de défilement restent dans
  `sessionStorage` ;
- l'ancienne clé de navigation contenant des identifiants est nettoyée ;
- `persistentStorage.ts` et `/api/app-state` sont retirés du code déployable ;
- les chargeurs locaux inutilisés de trophées et d'évaluations sont supprimés ;
- l'authentification des images de trophées est isolée dans un service dédié ;
- l'adresse d'assistance web est centralisée dans `src/supportConfig.ts` et peut
  être remplacée avec `VITE_SUPPORT_EMAIL` ;
- le client natif dormant utilise la même règle avec
  `EXPO_PUBLIC_SUPPORT_EMAIL` ; la WebView active utilise la configuration web.

Des tests automatisés vérifient qu'aucun identifiant personnel ou métier ne peut
être ajouté à la nouvelle clé de navigation, que l'ancienne couche `app-state`
n'existe plus et que tous les boutons d'assistance passent par la configuration
centrale.

## Déploiement de production du lot 4

Le lot 4 a été déployé sur Vercel après validation locale :

- déploiement : `dpl_9VgWDGvCgaqAgXKZxn6VKu4Qmg6k` ;
- état Vercel : `READY` ;
- domaine public : `https://monjournaldebloc.fr` ;
- réponse du domaine après déploiement : HTTP 200 ;
- les empreintes JavaScript et CSS servies correspondent au build validé ;
- aucune erreur Vercel n'a été trouvée lors du contrôle post-déploiement ;
- aucune migration Supabase et aucune suppression de donnée distante n'ont été
  exécutées.
