import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { Button } from '../ui/Button.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }
  create({ depth = 0, best = 0, newBest = false } = {}) {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.72).setOrigin(0);
    this.add.rectangle(GAME_W / 2, 160, 150, 150, 0x0d0b12, 1).setStrokeStyle(1, 0x7a3320);
    const t = (y, s, str, tint) => this.add.bitmapText(GAME_W / 2, y, FONT_KEY, str, s).setOrigin(0.5).setTint(tint);
    t(102, 12, 'HULL BREACH', 0xff4a4a);
    t(126, 6, 'YOU REACHED', 0x9aa0b8);
    t(144, 18, `${depth}M`, 0xffffff);
    t(166, 6, `BEST ${best}M`, 0x4fd1c5);
    if (newBest) {
      const nb = t(178, 6, 'NEW BEST!', 0xffd23f);
      this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    }
    this.restartBtn = new Button(this, 50, 196, 80, 22, 'RESTART', {
      size: 6, color: 0x7a3320, pressColor: 0xb5532f, depth: 10,
      onTap: () => this.restart(),
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
    this.input.keyboard?.once('keydown-R', () => this.restart());
  }
  restart() {
    this.scene.stop('UI');
    this.scene.start('Game');
  }
}
