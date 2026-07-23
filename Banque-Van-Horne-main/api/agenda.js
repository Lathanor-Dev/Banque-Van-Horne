const { sb, json, readBody, currentUser, logAction, handler } = require('./_lib');

const TIME_RE = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['prevu','confirme','termine','annule']);
const TYPES = new Set(['etude_pret','signature','remboursement','immobilier','consultation','autre']);

function safeClientId(value){
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}
function clean(value, max=1000){
  return String(value || '').trim().slice(0,max);
}
function validDate(value){ return DATE_RE.test(String(value || '')); }
function validTime(value){ return TIME_RE.test(String(value || '')); }
function plusOneDay(date){
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
function normalizedEndDate(date,start,end,endDate){
  if(validDate(endDate)) return endDate;
  return end <= start ? plusOneDay(date) : date;
}
async function clientSnapshot(clientId){
  const { data, error } = await sb.from('pret_clients')
    .select('id,prenom,nom,telegram,adresse')
    .eq('id',clientId)
    .maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) throw new Error('Client introuvable dans le registre.');
  return data;
}
async function payloadFrom(body, actor){
  const client_id = safeClientId(body.client_id);
  if(!client_id) throw new Error('Client obligatoire.');
  const client = await clientSnapshot(client_id);

  const appointment_date = clean(body.appointment_date,10);
  const start_time = clean(body.start_time,5);
  const end_time = clean(body.end_time,5);
  if(!validDate(appointment_date)) throw new Error('Date de rendez-vous invalide.');
  if(!validTime(start_time) || !validTime(end_time)) throw new Error('Les heures doivent être fixées par créneaux de 30 minutes.');

  const end_date = normalizedEndDate(appointment_date,start_time,end_time,clean(body.end_date,10));
  if(!validDate(end_date) || end_date < appointment_date) throw new Error('Date de fin invalide.');

  const appointment_type = TYPES.has(clean(body.appointment_type,50)) ? clean(body.appointment_type,50) : 'autre';
  const status = STATUSES.has(clean(body.status,50)) ? clean(body.status,50) : 'prevu';
  const typeLabels = {
    etude_pret:'Étude de prêt',
    signature:'Signature de prêt',
    remboursement:'Remboursement',
    immobilier:'Rendez-vous immobilier',
    consultation:'Consultation bancaire',
    autre:'Rendez-vous'
  };
  const defaultTitle = `${typeLabels[appointment_type]} — ${client.prenom || ''} ${client.nom || ''}`.trim();

  return {
    client_id,
    client_prenom:clean(client.prenom,120),
    client_nom:clean(client.nom,120),
    client_telegram:clean(client.telegram,120),
    appointment_date,
    start_time,
    end_date,
    end_time,
    appointment_type,
    title:clean(body.title,220) || defaultTitle,
    location:clean(body.location,220),
    notes:clean(body.notes,4000),
    status,
    responsable_username:clean(body.responsable_username,120) || actor.username,
    updated_at:new Date().toISOString()
  };
}

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});

  if(req.method==='GET'){
    const url = new URL(req.url,'https://local');
    const from = clean(url.searchParams.get('from'),10);
    const to = clean(url.searchParams.get('to'),10);

    let q = sb.from('pret_agenda_events')
      .select('*')
      .order('appointment_date',{ascending:true})
      .order('start_time',{ascending:true})
      .limit(600);

    // Returns appointments whose interval overlaps the requested date range.
    if(validDate(from) && validDate(to)){
      q = q.lte('appointment_date',to).gte('end_date',from);
    }

    const { data, error } = await q;
    if(error) return json(res,500,{error:error.message});
    return json(res,200,data || []);
  }

  if(req.method==='POST'){
    const body = await readBody(req);
    const payload = await payloadFrom(body,actor);
    payload.created_by_username = actor.username;

    const { data, error } = await sb.from('pret_agenda_events').insert(payload).select().single();
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'creation_rendez_vous',{
      event_id:data.id,
      client_id:data.client_id,
      client:`${data.client_prenom} ${data.client_nom}`,
      date:data.appointment_date,
      debut:data.start_time,
      fin:data.end_time
    });
    return json(res,200,data);
  }

  if(req.method==='PUT'){
    const body = await readBody(req);
    if(!body.id) return json(res,400,{error:'ID manquant'});

    const { data:old, error:readErr } = await sb.from('pret_agenda_events')
      .select('*').eq('id',body.id).maybeSingle();
    if(readErr) return json(res,500,{error:readErr.message});
    if(!old) return json(res,404,{error:'Rendez-vous introuvable'});

    const payload = await payloadFrom({...old,...body},actor);
    const { data, error } = await sb.from('pret_agenda_events')
      .update(payload).eq('id',body.id).select().single();
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'modification_rendez_vous',{
      event_id:data.id,
      client_id:data.client_id,
      date:data.appointment_date,
      debut:data.start_time,
      fin:data.end_time
    });
    return json(res,200,data);
  }

  if(req.method==='DELETE'){
    const body = await readBody(req);
    if(!body.id) return json(res,400,{error:'ID manquant'});

    const { data:old, error:readErr } = await sb.from('pret_agenda_events')
      .select('*').eq('id',body.id).maybeSingle();
    if(readErr) return json(res,500,{error:readErr.message});
    if(!old) return json(res,404,{error:'Rendez-vous introuvable'});

    const { error } = await sb.from('pret_agenda_events').delete().eq('id',body.id);
    if(error) return json(res,500,{error:error.message});

    await logAction(actor,'suppression_rendez_vous',{
      event_id:old.id,
      client_id:old.client_id,
      client:`${old.client_prenom} ${old.client_nom}`,
      date:old.appointment_date,
      debut:old.start_time
    });
    return json(res,200,{ok:true});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
