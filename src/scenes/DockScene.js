// Docked home base (M2): the rig's 2x2 interior at the station. Holt walks between rooms
// just like in a run. Tapping a station opens a diegetic menu; the ladder hatch opens
// the station concourse (Quartermaster / Survey / Dispatch).
import { GAME_W, GAME_H, LAYOUT as L } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { Ship } from '../systems/Ship.js';
import { Crew } from '../systems/Crew.js';
import { loadSave, buyPart, equipPart, reroll, rerollCost, isUnlocked, ackUnlocks, progressOf } from '../systems/Save.js';
import { SLOTS, PARTS, partById, partsForSlot, unlockText } from '../data/parts.js';
import { CONTRACTS } from '../data/contracts.js';
import { ANIM } from '../systems/Settings.js';

const CYAN = 0x7fe0ff, GOLD = 0xffd23f, GREY = 0x9aa0b8, GREEN = 0x8affa0, RED = 0xff5a5a, DIM = 0x6a6278;

function wrap(text, width) {
  const lines = []; let cur = '';
  for (const w of String(text).split(' ')) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export class DockScene extends Phaser.Scene {
  constructor() { super('Dock'); }

  create(data = {}) {
    this.cameras.main.setBackgroundColor('#0a0c14');
    // Orientation matches the docking cutscene after its closing turn: the interior is shown drill-UP
    // (as in the run), so the station sits BELOW the rig, clamped to its hull end where the ladder
    // hatch opens into the docking collar. The window at the drill end looks out into space.
    this.bg = this.add.tileSprite(0, 0, GAME_W, 400, 'rock').setOrigin(0).setTint(0x34405a).setAlpha(0.5);
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x05060c, 1).fillRect(52, 198, 76, 34);
    g.lineStyle(1, 0x3a4a6a, 1).strokeRect(52.5, 198.5, 75, 33);
    for (let i = 0; i < 22; i++) g.fillStyle(0xffffff, 0.3 + (i % 4) * 0.18).fillRect(54 + (i * 29) % 72, 200 + (i * 11) % 30, 1, 1);
    g.fillStyle(0x8a4a32, 1).fillCircle(112, 236, 14); // Kessa-4's limb, far off
    g.fillStyle(0x05060c, 1).fillRect(52, 232, 76, 8);
    g.lineStyle(1, 0x3a4a6a, 1).lineBetween(52, 232.5, 128, 232.5);
    // the station, below: hull band, docking collar under the hatch, clamps gripping the rig's hull end
    g.fillStyle(0x3a3f55, 1).fillRect(0, 309, GAME_W, 12);
    g.fillStyle(0x4b4f63, 1).fillRect(0, 309, GAME_W, 1);
    for (let x = 4; x < GAME_W; x += 10) g.fillStyle(0xfff2a8, 0.7).fillRect(x, 313, 3, 1);
    g.fillStyle(0x23263a, 1).fillRect(80, 302, 20, 7);              // docking collar
    g.fillStyle(0x8affa0, 1).fillRect(88, 305, 4, 1);               // collar light: sealed
    for (const x of [58, 118]) {                                    // docking clamps (engaged)
      g.fillStyle(0x4b4f63, 1).fillRect(x, 300, 4, 9);
      for (let y = 300; y < 309; y += 2) g.fillStyle(0xffd23f, 1).fillRect(x, y, 4, 1);
    }

    this.ship = new Ship(this, (id) => this.onRoomTap(id), () => {});
    this.crew = new Crew(this, this.ship, 'helm');
    // docked: no drill, no exterior plating; we live in the cutaway
    this.ship.drill.setVisible(false);
    this.ship.chips.emitting = false;
    this.ship.exterior.setVisible(false);
    this.ship.setInside(true, 0);
    this.cameras.main.setZoom(L.INSIDE_CAM.zoom).centerOn(L.INSIDE_CAM.x, L.INSIDE_CAM.y);
    this.buildDecor();
    this.pending = null;          // room/prop Holt is walking toward
    this.scene.launch('DockUI', data);
    this.ui = this.scene.get('DockUI');
    if (data.summary) this.scene.launch('GameOver', data.summary); // end-of-run summary over the docked rig
    this.input.keyboard?.on('keydown-ONE', () => this.onRoomTap('helm'));
    this.input.keyboard?.on('keydown-TWO', () => this.onRoomTap('drill'));
    this.input.keyboard?.on('keydown-THREE', () => this.onRoomTap('engine'));
    this.input.keyboard?.on('keydown-FOUR', () => this.onRoomTap('tools'));
  }

  buildDecor() {
    const d = this.decor = {};
    const B = L.DECKS.bottom;
    // fold-down cot by the ladder (ENG side of the bottom deck)
    d.cot = this.add.rectangle(L.HUB.x - 9, B.floor, 12, 4, 0x6a4a3a).setDepth(12).setOrigin(0.5, 1);
    d.pillow = this.add.rectangle(L.HUB.x - 13, B.floor - 4, 4, 2, 0xcfc8b8).setDepth(12).setOrigin(0.5, 1);
    d.cotZone = this.add.zone(L.HUB.x - 17, B.floor - 12, 15, 15).setOrigin(0).setDepth(31).setInteractive()
      .on('pointerdown', () => this.goProp('cot', { x: L.HUB.cx - L.STAND_OFFSET + 4, y: B.floor }));
    // DRL shelf (codex)
    const dr = this.ship.room('drill');
    d.shelf = this.add.rectangle(dr.x + 6, dr.ceil + 9, 10, 1, 0x8a6a4a).setDepth(12);
    d.shelf2 = this.add.rectangle(dr.x + 6, dr.ceil + 14, 10, 1, 0x8a6a4a).setDepth(12);
    d.shelfZone = this.add.zone(dr.x + 1, dr.ceil + 4, 12, 14).setOrigin(0).setDepth(31).setInteractive()
      .on('pointerdown', () => this.goProp('codex', { x: dr.standX, y: dr.floorY }));
    // airlock hatch in the bottom deck floor, under the ladder (to the station)
    d.hatch = this.add.rectangle(L.HUB.cx, B.floor + 1, 10, 2, 0x2f6a8a).setDepth(12);
    d.hatchGlow = this.add.rectangle(L.HUB.cx, B.floor, 6, 1, 0x7fe0ff).setDepth(12);
    this.tweens.add({ targets: d.hatchGlow, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });
    d.hatchZone = this.add.zone(L.HUB.x, B.floor - 12, L.HUB.w, 15).setOrigin(0).setDepth(31).setInteractive()
      .on('pointerdown', () => this.goProp('hatch', { x: L.HUB.cx, y: B.floor }));
  }

  get busy() { return !!this.ui?.menu; }

  onRoomTap(id) {
    if (this.busy) return;
    this.propWalking = false; this.propSpot = null;
    this.pending = id;
    if (this.crew.station === id) { this.ui.openAt(id); this.pending = null; return; }
    this.crew.goTo(id);
  }

  /** Walk to a prop spot (cot / shelf / hatch): plan to the nearest room on that deck, then step over. */
  goProp(kind, spot) {
    if (this.busy) return;
    const deckRoom = { cot: 'engine', codex: 'drill', hatch: 'engine' }[kind];
    this.propWalking = false;
    this.pending = kind;
    this.propSpot = spot;
    if (this.crew.station === deckRoom || this.crew.station === kind) { this.arrivedAtDeckRoom(); return; }
    this.crew.goTo(deckRoom);
    this.crew.target = deckRoom;
  }

  arrivedAtDeckRoom() {
    const c = this.crew, spot = this.propSpot;
    c.path = [{ x: spot.x, y: spot.y }];
    c.station = null;
    c.target = '__prop';
    this.propWalking = true;
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.bg.tilePositionY -= dt * 2;
    // prop walks: Crew.update expects a room target, so step the last leg here
    if (this.propWalking) {
      const c = this.crew, p = c.path[0];
      const sp = 48 * c.walkMul * c.speedMul * dt;
      const dx = p.x - c.sprite.x;
      if (Math.abs(dx) <= sp) {
        c.sprite.x = p.x; c.path = []; this.propWalking = false;
        c.station = this.pending; c.sprite.setTexture('crew_idle');
        const kind = this.pending; this.pending = null;
        this.ui.openAt(kind);
      } else { c.sprite.x += Math.sign(dx) * sp; c.sprite.setFlipX(dx < 0); c.sprite.setTexture(Math.floor(time / 125) % 2 ? 'crew_walk' : 'crew_idle'); }
    } else {
      this.crew.update(dt);
      if (this.pending && this.crew.station !== null) {
        const room = this.crew.station;
        if (['cot', 'codex', 'hatch'].includes(this.pending)) { if (this.propSpot) this.arrivedAtDeckRoom(); }
        else if (room === this.pending) { const k = this.pending; this.pending = null; this.ui.openAt(k); }
      }
    }
    this.ship.update(dt, 0, false, {}, false, time);
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
    this.hintText = hx(GAME_W / 2, 238, 'TAP A ROOM. HOLT WALKS THERE.', GREY).setOrigin(0.5, 0);
    [['HELM', 'CONTRACTS, RADIO, HELM PART'], ['DRL', 'DRILL HEAD. SHELF: CODEX'], ['ENG', 'ENGINE. COT: HOLT\'S LOG'],
     ['TLS', 'TOOLS, HULL, HOLT\'S KIT'], ['HATCH', 'THE STATION + QUARTERMASTER']].forEach(([a, b], i) => {
      hx(10, 252 + i * 9, a, CYAN); hx(40, 252 + i * 9, b, DIM);
    });
    this.toastBg = this.add.graphics().setDepth(210).setVisible(false);
    this.toastText = this.add.bitmapText(GAME_W / 2, 44, FONT_KEY, '', 6).setOrigin(0.5).setDepth(211).setVisible(false);

    // bottom bar
    this.hud.add(this.add.rectangle(0, 303, GAME_W, 17, 0x0d0b12, 0.92).setOrigin(0));
    this.stationBtn = new Button(this, 2, 305, 72, 14, 'STATION', { color: 0x2f4a6a, pressColor: 0x4a7a9a, depth: 220, onTap: () => this.dock.goProp('hatch', { x: L.HUB.cx, y: L.DECKS.bottom.floor }) });
    this.pilotText = hx(130, 308, 'HOLT ABOARD', GREEN).setOrigin(0.5, 0);
    this.refreshHud();
    this.banner = null;
    this.bannerT = 0;

    // keyboard (desktop playtest)
    this.input.keyboard?.on('keydown-H', () => this.dock.goProp('hatch', { x: L.HUB.cx, y: L.DECKS.bottom.floor }));
    this.input.keyboard?.on('keydown-ESC', () => this.closeMenu());
  }

  refreshHud() {
    const s = loadSave();
    this.creditText.setText(`${s.credits} CR`);
    this.bestText.setText(`BEST ${s.best.kessa4 || 0}M`);
  }

  toast(text, color = 0xffffff) { this.toastQ.push({ text, color }); if (this.toastQ.length > 2) this.toastQ.shift(); if (this.toastT > 600) this.toastT = 600; }

  openAt(kind) {
    this.pending = null;
    if (kind === 'cot') this.openMenu('stats');
    else if (kind === 'codex') this.openMenu('codex');
    else if (kind === 'hatch') this.openMenu('station');
    else if (kind === 'helm') this.openMenu('helm');
    else if (kind === 'drill') this.openMenu('slot', 'drill');
    else if (kind === 'engine') this.openMenu('slot', 'engine');
    else if (kind === 'tools') this.openMenu('tools');
  }

  // ---- menus (screen-space overlay) ----------------------------------------------
  openMenu(kind, arg) {
    this.closeMenu();
    this.menuKind = kind; this.menuArg = arg;
    this.menu = [];  // plain objects to destroy on close (buttons tracked in menuBtns)
    this.menu.push(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x06050a, 0.88).setOrigin(0).setInteractive().setDepth(300));
    if (kind === 'helm') this.buildHelm();
    else if (kind === 'slot') this.buildSlot(arg);
    else if (kind === 'tools') this.buildTools();
    else if (kind === 'stats') this.buildStats();
    else if (kind === 'codex') this.buildCodex();
    else if (kind === 'station') this.buildStation();
    else if (kind === 'vendor') this.buildVendor();
    else if (kind === 'buy') this.buildBuy(arg);
    else if (kind === 'locked') this.buildLocked();
    else if (kind === 'survey') this.buildStub('SURVEY OFFICE', 'NEW PLANET LICENCES OPEN WITH M3. THE CLERK IS ASLEEP AT HIS DESK.');
    else if (kind === 'ines') this.buildStub("INES'S WINDOW", 'SHE WAVES THROUGH THE GLASS. THE KETTLE IS ON. COME BACK AFTER THE NEXT CONTRACT.');
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

  // HELM: contract board + radio replay
  buildHelm() {
    this.buildPanel('HELM');
    const s = loadSave();
    this.addT(12, 32, 'CONTRACT BOARD', 6, GOLD);
    const y0 = 42;
    CONTRACTS().forEach((c, i) => {
      const y = y0 + i * 70;
      this.menu.push(this.add.rectangle(10, y, 160, 64, 0x161a26, 1).setOrigin(0).setStrokeStyle(1, c.color).setDepth(302));
      this.addT(16, y + 5, c.planetName, 12, c.colorText);
      this.addT(164, y + 8, `BEST ${s.best[c.planet] || 0}M`, 6, CYAN, 1);
      this.addT(16, y + 20, c.title, 6, 0xffffff);
      this.addT(16, y + 29, `PAY X${c.pay.toFixed(1)}/M  -  RELAY EVERY 1000M`, 6, GREY);
      this.addT(16, y + 38, 'HAZARDS: ' + c.hazards, 6, GREY);
      this.btns['contract_' + c.planet] = this.addBtn(16, y + 47, 148, 14, 'ACCEPT CONTRACT', 0x7a3320, () => this.startContract(c.planet));
    });
    this.addT(GAME_W / 2, 110, 'MORE PLANETS POST HERE IN M3', 6, DIM, 0.5);
    this.btns.slot_helm = this.addBtn(10, 120, 160, 18, '', 0x1d2433, () => this.openMenu('slot', 'helm'));
    this.addT(16, 126, 'HELM PART: ' + partById(s.loadout.helm).name, 6, 0xffffff);
    this.addT(164, 126, '>', 6, GREY, 1);
    this.addT(12, 144, 'RADIO REPLAY (INES)', 6, GOLD);
    const radio = (s.radio || []).slice().reverse();
    const per = 3, pages = Math.max(1, Math.ceil(radio.length / per));
    this.radioPage = Math.min(this.radioPage || 0, pages - 1);
    if (!radio.length) this.addT(12, 156, 'NO TRAFFIC YET. RUN A CONTRACT.', 6, DIM);
    let y = 156;
    radio.slice(this.radioPage * per, this.radioPage * per + per).forEach((r) => {
      this.addT(12, y, r.tag, 6, CYAN); y += 8;
      wrap(r.text, 39).slice(0, 3).forEach((l) => { this.addT(12, y, l, 6, 0xd8f4f8); y += 8; });
      y += 3;
    });
    if (pages > 1) {
      this.btns.radioOlder = this.addBtn(12, 278, 60, 14, '< OLDER', 0x3a3348, () => { this.radioPage = Math.min(pages - 1, this.radioPage + 1); this.openMenu('helm'); });
      this.addT(GAME_W / 2, 282, `${this.radioPage + 1}/${pages}`, 6, GREY, 0.5);
      this.btns.radioNewer = this.addBtn(108, 278, 60, 14, 'NEWER >', 0x3a3348, () => { this.radioPage = Math.max(0, this.radioPage - 1); this.openMenu('helm'); });
    }
  }

  startContract(planet) {
    this.closeMenu();
    this.scene.stop('Dock');
    if (ANIM) this.scene.start('Cutscene', { kind: 'descent', planet });
    else this.scene.start('Game', { planet });
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
    if (slot.room === 'tools') this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO THE BENCH', 0x3a3348, () => this.openMenu('tools'));
    else if (slot.id === 'helm') this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO THE HELM', 0x3a3348, () => this.openMenu('helm'));
  }

  doEquip(id) {
    const r = equipPart(id);
    if (!r.ok) { this.toast(r.reason, RED); return; }
    this.toast('EQUIPPED: ' + partById(id).name, GREEN);
    this.openMenu('slot', partById(id).slot);
  }

  // TLS bench: Hull, Tools, Holt's kit
  buildTools() {
    this.buildPanel('TOOLS BENCH');
    this.addT(12, 30, 'THE BENCH HOLDS THREE SLOTS', 6, GREY);
    const save = loadSave();
    [['tools', 'TOOLS'], ['hull', 'HULL'], ['kit', "HOLT'S KIT"]].forEach(([id, name], i) => {
      const eq = partById(save.loadout[id]);
      this.btns['slot_' + id] = this.addBtn(10, 42 + i * 46, 160, 40, '', 0x1d2433, () => this.openMenu('slot', id));
      this.addT(18, 50 + i * 46, name, 6, GOLD);
      this.addT(18, 62 + i * 46, eq.name, 6, 0xffffff);
      this.addT(164, 50 + i * 46, '>', 6, GREY, 1);
    });
  }

  // Cot: stats
  buildStats() {
    this.buildPanel("HOLT'S LOG");
    const s = loadSave();
    this.addT(GAME_W / 2, 30, 'THE COT FOLDS DOWN. THE LOG FOLDS OUT.', 6, DIM, 0.5);
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
  }

  // DRL shelf: codex stub (M4)
  buildCodex() {
    this.buildPanel('CODEX');
    this.addT(GAME_W / 2, 80, 'THE SHELF IS EMPTY.', 6, GREY, 0.5);
    this.addT(GAME_W / 2, 92, 'FINDS YOU RECOVER END UP HERE.', 6, DIM, 0.5);
    ['STRATA', 'LIFE', 'ARTIFACTS', 'LOGS', 'COMPANY'].forEach((c, i) => {
      this.addT(40, 116 + i * 14, c, 6, DIM);
      this.addT(140, 116 + i * 14, '0', 6, DIM, 1);
    });
  }

  // Station concourse (through the hatch)
  buildStation() {
    this.buildPanel('STATION');
    this.addT(GAME_W / 2, 30, 'CONCOURSE. FLUORESCENT. QUIET.', 6, GREY, 0.5);
    const rows = [
      ['vendor', 'QUARTERMASTER', 'PARTS. STOCK ROTATES.'],
      ['survey', 'SURVEY OFFICE', 'PLANET LICENCES (M3).'],
      ['ines', "INES'S WINDOW", 'DISPATCH.'],
    ];
    rows.forEach(([k, a, b], i) => {
      this.btns[k] = this.addBtn(10, 44 + i * 46, 160, 40, '', 0x2a3a4a, () => this.openMenu(k));
      this.addT(18, 52 + i * 46, a, 6, GOLD);
      this.addT(18, 64 + i * 46, b, 6, GREY);
    });
    this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO THE RIG', 0x3a3348, () => this.closeMenu());
  }

  buildStub(title, body) {
    this.buildPanel(title);
    wrap(body, 36).forEach((l, i) => this.addT(GAME_W / 2, 70 + i * 12, l, 6, GREY, 0.5));
    this.btns.back = this.addBtn(10, 276, 160, 16, 'BACK TO THE CONCOURSE', 0x3a3348, () => this.openMenu('station'));
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
    this.btns.back = this.addBtn(136, 38, 34, 16, 'BACK', 0x3a3348, () => this.openMenu('station'));
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
    this.banner = { objs, ids, text: names.join(', ') };
    this.bannerT = 4000;
  }
  hideBanner() { if (!this.banner) return; this.banner.objs.forEach((o) => o.destroy()); this.lastBanner = this.banner; this.banner = null; }

  update(time, delta) {
    if (!this.banner && !this.bannerChecked && !this.scene.isActive('GameOver')) { this.bannerChecked = true; this.showUnlockBanner(); }
    if (this.banner && (this.bannerT -= delta) <= 0) this.hideBanner();
    if (this.toastT > 0) this.toastT -= delta;
    else if (this.toastQ.length) {
      const t = this.toastQ.shift();
      this.toastText.setText(t.text).setTint(t.color).setVisible(true);
      const w = Math.min(176, this.toastText.width + 8);
      this.toastBg.clear().fillStyle(0x000000, 0.88).fillRect((GAME_W - w) / 2, 37, w, 13).setVisible(true);
      this.toastT = 1400;
    } else if (this.toastText.visible) { this.toastText.setVisible(false); this.toastBg.setVisible(false); }
  }
}
