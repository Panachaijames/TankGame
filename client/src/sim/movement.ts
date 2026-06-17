import { PHYSICS } from '../constants';
import { WeatherType, TerrainType } from '../types';

/** Traction parameters derived from the active weather + terrain. */
export interface MoveEnv {
  friction: number;
  accel: number;
  turn: number;
  sandstorm: boolean;
}

/** Mirrors the host's inline traction calc so client prediction matches exactly. */
export function computeEnv(weather: WeatherType, terrain: TerrainType): MoveEnv {
  let friction = PHYSICS.FRICTION;
  let accel = 1.0;
  let turn = 1.0;
  if (terrain === TerrainType.Snow) {
    friction = 0.972;
    accel = 0.8;
    turn = 0.85;
  } else if (terrain === TerrainType.Desert) {
    friction = 0.915;
    accel = 0.85;
    turn = 0.9;
  }
  if (weather === WeatherType.Rain) {
    friction = Math.max(friction, 0.965);
    accel *= 0.78;
    turn *= 0.82;
  } else if (weather === WeatherType.Snowstorm) {
    friction = Math.max(friction, 0.984);
    accel *= 0.52;
    turn *= 0.62;
  } else if (weather === WeatherType.Sandstorm) {
    friction = Math.max(friction, 0.925);
    accel *= 0.82;
  }
  return { friction, accel, turn, sandstorm: weather === WeatherType.Sandstorm };
}

interface Movable {
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  velocity: { x: number; y: number };
}
interface MoveInput {
  drive: number;
  turn: number;
  moveX: number;
  moveY: number;
  direct: boolean;
  aim: number;
}

/**
 * Advance one tank's chassis + turret by a single input tick. Pure (mutates the
 * passed tank only). Used by the host simulation AND by client-side prediction
 * so a client's own tank feels instant. Does NOT clamp to bounds — the caller does
 * (the host clamps after collisions; the client clamps directly).
 */
export function advanceTankMovement(p: Movable, input: MoveInput, env: MoveEnv): void {
  if (env.sandstorm) p.velocity.x -= 0.095;

  if (input.direct) {
    // Direct / twin-stick: accelerate toward the screen-space move vector; the
    // hull eases to face the travel direction (turret aims independently).
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
    }
    const a = PHYSICS.ACCELERATION * env.accel * 1.4; // a touch snappier than tank mode
    p.velocity.x += mx * a;
    p.velocity.y += my * a;
    if (mag > 0.01) {
      const target = Math.atan2(my, mx);
      let d = target - p.angle;
      while (d < -Math.PI) d += Math.PI * 2;
      while (d > Math.PI) d -= Math.PI * 2;
      p.angle += d * 0.3; // smooth turn-to-face
    }
  } else {
    // Tank: rotate the hull, thrust along its facing.
    p.angle += input.turn * PHYSICS.CHASSIS_TURN_SPEED * env.turn;
    const a = input.drive * PHYSICS.ACCELERATION * env.accel;
    p.velocity.x += Math.cos(p.angle) * a;
    p.velocity.y += Math.sin(p.angle) * a;
  }

  p.velocity.x *= env.friction;
  p.velocity.y *= env.friction;
  p.x += p.velocity.x;
  p.y += p.velocity.y;

  let td = input.aim - p.turretAngle;
  while (td < -Math.PI) td += Math.PI * 2;
  while (td > Math.PI) td -= Math.PI * 2;
  p.turretAngle += Math.max(-PHYSICS.TURRET_TURN_SPEED, Math.min(PHYSICS.TURRET_TURN_SPEED, td));
}
