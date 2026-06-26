const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});

  if(req.method==='GET'){
    const { data, error } = await sb.from('pret_clients').select('*').order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data || []);
  }

  if(req.method==='POST'){
    const b = await readBody(req);
    const payload={ nom:String(b.nom||'').trim(), prenom:String(b.prenom||'').trim(), telegram:String(b.telegram||'').trim(), adresse:String(b.adresse||'').trim(), notes:String(b.notes||'').trim() };
    if(!payload.nom || !payload.prenom) return json(res,400,{error:'Nom et prénom requis'});
    const { data, error } = await sb.from('pret_clients').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'creation_client',{client_id:data.id,client:`${data.prenom} ${data.nom}`});
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const b=await readBody(req); if(!b.id) return json(res,400,{error:'ID manquant'});
    const patch={}; ['nom','prenom','telegram','adresse','notes','carte_identite_url'].forEach(k=>{ if(b[k]!==undefined) patch[k]=String(b[k]||'').trim(); });
    const { data, error } = await sb.from('pret_clients').update(patch).eq('id',b.id).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'modification_client',{client_id:data.id,client:`${data.prenom} ${data.nom}`,fields:Object.keys(patch)});
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req); if(!id) return json(res,400,{error:'ID manquant'});
    const { data:client } = await sb.from('pret_clients').select('*').eq('id',id).maybeSingle();
    const { error } = await sb.from('pret_clients').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_client',{client_id:id,client:client?`${client.prenom} ${client.nom}`:null});
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
