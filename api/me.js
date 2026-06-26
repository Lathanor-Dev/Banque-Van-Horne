const { json, currentUser, handler } = require('./_lib');
module.exports = (req,res)=>handler(req,res, async()=>{
  const user = await currentUser(req);
  if(!user) return json(res,401,{error:'Non connecté'});
  return json(res,200,{user});
});
