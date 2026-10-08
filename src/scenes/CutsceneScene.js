// Transition cutscenes (~4.6 s + a short concourse beat; tap to skip after a 0.4 s grace). Reuses the rig textures (ship_ext + drill).
// Orientation: the run (and the docked interior) show the rig drill-UP, flipped for the phone. Outside
// (the surface, space) it is drill-DOWN. The camera rotates 180 degrees to bridge the two:
//   ascent : run view (drill up, rock above) -> camera turns as the rig is winched out of the bore (or the
//            escape pod launches) -> cut to space, it rises to the station and the clamps engage ->
//            camera turns again and closes in on the exact framing of the concourse's docking bay (drill up,
//            station below); the concourse takes over and Holt rides the airlock lift down.
//   descent: (Holt boards via the lift) bay framing -> camera turns out to the station (drill down) -> clamps release, the rig drops
//            toward the planet -> cut to the surface, the drill bites -> camera turns as it sinks in, landing
//            in the run view.
// Only the main camera rotates; "TAP TO SKIP" and captions live on a separate, unrotated UI camera.
import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { CONCOURSE } from './DockScene.js';

const SURFACE_Y = 204;
const PORT_Y = 64;          // bottom of the station's docking port
const RIG_TOP = 42;         // rig container: ship top is 42 px above centre once flipped (drill down)
const RUN_CY = 100;         // rotated 180 deg, a camera centred RUN_CY below the rig puts it where the run draws it
const SPACE_RIG = 0.45;    // rig scale in the space shots
const DOCK_ZOOM = 1 / SPACE_RIG;  // rotated + zoomed so the docked rig lands exactly where the concourse draws it
// camera centre that puts a space-shot rig (centre y) at the concourse's rig position, drill up
const dockCentre = (rigY) => ({ x: 90, y: rigY - (GAME_H / 2 - CONCOURSE.RIG_Y) / DOCK_ZOOM });
export const GRACE_MS = 400;
export const ASCENT_MS = 4600;    // + the 0.55 s lift ride on the concourse = ~5.2 s
export const DESCENT_MS = 4600;   // after the boarding beat on the concourse (walk to the airlock + lift)
const PI = Math.PI;

export class CutsceneScene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  create(data) {
    this.data_ = data;
    this.kind = data.kind;
    this.vehicle = data.vehicle || 'rig';
    this.done = false;
    this.t0 = performance.now();
    this.camTween = null;
    this.rig = this.spin = this.vehicleSprite = this.spaceVehicle = this.clampedText = null; // scene fields survive restarts
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

    // unrotated UI layer
    this.uiCam = this.cameras.add(0, 0, GAME_W, GAME_H);
    this.skipText = this.add.bitmapText(GAME_W - 4, GAME_H - 10, FONT_KEY, 'TAP TO SKIP', 6).setOrigin(1, 0).setTint(0x6a6278).setDepth(50).setAlpha(0);
    this.ui([this.skipText]);
    this.uiCam.ignore([this.surface, this.space, this.trail, this.chips]);
    this.at(GRACE_MS, () => this.skipText.setAlpha(1));
    this.input.on('pointerdown', () => { if (performance.now() - this.t0 >= GRACE_MS) this.finish(true); });

    this.buildSurface();
    this.buildSpace();
    if (this.kind === 'ascent') this.playAscent(); else this.playDescent();
  }

  /** Put objects on the UI camera only. */
  ui(objs) { this.cameras.main.ignore(objs); return objs[0]; }

  caption(text, color) {
    return this.ui([this.add.bitmapText(GAME_W / 2, 130, FONT_KEY, text, 6).setOrigin(0.5).setTint(color).setDepth(50)]);
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
    this.camTween = this.tweens.add({ targets: p, t: 1, duration, delay, ease, onUpdate: apply, onComplete: apply });
    this.camApply = apply;
    return this.camTween;
  }

  // ---- props -------------------------------------------------------------------------
  makeRig(scale) {
    const c = this.add.container(90, 0);
    this.drillImg = this.add.image(0, -42, 'drill0').setOrigin(0.5, 0);
    c.add([this.drillImg, this.add.image(-43, -20, 'ship_ext').setOrigin(0)]);
    c.setScale(-scale, -scale); // turned 180 deg (not mirrored): drill down; the camera's 180 deg turn restores the run's look
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
    // bore hole (the run's tunnel texture) + winch gantry
    this.hole = this.add.tileSprite(45, SURFACE_Y, 90, 1, 'tunnel').setOrigin(0).setVisible(false);
    this.holeEdge = this.add.graphics();
    this.gantry = this.add.graphics();
    this.cable = this.add.graphics();
    this.surface.add([this.hole, this.holeEdge, this.gantry, this.cable]);
  }

  drawHole(depthPx) {
    const d = Math.max(0, Math.round(depthPx));
    this.hole.setVisible(d > 0).setSize(90, Math.max(1, d));
    this.holeEdge.clear().fillStyle(0x120c16, 1).fillRect(44, SURFACE_Y, 1, d).fillRect(135, SURFACE_Y, 1, d);
  }

  drawGantry() {
    this.gantry.clear().lineStyle(2, 0x5a5f78, 1)
      .lineBetween(34, SURFACE_Y, 90, 110).lineBetween(146, SURFACE_Y, 90, 110).lineBetween(54, 170, 126, 170);
    this.gantry.fillStyle(0xffd23f, 1).fillRect(86, 106, 8, 6).fillStyle(0xff3030, 1).fillRect(89, 102, 2, 2);
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
  }

  clamps(closed, ms) {
    if (!ms) { this.clampL.x = closed ? 80 : 64; this.clampR.x = closed ? 100 : 116; this.portLight.setFillStyle(closed ? 0x8affa0 : 0xffc35c); return; }
    this.tweens.add({ targets: this.clampL, x: closed ? 80 : 64, duration: ms, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.clampR, x: closed ? 100 : 116, duration: ms, ease: 'Back.easeOut' });
    this.portLight.setFillStyle(closed ? 0x8affa0 : 0xffc35c);
  }

  cut(toSpace, flash = true) {
    if (flash) this.cameras.main.flash(120, 255, 255, 255);
    this.surface.setVisible(!toSpace);
    this.space.setVisible(toSpace);
    this.trail.stop(); this.chips.stop();
  }

  at(ms, fn) { this.time.delayedCall(ms, () => { if (!this.done) fn(); }); }

  // ---- ascent: run view -> (turn) bore -> space -> dock -> (turn) docked view (5.2 s) ----------
  playAscent() {
    const pod = this.vehicle === 'pod';
    const y0 = 300;                 // underground, where the run shows the rig
    this.drawHole(y0 + 30 - SURFACE_Y);
    this.drawGantry();
    let v;
    if (pod) {
      // the crew cab rides the bore engine-first in the run; flipped here so the turn matches it
      v = this.add.image(90, y0, 'pod').setScale(3).setFlip(true, true);
      this.surface.add(v);
      this.trail.startFollow(v, 0, 14); this.trail.start();
      this.tweens.add({ targets: v, y: -40, duration: 1800, ease: 'Quad.easeIn' });
    } else {
      v = this.makeRig(1);
      v.y = y0;
      this.surface.add(v);
      const drawCable = () => this.cable.clear().lineStyle(1, 0xcfcfdf, 1).lineBetween(90, 112, 90, v.y - RIG_TOP);
      drawCable();
      this.tweens.add({ targets: v, y: 158, duration: 1900, ease: 'Sine.easeInOut', onUpdate: drawCable });
    }
    this.vehicleSprite = v;
    // the turn: from the run's drill-up view (following the rig) to the surface's drill-down view
    this.turn({ from: PI, to: 0, bump: 0.12, duration: 1500, getFrom: () => ({ x: 90, y: v.y + RUN_CY }), getTo: () => ({ x: 90, y: GAME_H / 2 }) });
    this.at(pod ? 500 : 700, () => { this.chips.setPosition(90, SURFACE_Y); this.chips.start(); });
    this.at(1700, () => this.chips.stop());
    this.at(2000, () => {
      this.cut(true);
      // space: rises to the port, clamps bite
      const sv = pod ? this.add.image(90, 340, 'pod').setScale(1.5).setFlip(true, true) : this.makeRig(0.45);
      if (!pod) sv.y = 340;
      this.space.add(sv);
      this.spaceVehicle = sv;
      const top = pod ? 6 : RIG_TOP * 0.45;
      this.trail.startFollow(sv, 0, pod ? 8 : 20); this.trail.start();
      this.tweens.add({ targets: sv, y: PORT_Y + top, duration: 1700, ease: 'Cubic.easeOut' });
    });
    this.at(3700, () => {
      this.trail.stop();
      this.clamps(true, 300);
      this.cameras.main.shake(200, 0.01);
      this.clampedText = this.caption('CLAMPED', 0x8affa0);
    });
    // second turn: close in on the docked rig so it matches the dock screen (drill up, station below)
    this.at(3850, () => {
      const sv = this.spaceVehicle;
      if (this.clampedText) this.tweens.add({ targets: this.clampedText, alpha: 0, duration: 300, delay: 250 });
      this.turn({ from: 0, to: PI, zoomTo: DOCK_ZOOM, duration: 650, getFrom: () => ({ x: 90, y: GAME_H / 2 }), getTo: () => dockCentre(sv.y) });
    });
    this.at(ASCENT_MS, () => this.finish(false));
  }

  // ---- descent: docked view -> (turn) undock -> fall -> bite -> (turn) run view (5.2 s) ------
  playDescent() {
    this.cut(true, false);
    const sv = this.makeRig(0.45);
    sv.y = PORT_Y + RIG_TOP * 0.45;
    this.space.add(sv);
    this.clamps(true, 0);
    // open on the docked close-up (drill up, station below), turn out to the station view
    this.turn({ from: PI, to: 0, zoomFrom: DOCK_ZOOM, duration: 800, getFrom: () => dockCentre(PORT_Y + RIG_TOP * SPACE_RIG), getTo: () => ({ x: 90, y: GAME_H / 2 }) });
    this.at(750, () => { this.clamps(false, 300); this.caption('UNDOCKED', 0xffc35c); });
    this.at(1000, () => {
      this.tweens.add({ targets: sv, y: 360, scaleX: -0.2, scaleY: -0.2, duration: 900, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: this.planet, scale: 1.6, y: 600, duration: 900, ease: 'Quad.easeIn' });
    });
    this.at(1500, () => this.children.list.filter((c) => c.type === 'BitmapText' && c.text === 'UNDOCKED').forEach((c) => c.destroy()));
    this.at(1900, () => {
      this.cut(false);
      const rig = this.makeRig(1);
      rig.y = -50;
      this.surface.add(rig);
      this.rig = rig;
      this.trail.startFollow(rig, 0, 30); this.trail.start();
      this.tweens.add({ targets: rig, y: SURFACE_Y - 40, duration: 1250, ease: 'Quad.easeOut' });
    });
    this.at(3150, () => {
      // the nose bites: spin the drill, chips fly, the rig sinks into the rock
      this.trail.stop();
      this.chips.setPosition(90, SURFACE_Y); this.chips.start();
      this.cameras.main.shake(450, 0.012);
      let f = 0;
      this.spin = this.time.addEvent({ delay: 60, loop: true, callback: () => { f = (f + 1) % 3; this.drillImg.setTexture('drill' + f); } });
      const rig = this.rig;
      this.tweens.add({ targets: rig, y: 300, duration: 1300, ease: 'Sine.easeIn',
        onUpdate: () => this.drawHole(rig.y + 30 - SURFACE_Y) });
    });
    // the turn: follow the rig down and rotate into the run's drill-up view (rock above)
    this.at(3300, () => {
      const rig = this.rig;
      this.turn({ from: 0, to: PI, bump: 0.15, duration: 1150, getFrom: () => ({ x: 90, y: GAME_H / 2 }), getTo: () => ({ x: 90, y: rig.y + RUN_CY }) });
    });
    this.at(4150, () => this.chips.stop());
    this.at(4420, () => { this.cameras.main.fadeOut(170, 0, 0, 0); this.uiCam.fadeOut(170, 0, 0, 0); });
    this.at(DESCENT_MS, () => this.finish(false));
  }

  finish(skipped) {
    if (this.done) return;
    this.done = true;
    const ms = Math.round(performance.now() - this.t0);
    const d = this.data_;
    (window.__drillAnims = window.__drillAnims || []).push({ kind: this.kind, vehicle: this.vehicle, ms, skipped, boardMs: d.boardMs || 0 });
    if (this.kind === 'ascent') this.scene.start('Dock', { summary: d.summary, intro: true, welcome: 'DOCKED. NEW STOCK AT THE QUARTERMASTER' });
    else this.scene.start('Game', { planet: d.planet });
  }
}
