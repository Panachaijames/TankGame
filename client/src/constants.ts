
import { EnemyType, TerrainType, PowerUpType, type EnemyArchetype, type EnemyShape } from './types';

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 700;

// Online battle-royale world (the viewport stays CANVAS_WIDTH×HEIGHT; a follow
// camera scrolls around this larger world). Solo / local-2P keep the small arena.
export const BIG_WORLD = { w: 5000, h: 3500 };

export const PHYSICS = {
  ACCELERATION: 0.25, // Slightly more responsive
  FRICTION: 0.94,
  CHASSIS_TURN_SPEED: 0.06,
  TURRET_TURN_SPEED: 0.12, // Faster turret response
  RECOIL_FORCE: 2.0, // Reduced recoil for easier aiming
  MAX_SPEED: 4.8, // Slightly faster player
};

export const PLAYER_DEFAULTS = {
  width: 50,
  height: 40,
  maxAmmo: 35, // More ammo before reload
  shootRate: 250, // Faster fire rate
};

// Selectable player tank classes (loadouts). Each defines its weapon stats and
// look. `weapon: 'laser'` is a piercing hitscan beam; others fire projectiles.
export const TANK_CLASSES = {
  assault: {
    id: 'assault',
    label: 'ASSAULT',
    desc: 'Balanced all-rounder. Best sustained damage, solid armour.',
    accent: '#38bdf8',
    width: 50,
    height: 40,
    health: 100,
    maxAmmo: 40,
    damage: 26,
    fireRate: 240,
    reload: 1200,
    bulletSpeed: 18,
    weapon: 'projectile',
    barrelLen: 0.72,
    barrelW: 0.13,
    regen: true,
  },
  vanguard: {
    id: 'vanguard',
    label: 'VANGUARD',
    desc: 'Rapid bullet-hose, huge magazine, toughest hull. Weak per-shot.',
    accent: '#22c55e',
    width: 54,
    height: 44,
    health: 130,
    maxAmmo: 70,
    damage: 11,
    fireRate: 105,
    reload: 1400,
    bulletSpeed: 20,
    weapon: 'projectile',
    barrelLen: 0.58,
    barrelW: 0.2,
    regen: true,
  },
  sniper: {
    id: 'sniper',
    label: 'RAILGUN',
    desc: 'Piercing laser. Massive burst, glass cannon, tiny mag, slow reload.',
    accent: '#f472b6',
    width: 46,
    height: 34,
    health: 70,
    maxAmmo: 5,
    damage: 150,
    fireRate: 800,
    reload: 2400,
    bulletSpeed: 0,
    weapon: 'laser',
    barrelLen: 1.15,
    barrelW: 0.09,
    regen: false,
  },
} as const;

export const LASER_RANGE = 1400;

// Per-class ultimate names (behaviour is implemented per class id in the sim).
export const ULTIMATES = {
  assault: { label: 'VALKYRIE BARRAGE' },
  vanguard: { label: 'MAELSTROM' },
  sniper: { label: 'ORBITAL LANCE' },
} as const;

// Energy economy: fills the ultimate gauge. Earned from kills + energy cells
// (dropped from kills now; from crates/monsters once those land in Phase 8a/8b).
export const MAX_ENERGY = 100;
export const ENERGY_PER_KILL = 4;
export const ENERGY_CELL_VALUE = 40;
export const ENERGY_DROP_KILLS = 8;

export interface EnemyConfig {
  color: string;
  health: number; // base HP (scaled by difficulty at spawn)
  damage: number;
  score: number;
  size: number;
  speed: number;
  turnSpeed: number;
  archetype: EnemyArchetype;
  shape: EnemyShape;
  tier: number; // 1 (from the start) .. 5 (late game)
  spawnWeight: number; // relative natural spawn frequency (0 = summon/split only)
  isBoss: boolean;
  projectiles?: number; // pellets / radial bullets / missiles
  burstCount?: number; // shots per burst
  range?: number; // engage / keep distance / orbit radius
  childKey?: EnemyType; // splitter / summoner offspring
}

// 30-enemy survival roster: tiered, weighted, each with a distinct behaviour
// (archetype) + silhouette (shape) + colour. See enemy AI dispatch in Battlefield.
export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  // ── Tier 1-2: fodder + early specialists ───────────────────────────────
  [EnemyType.Grunt]:      { color: '#6b7280', health: 20,  damage: 8,  score: 10,  size: 48, speed: 1.2, turnSpeed: 0.04, archetype: 'chaser',   shape: 'block',    tier: 1, spawnWeight: 10, isBoss: false },
  [EnemyType.Scout]:      { color: '#fde047', health: 12,  damage: 5,  score: 30,  size: 40, speed: 2.2, turnSpeed: 0.07, archetype: 'scout',    shape: 'arrow',    tier: 1, spawnWeight: 8,  isBoss: false },
  [EnemyType.Bruiser]:    { color: '#64748b', health: 55,  damage: 15, score: 35,  size: 66, speed: 0.7, turnSpeed: 0.02, archetype: 'heavy',    shape: 'hex',      tier: 1, spawnWeight: 5,  isBoss: false },
  [EnemyType.Kamikaze]:   { color: '#ef4444', health: 8,   damage: 30, score: 50,  size: 40, speed: 2.8, turnSpeed: 0.09, archetype: 'rammer',   shape: 'spike',    tier: 1, spawnWeight: 6,  isBoss: false },
  [EnemyType.Shotgunner]: { color: '#fb923c', health: 34,  damage: 9,  score: 55,  size: 52, speed: 1.0, turnSpeed: 0.045, archetype: 'shotgun', shape: 'wedge',    tier: 2, spawnWeight: 5,  isBoss: false, projectiles: 5, range: 260 },
  [EnemyType.Gunner]:     { color: '#22d3ee', health: 30,  damage: 6,  score: 50,  size: 50, speed: 1.1, turnSpeed: 0.05, archetype: 'burst',    shape: 'chevron',  tier: 2, spawnWeight: 6,  isBoss: false, burstCount: 6 },
  [EnemyType.Stalker]:    { color: '#a855f7', health: 28,  damage: 7,  score: 60,  size: 46, speed: 1.6, turnSpeed: 0.06, archetype: 'orbiter',  shape: 'diamond',  tier: 2, spawnWeight: 4,  isBoss: false, range: 220 },
  [EnemyType.Skirmisher]: { color: '#34d399', health: 32,  damage: 18, score: 65,  size: 48, speed: 1.4, turnSpeed: 0.05, archetype: 'charger',  shape: 'triangle', tier: 2, spawnWeight: 4,  isBoss: false },
  [EnemyType.Spitter]:    { color: '#f472b6', health: 26,  damage: 10, score: 45,  size: 46, speed: 1.0, turnSpeed: 0.04, archetype: 'chaser',   shape: 'orb',      tier: 2, spawnWeight: 5,  isBoss: false, range: 300 },
  [EnemyType.SwarmSpawn]: { color: '#c084fc', health: 16,  damage: 9,  score: 25,  size: 34, speed: 2.4, turnSpeed: 0.08, archetype: 'scout',    shape: 'triangle', tier: 2, spawnWeight: 0,  isBoss: false },
  // ── Tier 3: specialists ────────────────────────────────────────────────
  [EnemyType.Marksman]:   { color: '#0ea5e9', health: 45,  damage: 34, score: 90,  size: 46, speed: 0.9, turnSpeed: 0.05, archetype: 'sniper',   shape: 'arrow',    tier: 3, spawnWeight: 6,  isBoss: false, range: 620 },
  [EnemyType.Mortar]:     { color: '#f59e0b', health: 70,  damage: 28, score: 100, size: 58, speed: 0.7, turnSpeed: 0.02, archetype: 'artillery', shape: 'hex',     tier: 3, spawnWeight: 5,  isBoss: false, projectiles: 1, range: 500 },
  [EnemyType.Spiralist]:  { color: '#9333ea', health: 80,  damage: 12, score: 110, size: 52, speed: 0.6, turnSpeed: 0.07, archetype: 'spinner',  shape: 'spike',    tier: 3, spawnWeight: 5,  isBoss: false, projectiles: 6 },
  [EnemyType.Satellite]:  { color: '#10b981', health: 60,  damage: 14, score: 95,  size: 48, speed: 1.9, turnSpeed: 0.08, archetype: 'orbiter',  shape: 'ring',     tier: 3, spawnWeight: 6,  isBoss: false, range: 340 },
  [EnemyType.Lancer]:     { color: '#dc2626', health: 75,  damage: 30, score: 105, size: 54, speed: 1.0, turnSpeed: 0.06, archetype: 'charger',  shape: 'wedge',    tier: 3, spawnWeight: 7,  isBoss: false },
  [EnemyType.Hornet]:     { color: '#f43f5e', health: 65,  damage: 18, score: 100, size: 50, speed: 1.3, turnSpeed: 0.05, archetype: 'homing',   shape: 'chevron',  tier: 3, spawnWeight: 5,  isBoss: false, projectiles: 1, range: 450 },
  [EnemyType.Sapper]:     { color: '#84cc16', health: 55,  damage: 26, score: 115, size: 44, speed: 1.1, turnSpeed: 0.06, archetype: 'mine',     shape: 'diamond',  tier: 3, spawnWeight: 4,  isBoss: false },
  // ── Tier 4-5: elites ───────────────────────────────────────────────────
  [EnemyType.AegisBruiser]: { color: '#2dd4bf', health: 220, damage: 26, score: 320, size: 64, speed: 0.85, turnSpeed: 0.025, archetype: 'shield',    shape: 'wedge',    tier: 4, spawnWeight: 6, isBoss: false },
  [EnemyType.SwarmMatron]:  { color: '#7c3aed', health: 180, damage: 20, score: 300, size: 60, speed: 1.05, turnSpeed: 0.04,  archetype: 'splitter',  shape: 'hex',      tier: 4, spawnWeight: 5, isBoss: false, childKey: EnemyType.SwarmSpawn },
  [EnemyType.MendDrone]:    { color: '#4ade80', health: 140, damage: 10, score: 360, size: 48, speed: 1.25, turnSpeed: 0.06,  archetype: 'healer',    shape: 'cross',    tier: 4, spawnWeight: 4, isBoss: false, range: 320 },
  [EnemyType.VoidBlink]:    { color: '#e879f9', health: 150, damage: 24, score: 380, size: 52, speed: 1.4,  turnSpeed: 0.07,  archetype: 'teleporter', shape: 'diamond', tier: 4, spawnWeight: 5, isBoss: false, range: 260 },
  [EnemyType.FlakBattery]:  { color: '#0891b2', health: 160, damage: 11, score: 300, size: 58, speed: 0.8,  turnSpeed: 0.03,  archetype: 'burst',     shape: 'pentagon', tier: 4, spawnWeight: 5, isBoss: false, burstCount: 10 },
  [EnemyType.WardWeaver]:   { color: '#facc15', health: 250, damage: 30, score: 460, size: 66, speed: 0.95, turnSpeed: 0.035, archetype: 'shield',    shape: 'pentagon', tier: 5, spawnWeight: 3, isBoss: false },
  [EnemyType.PhaseReaver]:  { color: '#f97316', health: 200, damage: 28, score: 500, size: 58, speed: 1.5,  turnSpeed: 0.08,  archetype: 'teleporter', shape: 'spike',   tier: 5, spawnWeight: 3, isBoss: false, range: 230, projectiles: 6 },
  [EnemyType.Drone]:        { color: '#c4b5fd', health: 18,  damage: 10, score: 20,  size: 36, speed: 1.5,  turnSpeed: 0.06,  archetype: 'chaser',    shape: 'orb',      tier: 5, spawnWeight: 0, isBoss: false },
  [EnemyType.Swarmer]:      { color: '#86efac', health: 14,  damage: 8,  score: 18,  size: 30, speed: 2.5,  turnSpeed: 0.09,  archetype: 'scout',     shape: 'triangle', tier: 5, spawnWeight: 0, isBoss: false },
  // ── Bosses ─────────────────────────────────────────────────────────────
  [EnemyType.Overlord]:       { color: '#a855f7', health: 2200, damage: 38, score: 5000, size: 120, speed: 0.7, turnSpeed: 0.02,  archetype: 'summoner',  shape: 'hex',      tier: 5, spawnWeight: 0, isBoss: true, childKey: EnemyType.Drone, projectiles: 16 },
  [EnemyType.Juggernaut]:     { color: '#b91c1c', health: 2500, damage: 55, score: 5500, size: 110, speed: 2.6, turnSpeed: 0.015, archetype: 'charger',   shape: 'wedge',    tier: 5, spawnWeight: 0, isBoss: true },
  [EnemyType.Hive]:           { color: '#22c55e', health: 1800, damage: 28, score: 4800, size: 130, speed: 1.0, turnSpeed: 0.03,  archetype: 'summoner',  shape: 'ring',     tier: 5, spawnWeight: 0, isBoss: true, childKey: EnemyType.Swarmer },
  [EnemyType.ArtilleryTitan]: { color: '#d97706', health: 2000, damage: 50, score: 5200, size: 115, speed: 0.6, turnSpeed: 0.025, archetype: 'artillery', shape: 'pentagon', tier: 5, spawnWeight: 0, isBoss: true, projectiles: 5 },
};

// Bosses cycle through these at each boss threshold (variety over the run).
export const BOSS_TYPES: EnemyType[] = [EnemyType.Overlord, EnemyType.Juggernaut, EnemyType.Hive, EnemyType.ArtilleryTitan];

export const POWERUP_CONFIGS = [
  { type: PowerUpType.Shield, color: '#00BFFF', duration: 10, icon: '🛡️' },
  { type: PowerUpType.SuperBullet, color: '#32CD32', duration: 8, icon: '💥' },
  { type: PowerUpType.SpeedBoost, color: '#FFD700', duration: 15, icon: '⚡' },
  { type: PowerUpType.InstantReload, color: '#FF4500', duration: 0, icon: '🔄' },
  { type: PowerUpType.ExplosiveBullet, color: '#ff9900', duration: 10, icon: '💣' }
];

export const DIFFICULTY_INTERVAL = 35000; // Slower scaling (35 seconds)
export const WEATHER_INTERVAL = 30000; // ms
export const COMBO_TIMEOUT = 3000; // More generous combo window
export const BOSS_SCORE_THRESHOLD = 35000;
