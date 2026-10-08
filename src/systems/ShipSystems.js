// Pure gameplay numbers: speed, depth, heat, bit wear, hull. No rendering.
import { TUNING as T } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class ShipSystems {
  constructor() {
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
    // Run modifiers from relay supplies (multiplicative unless noted).
    this.mods = { heatMul: 1, wearMul: 1, ventMul: 1, repairMul: 1, patchMul: 1, blastTimeMul: 1,
      warnMul: 1, crewSpeedMul: 1, ramMul: 1, maxHullBonus: 0, spareBits: 0 };
  }

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
    if (this.overheated) c = Math.min(c, T.OVERHEAT_SPEED_CAP);
    if (this.worn) c = Math.min(c, T.WORN_SPEED_CAP);
    if (this.inHard) c = Math.min(c, T.HARD_SPEED_CAP);
    return c;
  }

  setThrottle(v) { this.throttle = clamp(Math.round(v * 10) / 10, 0, 1); }

  /** Advances the simulation. Returns { advancePx, events[] }. */
  update(dt) {
    const events = [];
    if (this.anchored) return { advancePx: 0, events };
    const target = Math.min(this.throttle, this.speedCap);
    this.speed = approach(this.speed, target, (target > this.speed ? T.ACCEL : T.DECEL) * dt);

    let advancePx = this.blocked ? 0 : this.speed * T.MAX_SPEED_PX * dt;
    // never overshoot the next relay anchor
    const relayPx = this.nextRelayAt * T.PX_PER_METER;
    if (this.distance + advancePx >= relayPx) { advancePx = Math.max(0, relayPx - this.distance); events.push('relay'); }
    this.distance += advancePx;
    this.haul += (advancePx / T.PX_PER_METER) * T.PAY_PER_METER * this.payMult;

    const diff = this.difficulty;
    const heatMul = this.inHard ? T.HARD_HEAT_MULT : 1;
    const wearMul = this.inHard ? T.HARD_WEAR_MULT : 1;
    this.heat += (T.HEAT_RATE * this.speed * this.speed * diff * heatMul * this.mods.heatMul - T.HEAT_COOL) * dt;
    this.wear += (advancePx / T.PX_PER_METER) * T.WEAR_PER_METER * diff * wearMul * this.mods.wearMul;
    if (this.wear >= T.WEAR_MAX && this.mods.spareBits > 0) { this.wear = 0; this.mods.spareBits -= 1; events.push('sparebit'); }

    // Random coolant leaks: time-based pressure so crawling isn't free.
    if (this.depth > T.SPIKE_START_DEPTH) {
      this.spikeTimer -= dt;
      if (this.spikeTimer <= 0) {
        this.heat += T.SPIKE_AMOUNT;
        this.spikeTimer = this._nextSpike();
        events.push('spike');
      }
    }

    let dmg = 0;
    if (this.overheated) dmg += T.OVERHEAT_DAMAGE;
    if (this.worn && this.speed > 0.05) dmg += T.WORN_DAMAGE;
    this.damage(dmg * dt);

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
    if (action === 'vent') this.heat = clamp(this.heat - T.VENT_RATE * this.mods.ventMul * dt, 0, T.HEAT_MAX);
    else if (action === 'repair') this.wear = clamp(this.wear - T.REPAIR_RATE * this.mods.repairMul * dt, 0, T.WEAR_MAX);
    else if (action === 'patch') this.hull = clamp(this.hull + T.PATCH_RATE * this.mods.patchMul * dt, 0, this.maxHull);
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
  anchor() { this.relayThrottle = this.throttle; this.anchored = true; this.speed = 0; this.throttle = 0; this.heat = 0; this.wear = 0; this.blocked = false; }
  // Undock: the throttle goes back to its pre-relay setting (wherever the crew is);
  // actual speed ramps up from 0 with the normal ACCEL in update().
  pushOn() { this.relays += 1; this.anchored = false; this.throttle = this.relayThrottle ?? 0; this.speed = 0; }

  _nextSpike() {
    const [a, b] = T.SPIKE_INTERVAL;
    return (a + Math.random() * (b - a)) / Math.sqrt(this.difficulty || 1);
  }
}
