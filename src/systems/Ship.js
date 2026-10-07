// Ship visuals: interior cutaway (rooms + stations), exterior plating that
// fades out in the inside view, animated drill head, alert bubbles, room tap zones.
import { LAYOUT as L, TUNING as T } from '../config.js';
import { FONT_KEY } from './PixelFont.js';

export class Ship {
  constructor(scene, onRoomTap, onShipTap) {
    this.scene = scene;
    const top = L.SHIP_TOP, bot = L.SHIP_BOTTOM, x0 = L.SHIP_X, w = L.SHIP_W;

    // --- interior ---------------------------------------------------------
    const g = scene.add.graphics().setDepth(10);
    g.fillStyle(0x1b1c25, 1).fillRect(x0, top, w, bot - top);
    g.fillStyle(0x4b4f63, 1).fillRect(x0 + 1, top + 1, w - 2, bot - top - 2);
    this.rooms = L.ROOMS.map((r) => {
      g.fillStyle(Phaser.Display.Color.HexStringToColor(r.bg).color, 1).fillRect(r.x, L.CEIL_Y, r.w, L.FLOOR_Y - L.CEIL_Y);
      g.fillStyle(0x000000, 0.25).fillRect(r.x, L.CEIL_Y, r.w, 2);           // ceiling shadow
      g.fillStyle(0xfff2a8, 1).fillRect(r.x + r.w / 2 - 2, L.CEIL_Y, 4, 1);   // lamp
      g.fillStyle(0x6b6f84, 1).fillRect(r.x + 1, L.CEIL_Y + 8, r.w - 2, 1);   // pipe
      return { ...r, cx: r.x + r.w / 2, stationX: r.x + 8, standX: r.x + 19 };
    });
    // walls between rooms, with a doorway at floor level
    for (let i = 0; i < this.rooms.length - 1; i++) {
      const wx = this.rooms[i].x + this.rooms[i].w;
      g.fillStyle(0x4b4f63, 1).fillRect(wx, L.CEIL_Y, 2, L.FLOOR_Y - L.CEIL_Y - 14);
      g.fillStyle(0x2b2e3b, 1).fillRect(wx, L.FLOOR_Y - 15, 2, 1);
    }
    g.fillStyle(0x8d91a6, 1).fillRect(x0 + 3, L.FLOOR_Y, w - 6, 2);
    g.fillStyle(0x34374a, 1).fillRect(x0 + 3, L.FLOOR_Y + 2, w - 6, 2);
    this.interior = g;

    this.labels = this.rooms.map((r) => scene.add.bitmapText(r.cx, L.CEIL_Y + 2, FONT_KEY, r.label, 6).setOrigin(0.5, 0).setDepth(11).setTint(0x9aa0b8));
    this.stations = {};
    for (const r of this.rooms) {
      this.stations[r.id] = scene.add.image(r.stationX, L.FLOOR_Y, 'st_' + r.id).setOrigin(0.5, 1).setDepth(11);
    }
    this.bubbles = {};
    for (const r of this.rooms) {
      const b = scene.add.image(r.cx, L.CEIL_Y + 18, 'bubble').setDepth(14).setVisible(false);
      scene.tweens.add({ targets: b, y: b.y - 2, duration: 350, yoyo: true, repeat: -1 });
      this.bubbles[r.id] = b;
    }
    // working sparks
    this.sparks = scene.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 }, lifespan: 300, gravityY: 120,
      tint: [0xffe27a, 0xff9a3d, 0xffffff], frequency: 60, emitting: false,
    }).setDepth(15);

    // --- exterior ---------------------------------------------------------
    this.exterior = scene.add.image(x0, top, 'ship_ext').setOrigin(0).setDepth(16);
    this.warnLight = scene.add.rectangle(x0 + w / 2, top + 6, 4, 2, 0xff3030).setDepth(17).setVisible(false);
    this.exhaust = scene.add.particles(x0 + 6, top + 20, 'px2', {
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
      const z = scene.add.zone(r.x, L.CEIL_Y, r.w, L.FLOOR_Y - L.CEIL_Y + 4).setOrigin(0).setDepth(30);
      z.on('pointerdown', () => onRoomTap(r.id));
      return z;
    });
    this.shipZone = scene.add.zone(x0, L.DRILL_TIP_Y, w, bot - L.DRILL_TIP_Y).setOrigin(0).setDepth(30);
    this.shipZone.on('pointerdown', () => onShipTap());
  }

  room(id) { return this.rooms.find((r) => r.id === id); }

  setInside(inside, ms) {
    this.scene.tweens.add({ targets: [this.exterior], alpha: inside ? 0 : 1, duration: ms, ease: 'Sine.easeInOut' });
    for (const z of this.roomZones) inside ? z.setInteractive() : z.disableInteractive();
    inside ? this.shipZone.disableInteractive() : this.shipZone.setInteractive();
  }

  /** alerts: { engine, drill, tools } booleans */
  update(dt, speed, blocked, alerts, venting, time) {
    // drill animation speed follows actual speed (spins even while grinding)
    this.drillAcc += dt * (speed * 18);
    if (this.drillAcc >= 1) { this.drillAcc %= 1; this.drillFrame = (this.drillFrame + 1) % 3; this.drill.setTexture('drill' + this.drillFrame); }
    this.drill.x = 90 + (speed > 0.05 ? (Math.random() < 0.5 ? 0 : (blocked ? 1 : 0)) : 0);
    this.chips.emitting = speed > 0.05;
    this.chips.frequency = Math.max(15, 80 - speed * 70);

    for (const id of Object.keys(this.bubbles)) this.bubbles[id].setVisible(!!alerts[id]);
    const anyAlert = alerts.engine || alerts.drill || alerts.tools;
    this.warnLight.setVisible(anyAlert && Math.floor(time / 250) % 2 === 0 && this.exterior.alpha > 0.5);
    this.exhaust.emitting = venting;
  }
}
