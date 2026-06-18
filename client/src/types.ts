
export interface Vector {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // Chassis angle
}

export type TankClass = 'assault' | 'vanguard' | 'sniper';

export interface Tank extends Entity {
  turretAngle: number;
  health: number;
  maxHealth: number;
  speed: number;
  velocity: Vector;
  color: string;
  isShielded: boolean;
  shootTimer: number;
  shootInterval: number;
  type: 'player' | 'enemy' | 'allied';
  enemyType?: EnemyType;
  recoilOffset: number;
  specialAttackTimer?: number;
  // Enemy AI scratch state (archetype-specific; undefined on players).
  aiTimer?: number; // general fire/ability cadence (ms)
  aiPhase?: number; // 0 normal · 1 windup · 2 dash/active (charger/teleporter/sniper)
  aiBurst?: number; // shots left in the current burst
  dashVX?: number; // charger dash velocity
  dashVY?: number;
  orbitDir?: number; // +1 / -1 orbit direction
  // Player-only weapon/loadout fields (used by the renderer for the ammo bar,
  // barrel shape and class accent). Undefined on enemies.
  tankClass?: TankClass;
  ammo?: number;
  maxAmmo?: number;
  reloading?: boolean;
  energy?: number;
  maxEnergy?: number;
  ultReady?: boolean;
}

export interface Bullet extends Entity {
  dx: number;
  dy: number;
  damage: number;
  color: string;
  isHighPowered: boolean;
  isSuperBullet: boolean;
  isExplosive: boolean;
  isAllied: boolean;
  radius: number;
}

export interface Particle extends Vector {
  dx: number;
  dy: number;
  radius: number;
  opacity: number;
  lifespan: number;
  color: string;
  type: 'spark' | 'smoke' | 'rain' | 'sand' | 'snow' | 'exhaust' | 'debris' | 'ember' | 'splash';
}

export interface Explosion extends Vector {
  radius: number;
  maxRadius: number;
  opacity: number;
  fadeSpeed: number;
  color: string;
}

export interface RepairItem extends Vector {
  id: string;
  radius: number;
  lifespan: number;
  opacity: number;
}

export enum PowerUpType {
  Shield = 'Shield',
  SuperBullet = 'Super Bullet',
  SpeedBoost = 'Speed Boost',
  InstantReload = 'Instant Reload',
  ExplosiveBullet = 'Explosive Bullet'
}

export enum EnemyType {
  // Tier 1-2 fodder + early specialists
  Grunt = 'Grunt',
  Scout = 'Scout',
  Bruiser = 'Bruiser',
  Kamikaze = 'Kamikaze',
  Shotgunner = 'Shotgunner',
  Gunner = 'Gunner',
  Stalker = 'Stalker',
  Skirmisher = 'Skirmisher',
  Spitter = 'Spitter',
  SwarmSpawn = 'SwarmSpawn',
  // Tier 3 specialists
  Marksman = 'Marksman',
  Mortar = 'Mortar',
  Spiralist = 'Spiralist',
  Satellite = 'Satellite',
  Lancer = 'Lancer',
  Hornet = 'Hornet',
  Sapper = 'Sapper',
  // Tier 4-5 elites
  AegisBruiser = 'AegisBruiser',
  SwarmMatron = 'SwarmMatron',
  MendDrone = 'MendDrone',
  VoidBlink = 'VoidBlink',
  FlakBattery = 'FlakBattery',
  WardWeaver = 'WardWeaver',
  PhaseReaver = 'PhaseReaver',
  Drone = 'Drone',
  Swarmer = 'Swarmer',
  // Bosses
  Overlord = 'Overlord',
  Juggernaut = 'Juggernaut',
  Hive = 'Hive',
  ArtilleryTitan = 'ArtilleryTitan',
}

export type EnemyArchetype =
  | 'chaser' | 'scout' | 'heavy' | 'rammer' | 'shotgun' | 'burst' | 'orbiter'
  | 'charger' | 'sniper' | 'artillery' | 'spinner' | 'homing' | 'mine' | 'shield'
  | 'splitter' | 'healer' | 'teleporter' | 'summoner';

export type EnemyShape =
  | 'block' | 'diamond' | 'hex' | 'arrow' | 'orb' | 'cross' | 'spike'
  | 'wedge' | 'ring' | 'triangle' | 'pentagon' | 'chevron';

export enum WeatherType {
  Clear = 'Clear',
  Rain = 'Rain',
  Fog = 'Fog',
  Sandstorm = 'Sandstorm',
  Snowstorm = 'Snowstorm'
}

export enum TerrainType {
  Grassland = 'Grassland',
  Desert = 'Desert',
  Snow = 'Snow'
}

export interface GameState {
  score: number;
  difficulty: number;
  weather: WeatherType;
  terrain: TerrainType;
  combo: number;
  maxCombo: number;
  nukeReady: boolean;
  nukeProgress: number;
  bomberReady: boolean;
  bomberProgress: number;
  ammo: number;
  maxAmmo: number;
  missiles: number;
  isCooldown: boolean;
  cooldownRemaining: number;
  energy: number;
  maxEnergy: number;
  ultReady: boolean;
  ultName: string;
  status: GameStatus;
}

export type GameStatus = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover';

/* ────────────────────────────────────────────────────────────────────────
 * App shell / navigation (Phase 2)
 * ──────────────────────────────────────────────────────────────────────── */

export type AppScreen =
  | 'mainMenu'
  | 'modeSelect'
  | 'matchSetup'
  | 'lobby'
  | 'playing'
  | 'results';

export type AppOverlay = null | 'pause' | 'settings' | 'howToPlay' | 'leaderboard';

export type SessionKind = 'solo' | 'local2p' | 'online';
export type MatchMode = 'coop' | 'versus';

export interface PlayerConfig {
  id: string;
  name: string;
  control: 'wasd' | 'arrows' | 'gamepad' | 'remote';
  color: string;
  isLocal: boolean;
  tankClass: TankClass;
}

export interface MatchOptions {
  startDifficulty: number;
}

export interface MatchConfig {
  session: SessionKind;
  mode: MatchMode;
  players: PlayerConfig[];
  roomCode?: string;
  options: MatchOptions;
}

/* ────────────────────────────────────────────────────────────────────────
 * Settings (persisted to localStorage)
 * ──────────────────────────────────────────────────────────────────────── */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  graphicsQuality: GraphicsQuality;
  reduceMotion: boolean;
  screenShake: boolean;
  movementMode: 'direct' | 'tank';
  version: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Leaderboard (persisted to localStorage)
 * ──────────────────────────────────────────────────────────────────────── */

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  maxCombo: number;
  mode: SessionKind | MatchMode;
  difficulty: number;
  date: string; // ISO 8601
}
