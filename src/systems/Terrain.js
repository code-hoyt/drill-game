// Scrolling rock: the ship stays put and the world scrolls DOWN past it.
import { GAME_W, LAYOUT as L } from '../config.js';

const STRATA = [0xffffff, 0xffc8b4, 0xb4c8ff, 0xc8ffd0, 0xffe0a0, 0xe0b4ff];
const STRATA_DEPTH = 350; // metres per colour band

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.offset = 0;
    this.rock = scene.add.tileSprite(0, -80, GAME_W, 520, 'rock').setOrigin(0).setDepth(0);
    const tunnelX = L.SHIP_X - 2, tunnelW = L.SHIP_W + 4;
    this.tunnel = scene.add.tileSprite(tunnelX, L.DRILL_TIP_Y + 14, tunnelW, 200, 'tunnel').setOrigin(0).setDepth(1);
    // tunnel wall edges
    this.edges = scene.add.graphics().setDepth(1.1);
    this.edges.fillStyle(0x120c16, 1).fillRect(tunnelX - 1, L.DRILL_TIP_Y + 14, 1, 200).fillRect(tunnelX + tunnelW, L.DRILL_TIP_Y + 14, 1, 200);
    this.bands = []; // hard rock bands
  }

  scroll(advancePx, depthM) {
    this.offset += advancePx;
    const ty = -Math.round(this.offset);
    this.rock.tilePositionY = ty;
    this.tunnel.tilePositionY = ty;

    const i = Math.floor(depthM / STRATA_DEPTH);
    const t = (depthM % STRATA_DEPTH) / STRATA_DEPTH;
    const a = Phaser.Display.Color.ValueToColor(STRATA[i % STRATA.length]);
    const b = Phaser.Display.Color.ValueToColor(STRATA[(i + 1) % STRATA.length]);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.max(0, t - 0.8) * 500);
    this.rock.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));

    for (const band of this.bands) band.sprite.y += advancePx;
    this.bands = this.bands.filter((b) => {
      if (b.sprite.y > 420) { b.sprite.destroy(); return false; }
      return true;
    });
  }

  spawnHardBand() {
    const h = 40 + Math.floor(Math.random() * 60);
    const sprite = this.scene.add.tileSprite(0, -h - 10, GAME_W, h, 'hardrock').setOrigin(0).setDepth(0.5);
    this.bands.push({ sprite, h });
  }

  /** Is the drill tip currently inside a hard band? */
  tipInHard() {
    const y = L.DRILL_TIP_Y;
    return this.bands.some((b) => y >= b.sprite.y && y <= b.sprite.y + b.h);
  }

  /** Lowest hard band still above the tip (for warnings). */
  hardAhead() {
    return this.bands.some((b) => b.sprite.y + b.h < L.DRILL_TIP_Y && b.sprite.y > -b.h);
  }
}
