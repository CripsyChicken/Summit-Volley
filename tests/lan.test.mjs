import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createLanServer } from '../server.mjs';
import { LanGame,neutralInput } from '../src/lan-game.js';
import { validSnapshot,cleanInput } from '../src/lan-protocol.js';
import { normalizeBindings } from '../src/bindings.js';
import { match } from './fixture.mjs';

function client(url){
  const ws=new WebSocket(url);const messages=[];const waiters=[];
  ws.on('message',b=>{const m=JSON.parse(b.toString());messages.push(m);for(const fn of [...waiters])fn();});
  const take=type=>new Promise((resolve,reject)=>{const check=()=>{const i=messages.findIndex(m=>m.type===type);if(i>=0){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(messages.splice(i,1)[0]);}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Timed out waiting for '+type));},2000);waiters.push(check);check();});
  return {ws,take,messages,send:m=>ws.send(JSON.stringify(m))};
}

test('real LAN sockets host, join, relay input and physics, pause, rematch, and disconnect',{timeout:12000},async()=>{
  const app=createLanServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const port=app.server.address().port;
  const host=client(`ws://127.0.0.1:${port}/lan`),guest=client(`ws://127.0.0.1:${port}/lan`),third=client(`ws://127.0.0.1:${port}/lan`);
  try{
    const info=await fetch(`http://127.0.0.1:${port}/lan-info`).then(r=>r.json());assert.equal(info.protocol,1);
    assert.equal((await fetch(`http://127.0.0.1:${port}/server.mjs`)).status,404);
    await Promise.all([host.take('hello'),guest.take('hello'),third.take('hello')]);
    host.send({type:'host'});const room=await host.take('room');assert.match(room.code,/^[A-F0-9]{6}$/);
    guest.send({type:'join',code:room.code});assert.equal((await guest.take('room')).role,'guest');await host.take('guest-joined');
    third.send({type:'join',code:room.code});assert.match((await third.take('error')).message,/two players/);
    host.send({type:'start',config:{size:1,points:7,difficulty:'club',color:'green'}});assert.equal((await guest.take('start')).config.size,1);
    const game=match(1);game.mode='lan';game.players[0].human=1;game.players[1].human=2;game.bindings=normalizeBindings();game.remoteInput=neutralInput();game.lan={role:'host'};
    const adapter={role:'host',game,lastInputAt:0};
    guest.send({type:'input',input:{seq:1,x:1,z:0,aimX:2,aimZ:6,jump:false,block:false,sprint:false}});
    LanGame.prototype.receive.call(adapter,await host.take('input'));
    const x=game.players[1].x;for(let i=0;i<30;i++)game.step(1/120);assert.ok(game.players[1].x>x+1);
    guest.send({type:'action',action:'jump'});LanGame.prototype.receive.call(adapter,await host.take('action'));assert.ok(game.players[1].vy>0);
    game.queue(1,'primary',.7);game.step(1/120);for(let i=0;i<60;i++)game.step(1/120);assert.equal(game.phase,'live');
    const snapshot=LanGame.prototype.snapshot.call({game});assert.ok(validSnapshot(snapshot));host.send({type:'snapshot',state:snapshot});const received=(await guest.take('snapshot')).state;
    assert.deepEqual(received.ball,snapshot.ball);assert.deepEqual(received.scores,snapshot.scores);
    const guestGame=match(1);guestGame.players[0].human=1;guestGame.players[1].human=2;guestGame.mode='lan';const viewer={game:guestGame,target:null,noticeId:-1};LanGame.prototype.apply.call(viewer,received);assert.deepEqual(guestGame.ball,snapshot.ball);
    guest.send({type:'pause',paused:true});const pause=await host.take('peer-pause');LanGame.prototype.receive.call(adapter,pause);const before=game.simTime;game.step(1/120);assert.equal(game.simTime,before);
    guest.send({type:'pause',paused:false});LanGame.prototype.receive.call(adapter,await host.take('peer-pause'));game.step(1/120);assert.ok(game.simTime>before);
    host.send({type:'start',config:{size:2,points:11}});assert.equal((await guest.take('start')).config.size,2);
    guest.ws.close();await host.take('guest-left');third.send({type:'join',code:room.code});await third.take('room');await host.take('guest-joined');
    host.ws.close();await third.take('host-left');assert.equal(app.rooms.size,0);
  }finally{host.ws.terminate();guest.ws.terminate();third.ws.terminate();await app.close();}
});

test('LAN rejects malformed input and cross-origin browser sockets',{timeout:5000},async()=>{
  assert.equal(cleanInput({seq:0,x:100,z:0,aimX:0,aimZ:6}),null);assert.equal(validSnapshot({phase:'live'}),false);
  const app=createLanServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/lan`,{origin:'http://different-site.invalid'});ws.on('error',()=>{});
  try{const [,response]=await once(ws,'unexpected-response');assert.equal(response.statusCode,403);response.resume();}finally{ws.terminate();await app.close();}
});
