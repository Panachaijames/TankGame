import { Application, Container, Graphics, Sprite, Text, Rectangle, type Texture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { EnemyType, WeatherType, TerrainType, type Tank } from '../types';
import { TANK_CLASSES } from '../constants';
import type { WorldSnapshot } from '../components/Battlefield';
import { makeRingTexture, makeSoftCircleTexture } from './textures';
import { cameraOffset } from '../sim/camera';

export type Quality = 'low' | 'medium' | 'high';

// The viewport (canvas) size — the window onto the (possibly larger) world.
const VIEW_W = 1000;
const VIEW_H = 700;

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

// Weather shroud: tint, vision radius, opacity (mirrors the original radial vignette).
const WEATHER: Partial<Record<WeatherType, { tint: number; rad: number; alpha: number }>> = {
  [WeatherType.Fog]: { tint: 0x080a0f, rad: 260, alpha: 0.97 },
  [WeatherType.Sandstorm]: { tint: 0x4a3014, rad: 310, alpha: 0.93 },
  [WeatherType.Snowstorm]: { tint: 0xbfdbfe, rad: 230, alpha: 0.9 },
  [WeatherType.Rain]: { tint: 0x0a0f19, rad: 410, alpha: 0.88 },
};

function tankColors(t: Tank): { fill: number; stroke: number | string; cone: number | string } {
  if (t.type === 'player') return { fill: 0x0f172a, stroke: t.color, cone: t.color };
  if (t.enemyType === EnemyType.Boss) return { fill: 0x111827, stroke: 0xa855f7, cone: 0xa855f7 };
  if (t.enemyType === EnemyType.Heavy) return { fill: 0x1e293b, stroke: 0xe2e8f0, cone: 0xe2e8f0 };
  if (t.enemyType === EnemyType.Kamikaze) return { fill: 0x7f1d1d, stroke: 0xef4444, cone: 0xef4444 };
  return { fill: 0x111827, stroke: t.color, cone: 0xef4444 };
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
  private fx!: Container; // bloomed
  private tankLayer!: Container;
  private bullets!: Graphics;
  private beamGfx!: Graphics;
  private explosions!: Graphics;
  private particles!: Graphics;
  private overlay!: Container; // not shaken
  private vignette!: Sprite;
  private weatherTint!: Graphics;
  private weatherSprite!: Sprite;
  private flash!: Graphics;
  private textLayer!: Container;
  private minimap!: Graphics;

  // Current follow-camera offset (world coords of the viewport's top-left).
  private camX = 0;
  private camY = 0;

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
    this.ground.addChild(this.bg, this.groundGlow, this.decals, this.repair);
    this.world.addChild(this.ground);

    this.fx = new Container();
    this.tankLayer = new Container();
    this.bullets = new Graphics();
    this.beamGfx = new Graphics();
    this.explosions = new Graphics();
    this.particles = new Graphics();
    this.fx.addChild(this.explosions, this.tankLayer, this.bullets, this.beamGfx, this.particles);
    this.world.addChild(this.fx);

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
    // the small arena). The world container scrolls; shake rides on top.
    const target = snap.player ?? snap.players[0];
    const cam = target
      ? cameraOffset(target.x, target.y, snap.arena.w, snap.arena.h)
      : { x: 0, y: 0 };
    this.camX = cam.x;
    this.camY = cam.y;
    // Re-anchor the bloom region to the visible viewport (filterArea is in the
    // fx layer's local/world space, which the camera scrolls by -cam).
    if (this.fx.filterArea) {
      this.fx.filterArea.x = cam.x - 120;
      this.fx.filterArea.y = cam.y - 120;
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
    this.drawRepair(snap);
    this.syncTanks(snap);
    this.drawBullets(snap);
    this.drawBeams(snap);
    this.drawExplosions(snap);
    this.drawParticles(snap);
    this.drawWeather(snap);
    this.drawFloatingText(snap);
    this.drawMinimap(snap);

    this.flash.clear();
    if (snap.screenFlash > 0) {
      this.flash.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff, alpha: snap.screenFlash });
    }

    this.app.render();
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
    const tgt = snap.player ?? snap.players[0];
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
    // Treads.
    g.roundRect(-w / 2, -h / 2 - 3, w, 7, 3).fill(0x0b1220);
    g.roundRect(-w / 2, h / 2 - 4, w, 7, 3).fill(0x0b1220);
    // Hull.
    g.roundRect(-w / 2 + 3, -h / 2 + 2, w - 6, h - 4, 6)
      .fill(fill)
      .stroke({ width: 3, color: stroke, alpha: 0.95 });
    // Front-facing chevron (reads chassis orientation at a glance).
    g.moveTo(w / 2 - 6, -h / 3)
      .lineTo(w / 2 + 2, 0)
      .lineTo(w / 2 - 6, h / 3)
      .stroke({ width: 2, color: stroke, alpha: 0.85 });
    // Reactor core — class accent for players (bright → blooms).
    const accent = t.type === 'player' ? TANK_CLASSES[t.tankClass ?? 'assault'].accent : stroke;
    g.circle(0, 0, 9).fill({ color: accent, alpha: 0.35 });
    g.circle(0, 0, 4).fill(0xffffff);
  }

  private drawTurret(g: Graphics, t: Tank) {
    const { stroke } = tankColors(t);
    const cls = t.type === 'player' ? TANK_CLASSES[t.tankClass ?? 'assault'] : null;
    const accent = cls ? cls.accent : stroke;
    const barrelLen = t.width * (cls ? cls.barrelLen : 0.72);
    const barrelW = Math.max(4, t.width * (cls ? cls.barrelW : 0.13));
    g.clear();
    g.roundRect(0, -barrelW / 2, barrelLen, barrelW, 2)
      .fill(0x1e293b)
      .stroke({ width: 1.5, color: stroke, alpha: 0.8 });
    // Muzzle accent (class colour) at the barrel tip.
    g.roundRect(barrelLen - 4, -barrelW / 2, 4, barrelW, 1).fill(accent);
    g.circle(0, 0, t.width * 0.3)
      .fill(0x0f172a)
      .stroke({ width: 2.5, color: stroke, alpha: 0.95 });
    g.circle(0, 0, 3).fill(accent);
  }

  private drawHealth(g: Graphics, t: Tank) {
    g.clear();
    if (t.enemyType === EnemyType.Boss) return;
    const pct = Math.max(0, Math.min(1, t.health / t.maxHealth));
    const isPlayer = t.type === 'player';
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
    if (!cfg) {
      this.weatherSprite.visible = false;
      return;
    }
    // Full-screen colour grade for mood (overlay is screen-space → viewport-sized).
    this.weatherTint.rect(0, 0, VIEW_W, VIEW_H).fill({ color: cfg.tint, alpha: 0.2 });
    // Softened radial vision limit centred on the local player. The overlay is
    // screen-space, so place it at the player's on-screen position (world − cam).
    const p = snap.player ?? snap.players[0];
    this.weatherSprite.visible = true;
    this.weatherSprite.position.set(p.x - this.camX, p.y - this.camY);
    this.weatherSprite.scale.set((cfg.rad * 1.3) / 128);
    this.weatherSprite.tint = cfg.tint;
    this.weatherSprite.alpha = cfg.alpha * 0.72;
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

    // Panel.
    g.roundRect(mx - 5, my - 5, mmW + 10, mmH + 10, 8)
      .fill({ color: 0x05070d, alpha: 0.66 })
      .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.4 });

    // Current viewport rectangle (what the camera shows right now).
    g.rect(mx + this.camX * sx, my + this.camY * sy, VIEW_W * sx, VIEW_H * sy)
      .stroke({ width: 1, color: 0xe2e8f0, alpha: 0.4 });

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
