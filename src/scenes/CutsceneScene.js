// Transition cutscenes (ascent 4.6 s / descent 5.6 s x ANIM_SCALE, default 2 = ~9.2 / ~11.2 s, + a short concourse
// beat; tap to skip after a ~0.5 s grace). Reuses the ship + drill art (CORMORANT, TB-6: ShipArt.js).
// [C] The drill is only seen attached ON THE JOB. At the station Cormorant docks alone; the leased TB-6
// travels separately (Meridian's freight cradle) and is left behind for retrieval after a clean cash-out.
// Orientation: the run (and the docked interior) show the rig drill-UP, flipped for the phone. Outside
// (the surface, space) it is drill-DOWN. The camera rotates 180 degrees to bridge the two:
//   descent: (Holt boards via the lift) bay framing, ship alone -> camera turns out to the station (drill down)
//            -> the station clamps release Cormorant and Meridian's cradle drops the TB-6 on its own, both
//            fall toward the planet -> cut to the surface: the drill SMASHES in (dust plume, debris, shake),
//            Cormorant flies in, aligns, backs onto it, clamps lock, umbilicals connect, the drill powers up
//            and bites -> camera turns as the rig sinks in, landing in the run view.
//   ascent : run view (drill up) -> cash-out: the clamps open cleanly (no alarms), the drill stays in the bore
//            as Meridian's property, Cormorant backs out alone on its retros as the camera turns -> cut to
//            space, it rises to the station and the clamps engage -> camera turns again and closes in on the
//            concourse's docking bay framing (ship alone); Holt rides the airlock lift down.
//            After a drill loss the broken-away ship burns up the bore on its own (its breakaway attitude).
// Only the main camera rotates; "TAP TO SKIP" and captions live on a separate, unrotated UI camera.
import { GAME_W, GAME_H, LAYOUT as L, breakawayStyle } from '../config.js';
import { drillParts, shipParts, hullImage, SHIP_TEX } from '../systems/ShipArt.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { CONCOURSE } from './DockScene.js';
import { animScale, GRACE_MS, CUTSCENE_MS, DESCENT_MS } from '../systems/Settings.js';

const SURFACE_Y = 204;
const PORT_Y = 64;          // bottom of the station's docking port
const RIG_TOP = L.SHIP_BOTTOM - 260;   // rig container: the ship's engine end is 38 px above centre once flipped (drill down)
const SHIP_HALF = Math.round((L.SHIP_BOTTOM - L.FACE.y) / 2);   // hull centre -> coupling face
const RUN_CY = 260 - L.OUTSIDE_CAM.y;   // rotated 180 deg, a camera centred RUN_CY below the rig puts it where the run draws it
const SPACE_RIG = 0.45;    // rig scale in the space shots
const DOCK_ZOOM = 1 / SPACE_RIG;  // rotated + zoomed so the docked rig lands exactly where the concourse draws it
// camera centre that puts a space-shot rig (centre y) at the concourse's rig position, drill up
const dockCentre = (rigY) => ({ x: 90, y: rigY - (GAME_H / 2 - CONCOURSE.RIG_Y) / DOCK_ZOOM });
// Every beat below is written on the 4.6 s base timeline and multiplied by ANIM_SCALE (config.js):
// at(), tween durations/delays, camera turns, flash/shake/fade. Particles and the drill spin keep their rate.
const S = animScale;
const d = (ms) => Math.round(ms * S);
const BASE_END = 4600;     // ascent  = ANIM_TIMING.BASE_MS;         CUTSCENE_MS = BASE_END x ANIM_SCALE
const DESCENT_END = 5600;  // descent = ANIM_TIMING.BASE_DESCENT_MS; DESCENT_MS  = DESCENT_END x ANIM_SCALE
const CRADLE_X = 154;      // Meridian's freight cradle on the station truss, right of the docking port
const DRILL_REST = SURFACE_Y - 92 + 10;   // drill container y once smashed in: cutter 10 px into the rock
const PI = Math.PI;
const CAP_LOW = 262;       // surface-shot captions sit low, over the rock, clear of the ship and drill

export class CutsceneScene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  create(data) {
    this.data_ = data;
    this.kind = data.kind;
    this.vehicle = data.vehicle || (this.kind === 'ascent' ? 'clean' : 'drop');   // ascent: 'clean' (cash-out, ship leaves the drill) | 'ship' (broke away); descent: 'drop'
    this.style = data.style || breakawayStyle();   // how a broken-away ship left the bore ('flip' | 'reverse')
    this.done = false;
    this.t0 = performance.now();
    this.camTween = null;
    this.rig = this.spin = this.vehicleSprite = this.spaceVehicle = this.clampedText = null; // scene fields survive restarts
    this.drill = this.ship = this.shipClamps = this.spaceDrill = this.drillLight = this.beacon = null;
    this.impacted = false;
    this.beats = {};   // beat name -> ms since start (tests + docs)
    this.clean = this.vehicle === 'clean';   // cash-out: the ship leaves the drill behind cleanly
    const cam = this.cameras.main;
    this.cameras.cameras.slice(1).forEach((c) => this.cameras.remove(c));
    cam.resetFX(); cam.setRotation(0).setZoom(1).centerOn(GAME_W / 2, GAME_H / 2).setBackgroundColor('#07060b');

    this.surface = this.add.container(0, 0);
    this.space = this.add.container(0, 0).setVisible(false);
    this.trail = this.add.particles(0, 0, 'px2', {
      speed: { min: 10, max: 35 }, angle: { min: 70, max: 110 }, lifespan: 420, alpha: { start: 0.9, end: 0 }, scale: { start: 1, end: 2 },
      tint: [0xffd23f, 0xff8a3d, 0xcfcfdf], frequency: 30, emitting: false,
    }).setDepth(5);
    this.chips = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 90 }, angle: { min: 190, max: 350 }, gravityY: 160, lifespan: 650,
      tint: [0xc08060, 0x8a5a3a, 0xe0b090], quantity: 3, frequency: 30, emitting: false,
    }).setDepth(6);
    // engine exhaust pointing UP the screen (the ship's engine end in the drill-down attitude; also the falling drill's streak)
    this.thrust = this.add.particles(0, 0, 'px2', {
      speed: { min: 15, max: 40 }, angle: { min: 250, max: 290 }, lifespan: 380, alpha: { start: 0.9, end: 0 }, scale: { start: 1, end: 2 },
      tint: [0xffd23f, 0xff8a3d, 0xcfcfdf], frequency: 30, emitting: false,
    }).setDepth(5);
    // impact dust plume (rust + grey) and the drill's guidance-thruster puffs
    this.dust = this.add.particles(0, 0, 'px2', {
      speed: { min: 25, max: 110 }, angle: { min: 190, max: 350 }, gravityY: 30, lifespan: { min: 900, max: 1700 },
      alpha: { start: 1, end: 0 }, scale: { start: 2, end: 6 }, tint: [0xe8c8a0, 0xd0a080, 0xb8a8a0, 0xf0dcc0, 0xb07a5a], emitting: false,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-50, -6, 100, 8) },
    }).setDepth(7);
    this.puffs = this.add.particles(0, 0, 'px', {
      speed: { min: 8, max: 20 }, angle: { min: 0, max: 360 }, lifespan: 260, alpha: { start: 0.9, end: 0 }, tint: 0xdff2ff, frequency: 140, emitting: false,
    }).setDepth(5);

    // unrotated UI layer
    this.uiCam = this.cameras.add(0, 0, GAME_W, GAME_H);
    this.skipText = this.add.bitmapText(GAME_W - 4, GAME_H - 10, FONT_KEY, 'TAP TO SKIP', 6).setOrigin(1, 0).setTint(0x6a6278).setDepth(50).setAlpha(0);
    this.ui([this.skipText]);
    this.uiCam.ignore([this.surface, this.space, this.trail, this.chips, this.thrust, this.dust, this.puffs]);
    this.time.delayedCall(GRACE_MS, () => { if (!this.done) this.skipText.setAlpha(1); });   // grace is not on the scaled timeline
    this.input.on('pointerdown', () => { if (performance.now() - this.t0 >= GRACE_MS) this.finish(true); });

    this.buildSurface();
    this.buildSpace();
    if (this.kind === 'ascent') this.playAscent(); else this.playDescent();
  }

  beat(name) { this.beats[name] = Math.round(performance.now() - this.t0); }

  /** Put objects on the UI camera only. */
  ui(objs) { this.cameras.main.ignore(objs); return objs[0]; }

  caption(text, color, y = 130) {
    return this.ui([this.add.bitmapText(GAME_W / 2, y, FONT_KEY, text, 6).setOrigin(0.5).setTint(color).setDepth(50)]);
  }
  /** A caption that fades out on its own (base ms). */
  flashCaption(text, color, hold = 500, y = 130) {
    const t = this.caption(text, color, y);
    this.tweens.add({ targets: t, alpha: 0, duration: d(250), delay: d(hold), onComplete: () => t.destroy() });
    return t;
  }

  /**
   * Tween the main camera: rotation, zoom (with an optional mid "bump") and a centre that can follow
   * a moving target (getFrom / getTo are re-read every frame, so the camera tracks the rig).
   */
  turn({ from, to, zoomFrom = 1, zoomTo = 1, bump = 0, getFrom, getTo, duration, delay = 0, ease = 'Sine.easeInOut' }) {
    const cam = this.cameras.main;
    const p = { t: 0 };
    const apply = () => {
      const t = p.t;
      const a = getFrom(), b = getTo();
      cam.setRotation(from + (to - from) * t);
      cam.setZoom(zoomFrom + (zoomTo - zoomFrom) * t + bump * Math.sin(t * PI));
      cam.centerOn(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      cam.rotationProgress = t;
    };
    apply();
    this.camTween = this.tweens.add({ targets: p, t: 1, duration: d(duration), delay: d(delay), ease, onUpdate: apply, onComplete: apply });
    this.camApply = apply;
    return this.camTween;
  }

  // ---- props -------------------------------------------------------------------------
  /** The leased TB-6 on its own, drill down (origin = run world y 260). A status light on the collar. */
  makeDrill(scale) {
    const c = this.add.container(90, 0);
    const { parts, cutter } = drillParts(this, 260);
    c.add(parts);
    const light = this.add.rectangle(0, L.DRILL_UNIT.collarBot - 260 - 4, 6, 2, 0x5a2a2a);   // dark until the umbilicals are live
    c.add(light);
    c.setScale(-scale, -scale);
    return { c, cutter, light };
  }
  /**
   * CORMORANT alone in the rig's attitude (coupling face down, engines up; origin = run world y 260, so a
   * docked ship sits exactly where the rig did). Its clamp arms + umbilicals are a separate container (cc)
   * so they draw under the drill and over nothing else, like the run: clamps < drill < hull.
   */
  makeShipRig(scale, { clamps = true } = {}) {
    const c = this.add.container(90, 0), cc = this.add.container(90, 0);
    const sp = shipParts(this, 260, { clamps });
    if (sp.clamps) cc.add(sp.clamps);
    c.add(sp.hull);
    c.setScale(-scale, -scale); cc.setScale(-scale, -scale);
    return { c, cc, clamps: sp.clamps };
  }
  /** Ship clamp arms + umbilicals: open = swung wide and faded, closed = locked on the collar (base ms). */
  shipClampsTo(img, closed, ms) {
    if (!img) return;
    if (!ms) { img.setScale(closed ? 1 : 1.45, 1).setAlpha(closed ? 1 : 0); return; }
    this.tweens.add({ targets: img, scaleX: closed ? 1 : 1.45, alpha: closed ? 1 : 0, duration: d(ms), ease: closed ? 'Back.easeOut' : 'Sine.easeIn' });
  }
  /**
   * The ship alone (after a breakaway), keeping the attitude it left the run in: a 'flip' ship turned 180
   * and burned out engine-first; a 'reverse' ship backed out nose-first on its retros. Origin = hull centre.
   */
  makeShip(scale) {
    const c = this.add.container(90, 0);
    c.add(hullImage(this, SHIP_TEX.hull, 0, -SHIP_HALF));
    c.setScale(this.style === 'reverse' ? -scale : scale);
    return c;
  }

  buildSurface() {
    // drawn well past the 180x320 view so nothing shows black while the camera turns
    const X0 = -120, XW = GAME_W + 240;
    const g = this.add.graphics();
    const bands = [0x140c1e, 0x1a1024, 0x24142c, 0x34192e, 0x4a2230, 0x6a3434];
    const top = -260, bh = (SURFACE_Y - top) / bands.length;
    bands.forEach((col, i) => g.fillStyle(col, 1).fillRect(X0, top + i * bh, XW, bh + 1));
    for (let i = 0; i < 40; i++) g.fillStyle(0xffffff, 0.25 + (i % 3) * 0.2).fillRect(X0 + (i * 47) % XW, top + (i * 23) % 300, 1, 1);
    g.fillStyle(0xffc070, 0.9).fillCircle(146, 150, 9);                 // a low, tired sun
    g.fillStyle(0x3a2026, 1).fillTriangle(X0, SURFACE_Y, -40, 180, 20, SURFACE_Y).fillTriangle(0, SURFACE_Y, 50, 176, 110, SURFACE_Y)
      .fillTriangle(90, SURFACE_Y, 150, 182, 180, SURFACE_Y).fillTriangle(170, SURFACE_Y, 230, 178, X0 + XW, SURFACE_Y);
    this.surface.add(g);
    // ground: rust topsoil over the same purple rock the run scrolls through
    const ground = this.add.tileSprite(X0, SURFACE_Y, XW, 700, 'rock').setOrigin(0);
    const soil = this.add.tileSprite(X0, SURFACE_Y, XW, 26, 'rock').setOrigin(0).setTint(0xd09070);
    const edge = this.add.graphics();
    edge.fillStyle(0x8a5a4a, 1).fillRect(X0, SURFACE_Y + 26, XW, 1);
    edge.fillStyle(0xe0a070, 1).fillRect(X0, SURFACE_Y, XW, 2);
    this.surface.add([ground, soil, edge]);
    // bore hole (the run's tunnel texture)
    this.hole = this.add.tileSprite(45, SURFACE_Y, 90, 1, 'tunnel').setOrigin(0).setVisible(false);
    this.holeEdge = this.add.graphics();
    this.surface.add([this.hole, this.holeEdge]);
  }

  drawHole(depthPx) {
    const d = Math.max(0, Math.round(depthPx));
    this.hole.setVisible(d > 0).setSize(90, Math.max(1, d));
    this.holeEdge.clear().fillStyle(0x120c16, 1).fillRect(44, SURFACE_Y, 1, d).fillRect(135, SURFACE_Y, 1, d);
  }

  buildSpace() {
    const X0 = -120, XW = GAME_W + 240;
    const g = this.add.graphics();
    g.fillStyle(0x05040a, 1).fillRect(X0, -260, XW, 900);
    for (let i = 0; i < 110; i++) g.fillStyle(0xffffff, 0.2 + (i % 4) * 0.2).fillRect(X0 + (i * 53) % XW, -260 + (i * 37) % 900, 1, 1);
    this.space.add(g);
    // planet limb (Kessa-4: rust), scaled up during the descent
    this.planet = this.add.container(90, 560);
    const pg = this.add.graphics();
    pg.fillStyle(0xc08060, 0.35).fillCircle(0, 0, 274);
    pg.fillStyle(0x8a4a32, 1).fillCircle(0, 0, 270);
    pg.fillStyle(0x6a3426, 1).fillCircle(-40, 30, 262);
    pg.fillStyle(0xa05a3a, 1).fillRect(-90, -262, 40, 3).fillRect(20, -258, 60, 2);
    this.planet.add(pg);
    this.space.add(this.planet);
    // orbital station: truss, hab module, solar panels, docking port
    const s = this.add.graphics();
    s.fillStyle(0x3a3f55, 1).fillRect(X0, 30, XW, 4);
    for (let x = X0 + 4; x < X0 + XW; x += 8) s.fillStyle(0x5a5f78, 1).fillRect(x, 28, 1, 8);
    s.fillStyle(0x4b4f63, 1).fillRect(66, 14, 48, 40).fillStyle(0x6b6f84, 1).fillRect(66, 14, 48, 2);
    for (let x = 70; x < 112; x += 6) s.fillStyle(0xfff2a8, 0.9).fillRect(x, 22, 3, 2);
    s.fillStyle(0x2c6f8a, 1).fillRect(10, 22, 30, 18).fillRect(140, 22, 30, 18);
    for (let x = 12; x < 40; x += 4) s.fillStyle(0x1a3f55, 1).fillRect(x, 22, 1, 18).fillRect(x + 130, 22, 1, 18);
    s.fillStyle(0x23263a, 1).fillRect(78, 54, 24, PORT_Y - 54);
    this.space.add(s);
    this.portLight = this.add.rectangle(90, 58, 6, 2, 0xffc35c);
    this.clampL = this.add.rectangle(64, PORT_Y + 4, 8, 4, 0xffd23f).setOrigin(0.5);
    this.clampR = this.add.rectangle(116, PORT_Y + 4, 8, 4, 0xffd23f).setOrigin(0.5);
    this.space.add([this.portLight, this.clampL, this.clampR]);
    // Meridian's freight cradle: a drop rail off the truss, its jaws holding the leased TB-6 by the collar
    const m = this.add.graphics();
    m.fillStyle(0x3a2a26, 1).fillRect(CRADLE_X - 2, 34, 4, 16);                          // drop rail
    m.fillStyle(0x6a3434, 1).fillRect(CRADLE_X - 14, 48, 28, 4);                         // cradle beam (oxblood)
    m.fillStyle(0xe8dcc0, 1).fillRect(CRADLE_X - 11, 49, 8, 2).fillStyle(0x23263a, 1).fillRect(CRADLE_X - 2, 49, 3, 2);
    this.space.add(m);
    this.cradleL = this.add.rectangle(CRADLE_X - 12, 52, 3, 6, 0xffd23f).setOrigin(0.5, 0);
    this.cradleR = this.add.rectangle(CRADLE_X + 12, 52, 3, 6, 0xffd23f).setOrigin(0.5, 0);
    this.cradleLight = this.add.rectangle(CRADLE_X + 9, 50, 2, 1, 0xff5a5a);
    this.space.add([this.cradleL, this.cradleR, this.cradleLight]);
  }

  clamps(closed, ms) {
    if (!ms) { this.clampL.x = closed ? 80 : 64; this.clampR.x = closed ? 100 : 116; this.portLight.setFillStyle(closed ? 0x8affa0 : 0xffc35c); return; }
    this.tweens.add({ targets: this.clampL, x: closed ? 80 : 64, duration: d(ms), ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.clampR, x: closed ? 100 : 116, duration: d(ms), ease: 'Back.easeOut' });
    this.portLight.setFillStyle(closed ? 0x8affa0 : 0xffc35c);
  }

  cut(toSpace, flash = true) {
    if (flash) this.cameras.main.flash(d(120), 255, 255, 255);
    this.surface.setVisible(!toSpace);
    this.space.setVisible(toSpace);
    this.trail.stop(); this.chips.stop(); this.thrust.stop(); this.puffs.stop();
  }

  at(ms, fn) { this.time.delayedCall(d(ms), () => { if (!this.done) fn(); }); }

  /** Meridian's retrieval beacon by the bore mouth: the TB-6 stays down there for the company to fetch. */
  drawBeacon() {
    const g = this.add.graphics();
    g.fillStyle(0x3a3f55, 1).fillRect(146, SURFACE_Y - 16, 2, 16).fillStyle(0x6a3434, 1).fillRect(148, SURFACE_Y - 16, 9, 6);
    g.fillStyle(0xe8dcc0, 1).fillRect(150, SURFACE_Y - 14, 5, 2);
    const light = this.add.rectangle(147, SURFACE_Y - 18, 2, 2, 0xffc35c);
    this.tweens.add({ targets: light, alpha: 0.15, duration: 300, yoyo: true, repeat: -1 });
    this.surface.add([g, light]);
    this.beacon = light;
  }

  // ---- ascent: run view -> (turn) bore -> space -> dock -> (turn) docked view (4.6 s) ----------
  playAscent() {
    const shipOnly = this.vehicle === 'ship';    // drill lost: the ship broke away and burns home alone
    const y0 = 300;                 // underground, where the run shows the rig
    this.drawHole(y0 + 80 - SURFACE_Y);
    let v;
    if (shipOnly) {
      // the ship flipped and burned out engine-first in the run; it keeps that attitude here so the turn matches
      v = this.makeShip(1);
      v.y = y0;
      this.surface.add(v);
      this.trail.startFollow(v, 0, SHIP_HALF + 2); this.trail.start();
      this.tweens.add({ targets: v, y: -60, duration: d(1800), ease: 'Quad.easeIn' });
      this.at(500, () => { this.chips.setPosition(90, SURFACE_Y); this.chips.start(); });
      this.at(1700, () => this.chips.stop());
    } else {
      // clean cash-out: the clamps swing open (no alarms), the TB-6 stays in the bore as Meridian's property,
      // and Cormorant backs out alone on its retros, nose still to the drill
      const dr = this.makeDrill(1); dr.c.y = y0; dr.light.setFillStyle(0x8affa0);
      const sh = this.makeShipRig(1); sh.c.y = sh.cc.y = y0; this.shipClampsTo(sh.clamps, true, 0);
      this.surface.add([sh.cc, dr.c, sh.c]);
      this.drill = dr.c; this.ship = sh.c; this.shipClamps = sh.clamps; this.drillLight = dr.light;
      this.drawBeacon();
      v = sh.c;
      this.at(150, () => { this.beat('unclamp'); this.shipClampsTo(sh.clamps, false, 400); dr.light.setFillStyle(0xffc35c); this.flashCaption('UNCLAMPED', 0x8affa0, 450, CAP_LOW); });
      this.at(600, () => {
        this.beat('shipOut');
        this.trail.startFollow(sh.c, 0, 26); this.trail.start();    // retros at the coupling face
        this.tweens.add({ targets: [sh.c, sh.cc], y: -60, duration: d(1500), ease: 'Quad.easeIn' });
      });
      this.at(1150, () => { dr.light.setFillStyle(0x6a6278); this.flashCaption('TB-6 LEFT FOR MERIDIAN', 0x7fe0ff, 500, CAP_LOW); });
      this.at(1450, () => this.dust.explode(14, 90, SURFACE_Y));
    }
    this.vehicleSprite = v;
    // the turn: from the run's drill-up view (following the ship) to the surface's drill-down view
    this.turn({ from: PI, to: 0, bump: 0.12, duration: 1500, getFrom: () => ({ x: 90, y: v.y + RUN_CY }), getTo: () => ({ x: 90, y: GAME_H / 2 }) });
    this.at(2000, () => {
      this.cut(true);
      this.beat('space');
      // space: the ship alone rises to the port, the clamps bite
      const sv = shipOnly ? this.makeShip(SPACE_RIG) : this.makeShipRig(SPACE_RIG, { clamps: false }).c;
      sv.y = 340;
      this.space.add(sv);
      this.spaceVehicle = sv;
      const top = shipOnly ? SHIP_HALF * SPACE_RIG : RIG_TOP * SPACE_RIG;
      this.trail.startFollow(sv, 0, shipOnly ? 14 : 12); this.trail.start();
      this.tweens.add({ targets: sv, y: PORT_Y + top, duration: d(1700), ease: 'Cubic.easeOut' });
    });
    this.at(3700, () => {
      this.beat('docked');
      this.trail.stop();
      this.clamps(true, 300);
      this.cameras.main.shake(d(200), 0.01);
      this.clampedText = this.caption('CLAMPED', 0x8affa0);
    });
    // second turn: close in on the docked ship so it matches the dock screen (drill-up attitude, station below)
    this.at(3850, () => {
      const sv = this.spaceVehicle;
      if (this.clampedText) this.tweens.add({ targets: this.clampedText, alpha: 0, duration: d(300), delay: d(250) });
      this.turn({ from: 0, to: PI, zoomTo: DOCK_ZOOM, duration: 650, getFrom: () => ({ x: 90, y: GAME_H / 2 }), getTo: () => dockCentre(sv.y) });
    });
    this.at(BASE_END, () => this.finish(false));
  }

  // ---- descent: docked view (ship alone) -> (turn) undock + Meridian drops the TB-6 -> drill smashes in ->
  //      ship flies in + docks onto it -> bite -> (turn) run view (5.6 s) -------------------------------------
  playDescent() {
    this.cut(true, false);
    const sh0 = this.makeShipRig(SPACE_RIG, { clamps: false });
    const sv = sh0.c;
    sv.y = PORT_Y + RIG_TOP * SPACE_RIG;
    const dr0 = this.makeDrill(SPACE_RIG);
    dr0.c.x = CRADLE_X; dr0.c.y = 56 - Math.round(24 * SPACE_RIG);   // collar in the cradle's jaws
    this.space.add([sv, dr0.c]);
    this.spaceVehicle = sv; this.spaceDrill = dr0.c;
    this.clamps(true, 0);
    // open on the docked close-up (drill-up attitude, station below), turn out to the station view
    this.turn({ from: PI, to: 0, zoomFrom: DOCK_ZOOM, duration: 800, getFrom: () => dockCentre(PORT_Y + RIG_TOP * SPACE_RIG), getTo: () => ({ x: 90, y: GAME_H / 2 }) });
    this.at(750, () => { this.beat('undock'); this.clamps(false, 300); this.flashCaption('UNDOCKED', 0xffc35c, 450); });
    this.at(900, () => {
      // Meridian's cradle lets go: an unpowered drop, kept straight by little guidance thrusters
      this.beat('drillRelease');
      this.tweens.add({ targets: this.cradleL, x: CRADLE_X - 16, duration: d(150) });
      this.tweens.add({ targets: this.cradleR, x: CRADLE_X + 16, duration: d(150) });
      this.cradleLight.setFillStyle(0x8affa0);
      this.flashCaption('MERIDIAN DROP: TB-6', 0xff9a4a, 450, 142);
      this.puffs.startFollow(dr0.c, 0, 8); this.puffs.start();
      this.tweens.add({ targets: dr0.c, y: 380, x: 112, scaleX: -0.16, scaleY: -0.16, duration: d(1000), ease: 'Quad.easeIn' });
    });
    this.at(1000, () => {
      this.tweens.add({ targets: sv, y: 360, scaleX: -0.2, scaleY: -0.2, duration: d(900), ease: 'Quad.easeIn' });
      this.tweens.add({ targets: this.planet, scale: 1.6, y: 600, duration: d(900), ease: 'Quad.easeIn' });
    });
    let dr, sh;
    this.at(1900, () => {
      this.cut(false);
      this.beat('surface');
      this.crater = this.add.graphics();
      this.surface.add(this.crater);
      sh = this.makeShipRig(1);
      this.shipClampsTo(sh.clamps, false, 0);
      sh.c.x = sh.cc.x = 30; sh.c.y = sh.cc.y = -200;
      sh.c.setVisible(false); sh.cc.setVisible(false);
      dr = this.makeDrill(1);
      dr.c.y = -150;
      this.surface.add([sh.cc, dr.c, sh.c]);
      this.rig = this.drill = dr.c; this.ship = sh.c; this.shipClamps = sh.clamps; this.drillLight = dr.light;
      this.drillImg = dr.cutter; this.drillFrames = 'cutter';
      // the drill comes in alone, nose first: a re-entry streak off its collar + thruster puffs
      this.thrust.startFollow(dr.c, 0, 20); this.thrust.start();
      this.puffs.startFollow(dr.c, 0, 30); this.puffs.start();
      this.tweens.add({ targets: dr.c, y: DRILL_REST, duration: d(600), ease: 'Quad.easeIn' });
    });
    this.at(2500, () => {
      // IMPACT: the TB-6 smashes into the surface
      this.beat('impact');
      this.impacted = true;
      this.thrust.stop(); this.puffs.stop();
      this.cameras.main.shake(d(320), 0.025);
      this.cameras.main.flash(d(70), 255, 220, 180);
      this.dust.explode(80, 90, SURFACE_Y);
      this.time.delayedCall(d(120), () => { if (!this.done) this.dust.explode(40, 90, SURFACE_Y); });
      this.chips.explode(26, 90, SURFACE_Y);
      this.crater.fillStyle(0x120c16, 1).fillRect(44, SURFACE_Y, 92, 6);
      this.crater.fillStyle(0xd09070, 1).fillTriangle(30, SURFACE_Y + 1, 44, SURFACE_Y - 7, 50, SURFACE_Y + 1).fillTriangle(130, SURFACE_Y + 1, 136, SURFACE_Y - 6, 150, SURFACE_Y + 1);
      this.crater.fillStyle(0x8a5a4a, 1).fillRect(24, SURFACE_Y - 2, 3, 2).fillRect(152, SURFACE_Y - 1, 3, 2).fillRect(60, SURFACE_Y - 3, 2, 2);
      this.flashCaption('DRILL DOWN', 0xff9a4a, 350, CAP_LOW);
    });
    this.at(2650, () => {
      // Cormorant flies in after it, engines up, and lines up over the collar
      this.beat('shipIn');
      sh.c.setVisible(true); sh.cc.setVisible(true);
      this.thrust.startFollow(sh.c, 0, -40); this.thrust.start();
      this.tweens.add({ targets: [sh.c, sh.cc], x: 90, y: DRILL_REST - 44, duration: d(700), ease: 'Cubic.easeOut' });
    });
    this.at(3350, () => {
      // back down onto it on the retros
      this.beat('backDown');
      this.thrust.stop();
      this.trail.startFollow(sh.c, 0, 26); this.trail.start();
      this.tweens.add({ targets: [sh.c, sh.cc], y: DRILL_REST, duration: d(450), ease: 'Sine.easeInOut' });
    });
    this.at(3800, () => {
      this.beat('clampsLocked');
      this.trail.stop();
      this.shipClampsTo(sh.clamps, true, 250);
      this.cameras.main.shake(d(150), 0.008);
      this.flashCaption('CLAMPS LOCKED', 0x8affa0, 300, CAP_LOW);
    });
    this.at(4000, () => {
      // umbilicals connect, the drill powers up
      this.beat('powerUp');
      dr.light.setFillStyle(0xffc35c);
      this.time.delayedCall(d(100), () => { if (!this.done) dr.light.setFillStyle(0x8affa0); });
      this.flashCaption('UMBILICALS LIVE: POWER UP', 0xffc35c, 300, CAP_LOW + 10);
    });
    this.at(4150, () => {
      // the nose bites: spin the drill, chips fly, the rig sinks into the rock
      this.beat('bite');
      this.chips.setPosition(90, SURFACE_Y); this.chips.start();
      this.cameras.main.shake(d(450), 0.012);
      let f = 0;
      this.spin = this.time.addEvent({ delay: 60, loop: true, callback: () => { f = (f + 1) % 3; this.drillImg.setTexture(this.drillFrames + f); } });
      this.tweens.add({ targets: [dr.c, sh.c, sh.cc], y: 300, duration: d(1300), ease: 'Sine.easeIn',
        onUpdate: () => this.drawHole(dr.c.y + 80 - SURFACE_Y) });
    });
    // the turn: follow the rig down and rotate into the run's drill-up view (rock above)
    this.at(4300, () => {
      this.turn({ from: 0, to: PI, bump: 0.15, duration: 1150, getFrom: () => ({ x: 90, y: GAME_H / 2 }), getTo: () => ({ x: 90, y: dr.c.y + RUN_CY }) });
    });
    this.at(5150, () => this.chips.stop());
    this.at(5420, () => { this.cameras.main.fadeOut(d(170), 0, 0, 0); this.uiCam.fadeOut(d(170), 0, 0, 0); });
    this.at(DESCENT_END, () => this.finish(false));
  }

  finish(skipped) {
    if (this.done) return;
    this.done = true;
    const ms = Math.round(performance.now() - this.t0);
    const dd = this.data_;
    (window.__drillAnims = window.__drillAnims || []).push({ kind: this.kind, vehicle: this.vehicle, ms, skipped, boardMs: dd.boardMs || 0, expectMs: this.kind === 'descent' ? DESCENT_MS : CUTSCENE_MS, scale: S, beats: { ...this.beats } });
    if (this.kind === 'ascent') this.scene.start('Dock', { summary: dd.summary, intro: true, welcome: 'DOCKED. NEW STOCK AT THE QUARTERMASTER' });
    else this.scene.start('Game', { planet: dd.planet });
  }
}
