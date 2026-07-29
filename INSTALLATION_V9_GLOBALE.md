# Mise à jour V9 globale

Contenu : agenda 24 h/24, rendez-vous sans client, commande /absence creer, rôle automatique En attente d’affectation, connexion du site par Discord et contrôle de présence sur le serveur.

## Ordre obligatoire
1. Sauvegarder le site et le bot.
2. Exécuter database/discord_auth_v9.sql dans Supabase.
3. Copier le dossier du site, sans écraser .env.
4. Ajouter les variables Discord dans Vercel.
5. Dans Discord Developer Portal, ajouter le redirect OAuth2 et activer Server Members Intent.
6. Déployer le site avec npm install puis vercel --prod.
7. Copier le bot sur le VPS, sans écraser .env.
8. Lancer npm install, npm run deploy:commands si disponible, puis redémarrer PM2.

Redirect : https://registre-bancaire-reckless.vercel.app/api/discord_callback

Variables Vercel : DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_REDIRECT_URI.
