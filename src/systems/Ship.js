// CORMORANT: the ship coupled behind the leased TB-6 drill unit.
//   OUTSIDE: the hull PNG (70% scale: ships are smaller than drills) with animated engine glow, nav lights
//            and reactor vents, the clamp arms + umbilicals, the conveyor feeding the throat intake.
//   INSIDE : a top-down, FTL-style cutaway (ring corridor round the central hold, stations, the crawl tube
//            to the cockpit pod), laid out at full concept scale as a separate zoomed schematic. The hull
//            "roof" fades out and the cutaway fades in as the camera zooms (ViewController).
// Plus the separate DRILL UNIT above (cutterhead, hopper with a visible ore level), the hopper/belt monitor
// on the DRL console, and the breakaway (drill lost) graphics.
import { LAYOUT as L, ROOM_GEOM, POWER, SHIP } from '../config.js';
import { FONT_KEY } from './PixelFont.js';
import { SHIP_TEX, hullImage } from './ShipArt.js';

const C = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const FACE_ANGLE = { up: 0, right: 90, down: 180, left: -90 };
// room label placement (world): rooms are small, so a few labels sit just outside their room
const LABEL_AT = { helm: [131, 264, 0.5], drill: [99, 237, 0], engine: [72, 302, 0], tools: [61, 260, 0], siphon: [61, 283, 0] };

export class Ship {
  constructor(scene, onRoomTap, onShipTap) {
    this.scene = scene;
    const F = L.FACE, N = L.NAV;
    this.rooms = ROOM_GEOM.map((r) => ({ ...r }));
    this.insideObjs = [];
    const inside = (o) => { this.insideObjs.push(o); return o; };

    // --- interior (top-down cutaway) ------------------------------------------
    const D = L.DECK_ART;
    this.deck = inside(scene.add.image(F.x, F.y, SHIP_TEX.deck).setOrigin(D.ox / D.w, D.oy / D.h).setDepth(10));
    const g = inside(scene.add.graphics().setDepth(10.2));
    const node = (k) => N.nodes[k];
    const strip = (a, b, w, col) => {   // an axis-aligned corridor strip between two points
      const x0 = Math.min(a[0], b[0]) - (a[0] === b[0] ? (w - 1) / 2 : 0), y0 = Math.min(a[1], b[1]) - (a[1] === b[1] ? (w - 1) / 2 : 0);
      const ww = a[0] === b[0] ? w : Math.abs(b[0] - a[0]) + 1, hh = a[1] === b[1] ? w : Math.abs(b[1] - a[1]) + 1;
      g.fillStyle(col, 1).fillRect(Math.round(x0), Math.round(y0), Math.round(ww), Math.round(hh));
    };
    // rooms
    for (const r of this.rooms) {
      g.fillStyle(0x4b4f63, 1).fillRect(r.x - 1, r.ceil - 1, r.w + 2, r.h + 2);
      g.fillStyle(C(r.bg), 1).fillRect(r.x, r.ceil, r.w, r.h);
      for (let x = r.x + 1; x < r.x + r.w; x += 4) for (let y = r.ceil + 1; y < r.floorY; y += 4) g.fillStyle(0x000000, 0.18).fillRect(x, y, 1, 1);   // deck plate rivets
    }
    // hold + bunk (decor)
    const H = L.HOLD, B = L.BUNK;
    g.fillStyle(0x4b4f63, 1).fillRect(H.x - 1, H.y - 1, H.w + 2, H.h + 2).fillStyle(0x1a1712, 1).fillRect(H.x, H.y, H.w, H.h);
    g.fillStyle(0x4b4f63, 1).fillRect(B.x - 1, B.y - 1, B.w + 2, B.h + 2);
    // corridors: the ring + doorways (stand spot -> node) + the crawl tube
    const COR = 0x2b2e3b, W = N.width;
    for (const [a, b, kind] of N.edges) strip(node(a), node(b), kind === 'climb' ? 5 : W, kind === 'climb' ? 0x23252f : COR);
    for (const r of this.rooms) {
      const n = node(r.node), s = [r.standX, r.standY];
      // doorway: from the node, along one axis then the other
      strip(n, [s[0], n[1]], 5, COR); strip([s[0], n[1]], s, 5, COR);
    }
    strip(node('se'), [B.x + 4, node('se')[1]], 5, COR); strip([B.x + 4, node('se')[1]], [B.x + 4, B.y + B.h], 5, COR);   // bunk door
    // corridor detail: grating dots + hazard trim at the tube mouth, ribs in the tube
    for (const [a, b, kind] of N.edges) {
      const A = node(a), Bn = node(b), n = Math.max(Math.abs(Bn[0] - A[0]), Math.abs(Bn[1] - A[1]));
      for (let i = 0; i <= n; i += 3) {
        const x = Math.round(A[0] + (Bn[0] - A[0]) * i / n), y = Math.round(A[1] + (Bn[1] - A[1]) * i / n);
        g.fillStyle(kind === 'climb' ? 0x4b4f63 : 0x383c4c, 1).fillRect(x, y, 1, 1);
        if (kind === 'climb') g.fillStyle(0x4b4f63, 1).fillRect(x, y - 2, 1, 5);
      }
    }
    const t0 = node('t0');
    g.fillStyle(0xffd23f, 1).fillRect(t0[0], t0[1] - 3, 1, 1).fillRect(t0[0], t0[1] + 3, 1, 1);
    this.interior = g;
    // hold contents (fill level) + bunk + lamps
    this.holdGfx = inside(scene.add.graphics().setDepth(10.4));
    this.bunk = inside(scene.add.image(B.x, B.y, 'bunk_td').setOrigin(0).setDepth(10.4));
    this.labels = this.rooms.map((r) => {
      const [x, y, o] = LABEL_AT[r.id];
      return inside(scene.add.bitmapText(x, y, FONT_KEY, r.label, 6).setOrigin(o, 0).setDepth(11).setTint(r.id === 'siphon' ? 0x7ff0e0 : 0x9aa0b8));
    });
    this.holdLabel = inside(scene.add.bitmapText(H.x + H.w / 2, H.y + 1, FONT_KEY, 'HOLD', 6).setOrigin(0.5, 0).setDepth(11).setTint(0x8a7a5a));
    this.stations = {};
    for (const r of this.rooms) {
      this.stations[r.id] = inside(scene.add.image(r.stationX, r.stationY, 'st_' + r.id).setDepth(11).setAngle(FACE_ANGLE[r.face]));
    }
    this.bubbles = {};
    for (const r of this.rooms) {
      const b = scene.add.image(r.x + r.w - 4, r.ceil + 3, 'bubble').setDepth(14).setVisible(false);
      scene.tweens.add({ targets: b, y: b.y - 2, duration: 350, yoyo: true, repeat: -1 });
      this.bubbles[r.id] = b;
    }
    this.sparks = scene.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 }, lifespan: 300, gravityY: 120,
      tint: [0xffe27a, 0xff9a3d, 0xffffff], frequency: 60, emitting: false,
    }).setDepth(15);

    // --- exterior (the 70% hull) -------------------------------------------------
    this.exterior = hullImage(scene, SHIP_TEX.hull, F.x, F.y).setDepth(16);
    this.extFx = scene.add.graphics().setDepth(16.5);     // engine glow, nav lights, reactor vents
    this.warnLight = scene.add.rectangle(F.x, F.y + 33, 3, 2, 0xff3030).setDepth(17).setVisible(false);
    this.exhaust = scene.add.particles(F.x - 8, F.y + 40, 'px2', {   // vents off the reactor dome
      speed: { min: 8, max: 25 }, angle: { min: 160, max: 200 }, lifespan: 700, alpha: { start: 0.7, end: 0 },
      scale: { start: 1, end: 2.5 }, tint: [0xcfcfdf, 0x9a9aaa], frequency: 50, emitting: false,
    }).setDepth(18);

    // --- drill unit (separate machine) + coupling -------------------------------
    const DU = L.DRILL_UNIT;
    this.coupling = hullImage(scene, SHIP_TEX.clamps, F.x, F.y).setDepth(8.5);
    this.drillBody = scene.add.image(DU.x, DU.bodyTop, 'drillunit').setOrigin(0).setDepth(9);
    this.drill = scene.add.image(90, L.DRILL_TIP_Y, 'cutter0').setOrigin(0.5, 0).setDepth(9.2);   // the cutterhead
    this.drillFx = scene.add.graphics().setDepth(9.4);       // hopper fill, ram glints
    this.convFx = scene.add.graphics().setDepth(16.4);       // conveyor pips into the throat intake (over the hull)
    this.breakGfx = scene.add.graphics().setDepth(17.5);     // breakaway: open clamps + snapped umbilicals
    this.spillFx = scene.add.particles(0, 0, 'px', {
      speedX: { min: -30, max: 30 }, speedY: { min: -10, max: 25 }, gravityY: 120, lifespan: 700,
      tint: [0xd8b04a, 0x8a6a3a, 0xc08060], frequency: 35, quantity: 2, emitting: false,
    }).setDepth(9.6);
    this.spillFx.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(DU.x + 14, DU.hopperTop - 1, 62, 2) });
    this.convPhase = 0;
    // DRL console: a little hopper / conveyor monitor on the room's wall (amber = hopper, green = belt flow)
    const dr = this.room('drill');
    this.monitor = { x: dr.x + 1, y: dr.ceil + 1, w: 8, h: dr.h - 2 };
    this.monitorGfx = inside(scene.add.graphics().setDepth(11.5));
    this.drillFrame = 0; this.drillAcc = 0;
    this.chips = scene.add.particles(90, L.DRILL_TIP_Y + 4, 'px', {
      speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 }, lifespan: 400, gravityY: 150,
      tint: [0x5a3f5e, 0x6b4c70, 0x8a7f8f], frequency: 40, quantity: 1, emitting: false,
    }).setDepth(20);

    // --- input zones ------------------------------------------------------
    this.roomZones = this.rooms.map((r) => {
      const z = scene.add.zone(r.x - 1, r.ceil - 1, r.w + 2, r.h + 2).setOrigin(0).setDepth(30);
      z.on('pointerdown', () => onRoomTap(r.id));
      return z;
    });
    this.shipZone = scene.add.zone(L.DRILL_UNIT.x, L.DRILL_TIP_Y, L.DRILL_UNIT.w, L.SHIP_BOTTOM - L.DRILL_TIP_Y).setOrigin(0).setDepth(30);
    this.shipZone.on('pointerdown', () => onShipTap());
    this.insideK = 0;
  }

  room(id) { return this.rooms.find((r) => r.id === id); }

  /** The crew registers its sprite so it fades with the cutaway. */
  addInterior(o) { this.insideObjs.push(o); o.setAlpha(this.insideK); }

  setInside(inside, ms) {
    const k = { v: this.insideK };
    const apply = () => {
      this.insideK = k.v;
      for (const o of this.insideObjs) o.setAlpha(k.v);
      for (const o of [this.exterior, this.coupling, this.extFx]) o.setAlpha(1 - k.v);
    };
    if (this.fadeTween) this.fadeTween.stop();
    if (!ms) { k.v = inside ? 1 : 0; apply(); }
    else this.fadeTween = this.scene.tweens.add({ targets: k, v: inside ? 1 : 0, duration: ms, ease: 'Sine.easeInOut', onUpdate: apply, onComplete: apply });
    for (const z of this.roomZones) inside ? z.setInteractive() : z.disableInteractive();
    inside ? this.shipZone.disableInteractive() : this.shipZone.setInteractive();
  }

  /** alerts: booleans keyed by room id */
  update(dt, speed, blocked, alerts, venting, time) {
    this.drillAcc += dt * (speed * 18);
    if (this.drillAcc >= 1) { this.drillAcc %= 1; this.drillFrame = (this.drillFrame + 1) % 3; this.drill.setTexture('cutter' + this.drillFrame); }
    this.drill.x = 90 + (speed > 0.05 && blocked && Math.random() < 0.5 ? 1 : 0);
    this.chips.emitting = speed > 0.05;
    this.chips.frequency = Math.max(15, 80 - speed * 70);

    // full stop (calmK -> 1): bubbles dim, the red hull light stops blinking
    const ck = this.calmK || 0;
    for (const id of Object.keys(this.bubbles)) this.bubbles[id].setVisible(!!alerts[id] && this.insideK > 0.5).setAlpha(1 - 0.55 * ck);
    const anyAlert = this.rooms.some((r) => alerts[r.id]);
    this.warnLight.setVisible(anyAlert && ck < 0.5 && Math.floor(time / 250) % 2 === 0 && this.exterior.alpha > 0.5);
    this.exhaust.emitting = venting;
    if (!this.broken) this.drawHull(speed, time);
  }

  /** Outside details on the hull: engine glow (scales with speed, never past the bottom bar), nav lights, reactor vents. */
  drawHull(speed, time) {
    const g = this.extFx.clear(), y = L.ENGINE_Y;
    const k = 0.35 + 0.65 * Math.min(1, speed) + 0.1 * Math.sin(time / 90);
    for (const x of L.ENGINES) {
      g.fillStyle(0xe6f8ff, 0.9 * k).fillRect(x - 1, y, 3, 1);
      g.fillStyle(0x7fd0ff, 0.8 * k).fillRect(x - 1, y + 1, 3, 1);
      if (k > 0.5) g.fillStyle(0x3a7ad9, 0.6 * k).fillRect(x, y + 2, 1, Math.min(2, Math.round(k * 2)));   // glow ends by y 302
    }
    const blink = Math.floor(time / 600) % 3 !== 2;
    g.fillStyle(blink ? 0xe0453a : 0x3a2020, 1).fillRect(L.CAPS.x[0], L.CAPS.y, 1, 1);
    g.fillStyle(blink ? 0x5ad0a0 : 0x203a2a, 1).fillRect(L.CAPS.x[1], L.CAPS.y, 1, 1);
    if (Math.floor(time / 300) % 4 === 0) g.fillStyle(0xffffff, 1).fillRect(L.FACE.x, L.ENGINE_Y - 3, 1, 1);
    const vent = 0.5 + 0.5 * Math.sin(time / 400);
    g.fillStyle(0x4f8b82, 0.4 + 0.5 * vent).fillRect(L.FACE.x - 11, L.FACE.y + 47, 6, 1);   // reactor vents
  }

  /** Hopper fill window, thrust-ram glints, conveyor pips, spill FX, hold fill, DRL monitor. s = ShipSystems. */
  drawDrill(s, dt, time) {
    if (this.broken) return;
    const DU = L.DRILL_UNIT, w = DU.hopperWin, g = this.drillFx.clear();
    const f = Math.min(1, s.hopper / s.hopperCap), full = s.hopperFull;
    const h = Math.round(w.h * f);
    if (h > 0) {
      g.fillStyle(0x8a6a3a, 1).fillRect(w.x, w.y + w.h - h, w.w, h);
      for (let x = w.x; x < w.x + w.w; x += 3) g.fillStyle(((x * 7) % 5) < 2 ? 0xd8b04a : 0xa07a48, 1).fillRect(x, w.y + w.h - h, 2, 1);
      if (h > 2) for (let i = 0; i < 6; i++) g.fillStyle(0xffd23f, 0.9).fillRect(w.x + ((i * 13) % (w.w - 1)), w.y + w.h - 1 - ((i * 5) % (h - 1)), 1, 1);
    }
    for (let x = w.x + 4; x < w.x + w.w; x += 5) g.fillStyle(0x2a2430, 1).fillRect(x, w.y, 1, w.h);   // window bars over the ore
    if (full) g.lineStyle(1, Math.floor(time / 150) % 2 ? 0xff4a4a : 0xffd23f, 1).strokeRect(w.x - 0.5, w.y - 0.5, w.w + 1, w.h + 1);
    if (s.speed > 0.02) { const gy = DU.ramsTop + Math.floor(time / 90) % 4; for (const x of [59, 75, 101, 117]) g.fillStyle(0xffffff, 0.8).fillRect(x + 1, gy, 2, 1); }
    // conveyor: ore pips ride from the collar into the throat intake, at the belt rate
    const rate = s.power.rate, I = L.INTAKE, cg = this.convFx.clear();
    this.convPhase = (this.convPhase + dt * (2 + rate * 2.2)) % 6;
    const on = s.hopper > 0.01 && rate > 0.05;
    if (on) for (let y = DU.collarBot - 3 + this.convPhase % 3; y < I.y + I.h; y += 3) cg.fillStyle(0xd8b04a, 1 - this.insideK).fillRect(89 + (Math.round(y) % 2), Math.round(y), 2, 1);
    this.spillFx.emitting = s.spilling;
    // hold fill level (the hold is not capped yet; the gauge reads against the proposed capacity)
    const H = L.HOLD, hg = this.holdGfx.clear(), hf = Math.min(1, (s.conveyed || 0) / (SHIP.holdCapProposed || 600));
    const hh = Math.round((H.h - 8) * hf);
    if (hh > 0) {
      hg.fillStyle(0x8a6a3a, 1).fillRect(H.x + 1, H.y + H.h - 1 - hh, H.w - 2, hh);
      for (let x = H.x + 1; x < H.x + H.w - 1; x += 3) hg.fillStyle(0xd8b04a, 1).fillRect(x, H.y + H.h - 1 - hh, 2, 1);
    }
    if (on) for (let y = H.y + 7 + this.convPhase % 3; y < H.y + H.h - 1 - hh; y += 3) hg.fillStyle(0xd8b04a, 1).fillRect(H.x + H.w / 2 - 1, Math.round(y), 2, 1);   // ore dropping in
    // DRL console monitor
    const m = this.monitor, mg = this.monitorGfx.clear();
    mg.fillStyle(0x14161c, 1).fillRect(m.x, m.y, m.w, m.h).fillStyle(0x0b1a16, 1).fillRect(m.x + 1, m.y + 1, m.w - 2, m.h - 2);
    const mh = m.h - 2, lv = Math.round(mh * f);
    mg.fillStyle(full && Math.floor(time / 150) % 2 ? 0xff4a4a : 0xd8b04a, 1).fillRect(m.x + 1, m.y + m.h - 1 - lv, 2, lv);   // hopper level
    const cr = Math.min(1, rate / (POWER.REACTOR * POWER.CONVEYOR_RATE));
    for (let i = 0; i < 2; i++) { const yy = m.y + 1 + ((Math.floor(this.convPhase * 1.2) + i * 3) % mh); mg.fillStyle(on ? 0x4ad66d : 0x2a4a3a, on ? 0.5 + 0.5 * cr : 1).fillRect(m.x + 4, yy, 1, 1); }   // belt
    mg.fillStyle(0x4ad66d, 1).fillRect(m.x + 5, m.y + m.h - 1 - Math.round(mh * cr), 2, Math.round(mh * cr));   // conveyor power share
  }

  /** Hide the ship (its interior, crew and exterior) so a stand-in can leave in the breakaway. */
  shipObjects() {
    return [...this.insideObjs, ...Object.values(this.bubbles), this.exterior, this.extFx, this.convFx, this.warnLight, this.coupling];
  }
}
