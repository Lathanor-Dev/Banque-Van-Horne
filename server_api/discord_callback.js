const {sb,json,createToken,setSessionCookie,logAction,handler}=require('./_lib');
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}));}
async function dj(url,options={}){const r=await fetch(url,options);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'Erreur Discord');return d;}
function mapRole(names){const n=names.map(x=>x.toLowerCase());if(n.some(x=>x.includes('technicien')||x.includes('direction')))return 'admin';if(n.some(x=>x.includes('adjoint')))return 'co_directeur';return 'employe';}
function mapGrade(names){const n=names.map(x=>x.toLowerCase());const map=[['directeur adjoint','directeur_adjoint'],['direction','directeur_agence'],['responsable','responsable_clientele'],['secrétaire','secretaire_direction'],['assistante','secretaire_direction'],['caissier','caissier'],['stagiaire','stagiaire'],['formation','stagiaire'],['banquier','conseiller_bancaire']];for(const [a,b] of map)if(n.some(x=>x.includes(a)))return b;return 'attente_affectation';}
module.exports=(req,res)=>handler(req,res,async()=>{
 const {code,state}=req.query||{};if(!code||!state||cookies(req).discord_oauth_state!==state)return json(res,400,{error:'Session Discord invalide ou expirée'});
 const form=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:process.env.DISCORD_REDIRECT_URI});
 const token=await dj('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
 const user=await dj('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
 const guilds=await dj('https://discord.com/api/v10/users/@me/guilds',{headers:{Authorization:`Bearer ${token.access_token}`}});
 if(!guilds.some(g=>String(g.id)===String(process.env.DISCORD_GUILD_ID))){res.statusCode=302;res.setHeader('Location','/?discord=not_member');return res.end();}
 const auth={Authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`};
 const member=await dj(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,{headers:auth});
 const roles=await dj(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/roles`,{headers:auth});
 const names=roles.filter(r=>member.roles.includes(r.id)).map(r=>r.name);const grade=mapGrade(names),role=mapRole(names);
 let {data:existing}=await sb.from('pret_users').select('*').eq('discord_id',user.id).maybeSingle();
 if(!existing){const username=(member.nick||user.global_name||user.username).slice(0,80);const out=await sb.from('pret_users').insert({username,discord_id:user.id,discord_username:user.username,discord_display_name:member.nick||user.global_name||user.username,discord_roles:names,discord_last_sync:new Date().toISOString(),role,agency_grade:grade,is_active:true}).select().single();if(out.error)throw out.error;existing=out.data;}
 else {const out=await sb.from('pret_users').update({discord_username:user.username,discord_display_name:member.nick||user.global_name||user.username,discord_roles:names,discord_last_sync:new Date().toISOString(),role,agency_grade:grade,is_active:true}).eq('id',existing.id).select().single();if(out.error)throw out.error;existing=out.data;}
 const safe={id:existing.id,username:existing.username,role:existing.role,protected:existing.protected,agency:existing.agency,agency_grade:existing.agency_grade};setSessionCookie(res,createToken(safe));await logAction(safe,'connexion_discord',{discord_id:user.id,roles:names});res.statusCode=302;res.setHeader('Location',grade==='attente_affectation'?'/?discord=waiting':'/?discord=ok');res.end();
});
