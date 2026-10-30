import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { randomBytes,randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer,WebSocket } from 'ws';
import { PROTOCOL,cleanConfig,cleanInput,cleanAction,validSnapshot } from './src/lan-protocol.js';
import { openAccountStore } from './account-store.mjs';
import { createAccounts } from './accounts.mjs';
import { levelFor,SKINS,COURTS } from './src/progression.js';

export function createLanServer({htmlPath=new URL('./dist/index.html',import.meta.url),storePromise=Promise.resolve(null)}={}){
  const rooms=new Map(),clients=new Set(),accounts=createAccounts(storePromise);
  const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>512*1024){ws.close(1013,'Connection too slow');return;}ws.send(JSON.stringify(data));}};
  const error=(ws,message)=>send(ws,{type:'error',message});
  const broadcast=(r,m,except)=>{for(const p of r.players)if(p!==except)send(p,m);};
  const roster=r=>r.players.map(p=>({id:p.playerId,username:p.username,side:p.side,skin:p.skin,level:p.level,host:p===r.host,account:!!p.accountId}));
  const lobby=r=>broadcast(r,{type:'roster',players:roster(r),config:r.config,started:r.started});
  const server=http.createServer(async(req,res)=>{
    if(await accounts.handle(req,res))return;
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=(req.url||'/').split('?')[0];
    if(path==='/lan-info'||path==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({name:'Summit Volley',protocol:PROTOCOL,maxPlayers:12}));return;}
    if(!['/','/index.html'].includes(path)){res.writeHead(404);res.end('Not found');return;}
    try{const html=await readFile(htmlPath);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:html);}catch{res.writeHead(503);res.end('Run npm run build, then restart.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:32*1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    let same=true;try{if(req.headers.origin)same=new URL(req.headers.origin).host===req.headers.host;}catch{same=false;}
    if(req.url!=='/lan'||!same||clients.size>=96){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function leave(ws){const r=rooms.get(ws.room);if(!r)return;ws.room=null;if(ws===r.host){rooms.delete(r.code);for(const p of r.players)if(p!==ws){p.room=null;send(p,{type:'host-left'});}}else{r.players=r.players.filter(p=>p!==ws);broadcast(r,{type:'player-left',id:ws.playerId});lobby(r);}}
  async function identity(ws,msg){const a=await accounts.identify(ws.request);ws.accountId=a?.id;ws.username=a?.username||'Guest_'+String(msg.name||randomBytes(2).toString('hex')).replace(/[^a-zA-Z0-9_]/g,'').slice(0,12);ws.skin=a?.profile.skin||(SKINS.some(s=>s.id===msg.skin)?msg.skin:'club');ws.level=a?levelFor(a.profile.xp):1;ws.ownedCourts=a?.profile.courts||COURTS.map(c=>c.id);}
  async function grant(r,state){
    const total=state.scores[1]+state.scores[-1],now=Date.now();if(total<r.score||total>r.score+1)return;
    if(total>r.score){r.score=total;if(now-r.rewardAt<1500)return;r.rewardAt=now;
      for(const p of r.players){const touches=Math.max(0,Math.min(15,(state.players.find(x=>x.human===p.playerId)?.touchCount||0)-(p.lastTouches||0)));p.lastTouches=state.players.find(x=>x.human===p.playerId)?.touchCount||0;
        const event={id:r.matchId+':r'+total,rallies:1,touches};send(p,{type:'reward-event',event});if(p.accountId)try{send(p,{type:'account',account:await accounts.award(p.accountId,event)});}catch{send(p,{type:'save-error',message:'Progress could not save. Check your connection and database.'});}}
    }
    if(state.phase==='ended'&&!r.finished&&Math.max(state.scores[1],state.scores[-1])>=r.config.points&&Math.abs(state.scores[1]-state.scores[-1])>=2&&now-r.startedAt>15000){r.finished=true;const winner=state.scores[1]>state.scores[-1]?1:-1;
      for(const p of r.players){const event={id:r.matchId+':end',finished:true,won:p.side===winner};send(p,{type:'reward-event',event});if(p.accountId)try{send(p,{type:'account',account:await accounts.award(p.accountId,event)});}catch{send(p,{type:'save-error',message:'Match rewards could not save. Database unavailable.'});}}
    }
  }
  wss.on('connection',(ws,req)=>{
    clients.add(ws);ws.request=req;ws.alive=true;ws.seq=-1;ws.rateAt=Date.now();ws.rateCount=0;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});send(ws,{type:'hello',protocol:PROTOCOL});
    ws.on('message',async(bytes,binary)=>{try{
      if(binary)return;const now=Date.now();if(now-ws.rateAt>1000){ws.rateAt=now;ws.rateCount=0;}if(++ws.rateCount>140){ws.close(1008,'Too many messages');return;}
      let m;try{m=JSON.parse(bytes);}catch{return error(ws,'Invalid message.');}if(!m||typeof m.type!=='string')return;
      if(['host','join'].includes(m.type)){
        if(ws.room||ws.joining)return error(ws,'Leave your current room first.');ws.joining=true;try{await identity(ws,m);if(ws.readyState!==WebSocket.OPEN)return;
        if(m.type==='host'){if(rooms.size>=8)return error(ws,'Server full. Try later.');let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));ws.playerId=1;ws.side=1;ws.room=code;const r={code,host:ws,players:[ws],started:false,config:cleanConfig(m.config)};rooms.set(code,r);send(ws,{type:'room',role:'host',code,id:1});lobby(r);}
        else{const r=rooms.get(String(m.code||'').trim().toUpperCase());if(!r)return error(ws,'Room not found. Check the code.');if(r.started&&!r.finished)return error(ws,'Match in progress. Ask the host to return to the lobby.');if(r.players.length>=12)return error(ws,'Room full: maximum 12 players.');if(ws.accountId&&r.players.some(p=>p.accountId===ws.accountId))return error(ws,'This account is already in the room.');const used=new Set(r.players.map(p=>p.playerId));ws.playerId=Array.from({length:12},(_,i)=>i+1).find(i=>!used.has(i));ws.side=r.players.filter(p=>p.side===1).length<=r.players.filter(p=>p.side===-1).length?1:-1;ws.room=r.code;ws.seq=-1;r.players.push(ws);send(ws,{type:'room',role:'guest',code:r.code,id:ws.playerId});lobby(r);}
        }finally{ws.joining=false;}return;
      }
      if(m.type==='leave'){leave(ws);return;}const r=rooms.get(ws.room);if(!r)return;
      if(m.type==='team'&&(!r.started||r.finished)){const side=m.side===-1?-1:1;if(r.players.filter(p=>p!==ws&&p.side===side).length>=6)return error(ws,'That team already has six players.');ws.side=side;lobby(r);return;}
      if(m.type==='lobby'&&ws===r.host){r.started=false;broadcast(r,{type:'lobby'});lobby(r);return;}
      if(m.type==='start'&&ws===r.host){
        r.config=cleanConfig(m.config);r.config.size=Math.max(r.config.size,...[1,-1].map(side=>r.players.filter(p=>p.side===side).length));if(!ws.ownedCourts.includes(r.config.court))r.config.court='alpine';
        r.started=true;r.finished=false;r.score=0;r.startedAt=now;r.rewardAt=now;r.matchId=randomUUID();r.rewardQueue=Promise.resolve();for(const p of r.players){p.seq=-1;p.lastTouches=0;}
        broadcast(r,{type:'start',config:r.config,players:roster(r),matchId:r.matchId});return;
      }
      if(!r.started)return;
      if(m.type==='input'&&ws!==r.host){const input=cleanInput(m.input);if(input&&input.seq>ws.seq){ws.seq=input.seq;send(r.host,{type:'input',id:ws.playerId,input});}return;}
      if(m.type==='action'&&ws!==r.host){const a=cleanAction(m);if(a)send(r.host,{type:'action',id:ws.playerId,...a});return;}
      if(m.type==='snapshot'&&ws===r.host&&validSnapshot(m.state)){broadcast(r,{type:'snapshot',state:m.state},ws);if(m.state.scores[1]+m.state.scores[-1]>r.score||m.state.phase==='ended')r.rewardQueue=r.rewardQueue.then(()=>grant(r,m.state)).catch(()=>{});}
    }catch{error(ws,'The server could not complete that request. Try again.');}});
    ws.on('close',()=>{leave(ws);clients.delete(ws);});
  });
  const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);heartbeat.unref();
  const close=async()=>{clearInterval(heartbeat);await Promise.all([...rooms.values()].map(r=>r.rewardQueue));for(const ws of clients)ws.terminate();await new Promise(resolve=>{wss.close();server.close(resolve);});await (await storePromise)?.close();};
  return {server,wss,rooms,close};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const storePromise=openAccountStore();storePromise.catch(()=>{console.error('Account database could not open. Check DATABASE_URL.');process.exit(1);});
  const app=createLanServer({storePromise}),port=Number(arg('--port')||process.env.PORT)||3000,host=arg('--host')||process.env.HOST||'0.0.0.0';
  app.server.listen(port,host,()=>{console.log(`Summit Volley: http://localhost:${port}`);for(const group of Object.values(networkInterfaces()))for(const a of group||[])if(a.family==='IPv4'&&!a.internal)console.log(`LAN: http://${a.address}:${port}`);if(process.env.RENDER&&!process.env.DATABASE_URL&&!process.env.DATA_DIR)console.log('Guest play ready. Set DATABASE_URL for durable accounts on Render.');});
  app.server.on('error',e=>{console.error(e.message);process.exitCode=1;});for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
