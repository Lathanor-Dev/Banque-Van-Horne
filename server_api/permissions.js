const ROLE_DEFINITIONS = Object.freeze({
  TECHNICIAN: {
    label: 'Technicien du Registre',
    level: 100,
    legacyRole: 'admin',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign',
      'users.read','users.write','users.delete','audit.read','settings.write','technical.manage'
    ]
  },
  DIRECTOR: {
    label: 'Directeur',
    level: 90,
    legacyRole: 'directeur',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign',
      'users.read','users.write','users.delete','audit.read','settings.write'
    ]
  },
  DEPUTY_DIRECTOR: {
    label: 'Directeur adjoint',
    level: 80,
    legacyRole: 'co_directeur',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign',
      'users.read','users.write','audit.read','settings.write'
    ]
  },
  EXECUTIVE_ASSISTANT: {
    label: 'Secrétaire / Assistante de direction',
    level: 70,
    legacyRole: 'co_directeur',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign',
      'users.read','users.write','audit.read','settings.write'
    ]
  },
  BANK_MANAGER: {
    label: 'Responsable bancaire',
    level: 60,
    legacyRole: 'co_directeur',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign',
      'users.read','users.write','audit.read'
    ]
  },
  BANKER: {
    label: 'Banquier',
    level: 50,
    legacyRole: 'employe',
    permissions: [
      'site.access','bank.read','bank.write','agenda.read','agenda.write','agenda.assign'
    ]
  },
  TRAINEE_BANKER: {
    label: 'Banquier en formation',
    level: 40,
    legacyRole: 'employe',
    permissions: [
      'site.access','bank.read','agenda.read','agenda.write','agenda.assign'
    ]
  },
  PARTNER: {
    label: 'Partenaire',
    level: 30,
    legacyRole: 'employe',
    permissions: ['site.access','bank.read','agenda.read']
  },
  UNAVAILABLE: {
    label: 'Indisponible',
    level: 20,
    legacyRole: 'employe',
    permissions: ['site.access','bank.read','agenda.read']
  },
  PENDING_ASSIGNMENT: {
    label: 'En attente d’affectation',
    level: 10,
    legacyRole: 'employe',
    permissions: []
  }
});

const LEGACY_TO_ROLE_CODE = Object.freeze({
  admin: 'TECHNICIAN',
  directeur: 'DIRECTOR',
  co_directeur: 'DEPUTY_DIRECTOR',
  employe: 'BANKER'
});

function roleCodeOf(userOrCode) {
  if (typeof userOrCode === 'string') {
    return ROLE_DEFINITIONS[userOrCode] ? userOrCode : (LEGACY_TO_ROLE_CODE[userOrCode] || 'PENDING_ASSIGNMENT');
  }
  const user = userOrCode || {};
  if (ROLE_DEFINITIONS[user.role_code]) return user.role_code;
  return LEGACY_TO_ROLE_CODE[user.role] || 'PENDING_ASSIGNMENT';
}

function roleDefinition(userOrCode) {
  return ROLE_DEFINITIONS[roleCodeOf(userOrCode)] || ROLE_DEFINITIONS.PENDING_ASSIGNMENT;
}

function hasPermission(user, permission) {
  return Boolean(user && roleDefinition(user).permissions.includes(permission));
}

function roleLevel(userOrCode) {
  return roleDefinition(userOrCode).level;
}

function legacyRoleForCode(code) {
  return roleDefinition(code).legacyRole;
}

function canManageUsers(user) {
  return hasPermission(user, 'users.write');
}

function canModifyTarget(actor, target) {
  if (!actor || !target || !hasPermission(actor, 'users.write')) return false;
  const actorCode = roleCodeOf(actor);
  const targetCode = roleCodeOf(target);

  if (target.protected && actorCode !== 'TECHNICIAN') return false;
  if (actorCode === 'TECHNICIAN') return targetCode !== 'TECHNICIAN' || String(actor.id) === String(target.id);
  if (String(actor.id) === String(target.id)) return true;

  return roleLevel(actorCode) > roleLevel(targetCode);
}

function allowedCreateRole(actor, requestedCode) {
  const code = roleCodeOf(requestedCode);
  if (!hasPermission(actor, 'users.write')) return false;
  if (code === 'TECHNICIAN') return roleCodeOf(actor) === 'TECHNICIAN';
  return roleLevel(actor) > roleLevel(code);
}

function assignableRoleCodes(actor) {
  return Object.keys(ROLE_DEFINITIONS).filter((code) => allowedCreateRole(actor, code));
}

module.exports = {
  ROLE_DEFINITIONS,
  LEGACY_TO_ROLE_CODE,
  roleCodeOf,
  roleDefinition,
  roleLevel,
  hasPermission,
  legacyRoleForCode,
  canManageUsers,
  canModifyTarget,
  allowedCreateRole,
  assignableRoleCodes
};
