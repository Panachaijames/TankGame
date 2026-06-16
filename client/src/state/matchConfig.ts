import type { MatchConfig, SessionKind, MatchMode, TankClass } from '../types';

export const PLAYER_COLORS = ['#38bdf8', '#fbbf24', '#22c55e', '#a855f7'];

/**
 * Build the MatchConfig handed to the simulation. The shape is N-player-ready;
 * each player carries its own tank class (loadout).
 */
export function createMatchConfig(
  session: SessionKind,
  mode: MatchMode,
  options?: { startDifficulty?: number; classes?: TankClass[] },
): MatchConfig {
  const classes = options?.classes ?? [];
  const players: MatchConfig['players'] = [
    {
      id: 'p1',
      name: 'Player 1',
      control: 'wasd',
      color: PLAYER_COLORS[0],
      isLocal: true,
      tankClass: classes[0] ?? 'assault',
    },
  ];

  if (session === 'local2p') {
    players.push({
      id: 'p2',
      name: 'Player 2',
      control: 'arrows',
      color: PLAYER_COLORS[1],
      isLocal: true,
      tankClass: classes[1] ?? 'vanguard',
    });
  }
  // Online players are added as they join the lobby (Phase 6).

  return {
    session,
    mode,
    players,
    options: { startDifficulty: options?.startDifficulty ?? 1 },
  };
}
