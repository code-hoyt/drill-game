// End-of-run screen: CASHED OUT (winched up with the full haul + 10%) or
// RIG LOST (escape pod recovered, keep 1/3). Shows the earnings breakdown.
import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { CASHOUT_LINE, POD_LINE } from '../data/dispatch.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }
  create({ reason = 'lost', depth = 0, best = 0, newBest = false, haul = 0, bonus = 0, recovery = 0, banked = 0, credits = 0, relays = 0, inDock = false, ore = 0, scrap = 0, veins = 0, veinsLost = 0 } = {}) {
    const cash = reason === 'cashout';
    this.inDock = inDock;
    const t = (x, y, s, str, tint, ox = 0.5) => this.add.bitmapText(x, y, FONT_KEY, str, s).setOrigin(ox, 0).setTint(tint);
    const C = GAME_W / 2;
    const words = (cash ? CASHOUT_LINE : POD_LINE).split(' ');
    const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 36) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    lines.push(cur);
    const row = (y, label, value, tint = 0xffffff) => { t(18, y, 6, label, 0x9aa0b8, 0); t(162, y, 6, value, tint, 1); };
    // ore from veins (+ scrap from lost ones) is part of the run haul; shown on its own line
    const oreRow = (y) => row(y, ` INCL. ORE (${veins} VEIN${veins === 1 ? '' : 'S'})`, `${Math.floor(ore + scrap)} CR`, 0xd8b04a);
    if (inDock) {
      // after docking: the summary fills the content area (y 22..202); the concourse below stays live
      // (tapping a spot dismisses it and walks Holt there)
      this.add.rectangle(0, 22, GAME_W, 180, 0x0d0b12, 1).setOrigin(0).setInteractive();
      this.add.rectangle(0, 22, GAME_W, 180).setOrigin(0).setStrokeStyle(1, cash ? 0x2f6a3a : 0x7a3320);
      t(C, 26, 12, cash ? 'CASHED OUT' : 'RIG LOST', cash ? 0x8affa0 : 0xff4a4a);
      t(C, 40, 6, cash ? 'WINCHED UP FROM THE RELAY' : 'ESCAPE POD RECOVERED', 0x9aa0b8);
      t(C, 50, 18, `${depth}M`, 0xffffff);
      t(C, 70, 6, `BEST ${best}M  -  RELAYS ${relays}`, 0x4fd1c5);
      if (newBest) { const nb = t(C, 79, 6, 'NEW BEST!', 0xffd23f); this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 }); }
      row(90, 'RUN HAUL', `${haul} CR`);
      oreRow(99);
      if (cash) row(108, 'CASH-OUT BONUS +10%', `+${bonus} CR`, 0x8affa0);
      else row(108, 'LOST WITH THE RIG (2/3)', `-${recovery} CR`, 0xff5a5a);
      this.add.rectangle(18, 117, 144, 1, 0x3a3348).setOrigin(0);
      row(120, 'BANKED', `${banked} CR`, 0xffd23f);
      row(129, 'TOTAL CREDITS', `${credits} CR`, 0xffd23f);
      t(18, 140, 6, 'INES:', 0x7fe0ff, 0);
      lines.slice(0, 3).forEach((l, i) => t(18, 149 + i * 8, 6, l, 0xd8f4f8, 0));
      this.restartBtn = new Button(this, 30, 176, 120, 20, 'CLOSE', {
        size: 6, color: cash ? 0x2f6a3a : 0x7a3320, pressColor: cash ? 0x48a058 : 0xb5532f, depth: 10, onTap: () => this.restart(),
      });
    } else {
      this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, cash ? 0.85 : 0.72).setOrigin(0).setInteractive();
      this.add.rectangle(GAME_W / 2, 42 + 118, 164, 236, 0x0d0b12, 1).setStrokeStyle(1, cash ? 0x2f6a3a : 0x7a3320);
      t(C, 50, 12, cash ? 'CASHED OUT' : 'RIG LOST', cash ? 0x8affa0 : 0xff4a4a);
      t(C, 66, 6, cash ? 'WINCHED UP FROM THE RELAY' : 'ESCAPE POD RECOVERED', 0x9aa0b8);
      t(C, 80, 18, `${depth}M`, 0xffffff);
      t(C, 102, 6, `BEST ${best}M  -  RELAYS ${relays}`, 0x4fd1c5);
      if (newBest) {
        const nb = t(C, 111, 6, 'NEW BEST!', 0xffd23f);
        this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
      }
      row(124, 'RUN HAUL', `${haul} CR`);
      oreRow(134);
      if (cash) row(144, 'CASH-OUT BONUS +10%', `+${bonus} CR`, 0x8affa0);
      else row(144, 'LOST WITH THE RIG (2/3)', `-${recovery} CR`, 0xff5a5a);
      this.add.rectangle(18, 155, 144, 1, 0x3a3348).setOrigin(0);
      row(159, 'BANKED', `${banked} CR`, 0xffd23f);
      row(169, 'TOTAL CREDITS', `${credits} CR`, 0xffd23f);
      t(18, 184, 6, 'INES:', 0x7fe0ff, 0);
      lines.slice(0, 5).forEach((l, i) => t(18, 193 + i * 8, 6, l, 0xd8f4f8, 0));
      this.restartBtn = new Button(this, 30, 238, 120, 22, 'TO THE CONCOURSE', {
        size: 6, color: cash ? 0x2f6a3a : 0x7a3320, pressColor: cash ? 0x48a058 : 0xb5532f, depth: 10,
        onTap: () => this.restart(),
      });
    }
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
    this.input.keyboard?.once('keydown-R', () => this.restart());
  }
  // Home: the rig docks at the station; the Quartermaster has turned its stock over.
  restart() {
    if (this.scene.isActive('Dock')) { this.scene.stop(); return; } // summary shown after docking
    this.scene.stop('UI');
    this.scene.stop('Relay');
    this.scene.stop('Game');
    this.scene.start('Dock', { welcome: 'DOCKED. NEW STOCK AT THE QUARTERMASTER' });
  }
}
