# Changelog V12.0

## Ajouté
- Moteur central de rôles et permissions.
- Support complet de `role_code`.
- Hiérarchie V12 dans l’interface de gestion des comptes.
- Protection des comptes en attente d’affectation.
- Mapping Discord vers les rôles V12 pour les nouveaux comptes.

## Modifié
- Authentification classique et Discord.
- API utilisateurs.
- API journaux techniques.
- Paramètres bancaires.
- API clients, prêts, crédits, documents, notes et agenda.
- Affichage du rôle connecté dans l’interface.

## Sécurité
- Le site reste la source de vérité pour le rôle d’un compte Discord déjà lié.
- Les permissions ne reposent plus uniquement sur les anciennes chaînes `admin`, `directeur`, `co_directeur`, `employe`.
- Les rôles en lecture seule ne peuvent plus modifier les données métier.
