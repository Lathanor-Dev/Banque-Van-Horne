const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, handler } = require('./_lib');

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function authorized(req) {
  return secureEquals(bearerToken(req), process.env.DISCORD_AGENDA_API_KEY || '');
}
function text(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function norm(value) {
  return text(value, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function id(value) { const n=Number(value); return Number.isSafeInteger(n)&&n>0?n:null; }

async function findDuplicate({ telegram, clientId, prenom, nom, excludeId }) {
  if (clientId) {
    let q=sb.from('pret_telegram_contacts').select('*').eq('client_id',clientId);
    if(excludeId) q=q.neq('id',excludeId);
    const {data}=await q.maybeSingle(); if(data) return data;
  }
  const tn=norm(telegram);
  if(tn){ let q=sb.from('pret_telegram_contacts').select('*').eq('telegram_normalized',tn); if(excludeId)q=q.neq('id',excludeId); const {data}=await q.maybeSingle(); if(data)return data; }
  if(prenom&&nom){ let q=sb.from('pret_telegram_contacts').select('*').ilike('prenom',text(prenom)).ilike('nom',text(nom)); if(excludeId)q=q.neq('id',excludeId); const {data}=await q.limit(1); if(data?.[0])return data[0]; }
  return null;
}

async function list(req,res){
  const search=text(req.query?.q,100).toLowerCase();
  const {data,error}=await sb.from('pret_telegram_contacts').select('*').order('nom').order('prenom').limit(500);
  if(error)return json(res,500,{error:error.message});
  const rows=(data||[]).filter(c=>!search||`${c.prenom} ${c.nom} ${c.telegram} ${c.fonction}`.toLowerCase().includes(search));
  return json(res,200,rows.slice(0,100));
}
async function create(req,res){
  const b=await readBody(req); const clientId=id(b.client_id);
  let client=null;
  if(clientId){ const r=await sb.from('pret_clients').select('id,prenom,nom,telegram,profession').eq('id',clientId).maybeSingle(); if(r.error)return json(res,500,{error:r.error.message}); client=r.data; if(!client)return json(res,404,{error:'Client introuvable.'}); }
  const payload={client_id:client?.id||null,prenom:text(b.prenom||client?.prenom),nom:text(b.nom||client?.nom),telegram:text(b.telegram||client?.telegram),telegram_normalized:norm(b.telegram||client?.telegram),fonction:text(b.fonction||client?.profession||'Client'),agence:text(b.agence)||null,source:client?'client':'manuel',created_by:text(b.actor),updated_by:text(b.actor)};
  if(!payload.prenom||!payload.nom)return json(res,400,{error:'Nom et prénom requis.'});
  const dup=await findDuplicate({telegram:payload.telegram,clientId:payload.client_id,prenom:payload.prenom,nom:payload.nom});
  if(dup)return json(res,409,{error:'Ce contact existe déjà.',duplicate:dup});
  const {data,error}=await sb.from('pret_telegram_contacts').insert(payload).select().single(); if(error)return json(res,500,{error:error.message}); return json(res,201,data);
}
async function update(req,res){
  const b=await readBody(req); const contactId=id(b.id); if(!contactId)return json(res,400,{error:'Contact invalide.'});
  const {data:current,error:re}=await sb.from('pret_telegram_contacts').select('*').eq('id',contactId).maybeSingle(); if(re)return json(res,500,{error:re.message}); if(!current)return json(res,404,{error:'Contact introuvable.'});
  const patch={}; for(const k of ['prenom','nom','telegram','fonction','agence','discord_message_id']) if(b[k]!==undefined)patch[k]=text(b[k]);
  if(b.telegram!==undefined)patch.telegram_normalized=norm(b.telegram); patch.updated_by=text(b.actor); patch.updated_at=new Date().toISOString();
  const prospective={...current,...patch}; const dup=await findDuplicate({telegram:prospective.telegram,clientId:current.client_id,prenom:prospective.prenom,nom:prospective.nom,excludeId:contactId}); if(dup)return json(res,409,{error:'Une autre fiche utilise déjà ces informations.',duplicate:dup});
  const {data,error}=await sb.from('pret_telegram_contacts').update(patch).eq('id',contactId).select().single(); if(error)return json(res,500,{error:error.message}); return json(res,200,data);
}
async function remove(req,res){ const b=await readBody(req); const contactId=id(b.id); if(!contactId)return json(res,400,{error:'Contact invalide.'}); const {data,error}=await sb.from('pret_telegram_contacts').delete().eq('id',contactId).select().maybeSingle(); if(error)return json(res,500,{error:error.message}); return json(res,200,{ok:true,contact:data}); }
async function syncClients(req,res){
  const b=await readBody(req); const {data:clients,error}=await sb.from('pret_clients').select('id,prenom,nom,telegram,profession').order('id'); if(error)return json(res,500,{error:error.message});
  let created=0,updated=0,skipped=0;
  for(const c of clients||[]){
    const {data:existing}=await sb.from('pret_telegram_contacts').select('*').eq('client_id',c.id).maybeSingle();
    const payload={client_id:c.id,prenom:text(c.prenom),nom:text(c.nom),telegram:text(c.telegram),telegram_normalized:norm(c.telegram),fonction:text(c.profession||'Client'),source:'client',updated_by:text(b.actor),updated_at:new Date().toISOString()};
    if(existing){ const {error:e}=await sb.from('pret_telegram_contacts').update(payload).eq('id',existing.id); e?skipped++:updated++; }
    else { const dup=await findDuplicate({telegram:payload.telegram,clientId:c.id,prenom:payload.prenom,nom:payload.nom}); if(dup){skipped++;continue;} const {error:e}=await sb.from('pret_telegram_contacts').insert({...payload,created_by:text(b.actor)}); e?skipped++:created++; }
  }
  return json(res,200,{ok:true,created,updated,skipped,total:(clients||[]).length});
}
module.exports=(req,res)=>handler(req,res,async()=>{
  if(!process.env.DISCORD_AGENDA_API_KEY)return json(res,503,{error:'Clé API Discord absente.'});
  if(!authorized(req))return json(res,401,{error:'Clé Discord invalide.'});
  if(req.method==='GET')return list(req,res);
  if(req.method==='POST' && text(req.query?.action,30)==='sync_clients')return syncClients(req,res);
  if(req.method==='POST')return create(req,res);
  if(req.method==='PUT')return update(req,res);
  if(req.method==='DELETE')return remove(req,res);
  return json(res,405,{error:'Méthode non autorisée.'});
});
