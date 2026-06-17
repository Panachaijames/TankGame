import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';

/**
 * Follow-camera offset: the top-left world coordinate of the viewport so that
 * `target` sits centred on screen, clamped to the world bounds. When the world
 * fits inside the viewport (solo / local-2P small arena) this returns {0,0},
 * i.e. no scrolling — world coordinates equal screen coordinates.
 *
 * Shared by the sim (mouse-aim → world space, bound clamps) and the renderer
 * (scrolling the world container) so they always agree.
 */
export function cameraOffset(
  targetX: number,
  targetY: number,
  worldW: number,
  worldH: number,
  viewW: number = CANVAS_WIDTH,
  viewH: number = CANVAS_HEIGHT,
): { x: number; y: number } {
  const x = worldW <= viewW ? 0 : Math.max(0, Math.min(worldW - viewW, targetX - viewW / 2));
  const y = worldH <= viewH ? 0 : Math.max(0, Math.min(worldH - viewH, targetY - viewH / 2));
  return { x, y };
}
