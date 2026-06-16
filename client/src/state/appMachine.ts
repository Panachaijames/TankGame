import type { AppScreen, AppOverlay, MatchConfig } from '../types';

/**
 * The app-shell navigation machine. This is intentionally separate from the
 * in-match `GameState` (which the simulation owns): `screen` is *where in the
 * shell* the user is, `overlay` is a modal stacked on top of any screen, and
 * `match` is the config handed to the simulation when a match launches.
 *
 * Pure functions only — trivially unit-testable, no React inside.
 */

export interface ShellState {
  screen: AppScreen;
  overlay: AppOverlay;
  match: MatchConfig | null;
}

export type ShellAction =
  | { type: 'navigate'; screen: AppScreen }
  | { type: 'openOverlay'; overlay: Exclude<AppOverlay, null> }
  | { type: 'closeOverlay' }
  | { type: 'toggleOverlay'; overlay: Exclude<AppOverlay, null> }
  | { type: 'setMatch'; match: MatchConfig }
  | { type: 'startMatch'; match: MatchConfig }
  | { type: 'endMatch' }
  | { type: 'quitToMenu' };

export const initialShellState: ShellState = {
  screen: 'mainMenu',
  overlay: null,
  match: null,
};

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'navigate':
      return { ...state, screen: action.screen, overlay: null };

    case 'openOverlay':
      return { ...state, overlay: action.overlay };

    case 'closeOverlay':
      return { ...state, overlay: null };

    case 'toggleOverlay':
      return {
        ...state,
        overlay: state.overlay === action.overlay ? null : action.overlay,
      };

    case 'setMatch':
      return { ...state, match: action.match };

    case 'startMatch':
      return { ...state, screen: 'playing', overlay: null, match: action.match };

    case 'endMatch':
      return { ...state, screen: 'results', overlay: null };

    case 'quitToMenu':
      return { ...state, screen: 'mainMenu', overlay: null, match: null };

    default:
      return state;
  }
}
