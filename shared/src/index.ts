// @hypertank/shared — pure-TS game simulation, types, and constants.
// Runs in the browser (local play / host-authoritative P2P) AND on Node (an
// optional authoritative server). Kept free of React / DOM / canvas / Tone so
// it can run anywhere.
//
// Phase 3 in progress: the input contract is the first extracted seam. The full
// World/step()/systems land here next.
export * from './sim/input';
