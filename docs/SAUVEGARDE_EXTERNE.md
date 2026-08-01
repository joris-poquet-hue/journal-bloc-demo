# Sauvegarde externe restaurable de Project1

## Objectif

La sauvegarde externe complète les limitations de l'offre gratuite Supabase. Elle
est indépendante de l'interface Supabase et regroupe dans une archive unique :

- un dump PostgreSQL complet de secours ;
- le schéma et les données du domaine `public` ;
- les comptes `auth.users`, leurs identités et leurs facteurs MFA, afin de
  conserver les mots de passe hachés ;
- la configuration des buckets Supabase Storage et le contenu réel de chaque
  objet ;
- toutes les migrations SQL versionnées du projet ;
- un manifest contenant les tailles et sommes SHA-256 de chaque fichier.

L'archive est chiffrée en AES-256-GCM. Toute altération ou mauvaise clé fait
échouer la vérification. La clé principale est stockée dans le Trousseau macOS et
n'est jamais écrite dans le dépôt, les archives ou les logs.

## État vérifié au 20 juillet 2026

- la sauvegarde quotidienne est active à 03 h 15 ;
- l'archive finale de production a été créée dans iCloud puis relue, déchiffrée
  et vérifiée indépendamment ;
- elle contient douze tables applicatives et neuf objets Storage ;
- un exercice séparé a sauvegardé un compte, un profil, une intervention et un
  fichier entièrement synthétiques sur le projet isolé ;
- après effacement complet, le compte a retrouvé son mot de passe initial,
  l'intervention et le contenu du fichier ;
- une seconde restauration identique a validé l'idempotence et les droits API
  `service_role` ;
- aucune donnée de production n'a été copiée vers le projet de test.
- le propriétaire a confirmé le 20 juillet 2026 avoir conservé la clé de
  récupération sur un support distinct du Mac et d'iCloud.

Le compte rendu détaillé est disponible dans
`docs/RAPPORT_RESTAURATION_2026-07-20.md`.

## Destination et rétention

La destination actuellement préparée est :

`~/Library/Mobile Documents/com~apple~CloudDocs/Project1/Sauvegardes Supabase`

La destination est configurable avec `PROJECT1_BACKUP_DIR` ou
`--backup-dir=...`. Seuls les fichiers reconnus au format
`project1-supabase-*.p1backup` et âgés de plus de trente jours sont supprimés.

L'export de données réelles vers iCloud exige l'accord explicite du propriétaire.
Sans cet accord, l'agent quotidien reste désactivé et le script refuse l'export.

## Commandes

Préparer les dossiers, la clé et le fichier LaunchAgent sans activer l'export :

```sh
npm run backup:setup -- --env-file=.env.production.local
```

Après validation explicite de la destination iCloud, créer une sauvegarde :

```sh
npm run backup:run -- \
  --env-file=.env.production.local \
  --allow-external-production-backup
```

Activer ensuite la sauvegarde quotidienne à 03 h 15 :

```sh
npm run backup:schedule:enable -- --env-file=.env.production.local
```

Le LaunchAgent utilise un lanceur résilient : en cas de coupure réseau au réveil
du Mac, il réessaie automatiquement après une minute puis après trois minutes.

La désactiver :

```sh
npm run backup:schedule:disable -- --env-file=.env.production.local
```

Vérifier la dernière archive, sans écrire dans Supabase :

```sh
npm run backup:verify
```

Cette vérification doit être exécutée au moins une fois par mois. Une
restauration complète sur un projet Supabase isolé et jetable doit être rejouée
au moins une fois par trimestre et consignée dans un rapport de recette.

## Restauration

La restauration est volontairement refusée sur le projet ayant produit
l'archive. Elle doit viser un autre projet Supabase vide ou isolé.

```sh
npm run backup:restore -- \
  --file=/chemin/vers/project1-supabase-date.p1backup \
  --target-env=/chemin/vers/.env.restore-test.local \
  --apply \
  --replace-existing
```

La procédure :

1. déchiffre et vérifie toutes les sommes SHA-256 ;
2. valide le dump complet avec `pg_restore` ;
3. applique les migrations manquantes sur la cible ;
4. remplace les données Auth et applicatives dans une transaction SQL unique ;
5. recrée les buckets et transfère les objets par l'API Storage ;
6. compare les nombres de lignes puis retélécharge chaque objet pour vérifier son
   empreinte SHA-256.

Une restauration doit d'abord être testée sur le projet Supabase isolé. Les
données de production ne doivent pas être copiées vers ce projet de test sans
autorisation spécifique ; le test normal utilise donc un jeu synthétique.

Pour un exercice d'effacement-restauration sur ce même projet isolé, le fichier
d'environnement de test doit contenir `PROJECT1_RESTORE_DRILL=1` et la commande
doit recevoir `--allow-same-project-drill`. Cette double exception ne doit jamais
être configurée dans l'environnement de production.

## Clé de récupération

Une archive ne reste restaurable après la perte du Mac que si la clé existe aussi
sur un support distinct. Depuis un Terminal local, afficher la clé avec :

```sh
npm run backup:key:show
```

Elle doit être placée dans un gestionnaire de mots de passe ou conservée sur un
support physique séparé du Mac et d'iCloud. Elle ne doit jamais être collée dans
un ticket, un e-mail, le dépôt Git ou une conversation Codex.

Cette exportation manuelle est indispensable : le Trousseau permet la
restauration sur ce Mac, mais ne suffit pas à garantir la récupération si le Mac
et son Trousseau sont perdus simultanément. Elle a été confirmée par le
propriétaire le 20 juillet 2026.

## Outils PostgreSQL

Les commandes utilisent les clients PostgreSQL 17.10 (`pg_dump`, `pg_restore`,
`psql`) issus de Postgres.app, sans installer ni lancer de serveur local. Sur le
Mac configuré, ils sont placés dans :

`~/Library/Application Support/Project1 Backup/postgresql-17`

Le chemin peut être remplacé par `PROJECT1_POSTGRES_DIRECTORY`.
