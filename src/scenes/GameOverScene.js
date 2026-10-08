// End-of-run screen: CASHED OUT (winched up with the full haul + 10%) or
// RIG LOST (escape pod recovered, keep 1/3). Shows the earnings breakdown.
import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';
import { CASHOUT_LINE, POD_LINE } from '../data/dispatch.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }
  create({ reason = 'lost', depth = 0, best = 0, newBest = false, haul = 0, bonus = 0, recovery = 0, banked = 0, credits = 0, relays = 0 } = {}) {
    const cash = reason === 'cashout';
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, cash ? 0.85 : 0.72).setOrigin(0).setInteractive();
    this.add.rectangle(GAME_W / 2, 42 + 118, 164, 236, 0x0d0b12, 1).setStrokeStyle(1, cash ? 0x2f6a3a : 0x7a3320);
    const t = (x, y, s, str, tint, ox = 0.5) => this.add.bitmapText(x, y, FONT_KEY, str, s).setOrigin(ox, 0).setTint(tint);
    const C = GAME_W / 2;
    t(C, 50, 12, cash ? 'CASHED OUT' : 'RIG LOST', cash ? 0x8affa0 : 0xff4a4a);
    t(C, 66, 6, cash ? 'WINCHED UP FROM THE RELAY' : 'ESCAPE POD RECOVERED', 0x9aa0b8);
    t(C, 80, 18, `${depth}M`, 0xffffff);
    t(C, 102, 6, `BEST ${best}M  -  RELAYS ${relays}`, 0x4fd1c5);
    if (newBest) {
      const nb = t(C, 111, 6, 'NEW BEST!', 0xffd23f);
      this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    }
    // breakdown
    const row = (y, label, value, tint = 0xffffff) => { t(18, y, 6, label, 0x9aa0b8, 0); t(162, y, 6, value, tint, 1); };
    row(124, 'RUN HAUL', `${haul} CR`);
    if (cash) row(134, 'CASH-OUT BONUS +10%', `+${bonus} CR`, 0x8affa0);
    else row(134, 'LOST WITH THE RIG (2/3)', `-${recovery} CR`, 0xff5a5a);
    this.add.rectangle(18, 145, 144, 1, 0x3a3348).setOrigin(0);
    row(149, 'BANKED', `${banked} CR`, 0xffd23f);
    row(159, 'TOTAL CREDITS', `${credits} CR`, 0xffd23f);
    // Ines
    t(18, 174, 6, 'INES:', 0x7fe0ff, 0);
    const words = (cash ? CASHOUT_LINE : POD_LINE).split(' ');
    const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 36) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    lines.push(cur);
    lines.forEach((l, i) => t(18, 183 + i * 8, 6, l, 0xd8f4f8, 0));

    this.restartBtn = new Button(this, 40, 238, 100, 22, 'NEW CONTRACT', {
      size: 6, color: cash ? 0x2f6a3a : 0x7a3320, pressColor: cash ? 0x48a058 : 0xb5532f, depth: 10,
      onTap: () => this.restart(),
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
    this.input.keyboard?.once('keydown-R', () => this.restart());
  }
  restart() {
    this.scene.stop('UI');
    this.scene.stop('Relay');
    this.scene.start('Game');
  }
}
