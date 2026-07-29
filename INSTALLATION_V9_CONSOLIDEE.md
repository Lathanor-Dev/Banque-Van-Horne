# Installation V9 consolidée

1. Vérifier les sauvegardes du site et du bot.
2. Dans Supabase > SQL Editor, exécuter `database/discord_auth_v9.sql`.
3. Copier le contenu du ZIP du site dans le dossier local, sans remplacer `.env.local`.
4. Vérifier dans Vercel : DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_REDIRECT_URI, DISCORD_AGENDA_API_KEY, SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY.
5. Dans Discord Developer Portal > OAuth2, ajouter exactement `https://registre-bancaire-reckless.vercel.app/api/discord_callback`.
6. Dans Discord Developer Portal > Bot, activer Server Members Intent et Message Content Intent.
7. Déployer le site : `npm install` puis `vercel --prod`.
8. Sur le VPS, conserver `.env` et `data/state.json`, puis remplacer les autres fichiers du bot.
9. Lancer : `npm install`, `npm run commands`, `npm run setup`, puis `pm2 restart banque-van-horn && pm2 save`.
10. Tester `/agenda creer`, `/absence creer`, l’arrivée d’un compte test et la connexion Discord au site.
