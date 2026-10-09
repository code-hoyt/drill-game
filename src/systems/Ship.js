// Ship visuals: 2-deck interior cutaway (2x2 rooms around a hub ladder), exterior
// plating that fades out in the inside view, animated drill head, alert bubbles,
// room tap zones.
import { LAYOUT as L, ROOM_GEOM } from '../config.js';
import { FONT_KEY } from './PixelFont.js';

const C = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

export class Ship {
  constructor(scene, onRoomTap, onShipTap) {
    this.scene = scene;
    const top = L.SHIP_TOP, bot = L.SHIP_BOTTOM, x0 = L.SHIP_X, w = L.SHIP_W;
    const H = L.HUB, D = L.DECKS;
    const ix = x0 + 2, iw = w - 4; // interior span

    // --- interior ---------------------------------------------------------
    const g = scene.add.graphics().setDepth(10);
    const P = L.POD;   // keel pod (SIPHON seat) under the hub
    g.fillStyle(0x1b1c25, 1).fillRect(P.x, P.top, P.w, 19);
    g.fillStyle(0x4b4f63, 1).fillRect(P.x + 1, P.top + 1, P.w - 2, 17);
    g.fillStyle(0x1b1c25, 1).fillRect(x0, top, w, bot - top);
    g.fillStyle(0x4b4f63, 1).fillRect(x0 + 1, top + 1, w - 2, bot - top - 2);
    this.rooms = ROOM_GEOM.map((r) => ({ ...r }));
    for (const r of this.rooms) {
      g.fillStyle(C(r.bg), 1).fillRect(r.x, r.ceil, r.w, r.floorY - r.ceil);
      g.fillStyle(0x000000, 0.25).fillRect(r.x, r.ceil, r.w, 2);            // ceiling shadow
      g.fillStyle(0xfff2a8, 1).fillRect(Math.round(r.cx) - 2, r.ceil, 4, 1); // lamp
    }
    // hub column with ladder (down through the bottom deck into the keel pod)
    g.fillStyle(0x16171f, 1).fillRect(H.x, D.top.ceil, H.w, P.floor - D.top.ceil);
    g.fillStyle(0x6b6f84, 1).fillRect(H.cx - 4, D.top.ceil, 1, P.floor - D.top.ceil)
      .fillRect(H.cx + 3, D.top.ceil, 1, P.floor - D.top.ceil);
    for (let y = D.top.ceil + 2; y < P.floor; y += 3) g.fillStyle(0x8d91a6, 1).fillRect(H.cx - 3, y, 6, 1);
    // walls between rooms and hub, with a doorway at each floor
    for (const d of [D.top, D.bottom]) {
      for (const wx of [H.x - 2, H.x + H.w]) {
        g.fillStyle(0x4b4f63, 1).fillRect(wx, d.ceil, 2, d.floor - d.ceil - 14);
        g.fillStyle(0x2b2e3b, 1).fillRect(wx, d.floor - 15, 2, 1);
      }
    }
    // deck floors (the top-deck floor has a hatch where the ladder passes)
    const slab = (x, y, ww) => { g.fillStyle(0x8d91a6, 1).fillRect(x, y, ww, 1); g.fillStyle(0x34374a, 1).fillRect(x, y + 1, ww, 2); };
    slab(ix, D.top.floor, H.x - ix);
    slab(H.x + H.w, D.top.floor, ix + iw - H.x - H.w);
    // grate deck plate over the ladder shaft, so same-deck walks cross a real floor
    const grate = (gy) => {
      g.fillStyle(0x6b6f84, 1).fillRect(H.x, gy, H.w, 1);                               // grate top edge
      for (let x = H.x; x < H.x + H.w; x++) g.fillStyle(x % 2 ? 0x8d91a6 : 0x23252f, 1).fillRect(x, gy + 1, 1, 1);
      g.fillStyle(0x34374a, 1).fillRect(H.x, gy + 2, H.w, 1);
      g.fillStyle(0xffd23f, 1).fillRect(H.x, gy, 2, 1).fillRect(H.x + H.w - 2, gy, 2, 1); // hazard trim at the hatch edges
    };
    grate(D.top.floor);
    // bottom deck: same grate over the shaft down to the keel pod
    slab(ix, D.bottom.floor, H.x - ix);
    slab(H.x + H.w, D.bottom.floor, ix + iw - H.x - H.w);
    grate(D.bottom.floor);
    slab(P.x + 1, P.floor, P.w - 2);
    this.interior = g;

    this.labels = this.rooms.map((r) => {
      if (r.pod) return scene.add.bitmapText(r.x + 2, r.ceil + 1, FONT_KEY, r.label, 6).setDepth(11).setTint(0x7ff0e0);
      const left = r.side === 'left';
      return scene.add.bitmapText(left ? r.x + 2 : r.x + r.w - 2, r.ceil + 3, FONT_KEY, r.label, 6)
        .setOrigin(left ? 0 : 1, 0).setDepth(11).setTint(0x9aa0b8);
    });
    this.stations = {};
    for (const r of this.rooms) {
      this.stations[r.id] = scene.add.image(r.stationX, r.floorY, 'st_' + r.id).setOrigin(0.5, 1).setDepth(11).setFlipX(r.side === 'right' && !r.pod);
    }
    this.bubbles = {};
    for (const r of this.rooms) {
      const bx = r.pod ? r.x + 14 : r.side === 'left' ? r.x + r.w - 6 : r.x + 6;
      const b = scene.add.image(bx, r.pod ? r.ceil + 11 : r.ceil + 8, 'bubble').setDepth(14).setVisible(false);
      scene.tweens.add({ targets: b, y: b.y - 2, duration: 350, yoyo: true, repeat: -1 });
      this.bubbles[r.id] = b;
    }
    this.sparks = scene.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 }, lifespan: 300, gravityY: 120,
      tint: [0xffe27a, 0xff9a3d, 0xffffff], frequency: 60, emitting: false,
    }).setDepth(15);

    // --- exterior ---------------------------------------------------------
    this.exterior = scene.add.image(x0, top, 'ship_ext').setOrigin(0).setDepth(16);
    this.podExt = scene.add.image(P.x, P.top, 'pod_ext').setOrigin(0).setDepth(16);
    this.warnLight = scene.add.rectangle(x0 + w / 2, top + 4, 4, 2, 0xff3030).setDepth(17).setVisible(false);
    const eng = this.room('engine');
    this.exhaust = scene.add.particles(x0 + 2, eng.floorY - 10, 'px2', {
      speed: { min: 8, max: 25 }, angle: { min: 160, max: 200 }, lifespan: 700, alpha: { start: 0.7, end: 0 },
      scale: { start: 1, end: 2.5 }, tint: [0xcfcfdf, 0x9a9aaa], frequency: 50, emitting: false,
    }).setDepth(18);

    // --- drill head -------------------------------------------------------
    this.drill = scene.add.image(90, L.DRILL_TIP_Y, 'drill0').setOrigin(0.5, 0).setDepth(9);
    this.drillFrame = 0; this.drillAcc = 0;
    this.chips = scene.add.particles(90, L.DRILL_TIP_Y + 4, 'px', {
      speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 }, lifespan: 400, gravityY: 150,
      tint: [0x5a3f5e, 0x6b4c70, 0x8a7f8f], frequency: 40, quantity: 1, emitting: false,
    }).setDepth(20);

    // --- input zones ------------------------------------------------------
    this.roomZones = this.rooms.map((r) => {
      const z = scene.add.zone(r.x, r.ceil, r.w, r.floorY - r.ceil + 3).setOrigin(0).setDepth(30);
      z.on('pointerdown', () => onRoomTap(r.id));
      return z;
    });
    this.shipZone = scene.add.zone(x0, L.DRILL_TIP_Y, w, bot - L.DRILL_TIP_Y).setOrigin(0).setDepth(30);
    this.shipZone.on('pointerdown', () => onShipTap());
  }

  room(id) { return this.rooms.find((r) => r.id === id); }

  setInside(inside, ms) {
    this.scene.tweens.add({ targets: [this.exterior, this.podExt], alpha: inside ? 0 : 1, duration: ms, ease: 'Sine.easeInOut' });
    for (const z of this.roomZones) inside ? z.setInteractive() : z.disableInteractive();
    inside ? this.shipZone.disableInteractive() : this.shipZone.setInteractive();
  }

  /** alerts: booleans keyed by room id */
  update(dt, speed, blocked, alerts, venting, time) {
    this.drillAcc += dt * (speed * 18);
    if (this.drillAcc >= 1) { this.drillAcc %= 1; this.drillFrame = (this.drillFrame + 1) % 3; this.drill.setTexture('drill' + this.drillFrame); }
    this.drill.x = 90 + (speed > 0.05 && blocked && Math.random() < 0.5 ? 1 : 0);
    this.chips.emitting = speed > 0.05;
    this.chips.frequency = Math.max(15, 80 - speed * 70);

    // full stop (calmK -> 1): bubbles dim, the red hull light stops blinking
    const ck = this.calmK || 0;
    for (const id of Object.keys(this.bubbles)) this.bubbles[id].setVisible(!!alerts[id]).setAlpha(1 - 0.55 * ck);
    const anyAlert = this.rooms.some((r) => alerts[r.id]);
    this.warnLight.setVisible(anyAlert && ck < 0.5 && Math.floor(time / 250) % 2 === 0 && this.exterior.alpha > 0.5);
    this.exhaust.emitting = venting;
  }
}
