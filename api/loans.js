const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');

function safeClientId(v){
  if(v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function safeEcheances(v){
  if(Array.isArray(v)) return v;
  if(typeof v === 'string') { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});

  if(req.method==='GET'){
    const { data, error } = await sb
      .from('pret_loans')
      .select('*')
      .order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,(data || []).map(l=>({...l,echeances:safeEcheances(l.echeances)})));
  }

  if(req.method==='POST'){
    const b=await readBody(req);
    if(!b.nom || !b.prenom || !b.somme || !b.taux || !b.echeances) return json(res,400,{error:'Données prêt incomplètes'});
    const payload={
      loan_id:b.loan_id,
      client_id:safeClientId(b.client_id),
      nom:String(b.nom||'').trim(),
      prenom:String(b.prenom||'').trim(),
      telegram:String(b.telegram||'').trim(),
      somme:Number(b.somme),
      taux:Number(b.taux),
      total_a_rembourser:Number(b.total_a_rembourser),
      garanties:String(b.garanties||'').trim(),
      echeances:safeEcheances(b.echeances),
      banquier_id:actor.id,
      banquier_username:actor.username,
      date_creation:b.date_creation || new Date().toISOString().split('T')[0]
    };
    const { data, error } = await sb.from('pret_loans').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'creation_pret',{loan_id:data.loan_id,client:`${data.prenom} ${data.nom}`,client_id:data.client_id,montant:data.somme,total:data.total_a_rembourser});
    return json(res,200,{...data,echeances:safeEcheances(data.echeances)});
  }

  if(req.method==='PUT'){
    const b=await readBody(req); if(!b.id) return json(res,400,{error:'ID manquant'});
    const { data:old } = await sb.from('pret_loans').select('*').eq('id',b.id).maybeSingle();
    if(!old) return json(res,404,{error:'Prêt introuvable'});
    const patch={};
    ['nom','prenom','telegram','garanties','total_a_rembourser','somme','taux'].forEach(k=>{ if(b[k]!==undefined) patch[k]=b[k]; });
    if(b.client_id !== undefined) patch.client_id = safeClientId(b.client_id);
    if(b.echeances !== undefined) patch.echeances = safeEcheances(b.echeances);
    const { data, error } = await sb.from('pret_loans').update(patch).eq('id',b.id).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'modification_pret',{loan_id:data.loan_id,fields:Object.keys(patch)});
    return json(res,200,{...data,echeances:safeEcheances(data.echeances)});
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req); if(!id) return json(res,400,{error:'ID manquant'});
    const { data:old } = await sb.from('pret_loans').select('*').eq('id',id).maybeSingle();
    if(!old) return json(res,404,{error:'Prêt introuvable'});
    const { error } = await sb.from('pret_loans').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_pret',{loan_id:old.loan_id,client:`${old.prenom} ${old.nom}`,montant:old.somme,total:old.total_a_rembourser});
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
