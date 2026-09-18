const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, handler } = require('./_lib');

function token(req){const h=String(req.headers?.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():'';}
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);}
function clean(v,n=120){return String(v??'').trim().slice(0,n);}
function id(v){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;}
function money(v){return Math.round((Number(v)+Number.EPSILON)*100)/100;}
function weeks(from){const d=new Date(`${String(from).slice(0,10)}T12:00:00Z`);return Number.isNaN(d.getTime())?0:Math.max(0,Math.floor((Date.now()-d.getTime())/604800000));}
function financials(c){const paid=(c.payments||[]).filter(p=>p.status==='paid'&&p.paid_at);const principal=money(paid.reduce((s,p)=>s+Number(p.amount||0),0));const interest=money(paid.reduce((s,p)=>s+Number(p.amount||0)*0.05*weeks(p.paid_at),0));return{principal,interest,balance:money(principal+interest),paid_installments:paid.length};}
function out(c){return{...c,financials:financials(c)};}
function addDays(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());}
function agency(v){return ['van_horn','saint_denis','rhodes','valentine','blackwater','strawberry','sunset'].includes(v)?v:'van_horn';}
async function numberFor(a){const code={van_horn:'VH',saint_denis:'SD',rhodes:'RH',valentine:'VT',blackwater:'BW',strawberry:'ST',sunset:'SS'}[a];const {count}=await sb.from('pret_life_insurance_contracts').select('id',{count:'exact',head:true}).eq('agency',a);return `AV-${code}-${String((count||0)+1).padStart(4,'0')}`;}
async function audit(contractId,type,actor,details={}){await sb.from('pret_life_insurance_events').insert({contract_id:contractId,event_type:type,actor_username:actor,details:{source:'discord',...details}});}

module.exports=(req,res)=>handler(req,res,async()=>{
  const expected=String(process.env.DISCORD_AGENDA_API_KEY||'').trim();
  if(!expected)return json(res,503,{error:'La clé API privée Discord n’est pas configurée sur Vercel.'});
  if(!equal(token(req),expected))return json(res,401,{error:'Clé Discord invalide.'});
  if(req.method==='GET'){
    const q=clean(req.query?.q,100).toLocaleLowerCase('fr');
    const contractId=id(req.query?.id);
    let query=sb.from('pret_life_insurance_contracts').select('*').order('created_at',{ascending:false}).limit(250);
    if(contractId)query=query.eq('id',contractId);
    const {data,error}=await query;if(error)return json(res,500,{error:error.message});
    const rows=(data||[]).filter(c=>!q||`${c.contract_number} ${c.subscriber_first_name} ${c.subscriber_last_name} ${c.beneficiary_first_name} ${c.beneficiary_last_name}`.toLocaleLowerCase('fr').includes(q));
    return json(res,200,rows.slice(0,25).map(out));
  }
  if(req.method==='POST'){
    const b=await readBody(req),clientId=id(b.subscriber_client_id),capital=Number(b.target_capital),start=clean(b.start_date,10),actor=clean(b.actor)||'Discord';
    if(!clientId||![1000,2500,5000,7500,10000].includes(capital)||!validDate(start)||!clean(b.beneficiary_first_name)||!clean(b.beneficiary_last_name))return json(res,400,{error:'Données de création incomplètes.'});
    const {data:client,error:ce}=await sb.from('pret_clients').select('id,prenom,nom,telegram').eq('id',clientId).maybeSingle();if(ce)return json(res,500,{error:ce.message});if(!client)return json(res,404,{error:'Client introuvable.'});
    const a=agency(b.agency),amount=money(capital/8),payments=Array.from({length:8},(_,i)=>({number:i+1,date:addDays(start,i*7),amount,status:'pending',paid_at:null}));
    const payload={contract_number:await numberFor(a),agency:a,subscriber_client_id:client.id,subscriber_first_name:clean(client.prenom),subscriber_last_name:clean(client.nom),subscriber_telegram:clean(client.telegram)||null,beneficiary_first_name:clean(b.beneficiary_first_name),beneficiary_last_name:clean(b.beneficiary_last_name),beneficiary_telegram:clean(b.beneficiary_telegram)||null,target_capital:capital,weekly_payment:amount,interest_rate_weekly:.05,start_date:start,payments,created_by_username:actor};
    const {data,error}=await sb.from('pret_life_insurance_contracts').insert(payload).select().single();if(error)return json(res,500,{error:error.message});await audit(data.id,'contract_created',actor,{target_capital:capital});return json(res,201,out(data));
  }
  if(req.method==='PUT'){
    const b=await readBody(req),contractId=id(b.id),actor=clean(b.actor)||'Discord',action=clean(b.action,40);
    if(!contractId)return json(res,400,{error:'Contrat manquant.'});
    const {data:c,error:e}=await sb.from('pret_life_insurance_contracts').select('*').eq('id',contractId).maybeSingle();
    if(e)return json(res,500,{error:e.message});if(!c)return json(res,404,{error:'Contrat introuvable.'});
    const patch={updated_at:new Date().toISOString()};let details={};
    if(action==='cancel'){
      const reason=clean(b.reason,500);if(!reason)return json(res,400,{error:'Motif obligatoire.'});if(['closed','paid_to_beneficiary','cancelled'].includes(c.status))return json(res,409,{error:'Contrat déjà soldé ou annulé.'});patch.status='cancelled';patch.cancelled_at=new Date().toISOString();patch.cancellation_reason=reason;details={reason};
    }else if(action==='record_payment'){
      if(!['active','payments_complete','placed'].includes(c.status))return json(res,409,{error:'Versements bloqués pour ce statut.'});
      const number=Number(b.installment_number),payments=[...(c.payments||[])],i=payments.findIndex(p=>Number(p.number)===number);
      if(i<0)return json(res,400,{error:'Échéance invalide.'});if(payments[i].status==='paid')return json(res,409,{error:'Échéance déjà payée.'});
      payments[i]={...payments[i],status:'paid',paid_at:new Date().toISOString(),recorded_by:actor};patch.payments=payments;patch.status=payments.every(p=>p.status==='paid')?'payments_complete':'active';details={installment_number:number,amount:payments[i].amount};
    }else if(action==='leave_placed'){
      if(!['payments_complete','placed'].includes(c.status))return json(res,409,{error:'Les huit versements doivent être terminés.'});patch.status='placed';
    }else if(action==='request_closure'){
      if(!['active','payments_complete','placed'].includes(c.status))return json(res,409,{error:'Clôture impossible pour ce statut.'});const f=financials(c),fee=money(f.balance*.15);patch.status='closure_requested';patch.closure_fee=fee;patch.closure_net_amount=money(f.balance-fee);details={...f,fee,net:patch.closure_net_amount};
    }else if(action==='confirm_closure'){
      if(c.status!=='closure_requested')return json(res,409,{error:'Aucune clôture en attente.'});patch.status='closed';patch.closed_at=new Date().toISOString();
    }else if(action==='report_death'){
      if(['closed','paid_to_beneficiary'].includes(c.status))return json(res,409,{error:'Contrat déjà soldé.'});patch.status='death_reported';patch.death_reported_at=new Date().toISOString();
    }else if(action==='start_review'){
      if(c.status!=='death_reported')return json(res,409,{error:'Le décès doit être signalé avant la vérification.'});patch.status='under_review';
    }else if(action==='pay_beneficiary'){
      if(c.status!=='under_review')return json(res,409,{error:'La vérification bancaire doit être terminée.'});patch.status='paid_to_beneficiary';patch.beneficiary_paid_at=new Date().toISOString();patch.closed_at=patch.beneficiary_paid_at;details=financials(c);
    }else return json(res,400,{error:'Action inconnue.'});
    const {data,error}=await sb.from('pret_life_insurance_contracts').update(patch).eq('id',contractId).select().single();if(error)return json(res,500,{error:error.message});
    await audit(contractId,action,actor,details);return json(res,200,out(data));
  }
  if(req.method==='DELETE'){
    const b=await readBody(req),contractId=id(b.id),reason=clean(b.reason,500),actor=clean(b.actor)||'Discord';if(!contractId||!reason||b.confirmation!=='SUPPRIMER')return json(res,400,{error:'Confirmation invalide.'});
    const {data:c}=await sb.from('pret_life_insurance_contracts').select('*').eq('id',contractId).maybeSingle();if(!c)return json(res,404,{error:'Contrat introuvable.'});if((c.payments||[]).some(p=>p.status==='paid'))return json(res,409,{error:'Un contrat avec versement doit être annulé, pas supprimé.'});await sb.from('pret_life_insurance_events').delete().eq('contract_id',contractId);const {error}=await sb.from('pret_life_insurance_contracts').delete().eq('id',contractId);if(error)return json(res,500,{error:error.message});return json(res,200,{ok:true,contract_number:c.contract_number,actor,reason});
  }
  return json(res,405,{error:'Méthode non autorisée.'});
});
