# Modèles d’e-mails Supabase Auth

Ces fichiers sont la copie versionnée des modèles configurés dans le tableau de
bord Supabase du projet de production.

| Modèle Supabase | Sujet |
| --- | --- |
| Change email address | `{{ if eq .Data.emailTemplatePurpose "activation" }}Confirmez votre adresse e-mail – Mon Journal de Bloc{{ else }}Confirmez votre nouvelle adresse e-mail – Mon Journal de Bloc{{ end }}` |
| Reset password | `Réinitialisez votre mot de passe – Mon Journal de Bloc` |
| Password changed | `Votre mot de passe a été modifié – Mon Journal de Bloc` |
| Email address changed | `L’adresse e-mail de votre compte a été modifiée – Mon Journal de Bloc` |

Les notifications de sécurité `Password changed` et `Email address changed`
doivent être activées. Supabase adresse nativement la seconde à l’ancienne
adresse e-mail après la confirmation du changement. Le réglage `Secure Email
Change` reste désactivé afin que seule la nouvelle adresse confirme l’opération.
