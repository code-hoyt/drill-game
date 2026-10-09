// Loadout parts (DESIGN 4.2). Seven slots (SIPHON added with the side pockets), one part each. The stock part in every slot is the
// baseline balance; every other part is a sidegrade with a real downside.
// A part's `mods` are folded into ShipSystems.mods at run start (multipliers multiply,
// `add*` fields add, flags/overrides replace). `unlocked` gates the vendor pool (M3 licences
// can flip it); see UNLOCKS below for the depth/relay milestones.

export const SLOTS = [
  { id: 'drill',  name: 'DRILL HEAD', short: 'DRL', room: 'drill' },
  { id: 'engine', name: 'ENGINE',     short: 'ENG', room: 'engine' },
  { id: 'hull',   name: 'HULL',       short: 'HUL', room: 'tools' },
  { id: 'tools',  name: 'TOOLS',      short: 'TLS', room: 'tools' },
  { id: 'helm',   name: 'HELM',       short: 'HLM', room: 'helm' },
  { id: 'kit',    name: "HOLT'S KIT", short: 'KIT', room: 'tools' },
  { id: 'siphon', name: 'SIPHON',     short: 'SIP', room: 'siphon' },
];

const P = (slot, id, name, price, up, down, mods, extra = {}) => ({ slot, id, name, price, up, down, mods, unlocked: true, ...extra });

export const PARTS = [
  // --- stock (owned from the start, the M1 balance) ---
  P('drill',  'stockbit',    'SURVEY BIT',        0, 'BALANCED. THE COMPANY ISSUE.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('engine', 'stockengine', 'K-9 ENGINE',        0, 'BALANCED. STARTS EVERY TIME.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('hull',   'stockhull',   'STANDARD PLATE',    0, 'BALANCED. 100 HULL.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('tools',  'stocktools',  'BENCH KIT',         0, 'PATCH + 1.2S BLAST.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('helm',   'stockhelm',   'BASIC CONSOLE',     0, 'STANDARD WARNINGS.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('kit',    'stockkit',    'WORK BOOTS',        0, 'STANDARD WALK + CLIMB.', 'NOTHING SPECIAL.', {}, { stock: true }),
  P('siphon', 'stocksiphon', 'HAND PUMP',         0, 'BALANCED. 100 L TANK.', 'NOTHING SPECIAL.', {}, { stock: true }),

  // --- drill head ---
  P('drill', 'widecut', 'WIDE-CUT BIT', 900, 'TOP SPEED +25%', 'HEAT +35%. SAFE RAM ZONE SHRINKS', { maxSpeedMul: 1.25, heatMul: 1.35 }),
  P('drill', 'diamond', 'DIAMOND-CORE BIT', 700, 'BIT WEAR -40%', 'TOP SPEED -15%', { wearMul: 0.6, maxSpeedMul: 0.85 }),
  P('drill', 'grinder', 'GRINDER HEAD', 600, 'SAFE RAM SPEED 35% TO 50%', 'GRIND WEAR +40%. TOP SPEED -10%', { ramSafe: 0.5, grindWearMul: 1.4, maxSpeedMul: 0.9 }),
  // --- engine ---
  P('engine', 'overdrive', 'OVERDRIVE TURBINE', 650, 'ACCELERATION +60%', 'COOLANT LEAKS HIT 2X HARDER', { accelMul: 1.6, spikeMul: 2 }),
  P('engine', 'coldloop', 'COLD-LOOP ENGINE', 600, 'PASSIVE COOLING X2', 'ACCELERATION -30%', { coolMul: 2, accelMul: 0.7 }),
  P('engine', 'bypass', 'BYPASS VALVE', 550, 'OVERHEATED CAP 40% TO 70% SPEED', 'OVERHEAT HULL DAMAGE X2', { overheatCap: 0.7, overheatDmgMul: 2 }),
  // --- hull ---
  P('hull', 'plating', 'HEAVY PLATING', 800, '+40 MAX HULL', 'ACCEL + BRAKING -35%', { addMaxHull: 40, accelMul: 0.65, decelMul: 0.65 }),
  P('hull', 'ablative', 'ABLATIVE SKIN', 700, 'RAM DAMAGE -40%', 'PATCHING 50% SLOWER', { ramMul: 0.6, patchMul: 0.5 }),
  P('hull', 'lightframe', 'LIGHT FRAME', 500, 'ACCEL + BRAKING +35%', '-25 MAX HULL', { addMaxHull: -25, accelMul: 1.35, decelMul: 1.35 }),
  // --- tools ---
  P('tools', 'heavycharge', 'HEAVY CHARGE', 750, 'ONE BLAST CLEARS EVERY BOULDER IN VIEW', 'CHARGE TIME 3S (WAS 1.2S)', { blastAll: true, blastTimeMul: 2.5 }),
  P('tools', 'patchfoam', 'PATCH FOAM', 550, 'PATCH RATE +80%', 'NO BLASTING AT ALL', { patchMul: 1.8, noBlast: true }),
  P('tools', 'quickcap', 'QUICK CAPACITOR', 600, 'BLAST CHARGES IN 0.5S', 'EACH BLAST ADDS +15 HEAT', { blastTimeMul: 0.42, blastHeat: 15 }),
  // --- helm ---
  P('helm', 'scanner', 'LONG SCANNER', 600, 'BOULDER WARNINGS 2X EARLIER', 'HEAT +15% (POWER DRAW)', { warnMul: 2, heatMul: 1.15 }),
  P('helm', 'governor', 'DEAD-MAN GOVERNOR', 450, 'NO PILOT + ROCK AHEAD: DROPS TO SAFE SPEED', 'TRIPS ON ANY ROCK. STAYS SLOW TILL HOLT RESETS IT', { governor: true }),
  P('helm', 'linkage', 'CABLE LINKAGE', 700, 'THROTTLE WORKS FROM HELM OR DRL', 'TOP SPEED -15%', { pilotRooms: ['helm', 'drill'], maxSpeedMul: 0.85 }),
  // --- Holt's kit ---
  P('kit', 'harness', 'CLIMBING HARNESS', 350, 'CLIMB SPEED +50%', 'WALK SPEED -15%', { climbMul: 1.5, walkMul: 0.85 }),
  P('kit', 'lightboots', 'LIGHT BOOTS', 350, 'WALK SPEED +25%', 'CLIMB SPEED -20%', { walkMul: 1.25, climbMul: 0.8 }),
  P('kit', 'toolbelt', 'TOOL BELT', 450, 'VENT, FIX + PATCH 25% FASTER', 'CLIMB SPEED -25%', { workMul: 1.25, climbMul: 0.75 }),
  // --- siphon (side pockets) ---
  P('siphon', 'bigtank', 'BULK TANK', 500, 'TANK 160 L (WAS 100)', 'PUMPS 30% SLOWER', { tankMul: 1.6, pumpMul: 0.7 }),
  P('siphon', 'highflow', 'HIGH-FLOW PUMP', 650, 'PUMPS 60% FASTER', 'PRESSURE BUILDS 70% FASTER', { pumpMul: 1.6, pressMul: 1.7 }),
];

// ---- unlocks ([C] M2 feedback) -------------------------------------------------------
// One sidegrade per slot is open from the start; the rest unlock in pairs every 500 m of
// best depth (any contract), plus one for lifetime relays reached, so there's always a next
// thing to chase. Owned parts are never locked (grandfathered).
export const UNLOCKS = {
  // starters (no rule): diamond, coldloop, ablative, patchfoam, scanner, lightboots
  harness: { depth: 500 },  lightframe: { depth: 500 },
  grinder: { depth: 1000 }, governor: { depth: 1000 },
  overdrive: { depth: 1500 }, quickcap: { depth: 1500 },
  plating: { depth: 2000 }, bypass: { depth: 2000 },
  toolbelt: { relays: 3 },
  linkage: { depth: 2500 },
  bigtank: { depth: 500 }, highflow: { depth: 1500 },   // SIPHON: no starter alternative; both gated by depth
  widecut: { depth: 3000 }, heavycharge: { depth: 3000 },
};
for (const p of PARTS) { p.unlock = UNLOCKS[p.id] || null; p.unlocked = !p.unlock; }
export const unlockText = (p) => !p.unlock ? '' : p.unlock.depth ? `REACH ${p.unlock.depth}M` : `${p.unlock.relays} RELAYS (TOTAL)`;
export const unlockMet = (p, progress) => !p.unlock || (p.unlock.depth ? progress.best >= p.unlock.depth : progress.relays >= p.unlock.relays);

export const partById = (id) => PARTS.find((p) => p.id === id);
export const stockPart = (slot) => PARTS.find((p) => p.slot === slot && p.stock);
export const partsForSlot = (slot) => PARTS.filter((p) => p.slot === slot);
export const DEFAULT_LOADOUT = () => Object.fromEntries(SLOTS.map((s) => [s.id, stockPart(s.id).id]));

/** Fold the equipped parts into a ShipSystems.mods object (in place). */
export function applyParts(mods, loadout) {
  for (const slot of SLOTS) {
    const part = partById(loadout?.[slot.id]) || stockPart(slot.id);
    for (const [k, v] of Object.entries(part.mods)) {
      if (k === 'addMaxHull') mods.maxHullBonus += v;
      else if (k.endsWith('Mul')) mods[k] = (mods[k] ?? 1) * v;
      else mods[k] = v;
    }
  }
  return mods;
}
