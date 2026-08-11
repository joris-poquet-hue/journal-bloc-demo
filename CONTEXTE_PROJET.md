# Contexte de Project1 — Version 1.4

> **STATUT : ACTIF — version 1.4 validée le 29 juillet 2026**
>
> Ce document constitue la source de référence validée pour les règles produit,
> métier, fonctionnelles, techniques et de sécurité de Project1. Il doit être lu
> intégralement avant toute modification du projet.

## 1. Objet du produit

**Mon Journal de Bloc** permet aux internes en chirurgie d'enregistrer leurs
interventions et de suivre leur progression. Les seniors peuvent consulter les
internes autorisés et évaluer leurs interventions. Les administrateurs gèrent les
comptes, les établissements, le catalogue des interventions, les trophées et les
données globales.

Le site web et l'application mobile sont deux interfaces d'un même produit. Ils
partagent les mêmes comptes, les mêmes données, les mêmes règles métier et le
même backend.

## 2. Supports et équivalence fonctionnelle

### 2.1 Interne et Senior

- Les espaces Interne et Senior doivent proposer une équivalence fonctionnelle
  complète entre le web et l'application.
- L'interface et la navigation peuvent être différentes afin de s'adapter au
  support, mais aucune fonction métier ne doit exister sur un support seulement.
- L'utilisateur peut passer du web à l'application, et inversement, sans perte
  de données ni rupture de continuité.
- Une modification de logique commune doit être vérifiée sur les deux supports.
- Les changements doivent se propager automatiquement entre les sessions actives,
  en quelques secondes et sans reconnexion ni actualisation manuelle.
- Le retour de l'application depuis l'arrière-plan déclenche automatiquement une
  actualisation depuis le serveur.

### 2.2 Administrateur

- L'espace Administrateur est exclusivement disponible sur le site web pour
  ordinateur.
- Aucun espace Administrateur ne doit être exposé dans l'application mobile.

### 2.3 Présentation et compatibilité

- L'application est officiellement prise en charge sur iPhone, iPad et Android.
- L'application reste verrouillée en orientation portrait, y compris sur tablette.
- Le site doit fonctionner sur les versions récentes de Safari, Chrome, Firefox
  et Edge.
- La marque, les couleurs, la terminologie et les règles métier restent communes.
- Les mises en page web et mobile peuvent être conçues séparément.
- Le web actuel présenté comme une interface d'application est transitoire. Il
  sera retravaillé pour devenir une véritable interface d'ordinateur.
- Toute l'interface, les messages, les notifications et les exports restent en
  français.
- L'accessibilité est obligatoire : clavier sur le web, lecteurs d'écran,
  contrastes suffisants, texte lisible et zones tactiles adaptées.

## 3. Rôles et autorisations

Les autorisations doivent être contrôlées par le serveur et la base de données,
et non uniquement par l'affichage ou le masquage de boutons.

### 3.1 Interne

- Un interne accède uniquement à son compte et à ses données personnelles.
- Il consulte ses interventions, évaluations, statistiques, progression et
  trophées.
- Son bloc-notes est strictement privé. Aucun senior ne peut le consulter.
- Il peut modifier son avatar, son semestre, son adresse e-mail et son mot de
  passe dans les limites définies par les règles d'authentification.
- Il peut exporter uniquement ses propres interventions et évaluations.

### 3.2 Senior

- Un senior consulte tous les internes actifs de son établissement.
- Il consulte l'historique complet de ces internes, y compris les interventions
  réalisées avec d'autres seniors et toutes les évaluations associées.
- Il consulte leur progression et leurs trophées.
- Il ne voit pas leurs adresses e-mail, identifiants de connexion, secrets
  d'authentification ou bloc-notes personnels.
- L'interface Senior propose trois filtres de population distincts : « Tous les
  internes », « Mes internes » et « Relations récentes ».
- « Tous les internes » affiche tous les internes actifs de l'établissement et
  constitue la vue initiale.
- « Mes internes » est un simple filtre de favoris configuré par le Senior pour
  accéder plus rapidement à certains internes.
- « Relations récentes » affiche les internes avec lesquels le Senior a
  récemment travaillé.
- Ces trois choix sont présentés dans une carte cyclique unique : la carte affiche
  le filtre actif et un appui sélectionne le filtre suivant.
- Ces trois filtres modifient uniquement l'affichage. Ajouter ou retirer un
  interne de « Mes internes », ou l'absence de relation récente, ne modifie jamais
  les droits d'accès.
- Seul le senior désigné par l'interne sur une intervention peut l'évaluer.
- Les autres seniors du même établissement peuvent consulter l'intervention et
  son évaluation, mais ne peuvent pas se substituer au senior désigné.
- Le senior peut exporter les données pédagogiques de tous les internes de son
  établissement, et jamais celles d'un autre établissement.

### 3.3 Changement d'établissement

- L'historique appartient au parcours de l'interne et le suit lorsqu'il change
  d'établissement.
- Les seniors du nouvel établissement voient l'intégralité de l'historique, y
  compris les interventions réalisées dans les établissements précédents.
- Les seniors de l'ancien établissement perdent immédiatement tout accès lorsque
  l'interne n'appartient plus à leur établissement, même s'ils avaient eux-mêmes
  évalué certaines interventions.

### 3.4 Administrateur

- L'administrateur possède une vision globale, tous établissements confondus.
- Il gère les comptes, les établissements, le catalogue des interventions et
  checklists, les trophées, les statistiques, les exports et le journal d'audit.
- Il peut effectuer un export global.
- Le journal d'audit est visible uniquement par les administrateurs.

### 3.5 Établissements

- L'établissement détermine les droits de consultation des seniors.
- Il est sélectionné dans une liste officielle administrée.
- Il ne doit jamais être saisi comme un texte libre susceptible de créer des
  doublons ou des droits incohérents.
- Chaque établissement possède un identifiant technique permanent, indépendant
  de son nom affiché.
- L'administrateur peut créer, renommer ou archiver un établissement.
- Renommer un établissement ne modifie aucun rattachement et ne casse aucun
  historique.
- Un établissement archivé n'est plus proposé pour une nouvelle affectation,
  mais reste visible dans les historiques existants.
- Un établissement lié à des comptes ou à des données ne peut jamais être
  supprimé physiquement.

## 4. Comptes et authentification

### 4.1 Création d'un compte

- Il n'existe aucune inscription libre.
- Seul un administrateur peut créer un compte Interne ou Senior.
- L'administrateur renseigne l'identité, l'établissement et un identifiant de
  connexion unique.
- Le site génère aléatoirement une clé d'accès provisoire. L'administrateur ne la
  choisit pas.
- La clé est générée avec un générateur cryptographiquement sûr.
- Elle contient huit caractères hors séparateur et s'affiche sous la forme
  `XXXX-XXXX`.
- Elle utilise uniquement des lettres majuscules et des chiffres faciles à
  distinguer. Les caractères ambigus `O`, `0`, `I`, `1` et `L` sont exclus.
- Elle est affichée une seule fois à l'administrateur, qui la copie et la transmet
  à l'utilisateur en dehors de la plateforme.
- Elle ne doit jamais être conservée en clair. Seule une représentation hachée ou
  une protection équivalente peut être stockée.
- La clé n'a pas de date d'expiration tant qu'elle n'est pas utilisée.
- Elle est strictement à usage unique et devient invalide dès que la première
  connexion est finalisée.
- Si la clé est perdue, l'administrateur en génère une nouvelle et l'ancienne est
  immédiatement invalidée.

### 4.2 Première connexion

- L'utilisateur saisit son identifiant et sa clé provisoire.
- Il renseigne ensuite une seule fois son adresse e-mail et crée un mot de passe
  personnel, saisi deux fois pour confirmation.
- Un lien de confirmation est envoyé à l'adresse e-mail renseignée.
- Le compte reste en attente et l'utilisateur n'accède pas à son espace tant que
  le lien n'a pas été confirmé.
- Un nouveau lien peut être demandé si le précédent a expiré.
- La confirmation de l'adresse active le compte et invalide définitivement la
  clé provisoire.

### 4.3 Connexions suivantes

- L'utilisateur se connecte avec son identifiant unique et son mot de passe.
- L'adresse e-mail sert notamment à la récupération du compte, pas d'identifiant
  principal de connexion.
- Après cinq échecs consécutifs, la connexion au compte est bloquée pendant
  quinze minutes.

### 4.4 Politique de mot de passe

- Le mot de passe contient au moins huit caractères.
- Il contient au moins une minuscule, une majuscule, un chiffre et un caractère
  spécial.
- En dehors d'une récupération par e-mail, changer le mot de passe exige le mot
  de passe actuel.
- Aucun mot de passe ne doit être stocké ou journalisé en clair.

### 4.5 Adresse e-mail

- L'interne et le senior gèrent eux-mêmes leur adresse e-mail.
- La première adresse n'est activée qu'après confirmation du lien envoyé par
  e-mail.
- Après la première connexion, changer l'adresse exige le mot de passe actuel et
  une confirmation envoyée à la nouvelle adresse.
- La nouvelle adresse est saisie une seule fois. L'adresse actuelle reste active
  jusqu'à la confirmation de la nouvelle.
- Une fois la nouvelle adresse confirmée, les anciennes sessions du compte sont
  révoquées et une nouvelle session sécurisée est créée pour l'utilisateur ayant
  confirmé le changement.
- La confirmation de la nouvelle adresse déclenche une notification de sécurité
  à l'ancienne adresse. Cette notification informe du remplacement et ne demande
  aucune confirmation : l'absence d'accès à l'ancienne boîte ne bloque jamais le
  changement.
- Le lien de confirmation envoyé à la nouvelle adresse reste l'unique validation
  nécessaire au changement.
- Une modification volontaire du mot de passe depuis le profil déclenche une
  notification de sécurité à l'adresse e-mail actuellement associée au compte.
- Les e-mails d'activation, de récupération et de sécurité sont rédigés en
  français et identifient clairement Mon Journal de Bloc.

### 4.6 Mot de passe oublié

- L'utilisateur saisit son identifiant.
- L'interface affiche toujours un message neutre afin de ne pas révéler si le
  compte existe.
- Un lien de réinitialisation est envoyé à l'adresse e-mail associée.
- Le lien est à usage unique et expire après une heure.

### 4.7 Sessions

- Un même compte peut posséder plusieurs sessions actives simultanément sur le
  web et l'application.
- Le bouton « Se déconnecter » révoque toutes les sessions du compte sur tous les
  appareils.
- La désactivation administrative d'un compte révoque immédiatement toutes ses
  sessions.
- La fermeture complète du navigateur met fin à la connexion web
  locale. La fermeture d'un onglet isolé n'est pas utilisée comme mécanisme de
  révocation, car elle ne peut pas être garantie de manière fiable.
- La session web expire automatiquement après trente minutes d'inactivité et ce
  délai doit être contrôlé côté serveur.
- Toute utilisation normale du site relance ce délai. Son expiration met fin
  uniquement à la session web concernée et ne déconnecte pas les autres appareils
  ni l'application mobile.
- Fermer l'application mobile ne déconnecte pas l'utilisateur.
- Après une première authentification classique réussie, l'utilisateur peut
  activer Face ID, Touch ID ou la biométrie Android pour se connecter sur cet
  appareil.
- Le mot de passe n'est jamais stocké par l'application. La connexion classique
  reste disponible en secours.
- Une déconnexion globale ou une désactivation du compte invalide également
  l'accès biométrique.

### 4.8 Cycle de vie du compte

- Un compte ayant produit des données n'est jamais supprimé physiquement.
- L'administrateur le désactive, tandis que ses interventions, évaluations et
  traces historiques restent conservées.
- Aucune donnée d'un compte désactivé n'est supprimée automatiquement.
- Toute future politique de durée de conservation ou d'anonymisation doit être
  définie séparément et validée explicitement avant son application.

## 5. Supabase, connexion réseau, stockage et synchronisation

### 5.1 Supabase, source centrale de vérité

- Supabase constitue le backend central de Project1 pour les comptes, les
  autorisations et toutes les données métier.
- Pour un même environnement, le web et l'application mobile utilisent le même
  projet Supabase, le même schéma et les mêmes données.
- Supabase ne peut pas être remplacé, contourné ou doublé par un autre stockage
  métier sans validation explicite du propriétaire du projet.
- Une écriture n'est considérée comme réussie qu'après confirmation de sa
  persistance dans Supabase. L'état local de l'interface ne constitue jamais une
  preuve d'enregistrement.
- Si Supabase est indisponible, aucune copie locale ne devient une version
  officielle ou une source de remplacement des données.
- Les politiques de sécurité au niveau des lignes, ou RLS, contrôlent dans
  Supabase les droits des Internes, Seniors et Administrateurs. Le masquage dans
  l'interface ne constitue pas une autorisation suffisante.
- Le filtre « Mes internes » ne doit jamais intervenir dans une politique RLS ou
  dans une autre décision d'autorisation.
- Les opérations métier qui doivent réussir ensemble utilisent une transaction
  ou une fonction serveur atomique. L'enregistrement d'une intervention et la
  création de sa demande d'évaluation forment notamment une opération cohérente.
- Supabase Realtime accélère la propagation des changements, mais ne constitue
  jamais l'unique mécanisme de synchronisation.
- Les modifications du schéma, des fonctions et des politiques Supabase passent
  par des migrations versionnées, sauvegardées et testées conformément aux règles
  relatives aux opérations sensibles.

### 5.2 Connexion et stockage local

- Une connexion Internet est obligatoire pour consulter ou modifier les données.
- Supabase et les composants serveur autorisés constituent l'unique source de
  vérité.
- L'application et le web ne proposent pas de mode hors ligne pour les données
  métier.
- Aucune donnée métier sensible ne doit être conservée durablement dans
  `localStorage`, `sessionStorage`, IndexedDB ou le cache du navigateur. Cela
  inclut notamment les profils, interventions, checklists, évaluations,
  bloc-notes et journaux d'activité.
- Sur le web, les données chargées restent uniquement en mémoire pendant la
  session active. Les identifiants de session ne sont jamais stockés dans les API
  de stockage JavaScript ; ils utilisent un mécanisme serveur protégé par un
  cookie non persistant `HttpOnly`, `Secure` et `SameSite`.
- Dans l'application, seule la session peut être conservée dans le stockage
  sécurisé du système, via Keychain ou Keystore. Aucune donnée métier n'y est
  mise en cache durablement.
- Le stockage local reste autorisé uniquement pour des préférences d'interface
  sans donnée personnelle ou métier, comme un filtre ou une position de
  navigation.
- La fin de session efface l'état en mémoire et les caches privés associés.
- Aucune modification ne doit être considérée comme réussie si le serveur ne l'a
  pas confirmée.
- Une perte de connexion affiche un état clair et permet de réessayer.
- Aucun brouillon d'intervention n'est conservé hors ligne. Si la connexion est
  perdue avant la validation finale, l'interne recommence la saisie.
- Le bloc-notes est sauvegardé automatiquement sur le serveur pendant la saisie,
  sans bouton « Enregistrer ».
- Le même bloc-notes est retrouvé sur le web et l'application.
- Une erreur de sauvegarde ne doit jamais être présentée comme un succès.

### 5.3 Cohérence de l'historique Interne-Senior

- Il n'existe jamais deux historiques métier distincts pour l'Interne et le
  Senior. Une intervention possède un enregistrement central et un identifiant
  stable dans Supabase ; toutes les interfaces autorisées consultent cette même
  donnée.
- Dès que Supabase confirme l'enregistrement d'une intervention, celle-ci doit
  apparaître automatiquement, en quelques secondes, dans l'historique de
  l'interne, dans l'historique consultable par tous les seniors autorisés de son
  établissement et dans les évaluations en attente du senior désigné.
- Le filtre « Mes internes », un cache local, l'absence d'une notification push
  ou la perte d'un événement Realtime ne doivent jamais masquer durablement une
  intervention à un senior autorisé.
- À l'ouverture d'une interface et à son retour au premier plan, les données sont
  rechargées et rapprochées de l'état complet présent dans Supabase. Cette lecture
  de référence complète le mécanisme Realtime.
- Une erreur d'enregistrement, de chargement ou de synchronisation est affichée
  clairement et permet de réessayer. Aucun échec silencieux n'est acceptable.
- La suppression autorisée d'une intervention en attente la retire
  automatiquement de toutes les interfaces concernées et de la liste
  d'évaluations du senior désigné.
- Après la validation d'une évaluation, les notes, le commentaire éventuel et le
  score apparaissent automatiquement dans l'historique de l'interne.
- Une divergence détectée entre les vues Interne et Senior est une anomalie
  d'intégrité prioritaire, et non un simple défaut d'affichage.

## 6. Enregistrement d'une intervention

### 6.1 Parcours obligatoire

Le parcours reste :

1. formulaire de l'intervention ;
2. variables de contexte structurées, présentées dans un accordéon guidé en trois
   sections : « Patiente », « Antécédents » et « Per-opératoire » ;
3. récapitulatif ;
4. validation définitive de l'enregistrement.

### 6.2 Formulaire

- Tous les champs applicables sont obligatoires avant de passer aux variables de
  contexte.
- Ils comprennent notamment la date, l'heure de début de l'intervention, la durée
  opératoire exprimée en minutes, le senior, le type d'intervention,
  l'indication, la voie d'abord, la technique d'entrée et la latéralité lorsqu'elles
  sont applicables, le contexte, la complexité et le rôle de l'interne.
- Le contexte est obligatoirement choisi par l'interne entre « Bloc programmé »
  et « Urgence ». Il n'est jamais déduit automatiquement de l'indication.
- L'heure de début et la durée opératoire sont initialement vides. Aucune valeur
  automatique ou préremplie ne doit être proposée.
- La complexité est estimée par l'interne sur une échelle de 1 à 10.
- La valeur initiale de complexité est 5.
- La complexité n'entre pas dans la formule du score d'autonomie.

### 6.3 Variables de contexte

- Les mêmes variables, valeurs et validations sont proposées sur le web et dans
  l'application.
- Les variables sont regroupées visuellement dans trois sections :
  - « Patiente » : âge, IMC, tabac et parité ;
  - « Antécédents » : antécédent d'IGH, antécédent de pelvipéritonite,
    antécédent de chirurgie abdomino-pelvienne et antécédent de césarienne ;
  - « Per-opératoire » : saignement et complication per-opératoires.
- L'IMC utilise une valeur continue dont les bornes affichées sont `≤ 15` et
  `≥ 40`.
- Lorsqu'ils sont renseignés, le tabac, l'antécédent d'IGH, l'antécédent de
  pelvipéritonite, l'antécédent de chirurgie abdomino-pelvienne et la
  complication per-opératoire utilisent une réponse « Oui » ou « Non ».
- La parité et le nombre de césariennes utilisent les catégories `0`, `1`, `2`
  et `≥ 3`.
- Lorsque l'antécédent de chirurgie abdomino-pelvienne vaut « Oui », une
  précision facultative en texte libre peut être ajoutée.
- Le saignement per-opératoire est renseigné de 50 mL en 50 mL, de `0 mL` à
  `≥ 2 500 mL`.
- Lorsque la complication per-opératoire vaut « Oui », une précision facultative
  en texte libre peut être ajoutée.
- Toutes les variables de contexte sont facultatives. L'interne peut accéder au
  récapitulatif sans en renseigner, ou n'en renseigner qu'une partie.
- Une variable renseignée reste soumise à son type, ses bornes et ses valeurs
  autorisées. Une variable laissée vide est enregistrée comme non renseignée,
  sans valeur implicite.

### 6.4 Immutabilité et suppression

- Une intervention enregistrée n'est jamais modifiable.
- Tant qu'elle n'est pas évaluée, l'interne propriétaire peut la supprimer puis
  recommencer l'enregistrement depuis le début.
- Cette action est proposée dans `Paramètres > Mes données > Interventions en
  attente`. L'historique conserve son architecture de consultation : une
  intervention en attente y reste verrouillée et non ouvrable.
- Dès qu'une évaluation existe, l'intervention ne peut plus être modifiée ou
  supprimée par personne, y compris un administrateur.
- La suppression d'une intervention en attente retire également la demande
  d'évaluation correspondante.

### 6.5 Conservation de la définition historique

- Chaque intervention conserve un instantané de la définition utilisée lors de
  la saisie : libellés, étapes, voies, règles applicables, définition des
  variables cliniques, horaire, durée et identifiants utiles.
- Une modification ultérieure du catalogue ou d'une checklist ne transforme pas
  rétroactivement les données brutes d'une intervention existante.
- Les anciennes variables de contexte sous forme de puces restent lisibles dans
  leur format historique et ne sont pas converties rétroactivement.
- Lorsqu'un type d'intervention est archivé, il disparaît des nouvelles saisies
  mais reste correctement affiché dans tous les historiques concernés.

## 7. Évaluation Senior et score d'autonomie

### 7.1 Checklist

- Le senior remplit la checklist pour préciser le niveau d'autonomie de
  l'interne sur chaque étape.
- Chaque étape applicable reçoit obligatoirement un niveau.
- La valeur « NA » est autorisée pour une étape non applicable.
- La validation de l'évaluation est impossible tant que la checklist applicable
  n'est pas complète.
- L'échelle protégée est :
  - NA : non applicable ;
  - 0 : observé uniquement ;
  - 1 : montré et expliqué ;
  - 2 : réalisé avec assistance active du senior ;
  - 3 : réalisé avec assistance passive du senior ;
  - 4 : réalisé sous supervision seule.

### 7.2 Évaluation

- Seul le senior désigné sur l'intervention peut l'évaluer.
- Le remplissage de la checklist est obligatoire.
- La note de performance globale est obligatoire.
- La catégorie de difficulté est obligatoire.
- Le commentaire du senior est facultatif.
- La validation rend l'évaluation définitive.
- Une évaluation validée ne peut plus être modifiée ou supprimée par l'interne,
  le senior ou l'administrateur.
- L'interne voit immédiatement les notes, le commentaire éventuel et le score sur
  le web et l'application.

### 7.3 Échelles Senior

Performance globale :

1. Interne non préparé ;
2. Connaissance insuffisante ;
3. Performance intermédiaire ;
4. Compatible autonomie supervisée ;
5. Performance exceptionnelle.

Difficulté :

1. Simple ;
2. Intermédiaire ;
3. Difficile.

### 7.4 Formule officielle

- La moyenne des étapes clés applicables, notées de 0 à 4, est convertie sur 100
  selon `composante_autonomie = moyenne / 4 × 100`.
- La composante autonomie compte pour 100 % et la composante performance pour
  0 % dans le calcul du score d'autonomie.
- La catégorie de difficulté n'applique aucun coefficient au score d'autonomie.
- Le résultat est arrondi et limité entre 0 et 100.
- Le score est non calculable si moins de 75 % des étapes clés applicables ont une
  note comprise entre 0 et 4.
- Les réponses brutes et les notes Senior restent immuables.
- Le score est une donnée dérivée. Une modification officiellement validée de la
  formule entraîne le recalcul de tous les scores historiques.
- Les statistiques, graphiques, progressions et trophées dépendant du score sont
  eux aussi recalculés. Un trophée peut être gagné ou perdu à la suite de ce
  recalcul.

## 8. Trophées

### 8.1 Attribution et visibilité

- Les trophées sont attribués uniquement de manière automatique selon les règles
  configurées par l'administrateur.
- Aucune attribution manuelle n'est possible.
- L'interne voit ses trophées.
- Les seniors voient les trophées des internes de leur établissement.
- Les administrateurs voient les trophées de tous les internes.

### 8.2 Configuration

- Un trophée possède un titre, une description facultative, une ou plusieurs
  images, un format unique ou à niveaux, une visibilité et une ou plusieurs
  conditions.
- Les conditions disponibles couvrent notamment : première intervention, nombre
  enregistré ou évalué, procédure, voie d'abord, rôle, moyenne d'autonomie,
  autonomie sur plusieurs procédures, procédures distinctes, horaire
  d'enregistrement, statut évalué/en attente et nombre de connexions.
- Lorsque plusieurs conditions existent, elles doivent toutes être remplies.
- Un trophée unique exige une image.
- Un trophée à niveaux exige qu'une image soit renseignée pour chacun des niveaux
  Bronze, Argent, Or et Diamant.
- L'activation est impossible si le titre, les conditions, les images ou les
  seuils manquent. Une description vide n'empêche jamais l'activation.
- Les seuils Bronze, Argent, Or et Diamant sont strictement croissants.
- Les niveaux concernent la même règle métier ; seuls les seuils, le minimum
  d'autonomie et l'image du niveau évoluent.

### 8.3 Trophées visibles et surprises

- Un trophée à progression visible reste invisible tant que sa progression vaut
  zéro.
- Il apparaît dès le premier progrès réel et montre l'objectif et la progression.
- Un trophée surprise est totalement invisible avant son obtention.
- Aucune carte « Trophée secret », aucun indice, aucun compteur et aucune
  progression ne doivent révéler son existence.
- Une fois obtenu, le trophée surprise apparaît parmi les trophées remportés avec
  son nom, son image et, si elle a été renseignée, sa description.

### 8.4 Trophées à niveaux

- Les niveaux sont Bronze, Argent, Or puis Diamant.
- Une seule carte est affichée dans la vitrine et la collection : celle du plus
  haut niveau obtenu.
- Le nouveau niveau remplace visuellement le précédent.
- Aucun effet d'empilement ne représente les anciens niveaux dans la collection.
- Un clic sur la carte du plus haut niveau ouvre tous les niveaux obtenus, rangés
  du niveau le plus élevé au niveau le plus bas.
- Chaque niveau obtenu compte séparément dans le total des trophées remportés.
- Exemple : un trophée au niveau Or compte pour trois trophées remportés, mais une
  seule carte Or est affichée.
- La carte affiche la date d'obtention du niveau actuellement visible.
- Les dates de chaque niveau précédent restent conservées.
- Diamant constitue le niveau final.

### 8.5 Cycle de vie et recalcul

- Un brouillon n'est ni visible ni calculé.
- Un trophée actif participe aux calculs et à l'affichage.
- Un trophée désactivé disparaît des collections et des compteurs, sans supprimer
  sa définition.
- Un trophée déjà activé ne peut jamais être supprimé physiquement. Il peut
  seulement être désactivé.
- Seul un brouillon jamais activé peut être supprimé définitivement.
- Modifier une règle ou un seuil recalcule rétroactivement les trophées de tous
  les internes.
- Si un nouveau trophée est activé alors qu'un interne remplissait déjà ses
  conditions, la date d'obtention est la date d'activation du trophée.
- Si les conditions sont remplies après l'activation, la date est celle de
  l'événement qui atteint le seuil.
- L'édition d'un trophée actif crée une version brouillon. La règle active
  précédente continue de fonctionner jusqu'à la publication complète et atomique
  de la nouvelle version.

### 8.6 Notifications de trophée

- L'interne est averti lorsqu'il obtient un trophée ou un nouveau niveau.
- Le message automatique est : « Vous avez obtenu un nouveau trophée : [Nom du
  trophée] ! ».
- Une célébration apparaît dans l'interface active.
- Une notification push mobile est envoyée si l'application est fermée.
- Aucun e-mail n'est envoyé pour les trophées.

## 9. Centre de notifications commun

### 9.1 Destinataires et messages automatiques

- L'Interne reçoit les notifications automatiques et les messages envoyés depuis
  l'espace Administrateur.
- Les deux messages automatiques sont :
  - « Vous avez obtenu un nouveau trophée : [Nom du trophée] ! » ;
  - « Une évaluation a été complétée par [Nom du senior] ».
- Une même obtention de trophée ou une même évaluation ne peut générer qu'une
  seule notification, y compris après un rechargement, une reconnexion ou un
  recalcul.
- Le Senior ne reçoit aucune notification automatique. Les interventions qui
  lui sont attribuées restent signalées comme tâches à évaluer dans son tableau
  de bord. Il reçoit uniquement les messages envoyés par l'Administrateur.
- L'Administrateur ne reçoit aucune notification. Il organise et suit les
  messages depuis son espace de gestion.
- Aucun e-mail n'est envoyé en remplacement d'une notification.

### 9.2 Présentation et lecture

- Sur le web, un liseré rouge animé lentement et un compteur de messages non lus
  entourent la photo de profil de l'Interne.
- Le Senior dispose du même indicateur autour d'un petit avatar placé en haut à
  droite.
- Un clic sur la photo ou l'avatar ouvre le centre de notifications.
- Les messages non lus sont affichés en premier, du plus récent au plus ancien,
  puis viennent les messages déjà lus.
- Une notification est considérée comme lue seulement lorsque l'utilisateur
  clique dessus, et non à la simple ouverture du centre.
- Le centre propose l'action « Tout marquer comme lu ».
- Le clic sur une notification de trophée ouvre le détail du trophée obtenu.
- Le clic sur une notification d'évaluation ouvre le détail de l'intervention
  évaluée.

### 9.3 Cycle de vie des messages

- Une notification automatique est retirée du centre après sa lecture.
- Lors de la création d'un message Administrateur, l'Administrateur choisit entre
  une suppression après lecture et une suppression manuelle par le destinataire.
- Un message Administrateur conservé après lecture reste visible avec un style
  atténué jusqu'à sa suppression manuelle.
- La suppression est logique : le message disparaît pour l'utilisateur, tandis
  qu'une trace minimale reste conservée pour l'audit.
- « Tout marquer comme lu » applique à chaque message sa propre règle de cycle de
  vie.

### 9.4 Messages Administrateur

- Les messages apparaissent comme provenant de « Mon Journal de Bloc », sans
  afficher le nom personnel de l'Administrateur. La date et l'heure d'envoi sont
  visibles.
- Les quatre ciblages disponibles sont :
  - tous les Internes et Seniors actifs ;
  - uniquement les Internes ou uniquement les Seniors ;
  - les utilisateurs actifs d'un établissement précis ;
  - un utilisateur actif précis.
- Pour un ciblage par rôle ou établissement, les destinataires sont déterminés
  au moment réel de l'envoi. Les comptes désactivés sont toujours exclus.
- Le formulaire exige un titre, un message et les destinataires.
- L'envoi peut être immédiat ou programmé à une date et une heure.
- Un bouton facultatif peut contenir un libellé et un lien interne ou externe.
  Un lien externe est clairement signalé et s'ouvre séparément dans le
  navigateur.
- Un aperçu final indique notamment le nombre de destinataires avant la
  confirmation.
- Un message programmé peut être modifié ou annulé jusqu'à son envoi.
- Après l'envoi, son contenu et ses destinataires deviennent immuables.
  L'Administrateur peut néanmoins le retirer des centres de notifications.
- Le suivi Administrateur affiche seulement le nombre de destinataires, le
  nombre de messages non lus et le nombre de messages lus.

### 9.5 Mobile et notifications système

- Le centre de notifications utilise les mêmes données sur le web, iPhone, iPad
  et Android.
- Les notifications système Apple et Android sont prévues dans une étape mobile
  dédiée. Leur refus ou leur indisponibilité ne retire jamais les messages du
  centre commun.
- L'application ne redemande pas l'autorisation système à chaque ouverture et
  propose un accès aux réglages du téléphone pour permettre une activation
  ultérieure.

## 10. Exports, bloc-notes et support

### 10.1 Exports

- L'interne exporte ses propres interventions et évaluations.
- Le senior exporte les données pédagogiques des internes de son établissement.
- L'administrateur peut réaliser un export global.
- Aucun export ne contient de mot de passe, clé provisoire, jeton de session ou
  bloc-notes personnel.
- Les exports Senior ne contiennent ni adresse e-mail ni identifiant de connexion
  des internes.

### 10.2 Support

- Une adresse de support configurable sera créée ultérieurement.
- Elle ne doit pas être codée en dur à plusieurs endroits.
- Le bouton de support ouvre l'application de messagerie de l'utilisateur.
- L'adresse destinataire, l'objet et un modèle de texte sont préremplis.
- L'utilisateur peut modifier le message avant de l'envoyer.
- Aucun message de support n'est stocké dans Project1 ou affiché dans l'espace
  Administrateur.
- L'ancien système « Remarques de test » ne fait pas partie du produit cible. Sa
  fonctionnalité et son code résiduel doivent être supprimés. La suppression
  éventuelle des enregistrements historiques déjà présents exige une validation
  explicite distincte.

## 11. Contenu médical

- Les guides techniques, textes, schémas, images, indications et étapes
  opératoires sont du contenu médical protégé.
- Aucun de ces contenus ne peut être ajouté, supprimé ou reformulé sans demande
  et validation explicites du propriétaire du projet.
- Une modification purement technique ne doit jamais altérer silencieusement le
  sens médical.

## 12. Audit, sauvegardes et opérations sensibles

### 12.1 Journal d'audit

- Les actions sensibles sont tracées avec leur auteur, leur date et leur nature.
- Sont notamment concernées : création ou suppression d'une intervention en
  attente, validation d'une évaluation, changement d'établissement, désactivation
  de compte, publication de formule et modification de trophée.
- Le journal est accessible uniquement aux administrateurs.

### 12.2 Sauvegardes

- La base et les images de trophées disposent d'une sauvegarde automatique
  quotidienne, conservée pendant trente jours.
- La sauvegarde externe couvre ensemble les données applicatives, les comptes
  Auth nécessaires à la reconnexion, les fichiers réels de Supabase Storage et
  les migrations versionnées. Un simple export des métadonnées Storage n'est pas
  considéré comme une sauvegarde complète.
- Les archives externes contenant des données réelles sont chiffrées et leur clé
  de récupération est conservée séparément de la destination. L'activation d'une
  nouvelle destination externe exige l'accord explicite du propriétaire.
- Une procédure de restauration doit exister et être vérifiable.
- Une sauvegarde supplémentaire est créée avant chaque migration sensible.
- Avant toute migration pouvant modifier ou supprimer des données, il faut une
  sauvegarde, une simulation sans écriture et une validation explicite.

### 12.3 Production

- Aucune mise en production, migration de base ou modification des données
  réelles n'est autorisée sans demande explicite du propriétaire du projet.
- Les secrets restent côté serveur ou dans les mécanismes sécurisés prévus. Ils
  ne doivent jamais être copiés dans le code client, les logs ou la documentation.

## 13. Procédure obligatoire pour les futures modifications

Avant toute modification du code :

1. lire `CONTEXTE_PROJET.md` en entier ;
2. identifier les règles et parcours potentiellement affectés ;
3. vérifier les fichiers déjà modifiés et préserver le travail existant ;
4. ne modifier que le périmètre demandé ;
5. préserver les données et la compatibilité des historiques ;
6. vérifier le web et l'application lorsqu'une logique commune change ;
7. exécuter au minimum le contrôle TypeScript et la compilation web ;
8. exécuter le contrôle TypeScript mobile pour toute modification touchant
   l'application ou une logique qu'elle consomme ;
9. tester les rôles concernés et les interdictions d'accès correspondantes ;
10. pour toute logique concernant les interventions ou évaluations, tester le
    parcours croisé : enregistrement par l'Interne, apparition chez les Seniors
    autorisés, présence dans les évaluations du Senior désigné, validation par ce
    Senior, puis apparition du résultat chez l'Interne ;
11. vérifier également qu'un Senior d'un autre établissement ne voit jamais ces
    données et que la suppression autorisée d'une intervention en attente se
    propage partout ;
12. signaler clairement tout écart restant entre le code et les règles ;
13. ne déclarer la modification terminée qu'après les vérifications pertinentes.

Pour tout travail dans `mobile/`, la règle Expo 57 déjà présente dans
`mobile/AGENTS.md` reste applicable : consulter la documentation exacte de la
version avant de modifier le code mobile.

## 14. Évolution de ce document

- Le contexte ne doit jamais être modifié silencieusement.
- Toute nouvelle règle ou modification est d'abord proposée comme brouillon.
- Elle entre dans le document actif uniquement après validation explicite du
  propriétaire du projet.
- Le code actuel ne constitue pas automatiquement la règle métier. Lorsqu'il
  existe un écart, la règle validée dans ce document décrit la cible.

## 15. État de conformité et écarts encore ouverts

Cette liste distingue les fonctions conformes des écarts qui nécessitent encore
une action. Elle est informative et ne constitue jamais une autorisation de
modifier la production ou les données. Les preuves détaillées restent conservées
dans les rapports versionnés du dossier `docs`.

1. **Socle métier Supabase — conforme, contrôle croisé restauré** :
   l'enregistrement atomique des interventions, les autorisations par
   établissement, l'évaluation réservée au Senior désigné, l'immutabilité des
   évaluations, les instantanés historiques et le calcul serveur du score sont
   actifs. Le test croisé automatisé reste obligatoire. Le projet isolé
   `project1-integration-test-20260811` et ses comptes synthétiques permettent
   de nouveau de l'exécuter sans toucher à la production. Le parcours connecté
   Interne–Seniors, l'évaluation par le Senior désigné et le changement
   d'établissement ont été validés le 11 août 2026.
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
5. **Sauvegarde externe — archive courante et restauration vérifiées** : la
   sauvegarde chiffrée couvre PostgreSQL, Auth, Storage et les
   migrations, avec rétention et exécution quotidienne. Le mécanisme réessaie
   désormais pendant environ une heure. Une archive fraîche du 11 août 2026 a
   été produite et son intégrité vérifiée. Elle a été restaurée intégralement le
   11 août 2026 dans le projet Supabase isolé
   `project1-integration-test-20260811` : 1 222 lignes applicatives et 9 objets
   Storage ont été contrôlés. Aucune restauration d'exercice ne doit viser la
   production.
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
8. **Qualité et CI — socle actif, environnement connecté rétabli** :
   ESLint, les tests, le typage, les compilations, les audits de dépendances et
   les contrôles Expo sont exécutés par la CI. Au 11 août 2026, ces contrôles et
   les cinq emplois navigateur réussissent. La base isolée et les comptes de
   test ont été recréés. Le test Supabase croisé connecté réussit localement ;
   les secrets GitHub et l'adresse du déploiement E2E isolé doivent rester
   valides pour que les emplois connectés soient obligatoires et verts dans la
   CI.
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

## 16. Sujet futur non bloquant

- Les détails visuels de la future interface web pour ordinateur seront définis
  au moment de sa refonte. Ce point ne bloque pas l'activation des autres règles.
