// The single crew member: walks between stations FTL-style and works them.
import { TUNING as T, LAYOUT as L } from '../config.js';

export class Crew {
  constructor(scene, ship, startRoom = 'drill') {
    this.scene = scene;
    this.ship = ship;
    const r = ship.room(startRoom);
    this.sprite = scene.add.image(r.standX, L.FLOOR_Y, 'crew_idle').setOrigin(0.5, 1).setDepth(13);
    this.station = startRoom;   // station the crew is standing at (null while walking)
    this.target = startRoom;
    this.targetX = r.standX;
    this.working = false;
    this.animT = 0;
  }

  get walking() { return this.station === null; }

  goTo(roomId) {
    const r = this.ship.room(roomId);
    if (!r) return;
    this.target = roomId;
    this.targetX = r.standX;
    if (Math.abs(this.sprite.x - this.targetX) > 0.5) this.station = null;
    else this.station = roomId;
    this.working = false;
  }

  update(dt) {
    this.animT += dt;
    if (this.station === null) {
      const dx = this.targetX - this.sprite.x;
      const step = T.CREW_SPEED * dt;
      if (Math.abs(dx) <= step) { this.sprite.x = this.targetX; this.station = this.target; this.sprite.setFlipX(true); }
      else { this.sprite.x += Math.sign(dx) * step; this.sprite.setFlipX(dx < 0); }
      this.sprite.setTexture(Math.floor(this.animT * 8) % 2 ? 'crew_walk' : 'crew_idle');
    } else if (this.working) {
      this.sprite.setFlipX(true); // face the station (stations are left of the stand spot)
      this.sprite.setTexture(Math.floor(this.animT * 6) % 2 ? 'crew_work1' : 'crew_work2');
    } else {
      this.sprite.setTexture('crew_idle');
    }
  }
}
