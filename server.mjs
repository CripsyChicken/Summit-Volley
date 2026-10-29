import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL,cleanConfig,cleanInput,cleanAction,validSnapshot } from './src/lan-protocol.js';

// Local-room relay. The host browser owns physics; guests send only input.
// Nothing outside dist/index.html is served, and no match data is written to disk.
export function createLanServer({htmlPath=new URL('./dist/index.html',import.meta.url)}={}){
  const rooms=new Map();const clients=new Set();
  const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>512*1024){ws.close(1013,'Connection too slow');return;}ws.send(JSON.stringify(data));}};
  const error=(ws,message)=>send(ws,{type:'error',message});
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const path=(req.url||'/').split('?')[0];
    if(path==='/lan-info'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({name:'Summit Volley LAN',protocol:PROTOCOL}));return;}
    if(!['/','/index.html'].includes(path)){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;}
    try{const html=await readFile(htmlPath);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:html);}catch{res.writeHead(503,{'Content-Type':'text/plain'});res.end('Run npm run build, then restart the server.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:32*1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    let sameOrigin=true;try{if(req.headers.origin)sameOrigin=new URL(req.headers.origin).host===req.headers.host;}catch{sameOrigin=false;}
    if(req.url!=='/lan'||!sameOrigin||clients.size>=32){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function leave(ws){
    const room=rooms.get(ws.room);if(!room)return;ws.room=null;
    if(room.host===ws){rooms.delete(room.code);if(room.guest){room.guest.room=null;send(room.guest,{type:'host-left'});}}
    else if(room.guest===ws){room.guest=null;room.started=false;send(room.host,{type:'guest-left'});}
  }
  wss.on('connection',ws=>{
    clients.add(ws);ws.alive=true;ws.seq=-1;ws.rateAt=Date.now();ws.rateCount=0;
    ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
    send(ws,{type:'hello',protocol:PROTOCOL});
    ws.on('message',(bytes,isBinary)=>{
      if(isBinary)return;const now=Date.now();if(now-ws.rateAt>1000){ws.rateAt=now;ws.rateCount=0;}if(++ws.rateCount>140){ws.close(1008,'Too many messages');return;}
      let msg;try{msg=JSON.parse(bytes.toString());}catch{return error(ws,'Invalid message.');}if(!msg||typeof msg.type!=='string')return;
      if(msg.type==='host'){
        if(ws.room)return error(ws,'Leave the current room first.');if(rooms.size>=16)return error(ws,'The server is full.');
        let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
        rooms.set(code,{code,host:ws,guest:null,started:false});ws.room=code;ws.role='host';send(ws,{type:'room',role:'host',code});return;
      }
      if(msg.type==='join'){
        if(ws.room)return error(ws,'Leave the current room first.');const code=String(msg.code||'').trim().toUpperCase();const room=rooms.get(code);
        if(!room)return error(ws,'Room not found. Check the code and server address.');if(room.guest)return error(ws,'This room already has two players.');
        room.guest=ws;ws.room=code;ws.role='guest';ws.seq=-1;send(ws,{type:'room',role:'guest',code});send(room.host,{type:'guest-joined'});return;
      }
      if(msg.type==='leave'){leave(ws);return;}
      const room=rooms.get(ws.room);if(!room)return;
      if(msg.type==='start'&&room.host===ws){if(!room.guest)return error(ws,'Wait for a second player.');room.started=true;room.guest.seq=-1;send(room.guest,{type:'start',config:cleanConfig(msg.config)});return;}
      if(msg.type==='pause'&&room.guest===ws){send(room.host,{type:'peer-pause',paused:!!msg.paused});return;}
      if(!room.started)return;
      if(msg.type==='input'&&room.guest===ws){const input=cleanInput(msg.input);if(input&&input.seq>ws.seq){ws.seq=input.seq;send(room.host,{type:'input',input});}return;}
      if(msg.type==='action'&&room.guest===ws){const action=cleanAction(msg);if(action)send(room.host,{type:'action',...action});return;}
      if(msg.type==='snapshot'&&room.host===ws){if(validSnapshot(msg.state))send(room.guest,{type:'snapshot',state:msg.state});return;}
    });
    ws.on('close',()=>{leave(ws);clients.delete(ws);});
  });
  const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);heartbeat.unref();
  const close=()=>new Promise(resolve=>{clearInterval(heartbeat);for(const ws of clients)ws.terminate();wss.close();server.close(resolve);});
  return {server,wss,rooms,close};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const app=createLanServer();const port=Number(arg('--port')||process.env.PORT)||3000;const host=arg('--host')||process.env.HOST||'0.0.0.0';
  app.server.listen(port,host,()=>{
    console.log(`Summit Volley LAN: http://localhost:${port}`);
    for(const group of Object.values(networkInterfaces()))for(const address of group||[])if(address.family==='IPv4'&&!address.internal)console.log(`Other devices on this network: http://${address.address}:${port}`);
    console.log('Open that address on both devices. Choose LAN multiplayer, host a room, and share its room code.');
  });
  app.server.on('error',e=>{console.error(`Could not start LAN server: ${e.message}`);process.exitCode=1;});
  for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
