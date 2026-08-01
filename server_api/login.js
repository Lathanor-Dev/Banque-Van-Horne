const { json, handler } = require('./_lib');

module.exports = (req, res) =>
  handler(req, res, async () => {
    return json(res, 410, {
      error: 'Connexion classique désactivée',
      code: 'DISCORD_LOGIN_REQUIRED',
      message:
        'La connexion par identifiant et mot de passe n’est plus disponible. Utilisez la connexion Discord.'
    });
  });
