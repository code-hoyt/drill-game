// Pure gameplay numbers: speed, depth, heat, bit wear, hull. No rendering.
import { CALM, SIPHON, TUNING as T, EVENTS as E } from '../config.js';
import { applyParts } from '../data/parts.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class ShipSystems {
  constructor(loadout = null) {
    this.throttle = T.START_THROTTLE; // what the player asked for (0..1)
    this.speed = 0;                   // actual speed (0..1), eases toward throttle
    this.distance = 0;                // px drilled
    this.heat = 0;
    this.wear = 0;
    this.hull = T.HULL_MAX;
    this.inHard = false;              // drill tip inside a hard rock band
    this.blocked = false;             // grinding a boulder (no forward progress)
    this.spikeTimer = this._nextSpike();
    this.lastDamage = 0;              // hull lost this frame (for FX)
    // --- M1: earnings + relays ---
    this.haul = 0;                    // credits earned this run (spent on relay repairs)
    this.relays = 0;                  // relays passed (pushed on from)
    this.anchored = false;            // clamped in at a relay: simulation paused
    this.boosts = [];                 // ids of relay supplies picked this run
    // --- ore + events ---
    this.drillPay = 0;                // credits earned by metres drilled (haul = drillPay + ore + scrap - repairs)
    this.ore = 0;                     // credits from ore veins (net of collapse losses)
    this.scrap = 0;                   // scrap from veins that were overshot / drilled through
    this.veinsWorked = 0; this.veinsLost = 0; this.veinsCollapsed = 0;
    this.jammed = false;              // drill jam event: no progress, the engine strains
    this.shutdownT = 0;               // power surge SHUT DOWN: seconds left with the engine off
    this.overclockT = 0;              // power surge OVERCLOCK: seconds left boosted
    // --- siphon: liquid in the tank (litres + what it sells for), sold at the next relay ---
    this.tank = 0; this.tankCr = 0;
    this.liquid = 0;                  // credits from liquid sold this run (part of the haul)
    this.pocketsTapped = 0; this.pocketsMissed = 0; this.bursts = 0;
    // Run modifiers: loadout parts (applied once, here) + relay supplies (stacked at relays).
    // Multipliers multiply; maxHullBonus/spareBits add; the rest are flags/overrides.
    this.mods = { heatMul: 1, wearMul: 1, ventMul: 1, repairMul: 1, patchMul: 1, blastTimeMul: 1,
      warnMul: 1, crewSpeedMul: 1, ramMul: 1, maxHullBonus: 0, spareBits: 0,
      // parts (M2)
      maxSpeedMul: 1, accelMul: 1, decelMul: 1, coolMul: 1, spikeMul: 1, grindWearMul: 1, workMul: 1,
      walkMul: 1, climbMul: 1, overheatDmgMul: 1, overheatCap: null, ramSafe: null, blastAll: false,
      noBlast: false, blastHeat: 0, governor: false, pilotRooms: null,
      // siphon (side pockets)
      tankMul: 1, pumpMul: 1, pressMul: 1 };
    if (loadout) applyParts(this.mods, loadout);
    this.loadout = loadout;
    this.hull = this.maxHull;
  }

  /** Actual speed as a fraction of the *stock* top speed (parts change top speed). */
  get realSpeed() { return this.speed * this.mods.maxSpeedMul * this.boostMul; }
  /** Full stop (actual speed 0, not clamped at a relay): the safe, calm state. */
  get calm() { return !this.anchored && this.speed <= 1e-6; }
  get tankCap() { return SIPHON.TANK * this.mods.tankMul; }
  get tankFull() { return this.tank >= this.tankCap - 1e-6; }
  /** Sell the tank into the haul (relay arrival, or counted into the haul on hull loss). Returns credits. */
  sellTank() { const cr = this.tankCr; this.haul += cr; this.liquid += cr; this.tank = 0; this.tankCr = 0; return cr; }
  get boostMul() { return this.overclockT > 0 ? E.OVERCLOCK_SPEED : 1; }
  /** Highest throttle setting that grinds boulders instead of ramming them. */
  get safeThrottle() { return Math.min(1, (this.mods.ramSafe ?? T.RAM_SAFE_SPEED) / this.mods.maxSpeedMul); }
  get ramming() { return this.speed > this.safeThrottle + 1e-6; }

  get maxHull() { return T.HULL_MAX + this.mods.maxHullBonus; }
  get payMult() { return 1 + T.PAY_MULT_STEP * this.relays; }
  get nextRelayAt() { return T.RELAY_INTERVAL * (this.relays + 1); }

  get depth() { return this.distance / T.PX_PER_METER; }
  get difficulty() { return 1 + this.depth / T.DIFF_DEPTH; }
  get overheated() { return this.heat >= T.HEAT_MAX; }
  get worn() { return this.wear >= T.WEAR_MAX; }
  get dead() { return this.hull <= 0; }

  get speedCap() {
    let c = 1;
    if (this.overheated) c = Math.min(c, this.mods.overheatCap ?? T.OVERHEAT_SPEED_CAP);
    if (this.worn) c = Math.min(c, T.WORN_SPEED_CAP);
    if (this.inHard) c = Math.min(c, T.HARD_SPEED_CAP);
    if (this.jammed || this.shutdownT > 0) c = 0;
    return c;
  }

  setThrottle(v) { this.throttle = clamp(Math.round(v * 10) / 10, 0, 1); }

  /** Advances the simulation. Returns { advancePx, events[] }. */
  update(dt) {
    const events = [];
    if (this.anchored) return { advancePx: 0, events };
    const target = Math.min(this.throttle, this.speedCap);
    this.speed = approach(this.speed, target, (target > this.speed ? T.ACCEL * this.mods.accelMul : T.DECEL * this.mods.decelMul) * dt);

    let advancePx = this.blocked ? 0 : this.speed * T.MAX_SPEED_PX * this.mods.maxSpeedMul * this.boostMul * dt;
    // never overshoot the next relay anchor
    const relayPx = this.nextRelayAt * T.PX_PER_METER;
    if (this.distance + advancePx >= relayPx) { advancePx = Math.max(0, relayPx - this.distance); events.push('relay'); }
    this.distance += advancePx;
    const pay = (advancePx / T.PX_PER_METER) * T.PAY_PER_METER * this.payMult * (this.overclockT > 0 ? E.OVERCLOCK_PAY : 1);
    this.haul += pay; this.drillPay += pay;
    if (this.overclockT > 0 && (this.overclockT -= dt) <= 0) { this.overclockT = 0; events.push('overclockEnd'); }
    if (this.shutdownT > 0 && (this.shutdownT -= dt) <= 0) { this.shutdownT = 0; events.push('restart'); }

    const diff = this.difficulty;
    const heatMul = this.inHard ? T.HARD_HEAT_MULT : 1;
    const wearMul = this.inHard ? T.HARD_WEAR_MULT : 1;
    // heat follows the *real* speed, so a faster bit runs hotter at full throttle
    const rs = this.realSpeed;
    const ocHeat = this.overclockT > 0 ? E.OVERCLOCK_HEAT_MUL : 1;
    this.heat += (T.HEAT_RATE * rs * rs * diff * heatMul * this.mods.heatMul * ocHeat - T.HEAT_COOL * this.mods.coolMul) * dt;
    const calm = this.calm;
    if (calm) this.heat -= CALM.COOL * dt;                            // full stop: the engine bleeds heat fast
    else if (this.jammed) this.heat += E.JAM_HEAT * this.throttle * dt;   // straining against a seizing bit (until it stalls)
    this.wear += (advancePx / T.PX_PER_METER) * T.WEAR_PER_METER * diff * wearMul * this.mods.wearMul;
    if (this.wear >= T.WEAR_MAX && this.mods.spareBits > 0) { this.wear = 0; this.mods.spareBits -= 1; events.push('sparebit'); }

    // Random coolant leaks: time-based pressure so crawling isn't free.
    if (this.depth > T.SPIKE_START_DEPTH && !calm) {   // (the leak timer pauses at a full stop)
      this.spikeTimer -= dt;
      if (this.spikeTimer <= 0) {
        this.heat += T.SPIKE_AMOUNT * this.mods.spikeMul;
        this.spikeTimer = this._nextSpike();
        events.push('spike');
      }
    }

    let dmg = 0;
    if (this.overheated) dmg += T.OVERHEAT_DAMAGE * this.mods.overheatDmgMul;
    if (this.worn && this.speed > 0.05) dmg += T.WORN_DAMAGE;
    if (!calm) this.damage(dmg * dt);   // nothing ticks the hull at a full stop

    this.heat = clamp(this.heat, 0, T.HEAT_MAX);
    this.wear = clamp(this.wear, 0, T.WEAR_MAX);
    return { advancePx, events };
  }

  damage(amount) {
    if (amount <= 0) return;
    this.hull = clamp(this.hull - amount, 0, this.maxHull);
    this.lastDamage += amount;
  }

  /** Station work, called every frame while the player holds the action. */
  work(action, dt) {
    const w = this.mods.workMul;
    if (action === 'vent') this.heat = clamp(this.heat - T.VENT_RATE * this.mods.ventMul * w * dt, 0, T.HEAT_MAX);
    else if (action === 'repair') this.wear = clamp(this.wear - T.REPAIR_RATE * this.mods.repairMul * w * dt, 0, T.WEAR_MAX);
    else if (action === 'patch') this.hull = clamp(this.hull + T.PATCH_RATE * this.mods.patchMul * w * dt, 0, this.maxHull);
  }

  // ---- relays ---------------------------------------------------------------
  /** Credits per hull point at the current relay (relay n = relays + 1). */
  get repairCostPerPoint() { return T.REPAIR_COST_BASE * Math.pow(T.REPAIR_COST_GROWTH, this.relays); }
  /** Buy up to `points` hull, limited by missing hull and haul. Returns {points, cost}. */
  buyRepair(points) {
    const per = this.repairCostPerPoint;
    const missing = this.maxHull - this.hull;
    const affordable = Math.floor(this.haul / per);
    const n = Math.max(0, Math.min(points, Math.ceil(missing), affordable));
    if (n <= 0) return { points: 0, cost: 0 };
    const cost = n * per;
    this.haul -= cost;
    this.hull = clamp(this.hull + n, 0, this.maxHull);
    return { points: n, cost };
  }
  // Clamp in: remember the throttle setting, stop dead, free heat + bit service.
  anchor() { this.jammed = false; this.shutdownT = 0; this.overclockT = 0; this.relayThrottle = this.throttle; this.anchored = true; this.speed = 0; this.throttle = 0; this.heat = 0; this.wear = 0; this.blocked = false; }
  // Undock: the throttle goes back to its pre-relay setting (wherever the crew is);
  // actual speed ramps up from 0 with the normal ACCEL in update().
  pushOn() { this.relays += 1; this.anchored = false; this.throttle = this.relayThrottle ?? 0; this.speed = 0; }

  _nextSpike() {
    const [a, b] = T.SPIKE_INTERVAL;
    return (a + Math.random() * (b - a)) / Math.sqrt(this.difficulty || 1);
  }
}
