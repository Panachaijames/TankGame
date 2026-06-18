import { Application, Container, Graphics, Sprite, Text, Rectangle, type Texture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { WeatherType, TerrainType, type Tank, type EnemyShape } from '../types';
import { TANK_CLASSES, ENEMY_CONFIGS } from '../constants';
import type { WorldSnapshot } from '../components/Battlefield';
import { makeRingTexture, makeSoftCircleTexture } from './textures';
import { cameraOffset } from '../sim/camera';

export type Quality = 'low' | 'medium' | 'high';

// The viewport (canvas) size — the window onto the (possibly larger) world.
const VIEW_W = 1000;
const VIEW_H = 700;
// Earshot for gunshot proximity alerts — a bit beyond projectile range so you
// get warned slightly before bullets arrive, without revealing the whole map.
const HEAR_RANGE = 1700;

interface TankView {
  container: Container;
  shadow: Sprite;
  chassis: Graphics;
  turret: Graphics;
  health: Graphics;
  lastKey: string;
}

// Terrain ground + grid colours (mirrors the original Canvas2D palette).
const TERRAIN = {
  [TerrainType.Grassland]: { ground: 0x15241b, grid: 0x22c55e, accent: 0x22c55e },
  [TerrainType.Desert]: { ground: 0x211812, grid: 0xf59e0b, accent: 0xf59e0b },
  [TerrainType.Snow]: { ground: 0x111827, grid: 0xbae6fd, accent: 0xbae6fd },
} as const;

// Weather shroud: tint, vision radius, opacity. Kept soft/atmospheric — a heavy
// shroud reads as a flat grey box rather than weather. (Solo/local only; online
// has no weather — the ION STORM is its environmental mechanic.)
const WEATHER: Partial<Record<WeatherType, { tint: number; rad: number; alpha: number }>> = {
  [WeatherType.Fog]: { tint: 0x080a0f, rad: 330, alpha: 0.6 },
  [WeatherType.Sandstorm]: { tint: 0x4a3014, rad: 360, alpha: 0.55 },
  [WeatherType.Snowstorm]: { tint: 0xcfe6ff, rad: 330, alpha: 0.42 },
  [WeatherType.Rain]: { tint: 0x0a0f19, rad: 450, alpha: 0.5 },
};

const ecfg = (t: Tank) => (t.enemyType ? ENEMY_CONFIGS[t.enemyType] : undefined);

function tankColors(t: Tank): { fill: number; stroke: number | string; cone: number | string } {
  if (t.type === 'player') return { fill: 0x0f172a, stroke: t.color, cone: t.color };
  const c = ecfg(t);
  const col = c?.color ?? t.color ?? '#ef4444'; // roster colour per enemy
  return { fill: c?.isBoss ? 0x111827 : 0x141a26, stroke: col, cone: col };
}

export class PixiRenderer {
  app: Application | null = null;
  private ready = false;
  private quality: Quality = 'high';
  private time = 0;
  private lastTerrain: TerrainType | null = null;

  private world!: Container; // shaken
  private ground!: Container;
  private bg!: Graphics;
  private groundGlow!: Sprite;
  private decals!: Graphics;
  private repair!: Graphics;
  private obstacles!: Graphics; // cover/crates (world space, below tanks)
  private hazardGfx!: Graphics; // artillery warnings + mines (world space)
  private fx!: Container; // bloomed
  private tankLayer!: Container;
  private bullets!: Graphics;
  private beamGfx!: Graphics;
  private explosions!: Graphics;
  private particles!: Graphics;
  private stormGfx!: Graphics; // ION STORM ring (world space, above fx, no bloom)
  private fireAlertGfx!: Graphics; // gunshot pings, on-screen (world space)
  private overlay!: Container; // not shaken
  private vignette!: Sprite;
  private weatherTint!: Graphics;
  private weatherSprite!: Sprite;
  private flash!: Graphics;
  private stormDanger!: Graphics; // red out-of-zone warning (screen space)
  private fireAlertEdge!: Graphics; // off-screen gunshot direction markers (screen space)
  private textLayer!: Container;
  private minimap!: Graphics;

  // Current follow-camera offset (world coords of the viewport's top-left).
  private camX = 0;
  private camY = 0;
  private viewTarget: Tank | null = null; // who the camera follows (spectates if local is dead)

  private ringTex!: Texture;
  private dotTex!: Texture;
  private tankPool = new Map<string, TankView>();
  private textPool: Text[] = [];

  async init(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    const app = new Application();
    await app.init({
      width: 1000,
      height: 700,
      background: 0x05070d,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    app.ticker.stop(); // we drive rendering from the game loop
    this.app = app;

    app.canvas.className =
      'border-4 border-slate-900 rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.9)] cursor-crosshair';
    container.appendChild(app.canvas as HTMLCanvasElement);

    this.ringTex = makeRingTexture(256);
    this.dotTex = makeSoftCircleTexture(128);
    this.buildScene();
    this.ready = true;
  }

  private buildScene() {
    const stage = this.app!.stage;

    this.world = new Container();
    stage.addChild(this.world);

    this.ground = new Container();
    this.bg = new Graphics();
    this.groundGlow = new Sprite(this.dotTex);
    this.groundGlow.anchor.set(0.5);
    this.groundGlow.position.set(500, 350);
    this.groundGlow.scale.set(900 / 128);
    this.groundGlow.alpha = 0.07;
    this.groundGlow.blendMode = 'add';
    this.decals = new Graphics();
    this.repair = new Graphics();
    this.obstacles = new Graphics();
    this.hazardGfx = new Graphics();
    this.ground.addChild(this.bg, this.groundGlow, this.decals, this.repair, this.obstacles, this.hazardGfx);
    this.world.addChild(this.ground);

    this.fx = new Container();
    this.tankLayer = new Container();
    this.bullets = new Graphics();
    this.beamGfx = new Graphics();
    this.explosions = new Graphics();
    this.particles = new Graphics();
    this.fx.addChild(this.explosions, this.tankLayer, this.bullets, this.beamGfx, this.particles);
    this.world.addChild(this.fx);

    // ION STORM ring sits above the bloomed fx, in world space (scrolls w/ camera).
    this.stormGfx = new Graphics();
    this.world.addChild(this.stormGfx);

    // On-screen gunshot pings (world space, above the storm ring).
    this.fireAlertGfx = new Graphics();
    this.world.addChild(this.fireAlertGfx);

    if (this.quality !== 'low') this.fx.filters = [this.makeBloom(this.quality)];
    // Pin the bloom filter region (avoids Pixi crashing on the huge off-screen
    // beam bounds). filterArea is in the fx layer's LOCAL (world) space and the
    // fx layer is scrolled by the camera, so this rectangle is re-anchored to the
    // visible viewport every frame in render(). The margin covers screen-shake.
    this.fx.filterArea = new Rectangle(-120, -120, VIEW_W + 240, VIEW_H + 240);

    this.overlay = new Container();
    stage.addChild(this.overlay);

    // Static screen vignette.
    this.vignette = new Sprite(this.ringTex);
    this.vignette.anchor.set(0.5);
    this.vignette.position.set(500, 350);
    this.vignette.scale.set(620 / 128);
    this.vignette.tint = 0x05070d;
    this.vignette.alpha = 0.5;
    this.overlay.addChild(this.vignette);

    // Full-screen weather colour grade.
    this.weatherTint = new Graphics();
    this.overlay.addChild(this.weatherTint);

    // Weather shroud centred on the local player.
    this.weatherSprite = new Sprite(this.ringTex);
    this.weatherSprite.anchor.set(0.5);
    this.weatherSprite.visible = false;
    this.overlay.addChild(this.weatherSprite);

    this.flash = new Graphics();
    this.overlay.addChild(this.flash);

    // Out-of-zone danger tint (screen space).
    this.stormDanger = new Graphics();
    this.overlay.addChild(this.stormDanger);

    // Off-screen gunshot direction markers (screen space).
    this.fireAlertEdge = new Graphics();
    this.overlay.addChild(this.fireAlertEdge);

    this.textLayer = new Container();
    this.overlay.addChild(this.textLayer);

    // Corner minimap (only shown on the big battle-royale world).
    this.minimap = new Graphics();
    this.overlay.addChild(this.minimap);
  }

  private makeBloom(q: Quality): AdvancedBloomFilter {
    return new AdvancedBloomFilter({
      threshold: 0.45,
      bloomScale: q === 'high' ? 0.85 : 0.55,
      brightness: 1.0,
      blur: q === 'high' ? 6 : 4,
      quality: q === 'high' ? 5 : 3,
    });
  }

  setQuality(q: Quality) {
    // Cheap toggle of bloom for the current scene; resolution changes apply next match.
    this.quality = q;
    if (!this.ready) return;
    this.fx.filters = q === 'low' ? [] : [this.makeBloom(q)];
  }

  render(snap: WorldSnapshot) {
    if (!this.ready || !this.app) return;
    this.time++;

    // Follow camera: centre the local tank on the big world (a no-op {0,0} on
    // the small arena). If the local tank is dead, spectate a living one.
    const me = snap.player ?? snap.players[0];
    const target = me && me.health > 0 ? me : snap.players.find((p) => p.health > 0) ?? me;
    this.viewTarget = target ?? null;
    const cam = target
      ? cameraOffset(target.x, target.y, snap.arena.w, snap.arena.h)
      : { x: 0, y: 0 };
    this.camX = cam.x;
    this.camY = cam.y;
    // Re-anchor the bloom region to the visible viewport (filterArea is in the
    // fx layer's local/world space, which the camera scrolls by -cam). Integer
    // coords keep the bloom render-texture size stable (fractional ones can round
    // to a degenerate texture and crash AdvancedBloom).
    if (this.fx.filterArea) {
      this.fx.filterArea.x = Math.round(cam.x) - 120;
      this.fx.filterArea.y = Math.round(cam.y) - 120;
    }
    let shx = 0;
    let shy = 0;
    if (snap.screenShake > 0.1) {
      const sh = Math.min(snap.screenShake, 30);
      shx = (Math.random() - 0.5) * sh;
      shy = (Math.random() - 0.5) * sh;
    }
    this.world.x = -cam.x + shx;
    this.world.y = -cam.y + shy;

    this.drawBackground(snap);
    this.drawDecals(snap);
    this.drawObstacles(snap);
    this.drawHazards(snap);
    this.drawRepair(snap);
    this.syncTanks(snap);
    this.drawBullets(snap);
    this.drawBeams(snap);
    this.drawExplosions(snap);
    this.drawParticles(snap);
    this.drawWeather(snap);
    this.drawStorm(snap);
    this.drawFireAlerts(snap);
    this.drawFloatingText(snap);
    this.drawMinimap(snap);

    this.flash.clear();
    if (snap.screenFlash > 0) {
      this.flash.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff, alpha: snap.screenFlash });
    }

    // Safety net: a filter (AdvancedBloom) must never throw out of the render
    // loop and freeze the whole game. If it does, drop bloom and carry on flat.
    try {
      this.app.render();
    } catch (e) {
      if (this.fx.filters && this.fx.filters.length) {
        this.fx.filters = [];
        try {
          this.app.render();
        } catch {
          /* ignore — frame skipped */
        }
        console.warn('[hypertank] bloom disabled after a filter error', e);
      }
    }
  }

  private drawBackground(snap: WorldSnapshot) {
    const g = this.bg;
    const t = TERRAIN[snap.terrain] ?? TERRAIN[TerrainType.Grassland];
    const { w, h } = snap.arena;
    g.clear();
    g.rect(0, 0, w, h).fill(t.ground);

    // Animated tactical grid (slow pan).
    const off = (this.time * 0.15) % 100;
    for (let x = -100 + off; x < w; x += 100) {
      g.moveTo(x, 0).lineTo(x, h);
    }
    for (let y = -100 + off; y < h; y += 100) {
      g.moveTo(0, y).lineTo(w, y);
    }
    g.stroke({ width: 1, color: t.grid, alpha: 0.12 });

    if (this.quality !== 'low') {
      // Radar ping ring expanding from the centre.
      const ping = (this.time % 220) / 220;
      g.circle(w / 2, h / 2, ping * 640).stroke({ width: 2, color: t.accent, alpha: (1 - ping) * 0.1 });
      // Slow horizontal scan sweep.
      const scanY = ((this.time * 1.6) % (h + 160)) - 80;
      g.rect(0, scanY, w, 2).fill({ color: t.accent, alpha: 0.05 });
    }

    // Neon arena border.
    g.roundRect(3, 3, w - 6, h - 6, 14).stroke({ width: 2, color: t.accent, alpha: 0.35 });

    // Tint the soft ground glow to the biome accent; keep it under the player
    // (on the big world it would otherwise sit far away at the world origin).
    this.groundGlow.tint = t.accent;
    const tgt = this.viewTarget ?? snap.player ?? snap.players[0];
    if (tgt) this.groundGlow.position.set(tgt.x, tgt.y);

    this.lastTerrain = snap.terrain;
  }

  private drawDecals(snap: WorldSnapshot) {
    const g = this.decals;
    g.clear();
    for (const tm of snap.treadMarks) {
      const cx = Math.cos(tm.angle) * 5;
      const cy = Math.sin(tm.angle) * 5;
      g.moveTo(tm.x - cx, tm.y - cy).lineTo(tm.x + cx, tm.y + cy);
      g.stroke({ width: tm.width, color: tm.color, alpha: tm.opacity });
    }
  }

  private drawObstacles(snap: WorldSnapshot) {
    const g = this.obstacles;
    g.clear();
    for (const o of snap.obstacles ?? []) {
      const x = o.x - o.w / 2;
      const y = o.y - o.h / 2;
      if (o.kind === 'crate') {
        // Amber supply crate (energy hint), darkening + cracking as it's shot.
        const dmg = o.maxHealth > 0 ? Math.max(0, 1 - o.health / o.maxHealth) : 0;
        g.roundRect(x, y, o.w, o.h, 4).fill({ color: 0x7a5526, alpha: 0.95 }).stroke({ width: 2, color: 0xd9a441, alpha: 0.9 });
        g.moveTo(x + 3, y + 3).lineTo(x + o.w - 3, y + o.h - 3)
          .moveTo(x + o.w - 3, y + 3).lineTo(x + 3, y + o.h - 3)
          .stroke({ width: 2, color: 0x3f2d16, alpha: 0.6 });
        g.circle(o.x, o.y, 4).fill({ color: 0xfde047, alpha: 0.85 });
        if (dmg > 0.05) g.roundRect(x, y, o.w, o.h, 4).fill({ color: 0xef4444, alpha: dmg * 0.4 });
      } else {
        // Solid rock cover.
        g.roundRect(x, y, o.w, o.h, 8).fill({ color: 0x39414f, alpha: 0.96 }).stroke({ width: 2, color: 0x64748b, alpha: 0.8 });
        g.circle(o.x - o.w * 0.16, o.y - o.h * 0.14, Math.min(o.w, o.h) * 0.17).fill({ color: 0x4b5563, alpha: 0.55 });
      }
    }
  }

  private drawHazards(snap: WorldSnapshot) {
    const g = this.hazardGfx;
    g.clear();
    for (const hz of snap.hazards ?? []) {
      if (hz.kind === 'strike') {
        // Telegraphed blast: outer ring = full radius, inner fill grows toward impact.
        const k = 1 - hz.timer / hz.maxTimer; // 0 → 1 at impact
        g.circle(hz.x, hz.y, hz.radius).stroke({ width: 2, color: 0xf59e0b, alpha: 0.5 + 0.3 * Math.sin(this.time * 0.4) });
        g.circle(hz.x, hz.y, hz.radius * k).fill({ color: 0xf59e0b, alpha: 0.18 });
      } else {
        // Mine: dim while arming, bright blinking once armed.
        const blink = hz.armed ? 0.4 + 0.4 * Math.sin(this.time * 0.5) : 0.25;
        g.circle(hz.x, hz.y, 7).fill({ color: 0x84cc16, alpha: blink });
        g.circle(hz.x, hz.y, 7).stroke({ width: 1.5, color: 0x84cc16, alpha: 0.8 });
        if (hz.armed) g.circle(hz.x, hz.y, hz.radius).stroke({ width: 1, color: 0x84cc16, alpha: 0.12 });
      }
    }
  }

  private drawRepair(snap: WorldSnapshot) {
    const g = this.repair;
    g.clear();
    for (const it of snap.repairItems) {
      g.circle(it.x, it.y, it.radius).fill({ color: 0x22c55e, alpha: it.opacity * 0.85 });
      g.rect(it.x - 4, it.y - 12, 8, 24).fill({ color: 0xffffff, alpha: it.opacity });
      g.rect(it.x - 12, it.y - 4, 24, 8).fill({ color: 0xffffff, alpha: it.opacity });
    }
    // Energy cells (violet diamond) — charge the ultimate gauge.
    for (const c of snap.energyCells) {
      const r = c.radius;
      g.circle(c.x, c.y, r * 1.4).fill({ color: 0xa78bfa, alpha: c.opacity * 0.25 });
      g.moveTo(c.x, c.y - r)
        .lineTo(c.x + r * 0.75, c.y)
        .lineTo(c.x, c.y + r)
        .lineTo(c.x - r * 0.75, c.y)
        .fill({ color: 0xc4b5fd, alpha: c.opacity })
        .stroke({ width: 2, color: 0xede9fe, alpha: c.opacity });
      g.circle(c.x, c.y, 3).fill({ color: 0xffffff, alpha: c.opacity });
    }
  }

  private syncTanks(snap: WorldSnapshot) {
    const seen = new Set<string>();
    const tanks = [...snap.enemies, ...snap.players];
    for (const t of tanks) {
      seen.add(t.id);
      let v = this.tankPool.get(t.id);
      if (!v) {
        v = this.createTankView();
        this.tankLayer.addChild(v.container);
        this.tankPool.set(t.id, v);
      }
      v.container.position.set(t.x, t.y);
      v.chassis.rotation = t.angle;
      v.turret.rotation = t.turretAngle;
      const key = `${t.type}:${t.enemyType}:${t.tankClass}:${t.width}:${t.height}`;
      if (v.lastKey !== key) {
        this.drawChassis(v.chassis, t);
        this.drawTurret(v.turret, t);
        v.shadow.scale.set((t.width * 1.7) / 128);
        v.shadow.position.set(0, t.height * 0.15);
        v.lastKey = key;
      }
      this.drawHealth(v.health, t);
    }
    for (const [id, v] of this.tankPool) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.tankPool.delete(id);
      }
    }
  }

  private createTankView(): TankView {
    const container = new Container();
    const shadow = new Sprite(this.dotTex);
    shadow.anchor.set(0.5);
    shadow.tint = 0x000000;
    shadow.alpha = 0.35;
    const chassis = new Graphics();
    const turret = new Graphics();
    const health = new Graphics();
    container.addChild(shadow, chassis, turret, health);
    return { container, shadow, chassis, turret, health, lastKey: '' };
  }

  private drawChassis(g: Graphics, t: Tank) {
    const { fill, stroke, cone } = tankColors(t);
    const w = t.width;
    const h = t.height;
    g.clear();
    // Headlight cone (behind hull) — bloom turns the low-alpha fill into a glow.
    const coneLen = w * 4;
    g.moveTo(w / 2, -h * 0.35)
      .lineTo(w / 2 + coneLen, -h * 1.1)
      .lineTo(w / 2 + coneLen, h * 1.1)
      .lineTo(w / 2, h * 0.35)
      .fill({ color: cone, alpha: 0.05 });

    const cls = t.type === 'player' ? t.tankClass ?? 'assault' : null;

    if (t.type === 'enemy') {
      this.drawEnemyShape(g, t, fill, stroke);
    } else if (cls === 'vanguard') {
      // Heavy brawler: wide hull, fat treads, bolted side armour plates, rivets.
      g.roundRect(-w / 2 - 2, -h / 2 - 4, w + 4, 9, 3).fill(0x0b1220);
      g.roundRect(-w / 2 - 2, h / 2 - 5, w + 4, 9, 3).fill(0x0b1220);
      g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 3).fill(fill).stroke({ width: 3.5, color: stroke, alpha: 0.95 });
      g.rect(-w / 2 + 7, -h / 2 - 1, w - 14, 5).fill({ color: 0x0f172a, alpha: 0.75 });
      g.rect(-w / 2 + 7, h / 2 - 4, w - 14, 5).fill({ color: 0x0f172a, alpha: 0.75 });
      g.rect(w / 2 - 8, -h / 2 + 6, 6, h - 12).fill({ color: stroke, alpha: 0.3 }); // frontal armour
      for (const [rx, ry] of [[-w / 2 + 8, -h / 2 + 7], [w / 2 - 10, -h / 2 + 7], [-w / 2 + 8, h / 2 - 7], [w / 2 - 10, h / 2 - 7]] as const) {
        g.circle(rx, ry, 1.6).fill({ color: stroke, alpha: 0.7 });
      }
    } else if (cls === 'sniper') {
      // Glass-cannon dart: narrow pointed hull with swept-back fins.
      g.roundRect(-w / 2, -h / 2 - 2, w, 5, 2).fill(0x0b1220);
      g.roundRect(-w / 2, h / 2 - 3, w, 5, 2).fill(0x0b1220);
      g.poly([-w / 2 + 2, -h / 2 + 2, -w / 2 - 7, -h / 2 - 7, -w / 2 + 12, -h * 0.08]).fill({ color: fill, alpha: 0.92 }).stroke({ width: 1.5, color: stroke, alpha: 0.7 });
      g.poly([-w / 2 + 2, h / 2 - 2, -w / 2 - 7, h / 2 + 7, -w / 2 + 12, h * 0.08]).fill({ color: fill, alpha: 0.92 }).stroke({ width: 1.5, color: stroke, alpha: 0.7 });
      g.poly([-w / 2 + 5, -h / 2 + 5, w / 2 - 2, -h / 2 + 9, w / 2 + 9, 0, w / 2 - 2, h / 2 - 9, -w / 2 + 5, h / 2 - 5])
        .fill(fill)
        .stroke({ width: 2.5, color: stroke, alpha: 0.95 });
    } else {
      // Assault (and AI enemies): sleek beveled battle tank with a pointed prow.
      g.roundRect(-w / 2, -h / 2 - 3, w, 7, 3).fill(0x0b1220);
      g.roundRect(-w / 2, h / 2 - 4, w, 7, 3).fill(0x0b1220);
      if (cls === 'assault') {
        g.poly([-w / 2 + 3, -h / 2 + 3, w / 2 - 9, -h / 2 + 3, w / 2 + 5, 0, w / 2 - 9, h / 2 - 3, -w / 2 + 3, h / 2 - 3])
          .fill(fill)
          .stroke({ width: 3, color: stroke, alpha: 0.95 });
        g.rect(-w / 2 + 7, -h * 0.13, w * 0.46, h * 0.26).fill({ color: stroke, alpha: 0.16 });
      } else {
        g.roundRect(-w / 2 + 3, -h / 2 + 2, w - 6, h - 4, 6).fill(fill).stroke({ width: 3, color: stroke, alpha: 0.95 });
      }
      // Front-facing chevron (reads chassis orientation at a glance).
      g.moveTo(w / 2 - 6, -h / 3)
        .lineTo(w / 2 + 2, 0)
        .lineTo(w / 2 - 6, h / 3)
        .stroke({ width: 2, color: stroke, alpha: 0.85 });
    }

    // Reactor core — class accent for players (bright → blooms). Enemies get
    // their own core inside drawEnemyShape.
    if (t.type === 'player') {
      const accent = TANK_CLASSES[t.tankClass ?? 'assault'].accent;
      g.circle(0, 0, 9).fill({ color: accent, alpha: 0.35 });
      g.circle(0, 0, 4).fill(0xffffff);
    }
  }

  /** Procedural enemy hull — one of 12 silhouettes per the roster `shape`. */
  private drawEnemyShape(g: Graphics, t: Tank, fill: number, stroke: number | string) {
    const w = t.width;
    const h = t.height;
    const r = w / 2;
    const shape: EnemyShape = ecfg(t)?.shape ?? 'block';
    const line = { width: 2.5, color: stroke, alpha: 0.95 } as const;
    const poly = (pts: number[]) => g.poly(pts).fill(fill).stroke(line);
    switch (shape) {
      case 'block':
        g.roundRect(-w / 2, -h / 2, w, h, 5).fill(fill).stroke(line);
        break;
      case 'diamond':
        poly([r, 0, 0, -h / 2, -r, 0, 0, h / 2]);
        break;
      case 'hex': {
        const p: number[] = [];
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push(Math.cos(a) * r, Math.sin(a) * r * 0.92); }
        poly(p);
        break;
      }
      case 'pentagon': {
        const p: number[] = [];
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; p.push(Math.cos(a) * r, Math.sin(a) * r); }
        poly(p);
        break;
      }
      case 'triangle':
        poly([r, 0, -r, -h / 2, -r, h / 2]);
        break;
      case 'arrow':
        poly([r, 0, -r * 0.4, -h / 2, -r * 0.1, 0, -r * 0.4, h / 2]);
        break;
      case 'wedge':
        poly([r, -h / 2, r, h / 2, -r, h * 0.28, -r, -h * 0.28]);
        break;
      case 'chevron':
        poly([r, 0, r * 0.1, -h / 2, -r * 0.5, -h / 2, r * 0.35, 0, -r * 0.5, h / 2, r * 0.1, h / 2]);
        break;
      case 'orb':
        g.circle(0, 0, r).fill(fill).stroke(line);
        break;
      case 'ring':
        g.circle(0, 0, r * 0.6).fill({ color: fill, alpha: 0.5 });
        g.circle(0, 0, r).stroke({ width: Math.max(4, w * 0.16), color: stroke, alpha: 0.95 });
        break;
      case 'cross': {
        const a = w * 0.22;
        g.rect(-a, -h / 2, a * 2, h).fill(fill);
        g.rect(-w / 2, -a, w, a * 2).fill(fill);
        g.rect(-a, -h / 2, a * 2, h).stroke({ width: 2, color: stroke, alpha: 0.9 });
        g.rect(-w / 2, -a, w, a * 2).stroke({ width: 2, color: stroke, alpha: 0.9 });
        break;
      }
      case 'spike': {
        const p: number[] = [];
        const n = 8;
        for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const rad = i % 2 === 0 ? r : r * 0.48; p.push(Math.cos(a) * rad, Math.sin(a) * rad); }
        poly(p);
        break;
      }
    }
    // Menacing core.
    g.circle(0, 0, Math.max(3, w * 0.12)).fill({ color: stroke, alpha: 0.5 });
    g.circle(0, 0, Math.max(2, w * 0.06)).fill(0xffffff);
  }

  private drawTurret(g: Graphics, t: Tank) {
    const { stroke } = tankColors(t);
    const w = t.width;
    const cls = t.type === 'player' ? t.tankClass ?? 'assault' : null;
    const accent = cls ? TANK_CLASSES[cls].accent : stroke;
    g.clear();

    if (cls === 'vanguard') {
      // Twin stubby auto-cannons (the bullet-hose), blocky turret.
      const bl = w * 0.56;
      const bw = Math.max(4, w * 0.12);
      for (const oy of [-w * 0.17, w * 0.17]) {
        g.roundRect(0, oy - bw / 2, bl, bw, 2).fill(0x1e293b).stroke({ width: 1.5, color: stroke, alpha: 0.8 });
        g.roundRect(bl - 4, oy - bw / 2, 4, bw, 1).fill(accent);
      }
      g.roundRect(-w * 0.3, -w * 0.3, w * 0.6, w * 0.6, 3).fill(0x0f172a).stroke({ width: 2.5, color: stroke, alpha: 0.95 });
    } else if (cls === 'sniper') {
      // Long railgun barrel with charge coils + a sleek mount.
      const bl = w * 1.18;
      const bw = Math.max(3, w * 0.09);
      g.roundRect(0, -bw / 2, bl, bw, 1).fill(0x1e293b).stroke({ width: 1.5, color: stroke, alpha: 0.8 });
      for (let i = 1; i <= 3; i++) {
        const cx = bl * 0.22 * i;
        g.rect(cx - 2, -bw * 1.7, 4, bw * 3.4).fill({ color: accent, alpha: 0.75 });
      }
      g.roundRect(bl - 6, -bw / 2, 6, bw, 1).fill(0xffffff);
      g.circle(0, 0, w * 0.26).fill(0x0f172a).stroke({ width: 2.5, color: stroke, alpha: 0.95 });
    } else {
      // Assault (and AI enemies): single barrel + offset gun-sight.
      const arch = t.type === 'enemy' ? ecfg(t)?.archetype : null;
      if (arch !== 'rammer') {
        // Rammers (Kamikaze) have no gun.
        const cfg = cls ? TANK_CLASSES[cls] : null;
        const bl = w * (cfg ? cfg.barrelLen : 0.7);
        const bw = Math.max(4, w * (cfg ? cfg.barrelW : 0.14));
        g.roundRect(0, -bw / 2, bl, bw, 2).fill(0x1e293b).stroke({ width: 1.5, color: stroke, alpha: 0.8 });
        g.roundRect(bl - 4, -bw / 2, 4, bw, 1).fill(accent);
        if (cls === 'assault') g.rect(-w * 0.04, -w * 0.34, w * 0.16, w * 0.15).fill({ color: 0x0f172a }).stroke({ width: 1.2, color: stroke, alpha: 0.7 });
        g.circle(0, 0, w * 0.3).fill(0x0f172a).stroke({ width: 2.5, color: stroke, alpha: 0.95 });
      }
    }
    g.circle(0, 0, 3).fill(accent);
  }

  private drawHealth(g: Graphics, t: Tank) {
    g.clear();
    const pct = Math.max(0, Math.min(1, t.health / t.maxHealth));
    const isPlayer = t.type === 'player';
    // Bosses get a prominent wide bar above their hull.
    if (ecfg(t)?.isBoss) {
      const bw = t.width * 1.1;
      const y = -t.height / 2 - 18;
      g.roundRect(-bw / 2, y, bw, 8, 3).fill({ color: 0x000000, alpha: 0.6 });
      g.roundRect(-bw / 2, y, bw * pct, 8, 3).fill({ color: pct > 0.4 ? 0xef4444 : 0xfb7185 });
      g.roundRect(-bw / 2, y, bw, 8, 3).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
      return;
    }
    if (pct >= 1 && !isPlayer) return; // hide full-health enemy bars (less clutter)
    const bw = t.width;
    const y = -t.height / 2 - 12;
    g.roundRect(-bw / 2, y, bw, 5, 2).fill({ color: 0x000000, alpha: 0.5 });
    const col = pct > 0.45 ? 0x22c55e : pct > 0.22 ? 0xfbbf24 : 0xef4444;
    g.roundRect(-bw / 2, y, bw * pct, 5, 2).fill(col);

    // Per-player ammo bar under the tank (red while reloading).
    if (isPlayer && t.maxAmmo) {
      const ay = t.height / 2 + 6;
      const apct = Math.max(0, Math.min(1, (t.ammo ?? 0) / t.maxAmmo));
      g.roundRect(-bw / 2, ay, bw, 3, 1).fill({ color: 0x000000, alpha: 0.5 });
      if (t.reloading) {
        g.roundRect(-bw / 2, ay, bw, 3, 1).fill({ color: 0xef4444, alpha: 0.7 });
      } else {
        g.roundRect(-bw / 2, ay, bw * apct, 3, 1).fill({ color: 0x38bdf8, alpha: 0.95 });
      }
    }

    // Ultimate-ready pulsing ring.
    if (isPlayer && (t.energy ?? 0) >= (t.maxEnergy ?? 1)) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.15);
      g.circle(0, 0, t.width * 0.85).stroke({ width: 2.5, color: 0xfde047, alpha: 0.35 + pulse * 0.45 });
    }
  }

  private drawBeams(snap: WorldSnapshot) {
    const g = this.beamGfx;
    g.clear();
    for (const b of snap.beams) {
      const a = b.maxLife > 0 ? b.life / b.maxLife : 1;
      g.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: b.width * a + 3, color: b.color, alpha: a * 0.8, cap: 'round' });
      g.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: 2, color: 0xffffff, alpha: a, cap: 'round' });
    }
  }

  private drawBullets(snap: WorldSnapshot) {
    const g = this.bullets;
    g.clear();
    for (const b of snap.bullets) {
      // Trail.
      if (b.trailHistory && b.trailHistory.length > 2) {
        g.moveTo(b.trailHistory[0].x, b.trailHistory[0].y);
        for (let i = 1; i < b.trailHistory.length; i++) g.lineTo(b.trailHistory[i].x, b.trailHistory[i].y);
        g.stroke({ width: b.isHoming ? b.width * 1.5 : b.width, color: b.color, alpha: 0.45, cap: 'round' });
      }
      // Glowing tracer body.
      const hx = Math.cos(b.angle) * (b.height / 2);
      const hy = Math.sin(b.angle) * (b.height / 2);
      g.moveTo(b.x - hx, b.y - hy)
        .lineTo(b.x + hx, b.y + hy)
        .stroke({ width: b.width, color: b.color, alpha: 1, cap: 'round' });
      g.circle(b.x, b.y, Math.max(2, b.width * 0.35)).fill(0xffffff);
    }

    // Bomber aircraft (dark silhouette, drawn in the fx layer).
    if (snap.bomber.active) {
      const bx = snap.bomber.x;
      const by = snap.bomber.y;
      g.moveTo(bx - 350, by)
        .lineTo(bx + 100, by - 240)
        .lineTo(bx + 300, by)
        .lineTo(bx + 100, by + 240)
        .fill({ color: 0x0f172a, alpha: 0.95 });
    }

    // Spawn indicators (blinking arrows).
    const flash = Math.sin(this.time / 6) * 0.5 + 0.5;
    for (const ind of snap.spawnIndicators) {
      const ca = Math.cos(ind.angle);
      const sa = Math.sin(ind.angle);
      const px = (lx: number, ly: number) => ({ x: ind.x + lx * ca - ly * sa, y: ind.y + lx * sa + ly * ca });
      const p1 = px(10, 0);
      const p2 = px(-6, -5);
      const p3 = px(-6, 5);
      g.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).lineTo(p3.x, p3.y).fill({ color: 0xef4444, alpha: flash });
    }
  }

  private drawExplosions(snap: WorldSnapshot) {
    const g = this.explosions;
    g.clear();
    for (const e of snap.explosions) {
      g.circle(e.x, e.y, e.radius).fill({ color: e.color, alpha: e.opacity * 0.45 });
      g.circle(e.x, e.y, e.radius * 0.55).fill({ color: 0xffffff, alpha: e.opacity * 0.4 });
    }
  }

  private drawParticles(snap: WorldSnapshot) {
    const g = this.particles;
    g.clear();
    for (const p of snap.particles) {
      g.circle(p.x, p.y, p.radius).fill({ color: p.color, alpha: p.opacity });
    }
  }

  private drawWeather(snap: WorldSnapshot) {
    const cfg = WEATHER[snap.weather];
    this.weatherTint.clear();
    // The old radial vision-shroud is gone — its opaque-cornered texture read as
    // a grey rectangle (worst under Snowstorm). Weather is now just a soft,
    // uniform full-screen colour grade for mood; particles carry the atmosphere.
    this.weatherSprite.visible = false;
    if (!cfg) return;
    this.weatherTint.rect(0, 0, VIEW_W, VIEW_H).fill({ color: cfg.tint, alpha: 0.14 });
  }

  private drawFloatingText(snap: WorldSnapshot) {
    const list = snap.floatingTexts;
    for (let i = 0; i < list.length; i++) {
      let txt = this.textPool[i];
      if (!txt) {
        txt = new Text({
          text: '',
          style: { fontFamily: 'Orbitron, sans-serif', fontSize: 24, fontWeight: 'bold', fill: 0xffffff, align: 'center' },
        });
        txt.anchor.set(0.5);
        this.textPool[i] = txt;
        this.textLayer.addChild(txt);
      }
      const ft = list[i];
      txt.visible = true;
      txt.text = ft.text;
      txt.style.fontSize = ft.size;
      txt.style.fill = ft.color;
      // World-space position → on-screen (overlay isn't camera-translated).
      txt.position.set(ft.x - this.camX, ft.y - this.camY);
      txt.alpha = ft.opacity;
    }
    for (let i = list.length; i < this.textPool.length; i++) this.textPool[i].visible = false;
  }

  private drawStorm(snap: WorldSnapshot) {
    const st = snap.storm;
    this.stormGfx.clear();
    this.stormDanger.clear();
    if (!st || !st.active) return;
    // Current safe-zone boundary (pulsing cyan).
    const pulse = 0.4 + 0.18 * Math.sin(this.time * 0.08);
    this.stormGfx.circle(st.cx, st.cy, st.radius).stroke({ width: 8, color: 0x38bdf8, alpha: pulse });
    this.stormGfx.circle(st.cx, st.cy, st.radius).stroke({ width: 2, color: 0xe0f2fe, alpha: pulse + 0.2 });
    // Where the zone is closing to next (magenta).
    if (st.toR < st.radius - 5) {
      this.stormGfx.circle(st.toCx, st.toCy, st.toR).stroke({ width: 3, color: 0xf472b6, alpha: 0.5 });
    }
    // Pulsing red wash when the local tank is outside the zone (taking damage).
    const p = snap.player ?? snap.players[0];
    if (p && Math.hypot(p.x - st.cx, p.y - st.cy) > st.radius) {
      const a = 0.13 + 0.06 * Math.sin(this.time * 0.2);
      this.stormDanger.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xef4444, alpha: a });
    }
  }

  private drawFireAlerts(snap: WorldSnapshot) {
    const g = this.fireAlertGfx; // world space (on-screen pings)
    const e = this.fireAlertEdge; // screen space (off-screen direction markers)
    g.clear();
    e.clear();
    const local = snap.player ?? snap.players[0];
    if (!local) return;
    for (const a of snap.fireAlerts ?? []) {
      if (a.ownerId === local.id) continue; // not your own shots
      const dx = a.x - local.x;
      const dy = a.y - local.y;
      if (Math.hypot(dx, dy) > HEAR_RANGE) continue; // only gunfire within earshot

      const t = a.maxLife > 0 ? a.life / a.maxLife : 1; // 1 → 0 as it fades
      const sx = a.x - this.camX;
      const sy = a.y - this.camY;
      const onScreen = sx > 20 && sx < VIEW_W - 20 && sy > 86 && sy < VIEW_H - 20;
      if (onScreen) {
        const r = (1 - t) * 30 + 8;
        g.circle(a.x, a.y, r).stroke({ width: 3, color: 0xfb923c, alpha: t * 0.85 });
        g.circle(a.x, a.y, r * 0.5).stroke({ width: 1.5, color: 0xfdba74, alpha: t * 0.5 });
      } else {
        // Off-screen: a chevron at the screen edge pointing toward the gunfire.
        const ang = Math.atan2(dy, dx);
        const ex = VIEW_W / 2 + Math.cos(ang) * (VIEW_W * 0.44);
        const ey = VIEW_H / 2 + Math.sin(ang) * (VIEW_H * 0.4);
        const cx = Math.max(28, Math.min(VIEW_W - 28, ex));
        const cy = Math.max(96, Math.min(VIEW_H - 28, ey));
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const pt = (lx: number, ly: number) => [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca];
        e.poly([...pt(12, 0), ...pt(-7, -7), ...pt(-7, 7)]).fill({ color: 0xfb923c, alpha: t * 0.9 });
        e.circle(cx, cy, 14).stroke({ width: 1.5, color: 0xfb923c, alpha: t * 0.4 });
      }
    }
  }

  private drawMinimap(snap: WorldSnapshot) {
    const g = this.minimap;
    g.clear();
    const ww = snap.arena.w;
    const wh = snap.arena.h;
    // Small arena (solo / local-2P) fits the whole screen — no minimap needed.
    if (ww <= VIEW_W && wh <= VIEW_H) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const mmW = 176;
    const mmH = Math.round(mmW * (wh / ww)); // preserve world aspect ratio
    const mx = VIEW_W - mmW - 16;
    const my = VIEW_H - mmH - 16;
    const sx = mmW / ww;
    const sy = mmH / wh;

    // Panel (fairly opaque so world content doesn't bleed through).
    g.roundRect(mx - 5, my - 5, mmW + 10, mmH + 10, 8)
      .fill({ color: 0x05070d, alpha: 0.85 })
      .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.4 });

    // Current viewport rectangle (what the camera shows right now).
    g.rect(mx + this.camX * sx, my + this.camY * sy, VIEW_W * sx, VIEW_H * sy)
      .stroke({ width: 1, color: 0xe2e8f0, alpha: 0.4 });

    // ION STORM zone (current + next target).
    const st = snap.storm;
    if (st && st.active) {
      g.circle(mx + st.cx * sx, my + st.cy * sy, st.radius * sx).stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.75 });
      if (st.toR < st.radius - 5) {
        g.circle(mx + st.toCx * sx, my + st.toCy * sy, st.toR * sx).stroke({ width: 1, color: 0xf472b6, alpha: 0.8 });
      }
    }

    // Nearby gunfire pings (orange) — glance-able threat awareness.
    const localTank = snap.player ?? snap.players[0];
    for (const a of snap.fireAlerts ?? []) {
      if (!localTank || a.ownerId === localTank.id) continue;
      if (Math.hypot(a.x - localTank.x, a.y - localTank.y) > HEAR_RANGE) continue;
      const t = a.maxLife > 0 ? a.life / a.maxLife : 1;
      g.circle(mx + a.x * sx, my + a.y * sy, 2.6).fill({ color: 0xfb923c, alpha: 0.5 + t * 0.4 });
    }

    // Player blips (local player gets a white ring).
    const localId = (snap.player ?? snap.players[0])?.id;
    for (const p of snap.players) {
      if (p.health <= 0) continue;
      const px = mx + p.x * sx;
      const py = my + p.y * sy;
      const me = p.id === localId;
      g.circle(px, py, me ? 4.5 : 3).fill({ color: p.color, alpha: 1 });
      if (me) g.circle(px, py, 7.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    }
  }

  destroy() {
    this.ready = false;
    try {
      this.app?.destroy(true, { children: true, texture: true });
    } catch {
      /* ignore */
    }
    this.app = null;
    this.tankPool.clear();
    this.textPool = [];
  }
}
