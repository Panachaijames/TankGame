/**
 * The only thing a controller (local keyboard, gamepad, or a remote peer over
 * the network) needs to produce. The simulation consumes a map of these keyed
 * by player id and never touches hardware directly — which is what makes local
 * 2P, gamepads, and online play all share one engine.
 */
export interface PlayerInput {
  drive: number; // -1..1  (forward / reverse)
  turn: number; // -1..1   (rotate chassis)
  aim: number; // absolute turret target angle in radians (world space)
  fire: boolean;
  reload: boolean;
  nuke: boolean;
  bomber: boolean;
  ult: boolean;
}

export const EMPTY_INPUT: PlayerInput = {
  drive: 0,
  turn: 0,
  aim: 0,
  fire: false,
  reload: false,
  nuke: false,
  bomber: false,
  ult: false,
};
