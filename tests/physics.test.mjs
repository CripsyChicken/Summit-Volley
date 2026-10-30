import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, R, COURT, aimVelocity, predict, stepBall, pointWinner, isIn } from '../src/physics.js';

test('serve, pass and spike use gravity to land at the selected position', () => {
  for (const kind of ['serve', 'pass', 'spike']) {
    const start = { x: -2, y: kind === 'spike' ? 3.6 : 1.8, z: kind === 'spike' ? 1.4 : 8 };
    const target = { x: 3, z: -7 };
    const velocity = aimVelocity(start, target, kind, 0.8);
    const b = { ...start, ...velocity };
    const predicted = predict(b);
    assert.ok(Math.abs(predicted.x - target.x) < 1e-8);
    assert.ok(Math.abs(predicted.z - target.z) < 1e-8);
    let floor;
    for (let i = 0; i < 600; i++) {
      const result = stepBall(b, 1 / 120);
      assert.equal(result.net, false, `${kind} clears net`);
      if (result.floor) { floor = result.floor; break; }
    }
    assert.ok(floor, `${kind} eventually lands`);
    assert.ok(Math.abs(floor.x - target.x) < 0.03);
    assert.ok(Math.abs(floor.z - target.z) < 0.03);
  }
});

test('swept collision catches a fast shot passing through the net', () => {
  const b = { x: 0, y: 1.3, z: 0.8, vx: 0, vy: 0, vz: -100 };
  const result = stepBall(b, 1 / 60);
  assert.equal(result.net, true);
  assert.ok(b.z >= R && b.vz > 0);
});

test('high balls cross above the net with uninterrupted velocity', () => {
  const b = { x: 0, y: COURT.net + R + 0.6, z: 0.3, vx: 0, vy: 0, vz: -24 };
  assert.equal(stepBall(b, 1 / 30).net, false);
  assert.equal(b.vz, -24);
});

test('lines are in; an out ball awards the side opposite the last touch', () => {
  assert.equal(isIn(4.6, -9.1), true);
  assert.equal(isIn(5, -3), false);
  assert.equal(pointWinner(0, -5, 1), 1);
  assert.equal(pointWinner(0, 5, -1), -1);
  assert.equal(pointWinner(5.3, -4, 1), -1);
  assert.equal(pointWinner(0, 11, -1), 1);
});

test('a high set stays on the same side and remains finite', () => {
  const start = { x: 0, y: 1.5, z: 5 };
  const b = { ...start, ...aimVelocity(start, { x: 0.8, z: 2 }, 'set', 0.4) };
  const initialEnergy = 0.5 * b.vy ** 2 + G * b.y;
  for (let i = 0; i < 50; i++) {
    stepBall(b, 1 / 120);
    assert.ok(Number.isFinite(b.y));
    assert.ok(Math.abs(0.5 * b.vy ** 2 + G * b.y - initialEnergy) < 1e-8);
  }
  assert.ok(b.z > 0);
});
