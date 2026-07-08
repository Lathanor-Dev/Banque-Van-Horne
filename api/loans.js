const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');

function safeClientId(v){
  if(v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function safeApplicationId(v){
  if(v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function safeAgence(v){
  const value = String(v || 'van_horn').trim();
  if(value === 'SD' || value === 'saint_denis') return 'saint_denis';
  return 'van_horn';
}
function bankCodeFrom(value){
  const agence = safeAgence(value);
  return agence === 'saint_denis' ? 'SD' : 'VH';
}
function agenceFromBankCode(value){
  const v = String(value || '').trim();
  return v === 'SD' ? 'saint_denis' : 'van_horn';
}
function safeRecouvrementStatus(v){
  const value = String(v || 'aucun').trim();
  return ['aucun','relance_simple','mise_en_demeure','recouvrement_actif','saisie_garantie','cloture'].includes(value) ? value : 'aucun';
}
function safeText(v){
  return String(v || '').trim();
}
function safeNullableDate(v){
  if(v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}
function safeEcheances(v){
  if(Array.isArray(v)) return v;
  if(typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/*
  Génération des nouveaux IDs sans repartir à zéro.

  Le correctif précédent ne regardait que les IDs déjà au format VH-0001 / SD-0001.
  Donc les anciens IDs comme BVH-1904-1300 ou BVH-1904-1200 n’étaient pas comptés.

  Cette version tient compte :
  - des nouveaux IDs : VH-0001, SD-0001 ;
  - des anciens IDs terminés par un numéro : BVH-1904-1300, BVH-1904-1200 ;
  - uniquement des prêts de la même banque, quand bank_code/agence existe ;
  - sans prendre une date comme 20260708 pour un numéro de séquence.
*/
function sequenceFromLoanId(id, prefix){
  const s = String(id || '').trim().toUpperCase();
  if(!s) return 0;

  let m = s.match(new RegExp(`^${prefix}-(\\d{1,})$`));
  if(m) return Number(m[1]) || 0;

  // Ancien format constaté : BVH-1904-1300, BVH-1904-1200, etc.
  m = s.match(/^BVH-\d{4}-(\d{1,})$/);
  if(prefix === 'VH' && m) return Number(m[1]) || 0;

  // Autre ancien format possible : VH-1904-1300 ou SD-1904-1300.
  m = s.match(new RegExp(`^${prefix}-\\d{4}-(\\d{1,})$`));
  if(m) return Number(m[1]) || 0;

  return 0;
}
function rowMatchesBank(row, bank_code){
  const code = String(row.bank_code || '').trim();
  if(code) return code === bank_code;
  const agence = safeAgence(row.agence);
  return bankCodeFrom(agence) === bank_code;
}
async function generateLoanId(bank_code){
  const prefix = bank_code === 'SD' ? 'SD' : 'VH';

  const { data, error } = await sb
    .from('pret_loans')
    .select('loan_id, bank_code, agence');

  if(error) throw new Error(error.message);

  let max = 0;
  for(const row of data || []){
    if(!rowMatchesBank(row, bank_code)) continue;
    max = Math.max(max, sequenceFromLoanId(row.loan_id, prefix));
  }

  return `${prefix}-${String(max + 1).padStart(4,'0')}`;
}

function normalizeOutput(row){
  const bank_code = row.bank_code || bankCodeFrom(row.agence);
  return {
    ...row,
    bank_code,
    agence: row.agence || agenceFromBankCode(bank_code),
    echeances: safeEcheances(row.echeances)
  };
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
    return json(res,200,(data || []).map(normalizeOutput));
  }

  if(req.method==='POST'){
    const b=await readBody(req);
    if(!b.nom || !b.prenom || !b.somme || b.taux===undefined || !b.echeances) {
      return json(res,400,{error:'Données prêt incomplètes'});
    }

    const agence = safeAgence(b.agence || b.bank_code);
    const bank_code = String(b.bank_code || bankCodeFrom(agence)).trim() === 'SD' ? 'SD' : 'VH';
    const requestedId = safeText(b.loan_id);
    const loan_id = requestedId && /^(VH|SD)-\d{4,}$/.test(requestedId)
      ? requestedId
      : await generateLoanId(bank_code);

    const payload={
      loan_id,
      bank_code,
      agence,
      client_id:safeClientId(b.client_id),
      application_id:safeApplicationId(b.application_id),
      recouvrement_status:safeRecouvrementStatus(b.recouvrement_status),
      recouvrement_notes:safeText(b.recouvrement_notes),
      recouvrement_started_at:safeNullableDate(b.recouvrement_started_at),
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

    await logAction(actor,'creation_pret',{
      loan_id:data.loan_id,
      banque:data.bank_code,
      client:`${data.prenom} ${data.nom}`,
      client_id:data.client_id,
      application_id:data.application_id,
      montant:data.somme,
      total:data.total_a_rembourser
    });

    return json(res,200,normalizeOutput(data));
  }

  if(req.method==='PUT'){
    const b=await readBody(req);
    if(!b.id) return json(res,400,{error:'ID manquant'});

    const { data:old } = await sb.from('pret_loans').select('*').eq('id',b.id).maybeSingle();
    if(!old) return json(res,404,{error:'Prêt introuvable'});

    const patch={};
    ['nom','prenom','telegram','garanties','total_a_rembourser','somme','taux']
      .forEach(k=>{ if(b[k]!==undefined) patch[k]=b[k]; });

    if(b.client_id !== undefined) patch.client_id=safeClientId(b.client_id);
    if(b.application_id !== undefined) patch.application_id=safeApplicationId(b.application_id);
    if(b.agence !== undefined || b.bank_code !== undefined){
      const agence = safeAgence(b.agence || b.bank_code);
      patch.agence = agence;
      patch.bank_code = String(b.bank_code || bankCodeFrom(agence)).trim() === 'SD' ? 'SD' : 'VH';
    }
    if(b.loan_id !== undefined){
      const requestedId = safeText(b.loan_id);
      if(requestedId && /^(VH|SD)-\d{4,}$/.test(requestedId)) patch.loan_id = requestedId;
    }
    if(b.recouvrement_status !== undefined) patch.recouvrement_status=safeRecouvrementStatus(b.recouvrement_status);
    if(b.recouvrement_notes !== undefined) patch.recouvrement_notes=safeText(b.recouvrement_notes);
    if(b.recouvrement_started_at !== undefined) patch.recouvrement_started_at=safeNullableDate(b.recouvrement_started_at);
    if(b.echeances !== undefined) patch.echeances=safeEcheances(b.echeances);

    const { data, error } = await sb
      .from('pret_loans')
      .update(patch)
      .eq('id',b.id)
      .select()
      .single();

    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'modification_pret',{
      loan_id:data.loan_id,
      banque:data.bank_code,
      fields:Object.keys(patch)
    });
    return json(res,200,normalizeOutput(data));
  }

  if(req.method==='DELETE'){
    const { id } = await readBody(req);
    if(!id) return json(res,400,{error:'ID manquant'});

    const { data:old } = await sb.from('pret_loans').select('*').eq('id',id).maybeSingle();
    if(!old) return json(res,404,{error:'Prêt introuvable'});

    const { error } = await sb.from('pret_loans').delete().eq('id',id);
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'suppression_pret',{
      loan_id:old.loan_id,
      banque:old.bank_code,
      client:`${old.prenom} ${old.nom}`,
      montant:old.somme,
      total:old.total_a_rembourser
    });
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
