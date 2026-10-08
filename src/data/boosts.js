// Relay supplies: 3 distinct random offers per relay; picks stack for the rest of the run.
// Each apply() edits the run modifiers (see ShipSystems.mods) and may touch state.
export const BOOSTS = [
  { id: 'coolant',  name: 'COOLANT CANISTER', desc: 'VENT RATE +30%',              apply: (m) => { m.ventMul *= 1.3; } },
  { id: 'sparebit', name: 'SPARE BIT',        desc: 'AUTO-SWAPS IN WHEN THE BIT DIES', apply: (m) => { m.spareBits += 1; } },
  { id: 'charge',   name: 'CHARGE PACK',      desc: 'BLASTS CHARGE 2X FASTER',     apply: (m) => { m.blastTimeMul *= 0.5; } },
  { id: 'plate',    name: 'PLATE KIT',        desc: '+15 MAX HULL (AND +15 NOW)',  apply: (m, s) => { m.maxHullBonus += 15; s.hull += 15; } },
  { id: 'scanner',  name: 'SCANNER TUNE-UP',  desc: 'BOULDER WARNINGS 50% EARLIER', apply: (m) => { m.warnMul *= 1.5; } },
  { id: 'boots',    name: 'GOOD BOOTS',       desc: 'WALK + CLIMB SPEED +15%',     apply: (m) => { m.crewSpeedMul *= 1.15; } },
  { id: 'heatsink', name: 'HEAT SINK',        desc: 'HEAT BUILD-UP -15%',          apply: (m) => { m.heatMul *= 0.85; } },
  { id: 'hardbit',  name: 'HARDENED TEETH',   desc: 'BIT WEAR -15%',               apply: (m) => { m.wearMul *= 0.85; } },
  { id: 'patch',    name: 'PATCH COMPOUND',   desc: 'PATCH RATE +40%',             apply: (m) => { m.patchMul *= 1.4; } },
  { id: 'struts',   name: 'SHOCK STRUTS',     desc: 'RAM DAMAGE -20%',             apply: (m) => { m.ramMul *= 0.8; } },
];

/** n distinct random boosts (Fisher-Yates on a copy). `force` (ids) is a test hook. */
export function drawBoosts(n, rand = Math.random, force = null) {
  if (force) return force.map((id) => BOOSTS.find((b) => b.id === id)).filter(Boolean);
  const pool = [...BOOSTS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
