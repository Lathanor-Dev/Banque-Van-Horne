const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, handler } = require('./_lib');

const VALID_TYPES = new Set([
  'etude_pret',
  'signature',
  'remboursement',
  'immobilier',
  'consultation',
  'autre',
]);
const VALID_STATUSES = new Set(['prevu', 'confirme', 'termine', 'annule']);
const TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):(?:00|30)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function isAuthorized(req) {
  const expected = String(process.env.DISCORD_AGENDA_API_KEY || '').trim();
  return secureEquals(bearerToken(req), expected);
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function safeId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function isRealIsoDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function plusDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateEndDate(date, startTime, endTime) {
  return endTime <= startTime ? plusDays(date, 1) : date;
}

function normalizeSearch(value) {
  return cleanText(value, 80).toLocaleLowerCase('fr');
}

async function listClients(req, res) {
  const search = normalizeSearch(req.query?.q);
  const { data, error } = await sb
    .from('pret_clients')
    .select('id,prenom,nom,telegram,adresse')
    .order('nom', { ascending: true })
    .order('prenom', { ascending: true })
    .limit(250);

  if (error) return json(res, 500, { error: error.message });
  const clients = (data || []).filter((client) => {
    if (!search) return true;
    const haystack = `${client.prenom || ''} ${client.nom || ''} ${client.telegram || ''} ${client.adresse || ''}`
      .toLocaleLowerCase('fr');
    return haystack.includes(search);
  });
  return json(res, 200, clients.slice(0, 25));
}

async function listAppointments(req, res) {
  const responsable = cleanText(req.query?.responsable_username, 80);
  const from = cleanText(req.query?.from, 10);
  const to = cleanText(req.query?.to, 10);
  if (!responsable) return json(res, 400, { error: 'Responsable manquant.' });
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
    return json(res, 400, { error: 'Période invalide.' });
  }

  const { data, error } = await sb
    .from('pret_agenda_events')
    .select('*')
    .eq('responsable_username', responsable)
    .lte('appointment_date', to)
    .gte('end_date', from)
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, data || []);
}

async function createAppointment(req, res) {
  const body = await readBody(req);
  const clientId = safeId(body.client_id);
  const appointmentDate = cleanText(body.appointment_date, 10);
  const startTime = cleanText(body.start_time, 5);
  const endTime = cleanText(body.end_time, 5);
  const appointmentType = cleanText(body.appointment_type, 40);
  const title = cleanText(body.title, 100);
  const responsable = cleanText(body.responsable_username, 80);

  if (!isRealIsoDate(appointmentDate)) return json(res, 400, { error: 'Date invalide.' });
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return json(res, 400, { error: 'Les heures doivent être réglées sur des créneaux de 30 minutes.' });
  }
  if (!VALID_TYPES.has(appointmentType)) return json(res, 400, { error: 'Type de rendez-vous invalide.' });
  if (!title) return json(res, 400, { error: 'Titre manquant.' });
  if (!responsable) return json(res, 400, { error: 'Responsable manquant.' });

  let client = null;
  if (clientId) {
    const { data, error: clientError } = await sb.from('pret_clients').select('id,prenom,nom,telegram').eq('id', clientId).maybeSingle();
    if (clientError) return json(res, 500, { error: clientError.message });
    if (!data) return json(res, 404, { error: 'Client introuvable dans le Registre.' });
    client = data;
  }

  const discordDisplayName = cleanText(body.discord_display_name, 100);
  const payload = {
    client_id: client?.id || null,
    client_prenom: client ? cleanText(client.prenom, 100) : null,
    client_nom: client ? cleanText(client.nom, 100) : null,
    client_telegram: client ? (cleanText(client.telegram, 120) || null) : null,
    appointment_date: appointmentDate,
    start_time: startTime,
    end_date: isRealIsoDate(cleanText(body.end_date, 10)) ? cleanText(body.end_date, 10) : calculateEndDate(appointmentDate, startTime, endTime),
    end_time: endTime,
    appointment_type: appointmentType,
    title,
    location: cleanText(body.location, 120) || null,
    notes: cleanText(body.notes, 1000) || null,
    status: VALID_STATUSES.has(body.status) ? body.status : 'prevu',
    responsable_username: responsable,
    created_by_username: discordDisplayName ? `Discord · ${discordDisplayName}` : 'Discord',
    discord_user_id: cleanText(body.discord_user_id, 40) || null,
    discord_guild_id: cleanText(body.discord_guild_id, 40) || null,
    discord_channel_id: cleanText(body.discord_channel_id, 40) || null,
    discord_display_name: discordDisplayName || null,
    discord_last_action_by: discordDisplayName || null,
    discord_updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('pret_agenda_events')
    .insert(payload)
    .select()
    .single();
  if (error) return json(res, 500, { error: error.message });
  return json(res, 201, data);
}

async function updateAppointmentStatus(req, res) {
  const body = await readBody(req);
  const id = safeId(body.id);
  const status = cleanText(body.status, 20);
  const responsable = cleanText(body.responsable_username, 80);
  const isDirection = body.is_direction === true;

  if (!id) return json(res, 400, { error: 'Rendez-vous invalide.' });
  if (!VALID_STATUSES.has(status)) return json(res, 400, { error: 'Statut invalide.' });
  if (!responsable) return json(res, 400, { error: 'Responsable manquant.' });

  const { data: current, error: readError } = await sb
    .from('pret_agenda_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) return json(res, 500, { error: readError.message });
  if (!current) return json(res, 404, { error: 'Rendez-vous introuvable.' });
  if (!isDirection && String(current.responsable_username || '') !== responsable) {
    return json(res, 403, { error: 'Vous ne pouvez modifier que vos propres rendez-vous.' });
  }

  const actor = cleanText(body.discord_display_name, 100) || responsable;
  const { data, error } = await sb
    .from('pret_agenda_events')
    .update({
      status,
      discord_last_action_by: actor,
      discord_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, data);
}

module.exports = (req, res) => handler(req, res, async () => {
  if (!process.env.DISCORD_AGENDA_API_KEY) {
    return json(res, 503, { error: 'DISCORD_AGENDA_API_KEY n’est pas configurée sur Vercel.' });
  }
  if (!isAuthorized(req)) return json(res, 401, { error: 'Clé Discord invalide.' });

  if (req.method === 'GET') {
    const action = cleanText(req.query?.action, 20);
    if (action === 'clients') return listClients(req, res);
    if (action === 'list') return listAppointments(req, res);
    return json(res, 400, { error: 'Action GET inconnue.' });
  }
  if (req.method === 'POST') return createAppointment(req, res);
  if (req.method === 'PUT') return updateAppointmentStatus(req, res);
  return json(res, 405, { error: 'Méthode non autorisée.' });
});
