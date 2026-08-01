const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');
module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET' && !hasPermission(actor,'bank.read')) return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET' && !hasPermission(actor,'bank.write')) return json(res,403,{error:'Modification refusée'});
  if(req.method==='GET'){
    const url = new URL(req.url, 'https://local');
    const client_id = String(url.searchParams.get('client_id')||'').trim();
    if(!client_id) return json(res,400,{error:'client_id manquant'});
    const { data, error } = await sb.from('pret_client_notes').select('*').eq('client_id',client_id).order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data||[]);
  }
  if(req.method==='POST'){
    const b = await readBody(req);
    const client_id = String(b.client_id||'').trim();
    const note = String(b.note||'').trim();
    if(!client_id) return json(res,400,{error:'client_id manquant'});
    if(note.length < 2) return json(res,400,{error:'Note vide ou trop courte.'});
    const { data, error } = await sb.from('pret_client_notes').insert({client_id,note,created_by_username:actor.username}).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'ajout_note_client',{client_id,note_id:data.id});
    return json(res,200,data);
  }
  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});
    const { data:note, error:readErr } = await sb.from('pret_client_notes').select('*').eq('id',id).maybeSingle();
    if(readErr) return json(res,500,{error:readErr.message});
    if(!note) return json(res,404,{error:'Note introuvable'});
    const { error } = await sb.from('pret_client_notes').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_note_client',{client_id:note.client_id,note_id:id});
    return json(res,200,{ok:true});
  }
  return json(res,405,{error:'Méthode non autorisée'});
});
