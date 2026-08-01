const { sb, json, currentUser, hasPermission, handler } = require('./_lib');
module.exports = (req,res)=>handler(req,res, async()=>{
  const user = await currentUser(req);
  if(!user) return json(res,401,{error:'Non connecté'});
  if(!hasPermission(user,'audit.read')) return json(res,403,{error:'Accès refusé'});
  const { data, error } = await sb.from('pret_logs').select('*').order('created_at',{ascending:false}).limit(300);
  if(error) return json(res,500,{error:error.message});
  return json(res,200,data || []);
});
