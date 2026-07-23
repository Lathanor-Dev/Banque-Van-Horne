# Banque Van Horne — version sécurisée

## Installation

1. Décompresse le projet.
2. Pousse le dossier `banque-van-horne` sur GitHub.
3. Dans Vercel, ajoute ces variables d'environnement :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` : clé service_role Supabase, jamais côté navigateur
   - `SESSION_SECRET` : chaîne aléatoire de 32 caractères minimum
4. Dans Supabase SQL Editor, exécute `database/schema_secure.sql`.
5. Installe localement les dépendances si besoin : `npm install`.
6. Génère un hash admin :
   ```bash
   node scripts/hash_password.js "MotDePasseTrèsFort"
   ```
7. Dans Supabase SQL Editor, colle le hash généré dans la requête indiquée en bas de `database/schema_secure.sql`.
8. Déploie sur Vercel.

## Sécurité

- Les mots de passe sont hashés côté serveur avec bcrypt.
- La session est stockée dans un cookie HttpOnly.
- Les rôles sont vérifiés côté API.
- Les tables Supabase ont RLS activé et refusent l'accès anonyme.
- La clé service_role doit rester uniquement dans Vercel Environment Variables.
- Le compte admin protégé ne peut pas être supprimé par les autres rôles.

## Rôles

- `admin` : tout gérer.
- `directeur` : gérer co-directeurs/employés, prêts, clients, logs.
- `co_directeur` : gérer employés, prêts, clients, logs.
- `employe` : gérer ses prêts et clients.

## Fonctionnalités

- Gestion clients.
- Gestion prêts avec échéances hebdomadaires fixes.
- Première échéance à J+7.
- Validation/annulation de paiements.
- Modification et suppression complète de prêts.
- Logs serveur pour les actions importantes.
