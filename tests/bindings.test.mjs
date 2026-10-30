import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS,normalizeBindings,movement } from '../src/bindings.js';
import { match } from './fixture.mjs';

test('Player 2 defaults match the requested keys exactly',()=>{
  const b=DEFAULT_BINDINGS[2];assert.deepEqual([b.moveLeft,b.moveUp,b.moveDown,b.moveRight],['KeyJ','KeyI','KeyK','KeyL']);
  assert.deepEqual([b.aimUp,b.aimDown,b.aimLeft,b.aimRight],['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  assert.deepEqual([b.bump,b.set,b.hit,b.jump],['KeyO','KeyU','KeyP','AltRight']);
});
test('custom bindings survive serialization and replace default input',()=>{
  const bindings=normalizeBindings({2:{moveRight:'KeyH',jump:'ControlRight',hit:'Mouse1'}});
  const restored=normalizeBindings(JSON.parse(JSON.stringify(bindings)));assert.deepEqual(bindings,restored);
  assert.equal(movement(restored,new Set(['KeyH']),2).x,1);assert.equal(movement(restored,new Set(['KeyL']),2).x,0);
  assert.equal(normalizeBindings({2:{jump:'Escape',hit:'<script>'}})[2].jump,'AltRight');
});
test('Player 2 keyboard movement and aim are independent in the actual game',()=>{
  const g=match(1);g.mode='local';g.players[0].human=1;g.players[1].human=2;g.bindings=normalizeBindings();
  g.keys.add('ArrowRight');const before=g.players[1].x;for(let i=0;i<30;i++)g.step(1/120);
  assert.equal(g.players[1].x,before);assert.ok(g.aim2.x>1);
  g.keys.clear();g.inputDown('KeyL');for(let i=0;i<30;i++)g.step(1/120);g.inputUp('KeyL');assert.ok(g.players[1].x>before+1);
  g.inputDown('AltRight');assert.ok(g.players[1].vy>0);
  g.inputDown('KeyO');assert.equal(g.players[1].queued.type,'bump');g.inputDown('KeyU');assert.equal(g.players[1].queued.type,'set');
  g.inputDown('KeyP');g.simTime+=.4;g.inputUp('KeyP');assert.equal(g.players[1].queued.type,'primary');
});
test('custom mouse and keyboard actions route to their assigned player',()=>{
  const g=match(1);g.mode='local';g.players[0].human=1;g.players[1].human=2;g.bindings=normalizeBindings({1:{hit:'KeyC'},2:{hit:'Mouse1',jump:'ControlRight'}});
  g.inputDown('KeyC');assert.ok(g.charge);assert.equal(g.charge2,null);g.inputDown('Mouse1');assert.ok(g.charge2);
  g.simTime+=.5;g.inputUp('KeyC');g.inputUp('Mouse1');assert.ok(g.players.every(p=>p.queued?.type==='primary'));
  g.inputDown('ControlRight');assert.ok(g.players[1].vy>0);
});
