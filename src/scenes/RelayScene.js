// Relay break: the rig is clamped to a relay anchor. Heat + bit wear were reset for free.
// Phase A: Ines's dispatch types in over static; pick 1 of 3 random relay supplies.
// Phase B: repair the DRILL from the ship's hold (cost rises each relay), then PUSH ON or CASH OUT.
// (On arrival the relay crews emptied the drill's hopper into the hold and bought the siphon tank.)
import { GAME_W, GAME_H, TUNING as T } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { relayMessage } from '../data/dispatch.js';
import { BOOSTS } from '../data/boosts.js';

const CYAN = 0x7fe0ff, GOLD = 0xffd23f, GREY = 0x9aa0b8, GREEN = 0x8affa0, RED = 0xff5a5a;
const BOX = { x: 6, y: 34, w: 168, h: 66 };
const WRAP = 39;             // chars per dispatch line (4 px per glyph)
const TYPE_CPS = 40;         // typing speed
const GLITCH = "#%/?<>!+-'";

function wrap(text, width) {
  const lines = []; let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export class RelayScene extends Phaser.Scene {
  constructor() { super('Relay'); }

  create() {
    this.g = this.scene.get('Game');
    const s = this.g.state;
    this.n = this.g.relayNumber;
    this.phase = 'boost';
    const txt = (x, y, str, size = 6, tint = 0xffffff) => this.add.bitmapText(x, y, FONT_KEY, str, size).setTint(tint);
    this.txt = txt;

    // full-screen blocker: nothing below (game/UI) can be touched while clamped in
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x06050a, 0.9).setOrigin(0).setInteractive();

    // header
    txt(GAME_W / 2, 6, `RELAY ${this.n} ANCHORED`, 12, CYAN).setOrigin(0.5, 0);
    txt(GAME_W / 2, 21, `${Math.round(s.depth)}M  -  HEAT + BIT SERVICED`, 6, GREY).setOrigin(0.5, 0);

    // dispatch box
    this.boxGfx = this.add.graphics();
    this.boxGfx.fillStyle(0x0b1418, 1).fillRect(BOX.x, BOX.y, BOX.w, BOX.h).lineStyle(1, 0x2f6f7a, 1).strokeRect(BOX.x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1);
    txt(BOX.x + 5, BOX.y + 4, 'DISPATCH: INES', 6, CYAN);
    this.sigText = txt(BOX.x + BOX.w - 5, BOX.y + 4, 'SIG', 6, 0x2f6f7a).setOrigin(1, 0);
    this.noise = this.add.graphics();
    this.message = relayMessage(this.n);
    this.lines = wrap(this.message, WRAP);
    this.lineTexts = this.lines.map((_, i) => txt(BOX.x + 5, BOX.y + 15 + i * 8, '', 6, 0xd8f4f8));
    this.typed = 0; this.typeClock = 0; this.typingDone = false;
    this.add.zone(BOX.x, BOX.y, BOX.w, BOX.h).setOrigin(0).setInteractive().on('pointerdown', () => this.skipTyping());

    // phase containers
    this.boostObjs = []; this.mainObjs = [];
    this.buildBoostPhase();
  }

  get typedText() { return this.message.slice(0, Math.floor(this.typed)); }

  skipTyping() { this.typed = this.message.length; }

  // ---- phase A: pick a supply ------------------------------------------------
  buildBoostPhase() {
    const g = this.g;
    this.boostObjs.push(this.txt(GAME_W / 2, 108, 'RELAY SUPPLIES: TAKE ONE', 6, GOLD).setOrigin(0.5, 0));
    this.cards = g.offers.map((b, i) => {
      const y = 120 + i * 40;
      const btn = new Button(this, 8, y, 164, 34, '', { color: 0x1d2433, pressColor: 0x34405a, depth: 20, onTap: () => this.pick(b.id) });
      const name = this.txt(16, y + 8, b.name, 6, GOLD).setDepth(25);
      const desc = this.txt(16, y + 19, b.desc, 6, 0xd0d4e4).setDepth(25);
      this.boostObjs.push(name, desc);
      return { b, btn, name, desc };
    });
    this.boostObjs.push(this.txt(GAME_W / 2, 244, `NEXT SEGMENT PAYS X${(this.g.state.payMult + T.PAY_MULT_STEP).toFixed(1)}`, 6, CYAN).setOrigin(0.5, 0));
    this.boostObjs.push(this.txt(GAME_W / 2, 256, 'SUPPLIES LAST THE WHOLE RUN', 6, GREY).setOrigin(0.5, 0));
  }

  pick(id) {
    if (this.phase !== 'boost' || !this.g.chooseBoost(id)) return;
    this.phase = 'picking';
    this.picked = this.g.offers.find((o) => o.id === id);
    this.cards.forEach((c) => { c.btn.setEnabled(false); if (c.b.id !== id) { c.btn.setDimmed(true); c.name.setAlpha(0.35); c.desc.setAlpha(0.35); } });
    this.skipTyping();
    this.time.delayedCall(350, () => {
      this.cards.forEach((c) => { c.btn.gfx.destroy(); c.btn.text.destroy(); c.btn.zone.destroy(); });
      this.boostObjs.forEach((o) => o.destroy());
      this.buildMainPhase();
      this.phase = 'main';
    });
  }

  // ---- phase B: repair, then push on / cash out ------------------------------
  buildMainPhase() {
    const s = this.g.state, txt = this.txt;
    txt(8, 108, 'TOOK:', 6, GREY);
    txt(30, 108, this.picked.name, 6, GOLD);
    txt(8, 122, 'HOLD', 6, GREY);
    this.haulText = txt(172, 122, '', 6, GOLD).setOrigin(1, 0);
    // what went in: metres drilled vs ore from veins (scrap from lost veins counts with ore) vs liquid sold from the siphon tank
    this.oreText = txt(30, 122, `CUT ${Math.floor(s.drillPay)} ORE ${Math.floor(s.ore + s.scrap)} LIQ ${Math.floor(s.liquid)}`, 6, 0x9a8f6a);
    txt(8, 134, 'DRILL', 6, GREY);
    this.hullGfx = this.add.graphics();
    this.hullText = txt(172, 134, '', 6, 0xffffff).setOrigin(1, 0);
    this.costText = txt(8, 146, '', 6, GREY);
    this.rep10 = new Button(this, 8, 156, 80, 20, 'REPAIR +10', { color: 0x2a4a3a, pressColor: 0x3f7a5a, onTap: () => this.repair(T.REPAIR_STEP) });
    this.repMax = new Button(this, 92, 156, 80, 20, 'REPAIR MAX', { color: 0x2a4a3a, pressColor: 0x3f7a5a, onTap: () => this.repair(9999) });
    this.payLine = txt(GAME_W / 2, 186, `NEXT SEGMENT PAYS X${(s.payMult + T.PAY_MULT_STEP).toFixed(1)}`, 6, CYAN).setOrigin(0.5, 0);
    this.cashLine = txt(GAME_W / 2, 197, '', 6, GREEN).setOrigin(0.5, 0);
    txt(GAME_W / 2, 208, 'LOSE THE DRILL: KEEP 1/3 OF THE HOLD', 6, 0x8a7f9a).setOrigin(0.5, 0);
    this.suppliesText = txt(8, 222, '', 6, GREY);
    this.pushBtn = new Button(this, 8, 262, 80, 30, 'PUSH ON', { size: 6, color: 0x7a3320, pressColor: 0xb5532f, onTap: () => this.g.pushOn() });
    this.cashBtn = new Button(this, 92, 262, 80, 30, 'CASH OUT', { size: 6, color: 0x2f6a3a, pressColor: 0x48a058, onTap: () => this.g.cashOut() });
    txt(48, 296, 'DEEPER, BETTER PAY', 6, 0x6a6278).setOrigin(0.5, 0);
    txt(132, 296, 'FLY HOME, +10%', 6, 0x6a6278).setOrigin(0.5, 0);
    this.refresh();
  }

  repair(points) {
    const r = this.g.buyRepair(points);
    if (r.points > 0) this.cameras.main.flash(80, 40, 120, 60);
    this.refresh();
  }

  refresh() {
    const s = this.g.state, per = s.repairCostPerPoint;
    const missing = Math.ceil(s.maxHull - s.hull);
    const affordable = Math.floor(s.holdCr / per);
    this.haulText.setText(`${Math.floor(s.holdCr)} CR`);
    this.hullText.setText(`${Math.ceil(s.hull)}/${s.maxHull}`);
    const g = this.hullGfx.clear(), w = 84, f = Math.max(0, Math.min(1, s.hull / s.maxHull));
    g.fillStyle(0x221d2c, 1).fillRect(32, 134, w - 4, 5).fillStyle(f < 0.35 ? RED : 0xc42b55, 1).fillRect(32, 134, Math.round((w - 4) * f), 5);
    this.costText.setText(`DRILL REPAIR ${+per.toFixed(1)} CR/PT${this.n > 1 ? '' : '. MORE LATER'}`);
    const n10 = Math.min(T.REPAIR_STEP, missing, affordable), nMax = Math.min(missing, affordable);
    this.rep10.setLabel(n10 > 0 ? `+${n10} DRILL: ${Math.ceil(n10 * per)}` : missing ? "CAN'T AFFORD" : 'DRILL FULL').setEnabled(n10 > 0);
    this.repMax.setLabel(nMax > 0 ? `MAX +${nMax}: ${Math.ceil(nMax * per)}` : missing ? "CAN'T AFFORD" : 'DRILL FULL').setEnabled(nMax > 0);
    this.rep10.setDimmed(n10 <= 0); this.repMax.setDimmed(nMax <= 0);
    this.cashLine.setText(`CASH OUT NOW: ${Math.floor(s.holdCr * (1 + T.CASHOUT_BONUS))} CR (+10%)`);
    const lines = wrap('RUN SUPPLIES: ' + s.boosts.map((id) => BOOSTS.find((o) => o.id === id)?.name || id.toUpperCase()).join(', '), 41);
    this.suppliesText.setText(lines.slice(0, 4).join('\n'));
  }

  update(time, delta) {
    // typing with static: a glitch glyph rides the cursor, the box border crackles
    if (this.typed < this.message.length) {
      this.typed = Math.min(this.message.length, this.typed + TYPE_CPS * delta / 1000);
    } else this.typingDone = true;
    let left = Math.floor(this.typed);
    this.lines.forEach((line, i) => {
      const shown = line.slice(0, Math.max(0, left));
      left -= line.length + 1;
      let out = shown;
      if (!this.typingDone && shown.length && shown.length < line.length && Math.random() < 0.6) out += GLITCH[Math.floor(Math.random() * GLITCH.length)];
      if (this.lineTexts[i].text !== out) this.lineTexts[i].setText(out);
    });
    const ng = this.noise.clear();
    const amount = this.typingDone ? 3 : 14;
    for (let i = 0; i < amount; i++) {
      ng.fillStyle(Math.random() < 0.5 ? 0x7fe0ff : 0xffffff, Math.random() * 0.5).fillRect(BOX.x + 1 + Math.floor(Math.random() * (BOX.w - 2)), BOX.y + 1 + Math.floor(Math.random() * (BOX.h - 2)), 1 + Math.floor(Math.random() * 3), 1);
    }
    if (Math.floor(time / 180) % 7 === 0 && !this.typingDone) this.sigText.setText('S.G'); else this.sigText.setText('SIG');
  }
}
