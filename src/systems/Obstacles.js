// Boulders ahead of the drill: spawning, scrolling, ram / grind / blast.
import { TUNING as T, LAYOUT as L } from '../config.js';

const SIZES = [
  { key: 'boulder_s', r: 8, hp: 2, mult: 0.7 },
  { key: 'boulder_m', r: 11, hp: 3.5, mult: 1 },
  { key: 'boulder_l', r: 14, hp: 5, mult: 1.4 },
];

export class Obstacles {
  constructor(scene, systems) {
    this.scene = scene;
    this.sys = systems;
    this.list = [];
    this.nextAt = 25; // first boulder at 25 m so the player meets one quickly
    this.spawnFilter = null; // (arrivalDepthM) => bool; lets the relay approach stay clear
    this.spawnLog = [];      // recent arrival depths (debug/tests)
    this.debris = scene.add.particles(0, 0, 'px2', {
      speed: { min: 20, max: 70 }, angle: { min: 0, max: 360 }, lifespan: 600, gravityY: 90,
      tint: [0x8a7f8f, 0xb3a9b6, 0x5e5363], emitting: false,
    }).setDepth(25);
    this.laser = scene.add.graphics().setDepth(24);
  }

  gapForDepth(d) {
    const t = Math.min(1, d / T.OBSTACLE_GAP_DEPTH);
    return T.OBSTACLE_GAP_START + (T.OBSTACLE_GAP_MIN - T.OBSTACLE_GAP_START) * t;
  }

  spawn(depth) {
    // bigger boulders become more common with depth
    const roll = Math.random() + Math.min(0.6, depth / 1500);
    const size = roll > 1.1 ? SIZES[2] : roll > 0.6 ? SIZES[1] : SIZES[0];
    const x = Phaser.Math.Between(L.PATH_MIN_X, L.PATH_MAX_X);
    const sprite = this.scene.add.image(x, -30, size.key).setDepth(3);
    const warn = this.scene.add.image(x + size.r + 5, -30, 'bubble').setDepth(4).setVisible(false);
    this.list.push({ sprite, warn, size, hp: size.hp, contact: false });
  }

  /** Returns { blocked, rammed: damage|0 } */
  update(dt, advancePx, time) {
    const s = this.sys;
    if (s.depth >= this.nextAt) {
      const arrival = s.depth + (L.DRILL_TIP_Y + 30) / T.PX_PER_METER; // depth at which it reaches the drill
      if (!this.spawnFilter || this.spawnFilter(arrival)) {
        this.spawn(s.depth);
        this.spawnLog.push(Math.round(arrival)); if (this.spawnLog.length > 30) this.spawnLog.shift();
      }
      this.nextAt = s.depth + this.gapForDepth(s.depth) * Phaser.Math.FloatBetween(0.7, 1.3);
    }

    let blocked = false, rammed = 0;
    for (const o of [...this.list]) {
      o.sprite.y += advancePx;
      const bottom = o.sprite.y + o.size.r;
      if (bottom >= L.DRILL_TIP_Y) {
        o.sprite.y = L.DRILL_TIP_Y - o.size.r;
        o.contact = true;
        if (s.ramming) {
          const dmg = (T.RAM_DAMAGE_BASE + T.RAM_DAMAGE_SPEED * s.realSpeed) * o.size.mult * s.mods.ramMul;
          s.damage(dmg);
          s.wear = Math.min(T.WEAR_MAX, s.wear + T.RAM_WEAR);
          s.speed *= 0.3; // jolt
          rammed += dmg;
          this.destroy(o, true);
          continue;
        }
        // grinding safely
        blocked = true;
        if (s.speed > 0.02) {
          o.hp -= T.GRIND_RATE * dt * (0.6 + s.speed);
          s.wear = Math.min(T.WEAR_MAX, s.wear + T.GRIND_WEAR * s.mods.grindWearMul * dt);
          o.sprite.x += Math.sin(time * 0.08) * 0.3;
          if (Math.random() < 0.4) this.debris.explode(1, o.sprite.x, L.DRILL_TIP_Y - 2);
          if (o.hp <= 0) { this.destroy(o, true); blocked = false; continue; }
        }
      }
      // warning bubble when approaching too fast
      const dist = L.DRILL_TIP_Y - bottom;
      const danger = dist < T.WARN_DISTANCE * s.mods.warnMul && s.ramming && o.sprite.y > 0;
      o.warn.setPosition(o.sprite.x + o.size.r + 5, o.sprite.y - 4).setVisible(danger && Math.floor(time / 200) % 2 === 0);
    }
    return { blocked, rammed };
  }

  /** Closest boulder that's on screen (target for BLAST). */
  target() {
    let best = null;
    for (const o of this.list) if (o.sprite.y > 10 && (!best || o.sprite.y > best.sprite.y)) best = o;
    return best;
  }

  /** Is anything on screen ahead? (alert icon) */
  anyAhead() { return this.list.some((o) => o.sprite.y > 0); }

  /** Boulders within warning range of the drill tip (dead-man governor). */
  close() { return this.list.some((o) => o.sprite.y > 0 && L.DRILL_TIP_Y - o.sprite.y < T.WARN_DISTANCE * this.sys.mods.warnMul); }

  /** Heavy charge: clears every boulder on screen. Returns the count. */
  blastAll() {
    const hit = this.list.filter((o) => o.sprite.y > 10);
    this.laser.clear();
    for (const o of hit) {
      this.laser.lineStyle(2, 0xfff27a, 1).lineBetween(90, L.DRILL_TIP_Y, o.sprite.x, o.sprite.y);
      this.destroy(o, true);
    }
    this.scene.time.delayedCall(160, () => this.laser.clear());
    return hit.length;
  }

  blast() {
    const o = this.target();
    if (!o) return false;
    this.laser.clear().lineStyle(2, 0xfff27a, 1).lineBetween(90, L.DRILL_TIP_Y, o.sprite.x, o.sprite.y)
      .lineStyle(1, 0xffffff, 1).lineBetween(90, L.DRILL_TIP_Y, o.sprite.x, o.sprite.y);
    this.scene.time.delayedCall(120, () => this.laser.clear());
    this.destroy(o, true);
    return true;
  }

  destroy(o, fx) {
    if (fx) this.debris.explode(18, o.sprite.x, o.sprite.y);
    o.sprite.destroy(); o.warn.destroy();
    this.list = this.list.filter((x) => x !== o);
  }
}
