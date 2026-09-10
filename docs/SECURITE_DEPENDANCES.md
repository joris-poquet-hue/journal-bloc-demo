# Sécurité des dépendances

Le contrôle `npm run audit:dependencies` échoue dès qu'une vulnérabilité web ou
une nouvelle vulnérabilité mobile apparaît.

Au 11 août 2026, npm signale encore deux avis de déni de service dans
`image-size`, dépendance transitive de Metro. Aucune version corrigée n'est
publiée et la correction automatique proposée rétrograderait Expo et React
Native vers des versions incompatibles avec le projet.

La mitigation retenue est donc strictement bornée :

- les cinq dépendances Expo concernées restent alignées sur le SDK 57 ;
- `image-size@1.2.1` reçoit le correctif suivi par `patch-package` ;
- un test de sécurité reproduit les entrées ICNS, HEIF et JXL problématiques ;
- la CI n'accepte que les deux avis connus et leur chaîne transitive exacte ;
- toute nouvelle alerte fait échouer la CI.

Cette exception doit être supprimée dès qu'une version corrigée compatible est
publiée par l'amont.
