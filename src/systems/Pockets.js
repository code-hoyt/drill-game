// Side pockets ([C] Cletus): glowing liquid pockets in the LEFT or RIGHT bore wall. Full stop with the
// pocket level with the hose port on that flank (the alignment window), then Holt holds PUMP at the
// SIPHON seat (keel pod). The tank fills, the pocket drains, a hose runs from the hull to the wall.
// Line PRESSURE builds with sustained pumping (faster on volatile pockets) and falls when released;
// at BURST_AT the line bursts: part of the pocket is lost and the pump locks out for a few seconds.
// Drive past without pumping: POCKET MISSED. Full tank: no pumping (skip it, or sell at a relay).
import { TUNING as T, LAYOUT as L, SIPHON as S } from '../config.js';
import { FONT_KEY } from './PixelFont.js';

const PPM = T.PX_PER_METER;
let nextId = 1;

export class Pockets {
  constructor(scene, sys) {
    this.scene = scene;
    this.sys = sys;
    this.list = [];
    this.enabled = true;
    this.nextAt = S.START_DEPTH - (S.PORT_Y - S.SPAWN_Y) / PPM;   // first one lines up at START_DEPTH
    this.spawnFilter = null;     // (alignDepthM) => bool
    this.log = [];               // { type, side, arrival } (debug/tests)
    this.pressure = 0; this.holdT = 0; this.lockT = 0;
    this.warned = false; this.fullWarned = false; this.pumping = false;
    this.hoseK = 0; this.hoseP = null;
    this.gfx = scene.add.graphics().setDepth(2.6);
    this.zone = scene.add.graphics().setDepth(2.85);
    this.hose = scene.add.graphics().setDepth(8);
    this.label = scene.add.bitmapText(0, 0, FONT_KEY, '', 6).setDepth(2.95).setVisible(false);
    this.spray = scene.add.particles(0, 0, 'px2', {
      speed: { min: 20, max: 70 }, angle: { min: 0, max: 360 }, lifespan: 650, gravityY: 90, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(26);
  }

  /** Metres from the hose port to the pocket's centre (+ ahead, - past). */
  dist(p) { return (S.PORT_Y - p.y) / PPM; }
  inWindow(p) { const d = this.dist(p); return d <= S.WINDOW_AHEAD && d >= -S.WINDOW_PAST; }
  get current() { return this.list.filter((p) => ['ahead', 'window', 'stopped'].includes(p.state)).sort((a, b) => b.y - a.y)[0] || null; }
  get stopped() { const p = this.current; return p && p.state === 'stopped' ? p : null; }
  /** Can Holt pump right now (seat aside)? */
  get canPump() { const p = this.stopped; return !!p && p.vol > 0.01 && !this.sys.tankFull && this.lockT <= 0; }
  /** Is any pending pocket lining up within m metres of this depth? */
  near(alignM, m) { const d = this.sys.depth; return this.list.some((p) => ['ahead', 'window', 'stopped'].includes(p.state) && Math.abs(d + this.dist(p) - alignM) < m); }

  pickType() {
    const w = S.WEIGHTS[Math.min(this.sys.relays, S.WEIGHTS.length - 1)];
    let r = Math.random();
    for (const [k, p] of Object.entries(w)) { if ((r -= p) <= 0) return k; }
    return 'small';
  }

  spawn(type = this.pickType(), side = Math.random() < 0.5 ? 'left' : 'right', y = S.SPAWN_Y) {
    const def = S.TYPES[type];
    const p = { id: nextId++, type, def, side, x: S.POCKET_X[side], y, state: 'ahead', vol: def.vol, pumped: 0, lost: 0,
      crPerL: (def.value * this.sys.payMult) / def.vol, alerted: false };
    this.list.push(p);
    this.log.push({ type, side, arrival: Math.round(this.sys.depth + this.dist(p)) });
    return p;
  }

  clear() { this.list = []; this.hoseK = 0; this.hoseP = null; this.pressure = 0; this.holdT = 0; this.lockT = 0; this.draw(0); }

  /** pumping: Holt is holding PUMP at the seat (validated by the scene). Returns events. */
  update(dt, advancePx, pumping, time) {
    const s = this.sys, out = [];
    if (this.enabled && s.depth >= this.nextAt) {
      const arrival = s.depth + (S.PORT_Y - S.SPAWN_Y) / PPM;
      if (!this.spawnFilter || this.spawnFilter(arrival)) out.push({ kind: 'appear', v: this.spawn() });
      const [a, b] = S.GAP;
      this.nextAt = s.depth + (a + Math.random() * (b - a)) * Math.pow(S.GAP_LEG_MUL, s.relays);
    }
    const still = s.speed <= 1e-6;
    this.lockT = Math.max(0, this.lockT - dt);
    for (const p of this.list) {
      p.y += advancePx;
      if (p.y > 380) { p.dead = true; continue; }
      if (!p.alerted && p.state === 'ahead') { p.alerted = true; if (!out.some((e) => e.v === p)) out.push({ kind: 'appear', v: p }); }
      const d = this.dist(p);
      const active = ['ahead', 'window', 'stopped'].includes(p.state);
      if (active && d < -S.WINDOW_PAST) {
        if (p.pumped > 0) { p.state = 'left'; s.pocketsTapped += 1; out.push({ kind: 'left', v: p }); }
        else { p.state = 'missed'; s.pocketsMissed += 1; out.push({ kind: 'missed', v: p }); }
        continue;
      }
      if (p.state === 'ahead' && this.inWindow(p)) { p.state = 'window'; out.push({ kind: 'window', v: p }); }
      if (p.state === 'window' && this.inWindow(p) && still) { p.state = 'stopped'; out.push({ kind: 'stopped', v: p }); }
      else if (p.state === 'stopped' && !still) { p.state = 'window'; out.push({ kind: 'moving', v: p }); }
    }
    this.list = this.list.filter((p) => !p.dead);

    // pumping: tank fills, pocket drains, pressure builds (faster the longer you hold without a break)
    const p = this.stopped;
    const work = pumping && this.canPump;
    if (work) {
      this.holdT += dt;
      const l = Math.min(S.PUMP_RATE * s.mods.pumpMul * dt, p.vol, s.tankCap - s.tank);
      p.vol -= l; p.pumped += l; s.tank += l; s.tankCr += l * p.crPerL;
      this.pressure += S.PRESS_RATE * p.def.press * s.mods.pressMul * (1 + S.PRESS_ESC * this.holdT) * dt;
      if (!this.warned && this.pressure >= S.PRESS_WARN && this.pressure < S.BURST_AT) { this.warned = true; out.push({ kind: 'pressure', v: p }); }
      if (this.pressure >= S.BURST_AT) {
        const lost = p.vol * S.BURST_LOSS;
        p.vol -= lost; p.lost += lost; s.bursts += 1;
        this.lockT = S.BURST_LOCKOUT_S; this.pressure = S.PRESS_AFTER_BURST; this.holdT = 0; this.warned = false;
        const hx = (p.side === 'left' ? L.SHIP_X : L.SHIP_X + L.SHIP_W) + (p.x - (p.side === 'left' ? L.SHIP_X : L.SHIP_X + L.SHIP_W)) / 2;
        this.spray.setParticleTint(p.def.tint);
        this.spray.explode(18, hx, S.PORT_Y);
        this.spray.explode(14, L.POD.stationX - 3, L.POD.floor - 6);   // sprays the pod deck
        out.push({ kind: 'burst', v: p, lost });
      }
      if (p.vol <= 0.01) { p.vol = 0; p.state = 'drained'; s.pocketsTapped += 1; out.push({ kind: 'drained', v: p }); }
      if (s.tankFull && !this.fullWarned) { this.fullWarned = true; out.push({ kind: 'full', v: p }); }
    } else {
      this.holdT = 0;
      this.pressure = Math.max(0, this.pressure - S.PRESS_FALL * dt);
      if (this.pressure < S.PRESS_WARN - 10) this.warned = false;
    }
    if (!s.tankFull) this.fullWarned = false;
    this.pumping = work;
    // hose: runs out to a pocket while stopped beside it, reels in when moving
    const target = this.stopped;
    if (target) this.hoseP = target;
    this.hoseK = target ? Math.min(1, this.hoseK + dt * 4) : Math.max(0, this.hoseK - dt * 5);
    if (this.hoseK === 0) this.hoseP = null;
    this.draw(time);
    return out;
  }

  draw(time) {
    const g = this.gfx.clear(), z = this.zone.clear(), h = this.hose.clear();
    this.label.setVisible(false);
    for (const p of this.list) {
      if (p.y < -20 || p.y > 340) continue;
      const frac = p.vol / p.def.vol, dim = p.state === 'missed' ? 0.35 : 1;
      const pulse = 0.5 + 0.5 * Math.sin(time / (p.type === 'volatile' ? 90 : 220) + p.id);
      g.fillStyle(p.def.tint, (0.18 + 0.14 * pulse) * dim).fillEllipse(p.x, p.y, 26, 18);       // glow in the rock
      g.fillStyle(0x0b0810, 1).fillEllipse(p.x, p.y, 20, 13);                                   // the cavity
      const rows = 11, lvl = Math.round(rows * frac);
      for (let r = 0; r < lvl; r++) {                                                           // liquid level (drains)
        const yy = p.y + 5 - r, t = (yy - p.y) / 6.5, half = Math.floor(9.5 * Math.sqrt(Math.max(0, 1 - t * t)));
        g.fillStyle(p.def.tint, (r === lvl - 1 ? 1 : 0.8) * dim).fillRect(Math.round(p.x - half), Math.round(yy), half * 2, 1);
      }
      if (lvl > 0) g.fillStyle(0xffffff, 0.6 * pulse * dim).fillRect(Math.round(p.x - 3), Math.round(p.y + 6 - lvl), 2, 1);
    }
    const p = this.current;
    if (p) {
      const d = this.dist(p), left = p.side === 'left';
      const flank = left ? L.SHIP_X : L.SHIP_X + L.SHIP_W;
      // alignment window: a bracket on that flank around the hose port, shown as the pocket closes in
      if (d < 60) {
        const y0 = S.PORT_Y - S.WINDOW_AHEAD * PPM, y1 = S.PORT_Y + S.WINDOW_PAST * PPM, inWin = this.inWindow(p);
        const flash = inWin && p.state !== 'stopped' && Math.floor(time / 150) % 2 === 0;
        const c = p.state === 'stopped' ? 0x8affa0 : inWin ? (flash ? 0xffffff : 0x8affa0) : 0xffd23f;
        const bx = left ? flank - 5 : flank + 3;
        z.fillStyle(c, 0.9).fillRect(bx, y0, 2, 1).fillRect(bx, y1, 2, 1).fillRect(left ? bx : bx + 1, y0, 1, y1 - y0);
        // dashed level line from the pocket to the hull
        if (p.y > -4) for (let x = Math.min(p.x, flank); x < Math.max(p.x, flank); x += 4) z.fillStyle(p.def.tint, 0.9).fillRect(x, Math.round(p.y), 2, 1);
      }
      if (p.y > 4 && d > 6) {
        const txt = `${p.def.name} ${Math.max(0, Math.round(d))}M`;
        this.label.setText(txt).setTint(p.def.tint);
        const w = this.label.width, x = Math.max(2, Math.min(153 - w, Math.round(p.x - w / 2)));
        this.label.setVisible(true).setPosition(x, Math.round(p.y) - 14);
      }
    }
    // the hose (hull port -> pocket), with liquid running in while pumping
    const hp = this.hoseP;
    if (hp && this.hoseK > 0) {
      const left = hp.side === 'left', x0 = left ? L.SHIP_X - 1 : L.SHIP_X + L.SHIP_W + 1, x1 = hp.x + (left ? 9 : -9);
      const xe = x0 + (x1 - x0) * this.hoseK, ye = S.PORT_Y + (hp.y - S.PORT_Y) * this.hoseK;
      h.lineStyle(3, 0x23252f, 1).lineBetween(x0, S.PORT_Y, xe, ye);
      h.lineStyle(1, 0x8d91a6, 1).lineBetween(x0, S.PORT_Y - 0.5, xe, ye - 0.5);
      h.fillStyle(0xffd23f, 1).fillRect(Math.round(xe) - 1, Math.round(ye) - 1, 3, 3);   // nozzle
      if (this.pumping) for (let i = 0; i < 3; i++) {
        const t = ((time / 300 + i / 3) % 1);
        h.fillStyle(hp.def.tint, 1).fillRect(Math.round(xe + (x0 - xe) * t), Math.round(ye + (S.PORT_Y - ye) * t) - 1, 2, 2);
      }
    }
  }
}
