import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {openAccountStore} from '../account-store.mjs';
import {createLanServer} from '../server.mjs';
import {createAccounts} from '../accounts.mjs';
import {WebSocket} from 'ws';
import {match} from './fixture.mjs';
import {LanGame} from '../src/lan-game.js';
import {reward,freshProfile,customize,levelFor} from '../src/progression.js';
test('accounts authenticate, save atomic rewards/cosmetics, survive restart, and revoke cookies',{timeout:15000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'volley-accounts-'));let store=await openAccountStore({dataDir:dir,disabled:false}),app=createLanServer({storePromise:Promise.resolve(store)});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let url=`http://127.0.0.1:${app.server.address().port}`,cookie='';
 const call=async(route,body,origin=url)=>{const res=await fetch(url+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};};
 try{
  const reg=await call('register',{username:'TestHiker',password:'test-passphrase-284'});assert.equal(reg.status,200);assert.match(reg.cookie,/HttpOnly/);assert.match(reg.cookie,/SameSite=Lax/);assert.equal(reg.data.account.username,'TestHiker');cookie=reg.cookie.split(';')[0];
  assert.equal((await call('me')).data.account.username,'TestHiker');assert.equal((await call('login',{username:'TestHiker',password:'wrong-password'})).status,400);
  assert.equal((await call('register',{username:'testhiker',password:'other-password'})).status,400);assert.equal((await call('customize',{kind:'skin',id:'sunrise'},'https://evil.invalid')).status,403);
  const a=await store.find('testhiker'),auth=createAccounts(Promise.resolve(store));await Promise.all(Array.from({length:20},(_,i)=>auth.award(a.id,{id:'r'+i,rallies:1,touches:2})));const before=(await store.get(a.id)).profile;await auth.award(a.id,{id:'r1',rallies:1,touches:2});assert.deepEqual((await store.get(a.id)).profile,before);assert.ok(before.coins>=120);
  const bought=await call('customize',{kind:'skin',id:'sunrise'});assert.equal(bought.data.account.profile.skin,'sunrise');const coins=bought.data.account.profile.coins;assert.equal(coins,before.coins-60);assert.equal((await call('customize',{kind:'skin',id:'sunrise'})).data.account.profile.coins,coins);
  assert.equal((await call('customize',{kind:'skin',id:'fake',coins:999999})).status,400);
  const ws=new WebSocket(url.replace('http:','ws:')+'/lan',{headers:{cookie}}),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));
  const take=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',check);reject(new Error('Missing '+type));},2000);const check=()=>{const i=messages.findIndex(m=>m.type===type);if(i>=0){clearTimeout(timer);ws.off('message',check);resolve(messages.splice(i,1)[0]);}};ws.on('message',check);check();});
  try{await take('hello');ws.send(JSON.stringify({type:'host',name:'SpoofedName'}));const room=await take('room');const roster=await take('roster');assert.equal(roster.players[0].username,'TestHiker');assert.equal(roster.players[0].skin,'sunrise');ws.send(JSON.stringify({type:'start',config:{size:1}}));await take('start');app.rooms.get(room.code).rewardAt=Date.now()-2000;const g=match(1);g.players[0].human=1;g.players[0].touchCount=3;g.phase='point';g.scores[1]=1;ws.send(JSON.stringify({type:'snapshot',state:LanGame.prototype.snapshot.call({game:g})}));await take('reward-event');const saved=await take('account');assert.equal(saved.account.profile.coins,coins+3);assert.equal(saved.account.profile.xp,bought.data.account.profile.xp+14);}finally{ws.terminate();}
  const disk=await readFile(path.join(dir,'accounts.json'),'utf8');assert.ok(!disk.includes('test-passphrase-284'));assert.ok(!disk.includes(cookie.split('=')[1]));
  await app.close();store=await openAccountStore({dataDir:dir,disabled:false});app=createLanServer({storePromise:Promise.resolve(store)});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');url=`http://127.0.0.1:${app.server.address().port}`;
  const restored=await call('me');assert.equal(restored.data.account.profile.skin,'sunrise');assert.equal(restored.data.account.profile.coins,coins+3);await call('logout',{});assert.equal((await call('me')).data.account,null);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('unconfigured cloud storage disables account creation without pretending to save',async()=>{assert.equal(await openAccountStore({disabled:true}),null);});
test('quests, levels, purchases, day rollover, and duplicate events',()=>{let p=freshProfile();for(let i=0;i<12;i++)p=reward(p,{id:'round'+i,rallies:1,touches:3});assert.ok(p.daily.claimed.includes('rallies'));assert.ok(p.daily.claimed.includes('touches'));assert.ok(levelFor(p.xp)>1);const once=JSON.stringify(p);assert.equal(JSON.stringify(reward(p,{id:'round1',rallies:1})),once);const equipped=customize(p,'court','sunset');assert.equal(equipped.court,'sunset');assert.equal(equipped.coins,p.coins-180);p.daily.day='2000-01-01';p=reward(p,{id:'newday',rallies:1});assert.equal(p.daily.rallies,1);assert.equal(p.daily.claimed.length,0);});
