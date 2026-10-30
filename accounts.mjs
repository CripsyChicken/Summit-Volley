import { randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { freshProfile,normalizeProfile,customize,reward } from './src/progression.js';
const scrypt=promisify(scryptCallback),hash=t=>createHash('sha256').update(t).digest('hex');
export const publicAccount=a=>a?{username:a.username,profile:normalizeProfile(a.profile)}:null;
export function createAccounts(storePromise){
  const limits=new Map();let hashing=0;
  const token=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('volley_session='))?.slice(15)||'';
  const identify=async req=>{const store=await storePromise;if(!store)return null;const id=await store.resolve(hash(token(req)));return id?await store.get(id):null;};
  async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw new Error('Request too large.');}return JSON.parse(text||'{}');}
  const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
  const cookie=(req,value,age)=>`volley_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.RENDER||process.env.NODE_ENV==='production'||req.socket.encrypted?'; Secure':''}`;
  return {identify,async award(id,event){const store=await storePromise;if(!store||!id)return null;return publicAccount(await store.update(id,a=>({...a,profile:reward(a.profile,event)})));},async handle(req,res){
    const route=req.url.split('?')[0];if(!route.startsWith('/api/'))return false;
    try{
      const store=await storePromise;
      if(route==='/api/me'&&req.method==='GET'){const a=await identify(req);if(a)await store.update(a.id,x=>({...x,lastSeen:Date.now()}));json(res,200,{account:publicAccount(a),storage:store?.kind||'unconfigured'});return true;}
      if(req.method!=='POST'){json(res,405,{error:'Use POST.'});return true;}
      let originOK=false;try{originOK=new URL(req.headers.origin).host===req.headers.host;}catch{}if(!originOK){json(res,403,{error:'Open the game on this server before signing in.'});return true;}
      if(!store){json(res,503,{error:'Account saving needs DATABASE_URL on this server. You can still play as a guest.'});return true;}
      if(!['/api/register','/api/login','/api/logout','/api/customize'].includes(route)){json(res,404,{error:'Not found.'});return true;}
      if(route==='/api/logout'){await store.revoke(hash(token(req)));json(res,200,{ok:true},{'Set-Cookie':cookie(req,'',0)});return true;}
      const data=await body(req);
      if(route==='/api/customize'){const a=await identify(req);if(!a){json(res,401,{error:'Sign in again to save.'});return true;}const updated=await store.update(a.id,x=>({...x,profile:customize(x.profile,data.kind,data.id)}));json(res,200,{account:publicAccount(updated)});return true;}
      const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0];const now=Date.now();if(limits.size>10000)for(const [k,v] of limits)if(now>v.until)limits.delete(k);
      const lim=limits.get(ip)||{until:now+60000,count:0};if(now>lim.until){lim.count=0;lim.until=now+60000;}limits.set(ip,lim);if(++lim.count>12||hashing>=3){json(res,429,{error:'Too many attempts. Try again in a minute.'});return true;}
      const username=String(data.username||'').trim(),password=String(data.password||'');if(!/^[a-zA-Z0-9_]{3,18}$/.test(username)||password.length<8||password.length>128)throw new Error('Use a 3–18 character username (letters, numbers, underscore) and an 8–128 character password.');
      let a=await store.find(username);hashing++;
      try{if(route==='/api/register'){if(a)throw new Error('Username already taken.');const salt=randomBytes(16).toString('hex');const digest=await scrypt(password,salt,64,{N:32768,maxmem:64*1024*1024});a=await store.create({id:randomUUID(),username,salt,digest:digest.toString('hex'),profile:freshProfile(),created:now,lastSeen:now});}
      else{const digest=await scrypt(password,a?.salt||'missing-account-salt',64,{N:32768,maxmem:64*1024*1024});if(!a||!timingSafeEqual(digest,Buffer.from(a.digest,'hex')))throw new Error('Username or password is incorrect.');}}finally{hashing--;}
      const session=randomBytes(32).toString('hex');await store.revoke(hash(token(req)));await store.session(hash(session),a.id,now+30*86400000);json(res,200,{account:publicAccount(a)},{'Set-Cookie':cookie(req,session,30*86400)});
    }catch(e){json(res,e.code==='23505'?409:400,{error:e.code==='23505'?'Username already taken.':e.code?'Account storage is unavailable. Try again shortly.':e.message});}return true;
  }};
}
