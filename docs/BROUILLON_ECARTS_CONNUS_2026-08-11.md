# Brouillon — remplacement proposé de la section 15

Date de préparation : 11 août 2026.

Ce document ne modifie pas le contexte actif. Conformément à sa section 14,
le texte ci-dessous doit être validé explicitement par le propriétaire avant
d'être intégré dans `CONTEXTE_PROJET.md`.

## 15. État de conformité et écarts encore ouverts

Cette liste distingue les fonctions conformes des écarts qui nécessitent encore
une action. Elle est informative et ne constitue jamais une autorisation de
modifier la production ou les données. Les preuves détaillées restent conservées
dans les rapports versionnés du dossier `docs`.

1. **Socle métier Supabase — conforme, contrôle croisé à rétablir** :
   l'enregistrement atomique des interventions, les autorisations par
   établissement, l'évaluation réservée au Senior désigné, l'immutabilité des
   évaluations, les instantanés historiques et le calcul serveur du score sont
   actifs. Le test croisé automatisé reste obligatoire. Il ne peut toutefois
   plus être exécuté dans la CI depuis la suppression du projet Supabase isolé
   `luedugesmybmvppdplaa`. Une nouvelle base de test isolée et de nouveaux
   comptes E2E doivent être créés avant de considérer cette protection comme de
   nouveau opérationnelle.
2. **Web et logique commune — conformes sur les parcours publics testés** :
   la présentation web a été adaptée à l'ordinateur tout en conservant la même
   logique métier que l'application. Les tests publics passent sous Chrome,
   Edge, Firefox et WebKit, y compris WebKit sur macOS. Une validation manuelle
   périodique sur les appareils et navigateurs réels reste nécessaire pour les
   évolutions visuelles importantes.
3. **Authentification, sessions, comptes et établissements — conformes** :
   la session web est gérée côté serveur, la session mobile dans le stockage
   sécurisé natif, la déconnexion et la désactivation révoquent les sessions,
   la désactivation est réversible lorsque l'identité Auth existe encore, les
   adresses e-mail sont confirmées et modifiables, et les établissements
   utilisent un référentiel officiel à identifiants stables.
4. **Trophées et centre de notifications web — conformes** : les trophées
   secrets restent invisibles avant obtention, les niveaux sont versionnés et
   seul le meilleur niveau est utilisé lorsque la règle de présentation le
   demande. Les notifications automatiques Interne et les messages
   administratifs ciblés sont disponibles dans le centre commun. Les
   notifications système Apple et Android lorsque l'application est fermée
   restent un chantier distinct à réaliser ultérieurement.
5. **Sauvegarde externe — archive courante vérifiée, restauration à
   requalifier** : la sauvegarde chiffrée couvre PostgreSQL, Auth, Storage et les
   migrations, avec rétention et exécution quotidienne. Le mécanisme réessaie
   désormais pendant environ une heure. Une archive fraîche du 11 août 2026 a
   été produite et son intégrité vérifiée. L'exercice de restauration complet a
   été arrêté avant toute écriture car l'ancien projet Supabase isolé a été
   supprimé. Une nouvelle cible isolée doit être provisionnée pour vérifier à
   nouveau la restauration complète ; aucune restauration ne doit être testée
   sur la production.
6. **Dépendances web — conformes ; dépendances mobiles sous surveillance** :
   l'audit web ne signale aucune vulnérabilité. Les versions Expo et React
   Native sont alignées sur les versions compatibles et CocoaPods s'installe de
   nouveau correctement. Deux avis de sécurité amont concernant `image-size`
   restent présents dans l'arbre Expo sans version corrigée compatible. Ils sont
   limités par des correctifs locaux versionnés, des tests dédiés et une liste
   d'exceptions exacte. Cette exception doit être supprimée dès qu'une version
   Expo compatible apporte le correctif amont.
7. **Diffusion mobile — incomplète** : le code Expo passe le typage, le contrôle
   de configuration et la vérification des versions. La validation Android sur
   appareil réel et la soumission en boutique restent à faire. La production
   d'un binaire iOS signé et toute publication TestFlight ou App Store restent
   différées tant que le propriétaire ne dispose pas d'une équipe Apple
   Developer active.
8. **Qualité et CI — socle actif, environnement connecté indisponible** :
   ESLint, les tests, le typage, les compilations, les audits de dépendances et
   les contrôles Expo sont exécutés par la CI. Au 11 août 2026, ces contrôles et
   les cinq emplois navigateur réussissent. Les emplois Supabase croisé et E2E
   authentifiés échouent uniquement parce que leur ancienne base isolée et leurs
   comptes de test ne sont plus disponibles. Ils ne doivent pas être rendus
   facultatifs pour masquer cet écart.
9. **Dette de maintenance — réduction commencée** : ESLint ne signale aucune
   erreur bloquante mais conserve un ensemble d'avertissements historiques à
   traiter progressivement. Les premières extractions ont été réalisées dans
   `src/styles.css`, `mobile/App.tsx` et `src/screens/AdminScreen.tsx`. Ces trois
   fichiers restent volumineux et doivent continuer à être découpés par petits
   lots testés, sans réécriture globale risquée.
10. **Exports — contenu à valider avec le propriétaire** : les exports existants
    respectent les exclusions de secrets et de données privées déjà définies,
    mais la liste exacte des colonnes utiles pour les exports Interne, Senior et
    Administrateur doit encore être relue et validée fonction par fonction.
11. **Support — mécanisme conforme, destinataire définitif à confirmer** : les
    demandes ouvrent l'application de messagerie avec destinataire, objet et
    corps préremplis sans conserver le message dans Project1. L'adresse de
    support reste configurable et devra être remplacée par l'adresse définitive
    décidée par le propriétaire.
12. **Exécution locale du web — limite connue** : le serveur Vite seul ne fournit
    pas les fonctions `/api` de Vercel. Les parcours d'authentification complets
    doivent être vérifiés avec `vercel dev`, une préversion Vercel ou un
    environnement équivalent relié à une base de test, jamais en utilisant la
    production comme environnement E2E automatisé.
