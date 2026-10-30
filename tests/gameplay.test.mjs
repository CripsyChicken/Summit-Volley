import { test } from 'node:test';
import assert from 'node:assert/strict';
import { match } from './fixture.mjs';
import { predict } from '../src/physics.js';

test('AI 1v1 and 2v2 produce rallies and complete a win-by-two match',()=>{
  const original=Math.random;let seed=890;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  try{for(const size of[1,2]){
    const g=match(size);let maxHits=0;
    for(let i=0;i<120*900&&g.phase!=='ended';i++){g.step(1/120);maxHits=Math.max(maxHits,g.rallyHits);assert.ok(Number.isFinite(g.ball.x+g.ball.y+g.ball.z));}
    console.log(JSON.stringify({size,score:g.scores,maxHits,rallies:g.stats.rallies,seconds:g.simTime}));
    assert.ok(maxHits>=3,`${size}v${size} has real returns`);
    assert.equal(g.phase,'ended');
    assert.ok(Math.max(g.scores[1],g.scores[-1])>=7);
    assert.ok(Math.abs(g.scores[1]-g.scores[-1])>=2);
  }}finally{Math.random=original;}
});

test('a rally can score only once, and a fourth touch awards the other team',()=>{
  const g=match();g.phase='live';g.touchSide=1;g.touches=3;
  assert.equal(g.recordTouch(g.players[0]),false);assert.equal(g.scores[-1],1);
  g.awardPoint(-1,'Duplicate floor event');assert.equal(g.scores[-1],1);assert.equal(g.stats.rallies,1);
});

test('pause freezes both players and the ball; movement respects the net',()=>{
  const g=match(1);g.players[0].human=1;g.keys.add('KeyW');
  for(let i=0;i<600;i++)g.step(1/120);
  assert.ok(g.players[0].z>=.5&&g.players[0].z<1);
  g.paused=true;const before=JSON.stringify({ball:g.ball,players:g.players,scores:g.scores});
  for(let i=0;i<120;i++)g.step(1/120);
  assert.equal(JSON.stringify({ball:g.ball,players:g.players,scores:g.scores}),before);
});

test('practice ball machine launches a physical ball without competitive points',()=>{
  const g=match(1);g.mode='practice';g.machine=true;g.players=g.players.slice(0,1);g.players[0].human=1;g.resetRally();
  for(let i=0;i<120;i++)g.step(1/120);
  assert.equal(g.phase,'live');assert.ok(g.ball.vz>0);
  for(let i=0;i<120*4;i++)g.step(1/120);
  assert.deepEqual(g.scores,{1:0,'-1':0});assert.ok(g.stats.rallies>=1);
});

test('a human serve follows the selected aim, and out-of-range swings cannot hit',()=>{
  const g=match(1);const p=g.players[0];p.human=1;g.aim={x:3.1,z:-7.5};
  g.queue(1,'primary',.8);g.step(1/120);
  assert.equal(g.phase,'live');assert.equal(g.stats.hits,1);
  const landing=predict(g.ball);assert.ok(Math.abs(landing.x-3.1)<.001);assert.ok(Math.abs(landing.z+7.5)<.001);
  p.cooldown=0;g.hitCooldown=0;g.ball.x=4;p.x=-4;
  const before={...g.ball};assert.equal(g.hit(p,'primary',1),false);assert.deepEqual(g.ball,before);
});

test('local players charge independently and blocks return an incoming attack',()=>{
  const g=match(1);g.mode='local';g.players[0].human=1;g.players[1].human=2;
  g.beginCharge(1);g.simTime=.2;g.beginCharge(2);g.simTime=.5;g.releaseCharge(1);
  assert.ok(g.charge2);assert.ok(g.players[0].queued);assert.equal(g.players[1].queued,null);
  g.releaseCharge(2);assert.ok(g.players[1].queued);
  const p=g.players[0];g.phase='live';p.z=.7;p.x=0;p.y=.5;p.block=true;p.cooldown=0;
  Object.assign(g.ball,{x:0,z:.5,y:2.7,vx:1,vy:-3,vz:13});g.hitCooldown=0;
  assert.equal(g.blockContact(p),true);assert.ok(g.ball.vz<0);assert.equal(g.lastTouchSide,1);
});
