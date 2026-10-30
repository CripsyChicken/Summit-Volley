// Pure, deterministic ball physics. Units are metres and seconds.
export const G = 11.8;
export const R = 0.24;
export const COURT = Object.freeze({ halfWidth: 4.5, halfLength: 9, net: 2.35 });
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sideOf = z => z >= 0 ? 1 : -1;

export function timeToHeight(y, vy, height = R) {
  const d = vy * vy + 2 * G * (y - height);
  return d < 0 ? null : Math.max(0, (vy + Math.sqrt(d)) / G);
}

export function predict(ball, height = R) {
  const t = timeToHeight(ball.y, ball.vy, height);
  if (t === null) return null;
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, t };
}

export function aimVelocity(start, target, kind = 'pass', power = 0.5) {
  const dx = target.x - start.x, dz = target.z - start.z;
  const distance = Math.hypot(dx, dz);
  let t;
  if (kind === 'spike') {
    t = Math.max(0.44, distance / (13 + power * 9));
  } else {
    const apex = Math.max(start.y + (kind === 'set' ? 3.5 : kind === 'serve' ? 2.5 : kind === 'bump' ? 1.8 : 2.4) + power * 0.8, COURT.net + 1.35);
    t = Math.sqrt(2 * (apex - start.y) / G) + Math.sqrt(2 * (apex - R) / G);
  }
  // A flight crosses the net only when endpoints are on opposite halves.
  // Increase flight time to preserve gravity while providing playable net clearance.
  const f = -start.z / dz;
  if (f > 0 && f < 1) {
    const linearY = start.y * (1 - f) + R * f;
    const required = 2 * (COURT.net + R + 0.13 - linearY) / (G * f * (1 - f));
    if (required > 0) t = Math.max(t, Math.sqrt(required));
  }
  t = Math.max(t, distance / 23);
  return { vx: dx / t, vz: dz / t, vy: (R - start.y + 0.5 * G * t * t) / t, time: t };
}

export function isIn(x, z) {
  // A ball touching a boundary line is in.
  return Math.abs(x) <= COURT.halfWidth + R && Math.abs(z) <= COURT.halfLength + R;
}

export function pointWinner(x, z, lastTouchSide) {
  return isIn(x, z) ? -sideOf(z) : -lastTouchSide;
}

export function stepBall(b, dt, collideNet = true) {
  const old = { x: b.x, y: b.y, z: b.z, vy: b.vy };
  b.x += b.vx * dt;
  b.y += b.vy * dt - 0.5 * G * dt * dt;
  b.z += b.vz * dt;
  b.vy -= G * dt;
  let net = false;
  const edge = old.z >= 0 ? R : -R;
  if (collideNet && ((old.z >= R && b.z <= R) || (old.z <= -R && b.z >= -R))) {
    const f = clamp((edge - old.z) / (b.z - old.z), 0, 1);
    const y = old.y + old.vy * dt * f - 0.5 * G * (dt * f) ** 2;
    const x = lerp(old.x, b.x, f);
    if (y < COURT.net + R && y > 0 && Math.abs(x) < 5.02) {
      b.z = edge + sideOf(old.z) * 0.008;
      b.vz *= -0.32;
      b.vx *= 0.7;
      b.vy *= 0.78;
      net = true;
    }
  }
  // Pole contacts are sampled at 120 Hz, with speed capped on launch.
  for (const px of [-5.02, 5.02]) {
    const dx = b.x - px, dz = b.z;
    const d = Math.hypot(dx, dz);
    if (d < R + 0.105 && b.y < 3.1) {
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const v = b.vx * nx + b.vz * nz;
      b.x = px + nx * (R + 0.11); b.z = nz * (R + 0.11);
      if (v < 0) { b.vx -= 1.45 * v * nx; b.vz -= 1.45 * v * nz; }
      net = true;
    }
  }
  if (b.y <= R) {
    const t = timeToHeight(old.y, old.vy);
    const f = t === null ? 1 : clamp(t / dt, 0, 1);
    const floor = { x: lerp(old.x, b.x, f), z: lerp(old.z, b.z, f) };
    b.x = floor.x; b.z = floor.z; b.y = R;
    b.vy = Math.abs(b.vy) * 0.48; b.vx *= 0.7; b.vz *= 0.7;
    return { net, floor };
  }
  return { net, floor: null };
}
