import { GAME_W, GAME_H, loadBest } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.bg = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'rock').setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45).setOrigin(0);
    this.add.image(GAME_W / 2, 150, 'drill0').setOrigin(0.5, 0);
    this.add.image(GAME_W / 2 - 44, 172, 'ship_ext').setOrigin(0);
    const t = (y, s, str, tint = 0xffffff) => this.add.bitmapText(GAME_W / 2, y, FONT_KEY, str, s).setOrigin(0.5).setTint(tint);
    t(60, 24, 'DRILL', 0xffb347);
    t(88, 6, 'AN ENDLESS DIG INTO AN ALIEN WORLD', 0xb8b0c8);
    const best = loadBest();
    t(112, 6, best ? `BEST DEPTH ${best}M` : 'NO RECORD YET', 0x4fd1c5);
    this.start = t(250, 12, 'TAP TO START', 0xffffff);
    t(278, 6, 'OUTSIDE: SET YOUR SPEED', 0x9aa0b8);
    t(288, 6, 'INSIDE: TAP ROOMS, HOLD TO WORK', 0x9aa0b8);
    t(298, 6, "DON'T LET THE HULL HIT ZERO", 0x9aa0b8);
    this.tweens.add({ targets: this.start, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start('Game'));
    this.input.keyboard?.once('keydown', () => this.scene.start('Game'));
  }
  update(_, dt) { this.bg.tilePositionY -= dt * 0.01; }
}
