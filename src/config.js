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
  HEAT_RATE: 7,            // heat/s at full speed (scales with speed^2 * difficulty)
  HEAT_COOL: 1.2,          // passive cooling / s
  HEAT_ALERT: 70,          // alert icon threshold
  VENT_RATE: 35,           // heat removed / s while venting
  OVERHEAT_DAMAGE: 4,      // hull / s while heat is maxed
  OVERHEAT_SPEED_CAP: 0.4, // engine limps while overheated
  SPIKE_START_DEPTH: 60,   // m before random coolant-leak heat spikes begin
  SPIKE_INTERVAL: [25, 45],// s between spikes (shrinks with difficulty)
  SPIKE_AMOUNT: 22,        // heat added by a spike

  // --- Drill bit wear (Drill station) ------------------------------------
  WEAR_MAX: 100,
  WEAR_PER_METER: 0.15,    // wear per metre drilled (x difficulty)
  WEAR_ALERT: 70,
  REPAIR_RATE: 30,         // wear removed / s while repairing
  WORN_DAMAGE: 3,          // hull / s while bit is fully worn and moving
  WORN_SPEED_CAP: 0.5,

  // --- Hull (Tools station) ----------------------------------------------
  HULL_MAX: 100,
  HULL_ALERT: 35,
  PATCH_RATE: 9,           // hull restored / s while patching

  // --- Obstacles ----------------------------------------------------------
  RAM_SAFE_SPEED: 0.35,    // at/below this speed the drill grinds boulders safely
  RAM_DAMAGE_BASE: 8,      // hull damage for ramming = (BASE + SPEED*speed) * sizeMult
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
  CASHOUT_BONUS: 0.10,     // cash out at a relay: keep haul + 10%
  HULL_LOSS_KEEP: 1 / 3,   // hull loss: escape pod keeps 1/3 of the haul
  REPAIR_COST_BASE: 4,     // credits per hull point at relay 1
  REPAIR_COST_GROWTH: 1.5, // x per relay after the first (4, 6, 9, 13.5, ...)
  REPAIR_STEP: 10,         // hull points per "+10" repair tap
  BOOST_CHOICES: 3,        // relay supplies offered per relay (distinct, random)

  // --- Crew / views -------------------------------------------------------
  // Same-deck trip: 32 px straight across the deck (over the ladder grate) = 32/48 = ~0.67 s.
  // Cross-deck trip: 16 px to the ladder + 28 px direct climb + 16 px out = 32/48 + 28/70 = ~1.07 s.
  CREW_WALK_SPEED: 48,     // world px / s on deck floors
  CREW_CLIMB_SPEED: 70,    // world px / s on the hub ladder
  START_ROOM: 'helm',      // where the crew member stands when a run starts
  PILOT_REQUIRED: true,    // throttle only responds while the crew is at the HELM
  LOCK_TOAST_COOLDOWN: 900,// ms between "NO PILOT" toasts when tapping a locked throttle
  VIEW_PAN_MS: 650,        // camera transition time
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
// The ship is a 2-deck, 2x2 grid of rooms around a central hub column with a
// ladder. Same-deck trips walk straight across the deck (a grate covers the
// ladder shaft on the top deck); cross-deck trips walk to the ladder, climb
// directly floor-to-floor, then walk out.
//
//          /\  drill nose
//   +------+--+------+
//   | HELM |  | DRL  |   top deck   (nearest the drill)
//   |------|==|------|   == = grate over the ladder shaft, ## = ladder
//   | ENG  |##| TLS  |   bottom deck
//   +------+--+------+
export const LAYOUT = {
  SHIP_X: 47, SHIP_W: 86, SHIP_TOP: 240, SHIP_BOTTOM: 302,
  DRILL_TIP_Y: 218,        // obstacles touching this y collide with the drill
  DRILL_W: 70,
  DECKS: {
    top:    { ceil: 242, floor: 268 },
    bottom: { ceil: 271, floor: 296 },
  },
  ROOM_W: 33,              // each room; rooms are separated from the hub by 2px walls
  HUB: { x: 84, w: 12, cx: 90 }, // ladder shaft column (ladder at cx)
  STAND_OFFSET: 16,        // horizontal distance hub centre -> every crew stand spot
  PATH_MIN_X: 62, PATH_MAX_X: 118, // boulder spawn column (in front of drill)
  ROOMS: [
    { id: 'helm',   label: 'HELM', name: 'HELM',   deck: 'top',    side: 'left',  bg: '#2a2a40' },
    { id: 'drill',  label: 'DRL',  name: 'DRILL',  deck: 'top',    side: 'right', bg: '#24303d' },
    { id: 'engine', label: 'ENG',  name: 'ENGINE', deck: 'bottom', side: 'left',  bg: '#3a2629' },
    { id: 'tools',  label: 'TLS',  name: 'TOOLS',  deck: 'bottom', side: 'right', bg: '#283a29' },
  ],
  OUTSIDE_CAM: { x: 90, y: 160, zoom: 1 },
  INSIDE_CAM:  { x: 90, y: 267, zoom: 2 },  // integer zoom: the 86px-wide ship fills 172 of 180px
};

/** Derived room geometry (shared by Ship, Crew and Textures). */
export const ROOM_GEOM = LAYOUT.ROOMS.map((r) => {
  const d = LAYOUT.DECKS[r.deck];
  const left = r.side === 'left';
  const x = left ? LAYOUT.HUB.x - 2 - LAYOUT.ROOM_W : LAYOUT.HUB.x + LAYOUT.HUB.w + 2;
  const w = LAYOUT.ROOM_W;
  return {
    ...r, x, w, ceil: d.ceil, floorY: d.floor, cx: x + w / 2,
    stationX: left ? x + 14 : x + w - 14,
    standX: LAYOUT.HUB.cx + (left ? -1 : 1) * LAYOUT.STAND_OFFSET,
    faceLeft: left, // the station is on the outer side of the room
  };
});

export const STORAGE_KEY = 'drill.bestDepth';

export function loadBest() {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { return 0; }
}
export function saveBest(v) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.floor(v))); } catch { /* private mode */ }
}
