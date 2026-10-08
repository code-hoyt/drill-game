// Ore veins ([C] Cletus's idea): seams of ore ahead in the rock. Bring the rig to a FULL STOP with the
// drill face at the vein (the stop window), then Holt works it from the DRILL station (hold EXTRACT).
// Extraction pays ore credits into the haul but raises the vein's instability; at 100 it collapses
// (hull damage + half of what you took from it is lost). Overshoot or drill through it: VEIN LOST (scrap).
import { TUNING as T, LAYOUT as L, ORE } from '../config.js';
import { FONT_KEY } from './PixelFont.js';

const PPM = T.PX_PER_METER, TIP = L.DRILL_TIP_Y;
let nextId = 1;

export class Veins {
  constructor(scene, sys) {
    this.scene = scene;
    this.sys = sys;
    this.list = [];
    this.enabled = true;
    this.nextAt = ORE.START_DEPTH - (TIP - ORE.SPAWN_Y) / PPM;   // first one arrives at START_DEPTH
    this.spawnFilter = null;    // (arrivalDepthM) => bool
    this.log = [];              // { type, arrival } (debug/tests)
    this.zone = scene.add.graphics().setDepth(2.8);     // stop window brackets at the drill tip
    this.meters = scene.add.graphics().setDepth(2.9);
    this.label = scene.add.bitmapText(4, 0, FONT_KEY, '', 6).setDepth(2.95).setVisible(false);
    this.glint = scene.add.particles(0, 0, 'px', {
      speed: { min: 2, max: 8 }, lifespan: 500, alpha: { start: 1, end: 0 }, frequency: -1, tint: 0xffffff,
    }).setDepth(2.7);
    this.dust = scene.add.particles(0, 0, 'px2', {
      speed: { min: 20, max: 80 }, angle: { min: 0, max: 360 }, lifespan: 700, gravityY: 80, emitting: false,
      tint: [0x8a7f8f, 0x5e5363, 0xffd23f],
    }).setDepth(26);
  }

  /** Metres from the drill tip to the vein's centre line (+ ahead, - past). */
  dist(v) { return (TIP - v.y) / PPM; }
  inWindow(v) { const d = this.dist(v); return d <= ORE.WINDOW_AHEAD && d >= -ORE.WINDOW_PAST; }
  /** The vein that matters now: the nearest one not yet finished. */
  get current() { return this.list.filter((v) => ['ahead', 'window', 'stopped'].includes(v.state)).sort((a, b) => b.y - a.y)[0] || null; }
  get stopped() { const v = this.current; return v && v.state === 'stopped' ? v : null; }
  /** Is any vein (pending) arriving within m metres of this depth? */
  near(arrivalM, m) { const d = this.sys.depth; return this.list.some((v) => v.state !== 'gone' && Math.abs(d + this.dist(v) - arrivalM) < m); }

  pickType() {
    const w = ORE.WEIGHTS[Math.min(this.sys.relays, ORE.WEIGHTS.length - 1)];
    let r = Math.random();
    for (const [k, p] of Object.entries(w)) { if ((r -= p) <= 0) return k; }
    return 'small';
  }

  /** Spawn a vein (type random if omitted) at screen y (default: above the screen). */
  spawn(type = this.pickType(), y = ORE.SPAWN_Y) {
    const def = ORE.TYPES[type];
    const sprite = this.scene.add.image(90, y, 'vein_' + type).setDepth(2);
    const v = { id: nextId++, type, def, sprite, y, state: 'ahead', taken: 0, credits: 0, inst: 0,
      value: def.value * this.sys.payMult, alerted: false };
    this.list.push(v);
    this.log.push({ type, arrival: Math.round(this.sys.depth + this.dist(v)) });
    return v;
  }

  clear() { for (const v of this.list) v.sprite.destroy(); this.list = []; }

  /**
   * Advance veins with the world. extracting: Holt is holding EXTRACT at the drill (already validated).
   * Returns events: { kind: 'appear'|'window'|'stopped'|'moving'|'tremor'|'emptied'|'collapse'|'left'|'lost', v, ... }
   */
  update(dt, advancePx, extracting, time) {
    const s = this.sys, out = [];
    if (this.enabled && s.depth >= this.nextAt) {
      const arrival = s.depth + (TIP - ORE.SPAWN_Y) / PPM;
      if (!this.spawnFilter || this.spawnFilter(arrival)) out.push({ kind: 'appear', v: this.spawn() });
      const [a, b] = ORE.GAP;
      this.nextAt = s.depth + (a + Math.random() * (b - a)) * Math.pow(ORE.GAP_LEG_MUL, s.relays);
    }
    const still = s.speed <= ORE.STOP_SPEED;
    for (const v of this.list) {
      v.y += advancePx;
      v.sprite.y = Math.round(v.y);
      if (v.y > 360) { v.sprite.destroy(); v.state = v.state === 'gone' ? 'gone' : v.state; v.dead = true; continue; }
      if (!v.alerted && v.state === 'ahead') { v.alerted = true; if (!out.some((e) => e.v === v)) out.push({ kind: 'appear', v }); }
      const d = this.dist(v);
      const active = ['ahead', 'window', 'stopped'].includes(v.state);
      if (active && d < -ORE.WINDOW_PAST) {
        // drove past it (or drilled straight through)
        if (v.credits > 0) { v.state = 'left'; s.veinsWorked += 1; out.push({ kind: 'left', v }); }
        else {
          v.state = 'lost'; s.veinsLost += 1;
          const scrap = v.value * ORE.SCRAP_FRAC;
          s.haul += scrap; s.scrap += scrap;
          out.push({ kind: 'lost', v, scrap });
          v.sprite.setTint(0x5a4a5a);
        }
        continue;
      }
      if (v.state === 'ahead' && this.inWindow(v)) { v.state = 'window'; out.push({ kind: 'window', v }); }
      if (v.state === 'window' && this.inWindow(v) && still && !s.blocked) { v.state = 'stopped'; out.push({ kind: 'stopped', v }); }
      else if (v.state === 'stopped' && !still) { v.state = 'window'; out.push({ kind: 'moving', v }); }
      if (v.state === 'stopped' && extracting && v.taken < 1) {
        const frac = Math.min(dt / v.def.secs, 1 - v.taken);
        const cr = v.value * frac;
        v.taken += frac; v.credits += cr; s.haul += cr; s.ore += cr;
        v.inst += v.def.inst * (1 + ORE.ESCALATE * v.taken) * dt;
        if (v.def.tremor && Math.random() < v.def.tremor * dt) {
          const [lo, hi] = v.def.tremorAmt; const amt = lo + Math.random() * (hi - lo);
          v.inst += amt; out.push({ kind: 'tremor', v, amt });
        }
        if (Math.random() < 0.5) this.glint.emitParticleAt(90 + (Math.random() - 0.5) * 50, v.y, 1);
        if (v.inst >= ORE.COLLAPSE_AT) {
          const loss = v.credits * ORE.COLLAPSE_LOSS;
          s.haul = Math.max(0, s.haul - loss); s.ore -= loss; v.credits -= loss;
          s.damage(v.def.dmg); s.veinsCollapsed += 1;
          v.state = 'collapsed'; v.inst = ORE.COLLAPSE_AT;
          v.sprite.setTint(0x3a2a34).setAlpha(0.7);
          this.dust.explode(40, 90, v.y);
          out.push({ kind: 'collapse', v, loss, dmg: v.def.dmg });
        } else if (v.taken >= 1 - 1e-9) {
          v.state = 'emptied'; s.veinsWorked += 1;
          v.sprite.setTint(0x6a6070);
          out.push({ kind: 'emptied', v });
        }
      } else if (v.inst > 0 && v.state !== 'collapsed') v.inst = Math.max(0, v.inst - ORE.DECAY * dt);
      if (active && v.state !== 'lost' && Math.random() < 0.08 && v.y > 0) this.glint.emitParticleAt(90 + (Math.random() - 0.5) * 60, v.y + (Math.random() - 0.5) * 6, 1);
    }
    this.list = this.list.filter((v) => !v.dead);
    this.draw(time);
    return out;
  }

  draw(time) {
    const z = this.zone.clear(), m = this.meters.clear();
    const v = this.current;
    this.label.setVisible(false);
    if (!v) return;
    const d = this.dist(v), col = v.def.tint;
    // stop window brackets at the drill tip, shown as the vein closes in
    if (d < 45) {
      const y0 = TIP - ORE.WINDOW_AHEAD * PPM, y1 = TIP + ORE.WINDOW_PAST * PPM;
      const inWin = this.inWindow(v), flash = inWin && v.state !== 'stopped' && Math.floor(time / 150) % 2 === 0;
      const c = v.state === 'stopped' ? 0x8affa0 : inWin ? (flash ? 0xffffff : 0x8affa0) : 0xffd23f;
      for (const x of [L.SHIP_X - 8, L.SHIP_X + L.SHIP_W + 5]) {
        z.fillStyle(c, 0.9).fillRect(x, y0, 3, 1).fillRect(x, y1, 3, 1).fillRect(x + (x < 90 ? 0 : 2), y0, 1, y1 - y0);
      }
      z.fillStyle(c, inWin ? 0.18 : 0.08).fillRect(L.SHIP_X - 4, y0, L.SHIP_W + 8, y1 - y0);
    }
    // centre line on the vein so its position against the window is exact
    if (v.y > -4) for (let x = L.SHIP_X - 10; x < L.SHIP_X + L.SHIP_W + 10; x += 4) m.fillStyle(col, 0.9).fillRect(x, Math.round(v.y), 2, 1);
    // label (left of the bore) + meters when stopped
    if (v.y > 2) {
      this.label.setVisible(true).setTint(col).setPosition(4, Math.round(v.y) - 12)
        .setText(v.state === 'stopped' ? `${v.def.name} VEIN` : `${v.def.name} ${Math.max(0, Math.round(d))}M`);
      if (v.state === 'stopped') {
        const yy = Math.round(v.y) - 4;
        m.fillStyle(0x000000, 0.8).fillRect(3, yy - 1, 38, 13);
        m.fillStyle(0x3a3020, 1).fillRect(4, yy, 36, 4).fillStyle(0xffd23f, 1).fillRect(4, yy, Math.round(36 * v.taken), 4);
        const r = v.inst / ORE.COLLAPSE_AT;
        m.fillStyle(0x3a1a1a, 1).fillRect(4, yy + 6, 36, 4).fillStyle(r > 0.7 && Math.floor(time / 120) % 2 ? 0xffffff : 0xff4a4a, 1).fillRect(4, yy + 6, Math.round(36 * r), 4);
      }
    }
  }
}
