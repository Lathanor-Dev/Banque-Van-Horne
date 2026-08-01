const { timingSafeEqual } = require('node:crypto');
const { sb, json, handler } = require('./_lib');

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function authorized(req) {
  const expected = String(process.env.DISCORD_AGENDA_API_KEY || '').trim();
  return secureEquals(bearerToken(req), expected);
}

module.exports = (req, res) => handler(req, res, async () => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Méthode non autorisée' });
  }
  if (!process.env.DISCORD_AGENDA_API_KEY) {
    return json(res, 503, { error: 'Clé d’intégration Discord absente.' });
  }
  if (!authorized(req)) {
    return json(res, 401, { error: 'Clé Discord invalide.' });
  }

  const { data, error } = await sb
    .from('pret_users')
    .select('id,username,role_code,discord_id,discord_display_name,is_active,role_synced_at,role_sync_error')
    .not('discord_id', 'is', null)
    .order('username', { ascending: true });

  if (error) return json(res, 500, { error: error.message });

  return json(res, 200, {
    generated_at: new Date().toISOString(),
    users: data || []
  });
});
