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
  }

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
    const target = Math.min(this.throttle, this.speedCap);
    this.speed = approach(this.speed, target, (target > this.speed ? T.ACCEL : T.DECEL) * dt);

    const advancePx = this.blocked ? 0 : this.speed * T.MAX_SPEED_PX * dt;
    this.distance += advancePx;

    const diff = this.difficulty;
    const heatMul = this.inHard ? T.HARD_HEAT_MULT : 1;
    const wearMul = this.inHard ? T.HARD_WEAR_MULT : 1;
    this.heat += (T.HEAT_RATE * this.speed * this.speed * diff * heatMul - T.HEAT_COOL) * dt;
    this.wear += (advancePx / T.PX_PER_METER) * T.WEAR_PER_METER * diff * wearMul;

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
    this.hull = clamp(this.hull - amount, 0, T.HULL_MAX);
    this.lastDamage += amount;
  }

  /** Station work, called every frame while the player holds the action. */
  work(action, dt) {
    if (action === 'vent') this.heat = clamp(this.heat - T.VENT_RATE * dt, 0, T.HEAT_MAX);
    else if (action === 'repair') this.wear = clamp(this.wear - T.REPAIR_RATE * dt, 0, T.WEAR_MAX);
    else if (action === 'patch') this.hull = clamp(this.hull + T.PATCH_RATE * dt, 0, T.HULL_MAX);
  }

  _nextSpike() {
    const [a, b] = T.SPIKE_INTERVAL;
    return (a + Math.random() * (b - a)) / Math.sqrt(this.difficulty || 1);
  }
}
