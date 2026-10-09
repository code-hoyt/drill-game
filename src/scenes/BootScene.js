import { createPixelFont } from '../systems/PixelFont.js';
import { createTextures } from '../systems/Textures.js';
import { preloadShipArt } from '../systems/ShipArt.js';
import { loadSave, applyUrlShortcuts } from '../systems/Save.js';

// Loads the ship hull PNGs, generates the rest of the art + the pixel font, then shows the title.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() { preloadShipArt(this); }
  create() {
    createPixelFont(this);
    createTextures(this);
    applyUrlShortcuts();   // ?credits=5000 / ?own=all / ?stock=... / ?wipe=1 (playtests)
    loadSave();            // migrates older saves (v1 / pre-M1 best depth) in place
    this.scene.start('Title');
  }
}
