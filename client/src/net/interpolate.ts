import type { WorldSnapshot } from '../components/Battlefield';
import { deserializeSnapshot } from './serialize';

export interface TimedSnap {
  t: number; // client receive time (performance.now)
  s: any; // wire snapshot
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d < -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return a + d * k;
}

function lerpTanks(aArr: any[], bArr: any[], k: number): any[] {
  const aById = new Map<string, any>((aArr || []).map((t) => [t.id, t]));
  return (bArr || []).map((tb) => {
    const ta = aById.get(tb.id);
    if (!ta) return tb;
    return {
      ...tb,
      x: lerp(ta.x, tb.x, k),
      y: lerp(ta.y, tb.y, k),
      angle: lerpAngle(ta.angle, tb.angle, k),
      turretAngle: lerpAngle(ta.turretAngle, tb.turretAngle, k),
    };
  });
}

function lerpBullets(aArr: any[], bArr: any[], k: number): any[] {
  const aById = new Map<string, any>((aArr || []).map((b) => [b.id, b]));
  return (bArr || []).map((bb) => {
    const ba = aById.get(bb.id);
    if (!ba) return bb;
    return { ...bb, x: lerp(ba.x, bb.x, k), y: lerp(ba.y, bb.y, k), angle: lerpAngle(ba.angle, bb.angle, k) };
  });
}

/**
 * Entity interpolation: render the world `delay` ms in the past, lerping tank
 * and bullet transforms between the two snapshots bracketing that time. Smooths
 * the host's ~20 Hz updates up to 60 fps. Short-lived FX (explosions, beams,
 * pickups) just use the newer snapshot.
 */
export function interpolateSnapshot(buffer: TimedSnap[], localId: string, delay = 100): WorldSnapshot | null {
  const n = buffer.length;
  if (n === 0) return null;
  const renderT = performance.now() - delay;

  if (renderT <= buffer[0].t) return deserializeSnapshot(buffer[0].s, localId);
  if (renderT >= buffer[n - 1].t) return deserializeSnapshot(buffer[n - 1].s, localId);

  let a = buffer[0];
  let b = buffer[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (buffer[i].t <= renderT && buffer[i + 1].t >= renderT) {
      a = buffer[i];
      b = buffer[i + 1];
      break;
    }
  }
  const span = b.t - a.t || 1;
  const k = Math.max(0, Math.min(1, (renderT - a.t) / span));

  const merged = {
    ...b.s,
    players: lerpTanks(a.s.players, b.s.players, k),
    enemies: lerpTanks(a.s.enemies, b.s.enemies, k),
    bullets: lerpBullets(a.s.bullets, b.s.bullets, k),
  };
  return deserializeSnapshot(merged, localId);
}
