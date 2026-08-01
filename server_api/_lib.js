const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const permissions = require('./permissions');

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
  const payload = b64url(JSON.stringify({ id:user.id, username:user.username, role:user.role, role_code:permissions.roleCodeOf(user), iat:Date.now(), exp:Date.now()+7*DAY*1000 }));
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
  const { data:user, error } = await sb.from('pret_users').select('id,username,role,role_code,is_active,protected,agency,agency_grade,discord_id,discord_display_name').eq('id', data.id).maybeSingle();
  if(error || !user || user.is_active===false) return null;
  if(permissions.roleCodeOf(user)==='PENDING_ASSIGNMENT') return null;
  return user;
}

function roleRank(userOrRole){ return permissions.roleLevel(userOrRole); }
function requireRole(user, min){ return user && permissions.roleLevel(user) >= permissions.roleLevel(min); }
const canManageUsers = permissions.canManageUsers;
const canModifyTarget = permissions.canModifyTarget;
const allowedCreateRole = permissions.allowedCreateRole;
const hasPermission = permissions.hasPermission;
const roleCodeOf = permissions.roleCodeOf;

async function logAction(user, action, details={}){
  try{
    await sb.from('pret_logs').insert({
      user_id: user?.id ? String(user.id) : null,
      username: user?.username || 'system',
      role: user?.role || 'system',
      action,
      details: { role_code: user ? permissions.roleCodeOf(user) : 'SYSTEM', ...details }
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

module.exports={
  sb,json,readBody,currentUser,setSessionCookie,clearSessionCookie,createToken,logAction,
  requireRole,canManageUsers,canModifyTarget,allowedCreateRole,roleRank,hasPermission,roleCodeOf,
  ROLE_DEFINITIONS:permissions.ROLE_DEFINITIONS,
  legacyRoleForCode:permissions.legacyRoleForCode,
  assignableRoleCodes:permissions.assignableRoleCodes,
  handler
};
