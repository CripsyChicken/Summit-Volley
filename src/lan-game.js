import { LanConnection } from './lan.js';
import { cleanConfig } from './lan-protocol.js';
import { clamp,lerp } from './physics.js';
const $=id=>document.getElementById(id);
export const neutralInput=()=>({x:0,z:0,aimX:0,aimZ:6,jump:false,block:false,sprint:false});
const motion=['x','y','z','vx','vy','vz','actionTime','cooldown','land','lookX','lookZ','touchCount'];
export class LanGame {
  constructor(game){
    this.game=game;this.connection=new LanConnection(m=>this.receive(m),m=>this.disconnected(m));this.timer=0;this.started=false;this.target=null;this.noticeId=-1;this.players=[];this.lastInputs={};
    $('lan-host').onclick=()=>this.connect('host');$('lan-join').onclick=()=>this.connect('join');$('lan-start').onclick=()=>this.requestStart();$('lan-leave').onclick=()=>game.goMenu();
    $('lan-code').addEventListener('keydown',e=>{if(e.code==='Enter'){e.preventDefault();this.connect('join');}});
    for(const [id,side] of[['join-evergreen',1],['join-ember',-1]])$(id).onclick=()=>this.connection.send({type:'team',side});
    for(const id of['room-return','pause-room','end-room'])$(id).onclick=()=>this.connection.send({type:'lobby'});
  }
  get role(){return this.connection.role;}get peer(){return !!this.role;}get code(){return this.connection.code;}get id(){return this.connection.id||1;}
  status(text){$('lan-status').textContent=text;}
  lobby(){
    $('lan-connect-controls').hidden=!!this.role;$('lan-room-controls').hidden=!this.role;$('lan-room-code').textContent=this.code;
    $('lan-start').disabled=this.role!=='host';$('lan-start').hidden=this.role==='guest';$('room-return').hidden=this.role!=='host';
    $('lan-role').textContent=this.role==='guest'?'You use Player 1 controls. Choose a team, then wait for the host.':'Share this code. Choose the same team for co-op against AI.';
    const list=$('room-roster');list.replaceChildren();for(const side of[1,-1]){const col=document.createElement('div');col.className='roster-team';const title=document.createElement('strong');const members=this.players.filter(p=>p.side===side);title.textContent=this.game.teamName(side)+` · ${members.length}/6`;col.append(title);for(const p of members){const row=document.createElement('p');row.textContent=`${p.username}${p.id===this.id?' (you)':''} · Lv ${p.level}${p.host?' · HOST':''}`;col.append(row);}const hint=document.createElement('small');hint.textContent='Empty slots filled by AI';col.append(hint);list.append(col);}
  }
  async connect(kind,autoStart=false){
    const code=$('lan-code').value.trim().toUpperCase();if(kind==='join'&&!/^[A-F0-9]{6}$/.test(code)){this.status('Enter the six-character room code.');return;}
    this.autoStart=autoStart;$('lan-host').disabled=$('lan-join').disabled=true;this.status('Connecting…');
    try{await this.connection.connect();this.connection.send({type:kind,code,name:this.game.club?.username,skin:this.game.club?.profile.skin,config:this.game.config});}
    catch(error){this.status('Open the game’s Render address or run npm start for LAN. '+error.message);this.game.openModal('lan');}
    finally{$('lan-host').disabled=$('lan-join').disabled=false;}
  }
  requestStart(){if(this.role==='host')this.connection.send({type:'start',config:this.game.config});}
  start(){this.started=true;this.target=null;this.noticeId=-1;this.game.peerPaused=false;this.game.hostPaused=false;this.game.remoteInputs={};this.lastInputs={};for(const id of['pause-room','end-room'])$(id).hidden=this.role!=='host';this.lobby();}
  pause(){} // Guests' menus neutralize their own input; only the host pauses the shared simulation.
  action(action,power){if(this.role==='guest'&&this.started&&!this.game.hostPaused)this.connection.action(action,power);}
  disconnect(){this.started=false;this.target=null;this.players=[];this.connection.close();this.game.peerPaused=false;this.game.hostPaused=false;this.game.remoteInputs={};this.lobby();$('network-status').hidden=true;}
  disconnected(message){this.game.goMenu();this.game.openModal('lan');this.status(message);}
  receive(m){const g=this.game;
    if(m.type==='room'){this.status(this.role==='host'?'Room created. Invite up to 11 friends.':'Connected. Choose your team.');this.lobby();}
    else if(m.type==='roster'){this.players=m.players;this.lobby();if(this.autoStart&&this.role==='host'){this.autoStart=false;this.requestStart();}}
    else if(m.type==='error'){this.status(m.message);if(g.phase==='menu')g.openModal('lan');}
    else if(m.type==='host-left')this.disconnected('The host left. Host or join a new room.');
    else if(m.type==='player-left'){const p=g.players.find(p=>p.human===m.id);if(p){p.human=0;p.username='AI substitute';p.queued=null;g.world.refreshLabels?.(g.players);}delete g.remoteInputs?.[m.id];this.status('A player left. AI takes their place until the next match.');}
    else if(m.type==='lobby'){this.started=false;g.phase='menu';g.hideModal();g.openModal('lan');$('menu').hidden=false;$('menu-footer').hidden=false;$('hud').hidden=true;document.body.classList.remove('playing');g.world.clearLabels?.();}
    else if(m.type==='start'){this.players=m.players;g.config=cleanConfig(m.config);g.syncConfig();g.start('lan',true);}
    else if(m.type==='input'&&this.role==='host'){g.remoteInputs[m.id]=m.input;this.lastInputs[m.id]=Date.now();}
    else if(m.type==='action'&&this.role==='host'&&!g.paused){const p=g.players.find(p=>p.human===m.id);if(m.action==='jump')g.jump(p);else g.queue(m.id,m.action==='hit'?'primary':m.action,m.power);}
    else if(m.type==='snapshot'&&this.role==='guest'&&this.started)this.apply(m.state);
    else if(m.type==='account')g.club?.receive(m.account);
    else if(m.type==='reward-event')g.club?.earn(m.event);
    else if(m.type==='save-error'){g.club?.message(m.message);g.networkSaveError=m.message;}
  }
  snapshot(){const g=this.game;const state={phase:g.phase,paused:g.paused,phaseTime:g.phaseTime,simTime:g.simTime,scores:g.scores,servingSide:g.servingSide,touchSide:g.touchSide,lastTouchSide:g.lastTouchSide,touches:g.touches,rallyHits:g.rallyHits,stats:g.stats,aim:g.aim,aim2:g.aim2,ball:{x:g.ball.x,y:g.ball.y,z:g.ball.z,vx:g.ball.vx,vy:g.ball.vy,vz:g.ball.vz},players:g.players.map(p=>({side:p.side,human:p.human,x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,action:p.action,actionTime:p.actionTime,cooldown:p.cooldown,land:p.land,block:p.block,lookX:p.lookX||0,lookZ:p.lookZ||0,touchCount:p.touchCount||0})),notice:g.lastNotice||null};for(const object of[state.ball,...state.players])for(const key of Object.keys(object))if(typeof object[key]==='number')object[key]=Math.round(object[key]*1000)/1000;state.phaseTime=Math.round(state.phaseTime*1000)/1000;state.simTime=Math.round(state.simTime*1000)/1000;return state;}
  apply(s){const g=this.game;if(s.players.length!==g.players.length)return;const first=!this.target,oldScore=JSON.stringify(g.scores),oldHits=g.rallyHits;this.target=s;
    for(const key of['phase','phaseTime','simTime','servingSide','touchSide','lastTouchSide','touches','rallyHits'])g[key]=s[key];g.scores={...s.scores};g.stats={...s.stats};g.hostPaused=!!s.paused;
    for(const key of['vx','vy','vz'])g.ball[key]=s.ball[key];
    for(let i=0;i<g.players.length;i++){const p=g.players[i],source=s.players[i];p.human=source.human;for(const key of motion)if(!['x','y','z'].includes(key))p[key]=Number(source[key])||0;p.action=String(source.action||'idle');p.block=!!source.block;if(first)for(const key of['x','y','z'])p[key]=source[key];}
    g.server=g.players.find(p=>p.side===g.servingSide);if(first)for(const key of['x','y','z'])g.ball[key]=s.ball[key];
    if(s.notice&&s.notice.id!==this.noticeId){this.noticeId=s.notice.id;g.announce(s.notice.title,s.notice.tag,s.notice.detail,Math.min(2,s.notice.seconds||1));}
    if(s.phase==='live'&&s.rallyHits>oldHits){g.audio.play('hit');g.world.burst(s.ball.x,s.ball.y,s.ball.z,.65);}
    if(oldScore!==JSON.stringify(g.scores)){g.audio.play('point');g.updateScore();}if(s.phase==='ended'&&g.modalType!=='end')g.endMatch();
  }
  tick(dt){if(!this.started||this.game.mode!=='lan')return;const g=this.game;
    if(this.role==='guest'){if(this.target){const alpha=1-Math.exp(-25*dt);for(const key of['x','y','z'])g.ball[key]=lerp(g.ball[key],this.target.ball[key],alpha);for(let i=0;i<g.players.length;i++)for(const key of['x','y','z'])g.players[i][key]=lerp(g.players[i][key],this.target.players[i][key],alpha);}if(g.announcement>0){g.announcement-=dt;if(g.announcement<=0)$('announcement').classList.remove('visible');}}
    else for(const [id,at] of Object.entries(this.lastInputs))if(Date.now()-at>1200)g.remoteInputs[id]=neutralInput();
    this.timer+=dt;if(this.timer>=1/20){this.timer=0;if(this.role==='host')this.connection.send({type:'snapshot',state:this.snapshot()});else{const i=g.paused||g.hostPaused?neutralInput():g.inputFor(this.id);this.connection.input({...i,aimX:clamp(g.aim.x,-5.4,5.4),aimZ:clamp(g.aim.z,-10,10)});}}
    $('network-status').hidden=false;$('network-status').textContent=g.networkSaveError||`ROOM ${this.code} · ${this.players.length}/12 players · Player 1 controls${g.hostPaused?' · Host paused':''}`;
  }
}
