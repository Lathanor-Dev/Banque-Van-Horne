const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');
function safeClientId(v){const n=Number(v); return Number.isFinite(n)&&n>0?n:null;}
function normalize(b, actor){
  const coupons_count = Math.max(1, Number.parseInt(b.coupons_count || 1, 10));
  const montant_total = 25 * coupons_count;
  const date = new Date().toISOString().slice(0,10).replaceAll('-','');
  const dossier_id = b.dossier_id || `HIP-${date}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  return {
    dossier_id,
    client_id:safeClientId(b.client_id),
    client_nom:String(b.client_nom||'').trim(),
    client_prenom:String(b.client_prenom||'').trim(),
    telegram:String(b.telegram||'').trim(),
    adresse:String(b.adresse||'').trim(),
    profession:String(b.profession||'').trim(),
    date_du_jour:String(b.date_du_jour||'').trim(),
    identite_presentee:!!b.identite_presentee,
    photographie_ajoutee:!!b.photographie_ajoutee,
    piece_identite_url:String(b.piece_identite_url||'').trim(),
    photographie_url:String(b.photographie_url||'').trim(),
    coupons_count,
    montant_total,
    taux:Number(b.taux||0),
    date_course:String(b.date_course||'').trim(),
    cheval_ecurie:String(b.cheval_ecurie||'').trim(),
    type_pari:String(b.type_pari||'').trim(),
    type_pari_autre:String(b.type_pari_autre||'').trim(),
    bookmaker:String(b.bookmaker||'').trim(),
    numeros_coupons:Array.isArray(b.numeros_coupons)?b.numeros_coupons.filter(Boolean):[],
    coupons_enregistres:!!b.coupons_enregistres,
    numeros_verifies:!!b.numeros_verifies,
    revenus_mensuels:String(b.revenus_mensuels||'').trim(),
    patrimoine:String(b.patrimoine||'').trim(),
    garanties:String(b.garanties||'').trim(),
    recommande:!!b.recommande,
    referent:String(b.referent||'').trim(),
    recommandations:String(b.recommandations||'').trim(),
    acceptations:b.acceptations && typeof b.acceptations === 'object' ? b.acceptations : {},
    discord_text:String(b.discord_text||'').trim(),
    statut:String(b.statut||'en_cours').trim(),
    created_by_username:actor.username
  };
}
module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});
  if(req.method==='GET'){
    const { data, error } = await sb.from('pret_horse_credits').select('*').order('created_at',{ascending:false});
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data||[]);
  }
  if(req.method==='POST'){
    const b=await readBody(req);
    const payload=normalize(b, actor);
    if(!payload.telegram) return json(res,400,{error:'Télégramme requis'});
    const { data, error } = await sb.from('pret_horse_credits').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'creation_credit_hippique',{dossier_id:data.dossier_id,client:`${data.client_prenom} ${data.client_nom}`,montant:data.montant_total});
    return json(res,200,data);
  }
  if(req.method==='PUT'){
    const b=await readBody(req);
    if(!b.id) return json(res,400,{error:'ID manquant'});
    const payload=normalize(b, actor);
    delete payload.created_by_username;
    const { data, error } = await sb.from('pret_horse_credits').update(payload).eq('id',b.id).select().single();
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'modification_credit_hippique',{dossier_id:data.dossier_id});
    return json(res,200,data);
  }
  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});
    const { data:old } = await sb.from('pret_horse_credits').select('*').eq('id',id).maybeSingle();
    const { error } = await sb.from('pret_horse_credits').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'suppression_credit_hippique',{dossier_id:old?.dossier_id});
    return json(res,200,{ok:true});
  }
  return json(res,405,{error:'Méthode non autorisée'});
});
