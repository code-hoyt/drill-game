// HUD overlay (unaffected by the game camera's pan/zoom): depth, gauges,
// alert icons, toasts, throttle (outside view + HELM station inside),
// station actions (inside view), pilot status bar (both views).
import { GAME_W, GAME_H, TUNING as T, LAYOUT as L, ORE, EVENTS as E, loadBest } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';

const VTRACK = { x: 160, y: 134, w: 14, h: 138 }; // outside view: vertical slider
const HTRACK = { x: 34, y: 260, w: 112, h: 12 };  // inside view at HELM: horizontal slider
const PANEL_Y = 232;                               // inside station panel top
const BAR_Y = 303;                                 // bottom status bar (both views)
const ROOM_NAMES = Object.fromEntries(L.ROOMS.map((r) => [r.id, r.name]));

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.g = this.scene.get('Game');
    const txt = (x, y, s, size = 6, tint = 0xffffff) => this.add.bitmapText(x, y, FONT_KEY, s, size).setTint(tint);
    this.txt = txt;

    // --- top bar --------------------------------------------------------------
    this.add.rectangle(0, 0, GAME_W, 24, 0x0d0b12, 0.88).setOrigin(0);
    this.add.rectangle(0, 24, GAME_W, 1, 0x3a3348).setOrigin(0);
    txt(4, 3, 'DEPTH', 6, 0x9aa0b8);
    this.bestText = txt(30, 3, `BEST ${loadBest()}M`, 6, 0x4fd1c5);
    this.depthText = txt(4, 11, '0M', 12, 0xffffff);
    this.haulText = txt(58, 11, '0 CR', 6, 0xffd23f);
    this.payText = txt(58, 18, 'PAY X1.0', 6, 0x7fe0ff);
    this.bars = this.add.graphics();
    txt(106, 3, 'HULL', 6, 0x9aa0b8); txt(106, 10, 'HEAT', 6, 0x9aa0b8); txt(106, 17, 'BIT', 6, 0x9aa0b8);

    // --- alert icons ------------------------------------------------------------
    this.icons = ['fire', 'surge', 'jam', 'hull', 'heat', 'bit', 'rock', 'hard', 'ore'].map((k) => ({ k, img: this.add.image(0, 28, 'ic_' + k).setOrigin(0).setVisible(false) }));

    // --- vein chip (top right): where the vein is vs the drill tip --------------------------
    this.chipBg = this.add.graphics();
    this.chipText = txt(176, 30, '', 6).setOrigin(1, 0);

    // --- surge card (both views): a decision with a countdown --------------------------------
    this.surgeBg = this.add.graphics().setDepth(48);
    this.surgeTitle = txt(GAME_W / 2, 60, '', 6, 0xe08aff).setOrigin(0.5, 0).setDepth(49);
    this.surgeSub = txt(GAME_W / 2, 69, 'PICK ONE OR IT BLOWS OUT', 6, 0x9aa0b8).setOrigin(0.5, 0).setDepth(49);
    this.surgeBtns = [
      new Button(this, 8, 79, 80, 22, 'OVERCLOCK', { onTap: () => this.g.resolveSurge('overclock'), color: 0x6a2a8a, pressColor: 0x9a4ac4 }),
      new Button(this, 92, 79, 80, 22, 'SHUT DOWN', { onTap: () => this.g.resolveSurge('shutdown'), color: 0x2a5a8a, pressColor: 0x4a84c4 }),
    ];
    this.surgeHint = txt(GAME_W / 2, 104, `FAST+PAY X${E.OVERCLOCK_PAY} / HOT    STOP ${E.SHUTDOWN_S}S / COOL`, 6, 0x7a7f96).setOrigin(0.5, 0).setDepth(49);
    this.showSurge(false);

    // --- toast ------------------------------------------------------------------
    this.toastBg = this.add.graphics().setVisible(false);
    this.toastText = txt(GAME_W / 2, 50, '', 6).setOrigin(0.5).setVisible(false);
    this.toastTimer = 0;

    // --- bottom status bar (both views) -------------------------------------------
    this.add.rectangle(0, BAR_Y, GAME_W, GAME_H - BAR_Y, 0x0d0b12, 0.92).setOrigin(0);
    this.add.rectangle(0, BAR_Y, GAME_W, 1, 0x3a3348).setOrigin(0);
    this.toggleBtn = new Button(this, 2, BAR_Y + 2, 44, 14, 'INSIDE', { onTap: () => this.g.toggleView(), color: 0x7a3320, pressColor: 0xb5532f });
    this.pilotBtn = new Button(this, 49, BAR_Y + 2, 84, 14, 'NO PILOT: GO TO HELM', { onTap: () => this.g.sendPilot(), color: 0x8a2f24, pressColor: 0xc4503a });
    this.pilotText = txt(91, BAR_Y + 6, '', 6).setOrigin(0.5, 0);
    this.speedText = txt(177, BAR_Y + 6, '', 6).setOrigin(1, 0);
    this.speedLock = this.add.image(0, BAR_Y + 5, 'lock').setOrigin(1, 0);

    // --- outside: vertical throttle ------------------------------------------------
    this.plus = new Button(this, 156, 114, 22, 16, '+', { size: 12, onTap: () => this.g.nudgeThrottle(T.THROTTLE_STEP) });
    this.minus = new Button(this, 156, 276, 22, 16, '-', { size: 12, onTap: () => this.g.nudgeThrottle(-T.THROTTLE_STEP) });
    this.vGfx = this.add.graphics();
    this.vLock = this.add.image(VTRACK.x + VTRACK.w / 2, 186, 'lock').setScale(2);
    this.vLockText1 = txt(167, 198, 'NO', 6, 0xff5a5a).setOrigin(0.5, 0);
    this.vLockText2 = txt(167, 205, 'PILOT', 6, 0xff5a5a).setOrigin(0.5, 0);
    this.vZone = this.add.zone(VTRACK.x - 6, VTRACK.y - 2, VTRACK.w + 10, VTRACK.h + 4).setOrigin(0).setInteractive();
    this.dragId = null;
    this.dragAxis = null;
    this.vZone.on('pointerdown', (p) => this.startDrag(p, 'v'));

    // --- inside: station panel -------------------------------------------------------
    this.panel = this.add.rectangle(0, PANEL_Y, GAME_W, BAR_Y - PANEL_Y, 0x0d0b12, 0.88).setOrigin(0);
    this.panelLine = this.add.rectangle(0, PANEL_Y, GAME_W, 1, 0x3a3348).setOrigin(0);
    this.stationText = txt(6, PANEL_Y + 4, '', 6);
    this.hintText = txt(6, PANEL_Y + 13, '', 6, 0x7a7f96);
    const hold = (action) => ({ onDown: () => this.g.setHold(action), onUp: () => { if (this.g.hold === action) this.g.setHold(null); } });
    const AY = PANEL_Y + 25;
    // key = button id; .action = the hold it drives (two layouts of FIX BIT share 'repair')
    this.actionBtns = {
      vent:   new Button(this, 8, AY, 164, 22, 'HOLD: VENT HEAT', { ...hold('vent'), color: 0x8a2f24, pressColor: 0xc4503a }),
      repair: new Button(this, 8, AY, 164, 22, 'HOLD: FIX DRILL BIT', { ...hold('repair'), color: 0x2f5a8a, pressColor: 0x4a84c4 }),
      patch:  new Button(this, 8, AY, 80, 22, 'HOLD: PATCH', { ...hold('patch'), color: 0x2f7a3a, pressColor: 0x4ab05a }),
      blast:  new Button(this, 92, AY, 80, 22, 'HOLD: BLAST', { ...hold('blast'), color: 0x6a3a8a, pressColor: 0x9a5ac4 }),
      extract: new Button(this, 8, AY, 104, 22, 'HOLD: EXTRACT', { ...hold('extract'), color: 0x8a6a1a, pressColor: 0xc49a2a }),
      freebit: new Button(this, 8, AY, 104, 22, 'HOLD: FREE BIT', { ...hold('freebit'), color: 0x56627e, pressColor: 0x7a8ab0 }),
      repair2: new Button(this, 116, AY, 56, 22, 'FIX BIT', { ...hold('repair'), color: 0x2f5a8a, pressColor: 0x4a84c4 }),
      extinguish: new Button(this, 8, AY, 164, 22, 'HOLD: EXTINGUISH', { ...hold('extinguish'), color: 0xa0401a, pressColor: 0xe0602a }),
    };
    for (const [k, b] of Object.entries(this.actionBtns)) b.action = k === 'repair2' ? 'repair' : k;
    this.veinBars = this.add.graphics();
    this.barLabels = [txt(6, PANEL_Y + 13, 'ORE', 6, 0xffd23f), txt(90, PANEL_Y + 13, 'RISK', 6, 0xff4a4a)];
    this.barLabels.forEach((o) => o.setVisible(false));
    // HELM action area: horizontal throttle with -/+ buttons
    this.hMinus = new Button(this, 6, AY, 24, 22, '-', { size: 12, onTap: () => this.g.nudgeThrottle(-T.THROTTLE_STEP) });
    this.hPlus = new Button(this, 150, AY, 24, 22, '+', { size: 12, onTap: () => this.g.nudgeThrottle(T.THROTTLE_STEP) });
    this.hGfx = this.add.graphics();
    this.hZone = this.add.zone(HTRACK.x - 3, AY, HTRACK.w + 6, 22).setOrigin(0); // a little past both ends so 0% / 100% are easy to hit
    this.hZone.on('pointerdown', (p) => this.startDrag(p, 'h'));

    this.input.on('pointermove', (p) => { if (this.dragId === p.id && p.isDown) this.dragTo(p); });
    this.input.on('pointerup', (p) => { if (this.dragId === p.id) this.dragId = null; });

    this.shakeUntil = 0;
    this.lastPing = this.g.lockedPing;
    this.lastMode = null;
  }

  startDrag(p, axis) {
    if (!this.g.setThrottleFromUI(this.valueFor(p, axis))) return; // locked: feedback handled by Game
    this.dragId = p.id; this.dragAxis = axis;
  }
  dragTo(p) { this.g.setThrottleFromUI(this.valueFor(p, this.dragAxis)); }
  valueFor(p, axis) {
    return axis === 'v' ? 1 - (p.y - VTRACK.y) / VTRACK.h : (p.x - HTRACK.x) / HTRACK.w;
  }

  setMode(inside) {
    this.toggleBtn.setLabel(inside ? 'OUTSIDE' : 'INSIDE');
    [this.plus, this.minus].forEach((b) => b.setVisible(!inside));
    this.vGfx.setVisible(!inside);
    inside ? this.vZone.disableInteractive() : this.vZone.setInteractive();
    [this.panel, this.panelLine, this.stationText, this.hintText].forEach((o) => o.setVisible(inside));
    if (!inside) { Object.values(this.actionBtns).forEach((b) => b.setVisible(false)); this.showHelmControls(false); this.veinBars.clear(); this.barLabels.forEach((o) => o.setVisible(false)); }
  }

  showSurge(v) {
    if (this.surgeShown === v) return;
    this.surgeShown = v;
    [this.surgeBg, this.surgeTitle, this.surgeSub, this.surgeHint].forEach((o) => o.setVisible(v));
    this.surgeBtns.forEach((b) => b.setVisible(v));
  }

  /** Vein chip text + colour: where the vein is relative to the drill tip. */
  veinChip(g, s, time) {
    const V = g.veins, v = V.current;
    if (!v) return null;
    const d = V.dist(v), n = v.def.name;
    if (v.state === 'stopped') {
      if (g.hold === 'extract' && g.crew.working) return [`EXTRACTING ${Math.round(v.taken * 100)}%`, 0xffd23f];
      return ['STOPPED AT VEIN', 0x8affa0];
    }
    if (V.inWindow(v)) return [Math.floor(time / 200) % 2 ? 'STOP ZONE: BRAKE!' : `${n} VEIN: STOP!`, Math.floor(time / 200) % 2 ? 0xffffff : 0x8affa0];
    return [`${n} VEIN ${Math.max(0, Math.round(d))}M`, v.def.tint];
  }

  showHelmControls(v) {
    if (this.hMinus.gfx.visible !== v || this.hGfx.visible !== v) {
      this.hMinus.setVisible(v); this.hPlus.setVisible(v); this.hGfx.setVisible(v);
      v ? this.hZone.setInteractive() : this.hZone.disableInteractive();
    }
  }

  update(time, delta) {
    const g = this.g, s = g.state;
    if (!s) return;
    const inside = g.view.inside;
    if (inside !== this.lastMode) { this.setMode(inside); this.lastMode = inside; }
    if (g.lockedPing !== this.lastPing) { this.lastPing = g.lockedPing; this.shakeUntil = time + 350; }
    const piloted = g.piloted;

    // top bar
    this.depthText.setText(`${Math.floor(s.depth)}M`);
    const b = this.bars.clear();
    const bar = (y, v, color, warn) => {
      b.fillStyle(0x000000, 1).fillRect(124, y, 52, 5);
      const flash = warn && Math.floor(time / 200) % 2 === 0;
      b.fillStyle(flash ? 0xffffff : color, 1).fillRect(125, y + 1, Math.round(50 * v), 3);
    };
    this.haulText.setText(`${Math.floor(s.haul)} CR`);
    this.payText.setText(`PAY X${s.payMult.toFixed(1)}`);
    bar(3, Math.min(1, s.hull / s.maxHull), s.hull > 50 ? 0x4ad66d : s.hull > T.HULL_ALERT ? 0xffc35c : 0xff4a4a, s.hull <= T.HULL_ALERT);
    bar(10, s.heat / T.HEAT_MAX, 0xff6b3d, s.heat >= T.HEAT_ALERT);
    bar(17, s.wear / T.WEAR_MAX, 0xffb347, s.wear >= T.WEAR_ALERT);

    // alerts
    const a = g.alerts();
    const active = { hull: a.hull, heat: s.heat >= T.HEAT_ALERT, bit: s.wear >= T.WEAR_ALERT, rock: a.rock, hard: a.hard, ore: a.ore, fire: a.fire, jam: a.jam, surge: a.surge };
    let x = 4;
    const blink = Math.floor(time / 300) % 2 === 0;
    for (const ic of this.icons) {
      const on = active[ic.k];
      ic.img.setVisible(on);
      if (on) { ic.img.x = x; x += 13; ic.img.setAlpha(blink ? 1 : 0.55); }
    }

    // vein chip
    const chip = this.veinChip(g, s, time);
    this.chipBg.clear(); this.chipText.setVisible(!!chip);
    if (chip) {
      this.chipText.setText(chip[0]).setTint(chip[1]);
      const w = this.chipText.width + 6;
      this.chipBg.fillStyle(0x000000, 0.75).fillRect(Math.round(179 - w), 28, Math.round(w), 10).fillStyle(chip[1], 1).fillRect(Math.round(179 - w), 28, 1, 10);
    }

    // surge decision card
    const sg = g.director.surge;
    this.showSurge(!!sg);
    if (sg) {
      const flash = Math.floor(time / 250) % 2 === 0;
      this.surgeBg.clear().fillStyle(0x000000, 0.85).fillRect(4, 57, 172, 56).lineStyle(1, flash ? 0xe08aff : 0x6a2a8a, 1).strokeRect(4.5, 57.5, 171, 55);
      this.surgeTitle.setText(`POWER SURGE!  ${Math.ceil(sg.t)}S`);
    }

    // toasts (each stays readable for at least 0.6 s; queue capped at 3)
    if (g.toasts.length > 3) g.toasts.splice(0, g.toasts.length - 3);
    if (g.toasts.length && this.toastTimer < 1200) {
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

    // bottom bar: pilot status + speed
    this.pilotBtn.setVisible(!piloted && !g.pilotEnRoute);
    this.pilotBtn.setProgress(!piloted && time - g.lockedPing < 1200 && Math.floor(time / 150) % 2 === 0 ? 1 : 0);
    this.pilotText.setVisible(piloted || g.pilotEnRoute);
    if (piloted) this.pilotText.setText(g.crew.station === 'helm' ? 'PILOT AT HELM' : 'PILOT AT DRL (LINKAGE)').setTint(0x8affa0);
    else if (g.pilotEnRoute) this.pilotText.setText('PILOT EN ROUTE...').setTint(0xffc35c);
    const spd = `SPD ${Math.round(s.throttle * 100)}%`;
    this.speedText.setText(spd).setTint(piloted ? 0xffffff : 0x9aa0b8);
    this.speedLock.setVisible(!piloted).setX(177 - this.speedText.width - 2);

    if (inside) this.updateInside(g, s, time); else this.drawVThrottle(s, piloted, time);
  }

  shakeX(time) { return time < this.shakeUntil ? Math.round(Math.sin(time * 0.09) * 2) : 0; }

  drawVThrottle(s, piloted, time) {
    const t = this.vGfx.clear(), { y, w, h } = VTRACK;
    const x = VTRACK.x + this.shakeX(time);
    const safeH = Math.round(h * s.safeThrottle);
    const fillH = Math.round(h * s.throttle);
    t.fillStyle(0x0b0b10, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    t.fillStyle(piloted ? 0x1f3a26 : 0x1c1f22, 1).fillRect(x, y + h - safeH, w, safeH);   // safe-to-ram zone
    t.fillStyle(piloted ? 0x3a1f22 : 0x221c1e, 1).fillRect(x, y, w, h - safeH);           // danger zone
    const fillCol = !piloted ? 0x6a6c78 : s.throttle <= s.safeThrottle + 1e-6 ? 0x4ad66d : 0xff8a3d;
    t.fillStyle(fillCol, piloted ? 0.75 : 0.5).fillRect(x + 3, y + h - fillH, w - 6, fillH);
    for (let i = 1; i < 10; i++) t.fillStyle(0x000000, 0.5).fillRect(x, y + Math.round(h * i / 10), 3, 1);
    const sy = y + h - Math.round(h * s.speed);                 // actual speed tick
    t.fillStyle(0xffffff, piloted ? 1 : 0.5).fillRect(x - 3, sy, 3, 1);
    const hy = y + h - fillH;                                   // handle = requested throttle
    t.fillStyle(0x0b0b10, 1).fillRect(x - 3, hy - 3, w + 6, 7);
    t.fillStyle(piloted ? 0xd8dbe8 : 0x6a6c78, 1).fillRect(x - 2, hy - 2, w + 4, 5);
    t.fillStyle(piloted ? 0x80839a : 0x44464f, 1).fillRect(x - 2, hy + 1, w + 4, 2);
    // lock overlay
    [this.vLock, this.vLockText1, this.vLockText2].forEach((o) => o.setVisible(!piloted));
    if (!piloted) {
      t.fillStyle(0x0b0b10, 0.85).fillRect(x - 3, 180, w + 6, 32);
      this.vLock.x = x + w / 2; this.vLockText1.x = x + w / 2; this.vLockText2.x = x + w / 2;
    }
    this.plus.setDimmed(!piloted || s.throttle >= 1);
    this.minus.setDimmed(!piloted || s.throttle <= 0);
  }

  drawHThrottle(s, time) {
    const t = this.hGfx.clear(), { y, w, h } = HTRACK;
    const x = HTRACK.x + this.shakeX(time);
    const safeW = Math.round(w * s.safeThrottle);
    const fillW = Math.round(w * s.throttle);
    t.fillStyle(0x0b0b10, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    t.fillStyle(0x1f3a26, 1).fillRect(x, y, safeW, h);
    t.fillStyle(0x3a1f22, 1).fillRect(x + safeW, y, w - safeW, h);
    t.fillStyle(s.throttle <= s.safeThrottle + 1e-6 ? 0x4ad66d : 0xff8a3d, 0.75).fillRect(x, y + 3, fillW, h - 6);
    for (let i = 1; i < 10; i++) t.fillStyle(0x000000, 0.5).fillRect(x + Math.round(w * i / 10), y + h - 3, 1, 3);
    t.fillStyle(0xffffff, 1).fillRect(x + Math.round(w * s.speed), y + h, 1, 3); // actual speed tick
    const hx = x + fillW;
    t.fillStyle(0x0b0b10, 1).fillRect(hx - 3, y - 3, 7, h + 6);
    t.fillStyle(0xd8dbe8, 1).fillRect(hx - 2, y - 2, 5, h + 4);
    t.fillStyle(0x80839a, 1).fillRect(hx + 1, y - 2, 2, h + 4);
    this.hPlus.setDimmed(s.throttle >= 1);
    this.hMinus.setDimmed(s.throttle <= 0);
  }

  updateInside(g, s, time) {
    const c = g.crew;
    const station = c.station;
    const show = (ids) => Object.entries(this.actionBtns).forEach(([k, btn]) => btn.setVisible(ids.includes(k)));
    const fire = station && g.director.fires[station];
    this.showHelmControls(station === 'helm' && !fire);
    this.hintText.setText('TAP A ROOM TO WALK THERE').setTint(0x7a7f96).setVisible(true);
    this.veinBars.clear(); this.barLabels.forEach((o) => o.setVisible(false));
    const vein = g.veins.current, stopped = g.veins.stopped;
    if (!station) {
      this.stationText.setText(`WALKING TO ${ROOM_NAMES[c.target]}...`).setTint(0xc8c8d8);
      show([]);
    } else if (fire) {
      this.stationText.setText(`FIRE IN ${ROOM_NAMES[station]}!`).setTint(Math.floor(time / 250) % 2 ? 0xff6a3a : 0xffd23f);
      this.hintText.setText('STATION DOWN. PUT IT OUT BEFORE IT SPREADS');
      show(['extinguish']);
      this.actionBtns.extinguish.setEnabled(true).setProgress(fire.put / g.director.putOutTime(station));
    } else if (station === 'helm') {
      this.stationText.setText(`HELM   SPEED ${Math.round(s.throttle * 100)}%`).setTint(s.throttle > s.safeThrottle + 1e-6 ? 0xffc35c : 0x8affa0);
      const j = g.director.jam;
      if (j) this.hintText.setText(`JAMMED: ROCK 0% THEN ${Math.round(E.JAM_ROCK_HIGH * 100)}%+  ${j.rocks}/${E.JAM_ROCKS}`).setTint(0xffc35c);
      else if (s.shutdownT > 0) this.hintText.setText(`ENGINE OFF: RESTART IN ${Math.ceil(s.shutdownT)}S`).setTint(0x7fe0ff);
      else if (stopped) this.hintText.setText(stopped.taken >= 1 ? 'VEIN DONE. SPEED UP' : 'STOPPED AT VEIN. GO TO DRL').setTint(0x8affa0);
      else if (vein && g.veins.dist(vein) < 45) this.hintText.setText(g.veins.inWindow(vein) ? 'IN THE STOP ZONE: SPEED 0!' : `VEIN ${Math.max(0, Math.round(g.veins.dist(vein)))}M: STOP IN THE ZONE`).setTint(0xffd23f);
      else this.hintText.setText('DRAG TO SET SPEED. GREEN = SAFE');
      show([]);
      this.drawHThrottle(s, time);
    } else if (station === 'engine') {
      this.stationText.setText(`ENGINE   HEAT ${Math.round(s.heat)}%`).setTint(s.heat >= T.HEAT_ALERT ? 0xff8a5c : 0xffffff);
      show(['vent']);
      this.actionBtns.vent.setEnabled(s.heat > 0);
    } else if (station === 'drill') {
      const canExtract = g.availableActions().includes('extract');
      if (s.jammed) {
        this.stationText.setText('DRILL   BIT JAMMED!').setTint(0xff8a5c);
        this.hintText.setText('SLOW + FREE. OR ROCK THE THROTTLE AT HELM');
        show(['freebit', 'repair2']);
        this.actionBtns.freebit.setEnabled(true).setProgress(g.director.jam.fixT / E.JAM_FIX_S);
      } else if (stopped && stopped.taken < 1) {
        this.stationText.setText(`DRILL   STOPPED AT ${stopped.def.name} VEIN`).setTint(0x8affa0);
        this.hintText.setVisible(false);
        this.drawVeinBars(stopped, time);
        show(['extract', 'repair2']);
        this.actionBtns.extract.setEnabled(canExtract).setProgress(stopped.taken);
      } else if (vein && vein.state !== 'stopped') {
        this.stationText.setText(`DRILL   BIT WEAR ${Math.round(s.wear)}%`).setTint(s.wear >= T.WEAR_ALERT ? 0xffc35c : 0xffffff);
        this.hintText.setText(`${vein.def.name} VEIN ${Math.max(0, Math.round(g.veins.dist(vein)))}M: FULL STOP TO MINE`).setTint(0xffd23f);
        show(['extract', 'repair2']);
        this.actionBtns.extract.setEnabled(false).setProgress(0);
      } else {
        this.stationText.setText(`DRILL   BIT WEAR ${Math.round(s.wear)}%`).setTint(s.wear >= T.WEAR_ALERT ? 0xffc35c : 0xffffff);
        show(['repair']);
      }
      this.actionBtns.repair.setEnabled(s.wear > 0);
      this.actionBtns.repair2.setEnabled(s.wear > 0);
    } else if (station === 'tools') {
      const rocks = g.obstacles.list.filter((o) => o.sprite.y > 10).length;
      this.stationText.setText(`TOOLS   HULL ${Math.round(s.hull)}%  ROCKS ${rocks}`).setTint(s.hull <= T.HULL_ALERT ? 0xff4a7a : 0xffffff);
      show(['patch', 'blast']);
      this.actionBtns.patch.setEnabled(s.hull < s.maxHull);
      this.actionBtns.blast.setEnabled(!s.mods.noBlast && !!g.obstacles.target()).setLabel(s.mods.noBlast ? 'NO BLAST (FOAM)' : 'HOLD: BLAST');
      this.actionBtns.blast.setProgress(g.blastCharge / g.blastTime);
    }
    // release a hold whose button just got disabled/hidden
    if (g.hold && !Object.values(this.actionBtns).some((b) => b.action === g.hold && b.enabled && b.visible)) g.setHold(null);
  }

  /** ORE (taken) and RISK (instability) bars in the drill panel while stopped at a vein. */
  drawVeinBars(v, time) {
    const b = this.veinBars, y = PANEL_Y + 13;
    b.fillStyle(0x3a3020, 1).fillRect(26, y + 1, 58, 5).fillStyle(0xffd23f, 1).fillRect(26, y + 1, Math.round(58 * v.taken), 5);
    const r = Math.min(1, v.inst / ORE.COLLAPSE_AT);
    b.fillStyle(0x3a1a1a, 1).fillRect(114, y + 1, 58, 5).fillStyle(r > 0.7 && Math.floor(time / 120) % 2 ? 0xffffff : 0xff4a4a, 1).fillRect(114, y + 1, Math.round(58 * r), 5);
    this.barLabels.forEach((o) => o.setVisible(true));
  }
}
