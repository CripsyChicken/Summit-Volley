import { LanConnection } from './lan.js';
import { cleanConfig } from './lan-protocol.js';
import { clamp,lerp } from './physics.js';
const $=id=>document.getElementById(id);
export const neutralInput=()=>({x:0,z:0,aimX:0,aimZ:6,jump:false,block:false,sprint:false});
const motion=['x','y','z','vx','vy','vz','actionTime','cooldown','land'];
export class LanGame {
  constructor(game){
    this.game=game;this.connection=new LanConnection(m=>this.receive(m),m=>this.disconnected(m));this.timer=0;this.started=false;this.target=null;this.noticeId=-1;this.lastInputAt=0;
    $('lan-host').onclick=()=>this.connect('host');$('lan-join').onclick=()=>this.connect('join');$('lan-start').onclick=()=>{if(this.role==='host'&&this.peer)game.start('lan');};$('lan-leave').onclick=()=>{this.disconnect();game.goMenu();};
    $('lan-code').addEventListener('keydown',e=>{if(e.code==='Enter'){e.preventDefault();this.connect('join');}});
  }
  get role(){return this.connection.role;}get peer(){return this.connection.peer;}get code(){return this.connection.code;}
  status(text){$('lan-status').textContent=text;}
  lobby(){
    $('lan-connect-controls').hidden=!!this.role;$('lan-room-controls').hidden=!this.role;$('lan-room-code').textContent=this.code;
    $('lan-start').disabled=!(this.role==='host'&&this.peer);$('lan-start').hidden=this.role==='guest';
    $('lan-role').textContent=this.role==='guest'?'You are Player 2. Wait for the host to start.':this.peer?'Player 2 is connected. Ready to start.':'You are Player 1. Share this code with the other device.';
  }
  async connect(kind){
    const code=$('lan-code').value.trim().toUpperCase();if(kind==='join'&&!/^[A-F0-9]{6}$/.test(code)){this.status('Enter the six-character room code shown on the host’s screen.');return;}
    $('lan-host').disabled=$('lan-join').disabled=true;this.status('Connecting to this computer’s LAN server…');
    try{await this.connection.connect();this.connection.send(kind==='host'?{type:'host'}:{type:'join',code});}
    catch(error){this.status('LAN needs the local server. In the source folder run npm install, then npm start. Open the printed http:// address on both devices. '+(location.protocol==='file:'?'Opening an HTML file alone does not start a server.':error.message));}
    finally{$('lan-host').disabled=$('lan-join').disabled=false;}
  }
  start(config,fromNetwork=false){this.started=true;this.target=null;this.noticeId=-1;this.game.peerPaused=false;this.game.hostPaused=false;this.game.remoteInput=neutralInput();this.lastInputAt=Date.now();if(!fromNetwork&&this.role==='host')this.connection.send({type:'start',config});this.lobby();}
  pause(paused){if(this.role==='guest'&&this.started)this.connection.send({type:'pause',paused});}
  action(action,power){if(this.role==='guest'&&this.started&&!this.game.hostPaused)this.connection.action(action,power);}
  disconnect(){this.started=false;this.target=null;this.connection.close();this.game.peerPaused=false;this.game.hostPaused=false;this.game.remoteInput=neutralInput();this.lobby();$('network-status').hidden=true;}
  disconnected(message){
    this.started=false;this.target=null;this.game.peerPaused=false;this.game.hostPaused=false;this.game.remoteInput=neutralInput();
    this.game.goMenu();this.game.openModal('lan');this.status(message);this.lobby();
  }
  receive(m){
    const g=this.game;
    if(m.type==='room'){this.status(this.role==='host'?'Room created. Share its code with Player 2.':'Connected. The host chooses the match setup and starts.');this.lobby();}
    else if(m.type==='guest-joined'){this.status('Player 2 joined. Start when you are ready.');this.lobby();}
    else if(m.type==='error')this.status(m.message);
    else if(m.type==='host-left')this.disconnected('The host left the room. Host or join a new room to play again.');
    else if(m.type==='guest-left'){
      this.started=false;g.remoteInput=neutralInput();g.peerPaused=false;g.openModal('lan');this.status('Player 2 disconnected. Share this room code again, then start a new match.');this.lobby();
    }else if(m.type==='start'&&this.role==='guest'){g.config=cleanConfig(m.config);g.syncConfig();g.start('lan',true);}
    else if(m.type==='input'&&this.role==='host'){g.remoteInput=m.input;g.aim2={x:m.input.aimX,z:m.input.aimZ};this.lastInputAt=Date.now();}
    else if(m.type==='action'&&this.role==='host'&&!g.paused&&!g.peerPaused){const p=g.players.find(p=>p.human===2);if(m.action==='jump')g.jump(p);else g.queue(2,m.action==='hit'?'primary':m.action,m.power);}
    else if(m.type==='peer-pause'&&this.role==='host'){g.peerPaused=m.paused;g.remoteInput=neutralInput();}
    else if(m.type==='snapshot'&&this.role==='guest'&&this.started)this.apply(m.state);
  }
  snapshot(){const g=this.game;return {phase:g.phase,paused:g.paused||g.peerPaused,phaseTime:g.phaseTime,simTime:g.simTime,scores:g.scores,servingSide:g.servingSide,touchSide:g.touchSide,lastTouchSide:g.lastTouchSide,touches:g.touches,rallyHits:g.rallyHits,stats:g.stats,aim:g.aim,aim2:g.aim2,ball:{x:g.ball.x,y:g.ball.y,z:g.ball.z,vx:g.ball.vx,vy:g.ball.vy,vz:g.ball.vz},players:g.players.map(p=>({side:p.side,human:p.human,x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,action:p.action,actionTime:p.actionTime,cooldown:p.cooldown,land:p.land,block:p.block})),notice:g.lastNotice||null};}
  apply(s){
    const g=this.game;if(s.players.length!==g.players.length)return;
    const first=!this.target,oldScore=JSON.stringify(g.scores),oldHits=g.rallyHits;this.target=s;
    for(const key of['phase','phaseTime','simTime','servingSide','touchSide','lastTouchSide','touches','rallyHits'])g[key]=s[key];g.scores={...s.scores};g.stats={...s.stats};g.aim={...s.aim};g.hostPaused=!!s.paused;g.server=g.players.find(p=>p.side===g.servingSide);
    for(const key of['vx','vy','vz'])g.ball[key]=s.ball[key];
    for(let i=0;i<g.players.length;i++){const p=g.players[i],source=s.players[i];for(const key of motion)if(!['x','y','z'].includes(key))p[key]=Number(source[key])||0;p.action=String(source.action||'idle');p.block=!!source.block;if(first)for(const key of['x','y','z'])p[key]=source[key];}
    if(first)for(const key of['x','y','z'])g.ball[key]=s.ball[key];
    if(s.notice&&s.notice.id!==this.noticeId){this.noticeId=s.notice.id;g.announce(s.notice.title,s.notice.tag,s.notice.detail,Math.min(2,s.notice.seconds||1));}
    if(s.phase==='live'&&s.rallyHits>oldHits){g.audio.play('hit');g.world.burst(s.ball.x,s.ball.y,s.ball.z,.65);}
    if(oldScore!==JSON.stringify(g.scores)){g.audio.play('point');g.updateScore();}
    if(s.phase==='ended'&&g.modalType!=='end')g.endMatch();
  }
  tick(dt){
    if(!this.started||this.game.mode!=='lan')return;const g=this.game;
    if(this.role==='guest'){
      if(this.target){const alpha=1-Math.exp(-25*dt);for(const key of['x','y','z'])g.ball[key]=lerp(g.ball[key],this.target.ball[key],alpha);for(let i=0;i<g.players.length;i++)for(const key of['x','y','z'])g.players[i][key]=lerp(g.players[i][key],this.target.players[i][key],alpha);}
      if(g.announcement>0){g.announcement-=dt;if(g.announcement<=0)$('announcement').classList.remove('visible');}
    }else if(Date.now()-this.lastInputAt>1200)g.remoteInput=neutralInput();
    this.timer+=dt;if(this.timer>=1/30){this.timer=0;
      if(this.role==='host')this.connection.send({type:'snapshot',state:this.snapshot()});
      else{const i=g.paused||g.hostPaused?neutralInput():g.inputFor(2);this.connection.input({...i,aimX:clamp(g.aim2.x,-5.4,5.4),aimZ:clamp(g.aim2.z,.7,10)});}
    }
    $('network-status').hidden=false;$('network-status').textContent=`LAN ${this.code} · ${this.role==='host'?'Player 1 / host':'Player 2'}${g.peerPaused?' · Player 2 paused':g.hostPaused?' · Match paused':''}`;
  }
}
