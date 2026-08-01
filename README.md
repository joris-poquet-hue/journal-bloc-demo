# Mon Journal de Bloc

Application web de suivi opératoire des internes en chirurgie.

## Authentification Supabase

Supabase Auth est l’unique source des mots de passe. Les profils applicatifs ne
contiennent jamais de mot de passe. Le navigateur ne reçoit aucun jeton Supabase :
il utilise un cookie de session applicative non persistant, `HttpOnly`, `Secure`
et `SameSite`. Le serveur conserve uniquement le hash du jeton opaque et contrôle
l’expiration web après trente minutes d’inactivité.

L’application mobile conserve uniquement son jeton opaque dans SecureStore
(Keychain sur iOS, Keystore sur Android). La WebView est éphémère et la biométrie
optionnelle protège la restauration de cette session après une première
connexion classique.

Variables requises :

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` côté
  serveur uniquement ;
- `SUPABASE_SIGNING_PRIVATE_JWK`, clé privée ES256 importée dans Supabase, pour
  signer les jetons serveur très courts transmis uniquement au Data API ;
- `SUPABASE_JWT_SECRET` peut servir de repli transitoire tant que le projet
  utilise encore le système JWT historique ;
- `VITE_SUPPORT_EMAIL` pour l'adresse ouverte par les boutons d'assistance ;
- `SUPABASE_AUTH_REDIRECT_TO` vers une URL autorisée dans Supabase Auth.

Ne jamais exposer la clé privée de signature, le secret JWT ou la clé
`service_role` dans une variable préfixée par `VITE_` ou `EXPO_PUBLIC_`.

Ordre de mise en production :

1. `npm run db:migrate:durable` pour appliquer les migrations, dont le nettoyage
   des mots de passe historiques et la limitation durable des tentatives.
2. `npm run auth:prepare`, compléter `supabase/auth-users.local.json`, puis
   `npm run auth:invite` pour lier chaque profil à un utilisateur Supabase Auth.
3. Vérifier le parcours de récupération sur l’URL configurée.
4. `npm run auth:invalidate:dry-run`, puis `npm run auth:invalidate` pour remplacer
   tous les anciens secrets par des valeurs aléatoires non affichées.
5. Prévenir les utilisateurs qu’ils doivent utiliser « Mot de passe oublié ? ».

Dans le tableau de bord Supabase, configurer également une longueur minimale de
8 caractères, les quatre familles de caractères, la protection contre les mots
de passe compromis si le forfait le permet, l’exigence du mot de passe actuel
lors d’un changement, un SMTP personnalisé et CAPTCHA.

Le fichier local `supabase/auth-users.local.json` est ignoré par Git.

## Evolution web + app Apple

Le socle durable pour connecter la version web et la future app iPhone/iPad est documente dans [docs/durable-apple-app-roadmap.md](docs/durable-apple-app-roadmap.md).

## App mobile

L'app Expo dans `mobile/` embarque la version web responsive comme interface
canonique. Les vues Interne et Senior sont donc identiques sur le web mobile et
dans l'app, et chaque evolution web est reprise sans maintenir un deuxieme jeu
d'ecrans. Le role Admin reste reserve a la version web.

Commandes utiles:

- `cd mobile && npm run typecheck`
- `cd mobile && npm run start`
- `cd mobile && npm run ios`
- `cd mobile && npm run build:android`

L'URL chargee par l'app vaut `https://monjournaldebloc.fr` par defaut. Elle peut
etre remplacee avec `EXPO_PUBLIC_MONJDB_WEB_URL` dans `mobile/.env.local`.
La WebView active reprend directement `VITE_SUPPORT_EMAIL` du site pour
l’adresse d’assistance. Aucune URL, clé ou session Supabase n’est embarquée par
la coque mobile active.

Pour creer ou remettre a neuf les comptes de demonstration Interne et Senior:

- `npm run demo:accounts -- --apply`
