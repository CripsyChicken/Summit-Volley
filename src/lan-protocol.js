export const PROTOCOL = 2;
const finite=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
export function cleanConfig(c={}){return {size:Math.max(1,Math.min(6,Math.round(Number(c.size)||2))),difficulty:['casual','club','summit'].includes(c.difficulty)?c.difficulty:'club',points:[7,11,21].includes(c.points)?c.points:11,color:c.color==='orange'?'orange':'green',court:['alpine','sunset','glacier','twilight'].includes(c.court)?c.court:'alpine'};}
export function cleanInput(input){
  if(!input||!finite(input.seq,0,1e12)||!Number.isInteger(input.seq))return null;
  if(!['x','z'].every(k=>finite(input[k],-1,1))||!finite(input.aimX,-5.4,5.4)||!finite(input.aimZ,-10,10))return null;
  return {seq:input.seq,x:input.x,z:input.z,aimX:input.aimX,aimZ:input.aimZ,jump:!!input.jump,block:!!input.block,sprint:!!input.sprint};
}
export function cleanAction(a){if(!a||!['jump','hit','set','bump'].includes(a.action))return null;return {action:a.action,power:Number.isFinite(a.power)?Math.max(.15,Math.min(1,a.power)):.5};}
export function validSnapshot(s){
  return !!s&&['serve','live','point','ended'].includes(s.phase)&&finite(s.simTime,0,1e9)&&finite(s.phaseTime,0,1e9)&&
    s.ball&&['x','y','z','vx','vy','vz'].every(k=>finite(s.ball[k],-100,100))&&
    Array.isArray(s.players)&&s.players.length>=2&&s.players.length<=12&&s.players.every(p=>p&&[-1,1].includes(p.side)&&Number.isInteger(p.human)&&finite(p.human,0,12)&&['x','y','z','vx','vy','vz','cooldown','actionTime'].every(k=>finite(p[k],-100,100))&&finite(p.touchCount||0,0,100000))&&
    s.scores&&[1,-1].every(k=>Number.isInteger(s.scores[k])&&finite(s.scores[k],0,99999))&&[-1,1].includes(s.servingSide)&&[-1,1].includes(s.touchSide)&&[-1,1].includes(s.lastTouchSide)&&finite(s.touches,0,4)&&finite(s.rallyHits,0,999999)&&s.aim&&s.aim2&&[s.aim,s.aim2].every(a=>finite(a.x,-5.4,5.4)&&finite(a.z,-10,10))&&s.stats&&['rallies','hits','best'].every(k=>finite(s.stats[k],0,1e9))&&(!s.notice||['title','tag','detail'].every(k=>typeof s.notice[k]==='string'&&s.notice[k].length<=200));
}
