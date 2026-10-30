import { World } from './scene.js';
import { AudioBus } from './audio.js';
import { clamp, lerp, G, R, COURT, predict, aimVelocity, stepBall, pointWinner, isIn, sideOf } from './physics.js';
import { ACTIONS,DEFAULT_BINDINGS,normalizeBindings,keyLabel,actionHeld,movement } from './bindings.js';
import { ControlsUI } from './controls-ui.js';
import { LanGame,neutralInput } from './lan-game.js';
import { Clubhouse } from './clubhouse.js';
import { levelFor } from './progression.js';

const $=id=>document.getElementById(id);
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const DEFAULT_SETTINGS={volume:.45,muted:false,quality:'balanced',camera:'follow',sensitivity:14,assists:true};
const DEFAULT_CONFIG={size:2,difficulty:'club',points:11,color:'green'};
const LEVELS={casual:{speed:3.8,reaction:.24,error:.6},club:{speed:5.1,reaction:.13,error:.32},summit:{speed:6.4,reaction:.075,error:.16}};
const FORMATIONS={1:[[0,5.5]],2:[[-1.8,5.7],[2,3.7]],3:[[-2.4,5.6],[2.4,5.6],[0,2.4]],4:[[-2.5,6],[2.5,6],[-2,2.7],[2,2.7]],5:[[-2.6,6.4],[0,6.5],[2.6,6.4],[-2,2.8],[2,2.8]],6:[[-2.7,6.4],[0,6.4],[2.7,6.4],[-2.7,2.8],[0,2.8],[2.7,2.8]]};

export class SummitVolley {
  constructor(){
    this.settings={...DEFAULT_SETTINGS};this.config={...DEFAULT_CONFIG};this.bindings=normalizeBindings();
    try{
      const save=JSON.parse(localStorage.getItem('summit-volley-v1')||'{}');
      this.bindings=normalizeBindings(save.bindings);
      if(save.settings){const s=save.settings;this.settings={volume:clamp(Number.isFinite(s.volume)?s.volume:.45,0,1),muted:!!s.muted,quality:['low','balanced','high'].includes(s.quality)?s.quality:'balanced',camera:s.camera==='wide'?'wide':'follow',sensitivity:clamp(Number(s.sensitivity)||14,3,20),assists:s.assists!==false};}
      if(save.config){const c=save.config;this.config={size:clamp(Math.round(c.size)||2,1,6),difficulty:LEVELS[c.difficulty]?c.difficulty:'club',points:[7,11,21].includes(c.points)?c.points:11,color:c.color==='orange'?'orange':'green'};}
    }catch{}
    this.world=new World($('world'),this.settings);this.audio=new AudioBus(this.settings);this.world.canvas.tabIndex=0;
    this.phase='menu';this.mode='quick';this.paused=false;this.players=[];this.ball={x:0,y:3,z:0,vx:0,vy:0,vz:0};
    this.scores={1:0,'-1':0};this.servingSide=1;this.lastTouchSide=1;this.touchSide=1;this.touches=0;
    this.keys=new Set();this.aim={x:0,z:-6};this.aim2={x:0,z:6};this.pointer={x:innerWidth*.58,y:innerHeight*.45,active:false};this.charge=null;
    this.announcement=0;this.time=0;this.phaseTime=0;this.simTime=0;this.accumulator=0;this.lastFrame=0;this.uiTimer=0;this.rallyHits=0;this.hitCooldown=0;
    this.stats={rallies:0,hits:0,best:0};this.practiceHits=0;this.machine=false;this.mobile={x:0,z:0};this.modalType=null;
    this.remoteInputs={};this.peerPaused=false;this.hostPaused=false;this.lan=new LanGame(this);this.controls=new ControlsUI(this);this.club=new Clubhouse(this);
    this.bindUI();this.syncSettings();this.syncConfig();this.setupPlayers();this.updateScore();
    $('render-note').hidden=!this.world.renderer.isSoftware;
    $('boot').hidden=true;
    window.addEventListener('resize',()=>this.world.resize());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pauseForBlur();});
    window.addEventListener('blur',()=>this.pauseForBlur());
    Object.defineProperty(window,'summitDiagnostics',{get:()=>({phase:this.phase,paused:this.paused,mode:this.mode,score:{...this.scores},touches:this.touches,ball:{...this.ball},players:this.players.map(p=>({side:p.side,human:p.human,x:p.x,y:p.y,z:p.z,action:p.action})),rallyHits:this.rallyHits,stats:{...this.stats},render:{calls:this.world.renderer.info.render.calls,triangles:this.world.renderer.info.render.triangles},settings:{...this.settings}})});
    requestAnimationFrame(t=>this.frame(t));
  }
  save(){try{localStorage.setItem('summit-volley-v1',JSON.stringify({settings:this.settings,config:this.config,bindings:this.bindings}));}catch{}}
  teamName(side){return (side===1)===(this.config.color==='green')?'Evergreen':'Ember';}
  teamColor(side){return this.teamName(side)==='Evergreen'?0x347c64:0xe97851;}
  syncConfig(){
    $('team-size').value=this.config.size;$('difficulty').value=this.config.difficulty;$('points').value=this.config.points;$('team-color').value=this.config.color;
    setText('config-size',`${this.config.size} v ${this.config.size}`);setText('config-level',{casual:'Casual',club:'Club',summit:'Summit'}[this.config.difficulty]);setText('config-score',this.config.points);
  }
  syncSettings(){
    $('volume').value=Math.round(this.settings.volume*100);setText('volume-value',`${Math.round(this.settings.volume*100)}%`);$('quality').value=this.settings.quality;$('camera-mode').value=this.settings.camera;$('sensitivity').value=this.settings.sensitivity;setText('sensitivity-value',this.settings.sensitivity);$('assists').checked=this.settings.assists;
    $('sound-btn').classList.toggle('muted',this.settings.muted);$('sound-btn').setAttribute('aria-label',this.settings.muted?'Enable sound':'Mute sound');
  }
  bindUI(){
    const on=(id,fn)=>$(id).addEventListener('click',()=>{this.audio.unlock();this.audio.play('menu');fn();if(this.phase!=='menu'&&!this.paused)this.world.canvas.focus({preventScroll:true});});
    on('play-btn',()=>{if(this.lan.role){this.openModal('lan');}else if(this.club?.account){this.lan.connect('host',true);this.openModal('lan');}else this.start('quick');});on('practice-btn',()=>this.start('practice'));on('local-btn',()=>this.start('local'));
    on('lan-btn',()=>{this.lan.lobby();this.openModal('lan');});
    on('config-btn',()=>this.openModal('config'));on('settings-btn',()=>this.openModal('settings'));on('help-btn',()=>this.openModal('help'));on('hud-help',()=>this.openModal('help'));
    for(const id of['close-modal','config-done','settings-done','help-done'])on(id,()=>this.closeModal());
    on('pause-btn',()=>this.openModal('pause'));on('resume-btn',()=>this.closeModal());on('restart-btn',()=>this.start(this.mode));on('rematch-btn',()=>this.start(this.mode));
    on('pause-settings',()=>{this.returnModal='pause';this.openModal('settings');});on('quit-btn',()=>this.goMenu());on('end-home',()=>this.goMenu());
    $('home-link').addEventListener('click',e=>{e.preventDefault();this.goMenu();});
    on('sound-btn',()=>{this.settings.muted=!this.settings.muted;this.syncSettings();this.save();});
    on('practice-reset',()=>{this.machine=false;this.resetRally();this.updateScore();});on('practice-feed',()=>this.toggleMachine());
    for(const id of['team-size','difficulty','points','team-color'])$(id).addEventListener('change',()=>{this.config={...this.config,size:Number($('team-size').value),difficulty:$('difficulty').value,points:Number($('points').value),color:$('team-color').value};this.syncConfig();this.save();if(this.phase==='menu')this.setupPlayers();});
    $('volume').addEventListener('input',()=>{this.settings.volume=Number($('volume').value)/100;this.settings.muted=false;this.syncSettings();this.save();});
    $('quality').addEventListener('change',()=>{this.settings.quality=$('quality').value;this.world.setQuality(this.settings.quality);this.save();});
    $('camera-mode').addEventListener('change',()=>{this.settings.camera=$('camera-mode').value;this.save();});
    $('sensitivity').addEventListener('input',()=>{this.settings.sensitivity=Number($('sensitivity').value);setText('sensitivity-value',this.settings.sensitivity);this.save();});
    $('assists').addEventListener('change',()=>{this.settings.assists=$('assists').checked;this.save();});
    window.addEventListener('keydown',e=>this.keyDown(e));window.addEventListener('keyup',e=>this.keyUp(e));
    window.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;this.pointer={x:e.clientX,y:e.clientY,active:true};});
    $('world').addEventListener('contextmenu',e=>e.preventDefault());
    $('world').addEventListener('pointerdown',e=>{if(this.phase==='menu'||this.paused||this.phase==='ended')return;this.audio.unlock();this.pointer={x:e.clientX,y:e.clientY,active:true};const aim=this.world.aimAt(e.clientX,e.clientY);if(aim)this.aim=aim;if(e.pointerType==='touch')return;this.inputDown('Mouse'+e.button,false);e.preventDefault();});
    window.addEventListener('pointerup',e=>this.inputUp('Mouse'+e.button));
    $('modal-backdrop').addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;const nodes=[...$('modal').querySelectorAll('button,input,select,summary')].filter(n=>n.getClientRects().length);
      if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
    });
    const stick=$('joystick');let stickPointer=null;
    const moveStick=e=>{const r=stick.getBoundingClientRect();const dx=clamp((e.clientX-r.left-r.width/2)/36,-1,1),dz=clamp((e.clientY-r.top-r.height/2)/36,-1,1);const l=Math.max(1,Math.hypot(dx,dz));this.mobile={x:dx/l,z:dz/l};stick.firstElementChild.style.transform=`translate(${this.mobile.x*28}px,${this.mobile.z*28}px)`;};
    stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});
    const releaseStick=()=>{stickPointer=null;this.mobile={x:0,z:0};stick.firstElementChild.style.transform='';};stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
    for(const button of document.querySelectorAll('[data-touch]')){
      button.addEventListener('pointerdown',e=>{e.preventDefault();this.audio.unlock();button.setPointerCapture(e.pointerId);const a=button.dataset.touch,p=this.activeHumans()[0];if(a==='hit')this.beginCharge(p);if(a==='set')this.dispatchAction(p,'set',.5);if(a==='jump'){this.keys.add(this.bindings[this.controlProfile(p)].jump);this.dispatchAction(p,'jump');}});
      button.addEventListener('pointerup',()=>{const p=this.activeHumans()[0];if(button.dataset.touch==='hit')this.releaseCharge(p);if(button.dataset.touch==='jump')this.keys.delete(this.bindings[this.controlProfile(p)].jump);});
      button.addEventListener('pointercancel',()=>{this.charge=null;this.charge2=null;this.keys.delete(this.bindings[this.controlProfile(this.activeHumans()[0])].jump);});
    }
  }
  activeHumans(){return this.mode==='local'?[1,2]:[this.mode==='lan'?(this.lan?.id||1):1];}
  controlProfile(player){return this.mode==='local'&&player===2?2:1;}
  localSide(){return this.players.find(p=>p.human===this.activeHumans()[0])?.side||1;}
  held(player,action){if(this.mode==='lan'&&this.lan?.role==='host'&&player!==(this.lan.id||1))return !!this.remoteInputs?.[player]?.[action];return actionHeld(this.bindings||DEFAULT_BINDINGS,this.keys,this.controlProfile(player),action);}
  inputFor(player){
    if(this.mode==='lan'&&this.lan?.role==='host'&&player!==(this.lan.id||1))return this.remoteInputs?.[player]||neutralInput();
    const m=movement(this.bindings||DEFAULT_BINDINGS,this.keys,this.controlProfile(player));const touch=this.activeHumans()[0]===player?this.mobile||{x:0,z:0}:{x:0,z:0};
    return {x:clamp(m.x+touch.x,-1,1),z:clamp(m.z+touch.z,-1,1),jump:this.held(player,'jump'),sprint:this.held(player,'sprint'),block:this.held(player,'block')};
  }
  dispatchAction(player,action,power=.5){
    if(this.mode==='lan'&&this.lan?.role==='guest'){this.lan.action(action,power);return;}
    if(action==='jump')this.jump(this.players.find(p=>p.human===player));else this.queue(player,action==='hit'?'primary':action,power);
  }
  inputDown(code,repeat=false){
    if(this.phase==='menu'||this.paused||this.hostPaused||this.phase==='ended')return;
    this.keys.add(code);if(repeat)return;
    for(const player of this.activeHumans()){
      const b=(this.bindings||DEFAULT_BINDINGS)[this.controlProfile(player)];
      if(code===b.jump)this.dispatchAction(player,'jump');
      if(code===b.hit)this.beginCharge(player);
      if(code===b.set)this.dispatchAction(player,'set',.5);
      if(code===b.bump)this.dispatchAction(player,'bump',.45);
    }
  }
  inputUp(code){this.keys.delete(code);for(const p of this.activeHumans())if(code===(this.bindings||DEFAULT_BINDINGS)[this.controlProfile(p)].hit)this.releaseCharge(p);}
  keyDown(e){
    if(this.controls?.key(e))return;
    if(e.code==='Escape'){e.preventDefault();if(this.modalType)this.closeModal();else if(this.phase!=='menu')this.openModal('pause');return;}
    if(this.phase==='menu'||this.paused||this.phase==='ended')return;
    const used=this.activeHumans().some(p=>Object.values((this.bindings||DEFAULT_BINDINGS)[this.controlProfile(p)]).includes(e.code));
    if(used)e.preventDefault();this.inputDown(e.code,e.repeat);
    if(!used&&!e.repeat&&this.mode==='practice'){
      if(e.code==='KeyR'){e.preventDefault();this.machine=false;this.resetRally();this.updateScore();}
      if(e.code==='KeyT'){e.preventDefault();this.toggleMachine();}
    }
  }
  keyUp(e){this.inputUp(e.code);}
  updateKeyboardAim(dt){
    if(this.paused||this.hostPaused)return;
    for(const p of this.activeHumans()){
      const dx=Number(this.held(p,'aimRight'))-Number(this.held(p,'aimLeft')),dz=Number(this.held(p,'aimDown'))-Number(this.held(p,'aimUp'));
      if(!dx&&!dz)continue;if(this.controlProfile(p)===1&&this.pointer)this.pointer.active=false;
      const aim=this.mode==='local'&&p===2?this.aim2:this.aim,side=this.players.find(x=>x.human===p)?.side||1;aim.x=clamp(aim.x+dx*dt*5,-5.3,5.3);aim.z=side===1?clamp(aim.z+dz*dt*5,-10,-.7):clamp(aim.z+dz*dt*5,.7,10);
    }
  }
  pauseForBlur(){this.keys.clear();this.charge=null;this.charge2=null;this.mobile={x:0,z:0};if(this.phase!=='menu'&&this.phase!=='ended'&&!this.modalType)this.openModal('pause');}
  openModal(type){
    this.focusBefore=document.activeElement;this.modalType=type;this.paused=this.phase!=='menu';this.keys.clear();this.charge=null;this.charge2=null;
    if(this.mode==='lan')this.lan?.pause(true);
    const titles={club:'Welcome to the clubhouse.',config:'Make it your match.',settings:'Find your sweet spot.',help:'A good rally starts here.',pause:'Taking a breather?',lan:'Bring your own crew.',end:this.scores[this.localSide()]>this.scores[-this.localSide()]?'The summit is yours.':'That was a good climb.'};
    setText('modal-title',titles[type]);setText('modal-eyebrow',type==='end'?'MATCH COMPLETE':'THE ALPINE CLUB');
    document.querySelectorAll('.modal-panel').forEach(p=>p.hidden=true);$(type+'-panel').hidden=false;$('modal-backdrop').hidden=false;$('close-modal').focus();
  }
  hideModal(){this.modalType=null;this.returnModal=null;this.paused=false;$('modal-backdrop').hidden=true;this.keys.clear();this.charge=null;this.charge2=null;if(this.controls)this.controls.capture=null;if(this.mode==='lan')this.lan?.pause(false);}
  closeModal(){
    if(this.returnModal){const type=this.returnModal;this.returnModal=null;this.openModal(type);return;}
    if(this.phase==='ended'){this.goMenu();return;}
    this.hideModal();if(this.phase==='menu')this.focusBefore?.focus?.();else this.world.canvas.focus({preventScroll:true});
  }
  setupPlayers(){
    this.world.clearCharacters();this.players=[];let index=0;
    const count=this.mode==='practice'&&this.phase!=='menu'?1:this.config.size;
    for(const side of[1,-1]){
      if(side===-1&&this.mode==='practice'&&this.phase!=='menu')continue;
      for(let i=0;i<count;i++){
        const home=FORMATIONS[count][i],member=this.mode==='lan'?this.lan.players.filter(p=>p.side===side)[i]:null;const human=this.mode==='lan'?(member?.id||0):i===0?(side===1?1:this.mode==='local'?2:0):0;
        const p={side,index:index++,human,x:home[0],z:home[1]*side,y:0,vx:0,vz:0,vy:0,homeX:home[0],homeZ:home[1]*side,action:'idle',actionTime:0,block:false,land:0,cooldown:0,queued:null,decision:0,moveX:home[0],moveZ:home[1]*side,jumpTime:0};
        p.username=member?.username||(human?(human===2?'Local Player 2':this.club?.username||'You'):['Robin','Ash','River','Fern','Sky','Sage'][p.index%6]+' · AI');p.skin=member?.skin||(human===1?this.club?.profile.skin:'club')||'club';p.level=member?.level||(human?levelFor(this.club?.profile.xp||0):1);p.touchCount=0;p.lookX=0;p.lookZ=0;
        p.visual=this.world.makeCharacter(side,p.index,human,this.teamColor(side),p.skin);this.players.push(p);
      }
    }
  }
  start(mode,fromNetwork=false){
    if(mode==='lan'&&!this.lan?.peer)return;
    if(mode==='lan'&&!fromNetwork){this.lan?.requestStart();return;}
    if(mode!=='lan')this.lan?.disconnect();else this.lan?.start(this.config,fromNetwork);
    this.hideModal();this.audio.unlock();this.mode=mode;this.phase='serve';this.machine=false;this.practiceHits=0;this.scores={1:0,'-1':0};this.servingSide=1;this.stats={rallies:0,hits:0,best:0};
    this.localMatchId=Date.now().toString(36)+Math.random().toString(36).slice(2);this.lastRewardTouches=0;this.world.setCourt?.(this.config.court||this.club?.profile.court||'alpine');this.setupPlayers();this.world.refreshLabels?.(this.players);$('menu').hidden=true;$('menu-footer').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');
    $('practice-controls').hidden=mode!=='practice';$('local-guide').hidden=mode!=='local';$('network-status').hidden=mode!=='lan';
    this.world.practiceTargets.forEach(t=>t.visible=mode==='practice');
    this.pointer.active=false;this.aim={x:0,z:-this.localSide()*5.8};this.aim2={x:0,z:5.8};this.resetRally();this.updateScore();
    this.world.canvas.focus({preventScroll:true});
    this.controls?.sync();
    $('restart-btn').disabled=mode==='lan'&&this.lan?.role==='guest';$('rematch-btn').disabled=mode==='lan'&&this.lan?.role==='guest';
    const k=(p,a)=>keyLabel(this.bindings[p][a]);
    this.announce(mode==='practice'?'Find your touch.':['local','lan'].includes(mode)?'Pick your side.':'Fresh air. Game on.',mode==='practice'?'PRACTICE COURT':'WELCOME TO THE HIGH COURT',mode==='local'?`P1: ${k(1,'hit')} to hit · P2: ${k(2,'hit')} to hit`:`Aim, then press and release ${k(1,'hit')} to serve.`,2.8);
  }
  goMenu(){
    this.lan?.disconnect();this.world.clearLabels?.();
    this.hideModal();this.phase='menu';this.mode='quick';this.keys.clear();this.charge=null;this.machine=false;
    $('menu').hidden=false;$('menu-footer').hidden=false;$('hud').hidden=true;document.body.classList.remove('playing');
    this.world.target.visible=this.world.target2.visible=this.world.landing.visible=false;this.world.practiceTargets.forEach(t=>t.visible=false);this.setupPlayers();
  }
  resetRally(){
    this.phase='serve';this.phaseTime=0;this.touches=0;this.touchSide=this.servingSide;this.lastTouchSide=this.servingSide;this.rallyHits=0;this.hitCooldown=0;this.charge=null;this.charge2=null;
    if(this.mode==='practice')this.servingSide=1;
    for(const p of this.players){if(!(this.mode==='practice'&&this.machine)){p.x=p.homeX;p.z=p.homeZ;}p.y=0;p.vy=0;p.vx=0;p.vz=0;p.cooldown=0;p.queued=null;p.block=false;p.actionTime=0;p.decision=0;p.contactRead=-1;p.readHit=-1;p.misread=false;}
    this.server=this.players.find(p=>p.side===this.servingSide);
    if(!(this.mode==='practice'&&this.machine)){this.server.x=-1.4*this.servingSide;this.server.z=8.4*this.servingSide;}
    this.ball.vx=this.ball.vy=this.ball.vz=0;
    this.holdBall();this.updateScore();
  }
  holdBall(){
    if(this.mode==='practice'&&this.machine){this.ball.x=0;this.ball.y=2.3;this.ball.z=-7.5;return;}
    const p=this.server;this.ball.x=p.x+.27;this.ball.y=p.y+1.55;this.ball.z=p.z-p.side*.38;
  }
  toggleMachine(){this.machine=!this.machine;this.servingSide=1;this.resetRally();this.updateScore();this.announce(this.machine?'Eyes up.':'Your serve.','PRACTICE',this.machine?'Ball machine on. Get under the landing guide.':'Aim at a gold target and release your shot.',1.8);}
  announce(title,tag,detail,seconds=1.6){this.lastNotice={id:(this.lastNotice?.id||0)+1,title,tag,detail,seconds};setText('announce-title',title);setText('announce-tag',tag);setText('announce-detail',detail);this.announcement=seconds;$('announcement').classList.add('visible');}
  updateScore(){
    setText('home-score',this.mode==='practice'?'∞':this.scores[1]);setText('away-score',this.mode==='practice'?'—':this.scores[-1]);setText('home-name',this.mode==='practice'?'PRACTICE':this.teamName(1).toUpperCase());setText('away-name',this.mode==='practice'?'NO PRESSURE':this.teamName(-1).toUpperCase());
    setText('match-format',this.mode==='practice'?'SOLO':`${this.config.size} v ${this.config.size}`);setText('match-target',this.mode==='practice'?'FREE PLAY':`TO ${this.config.points}`);
    setText('mode-label',this.mode==='practice'?'PRACTICE':this.mode==='local'?'LOCAL VERSUS':this.mode==='lan'?'LAN MATCH':'QUICK MATCH');
    $('serve-home').style.opacity=this.servingSide===1?'1':'0';$('serve-away').style.opacity=this.servingSide===-1?'1':'0';
    setText('practice-stats',`${this.practiceHits} target${this.practiceHits===1?'':'s'} hit`);$('practice-feed').classList.toggle('active',this.machine);
    const local=this.players.find(p=>p.human===this.activeHumans()[0]);$('player-caption').textContent=(local?.username||'YOU')+' · '+this.teamName(this.localSide()).toUpperCase();
    document.querySelector('.home-team').style.borderBottomColor=this.teamName(1)==='Evergreen'?'#347c64':'#e97851';document.querySelector('.away-team').style.borderBottomColor=this.teamName(-1)==='Evergreen'?'#347c64':'#e97851';document.querySelector('.player-dot').style.background=this.teamName(1)==='Evergreen'?'#347c64':'#e97851';
  }
  beginCharge(human){if(this.paused||!['serve','live'].includes(this.phase))return;if(human===2)this.charge2={human,start:this.simTime};else this.charge={human,start:this.simTime};}
  releaseCharge(player=1){const charge=player===2?this.charge2:this.charge;if(!charge)return;const {human,start}=charge;if(player===2)this.charge2=null;else this.charge=null;if(this.paused)return;this.dispatchAction(human,'hit',clamp((this.simTime-start)/.65,.15,1));}
  queue(human,type,power){
    if(this.paused||this.peerPaused||!['serve','live'].includes(this.phase))return;
    const p=this.players.find(p=>p.human===human);if(!p)return;
    p.queued={type,power,remaining:.23};
  }
  jump(p){if(!p||this.paused||this.peerPaused||p.y>.025||this.phase==='point')return;p.vy=6.65;p.jumpTime=0;p.action='jump';if(p.human)this.audio.play('jump');}
  canHit(p){return distance(p,this.ball)<1.48&&this.ball.y-p.y>.28&&this.ball.y-p.y<2.66&&p.cooldown<=0&&this.hitCooldown<=0;}
  targetFor(p,type){
    const remote=this.mode==='lan'&&p.human!==this.activeHumans()[0]?this.remoteInputs?.[p.human]:null;const aim=remote?{x:remote.aimX,z:remote.aimZ}:this.mode==='local'&&p.human===2?this.aim2:this.aim;
    return {x:aim.x,z:p.side*(type==='set'?clamp(Math.abs(aim.z)*.66,1.4,7.4):-clamp(Math.abs(aim.z),.7,10))};
  }
  recordTouch(p,isBlock=false){
    if(this.mode==='practice'){this.touches=0;this.touchSide=p.side;}
    if(this.touchSide!==p.side){this.touchSide=p.side;this.touches=0;}
    if(!isBlock)this.touches++;
    this.lastTouchSide=p.side;this.rallyHits++;p.touchCount=(p.touchCount||0)+1;
    if(this.touches>3&&this.mode!=='practice'){this.awardPoint(-p.side,'Four touches');return false;}
    return true;
  }
  hit(p,type,power,targetOverride=null){
    const serving=this.phase==='serve';
    if(serving&&p!==this.server)return false;
    if(serving&&this.machine)return false;
    let kind=serving?'serve':type==='set'?'set':type==='bump'?'bump':p.y>.3&&this.ball.y>2.75?'spike':'pass';
    if(!serving&&!this.canHit(p))return false;
    if(!serving&&!this.recordTouch(p))return true;
    if(serving){p.touchCount=(p.touchCount||0)+1;this.holdBall();this.touches=1;this.touchSide=p.side;this.lastTouchSide=p.side;this.rallyHits=1;}
    const target=targetOverride?{...targetOverride}:this.targetFor(p,kind==='set'?'set':'primary');
    if(!targetOverride&&!serving){const off=distance(p,this.ball)/1.48;const error=.025+off*.24+power*.065;target.x+=(Math.random()-.5)*error*2;target.z+=(Math.random()-.5)*error*2;}
    const v=aimVelocity(this.ball,target,kind,power);this.ball.vx=v.vx;this.ball.vy=v.vy;this.ball.vz=v.vz;
    this.phase='live';if(serving)this.phaseTime=0;
    p.cooldown=.34;p.queued=null;p.action=kind;p.actionTime=.38;this.hitCooldown=.11;
    this.world.burst(this.ball.x,this.ball.y,this.ball.z,kind==='spike'?1.45:.85);this.audio.play(kind);
    if(p.human)this.stats.hits++;
    if(kind==='spike')this.announce('Send it!','POWER SPIKE','',.55);
    else if(kind==='set'&&p.human)this.announce('Set up.','NICE TOUCH','Move in and jump for the next hit.',.8);
    else if(serving)this.announcement=Math.min(this.announcement,.25);
    return true;
  }
  blockContact(p){
    if(!p.block||p.cooldown>0||this.hitCooldown>0||distance(p,this.ball)>1.05||Math.abs(p.z)>1.65)return false;
    const y=this.ball.y-p.y;if(y<1.45||y>2.9||this.ball.vz*p.side<=0)return false;
    if(!this.recordTouch(p,true))return false;
    this.ball.vz=-p.side*Math.max(5,Math.abs(this.ball.vz)*.85);this.ball.vx*=.65;this.ball.vy=2.1;
    p.cooldown=.4;p.action='block';p.actionTime=.4;this.hitCooldown=.13;this.world.burst(this.ball.x,this.ball.y,this.ball.z,1.2);this.audio.play('block');
    this.announce('Roofed.','BLOCK','',.65);if(p.human)this.stats.hits++;return true;
  }
  awardPoint(winner,reason){
    if(this.phase!=='live')return;
    this.phase='point';this.phaseTime=0;this.charge=null;this.stats.rallies++;this.stats.best=Math.max(this.stats.best,this.rallyHits);
    if(this.mode==='practice'){
      const target=this.world.practiceTargets.some(t=>Math.hypot(this.ball.x-t.position.x,this.ball.z-t.position.z)<1.14);
      if(target){this.practiceHits++;this.audio.play('point');this.announce('Right on target.','NICE SHOT',`${this.practiceHits} target${this.practiceHits===1?'':'s'} hit`,1.3);}else this.announce(this.ball.z<0?'Keep the good air.':'Go again.','PRACTICE',this.machine?'The next ball is on its way.':'Press R for a fresh serve · T for the ball machine',1.3);
      this.servingSide=1;
    }else{
      this.scores[winner]++;this.servingSide=winner;this.audio.play('point');this.announce(`${this.teamName(winner)} point.`,reason.toUpperCase(),`${this.teamName(winner)} serves next.`,1.85);
    }
    if(this.mode!=='lan'&&this.mode!=='practice'){const touches=this.players.find(p=>p.human===1)?.touchCount||0;this.club?.earn({id:this.localMatchId+':'+this.stats.rallies,rallies:1,touches:touches-(this.lastRewardTouches||0)});this.lastRewardTouches=touches;}
    this.updateScore();
  }
  endMatch(){
    if(this.phase!=='ended'&&this.mode!=='lan')this.club?.earn({id:this.localMatchId+':end',finished:true,won:this.scores[1]>this.scores[-1]});
    this.phase='ended';setText('end-score',`${this.scores[1]} : ${this.scores[-1]}`);setText('end-detail',['local','lan'].includes(this.mode)?`${this.teamName(this.scores[1]>this.scores[-1]?1:-1)} takes the match. Good game, both sides.`:this.scores[1]>this.scores[-1]?'Good footwork. Great rallies. Well played.':'Every rally is another step up. Go for a rematch.');
    setText('stat-rallies',this.stats.rallies);setText('stat-hits',this.stats.hits);setText('stat-best',this.stats.best);$('rematch-btn').disabled=this.mode==='lan'&&this.lan?.role==='guest';$('restart-btn').disabled=this.mode==='lan'&&this.lan?.role==='guest';setText('rematch-btn',this.mode==='lan'&&this.lan?.role==='guest'?'WAITING FOR HOST REMATCH':'ONE MORE MATCH ↗');this.openModal('end');
  }
  movePlayer(p,mx,mz,speed,dt){
    const mag=Math.hypot(mx,mz);if(mag>1){mx/=mag;mz/=mag;}
    const accel=1-Math.exp(-(p.y>0?9:14)*dt);
    p.vx=lerp(p.vx,mx*speed,accel);p.vz=lerp(p.vz,mz*speed,accel);
    p.x+=p.vx*dt;p.z+=p.vz*dt;
    const bx=clamp(p.x,-6.7,6.7),bz=p.side*clamp(p.z*p.side,.5,11.3);
    if(p.x!==bx)p.vx=0;if(p.z!==bz)p.vz=0;p.x=bx;p.z=bz;
    if(p.y>0||p.vy>0){
      p.jumpTime+=dt;const held=p.human?this.held(p.human,'jump'):p.jumpTime<.22;
      const gravity=p.vy>0&&!held?29:17;
      p.y+=p.vy*dt-.5*gravity*dt*dt;p.vy-=gravity*dt;
      if(p.y<=0){p.y=0;p.vy=0;p.land=1;if(speed>5)this.world.burst(p.x,.12,p.z,.35);}
    }
    p.land=Math.max(0,p.land-dt*6);p.cooldown=Math.max(0,p.cooldown-dt);p.actionTime=Math.max(0,p.actionTime-dt);
  }
  aiTarget(p){
    const level=LEVELS[this.config.difficulty];const predicted=predict(this.ball,1.6)||predict(this.ball);const landing=predict(this.ball);
    p.block=false;
    const drift=Math.sin(this.simTime*.8+p.index*1.7);
    p.moveX=p.homeX+drift*.4;p.moveZ=p.homeZ+Math.cos(this.simTime*.65+p.index)*.3;
    p.lookX=this.phase==='live'?this.ball.x:p.x+Math.sin(this.simTime*.45+p.index)*3;p.lookZ=this.phase==='live'?this.ball.z:p.z-p.side*4;
    if(p.readHit!==this.rallyHits){p.readHit=this.rallyHits;p.readErrorX=(Math.random()-.5)*level.error*1.3;p.readErrorZ=(Math.random()-.5)*level.error;}
    if(!predicted||this.phase!=='live'||(landing&&!isIn(landing.x,landing.z)))return;
    if(predicted.z*p.side>.2&&predicted.z*p.side<12&&Math.abs(predicted.x)<7.4){
      const team=this.players.filter(t=>t.side===p.side);
      // One receiver at a time. Teammates leave space when a human is close.
      const ranked=team.map(t=>({p:t,d:distance(t,predicted)-(t.human?.45:0)})).sort((a,b)=>a.d-b.d);
      const receiver=ranked[0].p;
      if(receiver===p){p.moveX=clamp(predicted.x+(p.readErrorX||0),-6,6);p.moveZ=p.side*clamp((predicted.z+(p.readErrorZ||0))*p.side,.7,10.5);}
      else if(this.touchSide===p.side&&this.touches<3){p.moveX=p.homeX*.65+drift*.3;p.moveZ=p.side*(1.6+(p.index%2)*.6);}
      else{p.moveX=clamp(p.homeX+this.ball.x*.16+drift*.2,-3.9,3.9);p.moveZ=p.homeZ-p.side*.5;}
      // A teammate can receive if the human cannot plausibly cover the distance.
      if(receiver.human&&distance(receiver,predicted)>3.4&&ranked[1]?.p===p){p.moveX=clamp(predicted.x,-6,6);p.moveZ=p.side*clamp(predicted.z*p.side,.7,10.5);}
    }
    if(this.ball.z*p.side<0&&Math.abs(this.ball.z)<2&&this.ball.y>2.7&&Math.abs(p.z)<2&&Math.abs(this.ball.x-p.x)<1.3){p.block=true;this.jump(p);}
    p.decision=level.reaction*(.8+Math.random()*.8);
  }
  aiHit(p){
    if(this.phase!=='live'||!this.canHit(p)||this.ball.z*p.side<.1)return;
    const landing=predict(this.ball);if(landing&&!isIn(landing.x,landing.z))return;
    // Avoid stealing a reachable manual touch from the player.
    const human=this.players.find(h=>h.human&&h.side===p.side);
    if(human&&distance(human,this.ball)<1.65&&distance(human,this.ball)<distance(p,this.ball)+.4)return;
    if(this.ball.vy>1.5)return;
    if(this.ball.y>p.y+2.35)return;
    const level=LEVELS[this.config.difficulty];
    if(p.contactRead!==this.rallyHits){p.contactRead=this.rallyHits;p.contactAt=this.simTime+level.reaction*(.25+Math.random()*.6);p.misread=Math.random()<(this.config.difficulty==='casual'?.12:this.config.difficulty==='club'?.065:.025);}
    if(p.misread||this.simTime<p.contactAt)return;
    const teammates=this.players.filter(t=>t.side===p.side&&t!==p);
    const attackFriend=teammates.slice().sort((a,b)=>Math.abs(a.z)-Math.abs(b.z))[0];
    if(this.touchSide!==p.side&&attackFriend&&Math.abs(p.z)>3.1&&Math.random()<.48){
      const target={x:clamp(attackFriend.x+(Math.random()-.5)*level.error*2,-4.8,4.8),z:p.side*clamp(Math.abs(attackFriend.z)+(Math.random()-.5)*level.error*2,1.1,6.2)};
      this.hit(p,'set',.4,target);return;
    }
    const opponents=this.players.filter(t=>t.side===-p.side);
    const choices=[{x:-3,z:-p.side*6.4},{x:3,z:-p.side*6.4},{x:0,z:-p.side*2.5}];
    choices.sort((a,b)=>Math.min(...opponents.map(o=>distance(o,b)))-Math.min(...opponents.map(o=>distance(o,a))));
    let target={...choices[this.config.difficulty==='casual'?Math.floor(Math.random()*choices.length):0]};
    target.x+=(Math.random()-.5)*level.error*3;target.z+=(Math.random()-.5)*level.error*3;
    // Ordinary, visible misses, never teleportation or hidden accuracy changes.
    if(Math.random()<(this.config.difficulty==='casual'?.09:.035))target.x=Math.sign(target.x||1)*5.1;
    this.hit(p,'primary',.45+Math.random()*.45,target);
  }
  bodyContact(p){
    if(p.cooldown>0||this.hitCooldown>0)return;
    const y=this.ball.y-p.y;if(y<.4||y>1.65)return;
    const dx=this.ball.x-p.x,dz=this.ball.z-p.z,d=Math.hypot(dx,dz);
    if(d>.54||d<.01)return;
    const nx=dx/d,nz=dz/d;const v=this.ball.vx*nx+this.ball.vz*nz;
    if(v>=0)return;
    if(!this.recordTouch(p))return;
    this.ball.x=p.x+nx*.55;this.ball.z=p.z+nz*.55;this.ball.vx-=1.35*v*nx;this.ball.vz-=1.35*v*nz;this.ball.vy=Math.max(this.ball.vy,1.1);
    p.cooldown=.35;this.hitCooldown=.12;this.audio.play('hit');this.world.burst(this.ball.x,this.ball.y,this.ball.z,.5);
  }
  step(dt){
    if(this.phase==='menu'||this.paused||this.peerPaused||this.phase==='ended'||(this.mode==='lan'&&this.lan?.role==='guest'))return;
    this.simTime+=dt;this.phaseTime+=dt;this.hitCooldown=Math.max(0,this.hitCooldown-dt);
    if(this.announcement>0){this.announcement-=dt;if(this.announcement<=0)$('announcement').classList.remove('visible');}
    this.updateKeyboardAim(dt);
    for(const p of this.players){
      let mx=0,mz=0,speed=0;
      if(p.human){const input=this.inputFor(p.human);mx=input.x;mz=input.z;speed=input.sprint?8.2:5.7;p.block=input.block&&Math.abs(p.z)<1.65;}
      else{
        p.decision-=dt;if(p.decision<=0){this.aiTarget(p);p.decision=LEVELS[this.config.difficulty].reaction*(.8+Math.random()*.8);}
        const dx=p.moveX-p.x,dz=p.moveZ-p.z,d=Math.hypot(dx,dz);if(d>.14){mx=dx/d;mz=dz/d;speed=Math.min(LEVELS[this.config.difficulty].speed,d*8);}
        if(this.phase==='serve'&&p===this.server){mx=mz=0;}
        if(this.phase==='live'&&distance(p,this.ball)<1.8&&Math.abs(p.z)<2.9&&this.ball.y>2.7&&this.ball.y<3.6&&this.ball.vy<1.5)this.jump(p);
      }
      this.movePlayer(p,mx,mz,speed,dt);
      if(p.queued){p.queued.remaining-=dt;if(p.queued.remaining<0)p.queued=null;}
    }
    if(this.phase==='serve'){
      this.holdBall();
      if(this.mode==='practice'&&this.machine&&this.phaseTime>.9){
        const target={x:clamp(this.players[0].x+(Math.random()-.5)*3,-3.8,3.8),z:clamp(this.players[0].z-1.3,2,7.5)};
        const v=aimVelocity(this.ball,target,'serve',.35);this.ball.vx=v.vx;this.ball.vy=v.vy;this.ball.vz=v.vz;this.lastTouchSide=-1;this.touchSide=-1;this.touches=1;this.phase='live';this.phaseTime=0;this.audio.play('serve');
      }else if(this.server.queued)this.hit(this.server,'primary',this.server.queued.power);
      else if(!this.server.human&&this.phaseTime>1.45)this.hit(this.server,'primary',.5,{x:(Math.random()-.5)*5,z:-this.server.side*(4.2+Math.random()*2.4)});
      return;
    }
    if(this.phase==='point'){
      if(this.ball.y>R+.01||Math.abs(this.ball.vy)>.2)stepBall(this.ball,dt);else this.ball.vx=this.ball.vz=0;
      if(this.phaseTime>(this.mode==='practice'?1.6:2.1)){
        const high=Math.max(this.scores[1],this.scores[-1]);
        if(this.mode!=='practice'&&high>=this.config.points&&Math.abs(this.scores[1]-this.scores[-1])>=2)this.endMatch();else this.resetRally();
      }
      return;
    }
    if(this.phase!=='live')return;
    for(const p of this.players){
      if(this.blockContact(p))break;
      if(p.queued&&this.canHit(p))this.hit(p,p.queued.type,p.queued.power);
      else if(!p.human)this.aiHit(p);
      if(this.phase!=='live')return;
    }
    const result=stepBall(this.ball,dt);
    if(result.net){this.audio.play('net');this.world.burst(this.ball.x,this.ball.y,this.ball.z,.45);}
    if(result.floor){
      this.audio.play('floor');this.world.burst(this.ball.x,.1,this.ball.z,.7);
      this.awardPoint(pointWinner(result.floor.x,result.floor.z,this.lastTouchSide),isIn(result.floor.x,result.floor.z)?'Ball down · in':'Out of bounds');return;
    }
    for(const p of this.players){this.bodyContact(p);if(this.phase!=='live')break;}
    if(Math.abs(this.ball.x)>23||Math.abs(this.ball.z)>24)this.awardPoint(-this.lastTouchSide,'Out of play');
  }
  updateHUD(){
    const active=this.activeHumans()[0],p=this.players.find(p=>p.human===active)||this.players[0];if(!p)return;
    if(this.phase==='serve')setText('rally-label',this.mode==='practice'&&this.machine?'BALL MACHINE':this.server?.human===active?'YOUR SERVE':this.server?.human?`PLAYER ${this.server.human} SERVES`:`${this.teamName(this.servingSide).toUpperCase()} SERVES`);
    else setText('rally-label',this.phase==='point'?'NEXT RALLY':`RALLY · ${this.rallyHits} HIT${this.rallyHits===1?'':'S'}`);
    setText('touch-label',this.mode==='practice'?'TAKE YOUR TIME':`${this.touches} / 3 ${this.teamName(this.touchSide).toUpperCase()} TOUCHES`);
    const serve=this.phase==='serve'&&this.server?.human===active&&!this.machine;
    const near=this.phase==='live'&&this.canHit(p);
    $('contact-hint').classList.toggle('visible',(serve||near)&&!this.paused);
    setText('contact-text',serve?`AIM · ${keyLabel((this.bindings||DEFAULT_BINDINGS)[this.controlProfile(active)].hit).toUpperCase()} & RELEASE TO SERVE`:p.y>.3&&this.ball.y>2.75?'IN REACH · RELEASE TO SPIKE':'IN REACH · RELEASE TO HIT');
    const charge=active===2?this.charge2:this.charge;$('charge-bar').classList.toggle('visible',!!charge);$('charge-fill').style.width=`${charge?clamp((this.simTime-charge.start)/.65,0,1)*100:0}%`;
  }
  frame(ms){
    const rawFrameMs=ms-this.lastFrame;const renderStarted=performance.now();
    const dt=Math.min((ms-this.lastFrame)/1000||.016,.1);this.lastFrame=ms;this.time+=dt;
    const guest=this.mode==='lan'&&this.lan?.role==='guest';
    if(guest&&!this.paused)this.updateKeyboardAim(dt);
    if(!this.paused&&!this.peerPaused&&!guest){this.accumulator+=dt;while(this.accumulator>=1/120){this.step(1/120);this.accumulator-=1/120;}}
    this.lan?.tick(dt);
    if(this.phase==='menu'){
      this.ball.x=1.4+Math.sin(this.time*.7)*.15;this.ball.z=1.4;this.ball.y=3+Math.sin(this.time*1.8)*.45;this.ball.vx=.8;this.ball.vz=1.2;
    }else{
      if(this.pointer.active&&!this.paused){const target=this.world.aimAt(this.pointer.x,this.pointer.y);if(target){const factor=1-Math.exp(-this.settings.sensitivity*dt);this.aim.x=lerp(this.aim.x,target.x,factor);this.aim.z=lerp(this.aim.z,target.z,factor);}}
      const target=this.targetFor(this.players.find(p=>p.human===this.activeHumans()[0])||this.players[0],'primary');this.world.target.position.set(target.x,.095,target.z);
      this.world.target.visible=['live','serve'].includes(this.phase)&&!this.paused;
      this.world.target2.position.set(this.aim2.x,.095,this.aim2.z);this.world.target2.visible=this.mode==='local'&&this.world.target.visible;
      const landing=predict(this.ball);this.world.landing.visible=!!landing&&this.settings.assists&&this.phase==='live'&&Math.abs(landing.x)<8&&Math.abs(landing.z)<12;
      if(landing)this.world.landing.position.set(landing.x,.092,landing.z);
    }
    for(const p of this.players)this.world.animateCharacter(p,this.time,this.paused?0:dt);
    this.world.updateEffects(this.paused?0:dt,this.ball,this.phase==='live');
    this.world.render(this,dt,this.time);this.world.updateLabels?.(this);
    this.uiTimer+=dt;if(this.uiTimer>.05){this.uiTimer=0;if(this.phase!=='menu')this.updateHUD();}
    $('world').dataset.state=JSON.stringify({phase:this.phase,paused:this.paused,mode:this.mode,simTime:Math.round(this.simTime*10)/10,ball:[this.ball.x,this.ball.y,this.ball.z].map(v=>Math.round(v*100)/100),players:this.players.map(p=>[p.human,Math.round(p.x*100)/100,Math.round(p.y*100)/100,Math.round(p.z*100)/100]),hits:this.rallyHits,score:this.scores,triangles:this.world.renderer.info.render.triangles,frameMs:Math.round(rawFrameMs),renderMs:Math.round(performance.now()-renderStarted)});
    requestAnimationFrame(t=>this.frame(t));
  }
}

if(typeof document!=='undefined')try{new SummitVolley();}catch(error){console.error(error);$('boot').hidden=true;$('fatal').hidden=false;$('fatal-text').textContent='The court could not start. Try a current browser and reload. '+(error?.message||'');}
