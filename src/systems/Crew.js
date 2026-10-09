// The single crew member (Holt), top-down in CORMORANT's cutaway. He walks the corridor graph (LAYOUT.NAV):
// stand spot -> doorway -> the ring corridor (shortest way round the hold) -> doorway -> stand spot. The crawl
// tube to the cockpit pod is a 'climb' edge (CREW_CLIMB_SPEED x climbMul: the kit parts still matter).
// Retargeting mid-walk re-plans from where he is: he continues to whichever end of his current segment
// gives the shorter trip (so a change of mind can turn him straight round).
import { TUNING as T, LAYOUT as L } from '../config.js';

const DIR_ANGLE = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 90 : -90) : (dy >= 0 ? 180 : 0));
const FACE_ANGLE = { up: 0, right: 90, down: 180, left: -90 };
const key = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;

/** The walk graph: corridor nodes + each room's stand spot and doorway corner. */
function buildGraph(ship) {
  const N = L.NAV, pts = {}, adj = {};
  const add = (id, x, y) => { pts[id] = { x, y }; adj[id] = adj[id] || []; };
  const link = (a, b, climb = false) => { adj[a].push({ to: b, climb }); adj[b].push({ to: a, climb }); };
  for (const [k, [x, y]] of Object.entries(N.nodes)) add(k, x, y);
  for (const [a, b, kind] of N.edges) link(a, b, kind === 'climb');
  for (const r of ship.rooms) {
    const n = N.nodes[r.node], id = 'room:' + r.id, door = 'door:' + r.id;
    add(id, r.standX, r.standY);
    if (n[0] === r.standX || n[1] === r.standY) link(r.node, id);
    else { add(door, r.standX, n[1]); link(r.node, door); link(door, id); }   // doorway corner: axis-aligned walks
  }
  return { pts, adj };
}

export class Crew {
  constructor(scene, ship, startRoom = 'helm') {
    this.scene = scene;
    this.ship = ship;
    const r = ship.room(startRoom);
    this.sprite = scene.add.image(r.standX, r.standY, 'holt_td_idle').setDepth(13).setAngle(FACE_ANGLE[r.face]);
    if (ship.addInterior) ship.addInterior(this.sprite);
    this.station = startRoom;   // station the crew is standing at (null while moving)
    this.target = startRoom;
    this.path = [];             // remaining waypoints [{x, y, climb}]
    this.working = false;
    this.climbing = false;      // in the crawl tube
    this.animT = 0;
    this.tripStart = 0;
    this.lastTrip = null;       // { from, to, ms, length, walk, climb } for the last completed trip
    this.tripLength = 0;
    this.tripFrom = startRoom;
    this.segFrom = null;        // graph node the current segment started at
    this.speedMul = 1;          // relay supplies (boots) raise this
    this.walkMul = 1;           // Holt's kit parts
    this.climbMul = 1;
  }

  get walking() { return this.station === null; }

  /** Shortest path (Dijkstra, by length) from node `from` to every node. */
  static dijkstra(G, starts) {
    const dist = {}, prev = {}, q = [];
    for (const [id, d0] of starts) { dist[id] = d0; q.push(id); }
    while (q.length) {
      q.sort((a, b) => dist[a] - dist[b]);
      const u = q.shift();
      for (const { to } of G.adj[u]) {
        const d = dist[u] + Math.hypot(G.pts[to].x - G.pts[u].x, G.pts[to].y - G.pts[u].y);
        if (dist[to] === undefined || d < dist[to] - 1e-9) { dist[to] = d; prev[to] = u; if (!q.includes(to)) q.push(to); }
      }
    }
    return { dist, prev };
  }

  /**
   * Waypoints from (x, y) to a room's stand spot. (x, y) is a graph node, or a point on the segment
   * a -> b (mid-walk): then he heads for whichever end gives the shorter trip.
   */
  static plan(ship, x, y, roomId, seg = null) {
    const G = ship.navGraph || (ship.navGraph = buildGraph(ship));
    const goal = 'room:' + roomId;
    let starts;
    const at = Object.keys(G.pts).find((k) => key(G.pts[k].x, G.pts[k].y) === key(x, y));
    if (at) starts = [[at, 0]];
    else if (seg) starts = seg.map((k) => [k, Math.hypot(G.pts[k].x - x, G.pts[k].y - y)]);
    else {   // off-graph (shouldn't happen): start from the nearest node
      const k = Object.keys(G.pts).sort((a, b) => Math.hypot(G.pts[a].x - x, G.pts[a].y - y) - Math.hypot(G.pts[b].x - x, G.pts[b].y - y))[0];
      starts = [[k, Math.hypot(G.pts[k].x - x, G.pts[k].y - y)]];
    }
    const { dist, prev } = Crew.dijkstra(G, starts);
    const ids = [];
    for (let u = goal; u !== undefined; u = prev[u]) ids.unshift(u);
    const out = ids.map((id, i) => {
      const p = G.pts[id], from = i ? ids[i - 1] : null;
      const climb = !!from && G.adj[from].some((e) => e.to === id && e.climb);
      return { x: p.x, y: p.y, node: id, climb };
    });
    if (at) out.shift();   // already standing on the first node
    else if (seg && out.length) {
      // the first hop is along the current segment: it is a climb if that segment is the tube
      out[0].climb = G.adj[seg[0]].some((e) => e.to === seg[1] && e.climb);
    }
    return out.length || dist[goal] !== undefined ? out : [];
  }

  static pathLength(x, y, pts) {
    let len = 0;
    for (const p of pts) { len += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; }
    return len;
  }

  goTo(roomId) {
    if (!this.ship.room(roomId)) return;
    if (this.station === roomId) return; // already there
    this.tripFrom = this.station ?? this.tripFrom;
    this.target = roomId;
    const seg = this.walking && this.path.length && this.segFrom ? [this.segFrom, this.path[0].node] : null;
    this.path = Crew.plan(this.ship, this.sprite.x, this.sprite.y, roomId, seg);
    if (!this.walking || !seg) this.segFrom = this.station ? 'room:' + this.station : this.segFrom;
    this.tripLength = Crew.pathLength(this.sprite.x, this.sprite.y, this.path);
    this.tripStart = this.scene.time.now;
    this.tripWalk = 0; this.tripClimb = 0;
    this.station = null;
    this.working = false;
  }

  update(dt) {
    this.animT += dt;
    if (this.station === null) {
      let time = dt;
      while (time > 0 && this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.sprite.x, dy = p.y - this.sprite.y;
        const dist = Math.hypot(dx, dy);
        this.climbing = !!p.climb;
        const speed = (p.climb ? T.CREW_CLIMB_SPEED * this.climbMul : T.CREW_WALK_SPEED * this.walkMul) * this.speedMul;
        if (dist > 1e-6) this.sprite.setAngle(DIR_ANGLE(dx, dy));
        if (dist <= speed * time) {
          if (p.climb) this.tripClimb += dist; else this.tripWalk += dist;
          this.sprite.setPosition(p.x, p.y);
          time -= dist / speed;
          this.segFrom = p.node;
          this.path.shift();
        } else {
          const step = speed * time;
          if (p.climb) this.tripClimb += step; else this.tripWalk += step;
          this.sprite.x += dx / dist * step;
          this.sprite.y += dy / dist * step;
          time = 0;
        }
      }
      if (!this.path.length) {
        const r = this.ship.room(this.target);
        this.station = this.target;
        this.climbing = false;
        this.sprite.setAngle(FACE_ANGLE[r.face]);
        this.lastTrip = { from: this.tripFrom, to: this.target, ms: this.scene.time.now - this.tripStart, length: this.tripLength,
          walk: Math.round(this.tripWalk * 100) / 100, climb: Math.round(this.tripClimb * 100) / 100 };
        this.sprite.setTexture('holt_td_idle');
        return;
      }
      const f = Math.floor(this.animT * (this.climbing ? 6 : 8)) % 2;
      this.sprite.setTexture(f ? 'holt_td_walk1' : 'holt_td_walk2');
    } else if (this.working) {
      this.sprite.setAngle(FACE_ANGLE[this.ship.room(this.station).face]);
      this.sprite.setTexture(Math.floor(this.animT * 6) % 2 ? 'holt_td_work1' : 'holt_td_work2');
    } else {
      this.sprite.setTexture('holt_td_idle');
    }
  }
}
