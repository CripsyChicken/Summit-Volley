import {test} from 'node:test';
import assert from 'node:assert/strict';
import {match} from './fixture.mjs';
test('AI shifts off-ball, looks around, and sometimes misreads a reachable ball',()=>{
 const g=match(2),p=g.players[1];g.simTime=1;g.aiTarget(p);const first=[p.moveX,p.moveZ,p.lookX,p.lookZ];g.simTime=3;g.aiTarget(p);assert.notDeepEqual([p.moveX,p.moveZ,p.lookX,p.lookZ],first);
 const original=Math.random;try{Math.random=()=>0;g.phase='live';g.ball={x:p.x,y:1.8,z:p.z,vx:0,vy:-1,vz:0};p.cooldown=0;p.contactRead=-1;g.rallyHits=1;g.aiHit(p);assert.equal(p.misread,true);assert.equal(g.rallyHits,1);g.resetRally();assert.equal(p.misread,false);assert.equal(p.contactRead,-1);}finally{Math.random=original;}
});
