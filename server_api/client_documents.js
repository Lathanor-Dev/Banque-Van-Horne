const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');
const BUCKET = 'client-documents';
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
function safeName(name){return String(name||'document').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);}
function safeClientId(v){const n=Number(v); return Number.isFinite(n)&&n>0?n:null;}
function extFromMime(mime){return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[mime] || 'bin';}
function validUrl(u){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol);}catch{return false;}}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET' && !hasPermission(actor,'bank.read')) return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET' && !hasPermission(actor,'bank.write')) return json(res,403,{error:'Modification refusée'});

  if(req.method==='GET'){
    const url = new URL(req.url, 'https://local');
    const client_id = safeClientId(url.searchParams.get('client_id'));
    if(!client_id) return json(res,400,{error:'client_id manquant ou invalide'});
    const { data, error } = await sb.from('pret_client_documents').select('*').eq('client_id',client_id).order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    const out=[];
    for(const d of data||[]){
      let signed_url = null;
      if(d.storage_path){
        const { data:signed } = await sb.storage.from(BUCKET).createSignedUrl(d.storage_path, 60*60);
        signed_url = signed?.signedUrl || null;
      }
      out.push({...d, signed_url, view_url:d.external_url || signed_url});
    }
    return json(res,200,out);
  }

  if(req.method==='POST'){
    const b = await readBody(req);
    const client_id = safeClientId(b.client_id);
    const doc_type = String(b.doc_type||'document').trim();
    if(!client_id) return json(res,400,{error:'client_id manquant ou invalide'});

    if(b.external_url){
      const external_url = String(b.external_url||'').trim();
      if(!validUrl(external_url)) return json(res,400,{error:'Lien invalide. Utilise un lien http ou https.'});
      const filename = safeName(b.filename || external_url.split('/').pop() || 'lien-document');
      const ins = await sb.from('pret_client_documents').insert({
        client_id, doc_type, filename, external_url, mime_type:'link/url', uploaded_by_username:actor.username
      }).select().single();
      if(ins.error) return json(res,500,{error:ins.error.message});
      await logAction(actor,'ajout_lien_document_client',{client_id, document_id:ins.data.id, filename, doc_type, external_url});
      return json(res,200,{...ins.data, view_url:external_url});
    }

    const filename = safeName(b.filename);
    const mime_type = String(b.mime_type||'application/octet-stream').trim();
    const content = String(b.content||'');
    if(!content) return json(res,400,{error:'Fichier ou lien manquant'});
    if(!ALLOWED.has(mime_type)) return json(res,400,{error:'Type de fichier refusé. Images JPG/PNG/WEBP ou PDF uniquement.'});
    const buffer = Buffer.from(content, 'base64');
    if(buffer.length > MAX_BYTES) return json(res,400,{error:'Fichier trop lourd. Maximum 6 Mo.'});
    const path = `${client_id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${filename || ('document.'+extFromMime(mime_type))}`;
    const up = await sb.storage.from(BUCKET).upload(path, buffer, { contentType:mime_type, upsert:false });
    if(up.error) return json(res,500,{error:up.error.message});
    const ins = await sb.from('pret_client_documents').insert({
      client_id, doc_type, filename, mime_type, storage_path:path,
      size_bytes: buffer.length, uploaded_by_username: actor.username
    }).select().single();
    if(ins.error) return json(res,500,{error:ins.error.message});
    await logAction(actor,'ajout_document_client',{client_id, document_id:ins.data.id, filename, doc_type});
    const { data:signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 60*60);
    return json(res,200,{...ins.data, signed_url:signed?.signedUrl||null, view_url:signed?.signedUrl||null});
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});
    const { data:doc, error:readErr } = await sb.from('pret_client_documents').select('*').eq('id',id).maybeSingle();
    if(readErr) return json(res,500,{error:readErr.message});
    if(!doc) return json(res,404,{error:'Document introuvable'});
    if(doc.storage_path) await sb.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await sb.from('pret_client_documents').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_document_client',{client_id:doc.client_id, document_id:id, filename:doc.filename});
    return json(res,200,{ok:true});
  }
  return json(res,405,{error:'Méthode non autorisée'});
});
