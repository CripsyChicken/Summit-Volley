import { ACTIONS,DEFAULT_BINDINGS,keyLabel,validCode } from './bindings.js';
const $=id=>document.getElementById(id);
export class ControlsUI {
  constructor(game){
    this.game=game;this.player=1;this.capture=null;
    $('settings-general-tab').onclick=()=>this.show(0);
    for(const p of[1,2])$('bindings-player-'+p).onclick=()=>this.show(p);
    $('bindings-reset').onclick=()=>{game.bindings[this.player]={...DEFAULT_BINDINGS[this.player]};this.capture=null;game.save();this.render();this.sync();this.message('Default controls restored for Player '+this.player+'.');};
    document.addEventListener('pointerdown',e=>{if(!this.capture)return;e.preventDefault();e.stopPropagation();this.assign('Mouse'+e.button);},true);
    this.render();this.sync();
  }
  show(player){this.capture=null;if(player)this.player=player;$('settings-general').hidden=!!player;$('bindings-panel').hidden=!player;
    for(const [id,p] of[['settings-general-tab',0],['bindings-player-1',1],['bindings-player-2',2]]){$(id).classList.toggle('active',p===player);$(id).setAttribute('aria-pressed',p===player?'true':'false');}
    if(player){this.render();this.message('Click a control, then press its replacement key or mouse button.');}
  }
  message(text){$('bindings-status').textContent=text;}
  render(){
    const grid=$('bindings-grid');grid.replaceChildren();
    for(const [action,label] of Object.entries(ACTIONS)){
      const row=document.createElement('div');row.className='binding-row';const name=document.createElement('span');name.textContent=label;
      const button=document.createElement('button');button.type='button';button.className='binding-key';button.dataset.player=this.player;button.dataset.action=action;button.textContent=keyLabel(this.game.bindings[this.player][action]);button.setAttribute('aria-label',`Player ${this.player} ${label}: ${button.textContent}`);
      button.onclick=()=>{this.capture={player:this.player,action};button.textContent='Press a key…';button.classList.add('listening');this.message(`Player ${this.player}, ${label.toLowerCase()}: press a key or mouse button. Escape cancels.`);};row.append(name,button);grid.append(row);
    }
  }
  key(e){if(!this.capture)return false;e.preventDefault();e.stopPropagation();if(e.code==='Escape'){this.capture=null;this.render();this.message('Rebinding cancelled.');return true;}this.assign(e.code);return true;}
  assign(code){
    if(!this.capture)return;if(!validCode(code)){this.message('Choose a letter, number, arrow, modifier, or mouse button. Escape cancels.');return;}
    const {player,action}=this.capture,b=this.game.bindings[player];const old=b[action];const duplicate=Object.keys(ACTIONS).find(a=>a!==action&&b[a]===code);
    if(duplicate)b[duplicate]=old;b[action]=code;this.capture=null;this.game.keys.clear();this.game.save();this.render();this.sync();
    const other=player===1?2:1;const shared=Object.values(this.game.bindings[other]).includes(code);
    this.message(`${ACTIONS[action]} saved as ${keyLabel(code)}.${duplicate?' Swapped with '+ACTIONS[duplicate].toLowerCase()+'.':''}${shared?' This key also controls Player '+other+' in same-keyboard matches.':''}`);
  }
  sync(){
    const bindings=this.game.bindings,k=(p,a)=>keyLabel(bindings[p][a]);
    const move=p=>['moveUp','moveLeft','moveDown','moveRight'].map(a=>k(p,a)).join(' / ');
    const describe=p=>`Player ${p}: ${move(p)} move · ${['aimUp','aimDown','aimLeft','aimRight'].map(a=>k(p,a)).join(' ')} aim · ${k(p,'bump')} bump · ${k(p,'set')} set · ${k(p,'hit')} hit · ${k(p,'jump')} jump · ${k(p,'block')} block`;
    $('local-guide').textContent=describe(2);$('p2-help').textContent=describe(2)+'. Change any control in Settings. Both players move relative to the screen.';
    const active=1;
    const strip=$('control-strip');strip.replaceChildren();
    for(const [action,label] of[['moveUp','Move'],['jump','Jump'],['bump','Bump'],['hit','Hit'],['set','Set'],['block','Block']]){const span=document.createElement('span'),key=document.createElement('kbd');key.textContent=action==='moveUp'?move(active):k(active,action);span.append(key,document.createTextNode(' '+label));strip.append(span);}
    const help=$('p1-controls');help.replaceChildren();
    for(const [key,label] of[[move(1),'Move'],[k(1,'sprint'),'Sprint'],[k(1,'jump'),'Jump; hold to go higher'],['Mouse / '+['aimUp','aimLeft','aimDown','aimRight'].map(a=>k(1,a)).join(' '),'Aim'],[k(1,'bump'),'Bump / receive'],[k(1,'hit'),'Hit / serve; hold for power'],[k(1,'set'),'High set'],[k(1,'block'),'Block'],['Escape','Pause']]){const span=document.createElement('span'),kbd=document.createElement('kbd');kbd.textContent=key;span.append(kbd,document.createTextNode(' '+label));help.append(span);}
  }
}
