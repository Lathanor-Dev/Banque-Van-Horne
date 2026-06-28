# Sauvegarde automatique — Banque Van Horn

Ces deux fichiers ajoutent une sauvegarde quotidienne dans Google Drive :

- la base Supabase (rôles, schéma et données) ;
- les fichiers du bucket `client-documents` ;
- une archive du code source du site.

Le workflow est planifié à 04 h 17, heure de Bruxelles, et peut aussi être lancé à la main depuis l'onglet **Actions** de GitHub. Les sauvegardes sont rangées dans :

`Banque Van Horn - Sauvegardes/automatiques/`

Les fichiers plus anciens que 31 jours sont supprimés de ce sous-dossier. Le dossier parent reste intact.

## Secrets requis

- `RCLONE_CONFIG`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Ne place jamais ces valeurs dans un fichier du dépôt ni dans un message.

## Premier test

Après avoir ajouté les fichiers au dépôt :

1. Ouvrir l'onglet **Actions** de GitHub.
2. Ouvrir **Sauvegarde Banque Van Horn**.
3. Cliquer sur **Run workflow** puis confirmer.
4. Attendre la coche verte.
5. Vérifier qu'un sous-dossier daté est apparu dans Google Drive.

Un échec ne modifie pas le site Vercel : le workflow lit seulement Supabase et envoie des copies dans Drive.
