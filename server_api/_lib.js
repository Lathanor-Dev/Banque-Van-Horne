const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const SESSION_COOKIE = 'bvh_session';
const DAY = 86400;

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  let raw='';
  for await (const chunk of req) raw += chunk;
  if(!raw) return {};
  try{return JSON.parse(raw);}catch(e){return {};}
}

function parseCookies(req){
  const h=req.headers.cookie || '';
  return Object.fromEntries(h.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('='); return [decodeURIComponent(v.slice(0,i)), decodeURIComponent(v.slice(i+1))];
  }));
}

function secret(){
  if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32){
    throw new Error('SESSION_SECRET manquant ou trop court dans Vercel Environment Variables. Minimum 32 caractères.');
  }
  return process.env.SESSION_SECRET;
}

function b64url(input){ return Buffer.from(input).toString('base64url'); }
function signPayload(payload){ return crypto.createHmac('sha256', secret()).update(payload).digest('base64url'); }
function createToken(user){
  const payload = b64url(JSON.stringify({ id:user.id, username:user.username, role:user.role, iat:Date.now(), exp:Date.now()+7*DAY*1000 }));
  return payload + '.' + signPayload(payload);
}
function verifyToken(token){
  if(!token || !token.includes('.')) return null;
  const [payload,sig]=token.split('.');
  const expected=signPayload(payload);
  if(!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data.exp || Date.now()>data.exp) return null;
  return data;
}
function cookieOptions(maxAge=7*DAY){
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=__VALUE__; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function setSessionCookie(res, token){ res.setHeader('Set-Cookie', cookieOptions().replace('__VALUE__', encodeURIComponent(token))); }
function clearSessionCookie(res){ res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

async function currentUser(req){
  const cookies=parseCookies(req);
  const data=verifyToken(cookies[SESSION_COOKIE]);
  if(!data) return null;
  const { data:user, error } = await sb.from('pret_users').select('id,username,role,is_active,protected').eq('id', data.id).maybeSingle();
  if(error || !user || user.is_active===false) return null;
  return user;
}

function roleRank(role){ return { employe:1, co_directeur:2, directeur:3, admin:4 }[role] || 0; }
function requireRole(user, min){ return user && roleRank(user.role) >= roleRank(min); }
function canManageUsers(user){ return user && ['admin','directeur','co_directeur'].includes(user.role); }
function canModifyTarget(actor, target){
  if(!actor || !target) return false;
  if(target.protected && actor.role !== 'admin') return false;
  if(actor.role === 'admin') return true;
  if(actor.role === 'directeur') return ['co_directeur','employe'].includes(target.role);
  if(actor.role === 'co_directeur') return target.role === 'employe';
  return false;
}
function allowedCreateRole(actor, role){
  if(actor.role==='admin') return ['directeur','co_directeur','employe'].includes(role);
  if(actor.role==='directeur') return ['co_directeur','employe'].includes(role);
  if(actor.role==='co_directeur') return role==='employe';
  return false;
}

async function logAction(user, action, details={}){
  try{
    await sb.from('pret_logs').insert({
      user_id: user?.id ? String(user.id) : null,
      username: user?.username || 'system',
      role: user?.role || 'system',
      action,
      details
    });
  }catch(e){ /* never break business action because of logging */ }
}

async function handler(req,res,fn){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method === 'OPTIONS') return json(res,200,{ok:true});
    return await fn(req,res);
  }catch(e){
    return json(res,500,{error:e.message || 'Erreur serveur'});
  }
}

module.exports={sb,json,readBody,currentUser,setSessionCookie,clearSessionCookie,createToken,logAction,requireRole,canManageUsers,canModifyTarget,allowedCreateRole,roleRank,handler};
