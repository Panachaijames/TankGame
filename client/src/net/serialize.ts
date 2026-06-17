import type { WorldSnapshot } from '../components/Battlefield';

/**
 * Trim a WorldSnapshot for the wire. We drop the heavy/cosmetic arrays
 * (particles, tread marks, bullet trail history) and quantise coordinates to
 * keep packets small at ~20 Hz across up to 4 peers. Clients render the core
 * world (tanks, bullets, explosions, beams, pickups, weather) and re-create
 * cosmetic flourishes locally.
 */
const r = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function stripTank(t: any) {
  return {
    id: t.id,
    x: r(t.x),
    y: r(t.y),
    angle: r3(t.angle),
    turretAngle: r3(t.turretAngle),
    width: t.width,
    height: t.height,
    health: r(t.health),
    maxHealth: t.maxHealth,
    color: t.color,
    type: t.type,
    enemyType: t.enemyType,
    tankClass: t.tankClass,
    ammo: t.ammo,
    maxAmmo: t.maxAmmo,
    reloading: t.reloading,
    energy: t.energy != null ? r(t.energy) : undefined,
    maxEnergy: t.maxEnergy,
    isShielded: t.isShielded,
    recoilOffset: r2(t.recoilOffset),
  };
}

function stripBullet(b: any) {
  return {
    id: b.id,
    x: r(b.x),
    y: r(b.y),
    angle: r3(b.angle),
    width: b.width,
    height: b.height,
    color: b.color,
    radius: b.radius,
    isHoming: b.isHoming,
    phase: b.phase,
  };
}

export function serializeSnapshot(s: WorldSnapshot): unknown {
  return {
    players: s.players.map(stripTank),
    enemies: s.enemies.map(stripTank),
    bullets: s.bullets.map(stripBullet),
    explosions: s.explosions,
    repairItems: s.repairItems,
    energyCells: s.energyCells,
    beams: s.beams,
    spawnIndicators: s.spawnIndicators,
    floatingTexts: s.floatingTexts,
    bomber: s.bomber,
    weather: s.weather,
    terrain: s.terrain,
    difficulty: s.difficulty,
    screenShake: r2(s.screenShake),
    screenFlash: r2(s.screenFlash),
    score: s.score,
    combo: s.combo,
    nukeProgress: r(s.nukeProgress),
    nukeReady: s.nukeReady,
    bomberProgress: r(s.bomberProgress),
    bomberReady: s.bomberReady,
    arena: s.arena,
  };
}

/** Rebuild a renderer-ready WorldSnapshot from wire data. `localId` picks the
 *  local player for the weather-vignette centre. */
export function deserializeSnapshot(data: any, localId: string): WorldSnapshot {
  const players = (data.players || []) as any[];
  const local = players.find((p) => p.id === localId) || players[0];
  return {
    players,
    player: local,
    enemies: data.enemies || [],
    bullets: (data.bullets || []).map((b: any) => ({ ...b, trailHistory: [] })),
    repairItems: data.repairItems || [],
    energyCells: data.energyCells || [],
    explosions: data.explosions || [],
    particles: [],
    floatingTexts: data.floatingTexts || [],
    spawnIndicators: data.spawnIndicators || [],
    treadMarks: [],
    beams: data.beams || [],
    bomber: data.bomber,
    weather: data.weather,
    terrain: data.terrain,
    difficulty: data.difficulty,
    screenShake: data.screenShake || 0,
    screenFlash: data.screenFlash || 0,
    score: data.score || 0,
    combo: data.combo || 0,
    nukeProgress: data.nukeProgress || 0,
    nukeReady: !!data.nukeReady,
    bomberProgress: data.bomberProgress || 0,
    bomberReady: !!data.bomberReady,
    arena: data.arena || { w: 1000, h: 700 },
  } as WorldSnapshot;
}
