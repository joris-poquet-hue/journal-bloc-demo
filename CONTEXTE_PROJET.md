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
- Il renseigne ensuite deux fois son adresse e-mail. Les deux valeurs doivent être
  identiques.
- Il crée un mot de passe personnel avant d'accéder à son espace.
- Aucun lien de confirmation de l'adresse e-mail n'est exigé à cette étape.
- Une fois ces informations acceptées, l'accès est immédiat et la clé provisoire
  est invalidée.

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
- Après la première connexion, changer l'adresse exige le mot de passe actuel et
  une confirmation envoyée à la nouvelle adresse.

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

- Un trophée possède un titre, une description, une ou plusieurs images, un
  format unique ou à niveaux, une visibilité et une ou plusieurs conditions.
- Les conditions disponibles couvrent notamment : première intervention, nombre
  enregistré ou évalué, procédure, voie d'abord, rôle, moyenne d'autonomie,
  autonomie sur plusieurs procédures, procédures distinctes, horaire
  d'enregistrement, statut évalué/en attente et nombre de connexions.
- Lorsque plusieurs conditions existent, elles doivent toutes être remplies.
- Un trophée unique exige une image.
- Un trophée à niveaux exige qu'une image soit renseignée pour chacun des niveaux
  Bronze, Argent, Or et Diamant.
- L'activation est impossible si le titre, la description, les conditions, les
  images ou les seuils manquent.
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
  son nom, son image et sa description.

### 8.4 Trophées à niveaux

- Les niveaux sont Bronze, Argent, Or puis Diamant.
- Une seule carte est affichée dans la vitrine et la collection : celle du plus
  haut niveau obtenu.
- Le nouveau niveau remplace visuellement le précédent.
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
- Une célébration apparaît dans l'interface active.
- Une notification push mobile est envoyée si l'application est fermée.
- Aucun e-mail n'est envoyé pour les trophées.

## 9. Notifications d'évaluation

- Lorsqu'un interne enregistre une intervention, le senior désigné reçoit une
  notification d'évaluation en attente.
- Lorsqu'un senior valide l'évaluation, l'interne reçoit une notification.
- Ces notifications apparaissent dans l'interface et sont envoyées en push sur
  mobile si l'application est fermée.
- Aucun e-mail n'est envoyé pour ces notifications.
- La suppression par l'interne d'une intervention non évaluée retire la demande
  correspondante.
- Si l'utilisateur refuse les notifications push, les notifications restent
  visibles dans l'application et sur le web, et les évaluations en attente
  restent signalées dans le tableau de bord.
- L'application ne redemande pas l'autorisation à chaque ouverture. Elle propose
  un accès aux réglages du téléphone pour permettre une activation ultérieure.
- Le refus ou l'indisponibilité des notifications push ne déclenche aucun e-mail
  de remplacement.

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

Cette liste distingue les écarts encore ouverts des règles désormais conformes.
Elle est informative et ne doit jamais être traitée comme une autorisation de
modifier le code, la production ou les données. Les preuves détaillées restent
conservées dans les rapports versionnés du dossier `docs`.

1. **Présentation web transitoire** : la version application Interne/Senior est
   aujourd'hui la référence visuelle et fonctionnelle la plus avancée, proche de
   la version mobile définitive souhaitée. Le web reprend encore largement cette
   présentation pensée comme une application. La prochaine étape consistera à
   adapter l'interface web à un véritable usage sur ordinateur, sans modifier les
   fonctions, les données ni les règles communes avec l'application.
2. **Accès Senior — backend et correctif client actifs** : la migration
   `202607200001_atomic_intervention_realtime_authorization.sql` applique la même
   règle dans les politiques Supabase du projet principal depuis le 20 juillet
   2026. Les lectures authentifiées de la recette réelle du 20 juillet 2026 ont
   confirmé qu'un Senior voit tous les Internes de son établissement dans
   Supabase, indépendamment de « Mes internes ». La version de production testée
   ne montrait qu'un filtre cyclique initialisé sur « Relations récentes » : un
   Senior autorisé pouvait donc obtenir « Aucun interne disponible » sans voir
   immédiatement la vue complète. Le code source conserve désormais les trois
   filtres mais restaure, à la demande du propriétaire, leur carte cyclique
   historique. « Tous les internes » reste la vue initiale, puis la carte permet
   de passer à « Mes internes » et « Relations récentes ». Le conteneur mobile qui
   sélectionne « Mes internes » après sa configuration a été adapté à ce cycle.
   Les tests, les contrôles TypeScript web et mobile et la compilation web
   réussissent. La préversion Vercel `dpl_RQr3dA7NCBUSX82hnRCwD8gwo92K` a été
   vérifiée puis promue en production sous
   `dpl_Bq1xX25qoVKhWnHdQxPMm4NB3FQG` le 20 juillet 2026.
   `https://monjournaldebloc.fr` sert désormais le bundle contenant ce visuel. Le
   conteneur mobile consomme cette interface web commune, mais toute nouvelle
   diffusion native en boutique reste une opération distincte.
3. **Stockage local — conforme avec récupération historique contrôlée** :
   aucune collection métier active ni aucun jeton Supabase n'est chargé ou écrit
   dans le stockage persistant du navigateur. Au démarrage, le client supprime
   les anciennes clés connues de profils, interventions, évaluations, trophées,
   journaux, retours de test et sessions. Seule une ancienne copie de bloc-notes
   encore valide peut être conservée temporairement afin que l'Interne choisisse
   explicitement de la restaurer dans Supabase ou de conserver la version
   Supabase. Cette clé est supprimée après la décision ; une copie illisible est
   supprimée automatiquement. La session web reste gérée côté serveur et la
   session mobile uniquement dans SecureStore/Keychain/Keystore.
4. **Interventions — suppression en attente active en production** : depuis le
   20 juillet 2026, la migration
   `202607200002_pending_intervention_deletion.sql` réserve la suppression à
   l'Interne propriétaire tant que l'intervention n'a reçu aucune évaluation.
   La fonction Supabase supprime atomiquement l'intervention et sa demande
   d'évaluation, écrit une trace d'audit et refuse les Seniors, l'Administrateur
   et toute suppression directe. Dans le client commun, l'action se trouve dans
   `Paramètres > Mes données > Interventions en attente` ; les cartes en attente
   restent verrouillées dans l'historique. Une recette authentifiée sur le site
   public a confirmé l'enregistrement, la visibilité pour tous les Seniors du
   même établissement, l'absence d'accès depuis un autre établissement, la
   suppression après confirmation Supabase et l'ouverture d'une nouvelle saisie
   vierge. Les comptes et données synthétiques ont ensuite été supprimés et les
   compteurs de production sont revenus exactement à leur état initial.
5. **Évaluations — backend et client web actifs** : le client réserve désormais
   la validation au senior désigné. La migration versionnée bloque les écritures
   directes, retire ce droit à l'administrateur et rend la validation atomique et
   non modifiable. Ces règles ont réussi le parcours d'intégration sur le projet
   isolé puis sur le projet principal dans une transaction entièrement annulée.
   Elles sont actives en production depuis le 20 juillet 2026. Leur diffusion en
   boutique mobile reste soumise à la procédure propre à chaque plateforme.
6. **Historique des checklists et formule — conforme** : chaque nouvelle
   intervention reçoit dans la transaction atomique un instantané versionné de
   sa définition et de ses étapes applicables. Les anciennes interventions ont
   reçu un instantané « historique hérité » après rapport, validation et
   sauvegarde. Le score est calculé exclusivement côté serveur avec une formule
   officielle versionnée. Les migrations `202607270006`, `202607270007` et
   `202607270008` sont actives en production.
7. **Trophées surprises** : le code affiche actuellement des cartes génériques
   « Trophée secret ». La cible les rend entièrement invisibles avant obtention.
8. **Trophées actifs** : la suppression et l'édition directe doivent être
   remplacées par la désactivation et la publication versionnée.
9. **Authentification initiale — conforme** : l'Administrateur crée le compte
   avec un identifiant et une clé provisoire aléatoire au format `XXXX-XXXX`,
   générée côté serveur et affichée une seule fois. À la première connexion,
   l'utilisateur confirme son adresse e-mail et remplace la clé par son mot de
   passe. Une clé régénérée invalide immédiatement la précédente.
10. **Sessions web — actives en production** : le code utilise désormais un
    registre serveur et un cookie non persistant `HttpOnly`, `Secure`,
    `SameSite`, avec expiration atomique après trente minutes d'inactivité. La
    déconnexion volontaire et la désactivation révoquent toutes les sessions.
    Les migrations `202607270004` et `202607270005` ont été appliquées en deux
    étapes le 27 juillet 2026 autour du déploiement Vercel
    `dpl_4ddUnCg5wCNade9NhmE9YjtMwSbo`. Une recette réelle avec deux sessions web
    et deux sessions mobiles a confirmé la coexistence, l'expiration isolée et
    la révocation globale. Un second scénario réel a confirmé que la
    désactivation administrative révoque immédiatement les sessions web et
    mobile du compte. Les données synthétiques ont ensuite été supprimées.
11. **Biométrie — code prêt mais non diffusé en nouvelle version native** : la coque mobile active conserve
    uniquement le jeton opaque dans SecureStore et propose Face ID, Touch ID ou
    la biométrie Android après une connexion classique. La WebView est
    éphémère et son script injecté ne contient plus de logique métier. Les
    contrôles TypeScript réussissent, mais une nouvelle version native et des
    essais sur appareils physiques restent nécessaires.
12. **Notifications** : les notifications push pour évaluations et trophées ne
    sont pas encore garanties par le socle actuel.
13. **Support — fonction conforme, adresse définitive encore à configurer** :
    les espaces Interne, Senior et Administrateur ouvrent l'application de
    messagerie avec destinataire, objet et corps préremplis, sans stocker le
    message dans Project1. L'adresse est centralisée et configurable ; l'adresse
    définitive décidée par le propriétaire devra être renseignée lorsqu'elle
    existera. L'ancienne fonctionnalité « Remarques de test » n'est plus
    référencée par le client ni par les scripts opérationnels. La migration
    `202607270009_retire_test_feedback_operations.sql`, appliquée le 27 juillet
    2026, retire ses droits et mécanismes applicatifs tout en conservant la table
    et tous les anciens enregistrements.
14. **Établissements — conforme** : le référentiel officiel `institutions`
    possède des identifiants stables, un nom officiel, un statut et une date
    d'archivage. L'Administrateur crée, renomme, archive et sélectionne les
    établissements dans cette liste. Le déplacement d'un compte est atomique,
    audité et révoque les anciens accès Senior. Les politiques Senior comparent
    les identifiants stables et non les anciens textes.
15. **Cohérence Interne-Senior — backend et interface web conformes** : le
    client attend désormais la confirmation de la fonction atomique Supabase avant
    d'afficher le succès. La production actuelle écoute Realtime et recharge les
    données au retour au premier plan. Le Lot 3 déployé le 27 juillet 2026 remplace
    l'exposition d'un jeton Realtime dans le navigateur par une réconciliation
    serveur automatique toutes les cinq secondes, ainsi qu'au focus, au retour
    du réseau et au retour de l'application. La publication Realtime et les politiques associées sont dans la
    migration versionnée. Le parcours croisé réel, y compris le changement
    d'établissement et la révocation des anciens accès, a réussi le 20 juillet 2026
    sur `project1-integration-test`. Après sauvegarde supplémentaire, simulation et
    autorisation explicite du propriétaire, la migration a été appliquée au projet
    principal le 20 juillet 2026. Les tables, fonctions, politiques et publications
    Realtime attendues ont été contrôlées. Le même parcours croisé a ensuite réussi
    dans une transaction de production entièrement annulée. Les trois comptes,
    trois profils, trois interventions et trois évaluations réels sont restés
    intacts et aucun compte, profil ou acte synthétique ne subsiste. Le client web
    correspondant a été déployé le 20 juillet 2026 sur
    `https://monjournaldebloc.fr` après préversion, compilation distante et
    contrôles HTTP et visuels sur ordinateur et téléphone. Le premier binaire
    Android de production, version `1.0.0 (2)`, a également été construit et son
    intégrité vérifiée, mais il n'est pas encore soumis à Google Play. Aucun
    binaire iOS n'existe encore : le compte Apple du propriétaire a été accepté
    par l'assistant EAS mais n'est associé à aucune équipe Apple Developer. La
    création du premier fichier signé exige donc d'abord une adhésion active à
    l'Apple Developer Program ou une invitation dans l'équipe d'une organisation
    déjà inscrite. Le 20 juillet 2026, le propriétaire a décidé de rester sans
    abonnement Apple pour le moment. Aucun nouveau build iOS ni aucune opération
    TestFlight/App Store ne doit donc être lancé sans une nouvelle décision
    explicite. Le web est actif ; la diffusion mobile en boutique reste incomplète
    et ne doit pas être présentée comme terminée. Une recette réelle supplémentaire
    a été exécutée le 20 juillet 2026 sur le site de production, après une nouvelle
    sauvegarde externe, avec quatre comptes et une intervention entièrement
    synthétiques. L'enregistrement atomique, l'évaluation par le Senior désigné,
    la restitution du score à l'Interne, les droits RLS du même établissement, le
    déplacement d'établissement et la révocation des anciens accès ont réussi.
    Cette recette a toutefois révélé deux écarts bloquants : l'interface Senior
    masquait les Internes autorisés lorsqu'ils ne figuraient pas dans ses relations
    récentes, et l'Interne ne peut pas supprimer sa propre intervention avant
    évaluation. Le premier écart a été corrigé dans le code source le 20 juillet
    2026 en conservant les trois filtres dans une carte cyclique et « Tous les
    internes » comme vue initiale. La préversion vérifiée a été promue sur
    `https://monjournaldebloc.fr` le 20 juillet 2026 et le bundle public a été
    contrôlé. Le second écart a été corrigé dans le code source le 20 juillet
    2026 : une fonction Supabase atomique réserve la suppression à l'Interne
    propriétaire tant que l'intervention n'est pas évaluée, supprime aussi la
    demande d'évaluation, écrit une trace d'audit et retire tout droit de
    suppression directe, notamment à l'Administrateur. Dans l'interface, cette
    action se trouve dans `Paramètres > Mes données > Interventions en attente` ;
    l'historique conserve ses cartes en attente verrouillées. Après sauvegarde
    externe fraîche, simulation SQL et autorisation explicite du propriétaire,
    la migration a été appliquée au projet principal le 20 juillet 2026. Le test
    transactionnel complet de production a réussi puis a été annulé. Le même
    client a été construit en préversion, contrôlé puis promu sans reconstruction
    sur `https://monjournaldebloc.fr`. Une recette authentifiée supplémentaire a
    ensuite confirmé dans l'interface publique l'enregistrement atomique, la
    visibilité simultanée pour le Senior désigné et l'autre Senior du même
    établissement, l'absence d'accès depuis un autre établissement, le
    verrouillage de l'historique et la suppression depuis `Mes données`. Après
    cette suppression, Supabase contenait zéro intervention et zéro demande
    d'évaluation synthétiques. Le nettoyage final a ramené exactement les comptes
    Auth, profils, interventions, évaluations et demandes à leurs compteurs
    initiaux, sans résidu synthétique. Les preuves figurent dans
    `docs/RAPPORT_SUPPRESSION_INTERVENTION_2026-07-20.md` et
    `docs/RAPPORT_RECETTE_PRODUCTION_2026-07-20.md`.
16. **Sauvegardes Supabase — mécanisme externe actif** : le projet Supabase
    principal utilise l'offre gratuite, qui ne fournit ni sauvegarde planifiée ni
    restauration vers un nouveau projet. Depuis le 20 juillet 2026, le mécanisme
    externe chiffré couvre PostgreSQL, Auth, les fichiers Storage et les migrations
    avec une rétention de trente jours. La destination iCloud a été explicitement
    autorisée, deux archives de production ont été créées et vérifiées, et l'agent
    quotidien est actif à 03 h 15. Un exercice d'effacement-restauration utilisant
    uniquement des données synthétiques a réussi deux fois sur le projet isolé,
    y compris la reconnexion avec le mot de passe d'origine et le contrôle du
    fichier Storage. Aucune donnée de production n'a été copiée dans ce projet de
    test. La clé reste protégée dans le Trousseau macOS et le propriétaire a
    confirmé le 20 juillet 2026 en avoir conservé une copie de récupération sur un
    support séparé du Mac et d'iCloud. Le blocage propre aux sauvegardes est donc
    levé. Toute migration de production reste néanmoins soumise à une demande
    explicite distincte, une simulation sans écriture et une validation finale.
17. **Fonctions restantes du Lot 7 — conformes sur le web commun** : le Senior
    peut exporter les données pédagogiques de tous les Internes actifs de son
    établissement, indépendamment des filtres d'affichage. Cet export exclut les
    e-mails, identifiants de connexion, bloc-notes et secrets. L'Administrateur
    dispose d'une vue historique en lecture seule des comptes désactivés. Le
    client a été construit, vérifié en préversion puis promu sans reconstruction
    le 27 juillet 2026. Le déploiement de production
    `dpl_HzB1EiBif83RiRJj3YnFHVZkqkLU` sert `https://monjournaldebloc.fr` et
    `https://www.monjournaldebloc.fr`.

## 16. Sujet futur non bloquant

- Les détails visuels de la future interface web pour ordinateur seront définis
  au moment de sa refonte. Ce point ne bloque pas l'activation des autres règles.
