const bcrypt = require('bcryptjs');
const { sb, json, readBody, currentUser, canManageUsers, canModifyTarget, allowedCreateRole, logAction, handler } = require('./_lib');

const SELECT='id,username,role,agency,agency_grade,is_active,protected,created_at';
const AGENCIES=['van_horn','saint_denis','rhodes'];
const GRADES=['directeur_agence','directeur_adjoint','responsable_clientele','conseiller_bancaire','caissier','secretaire_direction','stagiaire','attente_affectation'];
function safeAgency(v){return AGENCIES.includes(String(v||''))?String(v):'van_horn';}
function safeGrade(v){return GRADES.includes(String(v||''))?String(v):'conseiller_bancaire';}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(!canManageUsers(actor)) return json(res,403,{error:'Accès refusé'});

  if(req.method==='GET'){
    const { data, error } = await sb.from('pret_users').select(SELECT).order('created_at',{ascending:true});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data || []);
  }

  if(req.method==='POST'){
    const body = await readBody(req);
    const username = String(body.username||'').trim();
    const password = String(body.password||'');
    const role = String(body.role||'employe');
    const agency=safeAgency(body.agency);
    const agency_grade=safeGrade(body.agency_grade);
    if(!username || password.length < 10) return json(res,400,{error:'Nom requis et mot de passe min. 10 caractères'});
    if(!allowedCreateRole(actor, role)) return json(res,403,{error:'Vous ne pouvez pas créer ce rôle'});
    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await sb.from('pret_users').insert({ username, password_hash, role, agency, agency_grade, is_active:true, protected:false }).select(SELECT).single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'creation_utilisateur',{target:data.username,role:data.role});
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const body = await readBody(req);
    const { id } = body;
    const { data:target, error:errT } = await sb.from('pret_users').select('*').eq('id',id).maybeSingle();
    if(errT || !target) return json(res,404,{error:'Utilisateur introuvable'});
    if(!canModifyTarget(actor,target)) return json(res,403,{error:'Modification refusée'});

    const patch={};
    if(body.username) patch.username=String(body.username).trim();
    if(body.role){
      const newRole=String(body.role);
      if(target.protected) return json(res,403,{error:'Impossible de changer le rôle du compte administrateur protégé'});
      if(!allowedCreateRole(actor,newRole)) return json(res,403,{error:'Rôle refusé'});
      patch.role=newRole;
    }
    if(body.agency!==undefined) patch.agency=safeAgency(body.agency);
    if(body.agency_grade!==undefined) patch.agency_grade=safeGrade(body.agency_grade);
    if(body.password){
      if(String(body.password).length < 10) return json(res,400,{error:'Mot de passe min. 10 caractères'});
      patch.password_hash = await bcrypt.hash(String(body.password),12);
    }
    const { data, error } = await sb.from('pret_users').update(patch).eq('id',id).select(SELECT).single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'modification_utilisateur',{target:data.username,fields:Object.keys(patch)});
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(String(id)===String(actor.id)) return json(res,400,{error:'Impossible de supprimer votre propre compte'});
    const { data:target, error:errT } = await sb.from('pret_users').select('*').eq('id',id).maybeSingle();
    if(errT || !target) return json(res,404,{error:'Utilisateur introuvable'});
    if(target.protected || target.role==='admin') return json(res,403,{error:'Impossible de supprimer le compte administrateur'});
    if(!canModifyTarget(actor,target)) return json(res,403,{error:'Suppression refusée'});
    const { error } = await sb.from('pret_users').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_utilisateur',{target:target.username,role:target.role});
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
