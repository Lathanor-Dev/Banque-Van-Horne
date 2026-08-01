const {
  sb,
  json,
  createToken,
  setSessionCookie,
  logAction,
  roleCodeOf,
  legacyRoleForCode,
  handler
} = require('./_lib');

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const index = value.indexOf('=');
        return [
          decodeURIComponent(value.slice(0, index)),
          decodeURIComponent(value.slice(index + 1))
        ];
      })
  );
}

async function discordJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Erreur Discord');
  }

  return data;
}

function normalizeNames(names) {
  return names.map((name) =>
    String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );
}

function mapRoleCode(names) {
  const normalized = normalizeNames(names);

  const mappings = [
    [['technicien'], 'TECHNICIAN'],
    [['directeur adjoint', 'direction adjointe'], 'DEPUTY_DIRECTOR'],
    [['secretaire', 'assistante de direction'], 'EXECUTIVE_ASSISTANT'],
    [['responsable bancaire', 'responsable'], 'BANK_MANAGER'],
    [['banquier en formation', 'stagiaire', 'formation'], 'TRAINEE_BANKER'],
    [['directeur', 'direction'], 'DIRECTOR'],
    [['banquier'], 'BANKER'],
    [['partenaire'], 'PARTNER'],
    [['indisponible'], 'UNAVAILABLE'],
    [['attente d affectation', 'en attente'], 'PENDING_ASSIGNMENT']
  ];

  for (const [needles, code] of mappings) {
    if (
      normalized.some((name) =>
        needles.some((needle) => name.includes(needle))
      )
    ) {
      return code;
    }
  }

  return 'PENDING_ASSIGNMENT';
}

function gradeForRoleCode(roleCode) {
  return {
    DIRECTOR: 'directeur_agence',
    DEPUTY_DIRECTOR: 'directeur_adjoint',
    EXECUTIVE_ASSISTANT: 'secretaire_direction',
    BANK_MANAGER: 'responsable_clientele',
    BANKER: 'conseiller_bancaire',
    TRAINEE_BANKER: 'stagiaire',
    PARTNER: 'attente_affectation',
    UNAVAILABLE: 'attente_affectation',
    PENDING_ASSIGNMENT: 'attente_affectation',
    TECHNICIAN: 'attente_affectation'
  }[roleCode] || 'attente_affectation';
}

module.exports = (req, res) =>
  handler(req, res, async () => {
    const { code, state } = req.query || {};

    if (
      !code ||
      !state ||
      cookies(req).discord_oauth_state !== state
    ) {
      return json(res, 400, {
        error: 'Session Discord invalide ou expirée'
      });
    }

    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI
    });

    const token = await discordJson(
      'https://discord.com/api/v10/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      }
    );

    const user = await discordJson(
      'https://discord.com/api/v10/users/@me',
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`
        }
      }
    );

    const guilds = await discordJson(
      'https://discord.com/api/v10/users/@me/guilds',
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`
        }
      }
    );

    if (
      !guilds.some(
        (guild) =>
          String(guild.id) === String(process.env.DISCORD_GUILD_ID)
      )
    ) {
      res.statusCode = 302;
      res.setHeader('Location', '/?discord=not_member');
      return res.end();
    }

    const authorization = {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
    };

    const member = await discordJson(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,
      { headers: authorization }
    );

    const roles = await discordJson(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/roles`,
      { headers: authorization }
    );

    const roleNames = roles
      .filter((role) => member.roles.includes(role.id))
      .map((role) => role.name);

    const detectedRoleCode = mapRoleCode(roleNames);

    let { data: existing } = await sb
      .from('pret_users')
      .select('*')
      .eq('discord_id', user.id)
      .maybeSingle();

    const displayName =
      member.nick ||
      user.global_name ||
      user.username;

    if (!existing) {
      const roleCode = detectedRoleCode;
      const output = await sb
        .from('pret_users')
        .insert({
          username: displayName.slice(0, 80),
          discord_id: user.id,
          discord_username: user.username,
          discord_display_name: displayName,
          discord_roles: roleNames,
          discord_last_sync: new Date().toISOString(),
          role_code: roleCode,
          role: legacyRoleForCode(roleCode),
          agency_grade: gradeForRoleCode(roleCode),
          role_synced_at: new Date().toISOString(),
          role_sync_error: null,
          is_active: true
        })
        .select()
        .single();

      if (output.error) throw output.error;
      existing = output.data;
    } else {
      // Le site reste la source de vérité pour un compte déjà lié.
      const currentRoleCode = roleCodeOf(existing);
      const output = await sb
        .from('pret_users')
        .update({
          discord_username: user.username,
          discord_display_name: displayName,
          discord_roles: roleNames,
          discord_last_sync: new Date().toISOString(),
          role_code: currentRoleCode,
          role: legacyRoleForCode(currentRoleCode),
          is_active: true
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (output.error) throw output.error;
      existing = output.data;
    }

    const safe = {
      id: existing.id,
      username: existing.username,
      role: existing.role,
      role_code: roleCodeOf(existing),
      protected: existing.protected,
      agency: existing.agency,
      agency_grade: existing.agency_grade
    };

    setSessionCookie(res, createToken(safe));

    await logAction(safe, 'connexion_discord', {
      discord_id: user.id,
      discord_roles: roleNames,
      detected_role_code: detectedRoleCode,
      effective_role_code: safe.role_code
    });

    res.statusCode = 302;
    res.setHeader(
      'Location',
      safe.role_code === 'PENDING_ASSIGNMENT'
        ? '/?discord=waiting'
        : '/?discord=ok'
    );
    res.end();
  });
