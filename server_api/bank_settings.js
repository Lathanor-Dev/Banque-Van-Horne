const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');

const DEFAULT_BANK_DATE = '1904-06-26';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

module.exports = (req,res)=>handler(req,res, async()=>{
  const actor = await currentUser(req);
  if(!actor) return json(res,401,{error:'Non connecté'});

  if(req.method==='GET'){
    const { data, error } = await sb
      .from('pret_bank_settings')
      .select('setting_value')
      .eq('setting_key','bank_date')
      .maybeSingle();

    if(error) return json(res,500,{error:error.message});
    const bank_date = validDate(data?.setting_value) ? data.setting_value : DEFAULT_BANK_DATE;
    return json(res,200,{bank_date});
  }

  if(req.method==='PUT'){
    if(!hasPermission(actor,'settings.write')){
      return json(res,403,{error:'Seule la direction peut modifier la date bancaire.'});
    }

    const body = await readBody(req);
    const bank_date = String(body.bank_date || '').trim();
    if(!validDate(bank_date)){
      return json(res,400,{error:'Date bancaire invalide. Utilise le format AAAA-MM-JJ.'});
    }

    const { data, error } = await sb
      .from('pret_bank_settings')
      .upsert({
        setting_key:'bank_date',
        setting_value:bank_date,
        updated_by_username:actor.username,
        updated_at:new Date().toISOString()
      },{onConflict:'setting_key'})
      .select('setting_value')
      .single();

    if(error) return json(res,500,{error:error.message});
    await logAction(actor,'modification_date_bancaire',{bank_date:data.setting_value});
    return json(res,200,{bank_date:data.setting_value});
  }

  return json(res,405,{error:'Méthode non autorisée'});
});
