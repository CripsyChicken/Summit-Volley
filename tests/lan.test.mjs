import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createLanServer} from '../server.mjs';
import {LanGame,neutralInput} from '../src/lan-game.js';
import {PROTOCOL,validSnapshot,cleanInput} from '../src/lan-protocol.js';
import {normalizeBindings} from '../src/bindings.js';
import {match} from './fixture.mjs';
export function client(url,options){const ws=new WebSocket(url,options),messages=[],waiters=[];ws.on('message',b=>{messages.push(JSON.parse(b));for(const fn of [...waiters])fn();});const take=type=>new Promise((resolve,reject)=>{const check=()=>{const i=messages.findIndex(m=>m.type===type);if(i>=0){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(messages.splice(i,1)[0]);}};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Timed out: '+type));},3000);waiters.push(check);check();});return {ws,take,messages,send:m=>ws.send(JSON.stringify(m))};}
test('12 real sockets, team capacity, co-op, sender isolation, rematch, and AI substitution',{timeout:15000},async()=>{
 const app=createLanServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const port=app.server.address().port,peers=[];
 try{
  const info=await fetch(`http://127.0.0.1:${port}/lan-info`).then(r=>r.json());assert.equal(info.protocol,PROTOCOL);assert.equal((await fetch(`http://127.0.0.1:${port}/accounts.mjs`)).status,404);
  for(let i=0;i<13;i++){peers.push(client(`ws://127.0.0.1:${port}/lan`));await peers.at(-1).take('hello');}
  const host=peers[0];host.send({type:'host',name:'Host'});const room=await host.take('room');await host.take('roster');
  for(let i=1;i<12;i++){peers[i].send({type:'join',code:room.code,name:'P'+i});const joined=await peers[i].take('room');assert.equal(joined.id,i+1);await host.take('roster');}
  peers[12].send({type:'join',code:room.code});assert.match((await peers[12].take('error')).message,/12 players/);
  peers[1].send({type:'team',side:1});assert.match((await peers[1].take('error')).message,/six players/);
  host.send({type:'start',config:{size:1,points:7}});const start=await host.take('start');assert.equal(start.config.size,6);assert.equal(start.players.length,12);for(const p of peers.slice(1,12))await p.take('start');
  peers[7].send({type:'input',id:1,input:{seq:1,x:1,z:0,aimX:2,aimZ:-6,jump:false}});const input=await host.take('input');assert.equal(input.id,8);
  const game=match(6);game.mode='lan';game.bindings=normalizeBindings();game.remoteInputs={};game.lan={role:'host',id:1};for(let i=0;i<12;i++)game.players[i].human=i+1;
  const adapter={role:'host',game,lastInputs:{}};LanGame.prototype.receive.call(adapter,input);const x=game.players[7].x;for(let i=0;i<30;i++)game.step(1/120);assert.ok(game.players[7].x>x+1);
  peers[7].send({type:'action',action:'jump'});LanGame.prototype.receive.call(adapter,await host.take('action'));assert.ok(game.players[7].vy>0);
  const state=LanGame.prototype.snapshot.call({game});assert.ok(validSnapshot(state));host.send({type:'snapshot',state});assert.deepEqual((await peers[1].take('snapshot')).state.ball,state.ball);
  const viewerGame=match(6);viewerGame.mode='lan';const viewer={game:viewerGame,target:null,noticeId:-1};LanGame.prototype.apply.call(viewer,state);assert.deepEqual(viewerGame.ball,state.ball);
  peers[7].ws.close();const left=await host.take('player-left');assert.equal(left.id,8);game.world.refreshLabels=()=>{};adapter.status=()=>{};LanGame.prototype.receive.call(adapter,left);assert.equal(game.players[7].human,0);
  host.send({type:'lobby'});await host.take('lobby');peers[12].send({type:'join',code:room.code});assert.equal((await peers[12].take('room')).id,8);
  for(const p of peers.slice(2,7))p.ws.close();for(let i=0;i<5;i++)await host.take('player-left');peers[1].send({type:'team',side:1});
  // Read authoritative room state after the team update has traversed the socket.
  let changed;for(let i=0;i<20;i++){changed=await peers[1].take('roster');if(changed.players.find(p=>p.id===2)?.side===1)break;}assert.equal(changed.players.find(p=>p.id===2).side,1);
  host.send({type:'start',config:{size:6}});const coop=await host.take('start');assert.equal(coop.players.find(p=>p.id===1).side,coop.players.find(p=>p.id===2).side);
  host.ws.close();await peers[1].take('host-left');assert.equal(app.rooms.size,0);
 }finally{for(const p of peers)p.ws.terminate();await app.close();}
});
test('every online client uses P1 bindings while same-keyboard P2 stays independent',()=>{const game=match(1);game.bindings=normalizeBindings();game.mode='lan';game.lan={role:'guest',id:9,action(a){game.lastAction=a;}};game.players[1].human=9;game.inputDown('KeyW');assert.equal(game.inputFor(9).z,-1);game.inputDown('Space');assert.equal(game.lastAction,'jump');game.inputDown('KeyE');assert.equal(game.lastAction,'bump');assert.equal(game.controlProfile(9),1);game.keys.clear();game.inputDown('KeyI');assert.equal(game.inputFor(9).z,0);game.mode='local';game.keys.clear();game.inputDown('KeyI');assert.equal(game.inputFor(2).z,-1);});
test('LAN rejects malformed input and cross-origin sockets',{timeout:5000},async()=>{assert.equal(cleanInput({seq:0,x:100,z:0,aimX:0,aimZ:6}),null);assert.equal(validSnapshot({phase:'live'}),false);const app=createLanServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/lan`,{origin:'http://different-site.invalid'});ws.on('error',()=>{});try{const [,res]=await once(ws,'unexpected-response');assert.equal(res.statusCode,403);res.resume();}finally{ws.terminate();await app.close();}});
