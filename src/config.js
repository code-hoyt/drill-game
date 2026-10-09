// ---------------------------------------------------------------------------
// Global constants. Everything gameplay-related you might want to tweak lives
// in TUNING; screen/world layout lives in LAYOUT.
// ---------------------------------------------------------------------------

export const GAME_W = 180; // base (virtual) resolution, portrait
export const GAME_H = 320;

export const TUNING = {
  // --- Movement -----------------------------------------------------------
  MAX_SPEED_PX: 40,        // world px / second at 100% throttle
  PX_PER_METER: 4,         // 4 px of scrolling = 1 m of depth (=> 10 m/s max)
  ACCEL: 0.5,              // how fast real speed climbs toward throttle (fraction / s)
  DECEL: 1.6,              // how fast it drops (braking is quicker than accelerating)
  THROTTLE_STEP: 0.1,      // +/- button step & slider snap
  START_THROTTLE: 0.3,

  // --- Difficulty ramp ----------------------------------------------------
  DIFF_DEPTH: 400,         // every 400 m adds +100% to heat & wear build-up rates

  // --- Engine heat (Engine station) --------------------------------------
  HEAT_MAX: 100,
  HEAT_RATE: 5,            // heat/s at full speed (scales with speed^2 * difficulty). Was 7 before ore + events
  HEAT_COOL: 1.2,          // passive cooling / s
  HEAT_ALERT: 70,          // alert icon threshold
  VENT_RATE: 35,           // heat removed / s while venting
  OVERHEAT_DAMAGE: 4,      // drill integrity / s while heat is maxed
  OVERHEAT_SPEED_CAP: 0.4, // engine limps while overheated
  SPIKE_START_DEPTH: 60,   // m before random coolant-leak heat spikes begin
  SPIKE_INTERVAL: [40, 65],// s between spikes (shrinks with difficulty). Was [25, 45]
  SPIKE_AMOUNT: 22,        // heat added by a spike

  // --- Drill bit wear (Drill station) ------------------------------------
  WEAR_MAX: 100,
  WEAR_PER_METER: 0.10,    // wear per metre drilled (x difficulty). Was 0.15
  WEAR_ALERT: 70,
  REPAIR_RATE: 30,         // wear removed / s while repairing
  WORN_DAMAGE: 3,          // drill integrity / s while bit is fully worn and moving
  WORN_SPEED_CAP: 0.5,

  // --- Drill integrity (Tools station patches it) -----------------------
  // The ship has no hull meter: only the leased drill unit takes damage. (Field names stay
  // hull/maxHull in code for save/test compatibility; everything player-facing says DRILL.)
  HULL_MAX: 100,
  HULL_ALERT: 35,
  PATCH_RATE: 9,           // drill integrity restored / s while patching

  // --- Obstacles ----------------------------------------------------------
  RAM_SAFE_SPEED: 0.35,    // at/below this speed the drill grinds boulders safely
  RAM_DAMAGE_BASE: 8,      // drill damage for ramming = (BASE + SPEED*speed) * sizeMult
  RAM_DAMAGE_SPEED: 30,
  RAM_WEAR: 12,            // bit wear added by a ram
  GRIND_RATE: 1,           // boulder hp removed / s while grinding (hp ~ seconds)
  GRIND_WEAR: 4,           // bit wear / s while grinding
  BLAST_TIME: 1.2,         // seconds of holding BLAST at the tools station to clear one boulder
  OBSTACLE_GAP_START: 90,  // metres between boulders at the surface
  OBSTACLE_GAP_MIN: 22,    // ...shrinks to this
  OBSTACLE_GAP_DEPTH: 1500,// ...by this depth (m)
  WARN_DISTANCE: 110,      // px above the drill tip at which a boulder flashes a warning

  // --- Hard rock bands ----------------------------------------------------
  HARD_START_DEPTH: 120,   // m before hard-rock bands can appear
  HARD_CHANCE: 0.35,       // chance per band-check (every HARD_CHECK_GAP m)
  HARD_CHECK_GAP: 60,
  HARD_HEAT_MULT: 2,
  HARD_WEAR_MULT: 3,
  HARD_SPEED_CAP: 0.7,

  // --- Relays & earnings (M1) ----------------------------------------------
  RELAY_INTERVAL: 1000,    // m between relay anchors (breaks)
  RELAY_WARN: 50,          // m before a relay: dispatch ping + no boulders/hard rock arrive in this window
  RELAY_CLEAR_AFTER: 30,   // m after a relay that are also kept boulder-free
  PAY_PER_METER: 1,        // credits per metre before the multiplier
  PAY_MULT_STEP: 0.5,      // segment multiplier = 1 + STEP x relays passed  (x1.0, x1.5, x2.0, ...)
  CASHOUT_BONUS: 0.10,     // cash out at a relay: keep the hold + 10%
  HULL_LOSS_KEEP: 1 / 3,   // drill lost: the write-off comes out of your paycheck, you keep 1/3 of the HOLD (the hopper is gone)
  REPAIR_COST_BASE: 4,     // credits per drill integrity point at relay 1 (paid from the hold)
  REPAIR_COST_GROWTH: 1.5, // x per relay after the first (4, 6, 9, 13.5, ...)
  REPAIR_STEP: 10,         // integrity points per "+10" repair tap
  BOOST_CHOICES: 3,        // relay supplies offered per relay (distinct, random)

  // --- Crew / views -------------------------------------------------------
  // Same-deck trip: 32 px straight across the deck (over the ladder grate) = 32/48 = ~0.67 s.
  // Cross-deck trip: 16 px to the ladder + 28 px direct climb + 16 px out = 32/48 + 28/70 = ~1.07 s.
  CREW_WALK_SPEED: 48,     // world px / s on deck floors
  CREW_CLIMB_SPEED: 70,    // world px / s in the crawl tube to the cockpit pod (kit parts: climbMul)
  START_ROOM: 'helm',      // where the crew member stands when a run starts
  PILOT_REQUIRED: true,    // throttle only responds while the crew is at the HELM
  LOCK_TOAST_COOLDOWN: 900,// ms between "NO PILOT" toasts when tapping a locked throttle
  VIEW_PAN_MS: 650,        // camera transition time
};

// ---- Drill + ship: power split, hopper -> conveyor -> hold ([C] Cletus) ----------------------------
// The DRILL (a Meridian-leased boring unit) and Holt's SHIP are separate machines, clamped together.
// The ship's reactor has a fixed output; the drill draws power in proportion to its actual speed and the
// conveyor (drill HOPPER -> ship HOLD) gets whatever is left. Everything the drill cuts lands in the
// hopper; only the hold is banked. Full speed starves the conveyor (the hopper fills and then SPILLS);
// a full stop gives the conveyor everything. With the defaults:
//   speed 100%: draw 95, conveyor  0.4 u/s vs 10 u/s in  -> hopper full in ~12 s, then spills
//   speed  50%: draw 47.5, conveyor 4.2 u/s vs  5 u/s in -> fills slowly (+0.8 u/s, ~2.5 min from empty)
//   speed ~45%: break-even.  Below that the hopper drains while you drill.
//   full stop : conveyor 8 u/s -> a full 120 u hopper empties in 15 s
// ---- Ships ([C] Cletus): per-ship stats, so future ships slot in ---------------------------------
// One entry per hull. Only CORMORANT has art + an interior so far; the others are design data
// (docs/DESIGN.md "Future ships"). POWER below is derived from the active ship.
//   breakaway: 'flip'    = turns 180 deg in the bore and burns out on its mains (light hulls)
//              'reverse' = backs straight out on its retro jets, nose still to the drill (heavy / wide hulls)
//   holdCap  : proposed hold capacity (units). NOT enforced yet (the hold is unlimited); null = no cap.
//   siphonSide: the flank with the hose port + reel; side pockets only form on that wall for this hull.
export const SHIPS = {
  cormorant: { name: 'CORMORANT', cls: 'REMIXED SURVEY SAUCER', implemented: true,
    reactor: 100, drillDraw: 95, drawExp: 1, conveyorRate: 0.08, hopperCap: 120,
    holdCap: null, holdCapProposed: 600, flipMs: 500, breakaway: 'flip', siphonSide: 'left' },
  brakeman: { name: 'BRAKEMAN', cls: 'EX-MILITARY RECOVERY TRACTOR', implemented: false,
    reactor: 120, drillDraw: 95, drawExp: 1, conveyorRate: 0.07, hopperCap: 120,
    holdCap: null, holdCapProposed: 450, flipMs: 1100, breakaway: 'reverse', siphonSide: 'right' },
  sister_june: { name: 'SISTER JUNE', cls: 'CATAMARAN ORE BARGE', implemented: false,
    reactor: 92, drillDraw: 95, drawExp: 1, conveyorRate: 0.095, hopperCap: 120,
    holdCap: null, holdCapProposed: 900, flipMs: 900, breakaway: 'reverse', siphonSide: 'right' },
  patience: { name: 'PATIENCE', cls: 'TAPERED TUG', implemented: false,
    reactor: 100, drillDraw: 95, drawExp: 1, conveyorRate: 0.085, hopperCap: 120,
    holdCap: null, holdCapProposed: 350, flipMs: 700, breakaway: 'flip', siphonSide: 'left' },
};
export const SHIP_ID = 'cormorant';
export const SHIP = SHIPS[SHIP_ID];
/** Breakaway style for this run: the ship's own, or ?breakaway=flip|reverse (playtests / tests). */
export function breakawayStyle() {
  try { const q = new URLSearchParams(location.search).get('breakaway'); if (q === 'flip' || q === 'reverse') return q; } catch { /* no window */ }
  return SHIP.breakaway;
}

export const POWER = {
  REACTOR: SHIP.reactor,    // ship reactor output (power units). x reactorMul (parts)
  DRILL_DRAW: SHIP.drillDraw, // drill draw at 100% (stock) speed. draw = DRILL_DRAW x realSpeed^DRAW_EXP x drawMul, capped at output
  DRAW_EXP: SHIP.drawExp,
  CONVEYOR_RATE: SHIP.conveyorRate, // hopper units moved / s per spare power unit (x convMul): 100 spare -> 8 u/s
  HOPPER_CAP: SHIP.hopperCap, // hopper units (x hopperMul)
  ORE_PER_M: 1,             // cuttings: units per metre drilled, worth PAY_PER_METER x pay mult each
  SPILL_FX_S: 0.5,          // spill feedback lingers this long after the last spilled unit
};

// ---- Ore veins ([C] Cletus): come to a FULL STOP with the drill face at the vein, then work it --------
export const ORE = {
  START_DEPTH: 80,          // first vein can arrive after this (m)
  GAP: [120, 200],          // metres between veins (x GAP_LEG_MUL^leg: a little more often each leg)
  GAP_LEG_MUL: 0.85,
  SPAWN_Y: -60,             // spawned above the screen: alert ~70 m out, on screen at ~55 m
  WINDOW_AHEAD: 4,          // stop window: vein centre between 4 m ahead of the drill tip...
  WINDOW_PAST: 2,           // ...and 2 m past it
  STOP_SPEED: 0.001,        // "full stop": actual speed at/below this
  SCRAP_FRAC: 0.1,
  WARN_AT: 70,              // risk warning toast (once per vein) as instability crosses this          // overshoot / drilled through: scrap = 10% of the vein's value
  DECAY: 14,                // instability lost per second while nobody is extracting
  ESCALATE: 1.5,            // instability rate x (1 + ESCALATE x fraction already taken): greed gets riskier
  COLLAPSE_AT: 100,
  COLLAPSE_LOSS: 0.5,       // a collapse loses half the ore taken from that vein: hopper first, the rest docked from the hold (+ drill damage)
  CLEAR_M: 15,              // no boulders arrive within 15 m of a vein (and vice versa)
  // value = credits for the whole vein at x1.0 pay (x the segment pay multiplier)
  TYPES: {
    // risk is purely greed-driven (no random tremors): inst/s x (1 + ESCALATE x taken). Without breaks a
    // small vein empties safely, a rich one collapses at ~75% taken, a fine one at ~50%.
    // units = hopper units for the whole vein (extraction feeds the hopper at units/secs: below the 8 u/s stop conveyor)
    small: { name: 'SMALL', value: 50,  units: 10, secs: 3, inst: 10, dmg: 8,  tint: 0xd08a4a },
    rich:  { name: 'RICH',  value: 140, units: 20, secs: 5, inst: 17, dmg: 14, tint: 0xffd23f },
    fine:  { name: 'FINE',  value: 330, units: 24, secs: 6, inst: 24, dmg: 22, tint: 0x7ff0ff },
  },
  // spawn weights per relay leg (index = relays passed; last entry repeats)
  WEIGHTS: [{ small: 0.6, rich: 0.32, fine: 0.08 }, { small: 0.45, rich: 0.38, fine: 0.17 }, { small: 0.35, rich: 0.4, fine: 0.25 }],
};

// ---- Side pockets + the SIPHON seat ([C] Cletus) -----------------------------------------------
// Glowing liquid pockets in the LEFT or RIGHT bore wall. Full stop with the pocket level with the hose
// port on that side of the hull (the alignment window), then Holt sits at the SIPHON seat (beside the
// port, off the ring corridor) and holds PUMP: the tank fills, the pocket drains. Line PRESSURE builds
// the longer you hold (faster on volatile pockets) and falls when you let go; at 100 the line bursts:
// part of what's left in the pocket is lost and the pump is locked out for a few seconds (no hull hit:
// a full stop stays safe, the gamble only costs liquid and time). The tank is on the SHIP (not the drill's
// hopper): it's sold into the hold at the next relay, and on drill loss it's sold into the hold before the
// 1/3 is kept. Full tank: you can't pump.
export const SIPHON = {
  START_DEPTH: 110,         // first pocket can line up after this (m)
  GAP: [160, 260],          // metres between pockets (x GAP_LEG_MUL^leg)
  GAP_LEG_MUL: 0.9,
  SPAWN_Y: -40,             // spawned above the screen: ~82 m of warning before it reaches the port
  PORT_Y: 274,              // CORMORANT's hose port (left flank, LAYOUT.SIPHON_PORT): line the pocket up here
  POCKET_X: { left: 30, right: 150 },   // pocket centre, in the bore wall beside the hull
  // Pockets only form in the wall on the ship's siphon side (SHIP.siphonSide): the hose reels out of one
  // port, and a hose reaching across the drill unit's bore would foul the clamps. ?side= is coerced.
  WINDOW_AHEAD: 4, WINDOW_PAST: 3,      // alignment window (m) around the port
  CLEAR_M: 25,              // no ore-vein stop within 25 m of a pocket stop (and no boulders arriving there)
  TANK: 100,                // litres (x tankMul from the SIPHON slot part)
  PUMP_RATE: 20,            // litres / s while holding PUMP (x pumpMul)
  PRESS_RATE: 18,           // pressure / s while pumping, x type.press x pressMul ...
  PRESS_ESC: 0.25,          // ... x (1 + PRESS_ESC x seconds held without a break): sustained pumping escalates
  PRESS_FALL: 30,           // pressure lost / s when you let go
  PRESS_WARN: 75,           // warning toast as pressure crosses this
  BURST_AT: 100,
  BURST_LOSS: 0.3,          // a burst loses 30% of what's left in the pocket
  BURST_LOCKOUT_S: 3,       // ... and locks the pump for 3 s (pressure drops to PRESS_AFTER_BURST)
  PRESS_AFTER_BURST: 40,
  // vol = litres in the pocket; value = credits for all of it at x1.0 pay (x the segment multiplier)
  TYPES: {
    small:    { name: 'SMALL',    vol: 40, value: 60,  press: 1,    tint: 0x4fe0c0 },
    rich:     { name: 'RICH',     vol: 70, value: 150, press: 1.15, tint: 0x6a9cff },
    volatile: { name: 'VOLATILE', vol: 50, value: 260, press: 2.2,  tint: 0xff5ad0 },
  },
  WEIGHTS: [{ small: 0.6, rich: 0.32, volatile: 0.08 }, { small: 0.45, rich: 0.4, volatile: 0.15 }, { small: 0.35, rich: 0.4, volatile: 0.25 }],
};

// ---- Full stop is safe ([C]) ------------------------------------------------------------------
// Actual speed 0 (throttle at 0, a jam stall, a surge shutdown): everything relaxes. No new events
// (the event timer pauses), a pending surge's countdown pauses, a jam doesn't build heat, no coolant
// leaks, no ticking drill damage, and heat bleeds off fast. The conveyor runs at full power.
// Discrete costs you choose still apply (a vein collapse, rocking a jammed bit).
export const CALM = {
  COOL: 6,              // extra heat cooling / s while stopped (passive HEAT_COOL is 1.2)
  RESUME_GRACE_S: 4,    // after moving again, the next event is at least this many seconds off
  FADE: 2.5,            // calm cues fade in/out at this rate (1/s): alarms dim, hull light steadies
  SETTLE_S: 2.5,        // rock dust settles for this long after the stop
};

// ---- Run events ([P]): problems that need a choice, not just a hold ----------------------------
export const EVENTS = {
  START_DEPTH: 150,               // nothing before this
  // [C] fires were removed: leg 1 is jams only (a little less often), leg 2 adds the power surge
  GAP_S: [[36, 52], [24, 36], [18, 28]],   // seconds between events, per leg (last repeats). Time-based (they pause at a full stop)
  POOL: [['jam'], ['jam', 'surge'], ['jam', 'surge']],
  LEG2_FIRST: 'surge',            // the first event after pushing on from relay 1 is always the new one
  MAX_ACTIVE: 2,
  // JAM: the bit seizes (no progress; the engine strains while the throttle is up)
  JAM_HEAT: 9,                    // heat/s x throttle while jammed
  JAM_ROCKS: 3,                   // helm fix: swing the throttle 0% -> 60%+ three times...
  JAM_ROCK_HIGH: 0.6, JAM_ROCK_LOW: 0.1,
  JAM_ROCK_WINDOW_S: 4,           // ...each swing within 4 s of the last
  JAM_ROCK_HEAT: 6, JAM_ROCK_HULL: 2,   // each swing strains the drill (heat + integrity)
  JAM_FIX_S: 3.5,                 // drill fix: hold FREE BIT (slow but free)
  // SURGE: a prompt. OVERCLOCK (fast + better pay, heat spike) vs SHUT DOWN (stop, engine vents). Ignored = blowout
  SURGE_DECIDE_S: 6,
  OVERCLOCK_S: 10, OVERCLOCK_SPEED: 1.4, OVERCLOCK_PAY: 1.5, OVERCLOCK_HEAT: 25, OVERCLOCK_HEAT_MUL: 2,
  SHUTDOWN_S: 4, SHUTDOWN_COOL: 35,
  BLOWOUT_HULL: 15, BLOWOUT_HEAT: 40,   // an ignored surge blows out down the power umbilical: drill integrity + heat
};

// Transition animations. ONE knob: ANIM_SCALE multiplies every beat of the descent/ascent cutscenes
// (tweens, turns, cuts, captions). Base timeline = 4.6 s each, so 2 = ~9.2 s. Human-scale beats on the
// concourse (the airlock lift) and the tap-to-skip grace only scale modestly (square / cube root).
// Playtest override: ?animscale=1.5 (any value 0.25..4).
export const ANIM_SCALE = 2;
export const ANIM_TIMING = {
  BASE_MS: 4600,           // cutscene length at SCALE 1
  BASE_GRACE_MS: 400,      // taps ignored at the start of a cutscene (scaled by ANIM_SCALE^(1/3): 2 -> ~0.5 s)
  BASE_LIFT_MS: 550,       // airlock lift ride rig <-> concourse (scaled by ANIM_SCALE^(1/2): 2 -> ~0.78 s)
};

// World layout (world units = base pixels; the world is one screen wide).
//
// CORMORANT (top-down, FTL style). A remixed survey saucer coupled behind the leased TB-6: the drill's
// collar seats in the recessed THROAT between the two mandibles. Inside, a RING CORRIDOR runs round
// the central HOLD; the DRILL console is forward (behind the conveyor intake), TOOLS and the SIPHON seat
// (by the hose port) on the left, ENGINE/REACTOR aft, a bunk on the right and the HELM out in the cockpit
// pod, reached through a short crawl tube. Holt walks the corridor graph (NAV) between stations.
// The INTERIOR is a separate zoomed schematic: it is laid out at the full concept scale (world 52..137 x
// 236..327) round the same coupling face, and only shows in the inside view (the 70% hull fades out).
//
//            ^^^^^^^^^^^^  TB-6 drill unit (cutterhead at DRILL_TIP_Y .. collar 236)
//        clamp \ [throat] / clamp
//           +--+--DRL--+--+
//        TLS |  |  HOLD  |  |__tube__(HELM)  <- cockpit pod
//        SIP |  |        |  | BUNK
//           +--+--------+--+
//                 ENG
//              (o) (o) (o)   engine arc
export const LAYOUT = {
  SHIP_X: 45, SHIP_W: 90,   // the bore span the rig occupies (tunnel 43..137, vein/pocket brackets on these flanks)
  SHIP_TOP: 236, SHIP_BOTTOM: 298,   // coupling face .. engine bells. [C] Ships are SMALLER than drills: the hull
                                     // is drawn at ~70% (62x62 px) behind the 90 px TB-6, a little tug pushing a big drill
  FACE: { x: 90, y: 236 },  // the ship origin: every Cormorant PNG is drawn round it
  ART: { w: 100, h: 96, ox: 50, oy: 26 },    // assets/ships/cormorant.png + _clamps.png frame: the origin sits at (ox, oy)
  DECK_ART: { w: 100, h: 126, ox: 49, oy: 26 },   // cormorant_deck.png: the interior cutaway, at full concept scale
  DRILL_TIP_Y: 168,        // cutterhead face: obstacles touching this y collide with the drill
  DRILL_W: 70,
  // the separate drill unit above the ship (world y): its collar seats in the ship's throat at 236
  DRILL_UNIT: { x: 45, w: 90, cutterTop: 168, bodyTop: 180, ramsTop: 202, frameTop: 212, hopperTop: 216, hopperBot: 232, collarBot: 236,
    hopperWin: { x: 70, y: 219, w: 40, h: 9 } },
  INTAKE: { x: 85, y: 236, w: 11, h: 6 },   // conveyor intake mouth in the throat (ore pips run collar -> hold)
  SIPHON_PORT: { x: 62, y: 274 },           // hose port on the left flank (reel just inboard)
  ENGINES: [80, 90, 100],                   // bell centres (x); bells end at y 298 (screen 290), the 3 px glow stays above the bottom bar (294)
  ENGINE_Y: 298,
  CAPS: { y: 239, x: [64, 116] },           // nav lights on the mandible tips (red port / green starboard)
  PATH_MIN_X: 62, PATH_MAX_X: 118, // boulder spawn column (in front of drill)
  // stations: room rect (x, y, w, h), the console (st) and where Holt stands at it (stand), which way he faces
  ROOMS: [
    { id: 'helm',   label: 'HELM', name: 'HELM',   x: 125, y: 271, w: 12, h: 14, st: [131, 273], stand: [131, 278], face: 'up',   node: 'tube', bg: '#2a2a40' },
    { id: 'drill',  label: 'DRL',  name: 'DRILL',  x: 75,  y: 243, w: 30, h: 11, st: [92, 245],  stand: [92, 250],  face: 'up',   node: 'f',    bg: '#24303d' },
    { id: 'engine', label: 'ENG',  name: 'ENGINE', x: 70,  y: 300, w: 40, h: 19, st: [90, 316],  stand: [90, 309],  face: 'down', node: 'a',    bg: '#3a2629' },
    { id: 'tools',  label: 'TLS',  name: 'TOOLS',  x: 54,  y: 259, w: 18, h: 17, st: [57, 267],  stand: [63, 267],  face: 'left', node: 'p',    bg: '#283a29' },
    { id: 'siphon', label: 'SIP',  name: 'SIPHON', x: 52,  y: 282, w: 20, h: 15, st: [55, 290],  stand: [61, 290],  face: 'left', node: 'pa',   bg: '#1d3236' },
  ],
  HOLD: { x: 80, y: 261, w: 20, h: 32 },    // central hold (shows the fill level)
  BUNK: { x: 108, y: 284, w: 14, h: 14 },
  // corridor graph: the ring (centre lines x 76/104, y 257/296, 7 px wide) + the crawl tube to the pod
  NAV: {
    nodes: { f: [90, 257], nw: [76, 257], ne: [104, 257], p: [76, 267], pa: [76, 290], sw: [76, 296], a: [90, 296], se: [104, 296],
      s: [104, 278], t0: [108, 278], tube: [124, 278] },
    edges: [['nw', 'f'], ['f', 'ne'], ['nw', 'p'], ['p', 'pa'], ['pa', 'sw'], ['sw', 'a'], ['a', 'se'], ['se', 's'], ['s', 'ne'],
      ['s', 't0'], ['t0', 'tube', 'climb']],   // 'climb' = the crawl tube (CREW_CLIMB_SPEED x climbMul)
    width: 7,
  },
  OUTSIDE_CAM: { x: 90, y: 168, zoom: 1 },  // drill tip at screen 160; the small hull ends at screen 290, above the (taller) bottom bar at 294
  INSIDE_CAM:  { x: 93, y: 291, zoom: 2 },  // integer zoom: world 48..138 x 223..327 between the HUD and the station panel
};

/** Derived room geometry (shared by Ship, Crew, Textures and the UI). Rect: x, w, ceil (top), floorY (bottom). */
export const ROOM_GEOM = LAYOUT.ROOMS.map((r) => ({
  ...r, ceil: r.y, floorY: r.y + r.h, cx: r.x + r.w / 2, cy: r.y + r.h / 2,
  stationX: r.st[0], stationY: r.st[1], standX: r.stand[0], standY: r.stand[1],
  faceLeft: r.face === 'left',
}));

export const STORAGE_KEY = 'drill.bestDepth';

export function loadBest() {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { return 0; }
}
export function saveBest(v) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.floor(v))); } catch { /* private mode */ }
}
