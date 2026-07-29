const crypto=require('crypto'); const {json,handler}=require('./_lib');
module.exports=(req,res)=>handler(req,res,async()=>{
 if(req.method!=='GET')return json(res,405,{error:'Méthode non autorisée'});
 const state=crypto.randomBytes(24).toString('hex');
 res.setHeader('Set-Cookie',`discord_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`);
 const q=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:process.env.DISCORD_REDIRECT_URI,scope:'identify guilds',state});
 res.statusCode=302;res.setHeader('Location','https://discord.com/oauth2/authorize?'+q.toString());res.end();
});
