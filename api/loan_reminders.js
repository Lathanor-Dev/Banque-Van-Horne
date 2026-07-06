const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const METHODS = new Set(['telegram', 'courrier', 'en_personne', 'autre']);

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}
function safeIndex(value) {
  const index = Number.parseInt(value, 10);
  return Number.isInteger(index) && index >= 0 ? index : null;
}
function safeEcheances(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = (req, res) => handler(req, res, async () => {
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });

  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://local');
    const loanId = clean(url.searchParams.get('loan_id'), 120);

    let query = sb
      .from('pret_loan_reminders')
      .select('*')
      .order('reminder_date', { ascending: false })
      .order('reminder_time', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1500);

    if (loanId) query = query.eq('loan_id', loanId);

    const { data, error } = await query;
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data || []);
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const loanId = clean(body.loan_id, 120);
    const echeanceIndex = safeIndex(body.echeance_index);
    const reminderDate = clean(body.reminder_date, 10);
    const reminderTime = clean(body.reminder_time, 5);
    const method = METHODS.has(clean(body.reminder_method, 40))
      ? clean(body.reminder_method, 40)
      : 'telegram';

    if (!loanId) return json(res, 400, { error: 'Prêt manquant.' });
    if (echeanceIndex === null) return json(res, 400, { error: 'Échéance invalide.' });
    if (!DATE_RE.test(reminderDate)) return json(res, 400, { error: 'Date réelle du rappel invalide.' });
    if (reminderTime && !TIME_RE.test(reminderTime)) {
      return json(res, 400, { error: 'Heure du rappel invalide.' });
    }

    const { data: loan, error: loanError } = await sb
      .from('pret_loans')
      .select('id,loan_id,prenom,nom,echeances')
      .eq('id', loanId)
      .maybeSingle();

    if (loanError) return json(res, 500, { error: loanError.message });
    if (!loan) return json(res, 404, { error: 'Prêt introuvable.' });

    const echeances = safeEcheances(loan.echeances);
    if (!echeances[echeanceIndex]) {
      return json(res, 400, { error: 'Cette échéance n’existe pas pour ce prêt.' });
    }

    const payload = {
      loan_id: String(loan.id),
      loan_reference: clean(loan.loan_id, 120),
      client_name: clean(`${loan.prenom || ''} ${loan.nom || ''}`, 240),
      echeance_index: echeanceIndex,
      echeance_date: clean(body.echeance_date || echeances[echeanceIndex].date, 10) || null,
      reminder_date: reminderDate,
      reminder_time: reminderTime || null,
      reminder_method: method,
      note: clean(body.note, 2000),
      recorded_by_username: actor.username
    };

    const { data, error } = await sb
      .from('pret_loan_reminders')
      .insert(payload)
      .select()
      .single();

    if (error) return json(res, 500, { error: error.message });

    await logAction(actor, 'rappel_echeance_enregistre', {
      reminder_id: data.id,
      loan_id: loan.loan_id,
      client: `${loan.prenom || ''} ${loan.nom || ''}`.trim(),
      echeance: echeanceIndex + 1,
      date_reelle: reminderDate,
      heure_reelle: reminderTime || null,
      moyen: method
    });

    return json(res, 200, data);
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
});
