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

  // --- Crew / views -------------------------------------------------------
  CREW_SPEED: 40,          // world px / s walking speed (one room over ~0.65 s)
  START_ROOM: 'helm',      // where the crew member stands when a run starts
  PILOT_REQUIRED: true,    // throttle only responds while the crew is at the HELM
  LOCK_TOAST_COOLDOWN: 900,// ms between "NO PILOT" toasts when tapping a locked throttle
  VIEW_PAN_MS: 650,        // camera transition time
};

// World layout (world units = base pixels; the world is one screen wide).
export const LAYOUT = {
  SHIP_X: 34, SHIP_W: 112, SHIP_TOP: 248, SHIP_BOTTOM: 302,
  DRILL_TIP_Y: 226,        // obstacles touching this y collide with the drill
  DRILL_W: 80,
  FLOOR_Y: 296,
  CEIL_Y: 252,
  PATH_MIN_X: 56, PATH_MAX_X: 124, // boulder spawn column (in front of drill)
  // Four rooms, left to right. HELM sits between ENGINE and DRILL so the most
  // common trips (helm <-> engine, helm <-> drill) are a single room apart.
  ROOMS: [
    { id: 'engine', label: 'ENG',  name: 'ENGINE', x: 37,  w: 25, bg: '#3a2629' },
    { id: 'helm',   label: 'HELM', name: 'HELM',   x: 64,  w: 25, bg: '#2a2a40' },
    { id: 'drill',  label: 'DRL',  name: 'DRILL',  x: 91,  w: 25, bg: '#24303d' },
    { id: 'tools',  label: 'TLS',  name: 'TOOLS',  x: 118, w: 25, bg: '#283a29' },
  ],
  OUTSIDE_CAM: { x: 90, y: 160, zoom: 1 },
  INSIDE_CAM:  { x: 90, y: 256, zoom: 1.5 }, // 1.5x fits the 112px-wide ship on screen
};

export const STORAGE_KEY = 'drill.bestDepth';

export function loadBest() {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { return 0; }
}
export function saveBest(v) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.floor(v))); } catch { /* private mode */ }
}
