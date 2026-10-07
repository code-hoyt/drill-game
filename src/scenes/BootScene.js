import { createPixelFont } from '../systems/PixelFont.js';
import { createTextures } from '../systems/Textures.js';

// Generates all placeholder art + the pixel font, then shows the title.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    createPixelFont(this);
    createTextures(this);
    this.scene.start('Title');
  }
}
