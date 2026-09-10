# Modèles d’e-mails Supabase Auth

Ces fichiers sont la copie versionnée des modèles configurés dans le tableau de
bord Supabase du projet de production.

| Modèle Supabase | Sujet |
| --- | --- |
| Change email address | `Confirmez votre adresse e-mail – Mon Journal de Bloc` |
| Reset password | `Réinitialisez votre mot de passe – Mon Journal de Bloc` |
| Password changed | `Votre mot de passe a été modifié – Mon Journal de Bloc` |
| Email address changed | `L’adresse e-mail de votre compte a été modifiée – Mon Journal de Bloc` |

Les notifications de sécurité `Password changed` et `Email address changed`
doivent être activées. Supabase adresse nativement la seconde à l’ancienne
adresse e-mail après la confirmation du changement. Le réglage `Secure Email
Change` reste désactivé afin que seule la nouvelle adresse confirme l’opération.

Lors de la première connexion, l’utilisateur enregistre son adresse et son mot
de passe personnel, puis reste déconnecté. Le compte et son espace deviennent
accessibles uniquement après l’ouverture du lien de confirmation envoyé à cette
adresse.

Après toute modification de ces fichiers, reporter le même contenu dans les
modèles Auth du tableau de bord Supabase de production avant le déploiement.
