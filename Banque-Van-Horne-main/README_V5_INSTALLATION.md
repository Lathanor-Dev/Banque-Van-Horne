# Banque Van Horn V5 — installation

## 1. Supabase
Dans Supabase → SQL Editor → New Query, exécuter :

```text
database/v5_banque_van_horn.sql
```

Ce script :
- corrige `pret_loans.client_id` en BIGINT/int8 ;
- recrée les tables documents et notes clients ;
- crée/actualise la table `pret_horse_credits` ;
- crée le bucket privé `client-documents` ;
- recharge le schéma PostgREST.

Attention : les tables `pret_client_documents` et `pret_client_notes` sont supprimées puis recréées.

## 2. Vercel
Vérifier dans Vercel → Settings → Environment Variables :

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
SESSION_SECRET
```

`SUPABASE_URL` ne doit pas se terminer par `/rest/v1`.
`SESSION_SECRET` doit faire au moins 32 caractères.

## 3. Déploiement
Dans CMD :

```cmd
cd C:\Users\admin\Desktop\banque-van-horne
git add .
git commit -m "Version V5 Banque Van Horn"
git push
```

Puis attendre le redéploiement Vercel et recharger avec Ctrl+F5.

## 4. Tests à faire
- Connexion avec `Admin_Banque`.
- Créer/modifier un client.
- Créer un prêt lié à un client.
- Valider/annuler une échéance.
- Ajouter une archive client par fichier.
- Ajouter une archive client par lien.
- Ajouter une note client.
- Créer un crédit hippique.
- Cliquer sur “Copier Discord” et coller dans Discord.
