import { GAME_W, GAME_H, loadBest } from '../config.js';
import { loadSave } from '../systems/Save.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { rigParts } from '../systems/ShipArt.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.bg = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'rock').setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45).setOrigin(0);
    this.add.container(GAME_W / 2, 140 + 69, rigParts(this, 260).parts).setScale(0.75);   // TB-6 + CORMORANT at 3/4: tip y 140 .. engines y 237
    const t = (y, s, str, tint = 0xffffff) => this.add.bitmapText(GAME_W / 2, y, FONT_KEY, str, s).setOrigin(0.5).setTint(tint);
    t(60, 24, 'DRILL', 0xffb347);
    t(88, 6, 'AN ENDLESS DIG INTO AN ALIEN WORLD', 0xb8b0c8);
    const best = Math.max(loadBest(), loadSave().best.kessa4 || 0);
    t(112, 6, best ? `BEST DEPTH ${best}M` : 'NO RECORD YET', 0x4fd1c5);
    const save = loadSave();
    t(122, 6, `CREDITS ${save.credits} CR`, 0xffd23f);
    this.start = t(250, 12, 'TAP TO START', 0xffffff);
    t(272, 6, 'OUTSIDE: WATCH AHEAD, SET SPEED', 0x9aa0b8);
    t(281, 6, 'INSIDE: TAP ROOMS, HOLD TO WORK', 0x9aa0b8);
    t(290, 6, 'SPEED ONLY CHANGES AT THE HELM', 0x9aa0b8);
    t(299, 6, 'RELAY EVERY 1000M: PUSH ON OR CASH OUT', 0x9aa0b8);
    this.tweens.add({ targets: this.start, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    this.input.once('pointerdown', () => this.scene.start('Dock'));
    this.input.keyboard?.once('keydown', () => this.scene.start('Dock'));
  }
  update(_, dt) { this.bg.tilePositionY -= dt * 0.01; }
}
