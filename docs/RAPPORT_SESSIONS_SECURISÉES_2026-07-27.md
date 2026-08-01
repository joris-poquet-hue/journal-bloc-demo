# Rapport Lot 3 — Sessions web et mobile sécurisées

Date : 27 juillet 2026
État : actif en production sur `https://monjournaldebloc.fr`

## Résultat

Le navigateur ne reçoit plus de session Supabase persistante. Il utilise un
jeton applicatif opaque placé dans un cookie non persistant `HttpOnly`,
`Secure`, `SameSite=Lax`, sans `Expires` ni `Max-Age`. Seul son hash SHA-256 est
conservé dans Supabase.

Chaque accès métier du navigateur passe par `/api/backend`. Le serveur :

1. vérifie la session opaque dans `application_sessions` ;
2. contrôle le compte actif et l’inactivité ;
3. crée un JWT Supabase de deux minutes, jamais retourné au navigateur ;
4. laisse les RLS Supabase autoriser ou refuser l’opération.

La signature ES256 avec une clé privée importée dans Supabase est prise en
charge. Le secret JWT historique reste accepté uniquement comme repli
transitoire.

## Couverture des règles du Lot 3

| Règle | Mise en œuvre |
|---|---|
| Session web serveur | Registre `application_sessions` et cookie opaque |
| Cookie non persistant | `__Host-monjdb_session`, sans date d’expiration |
| Cookie protégé | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| Trente minutes d’inactivité | Contrôle atomique côté PostgreSQL |
| Activité normale | Retour au premier plan, clavier, clic et toucher, limités à un signal par minute |
| Synchronisation automatique | Réconciliation serveur toutes les cinq secondes, au focus, au retour réseau et au retour de l’application |
| Déconnexion volontaire | Révocation de toutes les sessions applicatives et des sessions Supabase Auth |
| Désactivation | Révocation globale avant la désactivation du profil |
| Nettoyage technique | Révocation de la seule session courante, sans déconnecter les autres appareils |
| Fermeture du navigateur | Cookie de session supprimé par le navigateur à sa fermeture complète |
| Session mobile | Jeton opaque uniquement dans SecureStore, Keychain ou Keystore |
| WebView | Mode incognito, cache et partage des cookies désactivés |
| Biométrie | Face ID, Touch ID ou biométrie Android forte après une connexion classique |
| Mot de passe mobile | Jamais stocké par l’application |
| Script WebView | CSS et contexte natif uniquement ; aucun `fetch`, bearer, RPC ou calcul métier |

## Bascule Supabase en deux étapes

La bascule est volontairement séparée pour éviter une incompatibilité entre le
client actuellement déployé et les nouvelles RLS.

1. `202607270004_server_managed_sessions.sql` crée le registre et les fonctions
   de session sans modifier l’identité RLS existante.
2. Le nouveau serveur web est déployé et contrôlé.
3. `202607270005_enforce_server_managed_sessions.sql` exige ensuite
   `app_session_id` dans tous les accès métier.

Le script d’urgence
`supabase/rollback/202607270005_restore_auth_identity.sql` restaure les fonctions
d’identité précédentes sans supprimer le registre ni son historique.

## Validations réalisées

- 54 tests de contrat Node : réussis ;
- typecheck web : réussi ;
- typecheck Expo : réussi ;
- build Vite de production : réussi ;
- contrôle de compatibilité Expo 57 : réussi ;
- audit npm mobile : aucune vulnérabilité élevée restante ; dix avis modérés
  restent dans la chaîne de build Expo, sans correction compatible disponible ;
- signature et vérification cryptographique ES256 : réussies ;
- simulation transactionnelle des migrations `004` et `005` sur Supabase :
  réussie, puis `ROLLBACK` ;
- simulation transactionnelle du script de retour arrière : réussie, puis
  `ROLLBACK` ;
- test d’intégration Supabase : réussi, puis `ROLLBACK`.

Le test d’intégration couvre :

- deux sessions web et deux sessions mobiles simultanées ;
- expiration d’un seul navigateur après trente et une minutes simulées ;
- maintien des trois autres sessions ;
- révocation technique d’un navigateur sans déconnexion mobile ;
- révocation globale des quatre sessions ;
- parcours croisé Interne–Seniors, évaluation désignée et changement
  d’établissement.

## Sauvegarde

La sauvegarde chiffrée
`project1-supabase-2026-07-27T07-40-07-606Z.p1backup` a été vérifiée avant les
simulations. Elle contient quatorze tables applicatives et neuf objets Storage.
Aucune donnée n’a été restaurée.

## Mise en production et suite mobile

La production web a été basculée dans cet ordre :

1. migration préparatoire `004` ;
2. déploiement Vercel `dpl_4ddUnCg5wCNade9NhmE9YjtMwSbo` ;
3. recette authentifiée intermédiaire ;
4. migration RLS stricte `005` ;
5. seconde recette authentifiée complète.

Les deux recettes réelles ont réussi. Aucun compte ni profil synthétique ne
subsiste. Elles couvrent également la désactivation administrative d'un compte
possédant simultanément une session web et une session mobile. Le contrôle
visuel de la page de connexion ne montre aucune erreur de console et les
journaux du nouveau déploiement ne contiennent aucune erreur ni alerte.

Il reste à produire une nouvelle version native pour embarquer
`expo-local-authentication`, puis à vérifier Face ID, Touch ID et Android sur de
vrais appareils. Expo Go ne permet pas de valider Face ID.
