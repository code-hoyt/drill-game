// Toggles between the OUTSIDE (drill face) and INSIDE (cutaway) views by
// panning + zooming the one game camera over the same continuous world.
import { TUNING as T, LAYOUT as L } from '../config.js';

export class ViewController {
  constructor(scene, ship) {
    this.scene = scene;
    this.ship = ship;
    this.mode = 'outside';
    const cam = scene.cameras.main;
    cam.setZoom(L.OUTSIDE_CAM.zoom).centerOn(L.OUTSIDE_CAM.x, L.OUTSIDE_CAM.y);
    ship.setInside(false, 0);
  }

  get inside() { return this.mode === 'inside'; }

  toggle() { this.set(this.inside ? 'outside' : 'inside'); }

  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const c = mode === 'inside' ? L.INSIDE_CAM : L.OUTSIDE_CAM;
    const cam = this.scene.cameras.main;
    cam.pan(c.x, c.y, T.VIEW_PAN_MS, 'Sine.easeInOut', true);
    cam.zoomTo(c.zoom, T.VIEW_PAN_MS, 'Sine.easeInOut', true);
    this.ship.setInside(mode === 'inside', T.VIEW_PAN_MS);
  }
}
