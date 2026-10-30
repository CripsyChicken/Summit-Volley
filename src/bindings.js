export const ACTIONS = Object.freeze({moveUp:'Move forward',moveDown:'Move backward',moveLeft:'Move left',moveRight:'Move right',aimUp:'Aim forward',aimDown:'Aim backward',aimLeft:'Aim left',aimRight:'Aim right',bump:'Bump / receive',set:'Set',hit:'Hit / serve',jump:'Jump',block:'Block',sprint:'Sprint'});
export const DEFAULT_BINDINGS = Object.freeze({
  1:Object.freeze({moveUp:'KeyW',moveDown:'KeyS',moveLeft:'KeyA',moveRight:'KeyD',aimUp:'Numpad8',aimDown:'Numpad2',aimLeft:'Numpad4',aimRight:'Numpad6',bump:'KeyE',set:'Mouse2',hit:'Mouse0',jump:'Space',block:'KeyF',sprint:'ShiftLeft'}),
  2:Object.freeze({moveUp:'KeyI',moveDown:'KeyK',moveLeft:'KeyJ',moveRight:'KeyL',aimUp:'ArrowUp',aimDown:'ArrowDown',aimLeft:'ArrowLeft',aimRight:'ArrowRight',bump:'KeyO',set:'KeyU',hit:'KeyP',jump:'AltRight',block:'Semicolon',sprint:'ShiftRight'})
});
export function validCode(code){return typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Shift(Left|Right)|Alt(Left|Right)|Control(Left|Right)|Backspace|Delete|Home|End|PageUp|PageDown|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote|Mouse[012])$/.test(code);}
export function normalizeBindings(saved){
  const result={1:{...DEFAULT_BINDINGS[1]},2:{...DEFAULT_BINDINGS[2]}};
  for(const p of[1,2])for(const action of Object.keys(ACTIONS)){const code=saved?.[p]?.[action];if(validCode(code))result[p][action]=code;}
  return result;
}
export function keyLabel(code){
  const names={Mouse0:'Left mouse',Mouse1:'Middle mouse',Mouse2:'Right mouse',Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',AltRight:'Right Alt',AltLeft:'Left Alt',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Semicolon:';',Period:'.',Slash:'/',Comma:',',Quote:"'",BracketLeft:'[',BracketRight:']',Backslash:'\\',Minus:'−',Equal:'=',Backquote:'`'};
  return names[code]||code?.replace(/^Key|^Digit/,'').replace('Numpad','Num ')||'Unbound';
}
export function actionHeld(bindings,keys,player,action){return keys.has((bindings||DEFAULT_BINDINGS)[player][action]);}
export function movement(bindings,keys,player){return {x:Number(actionHeld(bindings,keys,player,'moveRight'))-Number(actionHeld(bindings,keys,player,'moveLeft')),z:Number(actionHeld(bindings,keys,player,'moveDown'))-Number(actionHeld(bindings,keys,player,'moveUp'))};}
