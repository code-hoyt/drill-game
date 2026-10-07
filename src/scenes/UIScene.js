// HUD overlay (unaffected by the game camera's pan/zoom): depth, gauges,
// alert icons, toasts, throttle (outside view), station actions (inside view).
import { GAME_W, GAME_H, TUNING as T, LAYOUT as L, loadBest } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';

const TRACK = { x: 160, y: 134, w: 14, h: 138 }; // throttle slider track
const ROOM_NAMES = Object.fromEntries(L.ROOMS.map((r) => [r.id, r.name]));

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.g = this.scene.get('Game');
    const txt = (x, y, s, size = 6, tint = 0xffffff) => this.add.bitmapText(x, y, FONT_KEY, s, size).setTint(tint);

    // --- top bar --------------------------------------------------------------
    this.add.rectangle(0, 0, GAME_W, 24, 0x0d0b12, 0.88).setOrigin(0);
    this.add.rectangle(0, 24, GAME_W, 1, 0x3a3348).setOrigin(0);
    txt(4, 3, 'DEPTH', 6, 0x9aa0b8);
    this.bestText = txt(30, 3, `BEST ${loadBest()}M`, 6, 0x4fd1c5);
    this.depthText = txt(4, 11, '0M', 12, 0xffffff);
    this.bars = this.add.graphics();
    txt(106, 3, 'HULL', 6, 0x9aa0b8); txt(106, 10, 'HEAT', 6, 0x9aa0b8); txt(106, 17, 'BIT', 6, 0x9aa0b8);

    // --- alert icons ------------------------------------------------------------
    this.icons = ['hull', 'heat', 'bit', 'rock', 'hard'].map((k) => ({ k, img: this.add.image(0, 28, 'ic_' + k).setOrigin(0).setVisible(false) }));

    // --- toast ------------------------------------------------------------------
    this.toastBg = this.add.graphics().setVisible(false);
    this.toastText = txt(GAME_W / 2, 50, '', 6).setOrigin(0.5).setVisible(false);
    this.toastTimer = 0;

    // --- view toggle ------------------------------------------------------------
    this.toggleBtn = new Button(this, 4, 300, 46, 16, 'INSIDE', { onTap: () => this.g.toggleView(), color: 0x7a3320, pressColor: 0xb5532f });

    // --- outside: throttle --------------------------------------------------------
    this.outside = [];
    this.plus = new Button(this, 156, 114, 22, 16, '+', { size: 12, onTap: () => this.g.nudgeThrottle(T.THROTTLE_STEP) });
    this.minus = new Button(this, 156, 276, 22, 16, '-', { size: 12, onTap: () => this.g.nudgeThrottle(-T.THROTTLE_STEP) });
    this.trackGfx = this.add.graphics();
    this.speedLabel = txt(167, 298, 'SPD', 6, 0x9aa0b8).setOrigin(0.5, 0);
    this.speedText = txt(167, 306, '0%', 6).setOrigin(0.5, 0);
    this.trackZone = this.add.zone(TRACK.x - 6, TRACK.y - 2, TRACK.w + 10, TRACK.h + 4).setOrigin(0).setInteractive();
    this.dragId = null;
    const setFromPointer = (p) => this.g.setThrottle(1 - (p.y - TRACK.y) / TRACK.h);
    this.trackZone.on('pointerdown', (p) => { this.dragId = p.id; setFromPointer(p); });
    this.input.on('pointermove', (p) => { if (this.dragId === p.id && p.isDown) setFromPointer(p); });
    this.input.on('pointerup', (p) => { if (this.dragId === p.id) this.dragId = null; });

    // --- inside: station panel ------------------------------------------------------
    this.panel = this.add.rectangle(0, 237, GAME_W, 60, 0x0d0b12, 0.88).setOrigin(0);
    this.panelLine = this.add.rectangle(0, 237, GAME_W, 1, 0x3a3348).setOrigin(0);
    this.stationText = txt(6, 242, '', 6);
    this.hintText = txt(6, 251, 'TAP A ROOM TO WALK THERE', 6, 0x7a7f96);
    const hold = (action) => ({ onDown: () => this.g.setHold(action), onUp: () => { if (this.g.hold === action) this.g.setHold(null); } });
    this.actionBtns = {
      vent:   new Button(this, 8, 262, 164, 22, 'HOLD: VENT HEAT', { ...hold('vent'), color: 0x8a2f24, pressColor: 0xc4503a }),
      repair: new Button(this, 8, 262, 164, 22, 'HOLD: FIX DRILL BIT', { ...hold('repair'), color: 0x2f5a8a, pressColor: 0x4a84c4 }),
      patch:  new Button(this, 8, 262, 80, 22, 'HOLD: PATCH', { ...hold('patch'), color: 0x2f7a3a, pressColor: 0x4ab05a }),
      blast:  new Button(this, 92, 262, 80, 22, 'HOLD: BLAST', { ...hold('blast'), color: 0x6a3a8a, pressColor: 0x9a5ac4 }),
    };
    this.insideSpeed = txt(176, 306, '', 6, 0x9aa0b8).setOrigin(1, 0);

    this.lastMode = null;
  }

  setMode(inside) {
    this.toggleBtn.setLabel(inside ? 'OUTSIDE' : 'INSIDE');
    [this.plus, this.minus].forEach((b) => b.setVisible(!inside));
    [this.trackGfx, this.speedLabel, this.speedText].forEach((o) => o.setVisible(!inside));
    inside ? this.trackZone.disableInteractive() : this.trackZone.setInteractive();
    [this.panel, this.panelLine, this.stationText, this.hintText, this.insideSpeed].forEach((o) => o.setVisible(inside));
    if (!inside) Object.values(this.actionBtns).forEach((b) => b.setVisible(false));
  }

  update(time, delta) {
    const g = this.g, s = g.state;
    if (!s) return;
    const inside = g.view.inside;
    if (inside !== this.lastMode) { this.setMode(inside); this.lastMode = inside; }

    // top bar
    this.depthText.setText(`${Math.floor(s.depth)}M`);
    const b = this.bars.clear();
    const bar = (y, v, color, warn) => {
      b.fillStyle(0x000000, 1).fillRect(124, y, 52, 5);
      const flash = warn && Math.floor(time / 200) % 2 === 0;
      b.fillStyle(flash ? 0xffffff : color, 1).fillRect(125, y + 1, Math.round(50 * v), 3);
    };
    bar(3, s.hull / T.HULL_MAX, s.hull > 50 ? 0x4ad66d : s.hull > T.HULL_ALERT ? 0xffc35c : 0xff4a4a, s.hull <= T.HULL_ALERT);
    bar(10, s.heat / T.HEAT_MAX, 0xff6b3d, s.heat >= T.HEAT_ALERT);
    bar(17, s.wear / T.WEAR_MAX, 0xffb347, s.wear >= T.WEAR_ALERT);

    // alerts
    const a = g.alerts();
    const active = { hull: a.hull, heat: a.engine, bit: a.drill, rock: a.rock, hard: a.hard };
    let x = 4;
    const blink = Math.floor(time / 300) % 2 === 0;
    for (const ic of this.icons) {
      const on = active[ic.k];
      ic.img.setVisible(on);
      if (on) { ic.img.x = x; x += 13; ic.img.setAlpha(blink ? 1 : 0.55); }
    }

    // toasts
    if (g.toasts.length) {
      const t = g.toasts.shift();
      this.toastText.setText(t.text).setTint(t.color).setVisible(true);
      const w = this.toastText.width + 8;
      this.toastBg.clear().fillStyle(0x000000, 0.75).fillRect(Math.round(GAME_W / 2 - w / 2), 44, Math.round(w), 11).setVisible(true);
      this.toastTimer = 1800;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastTimer <= 0) { this.toastText.setVisible(false); this.toastBg.setVisible(false); }
    }

    if (inside) this.updateInside(g, s); else this.drawThrottle(s);
  }

  drawThrottle(s) {
    const t = this.trackGfx.clear(), { x, y, w, h } = TRACK;
    t.fillStyle(0x0b0b10, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    const safeH = Math.round(h * T.RAM_SAFE_SPEED);
    t.fillStyle(0x1f3a26, 1).fillRect(x, y + h - safeH, w, safeH);       // safe-to-ram zone
    t.fillStyle(0x3a1f22, 1).fillRect(x, y, w, h - safeH);               // danger zone
    const fillH = Math.round(h * s.throttle);
    t.fillStyle(s.throttle <= T.RAM_SAFE_SPEED ? 0x4ad66d : 0xff8a3d, 0.75).fillRect(x + 3, y + h - fillH, w - 6, fillH);
    for (let i = 1; i < 10; i++) t.fillStyle(0x000000, 0.5).fillRect(x, y + Math.round(h * i / 10), 3, 1);
    // actual speed marker (white tick) vs requested throttle (handle)
    const sy = y + h - Math.round(h * s.speed);
    t.fillStyle(0xffffff, 1).fillRect(x - 3, sy, 3, 1);
    const hy = y + h - fillH;
    t.fillStyle(0x0b0b10, 1).fillRect(x - 3, hy - 3, w + 6, 7);
    t.fillStyle(0xd8dbe8, 1).fillRect(x - 2, hy - 2, w + 4, 5);
    t.fillStyle(0x80839a, 1).fillRect(x - 2, hy + 1, w + 4, 2);
    this.speedText.setText(`${Math.round(s.throttle * 100)}%`);
    this.plus.setEnabled(s.throttle < 1);
    this.minus.setEnabled(s.throttle > 0);
  }

  updateInside(g, s) {
    const c = g.crew;
    const station = c.station;
    const show = (ids) => Object.entries(this.actionBtns).forEach(([k, btn]) => btn.setVisible(ids.includes(k)));
    if (!station) {
      this.stationText.setText(`WALKING TO ${ROOM_NAMES[c.target]}...`).setTint(0xc8c8d8);
      show([]);
    } else if (station === 'engine') {
      this.stationText.setText(`ENGINE   HEAT ${Math.round(s.heat)}%`).setTint(s.heat >= T.HEAT_ALERT ? 0xff8a5c : 0xffffff);
      show(['vent']);
      this.actionBtns.vent.setEnabled(s.heat > 0);
    } else if (station === 'drill') {
      this.stationText.setText(`DRILL   BIT WEAR ${Math.round(s.wear)}%`).setTint(s.wear >= T.WEAR_ALERT ? 0xffc35c : 0xffffff);
      show(['repair']);
      this.actionBtns.repair.setEnabled(s.wear > 0);
    } else if (station === 'tools') {
      const rocks = g.obstacles.list.filter((o) => o.sprite.y > 10).length;
      this.stationText.setText(`TOOLS   HULL ${Math.round(s.hull)}%  ROCKS ${rocks}`).setTint(s.hull <= T.HULL_ALERT ? 0xff4a7a : 0xffffff);
      show(['patch', 'blast']);
      this.actionBtns.patch.setEnabled(s.hull < T.HULL_MAX);
      this.actionBtns.blast.setEnabled(!!g.obstacles.target());
      this.actionBtns.blast.setProgress(g.blastCharge / T.BLAST_TIME);
    }
    // release a hold whose button just got disabled
    if (g.hold && !Object.entries(this.actionBtns).some(([k, b]) => k === g.hold && b.enabled && b.gfx.visible)) g.setHold(null);
    this.insideSpeed.setText(`SPD ${Math.round(s.speed * 100)}%`);
  }
}
