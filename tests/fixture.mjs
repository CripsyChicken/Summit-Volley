import { SummitVolley } from '../src/game.js';
// Exercise the actual gameplay engine without rendering, audio, or UI.
export function match(size=2){
  const g=Object.create(SummitVolley.prototype);
  Object.assign(g,{settings:{},config:{size,difficulty:'club',points:7,color:'green'},phase:'serve',mode:'quick',paused:false,simTime:0,phaseTime:0,announcement:0,keys:new Set(),mobile:{x:0,z:0},aim:{x:0,z:-6},aim2:{x:0,z:6},charge:null,machine:false,players:[],ball:{x:0,y:2,z:8,vx:0,vy:0,vz:0},scores:{1:0,'-1':0},servingSide:1,lastTouchSide:1,touchSide:1,touches:0,rallyHits:0,hitCooldown:0,stats:{rallies:0,hits:0,best:0},audio:{play(){}},world:{burst(){},practiceTargets:[]}});
  g.announce=()=>{};g.updateScore=()=>{};g.endMatch=()=>{g.phase='ended';};
  for(const side of[1,-1])for(let i=0;i<size;i++)g.players.push({side,index:g.players.length,human:0,x:0,y:0,z:side*5.5,vx:0,vy:0,vz:0,homeX:size===1?0:i%2?-2:2,homeZ:side*(i<2?5.5:2.5),action:'idle',actionTime:0,block:false,land:0,cooldown:0,queued:null,decision:0,moveX:0,moveZ:side*5.5,jumpTime:0});
  g.resetRally();return g;
}

