import { type PlayerInput, EMPTY_INPUT } from '@hypertank/shared';

/** Which physical keys drive a local player. Per-slot so Phase 5 can split WASD vs Arrows. */
export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  reload: string[];
  nuke: string[];
  bomber: string[];
  ult: string[];
}

// Player 1 — preserves the original scheme (WASD *and* Arrows both move P1 in solo).
// Phase 5 will split Arrows out to a second slot for local 2P.
export const P1_KEYS: KeyMap = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  reload: ['KeyR'],
  nuke: ['KeyQ'],
  bomber: ['KeyF'],
  ult: ['KeyE'],
};

const anyDown = (keys: Record<string, boolean>, codes: string[]) => codes.some((c) => keys[c]);

/** Build a PlayerInput from a keyboard state, an aim angle, and a fire flag. */
export function sampleKeyboardInput(
  keys: Record<string, boolean>,
  map: KeyMap,
  aim: number,
  fire: boolean,
  direct = false,
): PlayerInput {
  const up = anyDown(keys, map.up);
  const down = anyDown(keys, map.down);
  const left = anyDown(keys, map.left);
  const right = anyDown(keys, map.right);
  return {
    // Tank-mode interpretation:
    drive: (up ? 1 : 0) + (down ? -0.85 : 0),
    turn: (right ? 1 : 0) + (left ? -1 : 0),
    // Direct-mode interpretation (screen-space):
    moveX: (right ? 1 : 0) - (left ? 1 : 0),
    moveY: (down ? 1 : 0) - (up ? 1 : 0),
    direct,
    aim,
    fire,
    reload: anyDown(keys, map.reload),
    nuke: anyDown(keys, map.nuke),
    bomber: anyDown(keys, map.bomber),
    ult: anyDown(keys, map.ult),
  };
}

/** Player 1: keyboard chassis + mouse aim/fire (turret tracks the cursor). */
export function sampleLocalInput(
  keys: Record<string, boolean>,
  mouse: { x: number; y: number; pressed: boolean },
  player: { x: number; y: number },
  direct = false,
): PlayerInput {
  const aim = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  return sampleKeyboardInput(keys, P1_KEYS, aim, mouse.pressed, direct);
}

// ── Local multiplayer input slots ──────────────────────────────────────────

// In 2P, P1 loses the arrow keys (they go to P2).
export const P1_KEYS_2P: KeyMap = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  reload: ['KeyR'],
  nuke: ['KeyQ'],
  bomber: ['KeyF'],
  ult: ['KeyE'],
};

// P2 on a shared keyboard: Arrows to drive, turret auto-aims the nearest enemy,
// RightShift/Enter to fire. (A gamepad, if present, gives P2 proper twin-stick aim.)
export const P2_KEYS: KeyMap = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  reload: ['Slash'],
  nuke: [], // team specials are triggered by P1
  bomber: [],
  ult: ['Period'],
};
const P2_FIRE = ['ShiftRight', 'Enter', 'NumpadEnter'];

interface Pose {
  x: number;
  y: number;
  turretAngle: number;
}

function nearestEnemyAngle(p: Pose, enemies: { x: number; y: number }[]): number {
  let best = p.turretAngle;
  let bd = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) {
      bd = d;
      best = Math.atan2(e.y - p.y, e.x - p.x);
    }
  }
  return best;
}

function firstGamepad(): Gamepad | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p) return p;
  return null;
}

const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);

function sampleGamepadInput(pad: Gamepad, pose: Pose, direct = false): PlayerInput {
  const lx = dz(pad.axes[0] ?? 0);
  const ly = dz(pad.axes[1] ?? 0);
  const rx = dz(pad.axes[2] ?? 0);
  const ry = dz(pad.axes[3] ?? 0);
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  return {
    drive: Math.max(-1, Math.min(1, -ly)),
    turn: Math.max(-1, Math.min(1, lx)),
    moveX: Math.max(-1, Math.min(1, lx)),
    moveY: Math.max(-1, Math.min(1, ly)),
    direct,
    aim: Math.hypot(rx, ry) > 0.25 ? Math.atan2(ry, rx) : pose.turretAngle,
    fire: b(7) || b(0),
    reload: b(2),
    nuke: b(3),
    bomber: b(1),
    ult: b(5) || b(4),
  };
}

/**
 * Resolve one PlayerInput per local player. P1 = keyboard + mouse; P2 = gamepad
 * (twin-stick) if connected, else Arrows + auto-aim. In solo, P1 keeps the
 * Arrow keys too (legacy scheme).
 */
export function sampleLocalInputs(
  keys: Record<string, boolean>,
  mouse: { x: number; y: number; pressed: boolean },
  players: Pose[],
  count: number,
  enemies: { x: number; y: number }[],
  direct = false,
): PlayerInput[] {
  const inputs: PlayerInput[] = [];
  const p1 = players[0];
  const p1map = count >= 2 ? P1_KEYS_2P : P1_KEYS;
  inputs.push(
    sampleKeyboardInput(keys, p1map, p1 ? Math.atan2(mouse.y - p1.y, mouse.x - p1.x) : 0, mouse.pressed, direct),
  );
  for (let i = 1; i < count; i++) {
    const p = players[i];
    if (!p) {
      inputs.push(EMPTY_INPUT);
      continue;
    }
    const pad = i === 1 ? firstGamepad() : null;
    if (pad) {
      inputs.push(sampleGamepadInput(pad, p, direct));
    } else {
      inputs.push(sampleKeyboardInput(keys, P2_KEYS, nearestEnemyAngle(p, enemies), P2_FIRE.some((k) => keys[k]), direct));
    }
  }
  return inputs;
}
