// Short transition cutscenes (~2.5 s, tap to skip). Reuses the rig textures (ship_ext + drill).
//   ascent : the rig is winched up out of the bore (or the escape pod launches), quick cut to
//            space, it rises to the orbital station and the clamps engage -> docked + summary.
//   descent: clamps release, the rig drops toward the planet, cut to the surface, it settles
//            on thrusters and the drill nose bites in -> the run.
import { GAME_W, GAME_H } from '../config.js';
import { FONT_KEY } from '../systems/PixelFont.js';

const SURFACE_Y = 204;
const PORT_Y = 64;          // bottom of the station's docking port
const RIG_TOP = 42;         // rig container: ship top is 42 px above centre once flipped (drill down)

export class CutsceneScene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  create(data) {
    this.data_ = data;
    this.kind = data.kind;
    this.vehicle = data.vehicle || 'rig';
    this.done = false;
    this.t0 = performance.now();
    this.cameras.main.setBackgroundColor('#07060b');
    this.surface = this.add.container(0, 0);
    this.space = this.add.container(0, 0).setVisible(false);
    this.trail = this.add.particles(0, 0, 'px2', {
      speed: { min: 10, max: 35 }, angle: { min: 70, max: 110 }, lifespan: 380, alpha: { start: 0.9, end: 0 }, scale: { start: 1, end: 2 },
      tint: [0xffd23f, 0xff8a3d, 0xcfcfdf], frequency: 30, emitting: false,
    }).setDepth(5);
    this.chips = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 90 }, angle: { min: 190, max: 350 }, gravityY: 160, lifespan: 600,
      tint: [0xc08060, 0x8a5a3a, 0xe0b090], quantity: 3, frequency: 25, emitting: false,
    }).setDepth(6);
    this.add.bitmapText(GAME_W - 4, GAME_H - 10, FONT_KEY, 'TAP TO SKIP', 6).setOrigin(1, 0).setTint(0x6a6278).setDepth(50);
    this.input.on('pointerdown', () => this.finish(true));
    this.buildSurface();
    this.buildSpace();
    if (this.kind === 'ascent') this.playAscent(); else this.playDescent();
  }

  // ---- props -------------------------------------------------------------------------
  makeRig(scale) {
    const c = this.add.container(90, 0);
    this.drillImg = this.add.image(0, -42, 'drill0').setOrigin(0.5, 0);
    c.add([this.drillImg, this.add.image(-43, -20, 'ship_ext').setOrigin(0)]);
    c.setScale(scale, -scale); // flipped: drill points down, as it does in the planet
    return c;
  }

  buildSurface() {
    const g = this.add.graphics();
    // dusk sky in bands + a few stars
    const bands = [0x1a1024, 0x24142c, 0x34192e, 0x4a2230, 0x6a3434];
    bands.forEach((col, i) => g.fillStyle(col, 1).fillRect(0, i * (SURFACE_Y / bands.length), GAME_W, SURFACE_Y / bands.length + 1));
    for (let i = 0; i < 16; i++) g.fillStyle(0xffffff, 0.25 + (i % 3) * 0.2).fillRect((i * 47) % 180, (i * 23) % 90, 1, 1);
    g.fillStyle(0xffc070, 0.9).fillCircle(146, 150, 9);                 // a low, tired sun
    g.fillStyle(0x3a2026, 1).fillTriangle(0, SURFACE_Y, 50, 176, 110, SURFACE_Y).fillTriangle(90, SURFACE_Y, 150, 182, 180, SURFACE_Y);
    this.surface.add(g);
    const ground = this.add.tileSprite(0, SURFACE_Y, GAME_W, GAME_H - SURFACE_Y, 'rock').setOrigin(0).setTint(0xd09070);
    const edge = this.add.graphics();
    edge.fillStyle(0xe0a070, 1).fillRect(0, SURFACE_Y, GAME_W, 2);
    this.surface.add([ground, edge]);
    // bore hole + winch gantry (ascent only; descent starts on untouched ground)
    this.hole = this.add.graphics();
    this.gantry = this.add.graphics();
    this.cable = this.add.graphics();
    this.surface.add([this.hole, this.gantry, this.cable]);
  }

  drawHole(depthPx) {
    this.hole.clear().fillStyle(0x0a070c, 1).fillRect(46, SURFACE_Y, 88, depthPx)
      .fillStyle(0x6a3a2a, 1).fillRect(44, SURFACE_Y, 2, depthPx).fillRect(134, SURFACE_Y, 2, depthPx);
  }

  drawGantry() {
    this.gantry.clear().lineStyle(2, 0x5a5f78, 1)
      .lineBetween(34, SURFACE_Y, 90, 110).lineBetween(146, SURFACE_Y, 90, 110).lineBetween(54, 170, 126, 170);
    this.gantry.fillStyle(0xffd23f, 1).fillRect(86, 106, 8, 6).fillStyle(0xff3030, 1).fillRect(89, 102, 2, 2);
  }

  buildSpace() {
    const g = this.add.graphics();
    g.fillStyle(0x05040a, 1).fillRect(0, 0, GAME_W, GAME_H);
    for (let i = 0; i < 40; i++) g.fillStyle(0xffffff, 0.2 + (i % 4) * 0.2).fillRect((i * 53) % 180, (i * 37) % 320, 1, 1);
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
    // orbital station: truss, hab module, ring, docking port
    const s = this.add.graphics();
    s.fillStyle(0x3a3f55, 1).fillRect(0, 30, GAME_W, 4);
    for (let x = 4; x < GAME_W; x += 8) s.fillStyle(0x5a5f78, 1).fillRect(x, 28, 1, 8);
    s.fillStyle(0x4b4f63, 1).fillRect(66, 14, 48, 40).fillStyle(0x6b6f84, 1).fillRect(66, 14, 48, 2);
    for (let x = 70; x < 112; x += 6) s.fillStyle(0xfff2a8, 0.9).fillRect(x, 22, 3, 2);
    s.fillStyle(0x2c6f8a, 1).fillRect(10, 22, 30, 18).fillRect(140, 22, 30, 18); // solar panels
    for (let x = 12; x < 40; x += 4) s.fillStyle(0x1a3f55, 1).fillRect(x, 22, 1, 18).fillRect(x + 130, 22, 1, 18);
    s.fillStyle(0x23263a, 1).fillRect(78, 54, 24, PORT_Y - 54);
    this.space.add(s);
    this.portLight = this.add.rectangle(90, 58, 6, 2, 0xffc35c);
    this.clampL = this.add.rectangle(64, PORT_Y + 4, 8, 4, 0xffd23f).setOrigin(0.5);
    this.clampR = this.add.rectangle(116, PORT_Y + 4, 8, 4, 0xffd23f).setOrigin(0.5);
    this.space.add([this.portLight, this.clampL, this.clampR]);
  }

  clamps(closed, ms) {
    this.tweens.add({ targets: this.clampL, x: closed ? 80 : 64, duration: ms, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.clampR, x: closed ? 100 : 116, duration: ms, ease: 'Back.easeOut' });
    this.portLight.setFillStyle(closed ? 0x8affa0 : 0xffc35c);
  }

  cut(toSpace) {
    this.cameras.main.flash(90, 255, 255, 255);
    this.surface.setVisible(!toSpace);
    this.space.setVisible(toSpace);
    this.trail.stop(); this.chips.stop();
  }

  at(ms, fn) { this.time.delayedCall(ms, () => { if (!this.done) fn(); }); }

  // ---- ascent: bore -> space -> dock (2.6 s) -------------------------------------------
  playAscent() {
    const pod = this.vehicle === 'pod';
    this.drawHole(GAME_H - SURFACE_Y);
    this.drawGantry();
    let v;
    if (pod) {
      v = this.add.image(90, 340, 'pod').setScale(3);
      this.surface.add(v);
      this.trail.startFollow(v, 0, 14); this.trail.start();
      this.tweens.add({ targets: v, y: -30, duration: 900, ease: 'Quad.easeIn' });
      this.at(250, () => { this.chips.setPosition(90, SURFACE_Y); this.chips.start(); });
    } else {
      v = this.makeRig(1);
      v.y = 360;
      this.surface.add(v);
      this.tweens.add({ targets: v, y: 158, duration: 950, ease: 'Cubic.easeOut', onUpdate: () => {
        this.cable.clear().lineStyle(1, 0xcfcfdf, 1).lineBetween(90, 112, 90, v.y - RIG_TOP);
      } });
      this.at(300, () => { this.chips.setPosition(90, SURFACE_Y); this.chips.start(); });
    }
    this.vehicleSprite = v;
    this.at(1000, () => this.cut(true));
    this.at(1000, () => {
      // space: rises to the port, clamps bite
      const sv = pod ? this.add.image(90, 340, 'pod').setScale(1.5) : this.makeRig(0.45);
      if (!pod) sv.y = 340;
      this.space.add(sv);
      this.spaceVehicle = sv;
      const top = pod ? 6 : RIG_TOP * 0.45;
      this.trail.startFollow(sv, 0, pod ? 8 : 20); this.trail.start();
      this.tweens.add({ targets: sv, y: PORT_Y + top, duration: 1050, ease: 'Cubic.easeOut' });
    });
    this.at(2050, () => {
      this.trail.stop();
      this.clamps(true, 160);
      this.cameras.main.shake(120, 0.01);
      const t = this.add.bitmapText(90, 120, FONT_KEY, 'CLAMPED', 6).setOrigin(0.5).setTint(0x8affa0);
      this.space.add(t);
    });
    this.at(2600, () => this.finish(false));
  }

  // ---- descent: undock -> fall -> bite (2.6 s) ------------------------------------------
  playDescent() {
    this.cut(true);
    this.cameras.main.resetFX();
    const sv = this.makeRig(0.45);
    sv.y = PORT_Y + RIG_TOP * 0.45;
    this.space.add(sv);
    this.clamps(true, 0);
    this.at(150, () => this.clamps(false, 150));
    this.at(300, () => {
      this.tweens.add({ targets: sv, y: 360, scaleX: 0.2, scaleY: -0.2, duration: 700, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: this.planet, scale: 1.6, y: 600, duration: 700, ease: 'Quad.easeIn' });
    });
    this.at(1000, () => {
      this.cut(false);
      const rig = this.makeRig(1);
      rig.y = -50;
      this.surface.add(rig);
      this.rig = rig;
      this.trail.startFollow(rig, 0, 30); this.trail.start();
      this.tweens.add({ targets: rig, y: SURFACE_Y - 42 + 2, duration: 850, ease: 'Quad.easeOut' });
    });
    this.at(1850, () => {
      // the nose bites: spin the drill, chips fly, the rig sinks a little into the rock
      this.trail.stop();
      this.chips.setPosition(90, SURFACE_Y); this.chips.start();
      this.cameras.main.shake(350, 0.012);
      let f = 0;
      this.spin = this.time.addEvent({ delay: 60, loop: true, callback: () => { f = (f + 1) % 3; this.drillImg.setTexture('drill' + f); } });
      this.tweens.add({ targets: this.rig, y: this.rig.y + 16, duration: 550, ease: 'Sine.easeIn',
        onUpdate: () => this.drawHole(Math.max(0, this.rig.y + 42 - SURFACE_Y)) });
    });
    this.at(2350, () => this.cameras.main.fadeOut(220, 0, 0, 0));
    this.at(2600, () => this.finish(false));
  }

  finish(skipped) {
    if (this.done) return;
    this.done = true;
    const ms = Math.round(performance.now() - this.t0);
    (window.__drillAnims = window.__drillAnims || []).push({ kind: this.kind, vehicle: this.vehicle, ms, skipped });
    const d = this.data_;
    if (this.kind === 'ascent') this.scene.start('Dock', { summary: d.summary, welcome: 'DOCKED. NEW STOCK AT THE QUARTERMASTER' });
    else this.scene.start('Game', { planet: d.planet });
  }
}
