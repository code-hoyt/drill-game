// The world: terrain, boulders, the ship and its crew. Owns the simulation.
import { TUNING as T, LAYOUT as L, ORE, EVENTS as E, CALM, SIPHON, SHIP, breakawayStyle, loadBest, saveBest } from '../config.js';
import { Veins } from '../systems/Veins.js';
import { Pockets } from '../systems/Pockets.js';
import { EventDirector } from '../systems/Events.js';
import { ShipSystems } from '../systems/ShipSystems.js';
import { Terrain } from '../systems/Terrain.js';
import { Obstacles } from '../systems/Obstacles.js';
import { Ship } from '../systems/Ship.js';
import { Crew } from '../systems/Crew.js';
import { ViewController } from '../systems/ViewController.js';
import { SHIP_TEX, hullImage } from '../systems/ShipArt.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { drawBoosts } from '../data/boosts.js';
import { RELAY_PING, relayMessage, CASHOUT_LINE, BREAKAWAY_LINE } from '../data/dispatch.js';
import { bankRun, loadSave, logRadio, setRunActive } from '../systems/Save.js';
import { ANIM, animScale, GRACE_MS } from '../systems/Settings.js';

// Hold-actions per station. The HELM has none: its action area is the throttle itself.
// DRL is the remote DRILL CONSOLE (bit wear, EXTRACT at a vein, FREE THE BIT on a jam). TLS patches drill integrity.
// SIPHON (seat by the hose port): PUMP, stopped with a side pocket lined up with the port.
export const STATION_ACTIONS = { engine: ['vent'], helm: [], drill: ['repair', 'extract', 'freebit'], tools: ['patch', 'blast'], siphon: ['pump'] };

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create(data = {}) {
    this.cameras.main.setBackgroundColor('#140e19');
    this.planet = data.planet || 'kessa4';
    const save = loadSave();
    this.contractNo = save.runs + 1;
    this.state = new ShipSystems(save.loadout);   // equipped parts are locked in for the run
    setRunActive(true);
    this.events.once('shutdown', () => setRunActive(false));
    this.terrain = new Terrain(this);
    this.ship = new Ship(this, (id) => this.onRoomTap(id), () => this.view.set('inside'));
    this.crew = new Crew(this, this.ship, T.START_ROOM);
    this.crew.walkMul = this.state.mods.walkMul; this.crew.climbMul = this.state.mods.climbMul;
    this.governorTripped = false;
    this.obstacles = new Obstacles(this, this.state);
    this.view = new ViewController(this, this.ship);
    this.hold = null;        // action currently held by the player
    this.blastCharge = 0;    // seconds charged toward a BLAST
    this.toasts = [];        // messages for the UI scene
    this.flags = {};         // previous alert states (for one-shot toasts)
    this.nextHardCheck = T.HARD_START_DEPTH;
    this.over = false;
    this.leftRun = false; this.breakState = null;   // (scene fields survive restarts)
    this.lockedPing = -99999; // time of the last tap on a locked throttle (UI flashes)
    this.wasPiloted = this.piloted;
    this.boom = this.add.particles(0, 0, 'px2', {
      speed: { min: 30, max: 120 }, angle: { min: 0, max: 360 }, lifespan: 900, gravityY: 60,
      tint: [0xff6b3d, 0xffd23f, 0xb5532f, 0x555555], emitting: false,
    }).setDepth(40);

    // --- M1: relays ---
    this.relayWarned = false;
    this.offers = [];          // relay supplies offered at the current relay
    this.boostChosen = false;
    this.forceOffers = null;   // test hook: fixed offer ids
    this.relayGfx = this.add.graphics().setDepth(2.5);
    this.relayLabel = this.add.bitmapText(4, 0, FONT_KEY, '', 6).setTint(0x7fe0ff).setDepth(2.6).setVisible(false);
    // --- ore veins + run events ---
    this.toastLog = [];
    // full stop = calm: cue strength 0..1 (fades), and rock dust settling in the bore after a stop
    this.calmK = 0; this.wasCalm = false; this.settleT = 0;
    this.settle = this.add.particles(0, 0, 'px', {
      x: { min: 30, max: 150 }, y: { min: 60, max: 200 }, speedY: { min: 3, max: 9 }, speedX: { min: -2, max: 2 },
      lifespan: 1800, alpha: { start: 0.55, end: 0 }, tint: [0x8a7f8f, 0xb8a8a0, 0x5e5363], frequency: 45, emitting: false,
    }).setDepth(3);
    this.veins = new Veins(this, this.state);
    this.pockets = new Pockets(this, this.state);
    this.director = new EventDirector(this);
    // stops never overlap: boulders, vein stops and pocket stops keep clear of each other (and of relays)
    this.obstacles.spawnFilter = (arrival) => !this.inRelayWindow(arrival, 0) && !this.veins.near(arrival, ORE.CLEAR_M) && !this.pockets.near(arrival, SIPHON.CLEAR_M);
    this.veins.spawnFilter = (arrival) => !this.inRelayWindow(arrival, 15) && !this.boulderNear(arrival, ORE.CLEAR_M) && !this.pockets.near(arrival, SIPHON.CLEAR_M);
    this.pockets.spawnFilter = (arrival) => !this.inRelayWindow(arrival, 15) && !this.boulderNear(arrival, SIPHON.CLEAR_M) && !this.veins.near(arrival, SIPHON.CLEAR_M);

    this.scene.launch('UI');
    this.setupKeyboard();

    // Debug/test hooks via URL: ?depth=950 starts the run at 950 m, ?boosts=plate,coolant,charge fixes relay offers.
    const q = new URLSearchParams(window.location.search);
    if (q.has('depth')) this.debugJump(Number(q.get('depth')) || 0);
    if (q.has('boosts')) this.forceOffers = q.get('boosts').split(',');
    // ?noevents=1: no random veins or events (tests / calm playtests). ?vein=small|rich|fine: one ~45 m ahead.
    // ?event=jam|surge: triggered 1.5 s into the run. (?event=fire is a no-op: fires were removed.)
    if (q.get('noevents') === '1') { this.veins.enabled = false; this.director.enabled = false; this.pockets.enabled = false; }
    if (q.has('vein') && ORE.TYPES[q.get('vein')]) this.veins.spawn(q.get('vein'), L.DRILL_TIP_Y - 45 * T.PX_PER_METER);
    // ?pocket=small|rich|volatile&side=left|right: one side pocket lining up ~45 m ahead
    if (q.has('pocket') && SIPHON.TYPES[q.get('pocket')]) this.pockets.spawn(q.get('pocket'), q.get('side') === 'right' ? 'right' : 'left', SIPHON.PORT_Y - 45 * T.PX_PER_METER);
    if (q.has('event')) { const [type] = q.get('event').split(':'); this.time.delayedCall(1500, () => { if (!this.over) this.director.trigger(type); }); }
  }

  /** Is a depth inside a relay's clear window [R - WARN - pad, R + CLEAR_AFTER]? */
  inRelayWindow(depthM, pad = 0) {
    const I = T.RELAY_INTERVAL;
    const next = Math.ceil(depthM / I) * I, prev = Math.floor(depthM / I) * I;
    return (next > 0 && next - depthM <= T.RELAY_WARN + pad) || (prev > 0 && depthM - prev <= T.RELAY_CLEAR_AFTER);
  }

  /** A boulder (existing) arriving within m metres of this depth? */
  boulderNear(arrivalM, m) {
    const d = this.state.depth;
    return this.obstacles.list.some((o) => Math.abs(d + (L.DRILL_TIP_Y - o.sprite.y - o.size.r) / T.PX_PER_METER - arrivalM) < m);
  }

  get blastTime() { return T.BLAST_TIME * this.state.mods.blastTimeMul; }
  get relayNumber() { return this.state.relays + 1; }

  // ---- relays (M1) -----------------------------------------------------------
  arriveAtRelay() {
    const s = this.state;
    s.anchor();
    this.director.clearAll();
    // relay crews empty the drill's hopper straight into the hold (a free safe point)
    if (s.hopper > 0.01) { const u = Math.round(s.hopper), cr = s.transferHopper(); this.toast(`HOPPER UNLOADED: ${u} U, +${Math.floor(cr)} CR TO HOLD`, 0xd8b04a); }
    // the relay buys the siphon tank: it goes into the hold
    if (s.tank > 0.5) { const l = Math.round(s.tank), cr = s.sellTank(); this.toast(`SOLD ${l} L LIQUID: +${Math.floor(cr)} CR`, 0x4fe0c0); }
    else { s.tank = 0; s.tankCr = 0; }
    this.setHold(null); this.blastCharge = 0;
    this.boostChosen = false;
    this.offers = drawBoosts(T.BOOST_CHOICES, Math.random, this.forceOffers);
    this.cameras.main.shake(200, 0.008);
    this.toast(`RELAY ${this.relayNumber} ANCHORED`, 0x7fe0ff);
    logRadio(`C${this.contractNo} RELAY ${this.relayNumber}`, relayMessage(this.relayNumber));
    this.time.delayedCall(450, () => { if (!this.over) this.scene.launch('Relay'); });
  }

  chooseBoost(id) {
    if (this.boostChosen) return false;
    const b = this.offers.find((o) => o.id === id);
    if (!b) return false;
    const s = this.state;
    b.apply(s.mods, s);
    s.hull = Math.min(s.hull, s.maxHull);
    s.boosts.push(b.id);
    this.crew.speedMul = s.mods.crewSpeedMul;
    this.boostChosen = true;
    return true;
  }

  buyRepair(points) { return this.state.buyRepair(points); }

  pushOn() {
    const s = this.state;
    s.pushOn();
    this.relayWarned = false;
    this.scene.stop('Relay');
    this.toast(`SEGMENT ${s.relays + 1}: PAY X${s.payMult.toFixed(1)}`, 0x7fe0ff);
  }

  /** Winch up from a relay: the hold (and anything still in the hopper) + 10%. */
  cashOut() {
    const s = this.state;
    s.transferHopper();
    const haul = Math.floor(s.holdCr);
    const banked = Math.floor(s.holdCr * (1 + T.CASHOUT_BONUS));
    this.endRun({ reason: 'cashout', haul, bonus: banked - haul, banked, relays: s.relays + 1 });
  }

  endRun({ reason, haul, bonus = 0, recovery = 0, banked, relays, hopperLost = 0 }) {
    this.over = true;
    this.hold = null;
    setRunActive(false);
    this.state.throttle = 0; this.state.speed = 0;
    const depth = Math.floor(this.state.depth);
    const prevBest = loadBest();
    const newBest = depth > prevBest;
    if (newBest) saveBest(depth);
    const save = bankRun({ banked, reason, relays, depth, planet: this.planet });
    logRadio(`C${this.contractNo} ${reason === 'cashout' ? 'CASH-OUT' : 'BREAKAWAY'}`, reason === 'cashout' ? CASHOUT_LINE : BREAKAWAY_LINE);
    const st = this.state;
    // haul = the ship's HOLD at the end (what the bank sees); recovery = the drill write-off (lost runs)
    this.lastRun = { reason, depth, best: Math.max(depth, prevBest), newBest, haul, hold: haul, bonus, recovery, writeoff: recovery, hopperLost, banked, credits: save.credits, relays,
      spilled: Math.floor(st.spilledCr),
      ore: Math.floor(st.ore), liquid: Math.floor(st.liquid), pockets: st.pocketsTapped, scrap: Math.floor(st.scrap), drill: Math.floor(st.drillPay), veins: st.veinsWorked + st.veinsCollapsed, veinsLost: st.veinsLost, collapses: st.veinsCollapsed };
    this.scene.stop('Relay');
    // With cutscenes: a short in-run beat, then the ascent (bore -> space -> dock), and the
    // summary over the docked rig. ?anim=0: the old summary over the run.
    const next = () => {
      if (this.leftRun) return;
      this.leftRun = true;
      if (!ANIM) { this.scene.launch('GameOver', this.lastRun); return; }
      this.scene.stop('UI');
      this.scene.start('Cutscene', { kind: 'ascent', vehicle: reason === 'cashout' ? 'rig' : 'ship', style: this.breakState ? this.breakState.style : undefined, summary: this.lastRun });
    };
    if (reason === 'cashout') {
      this.cameras.main.fadeOut(ANIM ? 800 : 700, 0, 0, 0);
      this.time.delayedCall(ANIM ? 850 : 750, next);
    } else this.breakaway(next);
  }

  /**
   * [C] Drill lost: BREAKAWAY (replaces the escape pod). The clamps release, the umbilicals snap, the ship
   * backs off, flips and burns out down the bore; the wrecked drill is left sparking. Base 2.4 s x ANIM_SCALE
   * (?anim=0: a quick 1.2 s), tap to skip after the grace. Calls done() once.
   */
  breakaway(done) {
    const S = ANIM ? animScale : 0.5, d = (ms) => Math.round(ms * S), DU = L.DRILL_UNIT;
    const sh = this.ship, cam = this.cameras.main;
    this.view.set('outside', 0);
    this.scene.stop('UI');
    this.crew.sprite.setVisible(false);
    sh.sparks.emitting = false; sh.chips.emitting = false; sh.exhaust.emitting = false; sh.spillFx.emitting = false;
    sh.broken = true; sh.drillFx.clear();
    // the drill: dead, tinted, sparking where the cutterhead tore up
    sh.drill.setTint(0x6a5a5a); sh.drillBody.setTint(0x8a7a7a);
    this.boom.explode(50, 90, L.DRILL_TIP_Y + 8);
    cam.shake(d(450), 0.02); cam.flash(d(250), 255, 80, 40);
    this.wreckSparks = this.add.particles(0, 0, 'px', {
      speed: { min: 15, max: 60 }, angle: { min: 200, max: 340 }, gravityY: 140, lifespan: 450,
      tint: [0xffe27a, 0xff9a3d, 0xffffff], frequency: 70, quantity: 2,
    }).setDepth(20);
    this.wreckSparks.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(DU.x + 6, L.DRILL_TIP_Y + 4, DU.w - 12, 30) });
    // stand-in for the ship that can leave the bore: per-ship style (SHIPS.<id>.breakaway, ?breakaway= overrides)
    //   flip   : back off, turn 180 deg, burn out on the mains (light hulls; CORMORANT)
    //   reverse: retro jets on the face fire and it backs straight out, nose still to the drill (heavy / wide hulls)
    const style = breakawayStyle(), F = L.FACE, half = Math.round((L.SHIP_BOTTOM - F.y) / 2), cy = F.y + half;
    const ship = this.add.container(F.x, cy).setDepth(42);
    ship.add(hullImage(this, SHIP_TEX.hull, 0, F.y - cy));
    for (const o of sh.shipObjects()) o.setVisible(false);
    const plume = this.add.particles(0, 0, 'px2', {
      speed: { min: 10, max: 30 }, lifespan: 420, alpha: { start: 0.9, end: 0 }, scale: { start: 1.5, end: 3 },
      tint: [0xffd23f, 0xff8a3d, 0x7fe0ff], frequency: 18, emitting: false,
    }).setDepth(41);
    // retro jets (reverse): short blue-white jets off the mandible fronts, pointing at the drill
    const retro = this.add.particles(0, 0, 'px', {
      speedY: { min: -60, max: -30 }, speedX: { min: -6, max: 6 }, lifespan: 260, alpha: { start: 1, end: 0 },
      tint: [0xe6f8ff, 0x7fd0ff, 0x3a7ad9], frequency: 12, quantity: 2, emitting: false,
    }).setDepth(41);
    retro.addEmitZone({ type: 'random', source: { getRandomPoint: (pt) => { const x = Math.random() < 0.5 ? -19 : 19; pt.x = ship.x + x + (Math.random() - 0.5) * 10; pt.y = ship.y - half + 1; return pt; } } });
    const caption = this.add.bitmapText(90, 120, FONT_KEY, 'DRILL LOST: BREAKAWAY', 6).setOrigin(0.5).setTint(0xff4a4a).setDepth(50);
    const skip = this.add.bitmapText(176, 310, FONT_KEY, 'TAP TO SKIP', 6).setOrigin(1, 0).setTint(0x6a6278).setDepth(50).setAlpha(0);
    const B = this.breakState = { clamp: 0, snap: 0, ship, plume, retro, style, t0: this.time.now, done: false, maxRot: 0, retroOn: false, plumeOn: false };
    const lerp = (a, b, t) => a + (b - a) * t;
    const drawCoupling = () => {
      const g = sh.breakGfx.clear(), face = ship.y - half, attached = Math.abs(ship.rotation) < 0.4;
      B.maxRot = Math.max(B.maxRot, Math.abs(ship.rotation));
      // clamp arms swing open off the drill frame and fold back onto the hull (they ride with the ship)
      if (attached) for (const m of [1, -1]) {
        const rx = ship.x + m * 22, ry = face + 4;
        const jx = lerp(90 + m * 44, ship.x + m * 30, B.clamp), jy = lerp(215, face - 4, B.clamp);
        const ex = lerp(90 + m * 40, ship.x + m * 34, B.clamp), ey = lerp(230, face, B.clamp);
        g.lineStyle(3, 0x0c0b10, 1).lineBetween(rx, ry, ex, ey).lineBetween(ex, ey, jx, jy);
        g.lineStyle(1, 0x646b79, 1).lineBetween(rx, ry, ex, ey).lineBetween(ex, ey, jx, jy);
        g.fillStyle(0xd9822b, 1).fillRect(Math.round(jx) - 1, Math.round(jy) - 2, 3, 4);
      }
      // umbilicals: whole, then snapped (stubs whip on the drill, frayed ends on the ship)
      const hoses = [[61, 224, ship.x - 15, face + 6, 0xc9473c], [119, 224, ship.x + 15, face + 6, 0x4aa3c8]];
      for (const [x0, y0, x1, y1, c] of hoses) {
        if (B.snap < 1) g.lineStyle(2, c, 1).lineBetween(x0, y0, x1, y1);
        else {
          const wob = Math.sin(this.time.now / 60 + x0) * 3;
          g.lineStyle(2, c, 1).lineBetween(x0, y0, x0 + wob, y0 + 8);
          if (attached) g.lineStyle(2, c, 1).lineBetween(x1, y1, x1 - wob, y1 - 4);
        }
      }
      // conveyor chute torn off the collar
      if (B.snap >= 1) g.fillStyle(0x2a2e38, 1).fillRect(86, DU.collarBot, 8, 2);
    };
    B.draw = drawCoupling;
    drawCoupling();
    const at = (ms, fn) => this.time.delayedCall(d(ms), () => { if (!B.done) fn(); });
    at(150, () => this.tweens.add({ targets: B, clamp: 1, duration: d(300), ease: 'Back.easeOut', onUpdate: drawCoupling }));
    at(450, () => {
      B.snap = 1; drawCoupling();
      this.boom.explode(14, 61, 226); this.boom.explode(14, 119, 226);
      cam.shake(d(150), 0.01);
    });
    if (style === 'reverse') {
      // heavy: the retros light, it creeps off the collar, then backs out down the bore, gathering speed
      at(550, () => { retro.start(); B.retroOn = true; cam.shake(d(1200), 0.004); });
      at(600, () => this.tweens.add({ targets: ship, y: cy + 10, duration: d(800), ease: 'Sine.easeInOut', onUpdate: drawCoupling }));
      at(1400, () => this.tweens.add({ targets: ship, y: 440, duration: d(900), ease: 'Cubic.easeIn', onUpdate: drawCoupling }));
      at(2250, () => retro.stop());
    } else {
      const flip = SHIP.flipMs || 500;
      at(600, () => this.tweens.add({ targets: ship, y: cy + 18, duration: d(450), ease: 'Sine.easeOut', onUpdate: drawCoupling }));
      at(1050, () => this.tweens.add({ targets: ship, rotation: Math.PI, duration: d(flip), ease: 'Sine.easeInOut', onUpdate: drawCoupling }));
      at(1050 + flip, () => {
        plume.startFollow(ship, 0, -half); plume.start(); B.plumeOn = true;
        this.tweens.add({ targets: ship, y: 440, duration: d(Math.max(400, 1200 - flip)), ease: 'Quad.easeIn', onUpdate: drawCoupling });
      });
      at(2250, () => plume.stop());
    }
    const finish = () => { if (B.done) return; B.done = true; B.skipped = this.time.now - B.t0 < d(2400) - 5; B.ms = Math.round(this.time.now - B.t0); done(); };
    at(2400, finish);
    this.time.delayedCall(GRACE_MS, () => { if (!B.done) skip.setAlpha(1); });
    this.input.on('pointerdown', () => { if (this.time.now - B.t0 >= GRACE_MS) finish(); });
    this.tweens.add({ targets: caption, alpha: 0.3, duration: 300, yoyo: true, repeat: -1 });
  }

  /** Debug/test: put the run at a given depth (keeps haul). Jumping to 970 lands 30 m before relay 1. */
  debugJump(depthM) {
    const s = this.state;
    s.relays = Math.max(0, Math.floor((depthM - 1e-6) / T.RELAY_INTERVAL));
    s.distance = depthM * T.PX_PER_METER;
    for (const o of [...this.obstacles.list]) this.obstacles.destroy(o, false);
    for (const b of this.terrain.bands) b.sprite.destroy();
    this.terrain.bands = [];
    this.obstacles.nextAt = depthM + 10;
    this.nextHardCheck = depthM + T.HARD_CHECK_GAP;
    this.relayWarned = s.nextRelayAt - depthM <= T.RELAY_WARN;
    this.veins.clear();
    this.veins.nextAt = depthM + 40;
    this.pockets.clear();
    this.pockets.nextAt = depthM + 60;
  }

  drawRelayMarker(time) {
    const s = this.state, g = this.relayGfx.clear();
    const y = Math.round(L.DRILL_TIP_Y - (s.nextRelayAt - s.depth) * T.PX_PER_METER);
    const show = y > -10 && y <= L.DRILL_TIP_Y + 1;
    this.relayLabel.setVisible(show);
    if (!show) return;
    for (let x = 0; x < 180; x += 6) g.fillStyle(0x7fe0ff, 0.9).fillRect(x, y, 3, 1);
    g.fillStyle(0x7fe0ff, 0.25).fillRect(0, y + 1, 180, 1);
    if (s.anchored && Math.floor(time / 400) % 2 === 0) g.fillStyle(0xff4a4a, 1).fillRect(L.SHIP_X - 6, y + 2, 3, 3).fillRect(L.SHIP_X + L.SHIP_W + 3, y + 2, 3, 3);
    this.relayLabel.setText(`RELAY ${this.relayNumber}`).setPosition(4, y - 8);
  }

  // ---- commands (called by the UI scene) ----------------------------------
  /** True while the crew member is standing at the helm (not walking). */
  get piloted() { return !T.PILOT_REQUIRED || (this.crew && (this.state.mods.pilotRooms || ['helm']).includes(this.crew.station)); }
  /** Crew is on the way to the helm. */
  get pilotEnRoute() { return !this.piloted && this.crew.walking && this.crew.target === 'helm'; }

  // Throttle commands are ignored (with feedback) unless someone is at the helm.
  setThrottle(v) {
    if (!this.piloted) return this.lockedFeedback();
    this.state.setThrottle(v);
    this.director.onThrottle(this.state.throttle);
    return true;
  }
  resolveSurge(choice) { return this.director.resolveSurge(choice); }
  nudgeThrottle(d) { return this.setThrottle(this.state.throttle + d); }
  setThrottleFromUI(v) { return this.setThrottle(Math.max(0, Math.min(1, v))); }
  lockedFeedback() {
    const now = this.time.now;
    if (now - this.lockedPing > T.LOCK_TOAST_COOLDOWN) {
      this.toast(this.pilotEnRoute ? 'PILOT ON THE WAY...' : 'NO PILOT! TAP GO TO HELM', 0xff5a5a);
    }
    this.lockedPing = now;
    return false;
  }
  sendPilot() { this.onRoomTap('helm'); }
  toggleView() { this.setHold(null); this.view.toggle(); }
  setHold(action) { this.hold = action; if (action !== 'blast') this.blastCharge = 0; }
  onRoomTap(id) { this.setHold(null); this.crew.goTo(id); }
  toast(text, color = 0xffffff) { this.toasts.push({ text, color }); (this.toastLog ||= []).push(text); if (this.toastLog.length > 60) this.toastLog.shift(); }

  // Optional desktop keys: UP/DOWN or W/S throttle, SPACE/TAB view, 1-3 rooms, E hold primary action.
  setupKeyboard() {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-UP', () => this.nudgeThrottle(T.THROTTLE_STEP));
    kb.on('keydown-W', () => this.nudgeThrottle(T.THROTTLE_STEP));
    kb.on('keydown-DOWN', () => this.nudgeThrottle(-T.THROTTLE_STEP));
    kb.on('keydown-S', () => this.nudgeThrottle(-T.THROTTLE_STEP));
    kb.on('keydown-SPACE', () => this.toggleView());
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => kb.on('keydown-' + k, () => L.ROOMS[i] && this.onRoomTap(L.ROOMS[i].id)));
    kb.on('keydown-E', () => { const a = this.availableActions(); if (a.length) this.setHold(a.includes('extract') ? 'extract' : a[0]); });
    kb.on('keydown-Q', () => { if (this.crew.station === 'tools' && !this.state.mods.noBlast) this.setHold('blast'); });
    kb.on('keyup-E', () => this.setHold(null));
    kb.on('keyup-Q', () => this.setHold(null));
  }

  update(time, delta) {
    if (this.over) return;
    const dt = Math.min(delta, 50) / 1000;
    const s = this.state;
    s.lastDamage = 0;
    if (s.anchored) { // clamped in at a relay: nothing builds up, the world waits
      this.crew.working = false; this.ship.sparks.emitting = false;
      this.crew.update(dt);
      this.ship.update(dt, 0, false, {}, false, time);
      this.ship.drawDrill(s, dt, time);
      this.drawRelayMarker(time);
      return;
    }

    // --- terrain features ---------------------------------------------------
    s.inHard = this.terrain.tipInHard();
    if (s.depth >= this.nextHardCheck) {
      // hard bands arrive ~57-82 m ahead; keep them out of the relay approach window
      if (Math.random() < T.HARD_CHANCE && !this.inRelayWindow(s.depth + 57, 25)) this.terrain.spawnHardBand();
      this.nextHardCheck += T.HARD_CHECK_GAP;
    }

    // --- simulation ---------------------------------------------------------
    const { advancePx, events } = s.update(dt);
    this.terrain.scroll(advancePx, s.depth);
    const hadAhead = this.obstacles.anyAhead();
    const { blocked, rammed } = this.obstacles.update(dt, advancePx, time);
    s.blocked = blocked;
    if (events.includes('spike')) this.toast('COOLANT LEAK! HEAT UP', 0xff8a5c);
    if (events.includes('sparebit')) this.toast('SPARE BIT SWAPPED IN', 0x8affa0);
    if (!this.relayWarned && s.nextRelayAt - s.depth <= T.RELAY_WARN) { this.relayWarned = true; this.toast(RELAY_PING, 0x7fe0ff); }
    if (rammed) this.onRam(rammed);
    if (!hadAhead && this.obstacles.anyAhead()) this.toast('BOULDER AHEAD', 0xc9a7ff);

    // --- crew work ----------------------------------------------------------
    const room = this.crew.station;
    const canWork = this.hold && !this.crew.walking && this.availableActions().includes(this.hold);
    this.crew.working = !!canWork;
    let extracting = false, pumping = false;
    if (canWork) {
      if (this.hold === 'freebit') this.director.fixJam(dt);
      else if (this.hold === 'extract') extracting = true;
      else if (this.hold === 'pump') pumping = true;
      else if (this.hold === 'blast') {
        if (this.obstacles.target() && !s.mods.noBlast) {
          this.blastCharge += dt;
          if (this.blastCharge >= this.blastTime) {
            const n = s.mods.blastAll ? this.obstacles.blastAll() : (this.obstacles.blast() ? 1 : 0);
            if (s.mods.blastHeat) s.heat = Math.min(T.HEAT_MAX, s.heat + s.mods.blastHeat);
            this.blastCharge = 0;
            this.toast(n > 1 ? `${n} ROCKS CLEARED` : 'ROCK CLEARED', 0x8affa0);
          }
        } else { this.blastCharge = 0; this.crew.working = false; }
      } else {
        s.work(this.hold, dt);
      }
    }
    this.handleVeinEvents(this.veins.update(dt, advancePx, extracting, time), s);
    this.handlePocketEvents(this.pockets.update(dt, advancePx, pumping, time), s);
    this.director.update(dt);
    if (events.includes('overclockEnd')) this.toast('OVERCLOCK OVER', 0x9aa0b8);
    if (events.includes('restart')) this.toast('ENGINE BACK ONLINE', 0x8affa0);
    this.updateCalm(dt, s);
    const st = this.ship.room(this.crew.station || 'drill');
    this.ship.sparks.setPosition(st.stationX, st.stationY);
    this.ship.sparks.emitting = this.crew.working && this.hold !== 'pump';
    this.crew.update(dt);

    // --- alerts ---------------------------------------------------------------
    const alerts = this.alerts();
    this.ship.update(dt, s.speed, s.blocked, alerts, this.crew.working && this.hold === 'vent', time);
    this.ship.drawDrill(s, dt, time);
    this.edgeToast('heat', s.heat >= T.HEAT_ALERT, 'ENGINE RUNNING HOT', 0xff8a5c);
    this.edgeToast('over', s.overheated, 'OVERHEATING! DRILL DAMAGE', 0xff4a4a);
    this.edgeToast('wear', s.wear >= T.WEAR_ALERT, 'DRILL BIT WEARING OUT', 0xffc35c);
    this.edgeToast('worn', s.worn, 'BIT DESTROYED! DRILL DAMAGE', 0xff4a4a);
    this.edgeToast('hull', s.hull <= T.HULL_ALERT, 'DRILL INTEGRITY CRITICAL', 0xff4a7a);
    this.edgeToast('spill', s.spilling, 'HOPPER FULL: SPILLING! EASE OFF', 0xd8b04a);
    if (s.spilling && time - (this.lastSpillPop || 0) > 700) this.spillPop(time);
    this.edgeToast('hard', s.inHard, 'HARD ROCK: SLOW + HOT', 0x9ad0ff);
    const piloted = this.piloted;
    this.updateGovernor(piloted);
    if (piloted !== this.wasPiloted) {
      this.toast(piloted ? 'PILOT AT HELM: THROTTLE ON' : `NO PILOT: SPEED LOCKED ${Math.round(s.throttle * 100)}%`, piloted ? 0x8affa0 : 0xffc35c);
      this.wasPiloted = piloted;
    }

    this.drawRelayMarker(time);
    if (s.dead) this.gameOver();
    else if (events.includes('relay')) this.arriveAtRelay();
  }

  /** Full stop = calm: cues fade in (alarms dim, hull light steadies, dust settles) and back out on throttle-up. */
  updateCalm(dt, s) {
    const calm = s.calm;
    const k = calm ? 1 : 0, step = CALM.FADE * dt;
    this.calmK = this.calmK < k ? Math.min(k, this.calmK + step) : Math.max(k, this.calmK - step);
    if (calm && !this.wasCalm) this.settleT = CALM.SETTLE_S;
    this.wasCalm = calm;
    this.settleT = calm ? Math.max(0, this.settleT - dt) : 0;
    this.settle.emitting = this.settleT > 0.4;
    this.ship.calmK = this.calmK;
  }

  /** Hold-actions Holt can use right where he stands. */
  availableActions(room = this.crew.station) {
    if (!room) return [];
    const s = this.state, base = STATION_ACTIONS[room] || [];
    return base.filter((a) => (a !== 'extract' || (this.veins.stopped && !s.jammed && this.veins.stopped.taken < 1)) && (a !== 'freebit' || s.jammed)
      && (a !== 'pump' || this.pockets.canPump));
  }

  /** Stopped beside a pocket with tank room, and Holt isn't at the seat: offer GO TO SIPHON. */
  get siphonCall() {
    const p = this.pockets.stopped;
    return !!p && p.vol > 0.01 && !this.state.tankFull && this.crew.station !== 'siphon' && this.crew.target !== 'siphon';
  }

  handlePocketEvents(evs, s) {
    for (const e of evs) {
      const p = e.v, n = p.def.name, side = p.side === 'left' ? 'LEFT' : 'RIGHT';
      if (e.kind === 'appear') this.toast(`${n} POCKET ${side}: STOP BESIDE IT`, p.def.tint);
      else if (e.kind === 'window') this.toast(s.speed > 1e-6 ? 'POCKET AT THE PORT: FULL STOP!' : 'POCKET AT THE PORT', 0x8affa0);
      else if (e.kind === 'stopped') this.toast(s.tankFull ? 'TANK FULL: SELL AT A RELAY' : 'POCKET ALIGNED: PUMP AT SIPHON', s.tankFull ? 0xffc35c : 0x8affa0);
      else if (e.kind === 'moving') this.toast('MOVING: HOSE IN, PUMPING NEEDS A FULL STOP', 0xffc35c);
      else if (e.kind === 'pressure') this.toast('LINE PRESSURE HIGH: LET GO!', 0xff8a5c);
      else if (e.kind === 'burst') {
        this.toast(`LINE BURST! LOST ${Math.round(e.lost)} L`, 0xff4a4a);
        this.cameras.main.shake(200, 0.006);
        this.setHold(null);
      } else if (e.kind === 'drained') this.toast(`POCKET DRAINED: TANK ${Math.round(s.tank)} L`, 0xffd23f);
      else if (e.kind === 'full') { this.toast('TANK FULL: SELL AT A RELAY', 0xffc35c); this.setHold(null); }
      else if (e.kind === 'left') this.toast(`POCKET TAPPED: ${Math.round(p.pumped)} L`, 0xffd23f);
      else if (e.kind === 'missed') this.toast('POCKET MISSED', 0x9aa0b8);
    }
  }

  handleVeinEvents(evs, s) {
    for (const e of evs) {
      const v = e.v, n = v.def.name;
      if (e.kind === 'appear') this.toast(`${n} VEIN AHEAD: FULL STOP AT IT`, v.def.tint);
      else if (e.kind === 'window') this.toast(s.speed > ORE.STOP_SPEED ? 'VEIN AT THE DRILL: STOP NOW!' : 'AT THE VEIN', 0x8affa0);
      else if (e.kind === 'stopped') { this.toast('STOPPED AT VEIN: EXTRACT AT DRL', 0x8affa0); this.cameras.main.shake(120, 0.004); }
      else if (e.kind === 'moving') this.toast('MOVING: EXTRACTION NEEDS A FULL STOP', 0xffc35c);
      else if (e.kind === 'unstable') { this.toast('VEIN UNSTABLE: EASE OFF?', 0xff8a5c); this.cameras.main.shake(120, 0.003); }
      else if (e.kind === 'emptied') this.toast(`VEIN EMPTIED: +${Math.floor(v.credits)} CR TO HOPPER`, 0xffd23f);
      else if (e.kind === 'collapse') {
        this.toast(`VEIN COLLAPSED! -${Math.round(e.dmg)} DRILL, -${Math.floor(e.loss)} CR`, 0xff4a4a);
        this.cameras.main.shake(350, 0.016);
        this.setHold(null);
      } else if (e.kind === 'left') this.toast(`VEIN WORKED: +${Math.floor(v.credits)} CR ORE`, 0xffd23f);
      else if (e.kind === 'lost') this.toast(`VEIN LOST! SCRAP +${Math.floor(e.scrap)} CR`, 0xff8a5c);
    }
  }

  alerts() {
    const s = this.state, vein = this.veins.current;
    const veinStop = !!this.veins.stopped && this.veins.stopped.taken < 1;
    const pocket = this.pockets.current, pocketStop = this.pockets.canPump;
    return {
      engine: s.heat >= T.HEAT_ALERT,
      helm: (this.obstacles.anyAhead() && s.throttle > s.safeThrottle + 1e-6) || s.spilling || (!!vein && vein.state !== 'stopped' && this.veins.dist(vein) < 30 && s.throttle > 0)
        || (!!pocket && pocket.state !== 'stopped' && this.pockets.dist(pocket) < 30 && s.throttle > 0 && !s.tankFull),
      pilot: !this.piloted,
      drill: s.wear >= T.WEAR_ALERT || s.jammed || veinStop,
      tools: s.hull <= T.HULL_ALERT || this.obstacles.anyAhead(),
      hull: s.hull <= T.HULL_ALERT,
      rock: this.obstacles.anyAhead(),
      hard: s.inHard || this.terrain.hardAhead(),
      siphon: pocketStop,
      ore: !!vein,
      liq: !!pocket && !s.tankFull,
      spill: s.spilling,
      jam: s.jammed,
      surge: !!this.director.surge || s.overclockT > 0 || s.shutdownT > 0,
    };
  }

  /** Dead-man governor (helm part): no pilot + anything close ahead -> drop to safe speed.
   *  It stays tripped (and the throttle stays down) until Holt is back at the helm. */
  updateGovernor(piloted) {
    const s = this.state;
    if (!s.mods.governor) return;
    if (piloted) { if (this.governorTripped) { this.governorTripped = false; this.toast('GOVERNOR RESET', 0x8affa0); } return; }
    const ahead = this.obstacles.close() || this.terrain.hardAhead();
    if (ahead && s.throttle > s.safeThrottle + 1e-6) {
      s.throttle = Math.floor(s.safeThrottle * 10 + 1e-6) / 10;
      if (!this.governorTripped) this.toast('GOVERNOR TRIPPED: SAFE SPEED', 0xffc35c);
      this.governorTripped = true;
    }
  }

  edgeToast(key, on, text, color) {
    if (on && !this.flags[key]) this.toast(text, color);
    this.flags[key] = on;
  }

  onRam(dmg) {
    this.cameras.main.shake(220, 0.012);
    this.toast(`RAMMED! -${Math.round(dmg)} DRILL`, 0xff4a4a);
    const t = this.add.bitmapText(90, L.DRILL_TIP_Y - 10, FONT_KEY, `-${Math.round(dmg)}`, 12).setOrigin(0.5).setTint(0xff4a4a).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** Floating SPILL marker off the hopper while it overflows. */
  spillPop(time) {
    this.lastSpillPop = time;
    const t = this.add.bitmapText(90 + (Math.random() - 0.5) * 40, L.DRILL_UNIT.hopperTop - 2, FONT_KEY, 'SPILL', 6).setOrigin(0.5).setTint(0xd8b04a).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  /**
   * Drill integrity 0: the drill is lost. The hopper goes with it. Liquid in the ship's tank is sold into
   * the hold first; the lost drill comes out of your paycheck, so you keep 1/3 of the hold.
   */
  gameOver() {
    const s = this.state;
    if (s.tank > 0) s.sellTank();
    const hopperLost = Math.floor(s.hopperCr);
    s.hopper = 0; s.hopperCr = 0;
    const haul = Math.floor(s.holdCr);
    const banked = Math.floor(s.holdCr * T.HULL_LOSS_KEEP);
    this.endRun({ reason: 'lost', haul, recovery: haul - banked, banked, relays: s.relays, hopperLost });
  }
}
