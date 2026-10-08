import { GAME_W, GAME_H } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { RelayScene } from './scenes/RelayScene.js';
import { DockScene, DockUIScene } from './scenes/DockScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  audio: { noAudio: true }, // no sound until M5; also avoids the autoplay-policy warning
  // Render order = array order (UI above Game, Relay break above UI, GameOver on top).
  scene: [BootScene, TitleScene, DockScene, DockUIScene, GameScene, UIScene, RelayScene, GameOverScene],
});

// Handy for debugging / automated tests.
window.__drill = game;
