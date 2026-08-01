const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');

const TEXT_FIELDS = [
  'nom','prenom','telegram','adresse','notes','carte_identite_url',
  'civilite','date_naissance','nationalite','statut_residentiel','details_dettes',
  'statut_emploi','statut_emploi_autre','date_embauche','entreprise',
  'chef_entreprise','telegram_chef','profession','salaire_hebdomadaire'
];

function text(value){
  return String(value ?? '').trim();
}
function payloadFrom(body){
  const payload={};
  for(const key of TEXT_FIELDS){
    if(body[key] !== undefined) payload[key]=text(body[key]);
  }
  if(body.a_autres_dettes !== undefined) payload.a_autres_dettes=!!body.a_autres_dettes;
  return payload;
}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET' && !hasPermission(actor,'bank.read')) return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET' && !hasPermission(actor,'bank.write')) return json(res,403,{error:'Modification refusée'});

  if(req.method==='GET'){
    const { data, error } = await sb
      .from('pret_clients')
      .select('*')
      .order('created_at',{ascending:false});

    if(error) return json(res,500,{error:error.message});
    return json(res,200,data || []);
  }

  if(req.method==='POST'){
    const body = await readBody(req);
    const payload=payloadFrom(body);
    if(!payload.nom || !payload.prenom) return json(res,400,{error:'Nom et prénom requis'});

    const { data, error } = await sb.from('pret_clients').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'creation_client',{
      client_id:data.id,
      client:`${data.prenom} ${data.nom}`
    });
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const body=await readBody(req);
    if(!body.id) return json(res,400,{error:'ID manquant'});

    const patch=payloadFrom(body);
    if(Object.keys(patch).length===0) return json(res,400,{error:'Aucune information à modifier'});

    const { data, error } = await sb
      .from('pret_clients')
      .update(patch)
      .eq('id',body.id)
      .select()
      .single();

    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'modification_client',{
      client_id:data.id,
      client:`${data.prenom} ${data.nom}`,
      fields:Object.keys(patch)
    });
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});

    const { data:client } = await sb.from('pret_clients').select('*').eq('id',id).maybeSingle();
    const { error } = await sb.from('pret_clients').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'suppression_client',{
      client_id:id,
      client:client?`${client.prenom} ${client.nom}`:null
    });
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
