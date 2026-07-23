const bcrypt = require('bcryptjs');
const { sb, json, readBody, createToken, setSessionCookie, logAction, handler } = require('./_lib');

module.exports = (req,res)=>handler(req,res, async()=>{
  if(req.method !== 'POST') return json(res,405,{error:'Méthode non autorisée'});
  const { username, password } = await readBody(req);
  if(!username || !password) return json(res,400,{error:'Identifiant et mot de passe requis'});

  const { data:user, error } = await sb.from('pret_users')
    .select('id,username,password_hash,role,is_active,protected')
    .eq('username', String(username).trim())
    .maybeSingle();

  if(error || !user || user.is_active===false) return json(res,401,{error:'Identifiants incorrects'});
  const ok = await bcrypt.compare(String(password), user.password_hash || '');
  if(!ok) return json(res,401,{error:'Identifiants incorrects'});

  const safe = { id:user.id, username:user.username, role:user.role, protected:user.protected };
  setSessionCookie(res, createToken(safe));
  await logAction(safe,'connexion',{username:user.username});
  return json(res,200,{user:safe});
});
