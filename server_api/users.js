const bcrypt = require('bcryptjs');
const {
  sb,
  json,
  readBody,
  currentUser,
  canManageUsers,
  canModifyTarget,
  allowedCreateRole,
  assignableRoleCodes,
  legacyRoleForCode,
  roleCodeOf,
  logAction,
  handler
} = require('./_lib');

const SELECT = [
  'id',
  'username',
  'role',
  'role_code',
  'agency',
  'agency_grade',
  'is_active',
  'protected',
  'discord_id',
  'discord_display_name',
  'created_at'
].join(',');

const AGENCIES = ['van_horn', 'saint_denis', 'rhodes', 'valentine'];
const GRADES = [
  'directeur_agence',
  'directeur_adjoint',
  'responsable_clientele',
  'conseiller_bancaire',
  'caissier',
  'secretaire_direction',
  'stagiaire',
  'attente_affectation'
];

function safeAgency(value) {
  return AGENCIES.includes(String(value || '')) ? String(value) : 'van_horn';
}

function safeGrade(value) {
  return GRADES.includes(String(value || ''))
    ? String(value)
    : 'conseiller_bancaire';
}

module.exports = (req, res) =>
  handler(req, res, async () => {
    const actor = await currentUser(req);

    if (!actor) return json(res, 401, { error: 'Non connecté' });
    if (!canManageUsers(actor)) {
      return json(res, 403, { error: 'Accès refusé' });
    }

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('pret_users')
        .select(SELECT)
        .order('created_at', { ascending: true });

      if (error) return json(res, 500, { error: error.message });

      return json(res, 200, {
        users: data || [],
        assignable_role_codes: assignableRoleCodes(actor)
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const role_code = roleCodeOf(
        String(body.role_code || body.role || 'BANKER')
      );
      const role = legacyRoleForCode(role_code);
      const agency = safeAgency(body.agency);
      const agency_grade = safeGrade(body.agency_grade);

      if (!username) {
        return json(res, 400, {
          error: 'Nom requis'
        });
      }

      if (!allowedCreateRole(actor, role_code)) {
        return json(res, 403, {
          error: 'Vous ne pouvez pas créer ce rôle'
        });
      }

      // Le mot de passe technique est aléatoire et n’est jamais communiqué.
      // L’utilisateur doit lier son compte et se connecter avec Discord.
      const password_hash = await bcrypt.hash(
        require('crypto').randomBytes(48).toString('hex'),
        12
      );

      const { data, error } = await sb
        .from('pret_users')
        .insert({
          username,
          password_hash,
          role,
          role_code,
          agency,
          agency_grade,
          is_active: true,
          protected: false,
          role_synced_at: new Date().toISOString(),
          role_sync_error: null
        })
        .select(SELECT)
        .single();

      if (error) return json(res, 500, { error: error.message });

      await logAction(actor, 'creation_utilisateur', {
        target: data.username,
        role_code: data.role_code
      });

      return json(res, 200, data);
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const { id } = body;

      const { data: target, error: targetError } = await sb
        .from('pret_users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (targetError || !target) {
        return json(res, 404, { error: 'Utilisateur introuvable' });
      }

      if (!canModifyTarget(actor, target)) {
        return json(res, 403, { error: 'Modification refusée' });
      }

      const patch = {};

      if (body.username) {
        patch.username = String(body.username).trim();
      }

      if (body.role_code || body.role) {
        const newRoleCode = roleCodeOf(
          String(body.role_code || body.role)
        );

        if (
          target.protected &&
          roleCodeOf(actor) !== 'TECHNICIAN'
        ) {
          return json(res, 403, {
            error: 'Impossible de changer le rôle du compte protégé'
          });
        }

        if (!allowedCreateRole(actor, newRoleCode)) {
          return json(res, 403, { error: 'Rôle refusé' });
        }

        patch.role_code = newRoleCode;
        patch.role = legacyRoleForCode(newRoleCode);
        patch.role_synced_at = new Date().toISOString();
        patch.role_sync_error = null;
      }

      if (body.agency !== undefined) {
        patch.agency = safeAgency(body.agency);
      }

      if (body.agency_grade !== undefined) {
        patch.agency_grade = safeGrade(body.agency_grade);
      }

      if (body.password) {
        if (String(body.password).length < 10) {
          return json(res, 400, {
            error: 'Mot de passe min. 10 caractères'
          });
        }

        patch.password_hash = await bcrypt.hash(
          String(body.password),
          12
        );
      }

      const { data, error } = await sb
        .from('pret_users')
        .update(patch)
        .eq('id', id)
        .select(SELECT)
        .single();

      if (error) return json(res, 500, { error: error.message });

      await logAction(actor, 'modification_utilisateur', {
        target: data.username,
        fields: Object.keys(patch),
        role_code: data.role_code
      });

      return json(res, 200, data);
    }

    if (req.method === 'DELETE') {
      const { id } = await readBody(req);

      if (String(id) === String(actor.id)) {
        return json(res, 400, {
          error: 'Impossible de supprimer votre propre compte'
        });
      }

      const { data: target, error: targetError } = await sb
        .from('pret_users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (targetError || !target) {
        return json(res, 404, { error: 'Utilisateur introuvable' });
      }

      if (target.protected || roleCodeOf(target) === 'TECHNICIAN') {
        return json(res, 403, {
          error: 'Impossible de supprimer le compte protégé'
        });
      }

      if (!canModifyTarget(actor, target)) {
        return json(res, 403, { error: 'Suppression refusée' });
      }

      const { error } = await sb
        .from('pret_users')
        .delete()
        .eq('id', id);

      if (error) return json(res, 500, { error: error.message });

      await logAction(actor, 'suppression_utilisateur', {
        target: target.username,
        role_code: roleCodeOf(target)
      });

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Méthode non autorisée' });
  });
