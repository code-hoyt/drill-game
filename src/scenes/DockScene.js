// Home base (M2, redesigned): the station concourse. The rig hangs drill-up in the docking bay
// above (as the ascent cutscene frames it after docking); Holt steps out through the airlock lift
// into a small side-view concourse and walks between five labelled spots. Tapping a spot walks
// there and opens its panel (DockUI). The airlock (or the rig itself) opens the RIG BAY parts screen.
import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { loadSave, buyPart, equipPart, reroll, rerollCost, isUnlocked, ackUnlocks, progressOf } from '../systems/Save.js';
import { SLOTS, PARTS, partById, partsForSlot, unlockText } from '../data/parts.js';
import { CONTRACTS } from '../data/contracts.js';
import { ANIM } from '../systems/Settings.js';

const CYAN = 0x7fe0ff, GOLD = 0xffd23f, GREY = 0x9aa0b8, GREEN = 0x8affa0, RED = 0xff5a5a, DIM = 0x6a6278, VIOLET = 0xc9a7ff;

function wrap(text, width) {
  const lines = []; let cur = '';
  for (const w of String(text).split(' ')) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- concourse geometry (base px; the Dock camera is zoom 1, no scroll) --------------------------
export const CONCOURSE = {
  RIG_Y: 82,            // rig container centre: drill tip y 40, hull 62..124 (same framing the ascent ends on)
  ROOF_Y: 134,          // station roof under the rig's hull end (clamps + collar)
  WALL_TOP: 142,        // concourse ceiling
  FLOOR_Y: 238,         // Holt stands here
  WALK_SPEED: 160,      // px/s: farthest pair (board <-> bunk, 144 px) takes 0.9 s
  LIFT_MS: 550,         // airlock lift ride, rig <-> concourse
};
const C = CONCOURSE;
export const SPOTS = [
  { id: 'board',   x: 18,  sign: ['CONTRACT', 'BOARD'],   tint: GOLD,  panel: 'board' },
  { id: 'ines',    x: 54,  sign: ["INES'S", 'WINDOW'],    tint: 0xffc35c, panel: 'ines' },
  { id: 'airlock', x: 90,  sign: ['AIRLOCK', 'RIG BAY'],  tint: CYAN,  panel: 'bay' },
  { id: 'qm',      x: 126, sign: ['QUARTER-', 'MASTER'],  tint: GREEN, panel: 'vendor' },
  { id: 'bunk',    x: 162, sign: ["HOLT'S", 'BUNK'],      tint: VIOLET, panel: 'stats' },
];

export class DockScene extends Phaser.Scene {
  constructor() { super('Dock'); }

  create(data = {}) {
    this.cameras.main.setBackgroundColor('#0a0c14').setRotation(0).setZoom(1).centerOn(GAME_W / 2, GAME_H / 2);
    this.walk = null; this.pending = null; this.walkLog = []; this.boarding = false; this.lifting = false; this.boardT0 = 0;
    this.spots = Object.fromEntries(SPOTS.map((sp) => [sp.id, sp]));
    this.buildBay();
    this.buildConcourse();
    // Holt: steps out of the airlock lift (after docking), or is already on the floor by it
    this.holt = this.add.image(90, C.FLOOR_Y, 'crew_idle').setOrigin(0.5, 1).setDepth(8);
    this.at = 'airlock';
    this.scene.launch('DockUI', data);
    this.ui = this.scene.get('DockUI');
    this.summaryPending = !!data.summary;   // the unlock banner waits until the summary has been seen
    const showSummary = () => {
      if (!data.summary) return;
      this.scene.get('GameOver').events.once('shutdown', () => { this.summaryPending = false; });
      this.scene.launch('GameOver', data.summary);
    };
    if (data.intro) {
      this.cameras.main.fadeIn(180, 0, 0, 0);
      this.liftRide(false, () => showSummary());
    } else showSummary();
    this.input.keyboard?.on('keydown-ONE', () => this.goSpot('board'));
    this.input.keyboard?.on('keydown-TWO', () => this.goSpot('ines'));
    this.input.keyboard?.on('keydown-THREE', () => this.goSpot('airlock'));
    this.input.keyboard?.on('keydown-FOUR', () => this.goSpot('qm'));
    this.input.keyboard?.on('keydown-FIVE', () => this.goSpot('bunk'));
  }

  // ---- art ---------------------------------------------------------------------------------------
  buildBay() {
    const g = this.add.graphics().setDepth(0);
    // the bay opening: space beyond, steel frame, bay lights
    g.fillStyle(0x05060c, 1).fillRect(0, 22, GAME_W, C.ROOF_Y - 22);
    for (let i = 0; i < 46; i++) g.fillStyle(0xffffff, 0.25 + (i % 4) * 0.17).fillRect((i * 37) % GAME_W, 24 + (i * 23) % 104, 1, 1);
    g.fillStyle(0x8a4a32, 1).fillCircle(160, 150, 34);                          // Kessa-4's limb, far below the bay edge
    g.fillStyle(0x6a3426, 1).fillCircle(168, 156, 30);
    g.fillStyle(0x2a3044, 1).fillRect(0, 22, 6, C.ROOF_Y - 22).fillRect(GAME_W - 6, 22, 6, C.ROOF_Y - 22);
    for (let y = 30; y < C.ROOF_Y; y += 16) g.fillStyle(0xffc35c, 0.8).fillRect(2, y, 2, 2).fillRect(GAME_W - 4, y, 2, 2);
    // the rig, drill up, hanging from the station roof by its hull end
    this.rig = this.add.container(90, C.RIG_Y).setDepth(2);
    this.rig.add([this.add.image(0, -42, 'drill0').setOrigin(0.5, 0), this.add.image(-43, -20, 'ship_ext').setOrigin(0)]);
    const s = this.add.graphics().setDepth(3);
    // clamps gripping the hull end + the docking collar over the airlock
    for (const x of [50, 126]) {
      s.fillStyle(0x4b4f63, 1).fillRect(x, 119, 5, C.ROOF_Y - 119);
      for (let y = 119; y < C.ROOF_Y; y += 2) s.fillStyle(0xffd23f, 1).fillRect(x, y, 5, 1);
    }
    s.fillStyle(0x23263a, 1).fillRect(82, 123, 16, C.ROOF_Y - 123);
    s.fillStyle(0x8affa0, 1).fillRect(88, 127, 4, 1);
    // station roof / concourse ceiling
    s.fillStyle(0x3a3f55, 1).fillRect(0, C.ROOF_Y, GAME_W, C.WALL_TOP - C.ROOF_Y);
    s.fillStyle(0x4b4f63, 1).fillRect(0, C.ROOF_Y, GAME_W, 1);
    for (let x = 0; x < GAME_W; x += 8) s.fillStyle(0xffd23f, 0.55).fillRect(x, C.WALL_TOP - 2, 4, 1);
    this.add.bitmapText(4, C.ROOF_Y + 2, FONT_KEY, 'BAY 3', 6).setTint(0x8a90a8).setDepth(4);
    this.add.bitmapText(GAME_W - 4, C.ROOF_Y + 2, FONT_KEY, 'KESSA HIGH', 6).setOrigin(1, 0).setTint(0x8a90a8).setDepth(4);
    // tapping the rig = go to the airlock (rig bay)
    this.add.zone(44, 38, 92, C.ROOF_Y - 38).setOrigin(0).setDepth(30).setInteractive().on('pointerdown', () => this.goSpot('airlock'));
  }

  buildConcourse() {
    const g = this.add.graphics().setDepth(1);
    const T = C.WALL_TOP, F = C.FLOOR_Y;
    g.fillStyle(0x1a2030, 1).fillRect(0, T, GAME_W, F - T);                    // back wall
    for (let x = 0; x < GAME_W; x += 24) g.fillStyle(0x151a28, 1).fillRect(x, T, 1, F - T);
    g.fillStyle(0x222a3c, 1).fillRect(0, F - 22, GAME_W, 1);                    // dado rail
    for (let x = 10; x < GAME_W; x += 36) g.fillStyle(0xdff2ff, 0.85).fillRect(x, T + 1, 16, 1); // strip lights
    g.fillStyle(0x2c3346, 1).fillRect(0, F, GAME_W, 6);                         // floor
    g.fillStyle(0x3d465c, 1).fillRect(0, F, GAME_W, 1);
    for (let x = 4; x < GAME_W; x += 12) g.fillStyle(0x7fe0ff, 0.5).fillRect(x, F + 3, 2, 1);
    g.fillStyle(0x0d0f18, 1).fillRect(0, F + 6, GAME_W, GAME_H - F - 6);       // below deck (hint text lives here)
    const p = this.add.graphics().setDepth(4);
    this.props = p;
    // CONTRACT BOARD: a wall screen with posted contracts
    p.fillStyle(0x3a4a6a, 1).fillRect(3, 172, 30, 28).fillStyle(0x0f2a3a, 1).fillRect(5, 174, 26, 24);
    p.fillStyle(0xb5532f, 1).fillRect(7, 176, 14, 5).fillStyle(0xffb347, 1).fillRect(8, 177, 6, 1);
    for (let i = 0; i < 3; i++) p.fillStyle(0x4a7a9a, 1).fillRect(7, 184 + i * 4, 10 + (i * 5) % 12, 1);
    p.fillStyle(0x3a4a6a, 1).fillRect(16, 200, 4, 16).fillRect(10, 216, 16, 2);       // stand
    this.boardCursor = this.add.rectangle(25, 194, 2, 2, 0x7fe0ff).setDepth(5);
    this.tweens.add({ targets: this.boardCursor, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    // INES'S WINDOW: dispatch booth, Ines behind the glass, a mug on the counter
    p.fillStyle(0x4b4f63, 1).fillRect(39, 168, 30, 46).fillStyle(0x2a2418, 1).fillRect(41, 170, 26, 34);
    p.fillStyle(0xffc35c, 0.18).fillRect(41, 170, 26, 34);
    p.fillStyle(0x3a2a2a, 1).fillRect(50, 182, 9, 4).fillStyle(0xc9a27a, 1).fillRect(51, 185, 7, 7);   // hair, face
    p.fillStyle(0x2a2a2a, 1).fillRect(50, 186, 1, 3).fillRect(58, 186, 1, 3);                          // headset
    p.fillStyle(0x5a6e8a, 1).fillRect(47, 193, 15, 11);                                                 // shoulders
    p.fillStyle(0xbfe6ff, 0.25).fillRect(42, 171, 3, 10);                                              // glass glint
    p.fillStyle(0x5a4a3a, 1).fillRect(37, 204, 34, 4).fillStyle(0xe0e0e0, 1).fillRect(62, 200, 4, 4);  // counter, mug
    p.fillStyle(0x3a3f55, 1).fillRect(41, 208, 26, 30);
    for (let y = 212; y < 236; y += 3) p.fillStyle(0x23263a, 1).fillRect(44, y, 20, 1);                // speaker grille
    this.inesLight = this.add.rectangle(66, 172, 2, 2, 0x8affa0).setDepth(5);
    this.tweens.add({ targets: this.inesLight, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
    // AIRLOCK: lift shaft from the collar down to a striped lift door
    p.fillStyle(0x23263a, 1).fillRect(82, T, 16, F - T).fillStyle(0x30384e, 1).fillRect(84, T, 12, F - T - 24);
    for (let y = T + 2; y < F - 26; y += 4) p.fillStyle(0x4b4f63, 1).fillRect(86, y, 8, 1);            // ladder rungs
    p.fillStyle(0x111318, 1).fillRect(81, F - 26, 18, 26);
    for (let i = 0; i < 6; i++) p.fillStyle(i % 2 ? 0x1a1a1a : 0xffd23f, 1).fillRect(81, F - 26 + i * 4, 2, 4).fillRect(97, F - 26 + i * 4, 2, 4);
    p.fillStyle(0x2f6a8a, 1).fillRect(84, F - 24, 12, 24);
    this.liftLight = this.add.rectangle(90, F - 28, 4, 1, 0x8affa0).setDepth(5);
    this.lift = this.add.rectangle(90, F, 14, 2, 0x8a90a8).setOrigin(0.5, 0).setDepth(7);
    // QUARTERMASTER: shelf of parts, crates, counter, the quartermaster bot
    p.fillStyle(0x4a3a2a, 1).fillRect(107, 178, 38, 2).fillRect(107, 192, 38, 2);                      // shelves
    p.fillStyle(0x80839a, 1).fillTriangle(110, 177, 114, 170, 118, 177);                                // drill bit
    p.fillStyle(0xb5532f, 1).fillRect(122, 171, 8, 6).fillStyle(0x7a3320, 1).fillRect(124, 173, 4, 2);  // engine block
    p.fillStyle(0x9aa0b8, 1).fillCircle(138, 174, 3).fillStyle(0x1a2030, 1).fillCircle(138, 174, 1);    // gear
    p.fillStyle(0x6a8a6a, 1).fillRect(110, 186, 7, 6).fillStyle(0xc9a27a, 1).fillRect(121, 187, 10, 5); // boxes
    p.fillStyle(0x4b4f63, 1).fillRect(132, 196, 9, 9).fillStyle(0x8affa0, 1).fillRect(134, 199, 2, 2).fillRect(138, 199, 2, 2); // bot head
    p.fillStyle(0x6a5a3a, 1).fillRect(106, 206, 40, 32).fillStyle(0x8a7a52, 1).fillRect(106, 206, 40, 2); // counter
    p.fillStyle(0x5a4a2a, 1).fillRect(110, 212, 12, 10).fillRect(126, 214, 14, 8);                     // crates (front)
    // HOLT'S BUNK: bunk bed, locker, codex shelf with a book
    p.fillStyle(0x4b4f63, 1).fillRect(147, 196, 2, 42).fillRect(164, 196, 2, 42);
    p.fillStyle(0x6a4a3a, 1).fillRect(149, 204, 15, 3).fillRect(149, 224, 15, 3);                      // bunks
    p.fillStyle(0xcfc8b8, 1).fillRect(150, 202, 4, 2).fillRect(150, 222, 4, 2);                        // pillows
    p.fillStyle(0x5a6a7a, 1).fillRect(167, 186, 11, 52).fillStyle(0x7a8a9a, 1).fillRect(168, 187, 9, 1);  // locker
    p.fillStyle(0x2a3040, 1).fillRect(169, 192, 7, 1).fillRect(169, 195, 7, 1).fillRect(175, 210, 1, 3);
    p.fillStyle(0x8a6a4a, 1).fillRect(146, 180, 20, 2).fillStyle(0x7fe0ff, 1).fillRect(150, 175, 3, 5).fillStyle(0xc9a7ff, 1).fillRect(154, 176, 2, 4); // codex shelf
    // signs + tap columns
    for (const sp of SPOTS) {
      const sg = this.add.graphics().setDepth(5);
      sg.fillStyle(0x0d0b12, 0.95).fillRect(sp.x - 17, 147, 34, 17).lineStyle(1, sp.tint, 0.7).strokeRect(sp.x - 16.5, 147.5, 33, 16);
      sp.sign.forEach((l, k) => this.add.bitmapText(sp.x, 150 + k * 7, FONT_KEY, l, 6).setOrigin(0.5, 0).setTint(k ? 0xffffff : sp.tint).setDepth(6));
      sp.zone = this.add.zone(sp.x - 18, T, 36, F + 6 - T).setOrigin(0).setDepth(30).setInteractive().on('pointerdown', () => this.goSpot(sp.id));
    }
  }

  get busy() { return !!this.ui?.menu || this.boarding; }

  // ---- walking -----------------------------------------------------------------------------------
  /** Tap a spot: Holt walks there and its panel opens on arrival (immediately if he's already there). */
  goSpot(id) {
    if (this.busy || this.lifting) return;
    const sp = this.spots[id];
    if (!sp) return;
    if (this.at === id && !this.walk) { this.ui.openAt(id); return; }
    this.walk = { from: this.at || 'between', to: id, x: sp.x, t0: performance.now() };
    this.at = null;
  }

  /** Lift ride between the concourse and the rig. up=true: board (Holt rises out of view). */
  liftRide(up, done) {
    this.lifting = true;
    const top = C.WALL_TOP + 2, F = C.FLOOR_Y;
    this.holt.setDepth(4.6); this.lift.setDepth(4.5);   // inside the shaft: behind the AIRLOCK sign
    this.holt.setTexture(this.textures.exists('crew_climb1') ? 'crew_climb1' : 'crew_idle').setVisible(true);
    if (!up) { this.holt.y = top; this.lift.y = top; }
    this.tweens.add({ targets: [this.holt, this.lift], y: up ? top : F, duration: C.LIFT_MS, ease: 'Sine.easeInOut',
      onComplete: () => { this.lifting = false; this.holt.setTexture('crew_idle').setDepth(8); this.lift.setDepth(7); if (up) this.holt.setVisible(false); done?.(); } });
  }

  /** Contract accepted at the board: Holt walks to the airlock, rides up into the rig, then the descent. */
  board(planet) {
    if (!ANIM) { this.launchRun(planet); return; }
    this.boarding = true;
    this.boardT0 = performance.now();
    const go = () => this.liftRide(true, () => this.launchRun(planet));
    if (this.at === 'airlock') { go(); return; }
    this.walk = { from: this.at || 'between', to: 'airlock', x: 90, t0: performance.now(), then: go };
    this.at = null;
  }

  launchRun(planet) {
    this.scene.stop('DockUI');
    if (ANIM) this.scene.start('Cutscene', { kind: 'descent', planet, boardMs: this.boardT0 ? Math.round(performance.now() - this.boardT0) : 0 });
    else this.scene.start('Game', { planet });
  }

  update(time, delta) {
    const w = this.walk;
    if (!w) return;
    const dt = Math.min(delta, 50) / 1000;
    const sp = C.WALK_SPEED * dt;
    const dx = w.x - this.holt.x;
    if (Math.abs(dx) <= sp) {
      this.holt.x = w.x; this.holt.setTexture('crew_idle');
      this.walk = null; this.at = w.to;
      this.walkLog.push({ from: w.from, to: w.to, ms: Math.round(performance.now() - w.t0) });
      if (w.then) w.then(); else this.ui.openAt(w.to);
    } else {
      this.holt.x += Math.sign(dx) * sp;
      this.holt.setFlipX(dx < 0);
      this.holt.setTexture(Math.floor(time / 110) % 2 ? 'crew_walk' : 'crew_idle');
    }
  }
}

export class DockUIScene extends Phaser.Scene {
  constructor() { super('DockUI'); }

  create(data = {}) {
    this.dock = this.scene.get('Dock');
    this.bannerChecked = false; this.banner = null; this.lastBanner = null;
    this.menu = null; this.menuKind = null; this.menuBtns = [];
    this.toastQ = []; this.toastT = 0;
    if (data.welcome) this.toast(data.welcome, 0x7fe0ff);
    // HUD (screen space, depth high so the zoomed camera doesn't shrink it)
    this.hud = this.add.container(0, 0).setDepth(200);
    const hx = (x, y, s, tint = 0xffffff, size = 6) => {
      const t = this.add.bitmapText(x, y, FONT_KEY, s, size).setTint(tint);
      this.hud.add(t); return t;
    };
    this.hud.add(this.add.rectangle(0, 0, GAME_W, 22, 0x0d0b12, 0.92).setOrigin(0));
    hx(4, 3, 'DOCKED', CYAN);
    this.creditText = hx(4, 11, '', GOLD);
    this.bestText = hx(176, 3, '', GREY).setOrigin(1, 0);
    // below-deck strip: hint + legend (kept clear of the concourse floor at y 244)
    this.hintText = hx(GAME_W / 2, 251, 'TAP A SPOT. HOLT WALKS THERE.', GREY).setOrigin(0.5, 0);
    [['CONTRACT BOARD', 'PICK A CONTRACT'], ["INES'S WINDOW", 'DISPATCH, RADIO'], ['AIRLOCK', 'RIG BAY: SWAP PARTS'],
     ['QUARTERMASTER', 'BUY PARTS'], ["HOLT'S BUNK", 'LOG, CODEX']].forEach(([a, b], i) => {
      hx(8, 262 + i * 8, a, CYAN); hx(70, 262 + i * 8, b, DIM);
    });
    this.toastBg = this.add.graphics().setDepth(210).setVisible(false);
    this.toastText = this.add.bitmapText(GAME_W / 2, 44, FONT_KEY, '', 6).setOrigin(0.5).setDepth(211).setVisible(false);

    // bottom bar
    this.hud.add(this.add.rectangle(0, 303, GAME_W, 17, 0x0d0b12, 0.92).setOrigin(0));
    this.stationBtn = new Button(this, 2, 305, 72, 14, 'RIG BAY', { color: 0x2f4a6a, pressColor: 0x4a7a9a, depth: 220, onTap: () => this.dock.goSpot('airlock') });
    this.pilotText = hx(130, 308, 'HOLT ON THE CONCOURSE', GREEN).setOrigin(0.5, 0);
    this.refreshHud();
    this.banner = null;
    this.bannerT = 0;

    // keyboard (desktop playtest)
    this.input.keyboard?.on('keydown-B', () => this.dock.goSpot('airlock'));
    this.input.keyboard?.on('keydown-ESC', () => this.closeMenu());
  }

  refreshHud() {
    const s = loadSave();
    this.creditText.setText(`${s.credits} CR`);
    this.bestText.setText(`BEST ${s.best.kessa4 || 0}M`);
  }

  toast(text, color = 0xffffff) { this.toastQ.push({ text, color }); if (this.toastQ.length > 2) this.toastQ.shift(); if (this.toastT > 600) this.toastT = 600; }

  /** Holt arrived at a concourse spot: open its panel. */
  openAt(spotId) {
    const sp = SPOTS.find((x) => x.id === spotId);
    if (sp) this.openMenu(sp.panel);
  }

  // ---- menus (screen-space overlay) ----------------------------------------------
  openMenu(kind, arg) {
    this.closeMenu();
    this.menuKind = kind; this.menuArg = arg;
    this.menu = [];  // plain objects to destroy on close (buttons tracked in menuBtns)
    this.menu.push(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x06050a, 0.88).setOrigin(0).setInteractive().setDepth(300));
    if (kind === 'board') this.buildBoard();
    else if (kind === 'ines') this.buildInes();
    else if (kind === 'bay') this.buildBay();
    else if (kind === 'slot') this.buildSlot(arg);
    else if (kind === 'stats') this.buildStats();
    else if (kind === 'codex') this.buildCodex();
    else if (kind === 'vendor') this.buildVendor();
    else if (kind === 'buy') this.buildBuy(arg);
    else if (kind === 'locked') this.buildLocked();
  }

  closeMenu() {
    if (!this.menu) return;
    this.menuBtns.forEach((b) => b.destroy()); this.menuBtns = [];
    this.menu.forEach((o) => o.destroy()); this.menu = null; this.menuKind = null;
    this.refreshHud();
  }

  addT(x, y, str, size = 6, tint = 0xffffff, ox = 0) {
    const t = this.add.bitmapText(x, y, FONT_KEY, str, size).setTint(tint).setOrigin(ox, 0).setDepth(320);
    this.menu.push(t); return t;
  }
  addBtn(x, y, w, h, label, color, onTap) {
    const b = new Button(this, x, y, w, h, label, { color, pressColor: color + 0x202020, depth: 310, onTap: () => this.time.delayedCall(0, onTap) });
    this.menuBtns.push(b);
    return b;
  }

  buildPanel(title) {
    this.menu.push(this.add.rectangle(4, 4, GAME_W - 8, 294, 0x0d0b12, 1).setOrigin(0).setStrokeStyle(1, 0x3a3348).setDepth(301));
    this.addT(GAME_W / 2, 10, title, 12, CYAN, 0.5);
    this.btns = {};
    this.btns.close = this.addBtn(150, 7, 26, 16, 'X', 0x5a2a2a, () => this.closeMenu());
  }

  /** Part card: name, upside, downside (wrapped). Returns its height. */
  partCard(p, x, y, w, { right = '', rightTint = GOLD, color = 0x1d2433, onTap = null, nameTint = GOLD } = {}) {
    const up = wrap('+ ' + p.up, 36), down = wrap('- ' + p.down, 36);
    const h = 16 + (up.length + down.length) * 8;
    const b = this.addBtn(x, y, w, h, '', color, onTap || (() => {}));
    this.addT(x + 6, y + 4, p.name, 6, nameTint);
    if (right) this.addT(x + w - 5, y + 4, right, 6, rightTint, 1);
    up.forEach((l, i) => this.addT(x + 6, y + 14 + i * 8, l, 6, GREEN));
    down.forEach((l, i) => this.addT(x + 6, y + 14 + (up.length + i) * 8, l, 6, RED));
    return { h, b };
  }

  // CONTRACT BOARD: mission select (data-driven: one card per unlocked planet in contracts.js)
  buildBoard() {
    this.buildPanel('CONTRACTS');
    const s = loadSave();
    this.addT(GAME_W / 2, 28, 'POSTED BY THE COMPANY. ONE AT A TIME.', 6, DIM, 0.5);
    const list = CONTRACTS();
    list.forEach((c, i) => {
      const y = 40 + i * 70;
      this.menu.push(this.add.rectangle(10, y, 160, 64, 0x161a26, 1).setOrigin(0).setStrokeStyle(1, c.color).setDepth(302));
      this.addT(16, y + 5, c.planetName, 12, c.colorText);
      this.addT(164, y + 8, `BEST ${s.best[c.planet] || 0}M`, 6, CYAN, 1);
      this.addT(16, y + 20, c.title, 6, 0xffffff);
      this.addT(16, y + 29, `PAY X${c.pay.toFixed(1)}/M  -  RELAY EVERY 1000M`, 6, GREY);
      this.addT(16, y + 38, 'HAZARDS: ' + c.hazards, 6, GREY);
      this.btns['contract_' + c.planet] = this.addBtn(16, y + 47, 148, 14, 'ACCEPT CONTRACT', 0x7a3320, () => this.startContract(c.planet));
    });
    const y = 40 + list.length * 70;
    this.addT(GAME_W / 2, y + 2, 'MORE PLANETS POST HERE IN M3', 6, DIM, 0.5);
    this.addT(GAME_W / 2, y + 16, 'ACCEPTING: HOLT BOARDS THE RIG AND UNDOCKS', 6, DIM, 0.5);
    this.addT(GAME_W / 2, y + 30, "RADIO REPLAY: INES'S WINDOW", 6, 0xffc35c, 0.5);
  }

  // INES'S WINDOW: dispatch (latest message, radio replay); story content arrives later
  buildInes() {
    this.buildPanel("INES'S WINDOW");
    const s = loadSave();
    const radio = (s.radio || []).slice().reverse();
    this.addT(GAME_W / 2, 28, 'DISPATCH. THE KETTLE IS ON.', 6, DIM, 0.5);
    this.menu.push(this.add.rectangle(10, 38, 160, 50, 0x1e1a12, 1).setOrigin(0).setStrokeStyle(1, 0xffc35c).setDepth(302));
    this.addT(16, 42, 'LATEST', 6, 0xffc35c);
    if (radio.length) {
      this.addT(164, 42, radio[0].tag, 6, CYAN, 1);
      wrap(radio[0].text, 37).slice(0, 4).forEach((l, i) => this.addT(16, 52 + i * 8, l, 6, 0xfff2d8));
    } else wrap("NOTHING ON THE WIRE YET, HOLT. TAKE A CONTRACT AND I'LL TALK YOUR EAR OFF.", 37).forEach((l, i) => this.addT(16, 52 + i * 8, l, 6, 0xfff2d8));
    this.addT(12, 96, 'RADIO REPLAY', 6, GOLD);
    const older = radio.slice(1);
    const per = 3, pages = Math.max(1, Math.ceil(older.length / per));
    this.radioPage = Math.min(this.radioPage || 0, pages - 1);
    if (!older.length) this.addT(12, 108, 'NO OLDER TRAFFIC.', 6, DIM);
    let y = 108;
    older.slice(this.radioPage * per, this.radioPage * per + per).forEach((r) => {
      this.addT(12, y, r.tag, 6, CYAN); y += 8;
      wrap(r.text, 39).slice(0, 3).forEach((l) => { this.addT(12, y, l, 6, 0xd8f4f8); y += 8; });
      y += 3;
    });
    if (pages > 1) {
      this.btns.radioOlder = this.addBtn(12, 236, 60, 14, '< OLDER', 0x3a3348, () => { this.radioPage = Math.min(pages - 1, this.radioPage + 1); this.openMenu('ines'); });
      this.addT(GAME_W / 2, 240, `${this.radioPage + 1}/${pages}`, 6, GREY, 0.5);
      this.btns.radioNewer = this.addBtn(108, 236, 60, 14, 'NEWER >', 0x3a3348, () => { this.radioPage = Math.max(0, this.radioPage - 1); this.openMenu('ines'); });
    }
    this.addT(GAME_W / 2, 262, 'SHE TALKS MORE AFTER A FEW CONTRACTS', 6, DIM, 0.5);
    this.addT(GAME_W / 2, 271, '(STORY: LATER MILESTONE)', 6, DIM, 0.5);
    this.btns.back = this.addBtn(10, 280, 160, 14, 'BACK TO THE CONCOURSE', 0x3a3348, () => this.closeMenu());
  }

  // RIG BAY (garage): the rig's exterior at 2x, drill up. Tap a part location to swap that slot.
  buildBay() {
    this.buildPanel('RIG BAY');
    const s = loadSave();
    this.addT(GAME_W / 2, 27, 'TAP A PART ON THE RIG TO SWAP IT', 6, GREY, 0.5);
    const X0 = 4, Y0 = 86, K = 2;                 // ship_ext top-left + scale: hull 4..176 x 86..210, drill 42..90
    const add = (o) => { o.setDepth(303); this.menu.push(o); return o; };
    add(this.add.rectangle(0, 36, GAME_W, 222, 0x07080e, 1).setOrigin(0));
    add(this.add.image(90, Y0 - 22 * K, 'drill0').setOrigin(0.5, 0).setScale(K));
    add(this.add.image(X0, Y0, 'ship_ext').setOrigin(0).setScale(K));
    const g = add(this.add.graphics());
    // clamps, collar, bay deck, Holt's locker by the airlock
    for (const x of [16, 158]) { g.fillStyle(0x4b4f63, 1).fillRect(x, 208, 6, 14); for (let y = 208; y < 222; y += 2) g.fillStyle(0xffd23f, 1).fillRect(x, y, 6, 1); }
    g.fillStyle(0x23263a, 1).fillRect(80, 210, 20, 12).fillStyle(0x8affa0, 1).fillRect(88, 214, 4, 1);
    g.fillStyle(0x3a3f55, 1).fillRect(0, 222, GAME_W, 4);
    g.fillStyle(0x5a6a7a, 1).fillRect(64, 226, 13, 27).fillStyle(0x7a8a9a, 1).fillRect(65, 227, 11, 1);   // locker, by the airlock
    g.fillStyle(0x2a3040, 1).fillRect(66, 231, 9, 1).fillRect(66, 234, 9, 1).fillRect(74, 240, 1, 3);
    g.fillStyle(0x2f6a8a, 1).fillRect(82, 226, 16, 26);   // airlock door
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0x1a1a1a : 0xffd23f, 1).fillRect(80, 226 + i * 4, 2, 4).fillRect(98, 226 + i * 4, 2, 4);
    // hotspots: big thumb targets over the actual part locations, with the equipped part's name
    const H = {
      drill:  { x: 22, y: 40, w: 136, h: 48, tag: [50, 64] },     // the nose
      helm:   { x: 4, y: 88, w: 86, h: 60, tag: [8, 124] },       // cockpit porthole (top-left)
      hull:   { x: 90, y: 88, w: 86, h: 60, tag: [94, 124] },     // plating (top-right)
      engine: { x: 4, y: 148, w: 86, h: 60, tag: [8, 188] },      // vents (bottom-left)
      tools:  { x: 90, y: 148, w: 86, h: 60, tag: [94, 188] },    // tool hatch (bottom-right)
      kit:    { x: 4, y: 224, w: 76, h: 32, tag: [6, 227] },      // Holt's locker by the airlock
    };
    this.hot = {};
    for (const slot of SLOTS) {
      const h = H[slot.id], part = partById(s.loadout[slot.id]);
      const [tx, ty] = h.tag;
      const maxW = slot.id === 'kit' ? 56 : 80;
      const lines = wrap(part.name, Math.floor((maxW - 5) / 4));
      const tagW = Math.min(maxW, Math.max(slot.name.length, ...lines.map((l) => l.length)) * 4 + 5);
      add(this.add.rectangle(tx, ty, tagW, 10 + lines.length * 7, 0x0d0b12, 0.85).setOrigin(0).setStrokeStyle(1, part.stock ? 0x3a4a6a : GREEN));
      this.addT(tx + 3, ty + 2, slot.name, 6, CYAN).setDepth(321);
      lines.forEach((l, k) => this.addT(tx + 3, ty + 9 + k * 7, l, 6, part.stock ? 0xffffff : GREEN).setDepth(321));
      const br = add(this.add.graphics());
      br.lineStyle(1, CYAN, 0.9);
      const c = 5, x1 = h.x + 1.5, y1 = h.y + 1.5, x2 = h.x + h.w - 1.5, y2 = h.y + h.h - 1.5;
      br.lineBetween(x1, y1, x1 + c, y1).lineBetween(x1, y1, x1, y1 + c).lineBetween(x2, y1, x2 - c, y1).lineBetween(x2, y1, x2, y1 + c)
        .lineBetween(x1, y2, x1 + c, y2).lineBetween(x1, y2, x1, y2 - c).lineBetween(x2, y2, x2 - c, y2).lineBetween(x2, y2, x2, y2 - c);
      this.tweens.add({ targets: br, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
      const z = add(this.add.zone(h.x, h.y, h.w, h.h).setOrigin(0).setInteractive());
      z.setDepth(330).on('pointerdown', () => this.time.delayedCall(0, () => this.openMenu('slot', slot.id)));
      this.hot[slot.id] = { x: h.x, y: h.y, w: h.w, h: h.h, part: part.id };
    }
    this.addT(GAME_W / 2, 262, 'SWAPS ONLY WHILE DOCKED. BUY NEW PARTS', 6, DIM, 0.5);
    this.addT(GAME_W / 2, 270, 'FROM THE QUARTERMASTER.', 6, DIM, 0.5);
    this.btns.back = this.addBtn(10, 280, 160, 14, 'BACK TO THE CONCOURSE', 0x3a3348, () => this.closeMenu());
  }

  startContract(planet) {
    this.closeMenu();
    this.dock.board(planet);   // walk to the airlock, ride up, undock (or straight into the run with ?anim=0)
  }

  // DRL / ENG / HELM slot, or one of the TLS bench slots
  buildSlot(slotId) {
    const slot = SLOTS.find((x) => x.id === slotId);
    this.buildPanel(slot.name);
    const save = loadSave();
    this.addT(12, 30, 'TAP A PART TO EQUIP IT', 6, GREY);
    const owned = partsForSlot(slotId).filter((p) => save.owned.includes(p.id));
    let y = 42;
    this.btns.parts = {};
    for (const p of owned) {
      const eq = save.loadout[slotId] === p.id;
      const { h, b } = this.partCard(p, 10, y, 160, { right: eq ? 'EQUIPPED' : 'EQUIP', rightTint: eq ? GREEN : GREY,
        color: eq ? 0x22402e : 0x1d2433, nameTint: eq ? GREEN : GOLD, onTap: () => this.doEquip(p.id) });
      this.btns.parts[p.id] = b;
      y += h + 4;
    }
    const notOwned = partsForSlot(slotId).filter((p) => !save.owned.includes(p.id));
    const open = notOwned.filter((p) => isUnlocked(save, p)).length;
    const lockedHere = notOwned.filter((p) => !isUnlocked(save, p));
    let fy = Math.max(y + 4, 222);
    if (open) { this.addT(GAME_W / 2, fy, `${open} MORE IN THE QUARTERMASTER'S ROTATION`, 6, DIM, 0.5); fy += 10; }
    lockedHere.forEach((p) => { this.addT(GAME_W / 2, fy, `LOCKED: ${p.name} - ${unlockText(p)}`, 6, 0xc9a7ff, 0.5); fy += 10; });
    if (!notOwned.length) this.addT(GAME_W / 2, fy, 'YOU OWN EVERY PART FOR THIS SLOT', 6, DIM, 0.5);
    this.btns.back = this.addBtn(10, 280, 160, 14, 'BACK TO THE RIG BAY', 0x3a3348, () => this.openMenu('bay'));
  }

  doEquip(id) {
    const r = equipPart(id);
    if (!r.ok) { this.toast(r.reason, RED); return; }
    this.toast('EQUIPPED: ' + partById(id).name, GREEN);
    this.openMenu('slot', partById(id).slot);
  }

  // Holt's bunk: the log (stats) + the codex shelf
  buildStats() {
    this.buildPanel("HOLT'S LOG");
    const s = loadSave();
    this.addT(GAME_W / 2, 30, 'THE BUNK, THE LOCKER, THE LOG.', 6, DIM, 0.5);
    const rows = [
      ['CREDITS', `${s.credits} CR`],
      ['TOTAL EARNED', `${s.totalEarned} CR`],
      ['BEST DEPTH (KESSA-4)', `${s.best.kessa4 || 0}M`],
      ['CONTRACTS RUN', `${s.runs}`],
      ['CASHED OUT', `${s.cashouts}`],
      ['RIGS LOST (REFITTED)', `${s.rigsLost}`],
      ['RELAYS REACHED', `${s.relaysReached}`],
      ['DEEPEST RELAY', `${s.deepestRelay || 0}`],
      ['PARTS OWNED', `${s.owned.length}/${PARTS.length}`],
      ['PARTS UNLOCKED', `${PARTS.filter((p) => isUnlocked(s, p)).length}/${PARTS.length}`],
    ];
    rows.forEach(([a, b], i) => {
      this.addT(14, 46 + i * 14, a, 6, GREY);
      this.addT(166, 46 + i * 14, b, 6, GOLD, 1);
    });
    const next = this.nextUnlock(s);
    this.addT(14, 186, next ? `NEXT UNLOCK: ${next}` : 'ALL PARTS UNLOCKED', 6, 0xc9a7ff);
    this.addT(14, 200, 'LOADOUT', 6, CYAN);
    SLOTS.forEach((sl, i) => {
      this.addT(14, 212 + i * 10, sl.short, 6, DIM);
      this.addT(34, 212 + i * 10, partById(s.loadout[sl.id]).name, 6, 0xffffff);
    });
    this.btns.codex = this.addBtn(10, 276, 160, 18, 'CODEX SHELF  >', 0x2a2a4a, () => this.openMenu('codex'));
  }

  // codex shelf above the bunk: stub (M4)
  buildCodex() {
    this.buildPanel('CODEX');
    this.addT(GAME_W / 2, 80, 'THE SHELF IS EMPTY.', 6, GREY, 0.5);
    this.addT(GAME_W / 2, 92, 'FINDS YOU RECOVER END UP HERE.', 6, DIM, 0.5);
    ['STRATA', 'LIFE', 'ARTIFACTS', 'LOGS', 'COMPANY'].forEach((c, i) => {
      this.addT(40, 116 + i * 14, c, 6, DIM);
      this.addT(140, 116 + i * 14, '0', 6, DIM, 1);
    });
    this.btns.back = this.addBtn(10, 280, 160, 14, "BACK TO HOLT'S LOG", 0x3a3348, () => this.openMenu('stats'));
  }

  // Quartermaster: one row per offer; tap for the full upside/downside + buy
  buildVendor() {
    this.buildPanel('QUARTERMASTER');
    const s = loadSave();
    this.addT(12, 28, `${s.credits} CR`, 6, GOLD);
    this.addT(168, 28, 'NEW STOCK EVERY CONTRACT', 6, DIM, 1);
    const cost = rerollCost(s);
    const locked = PARTS.filter((p) => !isUnlocked(s, p));
    this.btns.reroll = this.addBtn(10, 38, 74, 16, `REROLL: ${cost}`, s.credits >= cost ? 0x5a4a2a : 0x3a3348, () => this.doReroll());
    this.btns.locked = this.addBtn(87, 38, 46, 16, `LOCKED ${locked.length}`, 0x3a2a4a, () => this.openMenu('locked'));
    this.btns.back = this.addBtn(136, 38, 34, 16, 'BACK', 0x3a3348, () => this.closeMenu());
    let y = 60;
    this.btns.offers = {};
    for (const slot of SLOTS) {
      for (const id of s.vendor.stock.filter((x) => partById(x)?.slot === slot.id)) {
        const p = partById(id), owned = s.owned.includes(id), can = !owned && s.credits >= p.price;
        this.btns.offers[id] = this.addBtn(10, y, 160, 17, '', owned ? 0x1a2a1a : 0x1d2433, () => { if (!owned) this.openMenu('buy', id); });
        this.addT(15, y + 6, slot.short, 6, CYAN);
        this.addT(33, y + 6, p.name, 6, owned ? GREEN : 0xffffff);
        this.addT(165, y + 6, owned ? 'OWNED' : `${p.price}`, 6, owned ? GREEN : (can ? GOLD : RED), 1);
        y += 19;
      }
    }
    if (y === 60) this.addT(GAME_W / 2, 90, 'SOLD OUT. RUN A CONTRACT.', 6, DIM, 0.5);
    const next = this.nextUnlock(s);
    if (next && y < 262) this.addT(GAME_W / 2, y + 6, `NEXT UNLOCK: ${next}`, 6, 0xc9a7ff, 0.5);
    this.addT(GAME_W / 2, Math.max(y + 18, 284), 'TAP A PART FOR UPSIDE + DOWNSIDE', 6, DIM, 0.5);
  }

  /** Text for the closest milestone still locked, e.g. 'REACH 1500M (2 PARTS)'. */
  nextUnlock(s) {
    const locked = PARTS.filter((p) => !isUnlocked(s, p));
    if (!locked.length) return null;
    const prog = progressOf(s);
    const score = (p) => p.unlock.depth ? (p.unlock.depth - prog.best) / 500 : (p.unlock.relays - prog.relays);
    const best = locked.slice().sort((a, b) => score(a) - score(b))[0];
    const same = locked.filter((p) => unlockText(p) === unlockText(best)).length;
    return `${unlockText(best)} (${same} PART${same > 1 ? 'S' : ''})`;
  }

  // Locked parts list (from the Quartermaster)
  buildLocked() {
    this.buildPanel('LOCKED PARTS');
    const s = loadSave();
    this.addT(12, 30, 'UNLOCK BY BEST DEPTH OR TOTAL RELAYS.', 6, GREY);
    this.addT(12, 39, 'THEN THEY JOIN THE ROTATING STOCK.', 6, GREY);
    const locked = PARTS.filter((p) => !isUnlocked(s, p))
      .sort((a, b) => (a.unlock.depth || a.unlock.relays * 1000) - (b.unlock.depth || b.unlock.relays * 1000));
    this.lockedRows = locked.map((p) => p.id);
    locked.forEach((p, i) => {
      const y = 54 + i * 17;
      this.menu.push(this.add.rectangle(10, y, 160, 15, 0x15121c, 1).setOrigin(0).setDepth(302));
      this.addT(15, y + 5, SLOTS.find((x) => x.id === p.slot).short, 6, DIM);
      this.addT(33, y + 5, p.name, 6, 0x8a8298);
      this.addT(165, y + 5, unlockText(p), 6, 0xc9a7ff, 1);
    });
    if (!locked.length) this.addT(GAME_W / 2, 90, 'EVERYTHING IS UNLOCKED.', 6, GREEN, 0.5);
    this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO STOCK', 0x3a3348, () => this.openMenu('vendor'));
  }

  buildBuy(id) {
    const p = partById(id), s = loadSave();
    const slot = SLOTS.find((x) => x.id === p.slot);
    this.buildPanel('QUARTERMASTER');
    this.addT(12, 30, slot.name + ' PART', 6, CYAN);
    this.addT(12, 40, p.name, 12, GOLD);
    this.addT(12, 60, 'UPSIDE', 6, GREEN);
    wrap(p.up, 38).forEach((l, i) => this.addT(12, 70 + i * 9, l, 6, 0xffffff));
    this.addT(12, 96, 'DOWNSIDE', 6, RED);
    wrap(p.down, 38).forEach((l, i) => this.addT(12, 106 + i * 9, l, 6, 0xffffff));
    const cur = partById(s.loadout[p.slot]);
    this.addT(12, 132, 'REPLACES (IF EQUIPPED)', 6, GREY);
    this.addT(12, 142, cur.name, 6, 0xffffff);
    this.addT(12, 160, 'PRICE', 6, GREY);
    this.addT(168, 160, `${p.price} CR`, 6, GOLD, 1);
    this.addT(12, 170, 'YOU HAVE', 6, GREY);
    this.addT(168, 170, `${s.credits} CR`, 6, s.credits >= p.price ? GOLD : RED, 1);
    const owned = s.owned.includes(id), can = !owned && s.credits >= p.price;
    const label = owned ? 'OWNED' : can ? 'BUY + EQUIP' : 'NOT ENOUGH CREDITS';
    this.btns.buyEquip = this.addBtn(10, 190, 160, 24, label, can ? 0x7a3320 : 0x3a3348, () => this.doBuy(id, true));
    this.btns.buy = this.addBtn(10, 220, 160, 18, can ? 'BUY ONLY' : '-', can ? 0x2f6a3a : 0x3a3348, () => this.doBuy(id, false));
    this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO STOCK', 0x3a3348, () => this.openMenu('vendor'));
  }

  doBuy(id, equip) {
    const p = partById(id);
    const r = buyPart(id);
    if (!r.ok) { this.toast(r.reason, RED); return; }
    if (equip) equipPart(id);
    this.toast((equip ? 'BOUGHT + EQUIPPED: ' : 'BOUGHT: ') + p.name, GREEN);
    this.openMenu('vendor');
  }

  doReroll() {
    const r = reroll();
    if (!r.ok) { this.toast(r.reason, RED); return; }
    this.toast(`STOCK REROLLED: -${r.cost} CR`, GOLD);
    this.openMenu('vendor');
  }

  /** 'NEW PARTS AVAILABLE' notice, shown once the end-of-run summary is closed. */
  showUnlockBanner() {
    const ids = ackUnlocks();
    if (!ids.length) return;
    const names = ids.map((id) => partById(id).name);
    const lines = [];
    let cur = '';
    for (const n of names) { if ((cur ? cur + ', ' + n : n).length > 38) { lines.push(cur); cur = n; } else cur = cur ? cur + ', ' + n : n; }
    lines.push(cur);
    const h = 18 + lines.length * 8;
    const objs = [this.add.rectangle(6, 26, 168, h, 0x1a1028, 0.96).setOrigin(0).setStrokeStyle(1, 0xc9a7ff).setDepth(250)];
    objs.push(this.add.bitmapText(GAME_W / 2, 30, FONT_KEY, 'NEW PARTS AVAILABLE', 6).setOrigin(0.5, 0).setTint(0xc9a7ff).setDepth(251));
    lines.forEach((l, i) => objs.push(this.add.bitmapText(GAME_W / 2, 40 + i * 8, FONT_KEY, l, 6).setOrigin(0.5, 0).setTint(0xffffff).setDepth(251)));
    const zone = this.add.zone(6, 26, 168, h).setOrigin(0).setInteractive().setDepth(252).on('pointerdown', () => this.hideBanner());
    objs.push(zone);
    this.banner = { objs, ids, text: names.join(', '), bottom: 26 + h };
    if (this.toastText.visible) { const ty = this.banner.bottom + 10; this.toastText.setY(ty); const w = Math.min(176, this.toastText.width + 8); this.toastBg.clear().fillStyle(0x000000, 0.88).fillRect((GAME_W - w) / 2, ty - 7, w, 13); }
    this.bannerT = 4000;
  }
  hideBanner() { if (!this.banner) return; this.banner.objs.forEach((o) => o.destroy()); this.lastBanner = this.banner; this.banner = null; }

  update(time, delta) {
    if (!this.banner && !this.bannerChecked && !this.scene.isActive('GameOver') && !this.dock.lifting && !this.dock.summaryPending) { this.bannerChecked = true; this.showUnlockBanner(); }
    if (this.banner && (this.bannerT -= delta) <= 0) this.hideBanner();
    if (this.toastT > 0) this.toastT -= delta;
    else if (this.toastQ.length) {
      const t = this.toastQ.shift();
      // sits under the NEW PARTS banner when that is showing, so the two never overlap
      const ty = this.banner ? this.banner.bottom + 10 : 44;
      this.toastText.setText(t.text).setTint(t.color).setVisible(true).setY(ty);
      const w = Math.min(176, this.toastText.width + 8);
      this.toastBg.clear().fillStyle(0x000000, 0.88).fillRect((GAME_W - w) / 2, ty - 7, w, 13).setVisible(true);
      this.toastT = 1400;
    } else if (this.toastText.visible) { this.toastText.setVisible(false); this.toastBg.setVisible(false); }
  }
}
