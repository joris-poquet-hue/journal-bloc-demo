# Rapport de diffusion du client — 20 juillet 2026

## Périmètre et protection des secrets

Le propriétaire a explicitement autorisé l'envoi du code source filtré à Vercel
et à Expo/EAS. Les règles d'exclusion ont été renforcées avant l'envoi : les
fichiers `.env` et `.env.*` locaux ne font partie ni du déploiement Vercel ni de
l'archive mobile. Les variables nécessaires sont fournies par les environnements
de production des plateformes.

## Validation locale

- huit tests automatisés réussis ; le test Supabase transactionnel est ignoré par
  défaut car il nécessite son autorisation de production explicite ;
- contrôle TypeScript web réussi ;
- compilation Vite locale réussie avec 1 876 modules ;
- contrôle TypeScript mobile réussi ;
- configuration Expo publique validée pour le SDK 57.

## Web

Une préversion protégée a d'abord été construite :

- déploiement : `dpl_3xFNDXPpjMFMbGqNsniNbVoiwaKw` ;
- statut : `Ready` ;
- page d'accueil : HTTP 200 ;
- fonction `/api/auth-login` : présente et limitée à la méthode POST ;
- fonctions serveur attendues : `admin-users`, `app-state`, `auth-login`,
  `auth-password` et `auth-recovery`.

La préversion vérifiée a ensuite été promue en production sans modification du
code contrôlé :

- déploiement : `dpl_6eWfF26HDeNjFS9PQQfWhns1jiZ4` ;
- domaine : `https://monjournaldebloc.fr` ;
- statut : `Ready` ;
- page publique : HTTP 200 ;
- fichier JavaScript principal observé : `index-CYPE1cdy.js` ;
- feuille de styles observée : `index-DLFIz9dC.css`.

Le rendu de la connexion a été contrôlé sur un écran d'ordinateur puis sur un
écran téléphone de 390 × 844 pixels. Aucun débordement horizontal ni erreur de
console n'a été observé dans l'onglet public mobile.

### Première diffusion du correctif des filtres Senior

Le correctif qui rend simultanément visibles « Tous les internes », « Mes
internes » et « Relations récentes », avec « Tous les internes » comme vue
initiale, a été diffusé le 20 juillet 2026 :

- préversion : `dpl_GRyqWVoiGn56YYa5KC4Bu2ny4Zdb`, statut `Ready` ;
- préversion vérifiée :
  `https://monjournaldeblocbeta-4636a11k6-joris-projects34.vercel.app` ;
- promotion du même artefact : `dpl_41WNZv97XBHD8pGPYhfy2V9gqSyV`, cible
  `production`, statut `Ready` ;
- domaine public : `https://monjournaldebloc.fr`, HTTP 200 ;
- fichier JavaScript principal : `index-Dj8iWPO7.js` ;
- fragment Senior : `AdminScreen-DItJJDhF.js` ;
- SHA-256 du fragment Senior local et distant :
  `ec14ce5c2e0fd1f082a0ba93ff0b675e43b15d54b8ad0537baa13f8ff7a4c25d` ;
- contrôle du fragment public : présence des trois libellés et des attributs
  `data-senior-population-filter` ;
- page de connexion publique chargée correctement après promotion ;
- aucun journal Vercel de niveau erreur trouvé pour le nouveau déploiement au
  moment du contrôle.

Ce déploiement ne modifie ni le schéma ni les données Supabase.

### Restauration de la carte cyclique Senior

À la demande du propriétaire, la présentation historique sous forme d'une carte
cyclique unique a ensuite été restaurée, tout en conservant « Tous les internes »
comme vue initiale et les trois filtres métier :

- préversion : `dpl_RQr3dA7NCBUSX82hnRCwD8gwo92K`, statut `Ready` ;
- promotion : `dpl_Bq1xX25qoVKhWnHdQxPMm4NB3FQG`, cible `production`, statut
  `Ready` ;
- domaine public : `https://monjournaldebloc.fr`, HTTP 200 ;
- fichier JavaScript principal : `index-lb1Vk1He.js` ;
- fragment Senior : `AdminScreen-C_BwVa8r.js` ;
- SHA-256 du fragment Senior local et distant :
  `af066ec89436d3de711c8074603c6e0dabbcae31c7a48bdeb987a18acc80580d` ;
- présence contrôlée des trois libellés, de la carte
  `senior-population-cycle-card` et de l'annonce accessible « Afficher ensuite » ;
- aucun journal Vercel de niveau erreur trouvé au moment du contrôle.

Metro a également recompilé le bundle iOS de simulation avec succès, puis un
rechargement de l'application a été déclenché afin de récupérer la nouvelle page
publique. Le binaire Android de boutique déjà construit n'intègre pas encore la
mise à jour du conteneur natif ; sa diffusion nécessite un prochain build.

### Diffusion de la suppression depuis « Mes données »

Après activation de la migration Supabase correspondante, le client commun a été
diffusé avec la gestion des interventions non évaluées dans
`Profil > Mes données > Interventions en attente` :

- préversion : `dpl_FTqin8aPdsQY7xa6ynBjt4Y6EZAR`, statut `Ready` ;
- URL de préversion :
  `https://monjournaldeblocbeta-1ghk93i0m-joris-projects34.vercel.app` ;
- promotion du même artefact, sans reconstruction :
  `dpl_65uUse1MAkoddYhGM2Gw4xhk8fJK`, cible `production`, statut `Ready` ;
- URL immuable de production :
  `https://monjournaldeblocbeta-b7739n6f5-joris-projects34.vercel.app` ;
- domaine public : `https://monjournaldebloc.fr`, HTTP 200 ;
- fichier JavaScript principal : `index-BU8Zki0w.js` ;
- feuille de styles : `index-Cj90uR1o.css` ;
- fragment Profil : `ProfileScreen-BZcTt_vx.js` ;
- SHA-256 du fragment Profil local et public :
  `aa8c6cb0ca0ca6073427b446241f0bd271c68742fc9d0dd8899318cae1bce281` ;
- présence contrôlée des libellés « Interventions en attente » et « Supprimer et
  recommencer », ainsi que de l'appel à `delete_pending_intervention` ;
- recette authentifiée complète réussie, sans erreur de console ;
- aucun journal Vercel de niveau erreur trouvé après la recette.

Cette modification concerne l'interface web commune. L'application mobile qui
charge `https://monjournaldebloc.fr` la récupère au rechargement ou à la
réouverture ; aucun nouveau binaire natif n'était nécessaire pour ce correctif.

## Configuration mobile préparée

- projet EAS : `@jorispqt/mon-journal-de-bloc` ;
- identifiant : `4d3e525c-06f9-4ece-b4b6-906128f0ea03` ;
- SDK Expo : 57 ;
- application : version `1.0.0` ;
- identifiants natifs : `fr.monjournaldebloc.app` sur iOS et Android ;
- portrait imposé ;
- iPad pris en charge avec `ios.requireFullScreen: true` pour empêcher Split View
  de contourner le verrouillage portrait ;
- permission microphone Android retirée, car l'application ne réalise aucun
  enregistrement audio ;
- adresse `https://monjournaldebloc.fr` enregistrée explicitement dans
  `EXPO_PUBLIC_MONJDB_WEB_URL` pour l'environnement EAS de production.

## Android

Le premier build Android de production a réussi :

- build EAS : `863a2610-b251-476a-a573-18319cf3a497` ;
- suivi :
  `https://expo.dev/accounts/jorispqt/projects/mon-journal-de-bloc/builds/863a2610-b251-476a-a573-18319cf3a497` ;
- version : `1.0.0` ;
- `versionCode` : `2` ;
- distribution : `store` ;
- artefact : fichier Android App Bundle `.aab` ;
- taille contrôlée : 52 504 286 octets ;
- SHA-256 :
  `769af228895163969684cf484468bfff7237a49710906034a22afc64e5bdbf1e` ;
- contrôle ZIP : aucune erreur détectée.

Ce fichier est prêt à être remis à Google Play, mais aucune soumission à la
boutique n'a été effectuée durant cette opération.

## iOS et iPadOS

Aucun build iOS EAS n'existait avant cette opération. Les tentatives de
préparation ont correctement chargé l'environnement de production et le
`buildNumber` distant a finalement été incrémenté jusqu'à `4`, mais aucun fichier
`.ipa` n'a été généré. Le propriétaire a relancé l'assistant dans son propre
terminal et s'est authentifié auprès du portail Apple. Apple a ensuite refusé la
signature avec le diagnostic suivant : aucun abonnement ni aucune équipe Apple
Developer n'est associé à ce compte.

Avant toute nouvelle tentative, le propriétaire doit soit adhérer à l'Apple
Developer Program, soit être invité dans l'équipe d'une organisation qui y est
déjà inscrite. Une fois l'équipe visible sur le compte, la commande à relancer est :

```bash
cd /Users/poquetjoris/Project1/mobile
npm run build:ios
```

Le 20 juillet 2026, le propriétaire a décidé de rester sans abonnement Apple pour
le moment. La création du binaire iOS et toute diffusion TestFlight/App Store sont
donc volontairement reportées. Elles ne doivent pas être relancées sans une
nouvelle décision explicite.

Avec l'incrément automatique actif, la prochaine tentative utilisera un numéro
supérieur à `4`. Après succès, la soumission TestFlight ou App Store restera une
action distincte à valider.

## État final

- web : actif en production et vérifié ;
- Android : binaire de production construit, signé et vérifié, non soumis à
  Google Play ;
- iOS/iPadOS : code validé, premier build signé bloqué par l'absence d'adhésion ou
  d'équipe Apple Developer sur le compte du propriétaire ;
- Supabase : migration de suppression atomique active, recette réussie et aucun
  résidu synthétique conservé.
