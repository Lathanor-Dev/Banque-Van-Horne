const { json, currentUser, clearSessionCookie, logAction, handler } = require('./_lib');
module.exports = (req,res)=>handler(req,res, async()=>{
  const user = await currentUser(req);
  clearSessionCookie(res);
  if(user) await logAction(user,'deconnexion',{});
  return json(res,200,{ok:true});
});
