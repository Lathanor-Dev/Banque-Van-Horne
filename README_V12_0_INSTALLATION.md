# Registre bancaire de Reckless — V12.0

## Objet

Cette version installe la fondation officielle des rôles et permissions V12.

### Nouveautés

- utilisation prioritaire de `pret_users.role_code` ;
- maintien temporaire de l’ancien champ `role` pour compatibilité ;
- hiérarchie officielle centralisée côté API et interface ;
- Daphney peut utiliser `EXECUTIVE_ASSISTANT` avec un accès proche de la direction ;
- contrôles d’accès centralisés pour les comptes, journaux, paramètres, dossiers et agenda ;
- le site reste la source de vérité pour les comptes Discord déjà liés ;
- les nouveaux comptes Discord reçoivent un rôle V12 détecté, ou `PENDING_ASSIGNMENT` ;
- les comptes en attente ne peuvent pas accéder aux données du Registre ;
- nouvel écran « Utilisateurs et hiérarchie V12 ».

## Rôles officiels

1. `TECHNICIAN`
2. `DIRECTOR`
3. `DEPUTY_DIRECTOR`
4. `EXECUTIVE_ASSISTANT`
5. `BANK_MANAGER`
6. `BANKER`
7. `TRAINEE_BANKER`
8. `PARTNER`
9. `UNAVAILABLE`
10. `PENDING_ASSIGNMENT`

## Installation

1. Conserver une sauvegarde de la version actuellement déployée.
2. Exécuter si nécessaire :
   `database/v12_0_permissions_transition.sql`
3. Remplacer le projet par ce dossier.
4. Réinstaller les dépendances :
   `npm install`
5. Déployer sur Vercel.
6. Se déconnecter puis se reconnecter avec Discord afin de renouveler la session.

## Vérifications

- David doit apparaître comme Directeur.
- Benjamin comme Directeur adjoint.
- Daphney comme Secrétaire / Assistante de direction.
- Admin_Banque comme Technicien du Registre.
- Les autres comptes comme Banquier.
- La page Comptes doit afficher les nouveaux rôles.
- Un compte `PENDING_ASSIGNMENT` ne doit pas accéder au Registre.

## Compatibilité

L’ancien champ `role` continue d’être mis à jour par l’API pendant la transition. Cela évite de casser les fonctions encore dépendantes de l’ancien modèle.
