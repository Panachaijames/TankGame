
import React, { useRef, useEffect, useCallback } from 'react';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BIG_WORLD,
  PLAYER_DEFAULTS,
  ENEMY_CONFIGS,
  DIFFICULTY_INTERVAL,
  COMBO_TIMEOUT,
  PHYSICS,
  BOSS_SCORE_THRESHOLD,
  TANK_CLASSES,
  LASER_RANGE,
  ULTIMATES,
  MAX_ENERGY,
  ENERGY_PER_KILL,
  ENERGY_CELL_VALUE,
  ENERGY_DROP_KILLS
} from '../constants';
import {
  Tank, Bullet, Explosion, Particle, RepairItem,
  GameState, WeatherType, TerrainType, EnemyType,
  type TankClass, type PlayerConfig
} from '../types';
import { audioService } from '../services/audioService';
import { sampleLocalInputs, sampleLocalInput } from '../input/localInput';
import { EMPTY_INPUT, type PlayerInput } from '@hypertank/shared';
import { PixiRenderer } from '../render/PixiRenderer';
import { interpolateSnapshot } from '../net/interpolate';
import { computeEnv, advanceTankMovement } from '../sim/movement';
import { cameraOffset } from '../sim/camera';

interface BomberSequence {
  active: boolean;
  x: number;
  y: number;
  targetY: number;
  speed: number;
  lastDropX: number;
  dropInterval: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  opacity: number;
  lifespan: number;
  color: string;
  size: number;
}

interface SpawnIndicator {
  x: number;
  y: number;
  angle: number;
  timer: number;
  type: EnemyType;
}

interface TreadMark {
  x: number;
  y: number;
  angle: number;
  opacity: number;
  color: string;
  width: number;
}

interface SpecializedBullet extends Bullet {
  history: {x: number, y: number}[];
  trailHistory: {x: number, y: number}[];
  isHoming?: boolean;
  targetId?: string;
  turnSpeed?: number;
  missileAge?: number;
  currentSpeed?: number;
  maxSpeed?: number;
  phase?: 'eject' | 'ignition' | 'homing';
  wobbleOffset?: number;
  wobbleSpeed?: number;
  isPersistent?: boolean;
  ownerId?: string; // who fired it (versus: bullets skip their owner, damage others)
}

/**
 * The render/network seam (Phase 3). The simulation produces this each frame and
 * the renderer consumes it — the renderer never reaches into the engine's internal
 * state. `players` is already an array so local-2P / online (Phases 5–7) need no
 * new shape; `player` is a convenience alias to the local player (players[0]).
 */
interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

interface EnergyCell {
  id: string;
  x: number;
  y: number;
  radius: number;
  lifespan: number;
  opacity: number;
}

// Cover/obstacles. `crate` is destructible (blocks + drops an energy cell when
// shot — the energy source for versus ultimates); `rock` is permanent cover.
export interface Obstacle {
  id: string;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  kind: 'crate' | 'rock';
  health: number; // 0 for rocks (indestructible)
  maxHealth: number;
}

// A gunshot "noise" ping: where a player fired. Nearby enemies see it as an
// on-screen ring or an off-screen edge marker (positional audio, visualised).
export interface FireAlert {
  x: number;
  y: number;
  ownerId: string;
  life: number;
  maxLife: number;
}

export interface WorldSnapshot {
  players: Tank[];
  player: Tank;
  enemies: Tank[];
  bullets: SpecializedBullet[];
  repairItems: RepairItem[];
  energyCells: EnergyCell[];
  explosions: Explosion[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  spawnIndicators: SpawnIndicator[];
  treadMarks: TreadMark[];
  beams: LaserBeam[];
  bomber: BomberSequence;
  weather: WeatherType;
  terrain: TerrainType;
  difficulty: number;
  screenShake: number;
  screenFlash: number;
  // Shared HUD scalars (so online clients can show the team's score/combo/specials).
  score: number;
  combo: number;
  nukeProgress: number;
  nukeReady: boolean;
  bomberProgress: number;
  bomberReady: boolean;
  arena: { w: number; h: number };
  storm?: StormSnapshot;
  obstacles: Obstacle[];
  fireAlerts: FireAlert[];
}

// ION STORM — the shrinking PvP safe-zone (versus). `cx/cy/radius` is the live
// zone; `toCx/toCy/toR` is where it's closing to next.
export interface StormSnapshot {
  active: boolean;
  cx: number;
  cy: number;
  radius: number;
  toCx: number;
  toCy: number;
  toR: number;
}

export interface GameOverResult {
  winnerId: string;
  score: number;
  maxCombo: number;
}

interface NetAdapter {
  sendInput: (input: PlayerInput) => void;
  getRemoteInputs: () => Record<string, PlayerInput>;
  broadcastSnapshot: (s: WorldSnapshot) => void;
  getSnapshot: () => unknown | null;
  getSnapshotBuffer: () => { t: number; s: unknown }[];
  broadcastGameOver: (r: GameOverResult) => void; // host → clients (versus round end)
  getGameOver: () => GameOverResult | null; // client reads received result
  getConnectedIds: () => string[]; // host: ids still connected (self + live peers)
}

interface BattlefieldProps {
  onGameOver: (score: number, maxCombo: number, outcome?: 'victory' | 'defeat' | 'draw') => void;
  onStateUpdate: (updates: Partial<GameState>) => void;
  difficulty: number;
  status: GameState['status'];
  graphicsQuality: 'low' | 'medium' | 'high';
  playerConfigs: PlayerConfig[];
  online?: boolean;
  isHost?: boolean;
  localPlayerId?: string;
  net?: NetAdapter | null;
  directControls?: boolean;
  matchMode?: 'coop' | 'versus';
}

type PlayerEntity = Tank & {
  lastShot: number;
  ammo: number;
  maxAmmo: number;
  isCooldown: boolean;
  reloadTimer: number;
  reloadDuration: number;
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  weapon: 'projectile' | 'laser';
  regen: boolean;
  lastFireTime: number;
  regenAccumulator: number;
  tankClass: TankClass;
  energy: number;
  maxEnergy: number;
  ultActiveTimer: number;
  ultSpin: number;
  lastFireAlert?: number; // throttle for gunshot proximity pings
};

const PLAYER_COLORS = ['#38bdf8', '#fbbf24', '#22c55e', '#a855f7', '#fb7185', '#f97316', '#14b8a6', '#e879f9', '#84cc16', '#60a5fa'];

// Distinct, far-apart multiplayer spawns. Ordered so 2 players take opposite
// corners, then the remaining corners, then centre — never bunched together.
const SPAWN_POINTS = [
  { x: 180, y: 560 }, // bottom-left
  { x: 820, y: 140 }, // top-right (opposite)
  { x: 180, y: 140 }, // top-left
  { x: 820, y: 560 }, // bottom-right
  { x: 500, y: 350 }, // centre
];

// Battle-royale spawns as fractions of the big world — spread around the map so
// players start far apart, out of each other's view (a viewport is only
// ~1000×700 of the world). Ordered so the first few are opposite/spread for
// small lobbies, then filled in around the perimeter up to 10 players.
const BIG_SPAWN_FRACS = [
  [0.12, 0.16], // far top-left
  [0.88, 0.84], // far bottom-right (opposite)
  [0.86, 0.15], // far top-right
  [0.14, 0.85], // far bottom-left (opposite)
  [0.5, 0.5], // centre
  [0.5, 0.12], // top-mid
  [0.5, 0.88], // bottom-mid
  [0.12, 0.5], // left-mid
  [0.88, 0.5], // right-mid
  [0.3, 0.32], // inner offset
];

const DEFAULT_CONFIGS: PlayerConfig[] = [
  { id: 'player-tank', name: 'Player 1', control: 'wasd', color: '#38bdf8', isLocal: true, tankClass: 'assault' },
];

/** Scatter cover across the world: a mix of destructible crates and solid rocks,
 *  kept clear of spawn points and not heavily overlapping each other. */
function makeObstacles(worldW: number, worldH: number, count: number): Obstacle[] {
  const big = worldW > CANVAS_WIDTH;
  const spawns = big
    ? BIG_SPAWN_FRACS.map((f) => ({ x: f[0] * worldW, y: f[1] * worldH }))
    : [{ x: worldW / 2, y: worldH - 100 }];
  const obs: Obstacle[] = [];
  let tries = 0;
  while (obs.length < count && tries < count * 25) {
    tries++;
    const crate = Math.random() < 0.62;
    const w = crate ? 40 + Math.random() * 16 : 54 + Math.random() * 46;
    const h = crate ? w : 40 + Math.random() * 42;
    const x = 130 + Math.random() * (worldW - 260);
    const y = 130 + Math.random() * (worldH - 260);
    if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 420)) continue; // keep spawns clear
    if (obs.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 28 && Math.abs(o.y - y) < (o.h + h) / 2 + 28)) continue;
    const hp = crate ? 30 : 0;
    obs.push({ id: `o${obs.length}`, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), kind: crate ? 'crate' : 'rock', health: hp, maxHealth: hp });
  }
  return obs;
}

/** Push a tank (circle of radius r) out of an axis-aligned obstacle rect. */
function pushOutOfObstacle(t: { x: number; y: number }, o: Obstacle, r: number) {
  const hw = o.w / 2;
  const hh = o.h / 2;
  const cx = Math.max(o.x - hw, Math.min(t.x, o.x + hw));
  const cy = Math.max(o.y - hh, Math.min(t.y, o.y + hh));
  const dx = t.x - cx;
  const dy = t.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist >= r) return;
  if (dist > 0.0001) {
    const push = r - dist;
    t.x += (dx / dist) * push;
    t.y += (dy / dist) * push;
  } else {
    // Centre is inside the rect — eject along the shallowest edge.
    const left = t.x - (o.x - hw);
    const right = o.x + hw - t.x;
    const top = t.y - (o.y - hh);
    const bottom = o.y + hh - t.y;
    const minH = Math.min(left, right);
    const minV = Math.min(top, bottom);
    if (minH < minV) t.x += left < right ? -(left + r) : right + r;
    else t.y += top < bottom ? -(top + r) : bottom + r;
  }
}

/** Build a player tank for a slot, applying its class loadout, at a spawn point. */
function makePlayer(
  slot: number,
  count: number,
  config: PlayerConfig,
  worldW: number = CANVAS_WIDTH,
  worldH: number = CANVAS_HEIGHT,
): PlayerEntity {
  const cls = TANK_CLASSES[config.tankClass];
  // Big world (online): spread to far corners, out of sight. Small world: solo
  // spawns bottom-centre, local-2P uses the distinct corner spread points.
  let sx: number;
  let sy: number;
  let facing: number;
  const big = worldW > CANVAS_WIDTH;
  if (big) {
    const f = BIG_SPAWN_FRACS[slot % BIG_SPAWN_FRACS.length];
    sx = f[0] * worldW;
    sy = f[1] * worldH;
    facing = Math.atan2(worldH / 2 - sy, worldW / 2 - sx); // face the world centre
  } else if (count <= 1) {
    sx = worldW / 2;
    sy = worldH - 100;
    facing = -Math.PI / 2;
  } else {
    const sp = SPAWN_POINTS[slot % SPAWN_POINTS.length];
    sx = sp.x;
    sy = sp.y;
    facing = Math.atan2(CANVAS_HEIGHT / 2 - sy, CANVAS_WIDTH / 2 - sx); // face the arena centre
  }
  return {
    id: config.id || (slot === 0 ? 'player-tank' : `player-${slot}`),
    x: sx,
    y: sy,
    width: cls.width,
    height: cls.height,
    angle: facing,
    turretAngle: facing,
    health: cls.health,
    maxHealth: cls.health,
    speed: PHYSICS.MAX_SPEED,
    velocity: { x: 0, y: 0 },
    color: config.color || PLAYER_COLORS[slot] || '#38bdf8',
    isShielded: false,
    shootTimer: 0,
    shootInterval: cls.fireRate,
    type: 'player',
    recoilOffset: 0,
    lastShot: 0,
    tankClass: config.tankClass,
    ammo: cls.maxAmmo,
    maxAmmo: cls.maxAmmo,
    isCooldown: false,
    reloadTimer: 0,
    reloadDuration: cls.reload,
    damage: cls.damage,
    fireRate: cls.fireRate,
    bulletSpeed: cls.bulletSpeed,
    weapon: cls.weapon,
    regen: cls.regen,
    lastFireTime: 0,
    regenAccumulator: 0,
    energy: 0,
    maxEnergy: MAX_ENERGY,
    ultActiveTimer: 0,
    ultSpin: 0,
  };
}

/** Nearest living player to a point (enemy AI target). Falls back to slot 0. */
function nearestPlayer(players: PlayerEntity[], e: { x: number; y: number }): PlayerEntity {
  let best = players[0];
  let bd = Infinity;
  for (const p of players) {
    if (p.health <= 0) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

const Battlefield: React.FC<BattlefieldProps> = ({ onGameOver, onStateUpdate, difficulty, status, graphicsQuality, playerConfigs, online, isHost, localPlayerId, net, directControls, matchMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEndedRef = useRef(false);
  const statusRef = useRef(status);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<PixiRenderer | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onlineRef = useRef(false);
  const isHostRef = useRef(false);
  const localIdRef = useRef('');
  const netRef = useRef<NetAdapter | null>(null);
  const directRef = useRef(false);
  const versusRef = useRef(false);
  const clientHudSigRef = useRef('');
  const predictedSelfRef = useRef<{ x: number; y: number; angle: number; turretAngle: number; velocity: { x: number; y: number } } | null>(null);
  // Online plays on the big battle-royale world with a follow camera; solo /
  // local-2P keep the single-screen arena. Stable for the life of this match
  // (the component is keyed by gameId, so it remounts per match).
  const WORLD_W = online ? BIG_WORLD.w : CANVAS_WIDTH;
  const WORLD_H = online ? BIG_WORLD.h : CANVAS_HEIGHT;
  // ION STORM — shrinking safe-zone, online versus only. Starts covering the
  // whole world, then closes in phases (grace → shrink), dealing escalating
  // out-of-zone damage so the huge map can't be camped.
  const stormCx = WORLD_W / 2;
  const stormCy = WORLD_H / 2;
  const stormFull = Math.hypot(WORLD_W / 2, WORLD_H / 2) + 60;
  const stateRef = useRef({
    worldW: WORLD_W,
    worldH: WORLD_H,
    obstacles: makeObstacles(WORLD_W, WORLD_H, online ? 46 : 10),
    fireAlerts: [] as FireAlert[],
    storm: {
      active: online && matchMode === 'versus',
      cx: stormCx,
      cy: stormCy,
      radius: stormFull,
      fromR: stormFull,
      fromCx: stormCx,
      fromCy: stormCy,
      toR: stormFull * 0.6,
      toCx: stormCx,
      toCy: stormCy,
      state: 'grace' as 'grace' | 'shrink',
      timer: 0,
      grace: 14000,
      shrink: 18000,
      damage: 3,
      minR: 300,
    },
    score: 0,
    lastBossScore: 0,
    combo: 0,
    maxCombo: 0,
    lastComboTime: 0,
    difficulty: 1,
    killCount: 0,
    screenShake: 0,
    screenFlash: 0,
    players: (playerConfigs.length > 0 ? playerConfigs : DEFAULT_CONFIGS).map(
      (cfg, i, arr) => makePlayer(i, arr.length, cfg, WORLD_W, WORLD_H),
    ) as PlayerEntity[],
    enemies: [] as Tank[],
    bullets: [] as SpecializedBullet[],
    repairItems: [] as RepairItem[],
    energyCells: [] as EnergyCell[],
    explosions: [] as Explosion[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    spawnIndicators: [] as SpawnIndicator[],
    bomber: {
      active: false,
      x: -600,
      y: 0,
      targetY: 0,
      speed: 15,
      lastDropX: -1000,
      dropInterval: 75
    } as BomberSequence,
    keys: {} as Record<string, boolean>,
    mouse: { x: 0, y: 0, pressed: false, rightPressed: false },
    beams: [] as LaserBeam[],
    reportedAmmo: -1,
    reportedMaxAmmo: -1,
    reportedCooldown: false,
    reportedEnergy: -1,
    reportedUlt: false,
    spawnTimer: 0,
    difficultyTimer: 0,
    nukeCounter: 0,
    bomberCounter: 0,
    weatherTimer: 0,
    weather: WeatherType.Clear,
    terrain: TerrainType.Grassland,
    treadMarks: [] as TreadMark[]
  });

  const NUKE_TARGET = 15;
  const BOMBER_TARGET = 10;
  const RELOAD_DURATION = 1200;
  const REGEN_IDLE_TIME = 2000;
  const REPAIR_KILL_MILESTONE = 10;

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = activeCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    stateRef.current.mouse.x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    stateRef.current.mouse.y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
  };

  // The mouse is stored in viewport (0..1000) space; on the big world the turret
  // aims at a WORLD point, so add the follow-camera offset for the tank we're
  // controlling. On the small arena the camera offset is {0,0} (a no-op).
  const worldMouseFor = (p: { x: number; y: number }) => {
    const s = stateRef.current;
    const cam = cameraOffset(p.x, p.y, s.worldW, s.worldH);
    return { x: s.mouse.x + cam.x, y: s.mouse.y + cam.y, pressed: s.mouse.pressed, rightPressed: s.mouse.rightPressed };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) stateRef.current.mouse.pressed = true;
    if (e.button === 2) stateRef.current.mouse.rightPressed = true;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) stateRef.current.mouse.pressed = false;
    if (e.button === 2) stateRef.current.mouse.rightPressed = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { stateRef.current.keys[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { stateRef.current.keys[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Keep the live status available to the (memoized) update loop, and drop any
  // held movement keys the moment we leave 'playing' so the tank can't drift
  // under a pause/settings overlay.
  useEffect(() => {
    statusRef.current = status;
    if (status !== 'playing') {
      stateRef.current.keys = {};
      stateRef.current.mouse.pressed = false;
    }
  }, [status]);

  useEffect(() => {
    onlineRef.current = !!online;
    isHostRef.current = !!isHost;
    localIdRef.current = localPlayerId || '';
    netRef.current = net || null;
    directRef.current = !!directControls;
    versusRef.current = matchMode === 'versus';
  }, [online, isHost, localPlayerId, net, directControls, matchMode]);

  const createParticles = useCallback((x: number, y: number, color: string, count: number, type: Particle['type'] = 'spark') => {
    const s = stateRef.current;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (type === 'smoke' ? 2 : 5);
      s.particles.push({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        radius: Math.random() * (type === 'smoke' ? 10 : 3) + 1,
        opacity: 1,
        lifespan: Math.random() * (type === 'smoke' ? 60 : 30) + 10,
        color,
        type
      });
    }
  }, []);

  const initiateReload = useCallback((p: PlayerEntity) => {
    if (p.isCooldown || p.ammo >= p.maxAmmo) return;
    p.isCooldown = true;
    p.reloadTimer = p.reloadDuration;
  }, []);

  const fireBullet = useCallback((tank: Tank, isPlayer: boolean = true, customAngle?: number) => {
    const s = stateRef.current;
    const pe = isPlayer ? (tank as PlayerEntity) : null;
    if (pe && (pe.isCooldown || pe.ammo <= 0)) return;

    const angle = customAngle ?? tank.turretAngle;
    const isBoss = tank.enemyType === EnemyType.Boss;
    const speed = pe ? pe.bulletSpeed : isBoss ? 4.5 : 4;
    const dmg = pe ? pe.damage : isBoss ? 35 : 15;
    const col = pe ? tank.color : isBoss ? '#a855f7' : '#ef4444';

    s.bullets.push({
      id: Math.random().toString(36).substring(2, 10),
      x: tank.x + Math.cos(angle) * (tank.width / 2 + 15),
      y: tank.y + Math.sin(angle) * (tank.width / 2 + 15),
      width: isBoss ? 16 : 10,
      height: isBoss ? 30 : 22,
      angle,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      damage: dmg,
      color: col,
      isHighPowered: false,
      isSuperBullet: false,
      isExplosive: false,
      isAllied: isPlayer,
      ownerId: tank.id,
      radius: isBoss ? 12 : 8,
      history: [],
      trailHistory: []
    });

    if (pe) {
      pe.recoilOffset = PHYSICS.RECOIL_FORCE * 7;
      pe.velocity.x -= Math.cos(angle) * PHYSICS.RECOIL_FORCE;
      pe.velocity.y -= Math.sin(angle) * PHYSICS.RECOIL_FORCE;
      pe.ammo--;
      pe.lastFireTime = Date.now();
      audioService.playShoot(false);
      s.screenShake = Math.max(s.screenShake, 2.5);
      if (pe.ammo <= 0) initiateReload(pe);
    }
  }, [initiateReload]);

  const fireAutoSwarm = useCallback((count: number, source?: PlayerEntity) => {
    const s = stateRef.current;
    const src = source ?? s.players[0];
    // Versus: swarm hunts the other tanks; co-op: hunts AI enemies.
    const targets = versusRef.current
      ? s.players.filter((p) => p.id !== src.id && p.health > 0)
      : [...s.enemies];

    for (let i = 0; i < count; i++) {
        const sideOffset = (i % 2 === 0 ? 1 : -1) * (Math.PI / 1.5);
        const launchAngle = src.angle + sideOffset + (Math.random() - 0.5) * 0.4;
        const target = targets.length ? targets[i % targets.length] : undefined;

        s.bullets.push({
            id: `swarm-${Math.random().toString(36).substring(2, 10)}`,
            x: src.x,
            y: src.y,
            width: 12,
            height: 34,
            angle: launchAngle,
            dx: Math.cos(launchAngle) * 3,
            dy: Math.sin(launchAngle) * 3,
            damage: 120,
            color: '#64748b', 
            isHighPowered: false,
            isSuperBullet: false,
            isExplosive: true,
            isAllied: true,
            ownerId: src.id,
            radius: 10,
            history: [],
            trailHistory: [],
            isHoming: true,
            isPersistent: true,
            phase: 'eject',
            missileAge: 0,
            turnSpeed: 0.15,
            currentSpeed: 2,
            maxSpeed: 18,
            wobbleOffset: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.08,
            targetId: target?.id
        });
    }
    audioService.playMissileLaunch();
    s.screenShake = Math.max(s.screenShake, 25);
  }, []);

  // ── Versus (PvP) damage helpers — no-ops in co-op (friendly fire off) ──────
  /** Damage every living player within `radius` of (x,y), excluding the given id(s). */
  const damagePlayersRadius = useCallback((x: number, y: number, radius: number, dmg: number, except?: string | string[]) => {
    if (!versusRef.current) return;
    const s = stateRef.current;
    const skip = Array.isArray(except) ? except : except != null ? [except] : [];
    for (const p of s.players) {
      if (p.health <= 0 || skip.includes(p.id)) continue;
      if (Math.hypot(p.x - x, p.y - y) < radius) {
        p.health -= dmg;
        createParticles(p.x, p.y, p.color, 10, 'spark');
      }
    }
  }, [createParticles]);

  /** Damage every OTHER living player whose centre lies near a hitscan ray. */
  const damagePlayersRay = useCallback(
    (ox: number, oy: number, dirx: number, diry: number, range: number, perpPad: number, dmg: number, exceptId?: string) => {
      if (!versusRef.current) return;
      const s = stateRef.current;
      for (const p of s.players) {
        if (p.health <= 0 || p.id === exceptId) continue;
        const relx = p.x - ox;
        const rely = p.y - oy;
        const t = relx * dirx + rely * diry;
        if (t < 0 || t > range) continue;
        const perp = Math.abs(relx * diry - rely * dirx);
        if (perp < p.width / 2 + perpPad) {
          p.health -= dmg;
          createParticles(p.x, p.y, p.color, 12, 'spark');
        }
      }
    },
    [createParticles],
  );

  /** End the match (once). Versus winner = last tank standing; co-op = all down. */
  const endMatch = useCallback((winnerId: string) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    const s = stateRef.current;
    if (onlineRef.current && isHostRef.current && netRef.current) {
      netRef.current.broadcastGameOver({ winnerId, score: s.score, maxCombo: s.maxCombo });
    }
    const outcome = versusRef.current
      ? !winnerId
        ? 'draw'
        : winnerId === localIdRef.current
          ? 'victory'
          : 'defeat'
      : undefined;
    onGameOver(s.score, s.maxCombo, outcome);
  }, [onGameOver]);

  /** Win-condition check, run after damage each frame. */
  const checkGameOver = useCallback(() => {
    if (gameEndedRef.current) return;
    const s = stateRef.current;
    // Online host: a pilot who disconnected mid-round is eliminated (otherwise an
    // idle full-health ghost would keep the alive count up and hang the match).
    if (onlineRef.current && isHostRef.current && netRef.current) {
      const connected = new Set(netRef.current.getConnectedIds());
      for (const p of s.players) {
        if (p.health > 0 && p.id !== localIdRef.current && !connected.has(p.id)) p.health = 0;
      }
    }
    const alive = s.players.filter((p) => p.health > 0);
    if (versusRef.current) {
      // Last tank standing — only a real result with 2+ pilots.
      if (s.players.length >= 2 && alive.length <= 1) endMatch(alive[0]?.id ?? '');
    } else if (alive.length === 0) {
      endMatch('');
    }
  }, [endMatch]);

  // ION STORM — advance the shrinking safe-zone and damage anyone caught outside.
  const updateStorm = useCallback((delta: number) => {
    const st = stateRef.current.storm;
    if (!st.active) return;
    st.timer += delta;
    if (st.state === 'grace') {
      if (st.timer >= st.grace) {
        st.state = 'shrink';
        st.timer = 0;
        st.fromR = st.radius;
        st.fromCx = st.cx;
        st.fromCy = st.cy;
      }
    } else {
      const k = Math.min(1, st.timer / st.shrink);
      st.radius = st.fromR + (st.toR - st.fromR) * k;
      st.cx = st.fromCx + (st.toCx - st.fromCx) * k;
      st.cy = st.fromCy + (st.toCy - st.fromCy) * k;
      if (k >= 1) {
        // Ring closed — pause, ramp damage, plan a smaller ring inside this one.
        st.state = 'grace';
        st.timer = 0;
        st.damage *= 1.5;
        const prevR = st.toR;
        const nextR = Math.max(st.minR, prevR * 0.58);
        const maxOff = Math.max(0, prevR - nextR);
        const ang = Math.random() * Math.PI * 2;
        const off = Math.random() * maxOff;
        st.toR = nextR;
        st.toCx = st.cx + Math.cos(ang) * off;
        st.toCy = st.cy + Math.sin(ang) * off;
      }
    }
    // Out-of-zone damage (escalates each phase) → feeds the last-standing check.
    const dmg = st.damage * (delta / 1000);
    for (const p of stateRef.current.players) {
      if (p.health <= 0) continue;
      if (Math.hypot(p.x - st.cx, p.y - st.cy) > st.radius) p.health -= dmg;
    }
  }, []);

  // Keep every living tank out of solid cover (run after movement each frame).
  const resolveObstacles = useCallback(() => {
    const s = stateRef.current;
    if (!s.obstacles.length) return;
    const tanks = [...s.players, ...s.enemies];
    for (const t of tanks) {
      if (t.health <= 0) continue;
      const r = t.width * 0.42;
      for (const o of s.obstacles) pushOutOfObstacle(t, o, r);
    }
  }, []);

  // A crate was destroyed → spawn an energy cell (charges ultimates — the main
  // energy source in versus, where there are no AI kills) + a burst.
  const destroyCrate = useCallback((o: Obstacle) => {
    const s = stateRef.current;
    s.explosions.push({ x: o.x, y: o.y, radius: 5, maxRadius: 95, opacity: 1, fadeSpeed: 0.06, color: '#f59e0b' });
    createParticles(o.x, o.y, '#d97706', 16, 'spark');
    s.energyCells.push({ id: Math.random().toString(36).substring(2, 10), x: o.x, y: o.y, radius: 14, lifespan: 600, opacity: 1 });
    s.obstacles = s.obstacles.filter((ob) => ob.id !== o.id);
    s.screenShake = Math.max(s.screenShake, 6);
    audioService.playHit();
  }, [createParticles]);

  const requestSpawn = useCallback((type: EnemyType) => {
    // Online is pure battle-royale PvP for now — no AI waves. (Solo / local keep them.)
    if (onlineRef.current) return;
    const s = stateRef.current;
    let x, y, angle;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { x = Math.random() * CANVAS_WIDTH; y = 15; angle = Math.PI/2; } 
    else if (side === 1) { x = CANVAS_WIDTH - 15; y = Math.random() * CANVAS_HEIGHT; angle = Math.PI; } 
    else if (side === 2) { x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT - 15; angle = -Math.PI/2; } 
    else { x = 15; y = Math.random() * CANVAS_HEIGHT; angle = 0; } 

    s.spawnIndicators.push({ x, y, angle, timer: 75, type });
  }, []);

  const spawnSpecificEnemy = useCallback((type: EnemyType, xPos?: number, yPos?: number) => {
    const config = ENEMY_CONFIGS[type];
    let x = xPos, y = yPos;
    if (x === undefined || y === undefined) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = Math.random() * CANVAS_WIDTH; y = -150; }
      else if (side === 1) { x = CANVAS_WIDTH + 150; y = Math.random() * CANVAS_HEIGHT; }
      else if (side === 2) { x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT + 150; }
      else { x = -150; y = Math.random() * CANVAS_HEIGHT; }
    }

    stateRef.current.enemies.push({
      id: Math.random().toString(36).substring(2, 10),
      x, y, width: config.size, height: config.size * 0.8,
      angle: 0, turretAngle: 0,
      health: config.health * (1 + (stateRef.current.difficulty - 1) * 0.15),
      maxHealth: config.health * (1 + (stateRef.current.difficulty - 1) * 0.15),
      speed: config.speed, velocity: { x: 0, y: 0 }, color: config.color,
      isShielded: false, shootTimer: 0,
      shootInterval: type === EnemyType.Boss ? 1500 : 2500 / Math.max(1, stateRef.current.difficulty * 0.8),
      type: 'enemy', enemyType: type, recoilOffset: 0
    });
  }, []);

  const onEnemyKill = useCallback((e: Tank) => {
    const s = stateRef.current;
    const config = ENEMY_CONFIGS[e.enemyType!];
    s.score += config.score * s.difficulty;
    s.combo++;
    s.killCount++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.nukeCounter++;
    s.bomberCounter++;
    s.lastComboTime = Date.now();
    
    if (s.combo > 0 && s.combo % 10 === 0) {
      fireAutoSwarm(4);
      s.floatingTexts.push({
        x: s.players[0].x, y: s.players[0].y - 120,
        text: "STRIKE PROTOCOL: 4 UNITS",
        opacity: 1, lifespan: 150,
        color: '#facc15', size: 36
      });
      s.screenFlash = 0.2;
    }

    if (s.killCount > 0 && s.killCount % REPAIR_KILL_MILESTONE === 0) {
      stateRef.current.repairItems.push({
        id: Math.random().toString(36).substring(2, 9),
        x: e.x, y: e.y, radius: 24, lifespan: 1200, opacity: 1
      });
    }

    // Energy: trickle to the team per kill, plus an energy cell every few kills.
    s.players.forEach((pl) => {
      if (pl.health > 0) pl.energy = Math.min(pl.maxEnergy, pl.energy + ENERGY_PER_KILL);
    });
    if (s.killCount > 0 && s.killCount % ENERGY_DROP_KILLS === 0) {
      s.energyCells.push({
        id: Math.random().toString(36).substring(2, 9),
        x: e.x, y: e.y, radius: 16, lifespan: 1400, opacity: 1,
      });
    }

    if (e.enemyType === EnemyType.Boss) {
      s.screenShake = Math.max(s.screenShake, 80);
    } else {
      s.screenShake = Math.max(s.screenShake, 10 + Math.min(s.combo / 2, 40));
    }
    audioService.playCombo(s.combo);
    
    s.explosions.push({ 
      x: e.x, y: e.y, 
      radius: 5, 
      maxRadius: e.enemyType === EnemyType.Boss ? 500 : 100, 
      opacity: 1, fadeSpeed: e.enemyType === EnemyType.Boss ? 0.005 : 0.03, 
      color: e.enemyType === EnemyType.Boss ? '#7e22ce' : '#ea580c' 
    });
    audioService.playExplosion();
    
    onStateUpdate({ 
      score: s.score, combo: s.combo, maxCombo: s.maxCombo, 
      nukeReady: s.nukeCounter >= NUKE_TARGET, 
      nukeProgress: Math.min(100, (s.nukeCounter / NUKE_TARGET) * 100),
      bomberReady: s.bomberCounter >= BOMBER_TARGET,
      bomberProgress: Math.min(100, (s.bomberCounter / BOMBER_TARGET) * 100)
    });
  }, [onStateUpdate, fireAutoSwarm]);

  const resolveTankCollisions = useCallback(() => {
    const s = stateRef.current;
    const tanks = [...s.players, ...s.enemies];

    for (let i = 0; i < tanks.length; i++) {
        for (let j = i + 1; j < tanks.length; j++) {
            const tA = tanks[i];
            const tB = tanks[j];
            // Dead tanks (versus corpses) aren't solid — don't push/trap the living.
            if (tA.health <= 0 || tB.health <= 0) continue;

            // Approximate collision radius (using 85% of width for a tighter circular feel)
            const radiusA = (tA.width * 0.85) / 2;
            const radiusB = (tB.width * 0.85) / 2;
            const minDist = radiusA + radiusB;
            
            const dx = tB.x - tA.x;
            const dy = tB.y - tA.y;
            const dist = Math.hypot(dx, dy);

            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                // Kamikaze contact explosion
                let kamikazeExploded = false;
                if ((tA.type === 'player' && tB.enemyType === EnemyType.Kamikaze) ||
                    (tB.type === 'player' && tA.enemyType === EnemyType.Kamikaze)) {
                    
                    const kamikaze = tA.enemyType === EnemyType.Kamikaze ? tA : tB;
                    const player = tA.type === 'player' ? tA : tB;
                    
                    if (kamikaze.health > 0 && player.health > 0) {
                        player.health -= 30; // Kamikaze config damage
                        kamikaze.health = 0; // Trigger death
                        
                        audioService.playHit();
                        audioService.playExplosion();
                        
                        s.screenShake = Math.max(s.screenShake, 45); // Heavy screen shake!
                        
                        // Spawn explosion effect
                        s.explosions.push({
                            x: kamikaze.x,
                            y: kamikaze.y,
                            radius: 5,
                            maxRadius: 150,
                            opacity: 1,
                            fadeSpeed: 0.05,
                            color: '#ea580c'
                        });
                        
                        createParticles(kamikaze.x, kamikaze.y, '#ea580c', 20, 'spark');
                        
                        onEnemyKill(kamikaze);
                        kamikazeExploded = true;
                    }
                }

                // If one of the tanks is a player, add a tactile bump shake (unless Kamikaze exploded)
                if (!kamikazeExploded && (tA.type === 'player' || tB.type === 'player')) {
                    s.screenShake = Math.max(s.screenShake, Math.min(overlap * 2, 8));
                }

                // Push weight (Boss tanks are heavier and move less)
                let weightA = 1;
                let weightB = 1;
                
                if (tA.enemyType === EnemyType.Boss) weightA = 0.1;
                if (tB.enemyType === EnemyType.Boss) weightB = 0.1;
                if (tA.type === 'player') weightA = 0.5;
                if (tB.type === 'player') weightB = 0.5;

                const totalWeight = weightA + weightB;
                const pushA = overlap * (weightB / totalWeight);
                const pushB = overlap * (weightA / totalWeight);

                tA.x -= nx * pushA;
                tA.y -= ny * pushA;
                tB.x += nx * pushB;
                tB.y += ny * pushB;

                // Stop velocity on collision axis
                const dotA = tA.velocity.x * nx + tA.velocity.y * ny;
                if (dotA > 0) {
                    tA.velocity.x -= dotA * nx;
                    tA.velocity.y -= dotA * ny;
                }
                const dotB = tB.velocity.x * nx + tB.velocity.y * ny;
                if (dotB < 0) {
                    tB.velocity.x -= dotB * nx;
                    tB.velocity.y -= dotB * ny;
                }
            }
        }
    }
  }, [createParticles, onEnemyKill]);

  const update = useCallback((delta: number) => {
    const s = stateRef.current;
    if (statusRef.current !== 'playing' || gameEndedRef.current) return;

    // Resolve this player's controls through the shared PlayerInput seam (Phase 3).
    // Second-player and remote inputs will be injected the same way in later phases,
    // so the simulation never reads hardware (keys/mouse) directly.
    let inputs: PlayerInput[];
    if (onlineRef.current && isHostRef.current && netRef.current) {
      // Online host: the host's own tank uses local hardware; every other tank
      // uses the latest input received from that peer.
      const remote = netRef.current.getRemoteInputs();
      inputs = s.players.map((p) =>
        p.id === localIdRef.current ? sampleLocalInput(s.keys, worldMouseFor(p), p, directRef.current) : remote[p.id] ?? EMPTY_INPUT,
      );
    } else {
      inputs = sampleLocalInputs(s.keys, s.mouse, s.players, s.players.length, s.enemies, directRef.current);
    }
    // Reload, ammo regen and firing are handled per-player inside the movement loop below.

    if (s.screenShake > 0) s.screenShake *= 0.93;
    if (s.screenFlash > 0) s.screenFlash -= 0.04;

    // Traction from weather/terrain (shared with client-side prediction).
    const env = computeEnv(s.weather, s.terrain);

    // Tread-mark helper (shared across all tanks).
    const addTreadMarkObj = (t: Tank, col: string) => {
      const angle = t.angle;
      const L = t.width;
      const W = t.height;
      const lx = t.x - Math.cos(angle) * (L / 4) + Math.sin(angle) * (W / 2 - 4);
      const ly = t.y - Math.sin(angle) * (L / 4) - Math.cos(angle) * (W / 2 - 4);
      const rx = t.x - Math.cos(angle) * (L / 4) - Math.sin(angle) * (W / 2 - 4);
      const ry = t.y - Math.sin(angle) * (L / 4) + Math.cos(angle) * (W / 2 - 4);
      const width = t.width * 0.16;
      s.treadMarks.push({ x: lx, y: ly, angle, opacity: 0.38, color: col, width });
      s.treadMarks.push({ x: rx, y: ry, angle, opacity: 0.38, color: col, width });
    };

    const treadMarkColor =
      s.terrain === TerrainType.Desert
        ? 'rgba(139, 90, 43, 0.22)'
        : s.terrain === TerrainType.Snow
          ? 'rgba(100, 116, 139, 0.15)'
          : 'rgba(15, 23, 42, 0.25)';

    // Per-player movement, aiming and firing. Each tank has its own fire cadence;
    // ammo / combo / specials are shared team resources (co-op).
    for (let pi = 0; pi < s.players.length; pi++) {
      const p = s.players[pi];
      const pin = inputs[pi] ?? EMPTY_INPUT;
      if (p.health <= 0) continue;

      advanceTankMovement(p, pin, env);
      const playerSpeed = Math.hypot(p.velocity.x, p.velocity.y);

      if (playerSpeed > 0.45 && Math.random() < 0.65) addTreadMarkObj(p, treadMarkColor);

      if (playerSpeed > 0.3) {
        if (Math.random() < 0.38) {
          const exAngle = p.angle + Math.PI;
          const exX = p.x + Math.cos(exAngle) * (p.width / 2);
          const exY = p.y + Math.sin(exAngle) * (p.width / 2);
          s.particles.push({
            x: exX,
            y: exY,
            dx: Math.cos(exAngle + (Math.random() - 0.5) * 0.2) * (playerSpeed * 0.4),
            dy: Math.sin(exAngle + (Math.random() - 0.5) * 0.2) * (playerSpeed * 0.4),
            radius: Math.random() * 3.5 + 1.2,
            opacity: 0.55,
            lifespan: Math.random() * 18 + 12,
            color: s.terrain === TerrainType.Desert ? 'rgba(217, 119, 6, 0.25)' : 'rgba(148, 163, 184, 0.3)',
            type: 'exhaust',
          });
        }

        if ((s.weather === WeatherType.Snowstorm || s.terrain === TerrainType.Snow) && playerSpeed > 1.0 && Math.random() < 0.3) {
          const sprayAngle = p.angle + Math.PI + (Math.random() - 0.5) * 0.6;
          s.particles.push({
            x: p.x - Math.cos(p.angle) * (p.width / 3),
            y: p.y - Math.sin(p.angle) * (p.height / 3),
            dx: Math.cos(sprayAngle) * (playerSpeed * 0.5) + (Math.random() - 0.5) * 0.5,
            dy: Math.sin(sprayAngle) * (playerSpeed * 0.5) + (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 3 + 1,
            opacity: 0.6,
            lifespan: 12 + Math.random() * 8,
            color: '#e2e8f0',
            type: 'snow',
          });
        }
      }

      // (chassis + turret movement handled by advanceTankMovement above)

      // Per-player reload countdown.
      if (p.isCooldown) {
        p.reloadTimer -= delta;
        if (p.reloadTimer <= 0) {
          p.ammo = p.maxAmmo;
          p.isCooldown = false;
        }
      }
      p.reloading = p.isCooldown; // mirror for the renderer's ammo bar
      // Manual reload.
      if (pin.reload) initiateReload(p);
      // Idle ammo regen (only for classes that allow it).
      if (p.regen && !p.isCooldown && p.ammo < p.maxAmmo && Date.now() - p.lastFireTime > REGEN_IDLE_TIME) {
        p.regenAccumulator += delta;
        if (p.regenAccumulator > 500) {
          p.ammo = Math.min(p.maxAmmo, p.ammo + 2);
          p.regenAccumulator = 0;
        }
      }

      // Fire (laser hitscan for the railgun, projectile otherwise).
      if (pin.fire && !p.isCooldown && p.ammo > 0 && Date.now() - p.lastShot > p.fireRate) {
        if (p.weapon === 'laser') {
          const ox = p.x + Math.cos(p.turretAngle) * (p.width / 2);
          const oy = p.y + Math.sin(p.turretAngle) * (p.width / 2);
          const dirx = Math.cos(p.turretAngle);
          const diry = Math.sin(p.turretAngle);
          // Piercing: damage every enemy whose centre lies near the ray.
          s.enemies.forEach((e) => {
            const relx = e.x - ox;
            const rely = e.y - oy;
            const t = relx * dirx + rely * diry;
            if (t < 0 || t > LASER_RANGE) return;
            const perp = Math.abs(relx * diry - rely * dirx);
            if (perp < e.width / 2 + 8) {
              e.health -= p.damage;
              createParticles(ox + dirx * t, oy + diry * t, e.color, 10, 'spark');
              if (e.health <= 0) onEnemyKill(e);
            }
          });
          // Versus: the railgun beam pierces other players too.
          damagePlayersRay(ox, oy, dirx, diry, LASER_RANGE, 8, p.damage, p.id);
          s.beams.push({
            x1: ox,
            y1: oy,
            x2: ox + dirx * LASER_RANGE,
            y2: oy + diry * LASER_RANGE,
            color: p.color,
            life: 12,
            maxLife: 12,
            width: 6,
          });
          p.ammo--;
          p.lastFireTime = Date.now();
          p.recoilOffset = PHYSICS.RECOIL_FORCE * 9;
          audioService.playShoot(true);
          s.screenShake = Math.max(s.screenShake, 16);
          if (p.ammo <= 0) initiateReload(p);
        } else {
          fireBullet(p, true);
        }
        p.lastShot = Date.now();
        // Emit a gunshot proximity ping (throttled) so nearby enemies are warned.
        if (Date.now() - (p.lastFireAlert ?? 0) > 220) {
          p.lastFireAlert = Date.now();
          s.fireAlerts.push({ x: p.x, y: p.y, ownerId: p.id, life: 42, maxLife: 42 });
          if (s.fireAlerts.length > 40) s.fireAlerts.shift();
        }
      }

      // ── Ultimate ──────────────────────────────────────────────────────
      // MAELSTROM (Vanguard): while active, emit a rotating spiral of bullets.
      if (p.ultActiveTimer > 0) {
        p.ultActiveTimer -= delta;
        p.ultSpin += 0.45;
        for (let k = 0; k < 2; k++) {
          const a = p.ultSpin + (k / 2) * Math.PI * 2;
          s.bullets.push({
            id: Math.random().toString(36).substring(2, 10),
            x: p.x + Math.cos(a) * (p.width / 2),
            y: p.y + Math.sin(a) * (p.width / 2),
            width: 9, height: 20, angle: a,
            dx: Math.cos(a) * 16, dy: Math.sin(a) * 16,
            damage: 22, color: p.color,
            isHighPowered: false, isSuperBullet: false, isExplosive: false,
            isAllied: true, ownerId: p.id, radius: 7, history: [], trailHistory: [],
          });
        }
      }

      // Trigger an ultimate when the energy gauge is full.
      if (pin.ult && p.energy >= p.maxEnergy && p.ultActiveTimer <= 0) {
        p.energy = 0;
        const accent = TANK_CLASSES[p.tankClass].accent;
        s.floatingTexts.push({
          x: p.x, y: p.y - 90, text: ULTIMATES[p.tankClass].label,
          opacity: 1, lifespan: 130, color: accent, size: 34,
        });
        if (p.tankClass === 'assault') {
          // VALKYRIE BARRAGE: missile salvo + shockwave nova.
          fireAutoSwarm(12, p);
          s.explosions.push({ x: p.x, y: p.y, radius: 10, maxRadius: 320, opacity: 1, fadeSpeed: 0.02, color: accent });
          s.enemies.forEach((e) => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < 320) { e.health -= 80; if (e.health <= 0) onEnemyKill(e); }
          });
          damagePlayersRadius(p.x, p.y, 320, 80, p.id); // versus: nova hits other tanks
          s.screenFlash = Math.max(s.screenFlash, 0.6);
          s.screenShake = Math.max(s.screenShake, 60);
        } else if (p.tankClass === 'vanguard') {
          // MAELSTROM: spin up for 3s (handled above while active).
          p.ultActiveTimer = 3000;
          p.ultSpin = 0;
          s.screenFlash = Math.max(s.screenFlash, 0.3);
          s.screenShake = Math.max(s.screenShake, 30);
        } else {
          // ORBITAL LANCE (railgun): colossal screen-piercing beam.
          const dirx = Math.cos(p.turretAngle);
          const diry = Math.sin(p.turretAngle);
          s.enemies.forEach((e) => {
            const relx = e.x - p.x;
            const rely = e.y - p.y;
            const t = relx * dirx + rely * diry;
            if (t < 0 || t > LASER_RANGE) return;
            const perp = Math.abs(relx * diry - rely * dirx);
            if (perp < e.width / 2 + 45) {
              e.health -= 400;
              createParticles(p.x + dirx * t, p.y + diry * t, '#ffffff', 18, 'spark');
              if (e.health <= 0) onEnemyKill(e);
            }
          });
          damagePlayersRay(p.x, p.y, dirx, diry, LASER_RANGE, 45, 400, p.id); // versus: lance vaporises tanks
          s.beams.push({ x1: p.x, y1: p.y, x2: p.x + dirx * LASER_RANGE, y2: p.y + diry * LASER_RANGE, color: '#ffffff', life: 22, maxLife: 22, width: 42 });
          s.screenFlash = Math.max(s.screenFlash, 1.0);
          s.screenShake = Math.max(s.screenShake, 120);
        }
        audioService.playNuke();
      }
      p.ultReady = p.energy >= p.maxEnergy;

      p.recoilOffset *= 0.75;
    }

    if (s.score - s.lastBossScore >= BOSS_SCORE_THRESHOLD) {
      s.lastBossScore = s.score;
      requestSpawn(EnemyType.Boss);
      audioService.playNotification();
    }
    s.difficultyTimer += delta;
    if (s.difficultyTimer > DIFFICULTY_INTERVAL) {
      s.difficulty++; s.difficultyTimer = 0;
      onStateUpdate({ difficulty: s.difficulty });
      audioService.updateDifficulty(s.difficulty);
    }
    s.spawnTimer += delta;
    if (s.spawnTimer > (2400 / Math.max(1, s.difficulty * 0.8))) {
      const types = (Object.keys(ENEMY_CONFIGS) as EnemyType[]).filter(t => t !== EnemyType.Boss);
      requestSpawn(types[Math.floor(Math.random() * types.length)]);
      s.spawnTimer = 0;
    }

    s.spawnIndicators.forEach(ind => {
      ind.timer--;
      if (ind.timer <= 0) spawnSpecificEnemy(ind.type, ind.x, ind.y);
    });
    s.spawnIndicators = s.spawnIndicators.filter(ind => ind.timer > 0);

    s.enemies.forEach(e => {
      const target = nearestPlayer(s.players, e);
      const dist = Math.hypot(target.x - e.x, target.y - e.y);
      const angle = Math.atan2(target.y - e.y, target.x - e.x);

      // Determine detection status based on current active weather settings
      let detectsPlayer = true;
      if (s.weather === WeatherType.Fog) {
        detectsPlayer = dist < 260; // Restricted foggy vision
      } else if (s.weather === WeatherType.Snowstorm) {
        detectsPlayer = dist < 240; // Dense swirling whiteout blizzard
      } else if (s.weather === WeatherType.Sandstorm) {
        detectsPlayer = dist < 320; // Blinding sand storm winds
      } else if (s.weather === WeatherType.Rain) {
        detectsPlayer = dist < 420; // Heavy cloud/downpour darkness
      }

      // 1. Steering Chassis direction
      if (detectsPlayer) {
        let chassisDiff = angle - e.angle;
        while (chassisDiff < -Math.PI) chassisDiff += Math.PI * 2;
        while (chassisDiff > Math.PI) chassisDiff -= Math.PI * 2;
        const turnLimit = ENEMY_CONFIGS[e.enemyType!].turnSpeed;
        e.angle += Math.max(-turnLimit, Math.min(turnLimit, chassisDiff));
      } else {
        // Lost telemetry target! Just wander or maintain coarse direction
        e.angle += Math.sin(Date.now() * 0.0012 + e.x) * 0.01;
      }

      // Bosses and Kamikazes move regardless, but other enemies only track if they detect the player
      const searchTargetDist = detectsPlayer ? dist : 9999;
      const isMoving = e.enemyType === EnemyType.Kamikaze || searchTargetDist > (e.enemyType === EnemyType.Boss ? 500 : 250);
      if (isMoving) {
        e.x += Math.cos(e.angle) * e.speed; e.y += Math.sin(e.angle) * e.speed;
        
        // Spawn tread marks for enemies
        if (Math.random() < 0.25) {
          addTreadMarkObj(e, treadMarkColor);
        }
        
        // Engine exhaust particulates for enemies
        if (Math.random() < 0.16) {
          const exAngle = e.angle + Math.PI;
          const exX = e.x + Math.cos(exAngle) * (e.width / 2);
          const exY = e.y + Math.sin(exAngle) * (e.width / 2);
          s.particles.push({
            x: exX, y: exY,
            dx: Math.cos(exAngle + (Math.random()-0.5)*0.3) * (e.speed * 0.355),
            dy: Math.sin(exAngle + (Math.random()-0.5)*0.3) * (e.speed * 0.355),
            radius: Math.random() * 2.5 + 1.0,
            opacity: 0.45,
            lifespan: Math.random() * 15 + 8,
            color: s.terrain === TerrainType.Desert ? 'rgba(217, 119, 6, 0.18)' : 'rgba(148, 163, 184, 0.22)',
            type: 'exhaust'
          });
        }
      }

      // Turret aiming and shooting (only fires when player is within visibility)
      if (detectsPlayer) {
        e.turretAngle = angle;
        e.shootTimer += delta;
        if (e.enemyType !== EnemyType.Kamikaze && e.shootTimer > e.shootInterval) {
          fireBullet(e, false); e.shootTimer = 0;
        }
      } else {
        // Settle turret back to the chassis orientation
        let turretDiff = e.angle - e.turretAngle;
        while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
        while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
        e.turretAngle += Math.max(-0.04, Math.min(0.04, turretDiff));
      }

      if (e.enemyType === EnemyType.Boss) {
        if (!e.specialAttackTimer) e.specialAttackTimer = 0;
        e.specialAttackTimer += delta;
        // Boss specialized attack fires anyway but is slower if player isn't detected
        if (e.specialAttackTimer > (detectsPlayer ? 3000 : 5000)) {
          e.specialAttackTimer = 0;
          for (let i = 0; i < 18; i++) fireBullet(e, false, (i / 18) * Math.PI * 2);
        }
      }
    });

    // RESOLVE TANK COLLISIONS
    resolveTankCollisions();
    resolveObstacles();

    // Bound Checks after collision resolution
    for (const p of s.players) {
      p.x = Math.max(30, Math.min(s.worldW - 30, p.x));
      p.y = Math.max(30, Math.min(s.worldH - 30, p.y));
    }

    const bToRemove = new Set<string>();
    
    // BULLET vs BULLET COLLISION (Allied bullets can deflect enemy bullets)
    s.bullets.forEach(b1 => {
        if (b1.isAllied && !bToRemove.has(b1.id)) {
            s.bullets.forEach(b2 => {
                if (!b2.isAllied && !bToRemove.has(b2.id)) {
                    const dist = Math.hypot(b1.x - b2.x, b1.y - b2.y);
                    if (dist < b1.radius + b2.radius) {
                        bToRemove.add(b1.id);
                        bToRemove.add(b2.id);
                        createParticles(b1.x, b1.y, '#fff', 6, 'spark');
                    }
                }
            });
        }
    });

    s.bullets.forEach((b) => {
      if (bToRemove.has(b.id)) return;
      
      if (b.isHoming) {
          b.missileAge! += 1;
          if (b.phase === 'eject' && b.missileAge! > 25) b.phase = 'ignition';
          if (b.phase === 'ignition') { 
              b.currentSpeed = Math.min(b.maxSpeed!, b.currentSpeed! + 1.5); 
              b.phase = 'homing'; 
          }
          if (b.phase === 'homing') {
              b.currentSpeed = Math.min(b.maxSpeed!, b.currentSpeed! + 0.45);
              // Versus: missiles hunt other tanks; co-op: AI enemies.
              const homingPool: Tank[] = versusRef.current
                ? s.players.filter((p) => p.id !== b.ownerId && p.health > 0)
                : s.enemies;
              if (!b.targetId || !homingPool.find(e => e.id === b.targetId)) {
                  let nearest = null; let minDist = Infinity;
                  homingPool.forEach(e => {
                      const d = Math.hypot(e.x - b.x, e.y - b.y);
                      if (d < minDist) { minDist = d; nearest = e; }
                  });
                  if (nearest) b.targetId = (nearest as Tank).id;
                  else {
                      const orbitAngle = Math.atan2(b.y - s.players[0].y, b.x - s.players[0].x) + 0.05;
                      const tx = s.players[0].x + Math.cos(orbitAngle) * 220;
                      const ty = s.players[0].y + Math.sin(orbitAngle) * 220;
                      const targetAngle = Math.atan2(ty - b.y, tx - b.x);
                      let angleDiff = targetAngle - b.angle;
                      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                      b.angle += Math.max(-b.turnSpeed!, Math.min(b.turnSpeed!, angleDiff));
                  }
              }
              const target = homingPool.find(e => e.id === b.targetId);
              if (target) {
                  const targetAngle = Math.atan2(target.y - b.y, target.x - b.x);
                  let angleDiff = targetAngle - b.angle;
                  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                  b.angle += Math.max(-b.turnSpeed!, Math.min(b.turnSpeed!, angleDiff));
              }
              b.angle += Math.sin(b.missileAge! * 0.18 + b.wobbleOffset!) * 0.06;
              b.dx = Math.cos(b.angle) * b.currentSpeed!; b.dy = Math.sin(b.angle) * b.currentSpeed!;
          }
          if (b.phase !== 'eject' && b.missileAge! % 2 === 0) createParticles(b.x - Math.cos(b.angle) * 15, b.y - Math.sin(b.angle) * 15, '#fbbf24', 1, 'smoke');
      }

      b.x += b.dx; b.y += b.dy;
      b.trailHistory.push({x: b.x, y: b.y});
      if (b.trailHistory.length > 25) b.trailHistory.shift();

      // Cover blocks projectiles — crates take damage (and drop energy when
      // destroyed), rocks just absorb. (The railgun laser pierces cover instead.)
      for (const o of s.obstacles) {
        if (Math.abs(b.x - o.x) < o.w / 2 + b.radius && Math.abs(b.y - o.y) < o.h / 2 + b.radius) {
          bToRemove.add(b.id);
          if (o.kind === 'crate') {
            o.health -= b.damage;
            createParticles(b.x, b.y, '#fbbf24', 8, 'spark');
            if (o.health <= 0) destroyCrate(o);
          } else {
            createParticles(b.x, b.y, '#94a3b8', 6, 'spark');
          }
          break;
        }
      }
      if (bToRemove.has(b.id)) return; // blocked by cover

      if (b.isAllied) {
        // Versus: a player's bullet damages OTHER players (never its owner).
        if (versusRef.current) {
          for (const p of s.players) {
            if (p.health <= 0 || p.id === b.ownerId) continue;
            if (Math.hypot(b.x - p.x, b.y - p.y) < p.width / 2 + b.radius) {
              p.health -= b.damage; bToRemove.add(b.id);
              audioService.playHit();
              createParticles(b.x, b.y, p.color, 14, 'spark');
              if (b.isExplosive) {
                s.explosions.push({ x: b.x, y: b.y, radius: 5, maxRadius: 150, opacity: 1, fadeSpeed: 0.07, color: '#f97316' });
                // Splash hits OTHERS only — the direct victim already took the full hit.
                damagePlayersRadius(b.x, b.y, 150, b.damage * 0.5, [b.ownerId ?? '', p.id]);
              }
              break;
            }
          }
          if (bToRemove.has(b.id)) return; // consumed by a PvP hit
        }
        s.enemies.forEach(e => {
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.width/2 + b.radius) {
            e.health -= b.damage; bToRemove.add(b.id);
            createParticles(b.x, b.y, e.color, 15, 'spark');
            if (e.health <= 0) onEnemyKill(e);
            if (b.isExplosive) {
                s.explosions.push({ x: b.x, y: b.y, radius: 5, maxRadius: 150, opacity: 1, fadeSpeed: 0.07, color: '#f97316' });
                s.screenShake = Math.max(s.screenShake, 22);
            }
          }
        });
      } else {
        for (const p of s.players) {
          if (p.health <= 0) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.width / 2) {
            p.health -= b.damage; bToRemove.add(b.id);
            audioService.playHit();
            s.screenShake = Math.max(s.screenShake, b.damage * 1.5 + 10);
            break;
          }
        }
      }
    });

    s.bullets = s.bullets.filter(b => {
        if (bToRemove.has(b.id)) return false;
        if (b.isPersistent) return true;
        return b.x > -300 && b.x < s.worldW + 300 && b.y > -300 && b.y < s.worldH + 300;
    });
    
    s.enemies = s.enemies.filter(e => e.health > 0);

    // Decay laser beams (renderer-side visual would also work; kept in sim for the snapshot).
    s.beams.forEach((b) => (b.life -= 1));
    s.beams = s.beams.filter((b) => b.life > 0);

    s.repairItems.forEach(item => {
      item.lifespan--; if (item.lifespan < 100) item.opacity = item.lifespan / 100;
      for (const p of s.players) {
        if (p.health > 0 && Math.hypot(p.x - item.x, p.y - item.y) < 65) {
          p.health = p.maxHealth; item.lifespan = 0; audioService.playRepair(); break;
        }
      }
    });
    s.repairItems = s.repairItems.filter(i => i.lifespan > 0);

    // Energy cells: collected per-player to charge the ultimate gauge.
    s.energyCells.forEach((item) => {
      item.lifespan--;
      if (item.lifespan < 100) item.opacity = item.lifespan / 100;
      for (const p of s.players) {
        if (p.health > 0 && Math.hypot(p.x - item.x, p.y - item.y) < 60) {
          p.energy = Math.min(p.maxEnergy, p.energy + ENERGY_CELL_VALUE);
          item.lifespan = 0;
          audioService.playNotification();
          createParticles(item.x, item.y, '#a78bfa', 14, 'spark');
          break;
        }
      }
    });
    s.energyCells = s.energyCells.filter((i) => i.lifespan > 0);

    // NUKE + AIR STRIKE are co-op-only. In versus they'd let one player wipe the
    // whole map, so they're disabled — PvP relies on the energy-gated ultimate.
    const nukeIdx = versusRef.current ? -1 : inputs.findIndex((i) => i.nuke);
    if (nukeIdx >= 0 && s.nukeCounter >= NUKE_TARGET) {
      const origin = s.players[nukeIdx] ?? s.players[0];
      s.nukeCounter = 0; s.screenShake = 150; s.screenFlash = 1.0;
      s.explosions.push({ x: origin.x, y: origin.y, radius: 10, maxRadius: 1800, opacity: 1, fadeSpeed: 0.008, color: '#fef3c7' });
      s.enemies.forEach(e => { if(e.enemyType === EnemyType.Boss) e.health -= 600; else e.health = 0; onEnemyKill(e); });
      s.bullets = s.bullets.filter(b => b.isAllied);
      audioService.playNuke();
      onStateUpdate({ nukeReady: false, nukeProgress: 0 });
    }

    const bomberIdx = versusRef.current ? -1 : inputs.findIndex((i) => i.bomber);
    if (bomberIdx >= 0 && s.bomberCounter >= BOMBER_TARGET && !s.bomber.active) {
      const origin = s.players[bomberIdx] ?? s.players[0];
      s.bomberCounter = 0; s.bomber.active = true; s.bomber.x = -600; s.bomber.y = origin.y; s.bomber.lastDropX = -600;
      onStateUpdate({ bomberReady: false, bomberProgress: 0 });
    }
    if (s.bomber.active) {
      s.bomber.x += s.bomber.speed;
      if (s.bomber.x > s.bomber.lastDropX + s.bomber.dropInterval) {
        const bx = s.bomber.x, by = s.bomber.y + (Math.random()-0.5)*350;
        const blastRadius = 380;
        s.explosions.push({ x: bx, y: by, radius: 10, maxRadius: blastRadius, opacity: 1, fadeSpeed: 0.04, color: '#4f46e5' });
        s.screenShake = Math.max(s.screenShake, 35);
        s.enemies.forEach(e => { if (Math.hypot(e.x - bx, e.y - by) < 250) { e.health -= 200; if(e.health<=0) onEnemyKill(e); } });
        s.bullets = s.bullets.filter(b => b.isAllied || Math.hypot(b.x - bx, b.y - by) > blastRadius * 0.8);
        s.bomber.lastDropX = bx;
      }
      if (s.bomber.x > CANVAS_WIDTH + 1000) s.bomber.active = false;
    }

    // Climate & Environmental Shifts (every 30s). Skipped online — the big
    // battle-royale map uses the ION STORM as its environmental mechanic, and the
    // heavy weather vision-shroud reads as an ugly grey box on the scrolled world.
    s.weatherTimer += delta;
    if (!onlineRef.current && s.weatherTimer > 30000) { // Slight increase to 30s to let players adapt
      s.weatherTimer = 0;
      
      const weathers = Object.values(WeatherType);
      const terrains = Object.values(TerrainType);
      
      let nextWeather = weathers[Math.floor(Math.random() * weathers.length)];
      let nextTerrain = terrains[Math.floor(Math.random() * terrains.length)];
      
      // Keep extreme weather terrains visually and physically consistent
      if (nextWeather === WeatherType.Snowstorm) {
        nextTerrain = TerrainType.Snow;
      } else if (nextWeather === WeatherType.Sandstorm) {
        nextTerrain = TerrainType.Desert;
      }
      
      s.weather = nextWeather;
      s.terrain = nextTerrain;
      
      // Elegant descriptive color schemes for floating texts based on weather
      const shiftColor = nextWeather === WeatherType.Clear ? '#38bdf8' :
                         (nextWeather === WeatherType.Snowstorm ? '#38bdf8' :
                          (nextWeather === WeatherType.Rain ? '#60a5fa' :
                           (nextWeather === WeatherType.Sandstorm ? '#f59e0b' : '#94a3b8')));

      s.floatingTexts.push({
        x: s.players[0].x, y: s.players[0].y - 120,
        text: `SURROUNDINGS CHANGED: ${nextTerrain.toUpperCase()} | ${nextWeather.toUpperCase()}`,
        opacity: 1, lifespan: 180,
        color: shiftColor, size: 18
      });
      
      s.screenFlash = 0.35;
      
      onStateUpdate({ weather: s.weather, terrain: s.terrain });
    }

    // Dynamic environmental weather emissions (skipped online: particles aren't
    // networked and the small-arena emit ranges don't cover the big world).
    if (!onlineRef.current && s.weather === WeatherType.Rain) {
      for (let i = 0; i < 5; i++) {
        s.particles.push({
          x: Math.random() * CANVAS_WIDTH,
          y: -10,
          dx: -2.0 - Math.random() * 2,
          dy: 14 + Math.random() * 6,
          radius: Math.random() * 1.5 + 0.5,
          opacity: 0.65,
          lifespan: 60,
          color: '#38bdf8',
          type: 'rain'
        });
      }
    } else if (!onlineRef.current && s.weather === WeatherType.Sandstorm) {
      for (let i = 0; i < 6; i++) {
        s.particles.push({
          x: CANVAS_WIDTH + 10,
          y: Math.random() * CANVAS_HEIGHT,
          dx: -9.0 - Math.random() * 5,
          dy: (Math.random() - 0.5) * 1.4,
          radius: Math.random() * 2 + 1,
          opacity: 0.72,
          lifespan: 80,
          color: '#d97706',
          type: 'sand'
        });
      }
    } else if (!onlineRef.current && s.weather === WeatherType.Fog) {
      if (Math.random() < 0.12) {
        s.particles.push({
          x: -50,
          y: Math.random() * CANVAS_HEIGHT,
          dx: 0.4 + Math.random() * 0.8,
          dy: (Math.random() - 0.5) * 0.3,
          radius: Math.random() * 60 + 50,
          opacity: 0.08,
          lifespan: 300,
          color: '#cbd5e1',
          type: 'smoke'
        });
      }
    } else if (!onlineRef.current && s.weather === WeatherType.Snowstorm) {
      // Blinding snowstorm thick particle generator
      for (let i = 0; i < 6; i++) {
        s.particles.push({
          x: Math.random() * (CANVAS_WIDTH + 300),
          y: -10,
          dx: -3.5 - Math.random() * 4.5,
          dy: 4.0 + Math.random() * 4.5,
          radius: Math.random() * 2.8 + 1.0,
          opacity: 0.75,
          lifespan: 110,
          color: '#ffffff',
          type: 'snow'
        });
      }
    }

    s.fireAlerts.forEach((a) => a.life--);
    s.fireAlerts = s.fireAlerts.filter((a) => a.life > 0);

    s.explosions.forEach(exp => { exp.radius += 16; exp.opacity -= exp.fadeSpeed; });
    s.explosions = s.explosions.filter(exp => exp.opacity > 0);
    s.particles.forEach(p => { p.x += p.dx; p.y += p.dy; p.lifespan--; p.opacity -= 0.025; });
    s.particles = s.particles.filter(p => p.lifespan > 0);
    s.floatingTexts.forEach(t => { t.y -= 2.2; t.opacity -= 0.02; t.lifespan--; });
    s.floatingTexts = s.floatingTexts.filter(t => t.lifespan > 0);
    
    // Decay and clean tread marks to keep memory low and prevent render slows
    s.treadMarks.forEach(tm => {
      tm.opacity -= 0.0016;
    });
    s.treadMarks = s.treadMarks.filter(tm => tm.opacity > 0.01);
    if (s.treadMarks.length > 800) {
      s.treadMarks = s.treadMarks.slice(s.treadMarks.length - 800);
    }

    if (s.combo > 0 && Date.now() - s.lastComboTime > COMBO_TIMEOUT) { s.combo = 0; onStateUpdate({ combo: 0 }); }

    // ION STORM closes in and damages out-of-zone tanks (online versus).
    updateStorm(delta);

    // Win condition (co-op: all down · versus: last tank standing).
    checkGameOver();

    // Report player 1's ammo/reload to the HUD only when it changes.
    const p0 = s.players[0];
    if (
      p0 &&
      (p0.ammo !== s.reportedAmmo ||
        p0.isCooldown !== s.reportedCooldown ||
        p0.maxAmmo !== s.reportedMaxAmmo ||
        p0.energy !== s.reportedEnergy ||
        !!p0.ultReady !== s.reportedUlt)
    ) {
      s.reportedAmmo = p0.ammo;
      s.reportedCooldown = p0.isCooldown;
      s.reportedMaxAmmo = p0.maxAmmo;
      s.reportedEnergy = p0.energy;
      s.reportedUlt = !!p0.ultReady;
      onStateUpdate({
        ammo: p0.ammo,
        maxAmmo: p0.maxAmmo,
        isCooldown: p0.isCooldown,
        energy: p0.energy,
        maxEnergy: p0.maxEnergy,
        ultReady: !!p0.ultReady,
        ultName: ULTIMATES[p0.tankClass].label,
      });
    }
  }, [onStateUpdate, status, onGameOver, spawnSpecificEnemy, fireBullet, onEnemyKill, initiateReload, createParticles, fireAutoSwarm, requestSpawn, resolveTankCollisions, checkGameOver, damagePlayersRadius, damagePlayersRay, updateStorm, resolveObstacles, destroyCrate]);

  const drawTank = (ctx: CanvasRenderingContext2D, t: Tank) => {
    ctx.save(); ctx.translate(t.x, t.y);
    const L = t.width, W = t.height;
    
    // 1. Draw headlight cones in world coordinates
    ctx.save(); 
    ctx.rotate(t.angle);
    if (t.type === 'player' || t.enemyType === EnemyType.Boss) {
      const bGrad = ctx.createRadialGradient(L/2, 0, 0, L/2+280, 0, 280);
      const headlightColor = t.type === 'player' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(239, 68, 68, 0.35)';
      bGrad.addColorStop(0, headlightColor);
      bGrad.addColorStop(0.3, t.type === 'player' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.1)');
      bGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = bGrad;
      ctx.beginPath(); 
      ctx.moveTo(L/2, -W/4); 
      ctx.lineTo(L/2+280, -W*1.4); 
      ctx.lineTo(L/2+280, W*1.4); 
      ctx.lineTo(L/2, W/4); 
      ctx.closePath(); 
      ctx.fill();
      
      // Draw actual glowing bulb beams on the chassis corners
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = t.type === 'player' ? '#38bdf8' : '#ef4444';
      ctx.beginPath();
      ctx.arc(L/2 - 2, -W/3, 4, 0, Math.PI*2);
      ctx.arc(L/2 - 2, W/3, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // 2. Draw moving track tread assemblies
    ctx.save();
    ctx.rotate(t.angle);
    
    // Treads: Left and Right side slabs
    const treadYOffset = W/2 - 2;
    const treadW = L * 1.05;
    const treadH = W * 0.22;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    
    // Draw outer tread tread contours
    ctx.beginPath();
    ctx.roundRect(-treadW/2, -treadYOffset - treadH/2, treadW, treadH, 4);
    ctx.roundRect(-treadW/2, treadYOffset - treadH/2, treadW, treadH, 4);
    ctx.fill();
    ctx.stroke();

    // Draw individual tread track metal plates based on tank speed/time
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    const scroll = (t.type === 'player' ? Date.now() * 0.05 : Date.now() * 0.02) % 12;
    for (let xOffset = -treadW/2 + 3; xOffset < treadW/2; xOffset += 6) {
        const sx = xOffset + (Math.sin(scroll) * 0.5); // shift a bit for animation
        ctx.beginPath();
        ctx.moveTo(sx, -treadYOffset - treadH/2);
        ctx.lineTo(sx, -treadYOffset + treadH/2);
        ctx.moveTo(sx, treadYOffset - treadH/2);
        ctx.lineTo(sx, treadYOffset + treadH/2);
        ctx.stroke();
    }
    
    // 3. Chassis Shadow & Core Build
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(-L/2 + 4, -W/2 + 4, L, W, 8);
    ctx.fill();

    // Set base chassis colors structure based on tank style
    let fillStyle = t.color;
    let strokeStyle = t.color;
    ctx.lineWidth = 3.5;

    if (t.type === 'player') {
        // Player gets high tech hyper blue chassis
        fillStyle = '#0f172a'; // Sleek dark metallic hull
        strokeStyle = '#38bdf8'; // Glowing neon blue accents
    } else if (t.enemyType === EnemyType.Boss) {
        fillStyle = '#111827'; // Dark purple-black titan structure
        strokeStyle = '#a855f7'; // Glowing purple neon borders
    } else if (t.enemyType === EnemyType.Heavy) {
        fillStyle = '#1e293b';
        strokeStyle = '#e2e8f0'; // Cast iron armor look
    } else if (t.enemyType === EnemyType.Kamikaze) {
        fillStyle = '#7f1d1d';
        strokeStyle = '#ef4444'; // Alarm red
    } else {
        // normal or fast
        fillStyle = '#111827';
        strokeStyle = t.color;
    }

    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    ctx.roundRect(-L/2, -W/2, L, W, 8);
    ctx.fill();
    ctx.stroke();

    // 4. Detail overlays: Armor plates & Neon glow lines on chassis
    ctx.strokeStyle = strokeStyle + '66'; // semi-transparent glow lines
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // draw sleek tech plating channels on chassis
    ctx.moveTo(-L/4, -W/3); ctx.lineTo(L/4, -W/3);
    ctx.moveTo(-L/4, W/3); ctx.lineTo(L/4, W/3);
    ctx.moveTo(-L/3, 0); ctx.lineTo(-L/6, 0);
    ctx.stroke();

    if (t.enemyType === EnemyType.Kamikaze) {
        // Warning yellow/black striping for Kamikaze
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-L/3, -W/3, 8, W/1.5);
        ctx.fillStyle = '#000';
        for (let yOff = -W/3; yOff < W/3; yOff += 6) {
           ctx.beginPath();
           ctx.moveTo(-L/3, yOff); ctx.lineTo(-L/3+8, yOff+4); ctx.lineTo(-L/3+8, yOff); ctx.closePath(); ctx.fill();
        }
        
        // Flashing siren light
        const sirenFlash = Math.sin(Date.now() / 40) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(239, 68, 68, ${sirenFlash})`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ef4444';
        ctx.beginPath();
        ctx.arc(-L/6, 0, 6, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Centered pulsing Fusion Engine reactor core
    const corePulse = 1 + Math.sin(Date.now() / 100) * 0.12;
    const coreSize = L * 0.15 * corePulse;
    const coreColor = t.type === 'player' ? '#38bdf8' : (t.enemyType === EnemyType.Boss ? '#c084fc' : (t.enemyType === EnemyType.Kamikaze ? '#ef4444' : strokeStyle));
    ctx.shadowBlur = 12;
    ctx.shadowColor = coreColor;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0, '#fff');
    coreGrad.addColorStop(0.5, coreColor);
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreSize, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore(); // restored chassis angle matrix

    // 5. Draw Turret and Barrel Assembly in turretAngle coordinates
    ctx.save();
    ctx.rotate(t.turretAngle);
    ctx.translate(-t.recoilOffset, 0);

    // Draw Barrel overlay with custom shading details (with muzzle flash glare tip)
    const barrelLength = L * 0.95;
    const barrelW = t.enemyType === EnemyType.Boss ? 15 : (t.enemyType === EnemyType.Heavy ? 12 : 8);

    // Drop Shadow for barrel
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(8, -barrelW/2 + 2, barrelLength, barrelW);

    // Main barrel metallic barrel slab
    ctx.fillStyle = '#475569';
    ctx.fillRect(5, -barrelW/2, barrelLength, barrelW);

    // Muzzle Brake / tip cap
    ctx.fillStyle = t.color;
    ctx.fillRect(barrelLength + 3, -barrelW * 0.7, 6, barrelW * 1.4);
    
    // Linear glossy barrel highlight line
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(5, -barrelW/3, barrelLength, barrelW/3);

    // Turret Dome with detailed casing plates
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, L/2.4, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Turret cover glossy dome overlay shine
    const domeGrad = ctx.createLinearGradient(-L/3, -L/3, L/3, L/3);
    domeGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
    domeGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(0,0, L/2.5 - 1.5, 0, Math.PI*2);
    ctx.fill();

    // Inner target lock core indicator inside Turret
    ctx.fillStyle = t.type === 'player' ? '#facc15' : '#ef4444';
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // restored turret angle matrix

    // 6. Tank Health Bar (Fitted for non-Boss units directly above with neon segment layout)
    if (t.enemyType !== EnemyType.Boss) {
      const barY = -W/2 - 28;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(-L/2, barY, L, 6, 2);
      ctx.fill();
      
      const hpColor = t.health/t.maxHealth > 0.45 ? '#22c55e' : (t.health/t.maxHealth > 0.22 ? '#fbbf24' : '#ef4444');
      ctx.fillStyle = hpColor;
      ctx.shadowBlur = 6;
      ctx.shadowColor = hpColor;
      
      const filledW = L * (t.health/t.maxHealth);
      ctx.beginPath();
      ctx.roundRect(-L/2, barY, filledW, 6, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 7. Energy bubble shield visual overlay
    if (t.isShielded) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#3a86f0';
        ctx.lineWidth = 3.5 + Math.sin(Date.now() / 90) * 1;
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.1;
        ctx.beginPath();
        ctx.arc(0, 0, L * 0.88, 0, Math.PI * 2);
        ctx.stroke();
        
        const sGrad = ctx.createRadialGradient(0, 0, L*0.65, 0, 0, L*0.86);
        sGrad.addColorStop(0, 'transparent');
        sGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.12)');
        sGrad.addColorStop(1, 'rgba(56, 189, 248, 0.3)');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(0, 0, L * 0.88, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    ctx.restore(); // restored root translation matrix
  };

  // Phase 3 seam: bundle the live world into a snapshot the renderer consumes
  // instead of reaching into stateRef. The Pixi renderer (Phase 4) and netcode
  // (Phase 6) read this same shape. Holds references (not deep copies) — cheap
  // for local rendering; serialised when networked.
  const buildSnapshot = useCallback((): WorldSnapshot => {
    const cs = stateRef.current;
    return {
      players: cs.players,
      player: cs.players[0],
      enemies: cs.enemies,
      bullets: cs.bullets,
      repairItems: cs.repairItems,
      energyCells: cs.energyCells,
      explosions: cs.explosions,
      particles: cs.particles,
      floatingTexts: cs.floatingTexts,
      spawnIndicators: cs.spawnIndicators,
      treadMarks: cs.treadMarks,
      beams: cs.beams,
      bomber: cs.bomber,
      weather: cs.weather,
      terrain: cs.terrain,
      difficulty: cs.difficulty,
      screenShake: cs.screenShake,
      screenFlash: cs.screenFlash,
      score: cs.score,
      combo: cs.combo,
      nukeProgress: Math.min(100, (cs.nukeCounter / NUKE_TARGET) * 100),
      nukeReady: cs.nukeCounter >= NUKE_TARGET,
      bomberProgress: Math.min(100, (cs.bomberCounter / BOMBER_TARGET) * 100),
      bomberReady: cs.bomberCounter >= BOMBER_TARGET,
      arena: { w: cs.worldW, h: cs.worldH },
      obstacles: cs.obstacles,
      fireAlerts: cs.fireAlerts,
      storm: {
        active: cs.storm.active,
        cx: cs.storm.cx,
        cy: cs.storm.cy,
        radius: cs.storm.radius,
        toCx: cs.storm.toCx,
        toCy: cs.storm.toCy,
        toR: cs.storm.toR,
      },
    };
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: WorldSnapshot) => {

    // Smoothly apply viewport CSS transforms for beautiful high-fidelity tactile shake
    if (canvasRef.current) {
      if (s.screenShake > 0.1) {
        const dshake = Math.min(s.screenShake, 30);
        const dx = (Math.random() - 0.5) * dshake;
        const dy = (Math.random() - 0.5) * dshake;
        const rot = (Math.random() - 0.5) * Math.min(s.screenShake * 0.04, 1.2);
        canvasRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      } else {
        canvasRef.current.style.transform = 'translate(0px, 0px) rotate(0deg)';
      }
    }

    ctx.save();
    if (s.screenShake > 0.1) ctx.translate((Math.random()-0.5)*s.screenShake, (Math.random()-0.5)*s.screenShake);
    ctx.clearRect(-300, -300, CANVAS_WIDTH + 600, CANVAS_HEIGHT + 600);

    // 1. Fill ground background color dynamically based on TerrainType
    let groundColor = '#0b1329'; // default dark empty grid space
    let gridColor = 'rgba(56, 189, 248, 0.04)';
    if (s.terrain === TerrainType.Grassland) {
      groundColor = '#15241b'; // rich forestry tactical olive drab
      gridColor = 'rgba(34, 197, 94, 0.05)';
    } else if (s.terrain === TerrainType.Desert) {
      groundColor = '#211812'; // dry sand silt brown
      gridColor = 'rgba(245, 158, 11, 0.05)';
    } else if (s.terrain === TerrainType.Snow) {
      groundColor = '#111827'; // cold deep arctic navy
      gridColor = 'rgba(186, 230, 253, 0.06)';
    }

    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Grid lines
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for(let i=0; i<CANVAS_WIDTH; i+=100){ ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
    for(let j=0; j<CANVAS_HEIGHT; j+=100){ ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(CANVAS_WIDTH, j); ctx.stroke(); }

    // 3. Draw physical tire tracks/tread marks
    s.treadMarks.forEach(tm => {
      ctx.save();
      ctx.globalAlpha = tm.opacity;
      ctx.strokeStyle = tm.color;
      ctx.lineWidth = tm.width;
      ctx.translate(tm.x, tm.y);
      ctx.rotate(tm.angle);
      // Segmented tread segments
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.restore();
    });

    s.bullets.forEach(b => {
      if (b.trailHistory.length > 2) {
        ctx.beginPath(); ctx.moveTo(b.trailHistory[0].x, b.trailHistory[0].y);
        for(let i=1; i<b.trailHistory.length; i++) ctx.lineTo(b.trailHistory[i].x, b.trailHistory[i].y);
        const grad = ctx.createLinearGradient(b.trailHistory[0].x, b.trailHistory[0].y, b.x, b.y);
        grad.addColorStop(0, 'transparent'); grad.addColorStop(1, b.color + 'aa');
        ctx.strokeStyle = grad; ctx.lineWidth = b.isHoming ? b.width * 1.6 : b.width;
        ctx.lineCap = 'round'; ctx.stroke();
      }
    });

    s.repairItems.forEach(item => {
      ctx.save(); ctx.globalAlpha = item.opacity;
      ctx.shadowBlur = 20; ctx.shadowColor = '#22c55e';
      ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(item.x - 4, item.y - 12, 8, 24); ctx.fillRect(item.x - 12, item.y - 4, 24, 8);
      ctx.restore();
    });

    s.enemies.forEach(e => drawTank(ctx, e));
    s.players.forEach(p => drawTank(ctx, p));

    s.bullets.forEach(b => {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      if (b.isHoming) {
          ctx.fillStyle = '#475569'; 
          ctx.fillRect(-b.width, -b.height/3, b.width * 1.4, b.height/1.5);
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(-b.width, -b.height/2); ctx.lineTo(-b.width*0.4, -b.height/2); ctx.lineTo(-b.width*0.2, -b.height/3); ctx.lineTo(-b.width, -b.height/3); ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-b.width, b.height/2); ctx.lineTo(-b.width*0.4, b.height/2); ctx.lineTo(-b.width*0.2, b.height/3); ctx.lineTo(-b.width, b.height/3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ef4444'; 
          ctx.beginPath(); ctx.moveTo(b.width * 0.4, -b.height/3); ctx.lineTo(b.width * 1.3, 0); ctx.lineTo(b.width * 0.4, b.height/3); ctx.closePath(); ctx.fill();
          if (b.phase !== 'eject') {
              ctx.shadowBlur = 20; ctx.shadowColor = '#f97316';
              ctx.fillStyle = '#fb923c'; 
              ctx.beginPath(); ctx.moveTo(-b.width, -b.height/4); ctx.lineTo(-b.width * 2.5, 0); ctx.lineTo(-b.width, b.height/4); ctx.closePath(); ctx.fill();
          }
      } else {
          ctx.fillStyle = b.color; ctx.shadowBlur = 25; ctx.shadowColor = b.color;
          ctx.fillRect(-b.width/2, -b.height/2, b.width, b.height); 
          ctx.fillStyle = '#fff'; ctx.fillRect(-b.width/5, -b.height/4, b.width/2.5, b.height/2);
      }
      ctx.restore();
    });

    s.spawnIndicators.forEach(ind => {
      ctx.save();
      const flash = Math.sin(Date.now() / 50) * 0.5 + 0.5;
      ctx.translate(ind.x, ind.y);
      ctx.rotate(ind.angle);
      ctx.fillStyle = `rgba(239, 68, 68, ${flash})`;
      ctx.shadowBlur = 8; ctx.shadowColor = 'red';
      ctx.beginPath();
      ctx.moveTo(0, -5); ctx.lineTo(10, 0); ctx.lineTo(0, 5); ctx.lineTo(0, 2); ctx.lineTo(-6, 2); ctx.lineTo(-6, -2); ctx.lineTo(0, -2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });

    // 4. Blinding radial gradients limiting visual perspective under severe weathers
    if (s.weather !== WeatherType.Clear) {
      let overlayColor = 'rgba(15, 23, 42, 0.9)'; // Default storm darkness overlay
      let innerRad = 160;
      let outerRad = 380;
      
      if (s.weather === WeatherType.Fog) {
        overlayColor = 'rgba(8, 10, 15, 0.97)'; // Thick gray mist shroud
        innerRad = 120;
        outerRad = 260; // short sight
      } else if (s.weather === WeatherType.Sandstorm) {
        overlayColor = 'rgba(74, 48, 20, 0.93)'; // High-density ochre sand blow
        innerRad = 140;
        outerRad = 310;
      } else if (s.weather === WeatherType.Snowstorm) {
        overlayColor = 'rgba(191, 219, 254, 0.9)'; // Glacial blue blizzard whiteout
        innerRad = 100;
        outerRad = 230; // extremely limited sight
      } else if (s.weather === WeatherType.Rain) {
        overlayColor = 'rgba(10, 15, 25, 0.88)'; // Severe thunder downpour dimming
        innerRad = 180;
        outerRad = 410;
      }
      
      ctx.save();
      const grad = ctx.createRadialGradient(s.player.x, s.player.y, innerRad, s.player.x, s.player.y, outerRad);
      
      // Fully clear center
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      
      // Transition out to opaque weather color
      if (s.weather === WeatherType.Snowstorm) {
        grad.addColorStop(0.3, 'rgba(191, 219, 254, 0.18)');
        grad.addColorStop(1, overlayColor);
      } else if (s.weather === WeatherType.Sandstorm) {
        grad.addColorStop(0.3, 'rgba(120, 78, 30, 0.22)');
        grad.addColorStop(1, overlayColor);
      } else if (s.weather === WeatherType.Fog) {
        grad.addColorStop(0.4, 'rgba(8, 10, 15, 0.1)');
        grad.addColorStop(1, overlayColor);
      } else {
        grad.addColorStop(0.4, 'rgba(15, 23, 42, 0.25)');
        grad.addColorStop(1, overlayColor);
      }
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Subtle decorative border ring indicating vision thresholds
      ctx.strokeStyle = s.weather === WeatherType.Snowstorm ? 'rgba(255, 255, 255, 0.12)' :
                        (s.weather === WeatherType.Sandstorm ? 'rgba(245, 158, 11, 0.08)' : 'rgba(56, 189, 248, 0.08)');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, innerRad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (s.bomber.active) {
      ctx.save(); ctx.translate(s.bomber.x, s.bomber.y);
      ctx.fillStyle = '#0f172a'; ctx.shadowBlur = 45; ctx.shadowColor = '#6366f1';
      ctx.beginPath(); ctx.moveTo(-350, 0); ctx.lineTo(100, -240); ctx.lineTo(300, 0); ctx.lineTo(100, 240); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    s.explosions.forEach(e => {
      ctx.save(); ctx.globalAlpha = e.opacity; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2);
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.3, e.color); grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fill(); ctx.restore();
    });

    s.particles.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill(); ctx.restore();
    });

    s.floatingTexts.forEach(t => {
      ctx.save(); ctx.globalAlpha = t.opacity; ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px Orbitron`; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = 'black';
      ctx.fillText(t.text, t.x, t.y); ctx.restore();
    });

    if (s.screenFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.screenFlash})`; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT); }
    ctx.restore();
  }, []);

  // Mount the WebGL (PixiJS) renderer; fall back to Canvas2D if WebGL is unavailable.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const renderer = new PixiRenderer();
    renderer
      .init(container, graphicsQuality)
      .then(() => {
        if (disposed) {
          renderer.destroy();
          return;
        }
        pixiRef.current = renderer;
        activeCanvasRef.current = (renderer.app?.canvas as HTMLCanvasElement) ?? null;
      })
      .catch((err) => {
        console.warn('WebGL unavailable — using Canvas2D fallback.', err);
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        canvas.className =
          'bg-slate-950 border-4 border-slate-900 rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.9)] cursor-crosshair';
        container.appendChild(canvas);
        canvasRef.current = canvas;
        activeCanvasRef.current = canvas;
        ctx2dRef.current = canvas.getContext('2d');
      });
    return () => {
      disposed = true;
      pixiRef.current?.destroy();
      pixiRef.current = null;
      ctx2dRef.current = null;
      container.replaceChildren();
    };
  }, [graphicsQuality]);

  useEffect(() => {
    let lastTime = performance.now();
    let rafId = 0;
    let broadcastAccum = 0;
    const loop = (time: number) => {
      const d = Math.min(time - lastTime, 100); lastTime = time;
      const adapter = netRef.current;

      if (onlineRef.current && !isHostRef.current) {
        // Synced game-over: the host decides the round is over and broadcasts the
        // result; the client transitions to its own win/lose screen.
        if (!gameEndedRef.current && adapter) {
          const go = adapter.getGameOver();
          if (go) {
            gameEndedRef.current = true;
            const outcome = versusRef.current
              ? !go.winnerId
                ? 'draw'
                : go.winnerId === localIdRef.current
                  ? 'victory'
                  : 'defeat'
              : undefined;
            onGameOver(go.score, go.maxCombo, outcome);
          }
        }
        // CLIENT: render the host's world interpolated ~100ms behind, send input,
        // and drive our own HUD from the snapshot's local player.
        const snap = adapter
          ? interpolateSnapshot(adapter.getSnapshotBuffer() as { t: number; s: unknown }[], localIdRef.current, 100)
          : null;
        if (snap) {
          // Freshest authoritative state of our own tank (for prediction + reconcile).
          let authMe: { x: number; y: number; angle: number; turretAngle: number } | null = null;
          if (adapter) {
            const buf = adapter.getSnapshotBuffer() as { t: number; s: { players?: any[] } }[];
            authMe = (buf[buf.length - 1]?.s?.players || []).find((p: any) => p.id === localIdRef.current) || null;
          }

          // Predict OUR tank locally so it responds instantly (others stay interpolated).
          // Skip while dead — no point steering a corpse (the camera spectates instead).
          let input: PlayerInput = EMPTY_INPUT;
          const localAlive = (snap.players.find((pl) => pl.id === localIdRef.current)?.health ?? 1) > 0;
          if (statusRef.current === 'playing' && localAlive) {
            if (!predictedSelfRef.current && authMe) {
              predictedSelfRef.current = { x: authMe.x, y: authMe.y, angle: authMe.angle, turretAngle: authMe.turretAngle, velocity: { x: 0, y: 0 } };
            }
            const pred = predictedSelfRef.current;
            if (pred) {
              input = sampleLocalInput(stateRef.current.keys, worldMouseFor(pred), pred, directRef.current);
              advanceTankMovement(pred, input, computeEnv(snap.weather, snap.terrain));
              // Predicted local tank respects cover too (avoids rubber-banding at crates).
              const meWidth = snap.players.find((pl) => pl.id === localIdRef.current)?.width ?? 50;
              for (const o of snap.obstacles ?? []) pushOutOfObstacle(pred, o, meWidth * 0.42);
              pred.x = Math.max(30, Math.min(stateRef.current.worldW - 30, pred.x));
              pred.y = Math.max(30, Math.min(stateRef.current.worldH - 30, pred.y));
              if (authMe) {
                const errDist = Math.hypot(authMe.x - pred.x, authMe.y - pred.y);
                if (errDist > 150) {
                  // Large divergence (teleport / heavy knockback) → snap to authority.
                  pred.x = authMe.x;
                  pred.y = authMe.y;
                  pred.velocity.x = 0;
                  pred.velocity.y = 0;
                } else {
                  // Gentle reconciliation toward the host's authoritative position.
                  pred.x += (authMe.x - pred.x) * 0.12;
                  pred.y += (authMe.y - pred.y) * 0.12;
                }
              }
              const meTank = snap.players.find((pl) => pl.id === localIdRef.current);
              if (meTank) {
                meTank.x = pred.x;
                meTank.y = pred.y;
                meTank.angle = pred.angle;
                meTank.turretAngle = pred.turretAngle;
              }
            }
          }

          if (pixiRef.current) pixiRef.current.render(snap);
          else if (ctx2dRef.current) draw(ctx2dRef.current, snap);

          if (adapter && statusRef.current === 'playing') {
            adapter.sendInput(input);
            const me = snap.players.find((pl) => pl.id === localIdRef.current);
            if (me) {
              const sig = `${me.ammo}|${me.reloading}|${me.energy}|${me.ultReady}|${snap.score}|${snap.combo}|${snap.difficulty}|${snap.weather}|${snap.nukeReady}|${snap.bomberReady}`;
              if (sig !== clientHudSigRef.current) {
                clientHudSigRef.current = sig;
                onStateUpdate({
                  ammo: me.ammo ?? 0,
                  maxAmmo: me.maxAmmo ?? 1,
                  isCooldown: !!me.reloading,
                  energy: me.energy ?? 0,
                  maxEnergy: me.maxEnergy ?? 100,
                  ultReady: !!me.ultReady,
                  ultName: ULTIMATES[me.tankClass ?? 'assault'].label,
                  score: snap.score,
                  combo: snap.combo,
                  difficulty: snap.difficulty,
                  weather: snap.weather,
                  terrain: snap.terrain,
                  nukeReady: snap.nukeReady,
                  nukeProgress: snap.nukeProgress,
                  bomberReady: snap.bomberReady,
                  bomberProgress: snap.bomberProgress,
                });
              }
            }
          }
        }
      } else {
        // SOLO / LOCAL-2P / HOST: run the sim and render it.
        update(d);
        const snap = buildSnapshot();
        if (pixiRef.current) pixiRef.current.render(snap);
        else if (ctx2dRef.current) draw(ctx2dRef.current, snap);
        if (onlineRef.current && isHostRef.current && adapter) {
          broadcastAccum += d;
          if (broadcastAccum >= 50) {
            broadcastAccum = 0;
            adapter.broadcastSnapshot(snap);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [update, draw, buildSnapshot]);

  return (
    <div
      ref={containerRef}
      className="relative leading-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    />
  );
};

export default Battlefield;
