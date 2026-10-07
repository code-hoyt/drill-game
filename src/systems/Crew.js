// The single crew member. Moves FTL-style along a fixed network:
//   stand spot <-> hub door (same deck)  (horizontal, CREW_WALK_SPEED)
//   hub door   <-> junction <-> hub door (vertical ladder, CREW_CLIMB_SPEED)
// Every station-to-station route passes through the junction, so all trips
// have the same length. Retargeting mid-walk re-plans from the current spot.
import { TUNING as T, LAYOUT as L } from '../config.js';

export class Crew {
  constructor(scene, ship, startRoom = 'helm') {
    this.scene = scene;
    this.ship = ship;
    const r = ship.room(startRoom);
    this.sprite = scene.add.image(r.standX, r.floorY, 'crew_idle').setOrigin(0.5, 1).setDepth(13).setFlipX(r.faceLeft);
    this.station = startRoom;   // station the crew is standing at (null while moving)
    this.target = startRoom;
    this.path = [];             // remaining waypoints [{x, y}]
    this.working = false;
    this.climbing = false;
    this.animT = 0;
    this.tripStart = 0;
    this.lastTrip = null;       // { from, to, ms, length } for the last completed trip
    this.tripLength = 0;
    this.tripFrom = startRoom;
  }

  get walking() { return this.station === null; }

  /** Waypoints from (x, y) to a room's stand spot, always via the hub junction. */
  static plan(ship, x, y, roomId) {
    const B = ship.room(roomId);
    const hubX = L.HUB.cx;
    const cur = ship.roomAt(x, y);
    if (cur && cur.id === roomId) return [{ x: B.standX, y: B.floorY }]; // already on that room's walkway
    const pts = [];
    if (cur) pts.push({ x: hubX, y });                                    // walk to the hub door on this deck
    pts.push({ x: hubX, y: L.HUB.junctionY });                           // ladder to the junction
    pts.push({ x: hubX, y: B.floorY });                                  // ladder to the target deck
    pts.push({ x: B.standX, y: B.floorY });                              // walk out to the station
    return pts;
  }

  static pathLength(x, y, pts) {
    let len = 0;
    for (const p of pts) { len += Math.abs(p.x - x) + Math.abs(p.y - y); x = p.x; y = p.y; }
    return len;
  }

  goTo(roomId) {
    if (!this.ship.room(roomId)) return;
    if (this.station === roomId) return; // already there
    this.tripFrom = this.station ?? this.tripFrom;
    this.target = roomId;
    this.path = Crew.plan(this.ship, this.sprite.x, this.sprite.y, roomId);
    this.tripLength = Crew.pathLength(this.sprite.x, this.sprite.y, this.path);
    this.tripStart = this.scene.time.now;
    this.station = null;
    this.working = false;
  }

  update(dt) {
    this.animT += dt;
    if (this.station === null) {
      // advance along the path, carrying leftover time across waypoints
      let time = dt;
      while (time > 0 && this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.sprite.x, dy = p.y - this.sprite.y;
        const vertical = Math.abs(dy) > Math.abs(dx);
        const speed = vertical ? T.CREW_CLIMB_SPEED : T.CREW_WALK_SPEED;
        const dist = Math.abs(dx) + Math.abs(dy);
        this.climbing = vertical;
        if (!vertical && dx !== 0) this.sprite.setFlipX(dx < 0);
        if (dist <= speed * time) {
          this.sprite.setPosition(p.x, p.y);
          time -= dist / speed;
          this.path.shift();
        } else {
          const step = speed * time;
          this.sprite.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
          this.sprite.y += Math.sign(dy) * Math.min(step, Math.abs(dy));
          time = 0;
        }
      }
      if (!this.path.length) {
        const r = this.ship.room(this.target);
        this.station = this.target;
        this.climbing = false;
        this.sprite.setFlipX(r.faceLeft);
        this.lastTrip = { from: this.tripFrom, to: this.target, ms: this.scene.time.now - this.tripStart, length: this.tripLength };
        this.sprite.setTexture('crew_idle');
        return;
      }
      const f = Math.floor(this.animT * 8) % 2;
      this.sprite.setTexture(this.climbing ? (f ? 'crew_climb1' : 'crew_climb2') : (f ? 'crew_walk' : 'crew_idle'));
    } else if (this.working) {
      this.sprite.setFlipX(this.ship.room(this.station).faceLeft);
      this.sprite.setTexture(Math.floor(this.animT * 6) % 2 ? 'crew_work1' : 'crew_work2');
    } else {
      this.sprite.setTexture('crew_idle');
    }
  }
}
