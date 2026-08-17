const { sb, json, readBody, currentUser, hasPermission, roleRank, logAction, handler } = require('./_lib');

const CAPITALS = new Set([1000, 2500, 5000, 7500, 10000]);
const ACTIVE = new Set(['active','payments_complete','placed']);
const STATUSES = new Set([...ACTIVE,'closure_requested','closed','death_reported','under_review','paid_to_beneficiary']);

function clean(value, max = 500){ return String(value ?? '').trim().slice(0, max); }
function safeId(value){ const n=Number(value); return Number.isSafeInteger(n)&&n>0?n:null; }
function safeAgency(value){
  const v=clean(value,30).toLowerCase();
  if(v==='sd'||v==='saint_denis')return 'saint_denis';
  if(v==='rh'||v==='rhodes')return 'rhodes';
  if(v==='vt'||v==='valentine')return 'valentine';
  return 'van_horn';
}
function realDate(value){
  const s=clean(value,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(`${s}T12:00:00Z`); return Number.isNaN(d.getTime())?null:s;
}
function addDays(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function money(value){return Math.round((Number(value)+Number.EPSILON)*100)/100;}
function schedule(capital,start){
  const amount=money(capital/8);
  return Array.from({length:8},(_,index)=>({number:index+1,date:addDays(start,index*7),amount,status:'pending',paid_at:null}));
}
function completedWeeks(from,to=new Date()){
  const start=new Date(`${from}T12:00:00Z`); if(Number.isNaN(start.getTime()))return 0;
  return Math.max(0,Math.floor((to.getTime()-start.getTime())/604800000));
}
function financials(contract, now=new Date()){
  const payments=Array.isArray(contract.payments)?contract.payments:[];
  const paid=payments.filter(p=>p.status==='paid'&&p.paid_at);
  const principal=money(paid.reduce((sum,p)=>sum+Number(p.amount||0),0));
  // Les intérêts portent sur chaque somme effectivement déposée. Ils ne sont pas
  // ajoutés au principal : aucune capitalisation non prévue par la règle n'est inventée.
  const interest=money(paid.reduce((sum,p)=>sum+Number(p.amount||0)*0.05*completedWeeks(String(p.paid_at).slice(0,10),now),0));
  const balance=money(principal+interest);
  return {principal,interest,balance,paid_installments:paid.length,remaining_installments:8-paid.length};
}
function normalize(row){return {...row,payments:Array.isArray(row.payments)?row.payments:[],financials:financials(row)};}
async function event(contractId,type,actor,details={}){
  await sb.from('pret_life_insurance_events').insert({contract_id:contractId,event_type:type,actor_username:actor,details});
}
async function nextNumber(agency){
  const code={van_horn:'VH',saint_denis:'SD',rhodes:'RH',valentine:'VT'}[agency];
  const {count,error}=await sb.from('pret_life_insurance_contracts').select('id',{count:'exact',head:true}).eq('agency',agency);
  if(error)throw new Error(error.message);
  return `AV-${code}-${String((count||0)+1).padStart(4,'0')}`;
}

module.exports=(req,res)=>handler(req,res,async()=>{
  const actor=await currentUser(req);
  if(!actor)return json(res,401,{error:'Non connecté'});
  if(req.method==='GET'&&!hasPermission(actor,'bank.read'))return json(res,403,{error:'Accès refusé'});
  if(req.method!=='GET'&&!hasPermission(actor,'bank.write'))return json(res,403,{error:'Modification refusée'});

  if(req.method==='GET'){
    const id=safeId(req.query?.id);
    let query=sb.from('pret_life_insurance_contracts').select('*').order('created_at',{ascending:false});
    if(id)query=query.eq('id',id);
    const {data,error}=await query; if(error)return json(res,500,{error:error.message});
    return json(res,200,(data||[]).map(normalize));
  }

  if(req.method==='POST'){
    const b=await readBody(req),capital=Number(b.target_capital),start=realDate(b.start_date);
    if(!CAPITALS.has(capital)||!start||!clean(b.subscriber_first_name)||!clean(b.subscriber_last_name)||!clean(b.beneficiary_first_name)||!clean(b.beneficiary_last_name))
      return json(res,400,{error:'Contrat incomplet ou palier invalide.'});
    const agency=safeAgency(b.agency),payload={
      contract_number:await nextNumber(agency),agency,subscriber_client_id:safeId(b.subscriber_client_id),
      subscriber_first_name:clean(b.subscriber_first_name,100),subscriber_last_name:clean(b.subscriber_last_name,100),subscriber_telegram:clean(b.subscriber_telegram,120)||null,
      beneficiary_first_name:clean(b.beneficiary_first_name,100),beneficiary_last_name:clean(b.beneficiary_last_name,100),beneficiary_telegram:clean(b.beneficiary_telegram,120)||null,
      target_capital:capital,weekly_payment:money(capital/8),interest_rate_weekly:0.05,start_date:start,payments:schedule(capital,start),notes:clean(b.notes,2000)||null,
      created_by_id:actor.id,created_by_username:actor.username
    };
    const {data,error}=await sb.from('pret_life_insurance_contracts').insert(payload).select().single();
    if(error)return json(res,500,{error:error.message});
    await event(data.id,'contract_created',actor.username,{contract_number:data.contract_number,target_capital:capital});
    await logAction(actor,'creation_assurance_vie',{contract_number:data.contract_number,target_capital:capital,beneficiary:`${data.beneficiary_first_name} ${data.beneficiary_last_name}`});
    return json(res,201,normalize(data));
  }

  if(req.method==='PUT'){
    const b=await readBody(req),id=safeId(b.id),action=clean(b.action,40);
    if(!id)return json(res,400,{error:'Contrat manquant.'});
    if(['confirm_closure','start_review','pay_beneficiary'].includes(action) && roleRank(actor)<roleRank('DEPUTY_DIRECTOR'))
      return json(res,403,{error:'Cette validation est réservée à la direction.'});
    const {data:current,error:readError}=await sb.from('pret_life_insurance_contracts').select('*').eq('id',id).maybeSingle();
    if(readError)return json(res,500,{error:readError.message}); if(!current)return json(res,404,{error:'Contrat introuvable.'});
    const patch={updated_at:new Date().toISOString()}; let details={};
    if(action==='record_payment'){
      if(!ACTIVE.has(current.status))return json(res,409,{error:'Les versements sont bloqués pour ce statut.'});
      const number=Number(b.installment_number),payments=[...(current.payments||[])],index=payments.findIndex(p=>Number(p.number)===number);
      if(index<0)return json(res,400,{error:'Échéance invalide.'}); if(payments[index].status==='paid')return json(res,409,{error:'Cette échéance est déjà payée.'});
      payments[index]={...payments[index],status:'paid',paid_at:new Date().toISOString(),recorded_by:actor.username};
      patch.payments=payments; patch.status=payments.every(p=>p.status==='paid')?'payments_complete':'active'; details={installment_number:number,amount:payments[index].amount};
    }else if(action==='leave_placed'){
      if(!['payments_complete','placed'].includes(current.status))return json(res,409,{error:'Les huit versements doivent être terminés.'}); patch.status='placed';
    }else if(action==='request_closure'){
      if(!ACTIVE.has(current.status))return json(res,409,{error:'Ce contrat ne peut pas être clôturé volontairement.'});
      const f=financials(current),fee=money(f.balance*0.15);patch.status='closure_requested';patch.closure_fee=fee;patch.closure_net_amount=money(f.balance-fee);details={...f,fee,net:patch.closure_net_amount};
    }else if(action==='confirm_closure'){
      if(current.status!=='closure_requested')return json(res,409,{error:'Aucune clôture volontaire en attente.'});patch.status='closed';patch.closed_at=new Date().toISOString();
    }else if(action==='report_death'){
      if(['closed','paid_to_beneficiary'].includes(current.status))return json(res,409,{error:'Ce contrat est déjà soldé.'});patch.status='death_reported';patch.death_reported_at=new Date().toISOString();
    }else if(action==='start_review'){
      if(current.status!=='death_reported')return json(res,409,{error:'Le décès doit être signalé avant la vérification.'});patch.status='under_review';
    }else if(action==='pay_beneficiary'){
      if(current.status!=='under_review')return json(res,409,{error:'La vérification bancaire doit précéder le versement.'});patch.status='paid_to_beneficiary';patch.beneficiary_paid_at=new Date().toISOString();patch.closed_at=patch.beneficiary_paid_at;details=financials(current);
    }else if(action==='set_status'&&STATUSES.has(b.status)){
      return json(res,400,{error:'Les statuts sensibles doivent suivre les actions prévues.'});
    }else return json(res,400,{error:'Action inconnue.'});
    const {data,error}=await sb.from('pret_life_insurance_contracts').update(patch).eq('id',id).select().single();
    if(error)return json(res,500,{error:error.message});
    await event(id,action,actor.username,details); await logAction(actor,`assurance_vie_${action}`,{contract_number:current.contract_number,...details});
    return json(res,200,normalize(data));
  }
  return json(res,405,{error:'Méthode non autorisée'});
});
