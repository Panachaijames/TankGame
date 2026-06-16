
import { EnemyType, TerrainType, PowerUpType } from './types';

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 700;

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

export const ENEMY_CONFIGS = {
  [EnemyType.Normal]: { color: '#6b7280', health: 20, damage: 8, score: 10, size: 50, speed: 1.2, turnSpeed: 0.04 },
  [EnemyType.Heavy]: { color: '#4b5563', health: 50, damage: 15, score: 25, size: 65, speed: 0.7, turnSpeed: 0.02 },
  [EnemyType.Fast]: { color: '#9ca3af', health: 12, damage: 5, score: 30, size: 45, speed: 2.2, turnSpeed: 0.07 },
  [EnemyType.Kamikaze]: { color: '#991b1b', health: 8, damage: 30, score: 50, size: 40, speed: 2.8, turnSpeed: 0.09 },
  [EnemyType.Boss]: { color: '#4c1d95', health: 1000, damage: 20, score: 5000, size: 120, speed: 0.5, turnSpeed: 0.015 },
};

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
