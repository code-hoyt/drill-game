// Home base (M2, redesigned): the station concourse. The concourse strip (five signed spots, Holt
// walking) is anchored at the bottom of the screen and is always visible and tappable. Above it is the
// content area: by default the docking bay with the rig standing drill-up on the station roof (the
// framing the ascent cutscene ends on); when Holt reaches a spot, that spot's panel (DockUI) fills the
// content area. The airlock (or the rig itself) opens the RIG BAY parts screen.
import { GAME_W, GAME_H, LAYOUT as L } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { rigParts } from '../systems/ShipArt.js';
import { loadSave, buyPart, equipPart, reroll, rerollCost, isUnlocked, ackUnlocks, progressOf } from '../systems/Save.js';
import { SLOTS, PARTS, partById, partsForSlot, unlockText } from '../data/parts.js';
import { CONTRACTS } from '../data/contracts.js';
import { ANIM, LIFT_MS } from '../systems/Settings.js';

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
// Screen, top to bottom: HUD 0..22 | CONTENT 22..202 (the docking bay, or the open panel) |
// concourse strip 202..300 (always visible + tappable) | bottom bar 303..320 (where Holt is / toasts).
export const CONCOURSE = {
  RIG_Y: 142,           // rig origin (run world y 260): drill tip y 50, CORMORANT 118..180 (same framing the ascent ends on)
  ROOF_Y: 194,          // station roof under the rig's hull end (clamps + collar)
  WALL_TOP: 202,        // concourse ceiling = bottom of the content area
  FLOOR_Y: 294,         // Holt stands here
  WALK_SPEED: 160,      // px/s: farthest pair (board <-> bunk, 144 px) takes 0.9 s
};
const C = CONCOURSE;
export const CONTENT = { y: 22, h: C.WALL_TOP - 22 };   // panels fill exactly this band
const PY = C.FLOOR_Y - 238;                            // props are drawn on a 238-floor template, shifted down
export const SPOTS = [
  { id: 'board',   x: 18,  sign: ['CONTRACT', 'BOARD'],   tint: GOLD,  panel: 'board',  name: 'THE CONTRACT BOARD' },
  { id: 'ines',    x: 54,  sign: ["INES'S", 'WINDOW'],    tint: 0xffc35c, panel: 'ines', name: "INES'S WINDOW" },
  { id: 'airlock', x: 90,  sign: ['AIRLOCK', 'RIG BAY'],  tint: CYAN,  panel: 'bay',    name: 'THE AIRLOCK (RIG BAY)' },
  { id: 'qm',      x: 126, sign: ['QUARTER-', 'MASTER'],  tint: GREEN, panel: 'vendor', name: 'THE QUARTERMASTER' },
  { id: 'bunk',    x: 162, sign: ["HOLT'S", 'BUNK'],      tint: VIOLET, panel: 'stats', name: "HOLT'S BUNK" },
];
/** Which concourse spot a panel belongs to (sub-panels included). */
export const PANEL_SPOT = { board: 'board', ines: 'ines', bay: 'airlock', slot: 'airlock', stats: 'bunk', codex: 'bunk', vendor: 'qm', buy: 'qm', locked: 'qm' };

export class DockScene extends Phaser.Scene {
  constructor() { super('Dock'); }

  create(data = {}) {
    this.cameras.main.setBackgroundColor('#0a0c14').setRotation(0).setZoom(1).centerOn(GAME_W / 2, GAME_H / 2);
    this.walk = null; this.walkLog = []; this.boarding = false; this.lifting = false; this.boardT0 = 0; this.signKey = '';
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
      this.scene.launch('GameOver', { ...data.summary, inDock: true });   // drawn inside the content area
    };
    if (data.intro) {
      this.cameras.main.fadeIn(180, 0, 0, 0);
      this.liftRide(false, () => showSummary());
    } else showSummary();
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => this.input.keyboard?.on('keydown-' + k, () => this.goSpot(SPOTS[i].id)));
  }

  // ---- art ---------------------------------------------------------------------------------------
  buildBay() {
    const g = this.add.graphics().setDepth(0);
    const top = CONTENT.y;
    // the bay opening: space beyond, steel frame, bay lights, a gantry truss across the top
    g.fillStyle(0x05060c, 1).fillRect(0, top, GAME_W, C.ROOF_Y - top);
    for (let i = 0; i < 60; i++) g.fillStyle(0xffffff, 0.25 + (i % 4) * 0.17).fillRect((i * 37) % GAME_W, top + 10 + (i * 23) % (C.ROOF_Y - top - 12), 1, 1);
    g.fillStyle(0x8a4a32, 1).fillCircle(160, C.ROOF_Y + 16, 34);                 // Kessa-4's limb, far below the bay edge
    g.fillStyle(0x6a3426, 1).fillCircle(168, C.ROOF_Y + 22, 30);
    g.fillStyle(0x2a3044, 1).fillRect(0, top, 6, C.ROOF_Y - top).fillRect(GAME_W - 6, top, 6, C.ROOF_Y - top);
    for (let y = top + 8; y < C.ROOF_Y; y += 16) g.fillStyle(0xffc35c, 0.8).fillRect(2, y, 2, 2).fillRect(GAME_W - 4, y, 2, 2);
    g.fillStyle(0x2a3044, 1).fillRect(0, top, GAME_W, 5);
    for (let x = 0; x < GAME_W; x += 10) g.fillStyle(0x3a4258, 1).fillRect(x, top + 1, 6, 3);
    // far off: the station's ring arm with a beacon, and another company hauler parked at bay 1
    g.fillStyle(0x1c2131, 1).fillRect(6, 58, 52, 3).fillRect(56, 50, 3, 19);
    for (let x = 8; x < 56; x += 6) g.fillStyle(0x2a3044, 1).fillRect(x, 57, 1, 5);
    g.fillStyle(0x3a2a26, 1).fillRect(140, 70, 14, 10).fillTriangle(140, 70, 147, 64, 154, 70).fillStyle(0x24262e, 1).fillRect(143, 80, 8, 3);
    g.fillStyle(0xfff2a8, 0.7).fillRect(149, 73, 1, 1);
    this.beacon = this.add.rectangle(57, 49, 2, 2, 0xff5a5a).setDepth(1);
    this.tweens.add({ targets: this.beacon, alpha: 0.1, duration: 900, yoyo: true, repeat: -1 });
    // the rig, drill up, standing on the station roof by its hull end
    this.rig = this.add.container(90, C.RIG_Y).setDepth(2);
    this.rig.add(rigParts(this, 260).parts);   // TB-6 + CORMORANT, exactly as the run draws them
    const s = this.add.graphics().setDepth(3);
    // station clamps gripping the ship's engine end + the docking collar over the airlock
    const sb = C.RIG_Y + (L.SHIP_BOTTOM - 260), cy = sb - 6;
    for (const x of [70, 106]) {
      s.fillStyle(0x4b4f63, 1).fillRect(x, cy, 4, C.ROOF_Y - cy);
      for (let y = cy; y < C.ROOF_Y; y += 2) s.fillStyle(0xffd23f, 1).fillRect(x, y, 4, 1);
    }
    s.fillStyle(0x23263a, 1).fillRect(83, sb + 1, 14, C.ROOF_Y - sb - 1);
    s.fillStyle(0x8affa0, 1).fillRect(88, sb + 4, 4, 1);
    // station roof / concourse ceiling
    s.fillStyle(0x3a3f55, 1).fillRect(0, C.ROOF_Y, GAME_W, C.WALL_TOP - C.ROOF_Y);
    s.fillStyle(0x4b4f63, 1).fillRect(0, C.ROOF_Y, GAME_W, 1);
    for (let x = 0; x < GAME_W; x += 8) s.fillStyle(0xffd23f, 0.55).fillRect(x, C.WALL_TOP - 2, 4, 1);
    this.add.bitmapText(4, C.ROOF_Y + 1, FONT_KEY, 'BAY 3', 6).setTint(0x8a90a8).setDepth(4);
    this.add.bitmapText(GAME_W - 4, C.ROOF_Y + 1, FONT_KEY, 'KESSA HIGH', 6).setOrigin(1, 0).setTint(0x8a90a8).setDepth(4);
    // tapping the rig = go to the airlock (rig bay)
    this.add.zone(44, C.RIG_Y - 90, 92, C.ROOF_Y - C.RIG_Y + 90).setOrigin(0).setDepth(30).setInteractive().on('pointerdown', () => this.goSpot('airlock'));
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
    g.fillStyle(0x0d0f18, 1).fillRect(0, F + 6, GAME_W, GAME_H - F - 6);       // below deck, under the bottom bar
    // AIRLOCK: lift shaft from the collar down to a striped lift door (absolute coords: it meets the roof)
    const a = this.add.graphics().setDepth(4);
    a.fillStyle(0x23263a, 1).fillRect(82, T, 16, F - T).fillStyle(0x30384e, 1).fillRect(84, T, 12, F - T - 24);
    for (let y = T + 2; y < F - 26; y += 4) a.fillStyle(0x4b4f63, 1).fillRect(86, y, 8, 1);            // ladder rungs
    a.fillStyle(0x111318, 1).fillRect(81, F - 26, 18, 26);
    for (let i = 0; i < 6; i++) a.fillStyle(i % 2 ? 0x1a1a1a : 0xffd23f, 1).fillRect(81, F - 26 + i * 4, 2, 4).fillRect(97, F - 26 + i * 4, 2, 4);
    a.fillStyle(0x2f6a8a, 1).fillRect(84, F - 24, 12, 24);
    this.liftLight = this.add.rectangle(90, F - 28, 4, 1, 0x8affa0).setDepth(5);
    this.lift = this.add.rectangle(90, F, 14, 2, 0x8a90a8).setOrigin(0.5, 0).setDepth(7);
    // the other props are drawn on the original 238-floor template and shifted down by PY
    const p = this.add.graphics().setDepth(4).setY(PY);
    this.props = p;
    // CONTRACT BOARD: a wall screen with posted contracts
    p.fillStyle(0x3a4a6a, 1).fillRect(3, 172, 30, 28).fillStyle(0x0f2a3a, 1).fillRect(5, 174, 26, 24);
    p.fillStyle(0xb5532f, 1).fillRect(7, 176, 14, 5).fillStyle(0xffb347, 1).fillRect(8, 177, 6, 1);
    for (let i = 0; i < 3; i++) p.fillStyle(0x4a7a9a, 1).fillRect(7, 184 + i * 4, 10 + (i * 5) % 12, 1);
    p.fillStyle(0x3a4a6a, 1).fillRect(16, 200, 4, 16).fillRect(10, 216, 16, 2);       // stand
    this.boardCursor = this.add.rectangle(25, 194 + PY, 2, 2, 0x7fe0ff).setDepth(5);
    this.tweens.add({ targets: this.boardCursor, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
    // INES'S WINDOW: dispatch booth, Ines behind the glass, a mug on the counter
    p.fillStyle(0x4b4f63, 1).fillRect(39, 170, 30, 44).fillStyle(0x2a2418, 1).fillRect(41, 172, 26, 32);
    p.fillStyle(0xffc35c, 0.18).fillRect(41, 172, 26, 32);
    p.fillStyle(0x3a2a2a, 1).fillRect(50, 182, 9, 4).fillStyle(0xc9a27a, 1).fillRect(51, 185, 7, 7);   // hair, face
    p.fillStyle(0x2a2a2a, 1).fillRect(50, 186, 1, 3).fillRect(58, 186, 1, 3);                          // headset
    p.fillStyle(0x5a6e8a, 1).fillRect(47, 193, 15, 11);                                                 // shoulders
    p.fillStyle(0xbfe6ff, 0.25).fillRect(42, 173, 3, 9);                                               // glass glint
    p.fillStyle(0x5a4a3a, 1).fillRect(37, 204, 34, 4).fillStyle(0xe0e0e0, 1).fillRect(62, 200, 4, 4);  // counter, mug
    p.fillStyle(0x3a3f55, 1).fillRect(41, 208, 26, 30);
    for (let y = 212; y < 236; y += 3) p.fillStyle(0x23263a, 1).fillRect(44, y, 20, 1);                // speaker grille
    this.inesLight = this.add.rectangle(66, 175 + PY, 2, 2, 0x8affa0).setDepth(5);
    this.tweens.add({ targets: this.inesLight, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
    // QUARTERMASTER: shelf of parts, crates, counter, the quartermaster bot
    p.fillStyle(0x4a3a2a, 1).fillRect(107, 180, 38, 2).fillRect(107, 193, 38, 2);                      // shelves
    p.fillStyle(0x80839a, 1).fillTriangle(110, 179, 114, 173, 118, 179);                                // drill bit
    p.fillStyle(0xb5532f, 1).fillRect(122, 174, 8, 6).fillStyle(0x7a3320, 1).fillRect(124, 176, 4, 2);  // engine block
    p.fillStyle(0x9aa0b8, 1).fillCircle(138, 176, 3).fillStyle(0x1a2030, 1).fillCircle(138, 176, 1);    // gear
    p.fillStyle(0x6a8a6a, 1).fillRect(110, 187, 7, 6).fillStyle(0xc9a27a, 1).fillRect(121, 188, 10, 5); // boxes
    p.fillStyle(0x4b4f63, 1).fillRect(132, 196, 9, 9).fillStyle(0x8affa0, 1).fillRect(134, 199, 2, 2).fillRect(138, 199, 2, 2); // bot head
    p.fillStyle(0x6a5a3a, 1).fillRect(106, 206, 40, 32).fillStyle(0x8a7a52, 1).fillRect(106, 206, 40, 2); // counter
    p.fillStyle(0x5a4a2a, 1).fillRect(110, 212, 12, 10).fillRect(126, 214, 14, 8);                     // crates (front)
    // HOLT'S BUNK: bunk bed, locker, codex shelf with a book
    p.fillStyle(0x4b4f63, 1).fillRect(147, 196, 2, 42).fillRect(164, 196, 2, 42);
    p.fillStyle(0x6a4a3a, 1).fillRect(149, 204, 15, 3).fillRect(149, 224, 15, 3);                      // bunks
    p.fillStyle(0xcfc8b8, 1).fillRect(150, 202, 4, 2).fillRect(150, 222, 4, 2);                        // pillows
    p.fillStyle(0x5a6a7a, 1).fillRect(167, 186, 11, 52).fillStyle(0x7a8a9a, 1).fillRect(168, 187, 9, 1);  // locker
    p.fillStyle(0x2a3040, 1).fillRect(169, 192, 7, 1).fillRect(169, 195, 7, 1).fillRect(175, 210, 1, 3);
    p.fillStyle(0x8a6a4a, 1).fillRect(146, 182, 20, 2).fillStyle(0x7fe0ff, 1).fillRect(150, 177, 3, 5).fillStyle(0xc9a7ff, 1).fillRect(154, 178, 2, 4); // codex shelf
    // signs (redrawn when the active spot changes) + full-height tap columns
    for (const sp of SPOTS) {
      sp.sg = this.add.graphics().setDepth(5);
      sp.texts = sp.sign.map((l, k) => this.add.bitmapText(sp.x, T + 6 + k * 7, FONT_KEY, l, 6).setOrigin(0.5, 0).setDepth(6));
      sp.zone = this.add.zone(sp.x - 18, T, 36, F + 6 - T).setOrigin(0).setDepth(30).setInteractive().on('pointerdown', () => this.goSpot(sp.id));
    }
    this.refreshSigns(true);
  }

  /** Active spot = where Holt is (solid highlight) or where he's heading (blinking). */
  get activeSpot() { return this.walk ? this.walk.to : this.at; }

  refreshSigns(force = false) {
    const target = !!this.walk;
    const blink = target && Math.floor(performance.now() / 160) % 2 === 0;
    const key = `${this.activeSpot}|${target}|${blink}`;
    if (!force && key === this.signKey) return;
    this.signKey = key;
    const T = C.WALL_TOP;
    for (const sp of SPOTS) {
      const on = sp.id === this.activeSpot;
      const g = sp.sg.clear();
      g.fillStyle(0x0d0b12, 0.95).fillRect(sp.x - 17, T + 3, 34, 17);
      if (on) {
        g.fillStyle(sp.tint, blink ? 0.12 : 0.3).fillRect(sp.x - 16, T + 4, 32, 15);
        g.lineStyle(2, sp.tint, blink ? 0.5 : 1).strokeRect(sp.x - 16, T + 4, 32, 15);
        g.fillStyle(sp.tint, 1).fillTriangle(sp.x - 3, T + 21, sp.x + 3, T + 21, sp.x, T + 24);   // pointer under the sign
      } else g.lineStyle(1, sp.tint, 0.55).strokeRect(sp.x - 16.5, T + 3.5, 33, 16);
      sp.texts.forEach((t, k) => t.setTint(on ? 0xffffff : (k ? 0xb8bccb : sp.tint)));
    }
  }

  get busy() { return this.boarding; }

  // ---- walking -----------------------------------------------------------------------------------
  /**
   * Tap a spot: Holt walks there and its panel opens in the content area on arrival (the current panel
   * stays up until then). Tapping the spot Holt is already at toggles: open its panel / back to the bay.
   */
  goSpot(id) {
    if (this.busy || this.lifting) return;
    const sp = this.spots[id];
    if (!sp) return;
    if (this.scene.isActive('GameOver')) this.scene.stop('GameOver');   // the summary is dismissed by moving on
    if (this.at === id && !this.walk) { this.ui.toggleAt(id); return; }
    if (this.walk && this.walk.to === id) return;
    this.walk = { from: this.at || this.walk?.from || 'between', to: id, x: sp.x, t0: performance.now() };
    this.at = null;
    this.refreshSigns();
  }

  /** Lift ride between the concourse and the rig. up=true: board (Holt rises out of view). */
  liftRide(up, done) {
    this.lifting = true;
    const top = C.WALL_TOP + 2, F = C.FLOOR_Y;
    this.holt.setDepth(4.6); this.lift.setDepth(4.5);   // inside the shaft: behind the AIRLOCK sign
    this.holt.setTexture(this.textures.exists('crew_climb1') ? 'crew_climb1' : 'crew_idle').setVisible(true);
    if (!up) { this.holt.y = top; this.lift.y = top; }
    this.tweens.add({ targets: [this.holt, this.lift], y: up ? top : F, duration: LIFT_MS, ease: 'Sine.easeInOut',
      onComplete: () => { this.lifting = false; this.holt.setTexture('crew_idle').setDepth(8); this.lift.setDepth(7); if (up) this.holt.setVisible(false); done?.(); } });
  }

  /** Contract accepted at the board: Holt walks to the airlock, rides up into the rig, then the descent. */
  board(planet) {
    if (!ANIM) { this.launchRun(planet); return; }
    this.boarding = true;
    this.boardT0 = performance.now();
    const go = () => this.liftRide(true, () => this.launchRun(planet));
    if (this.at === 'airlock' && !this.walk) { go(); return; }
    this.walk = { from: this.at || 'between', to: 'airlock', x: 90, t0: performance.now(), then: go };
    this.at = null;
  }

  launchRun(planet) {
    this.scene.stop('DockUI');
    if (ANIM) this.scene.start('Cutscene', { kind: 'descent', planet, boardMs: this.boardT0 ? Math.round(performance.now() - this.boardT0) : 0 });
    else this.scene.start('Game', { planet });
  }

  update(time, delta) {
    this.refreshSigns();
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
      this.refreshSigns();
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
    this.menu = null; this.menuKind = null; this.menuBtns = []; this.btns = {}; this.hot = {}; this.tags = {};
    this.pages = {}; this.radioPage = 0;
    this.toastQ = []; this.toastT = 0;
    if (data.welcome) this.toast(data.welcome, CYAN);
    // HUD
    this.hud = this.add.container(0, 0).setDepth(200);
    const hx = (x, y, s, tint = 0xffffff, size = 6) => {
      const t = this.add.bitmapText(x, y, FONT_KEY, s, size).setTint(tint);
      this.hud.add(t); return t;
    };
    this.hud.add(this.add.rectangle(0, 0, GAME_W, 22, 0x0d0b12, 0.92).setOrigin(0));
    hx(4, 3, 'DOCKED', CYAN);
    this.creditText = hx(4, 11, '', GOLD);
    this.bestText = hx(176, 3, '', GREY).setOrigin(1, 0);
    // bottom bar: where Holt is (or a short toast in its place)
    this.hud.add(this.add.rectangle(0, 303, GAME_W, 17, 0x0d0b12, 0.96).setOrigin(0));
    this.hud.add(this.add.rectangle(0, 303, GAME_W, 1, 0x3a3348).setOrigin(0));
    this.statusText = hx(GAME_W / 2, 309, '', GREEN).setOrigin(0.5, 0);
    this.toastText = this.add.bitmapText(GAME_W / 2, 309, FONT_KEY, '', 6).setOrigin(0.5, 0).setDepth(211).setVisible(false);
    this.refreshHud();
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

  /** Short messages replace the bottom-bar status for 1.6 s (never over the panels or the concourse). */
  toast(text, color = 0xffffff) { this.toastQ.push({ text, color }); if (this.toastQ.length > 2) this.toastQ.shift(); if (this.toastT > 700) this.toastT = 700; }

  statusLine() {
    const d = this.dock;
    if (d.boarding) return d.lifting ? 'HOLT RIDES UP TO THE RIG' : 'HOLT HEADS FOR THE AIRLOCK';
    if (d.lifting) return 'HOLT STEPS OUT OF THE AIRLOCK';
    if (d.walk) return 'WALKING TO ' + d.spots[d.walk.to].name;
    return 'AT ' + (d.spots[d.at]?.name || 'THE CONCOURSE');
  }

  /** Holt arrived at a concourse spot: its panel fills the content area. */
  openAt(spotId) {
    const sp = SPOTS.find((x) => x.id === spotId);
    if (!sp) return;
    this.pages = {}; this.radioPage = 0;          // a fresh visit starts on page 1
    this.openMenu(sp.panel);
  }

  /** Tapped the spot Holt is standing at: sub-panel -> its main panel; main panel -> back to the bay. */
  toggleAt(spotId) {
    const sp = SPOTS.find((x) => x.id === spotId);
    if (this.menu && PANEL_SPOT[this.menuKind] === spotId) {
      if (this.menuKind === sp.panel) this.closeMenu(); else this.openMenu(sp.panel);
    } else this.openAt(spotId);
  }

  // ---- panels: they fill the content area (y 22..202) only; the concourse below stays live ----------
  openMenu(kind, arg) {
    this.closeMenu();
    this.hideBanner();
    this.menuKind = kind; this.menuArg = arg;
    this.menu = [];  // plain objects to destroy on close (buttons tracked in menuBtns)
    this.btns = {}; this.hot = {}; this.tags = {};
    this.menu.push(this.add.rectangle(0, CONTENT.y, GAME_W, CONTENT.h, 0x0d0b12, 1).setOrigin(0).setInteractive().setDepth(300));
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
    this.btns = {}; this.hot = {}; this.tags = {};
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

  /** Header bar (y 22..38): optional '<' back on the left, title, 'X' (back to the bay view) on the right. */
  buildPanel(title, { back = null, tint = CYAN } = {}) {
    const Y = CONTENT.y;
    this.menu.push(this.add.rectangle(0, Y, GAME_W, 17, 0x161a26, 1).setOrigin(0).setDepth(301));
    this.menu.push(this.add.rectangle(0, Y + 17, GAME_W, 1, tint, 0.6).setOrigin(0).setDepth(301));
    this.menu.push(this.add.rectangle(0, Y + CONTENT.h - 1, GAME_W, 1, 0x3a3348, 1).setOrigin(0).setDepth(301));
    if (back) this.btns.back = this.addBtn(2, Y + 1, 26, 15, '<', 0x3a3348, back);
    this.addT(back ? 32 : 6, Y + 3, title, 12, tint);
    this.btns.close = this.addBtn(152, Y + 1, 26, 15, 'X', 0x5a2a2a, () => this.closeMenu());
  }

  /** Page through `n` items, `per` per page, with < PREV / NEXT > at the bottom of the content area. */
  pager(key, n, per, rebuild) {
    const pages = Math.max(1, Math.ceil(n / per));
    const page = Math.min(this.pages[key] || 0, pages - 1);
    this.pages[key] = page;
    if (pages > 1) {
      const y = CONTENT.y + CONTENT.h - 19;
      this.btns.prev = this.addBtn(6, y, 54, 16, '< PREV', 0x3a3348, () => { this.pages[key] = (page + pages - 1) % pages; rebuild(); });
      this.addT(GAME_W / 2, y + 5, `${page + 1}/${pages}`, 6, GREY, 0.5);
      this.btns.next = this.addBtn(120, y, 54, 16, 'NEXT >', 0x3a3348, () => { this.pages[key] = (page + 1) % pages; rebuild(); });
    }
    return { page, pages, from: page * per, to: page * per + per };
  }

  /** Part card: name, upside, downside (wrapped). Returns its height. */
  partCard(p, x, y, w, { right = '', rightTint = GOLD, color = 0x1d2433, onTap = null, nameTint = GOLD } = {}) {
    const up = wrap('+ ' + p.up, 36), down = wrap('- ' + p.down, 36);
    const h = 14 + (up.length + down.length) * 8;
    const b = this.addBtn(x, y, w, h, '', color, onTap || (() => {}));
    this.addT(x + 6, y + 4, p.name, 6, nameTint);
    if (right) this.addT(x + w - 5, y + 4, right, 6, rightTint, 1);
    up.forEach((l, i) => this.addT(x + 6, y + 13 + i * 8, l, 6, GREEN));
    down.forEach((l, i) => this.addT(x + 6, y + 13 + (up.length + i) * 8, l, 6, RED));
    return { h, b };
  }
  partCardH(p) { return 14 + (wrap('+ ' + p.up, 36).length + wrap('- ' + p.down, 36).length) * 8; }

  // CONTRACT BOARD: mission select (data-driven: one card per unlocked planet in contracts.js; 2 per page)
  buildBoard() {
    this.buildPanel('CONTRACTS', { tint: GOLD });
    const s = loadSave();
    this.addT(GAME_W / 2, 42, 'POSTED BY THE COMPANY. ONE AT A TIME.', 6, DIM, 0.5);
    const list = CONTRACTS();
    const pg = this.pager('board', list.length, 2, () => this.openMenu('board'));
    let y = 52;
    list.slice(pg.from, pg.to).forEach((c) => {
      this.menu.push(this.add.rectangle(6, y, 168, 62, 0x161a26, 1).setOrigin(0).setStrokeStyle(1, c.color).setDepth(302));
      this.addT(12, y + 4, c.planetName, 12, c.colorText);
      this.addT(168, y + 7, `BEST ${s.best[c.planet] || 0}M`, 6, CYAN, 1);
      this.addT(12, y + 19, c.title, 6, 0xffffff);
      this.addT(12, y + 27, `PAY X${c.pay.toFixed(1)}/M  -  RELAY EVERY 1000M`, 6, GREY);
      this.addT(12, y + 35, 'HAZARDS: ' + c.hazards, 6, GREY);
      this.btns['contract_' + c.planet] = this.addBtn(12, y + 44, 156, 15, 'ACCEPT CONTRACT', 0x7a3320, () => this.startContract(c.planet));
      y += 68;
    });
    if (pg.pages === 1) {
      this.addT(GAME_W / 2, y + 4, 'MORE PLANETS POST HERE IN M3', 6, DIM, 0.5);
      this.addT(GAME_W / 2, y + 16, 'ACCEPTING: HOLT BOARDS THE RIG AND UNDOCKS', 6, DIM, 0.5);
      this.addT(GAME_W / 2, y + 30, "RADIO REPLAY: INES'S WINDOW", 6, 0xffc35c, 0.5);
    }
  }

  // INES'S WINDOW: dispatch (latest message, radio replay 2 per page); story content arrives later
  buildInes() {
    this.buildPanel("INES'S WINDOW", { tint: 0xffc35c });
    const s = loadSave();
    const radio = (s.radio || []).slice().reverse();
    this.addT(GAME_W / 2, 42, '(STORY: LATER MILESTONE)', 6, DIM, 0.5);
    this.menu.push(this.add.rectangle(6, 51, 168, 44, 0x1e1a12, 1).setOrigin(0).setStrokeStyle(1, 0xffc35c).setDepth(302));
    this.addT(11, 54, 'LATEST', 6, 0xffc35c);
    const latest = radio.length ? radio[0].text : "NOTHING ON THE WIRE YET, HOLT. THE KETTLE'S ON. TAKE A CONTRACT AND I'LL TALK YOUR EAR OFF.";
    if (radio.length) this.addT(169, 54, radio[0].tag, 6, CYAN, 1);
    wrap(latest, 39).slice(0, 4).forEach((l, i) => this.addT(11, 63 + i * 8, l, 6, 0xfff2d8));
    const older = radio.slice(1);
    this.addT(8, 100, 'RADIO REPLAY', 6, GOLD);
    if (!older.length) { this.addT(8, 112, 'NO OLDER TRAFFIC.', 6, DIM); return; }
    const pg = this.pager('radio', older.length, 2, () => this.openMenu('ines'));
    this.radioPage = pg.page;
    if (pg.pages > 1) { this.btns.radioOlder = this.btns.next; this.btns.radioNewer = this.btns.prev; this.btns.next.setLabel('OLDER >'); this.btns.prev.setLabel('< NEWER'); }
    let y = 110;
    older.slice(pg.from, pg.to).forEach((r) => {
      this.addT(8, y, r.tag, 6, CYAN); y += 8;
      wrap(r.text, 40).slice(0, 3).forEach((l) => { this.addT(8, y, l, 6, 0xd8f4f8); y += 8; });
      y += 3;
    });
  }

  // RIG BAY (garage): the rig's exterior, drill up, with a callout per slot. Tap a part on the rig (or
  // its callout) to swap that slot. Each slot has its own colour on both the hotspot and the callout.
  buildBay() {
    this.buildPanel('RIG BAY', { tint: CYAN });
    const s = loadSave();
    const add = (o) => { o.setDepth(303); this.menu.push(o); return o; };
    // the rig, drill up: TB-6 (cutter 42..55, frame + hopper 54..110) with CORMORANT coupled behind (110..172)
    const CX = 50, CY = 134;                       // rig origin = run world (90, 260)
    const g = add(this.add.graphics());
    g.fillStyle(0x05060c, 1).fillRect(0, 40, 96, CONTENT.y + CONTENT.h - 41);
    for (let i = 0; i < 24; i++) g.fillStyle(0xffffff, 0.3 + (i % 3) * 0.2).fillRect(3 + (i * 37) % 90, 42 + (i * 29) % 100, 1, 1);
    for (const o of rigParts(this, 260).parts) { o.x += CX; o.y += CY; add(o); }
    const g2 = add(this.add.graphics());
    const deck = 182, sb = CY + (L.SHIP_BOTTOM - 260);   // station roof; the ship's engine end
    for (const x of [30, 66]) { g2.fillStyle(0x4b4f63, 1).fillRect(x, sb - 6, 4, deck - sb + 6); for (let y = sb - 6; y < deck; y += 2) g2.fillStyle(0xffd23f, 1).fillRect(x, y, 4, 1); }
    g2.fillStyle(0x23263a, 1).fillRect(43, sb + 1, 14, deck - sb - 1).fillStyle(0x8affa0, 1).fillRect(48, sb + 2, 4, 1);   // collar
    g2.fillStyle(0x3a3f55, 1).fillRect(0, deck, 96, 3).fillStyle(0x1a2030, 1).fillRect(0, deck + 3, 96, CONTENT.y + CONTENT.h - deck - 4);
    // station side: the airlock door under the collar, Holt's kit locker beside it
    g2.fillStyle(0x2f6a8a, 1).fillRect(43, deck + 4, 14, 15);
    for (let i = 0; i < 4; i++) g2.fillStyle(i % 2 ? 0x1a1a1a : 0xffd23f, 1).fillRect(41, deck + 4 + i * 4, 2, 4).fillRect(57, deck + 4 + i * 4, 2, 4);
    g2.fillStyle(0x5a6a7a, 1).fillRect(10, deck + 4, 12, 15).fillStyle(0x7a8a9a, 1).fillRect(11, deck + 5, 10, 1);
    g2.fillStyle(0x2a3040, 1).fillRect(12, deck + 8, 8, 1).fillRect(12, deck + 11, 8, 1).fillRect(19, deck + 13, 1, 3);
    this.addT(79, deck + 5, 'TAP A', 6, GREY, 0.5);
    this.addT(79, deck + 12, 'PART', 6, GREY, 0.5);
    // hotspots over the actual part locations (base px) + their callouts in the right column
    const H = {
      drill:  { x: 8, y: 40, w: 84, h: 24, c: GOLD },       // the TB-6 cutterhead
      hull:   { x: 8, y: 64, w: 84, h: 36, c: 0xff9a4a },   // the TB-6 frame + hopper (DRILL FRAME)
      tools:  { x: 2, y: 112, w: 32, h: 24, c: GREEN },     // the left mandible (TOOLS is just inboard)
      helm:   { x: 64, y: 128, w: 32, h: 24, c: CYAN },     // the cockpit pod
      siphon: { x: 2, y: 136, w: 32, h: 24, c: 0x4fe0c0 },  // the hose port + reel on the left flank
      engine: { x: 34, y: 156, w: 34, h: 24, c: RED },      // reactor dome + the engine arc
      kit:    { x: 0, y: 177, w: 32, h: 24, c: VIOLET },    // Holt's locker by the airlock
    };
    const order = ['drill', 'helm', 'hull', 'engine', 'tools', 'siphon', 'kit'];
    order.forEach((id, i) => {
      const slot = SLOTS.find((x) => x.id === id), h = H[id], part = partById(s.loadout[id]);
      const open = () => this.time.delayedCall(0, () => this.openMenu('slot', id));
      // hotspot brackets (pulsing) in the slot colour
      const br = add(this.add.graphics());
      br.lineStyle(1, h.c, 1);
      const c = 4, x1 = h.x + 1.5, y1 = h.y + 1.5, x2 = h.x + h.w - 1.5, y2 = h.y + h.h - 1.5;
      br.lineBetween(x1, y1, x1 + c, y1).lineBetween(x1, y1, x1, y1 + c).lineBetween(x2, y1, x2 - c, y1).lineBetween(x2, y1, x2, y1 + c)
        .lineBetween(x1, y2, x1 + c, y2).lineBetween(x1, y2, x1, y2 - c).lineBetween(x2, y2, x2 - c, y2).lineBetween(x2, y2, x2, y2 - c);
      br.fillStyle(h.c, 1).fillRect(x1 + 2, y1 + 2, 3, 3);   // colour key, matches the callout
      this.tweens.add({ targets: br, alpha: 0.4, duration: 800, yoyo: true, repeat: -1 });
      add(this.add.zone(h.x, h.y, h.w, h.h).setOrigin(0).setInteractive()).setDepth(330).on('pointerdown', open);
      this.hot[id] = { x: h.x, y: h.y, w: h.w, h: h.h, part: part.id };
      // callout: slot name (slot colour) + equipped part (green when not stock)
      const ty = 40 + i * 23, tx = 98, tw = 80, th = 22;   // 7 slots: one-line part names
      const b = this.addBtn(tx, ty, tw, th, '', 0x161a26, () => this.openMenu('slot', id));
      this.addT(tx + 4, ty + 3, slot.name, 6, h.c);
      this.addT(tx + 4, ty + 12, part.name, 6, part.stock ? 0xffffff : GREEN);
      add(this.add.rectangle(tx, ty, 3, th, h.c, 1).setOrigin(0));
      this.tags[id] = { x: tx, y: ty, w: tw, h: th, btn: b };
    });
  }

  startContract(planet) {
    this.closeMenu();
    this.dock.board(planet);   // walk to the airlock, ride up, undock (or straight into the run with ?anim=0)
  }

  // one slot's swap list: owned parts with upside + downside (paged), notes on the last page
  buildSlot(slotId) {
    const slot = SLOTS.find((x) => x.id === slotId);
    this.buildPanel(slot.name, { back: () => this.openMenu('bay') });
    const save = loadSave();
    this.addT(8, 42, 'TAP A PART TO EQUIP IT', 6, GREY);
    const owned = partsForSlot(slotId).filter((p) => save.owned.includes(p.id));
    // greedy pages: cards from y 51 down to the pager row
    const bottom = CONTENT.y + CONTENT.h - 22, pages = [[]];
    let yy = 51;
    for (const p of owned) { const h = this.partCardH(p); if (yy + h > bottom && pages.at(-1).length) { pages.push([]); yy = 51; } pages.at(-1).push(p); yy += h + 3; }
    const key = 'slot_' + slotId;
    this.pager(key, pages.length, 1, () => this.openMenu('slot', slotId));
    const pageParts = pages[this.pages[key]] || [];
    let y = 51;
    this.btns.parts = {};
    for (const p of pageParts) {
      const eq = save.loadout[slotId] === p.id;
      const { h, b } = this.partCard(p, 6, y, 168, { right: eq ? 'EQUIPPED' : 'EQUIP', rightTint: eq ? GREEN : GREY,
        color: eq ? 0x22402e : 0x1d2433, nameTint: eq ? GREEN : GOLD, onTap: () => this.doEquip(p.id) });
      this.btns.parts[p.id] = b;
      y += h + 3;
    }
    if (this.pages[key] !== pages.length - 1) return;
    const notOwned = partsForSlot(slotId).filter((p) => !save.owned.includes(p.id));
    const open = notOwned.filter((p) => isUnlocked(save, p)).length;
    const notes = [];
    if (open) notes.push([`${open} MORE IN THE QUARTERMASTER'S ROTATION`, DIM]);
    notOwned.filter((p) => !isUnlocked(save, p)).forEach((p) => notes.push([`LOCKED: ${p.name} - ${unlockText(p)}`, VIOLET]));
    if (!notOwned.length) notes.push(['YOU OWN EVERY PART FOR THIS SLOT', DIM]);
    let fy = y + 3;
    for (const [t, c] of notes) { if (fy + 8 > CONTENT.y + CONTENT.h - 2) break; this.addT(GAME_W / 2, fy, t, 6, c, 0.5); fy += 9; }
  }

  doEquip(id) {
    const r = equipPart(id);
    if (!r.ok) { this.toast(r.reason, RED); return; }
    this.toast('EQUIPPED: ' + partById(id).name, GREEN);
    this.openMenu('slot', partById(id).slot);
  }

  // Holt's bunk: the log (stats) + the codex shelf
  buildStats() {
    this.buildPanel("HOLT'S LOG", { tint: VIOLET });
    const s = loadSave();
    const rows = [
      ['CREDITS', `${s.credits} CR`],
      ['TOTAL EARNED', `${s.totalEarned} CR`],
      ['BEST DEPTH (KESSA-4)', `${s.best.kessa4 || 0}M`],
      ['CONTRACTS RUN', `${s.runs}`],
      ['CASHED OUT', `${s.cashouts}`],
      ['DRILLS LOST (BILLED)', `${s.drillsLost}`],
      ['RELAYS REACHED', `${s.relaysReached}`],
      ['DEEPEST RELAY', `${s.deepestRelay || 0}`],
      ['PARTS OWNED', `${s.owned.length}/${PARTS.length}`],
      ['PARTS UNLOCKED', `${PARTS.filter((p) => isUnlocked(s, p)).length}/${PARTS.length}`],
    ];
    rows.forEach(([a, b], i) => {
      this.addT(10, 43 + i * 11, a, 6, GREY);
      this.addT(170, 43 + i * 11, b, 6, GOLD, 1);
    });
    const next = this.nextUnlock(s);
    this.addT(10, 156, next ? `NEXT UNLOCK: ${next}` : 'ALL PARTS UNLOCKED', 6, VIOLET);
    this.addT(10, 166, 'LOADOUT: SEE THE RIG BAY (AIRLOCK)', 6, DIM);
    this.btns.codex = this.addBtn(6, 179, 168, 18, 'CODEX SHELF  >', 0x2a2a4a, () => this.openMenu('codex'));
  }

  // codex shelf above the bunk: stub (M4)
  buildCodex() {
    this.buildPanel('CODEX', { back: () => this.openMenu('stats'), tint: VIOLET });
    this.addT(GAME_W / 2, 50, 'THE SHELF IS EMPTY.', 6, GREY, 0.5);
    this.addT(GAME_W / 2, 62, 'FINDS YOU RECOVER END UP HERE.', 6, DIM, 0.5);
    ['STRATA', 'LIFE', 'ARTIFACTS', 'LOGS', 'COMPANY'].forEach((c, i) => {
      this.addT(40, 84 + i * 16, c, 6, DIM);
      this.addT(140, 84 + i * 16, '0', 6, DIM, 1);
    });
  }

  // Quartermaster: one row per offer (6 per page); tap for the full upside/downside + buy
  buildVendor() {
    this.buildPanel('QUARTERMASTER', { tint: GREEN });
    const s = loadSave();
    const cost = rerollCost(s);
    const locked = PARTS.filter((p) => !isUnlocked(s, p));
    this.btns.reroll = this.addBtn(6, 41, 72, 16, `REROLL: ${cost}`, s.credits >= cost ? 0x5a4a2a : 0x3a3348, () => this.doReroll());
    this.btns.locked = this.addBtn(81, 41, 54, 16, `LOCKED ${locked.length}`, 0x3a2a4a, () => this.openMenu('locked'));
    this.addT(174, 46, `${s.credits}`, 6, GOLD, 1);
    const offers = [];
    for (const slot of SLOTS) for (const id of s.vendor.stock.filter((x) => partById(x)?.slot === slot.id)) offers.push({ id, slot });
    const PER = 6;
    const pg = this.pager('vendor', offers.length, PER, () => this.openMenu('vendor'));
    this.vendorPage = pg.page; this.vendorPages = pg.pages;
    let y = 61;
    this.btns.offers = {};
    this.offerIds = offers.map((o) => o.id);
    offers.slice(pg.from, pg.to).forEach(({ id, slot }) => {
      const p = partById(id), owned = s.owned.includes(id), can = !owned && s.credits >= p.price;
      this.btns.offers[id] = this.addBtn(6, y, 168, 17, '', owned ? 0x1a2a1a : 0x1d2433, () => { if (!owned) this.openMenu('buy', id); });
      this.addT(11, y + 6, slot.short, 6, CYAN);
      this.addT(29, y + 6, p.name, 6, owned ? GREEN : 0xffffff);
      this.addT(169, y + 6, owned ? 'OWNED' : `${p.price}`, 6, owned ? GREEN : (can ? GOLD : RED), 1);
      y += 19;
    });
    if (!offers.length) this.addT(GAME_W / 2, 90, 'SOLD OUT. RUN A CONTRACT.', 6, DIM, 0.5);
    const next = this.nextUnlock(s);
    const lastY = CONTENT.y + CONTENT.h - (pg.pages > 1 ? 22 : 2);
    if (next && y + 12 <= lastY) { this.addT(GAME_W / 2, y + 4, `NEXT UNLOCK: ${next}`, 6, VIOLET, 0.5); y += 12; }
    if (pg.pages === 1 && y + 10 <= lastY) this.addT(GAME_W / 2, lastY - 9, 'TAP A PART FOR UPSIDE + DOWNSIDE', 6, DIM, 0.5);
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

  // Locked parts list (from the Quartermaster), 7 per page
  buildLocked() {
    this.buildPanel('LOCKED PARTS', { back: () => this.openMenu('vendor'), tint: VIOLET });
    const s = loadSave();
    this.addT(8, 42, 'UNLOCK BY BEST DEPTH OR TOTAL RELAYS.', 6, GREY);
    this.addT(8, 51, 'THEN THEY JOIN THE ROTATING STOCK.', 6, GREY);
    const locked = PARTS.filter((p) => !isUnlocked(s, p))
      .sort((a, b) => (a.unlock.depth || a.unlock.relays * 1000) - (b.unlock.depth || b.unlock.relays * 1000));
    this.lockedRows = locked.map((p) => p.id);
    const pg = this.pager('locked', locked.length, 7, () => this.openMenu('locked'));
    locked.slice(pg.from, pg.to).forEach((p, i) => {
      const y = 61 + i * 17;
      this.menu.push(this.add.rectangle(6, y, 168, 15, 0x15121c, 1).setOrigin(0).setDepth(302));
      this.addT(11, y + 5, SLOTS.find((x) => x.id === p.slot).short, 6, DIM);
      this.addT(29, y + 5, p.name, 6, 0x8a8298);
      this.addT(169, y + 5, unlockText(p), 6, VIOLET, 1);
    });
    if (!locked.length) this.addT(GAME_W / 2, 90, 'EVERYTHING IS UNLOCKED.', 6, GREEN, 0.5);
  }

  buildBuy(id) {
    const p = partById(id), s = loadSave();
    const slot = SLOTS.find((x) => x.id === p.slot);
    this.buildPanel('BUY PART', { back: () => this.openMenu('vendor'), tint: GREEN });
    this.addT(8, 42, slot.name + ' PART', 6, CYAN);
    this.addT(8, 51, p.name, 12, GOLD);
    this.addT(8, 66, 'UPSIDE', 6, GREEN);
    wrap(p.up, 40).slice(0, 2).forEach((l, i) => this.addT(8, 74 + i * 8, l, 6, 0xffffff));
    this.addT(8, 92, 'DOWNSIDE', 6, RED);
    wrap(p.down, 40).slice(0, 2).forEach((l, i) => this.addT(8, 100 + i * 8, l, 6, 0xffffff));
    const cur = partById(s.loadout[p.slot]);
    this.addT(8, 118, 'REPLACES', 6, GREY);
    this.addT(172, 118, cur.name, 6, 0xffffff, 1);
    this.addT(8, 127, 'PRICE', 6, GREY);
    this.addT(172, 127, `${p.price} CR`, 6, GOLD, 1);
    this.addT(8, 136, 'YOU HAVE', 6, GREY);
    this.addT(172, 136, `${s.credits} CR`, 6, s.credits >= p.price ? GOLD : RED, 1);
    const owned = s.owned.includes(id), can = !owned && s.credits >= p.price;
    const label = owned ? 'OWNED' : can ? 'BUY + EQUIP' : 'NOT ENOUGH CREDITS';
    this.btns.buyEquip = this.addBtn(6, 147, 168, 24, label, can ? 0x7a3320 : 0x3a3348, () => this.doBuy(id, true));
    this.btns.buy = this.addBtn(6, 175, 168, 22, can ? 'BUY ONLY' : '-', can ? 0x2f6a3a : 0x3a3348, () => this.doBuy(id, false));
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
    this.pages.vendor = 0;
    this.openMenu('vendor');
  }

  /** 'NEW PARTS AVAILABLE' notice over the bay view, once the end-of-run summary is closed. */
  showUnlockBanner() {
    const ids = ackUnlocks();
    if (!ids.length) return;
    const names = ids.map((id) => partById(id).name);
    const lines = [];
    let cur = '';
    for (const n of names) { if ((cur ? cur + ', ' + n : n).length > 38) { lines.push(cur); cur = n; } else cur = cur ? cur + ', ' + n : n; }
    lines.push(cur);
    const h = 18 + lines.length * 8, Y = CONTENT.y + 6;
    const objs = [this.add.rectangle(6, Y, 168, h, 0x1a1028, 0.96).setOrigin(0).setStrokeStyle(1, VIOLET).setDepth(250)];
    objs.push(this.add.bitmapText(GAME_W / 2, Y + 4, FONT_KEY, 'NEW PARTS AVAILABLE', 6).setOrigin(0.5, 0).setTint(VIOLET).setDepth(251));
    lines.forEach((l, i) => objs.push(this.add.bitmapText(GAME_W / 2, Y + 14 + i * 8, FONT_KEY, l, 6).setOrigin(0.5, 0).setTint(0xffffff).setDepth(251)));
    const zone = this.add.zone(6, Y, 168, h).setOrigin(0).setInteractive().setDepth(252).on('pointerdown', () => this.hideBanner());
    objs.push(zone);
    this.banner = { objs, ids, text: names.join(', '), top: Y, bottom: Y + h };
    this.bannerT = 5000;
  }
  hideBanner() { if (!this.banner) return; this.banner.objs.forEach((o) => o.destroy()); this.lastBanner = this.banner; this.banner = null; }

  update(time, delta) {
    if (!this.banner && !this.bannerChecked && !this.menu && !this.scene.isActive('GameOver') && !this.dock.lifting && !this.dock.summaryPending) { this.bannerChecked = true; this.showUnlockBanner(); }
    if (this.banner && (this.bannerT -= delta) <= 0) this.hideBanner();
    this.statusText.setText(this.statusLine());
    if (this.toastT > 0) this.toastT -= delta;
    else if (this.toastQ.length) {
      const t = this.toastQ.shift();
      this.toastText.setText(t.text).setTint(t.color).setVisible(true);
      this.toastT = 1600;
    } else if (this.toastText.visible) this.toastText.setVisible(false);
    this.statusText.setVisible(!this.toastText.visible);
  }
}
