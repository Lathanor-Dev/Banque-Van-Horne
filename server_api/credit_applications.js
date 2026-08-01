const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');

const TYPES = new Set(['consommation','hypothecaire']);
const STATUSES = new Set(['brouillon','en_attente','validee','refusee','transformee']);

function safeClientId(value){
  if(value===undefined || value===null || value==='') return null;
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? n : null;
}
function safeNumber(value){
  const n=Number(value);
  return Number.isFinite(n) ? n : 0;
}
function text(value){
  return String(value ?? '').trim();
}
function object(value){
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}
function normalize(body, actor, existing={}){
  const application_type=TYPES.has(body.application_type)?body.application_type:(existing.application_type||'consommation');
  const statut=STATUSES.has(body.statut)?body.statut:(existing.statut||'brouillon');
  const dossier_id=text(body.dossier_id || existing.dossier_id) || `CRD-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  return {
    dossier_id,
    application_type,
    statut,
    client_id:safeClientId(body.client_id),
    client_nom:text(body.client_nom),
    client_prenom:text(body.client_prenom),
    telegram:text(body.telegram),
    montant_demande:safeNumber(body.montant_demande),
    taux:safeNumber(body.taux),
    nb_echeances:Math.max(0,Math.trunc(safeNumber(body.nb_echeances))),
    loan_id:text(body.loan_id),
    details:object(body.details),
    discord_text:text(body.discord_text),
    created_by_username:actor.username,
    updated_by_username:actor.username,
    updated_at:new Date().toISOString()
  };
}

module.exports=(req,res)=>handler(req,res,async()=>{
  const actor=await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET' && !hasPermission(actor,'bank.read')) return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET' && !hasPermission(actor,'bank.write')) return json(res,403,{error:'Modification refusée'});

  if(req.method==='GET'){
    const {data,error}=await sb
      .from('pret_credit_applications')
      .select('*')
      .order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data||[]);
  }

  if(req.method==='POST'){
    const body=await readBody(req);
    const payload=normalize(body,actor);
    if(!payload.client_nom || !payload.client_prenom) return json(res,400,{error:'Prénom et nom du demandeur requis'});
    if(!payload.montant_demande || !payload.nb_echeances) return json(res,400,{error:'Montant demandé et nombre d’échéances requis'});

    const {data,error}=await sb.from('pret_credit_applications').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'creation_demande_credit',{
      dossier_id:data.dossier_id,
      type:data.application_type,
      client:`${data.client_prenom} ${data.client_nom}`,
      montant:data.montant_demande
    });
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const body=await readBody(req);
    if(!body.id) return json(res,400,{error:'ID manquant'});

    const {data:old,error:readError}=await sb.from('pret_credit_applications').select('*').eq('id',body.id).maybeSingle();
    if(readError) return json(res,500,{error:readError.message});
    if(!old) return json(res,404,{error:'Demande introuvable'});

    const payload=normalize(body,actor,old);
    delete payload.created_by_username;

    const {data,error}=await sb
      .from('pret_credit_applications')
      .update(payload)
      .eq('id',body.id)
      .select()
      .single();

    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'modification_demande_credit',{
      dossier_id:data.dossier_id,
      statut:data.statut
    });
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    const {id}=await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});

    const {data:old,error:readError}=await sb.from('pret_credit_applications').select('*').eq('id',id).maybeSingle();
    if(readError) return json(res,500,{error:readError.message});
    if(!old) return json(res,404,{error:'Demande introuvable'});

    const {error}=await sb.from('pret_credit_applications').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'suppression_demande_credit',{
      dossier_id:old.dossier_id,
      client:`${old.client_prenom} ${old.client_nom}`
    });
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
