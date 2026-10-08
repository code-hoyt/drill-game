// Run events ([P]): problems that ask for a decision, not just a hold.
//   FIRE  : starts in ENG / DRL / TLS, disables that room's station and chips the hull; left alone it
//           spreads to a neighbouring room. Holt holds EXTINGUISH in the room. (Where do you spend Holt?)
//   JAM   : the bit seizes. Fast fix at the HELM: rock the throttle 0% -> 60%+ three times (each swing
//           strains: heat + a hull chip). Slow, free fix at DRL: hold FREE THE BIT.
//   SURGE : (from relay leg 2) a prompt: OVERCLOCK (faster + pay x1.5 for 10 s, heat spike, hotter) or
//           SHUT DOWN (engine off 4 s, it vents heat). Ignore it and it blows out (hull + heat).
// Time-based, so they keep coming while you're stopped at a vein. More often each relay leg.
import { TUNING as T, EVENTS as E } from '../config.js';

export const NEIGHBOURS = { helm: ['drill', 'engine'], drill: ['helm', 'tools'], engine: ['helm', 'tools'], tools: ['drill', 'engine'] };
const SHORT = { helm: 'HELM', drill: 'DRL', engine: 'ENG', tools: 'TLS' };

export class EventDirector {
  constructor(scene) {
    this.scene = scene;
    this.s = scene.state;
    this.enabled = true;
    this.fires = {};            // roomId -> { t: seconds burning, spreadT, put: seconds of extinguishing }
    this.jam = null;            // { rocks, last, low, fixT }
    this.surge = null;          // { t: seconds left to decide }
    this.leg2Forced = false;
    this.log = [];              // { type, depth, leg }
    this.timer = this.gap();
    this.flames = {};           // room -> [sprites]
    this.overlays = {};
    // smoke out of the hull while anything burns (readable from the outside view too)
    this.smoke = scene.add.particles(0, 0, 'px2', {
      x: { min: -14, max: 14 }, speedY: { min: -30, max: -12 }, speedX: { min: -6, max: 6 }, lifespan: 900,
      alpha: { start: 0.7, end: 0 }, scale: { start: 1, end: 2.5 }, tint: [0x5a5060, 0x8a7f8f, 0xff6a3a], frequency: 60, emitting: false,
    }).setDepth(30).setPosition(90, scene.ship.room('helm').ceil);
  }

  get leg() { return this.s.relays; }
  gap() { const [a, b] = E.GAP_S[Math.min(this.s.relays, E.GAP_S.length - 1)]; return a + Math.random() * (b - a); }
  get burning() { return Object.keys(this.fires); }
  activeTypes() { const t = []; if (this.burning.length) t.push('fire'); if (this.jam) t.push('jam'); if (this.surge) t.push('surge'); return t; }

  update(dt) {
    const s = this.s, g = this.scene;
    if (s.anchored || g.over) return;
    // fires burn, chip the hull, and spread if left alone
    for (const [room, f] of Object.entries(this.fires)) {
      f.t += dt; f.spreadT -= dt;
      s.damage(E.FIRE_HULL_DPS * dt);
      if (f.spreadT <= 0) {
        f.spreadT = E.FIRE_SPREAD_S;
        const free = NEIGHBOURS[room].filter((r) => !this.fires[r]);
        if (free.length) { const r = free[Math.floor(Math.random() * free.length)]; this.startFire(r, true); }
      }
    }
    this.animateFlames();
    if (this.surge && (this.surge.t -= dt) <= 0) this.resolveSurge('timeout');
    // scheduler
    if (!this.enabled || s.depth < E.START_DEPTH || g.inRelayWindow(s.depth, 10)) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.gap();
    const active = this.activeTypes();
    if (active.length >= E.MAX_ACTIVE) return;
    let type;
    if (this.leg >= 1 && !this.leg2Forced && !active.includes(E.LEG2_FIRST)) { type = E.LEG2_FIRST; this.leg2Forced = true; }
    else {
      const pool = E.POOL[Math.min(this.leg, E.POOL.length - 1)].filter((t) => !active.includes(t) || t === 'fire');
      if (!pool.length) return;
      type = pool[Math.floor(Math.random() * pool.length)];
    }
    this.trigger(type);
  }

  /** Start an event now (also the ?event= test shortcut). fire may name a room: 'fire:engine'. */
  trigger(type, arg) {
    const s = this.s, g = this.scene;
    if (type === 'fire') {
      const free = ['engine', 'drill', 'tools'].filter((r) => !this.fires[r]);
      const room = arg || free[Math.floor(Math.random() * free.length)];
      if (!room) return false;
      if (this.fires[room]) return false;
      this.startFire(room, false);
    } else if (type === 'jam') {
      if (this.jam) return false;
      s.jammed = true;
      this.jam = { rocks: 0, last: -99, low: s.throttle <= E.JAM_ROCK_LOW, fixT: 0 };
      g.ship.drill.setTint(0xff8a8a);
      g.cameras.main.shake(250, 0.01);
      g.toast('DRILL JAMMED! ROCK THROTTLE OR FIX AT DRL', 0xff8a5c);
    } else if (type === 'surge') {
      if (this.surge) return false;
      this.surge = { t: E.SURGE_DECIDE_S };
      g.cameras.main.flash(150, 200, 120, 255);
      g.toast('POWER SURGE! OVERCLOCK OR SHUT DOWN?', 0xe08aff);
    } else return false;
    this.log.push({ type, depth: Math.round(s.depth), leg: this.leg });
    return true;
  }

  // ---- fire ----------------------------------------------------------------------------------------
  startFire(room, spread) {
    this.fires[room] = { t: 0, spreadT: E.FIRE_SPREAD_S, put: 0 };
    const r = this.scene.ship.room(room);
    const ov = this.scene.add.rectangle(r.x, r.ceil, r.w, r.floorY - r.ceil, 0xff5a1a, 0.22).setOrigin(0).setDepth(12.4);
    const fl = [0, 1, 2].map((i) => this.scene.add.image(r.x + 6 + i * 10, r.floorY, 'flame' + (i % 2)).setOrigin(0.5, 1).setDepth(12.6));
    this.overlays[room] = ov; this.flames[room] = fl;
    this.scene.toast(spread ? `FIRE SPREAD TO ${SHORT[room]}!` : `FIRE IN ${SHORT[room]}! STATION DOWN`, 0xff6a3a);
    if (room === 'helm') this.scene.toast('HELM ON FIRE: THROTTLE DEAD', 0xff6a3a);
  }
  putOutTime(room) { const f = this.fires[room]; return Math.min(E.FIRE_PUTOUT_MAX, E.FIRE_PUTOUT_S + E.FIRE_GROW_S * (f ? f.t : 0)); }
  /** Holt holding EXTINGUISH in a burning room. */
  extinguish(room, dt) {
    const f = this.fires[room];
    if (!f) return;
    f.put += dt;
    if (f.put >= this.putOutTime(room)) {
      delete this.fires[room];
      this.overlays[room].destroy(); this.flames[room].forEach((o) => o.destroy());
      delete this.overlays[room]; delete this.flames[room];
      this.scene.toast(`FIRE OUT IN ${SHORT[room]}`, 0x8affa0);
    }
  }
  animateFlames() {
    const t = this.scene.time.now;
    this.smoke.emitting = this.burning.length > 0;
    for (const [room, fl] of Object.entries(this.flames)) fl.forEach((o, i) => { o.setTexture('flame' + ((Math.floor(t / 140) + i) % 2)); o.setScale(1, 0.9 + 0.2 * Math.sin(t / 90 + i)); });
  }

  // ---- jam -----------------------------------------------------------------------------------------
  /** Called after every accepted throttle change: swings 0% -> 60%+ rock the seized bit. */
  onThrottle(v) {
    const j = this.jam;
    if (!j) return;
    if (v <= E.JAM_ROCK_LOW + 1e-6) { j.low = true; return; }
    if (v >= E.JAM_ROCK_HIGH - 1e-6 && j.low) {
      const now = this.scene.time.now / 1000;
      if (now - j.last > E.JAM_ROCK_WINDOW_S) j.rocks = 0;
      j.rocks += 1; j.last = now; j.low = false;
      this.s.heat = Math.min(T.HEAT_MAX, this.s.heat + E.JAM_ROCK_HEAT);
      this.s.damage(E.JAM_ROCK_HULL);
      this.scene.cameras.main.shake(140, 0.008);
      if (j.rocks >= E.JAM_ROCKS) this.freeBit('ROCKED FREE');
      else this.scene.toast(`ROCKING THE BIT ${j.rocks}/${E.JAM_ROCKS}`, 0xffc35c);
    }
  }
  /** Holt holding FREE THE BIT at the drill. */
  fixJam(dt) { if (!this.jam) return; this.jam.fixT += dt; if (this.jam.fixT >= E.JAM_FIX_S) this.freeBit('FREED AT DRL'); }
  freeBit(how) {
    this.jam = null; this.s.jammed = false;
    this.scene.ship.drill.clearTint();
    this.scene.toast(`BIT ${how}`, 0x8affa0);
  }

  // ---- surge ---------------------------------------------------------------------------------------
  resolveSurge(choice) {
    if (!this.surge) return false;
    const s = this.s, g = this.scene;
    this.surge = null;
    if (choice === 'overclock') {
      s.overclockT = E.OVERCLOCK_S; s.heat = Math.min(T.HEAT_MAX, s.heat + E.OVERCLOCK_HEAT);
      g.toast(`OVERCLOCKED ${E.OVERCLOCK_S}S: FAST, PAY X${E.OVERCLOCK_PAY}`, 0xe08aff);
    } else if (choice === 'shutdown') {
      s.shutdownT = E.SHUTDOWN_S; s.heat = Math.max(0, s.heat - E.SHUTDOWN_COOL);
      g.toast(`ENGINE SHUT DOWN ${E.SHUTDOWN_S}S: COOLING`, 0x7fe0ff);
    } else {
      s.damage(E.BLOWOUT_HULL); s.heat = Math.min(T.HEAT_MAX, s.heat + E.BLOWOUT_HEAT);
      g.cameras.main.shake(300, 0.015); g.cameras.main.flash(200, 255, 80, 200);
      g.toast(`SURGE BLOWOUT! -${E.BLOWOUT_HULL} HULL`, 0xff4a4a);
    }
    this.lastSurge = choice;
    return true;
  }

  /** Relay crews service the rig: fires out, bit freed, surge cleared. */
  clearAll() {
    for (const room of this.burning) { this.overlays[room].destroy(); this.flames[room].forEach((o) => o.destroy()); }
    this.fires = {}; this.overlays = {}; this.flames = {};
    if (this.jam) { this.jam = null; this.s.jammed = false; this.scene.ship.drill.clearTint(); }
    this.surge = null;
    this.timer = this.gap();
  }
}
