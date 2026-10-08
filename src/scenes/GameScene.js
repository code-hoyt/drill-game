// The world: terrain, boulders, the ship and its crew. Owns the simulation.
import { TUNING as T, LAYOUT as L, ORE, EVENTS as E, loadBest, saveBest } from '../config.js';
import { Veins } from '../systems/Veins.js';
import { EventDirector } from '../systems/Events.js';
import { ShipSystems } from '../systems/ShipSystems.js';
import { Terrain } from '../systems/Terrain.js';
import { Obstacles } from '../systems/Obstacles.js';
import { Ship } from '../systems/Ship.js';
import { Crew } from '../systems/Crew.js';
import { ViewController } from '../systems/ViewController.js';
import { FONT_KEY } from '../systems/PixelFont.js';
import { drawBoosts } from '../data/boosts.js';
import { RELAY_PING, relayMessage, CASHOUT_LINE, POD_LINE } from '../data/dispatch.js';
import { bankRun, loadSave, logRadio, setRunActive } from '../systems/Save.js';
import { ANIM } from '../systems/Settings.js';

// Hold-actions per station. The HELM has none: its action area is the throttle itself.
// DRL also runs EXTRACT (stopped at a vein) and FREE THE BIT (jam); any burning room offers EXTINGUISH only.
export const STATION_ACTIONS = { engine: ['vent'], helm: [], drill: ['repair', 'extract', 'freebit'], tools: ['patch', 'blast'] };

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
    this.veins = new Veins(this, this.state);
    this.director = new EventDirector(this);
    this.obstacles.spawnFilter = (arrival) => !this.inRelayWindow(arrival, 0) && !this.veins.near(arrival, ORE.CLEAR_M);
    this.veins.spawnFilter = (arrival) => !this.inRelayWindow(arrival, 15) && !this.boulderNear(arrival, ORE.CLEAR_M);

    this.scene.launch('UI');
    this.setupKeyboard();

    // Debug/test hooks via URL: ?depth=950 starts the run at 950 m, ?boosts=plate,coolant,charge fixes relay offers.
    const q = new URLSearchParams(window.location.search);
    if (q.has('depth')) this.debugJump(Number(q.get('depth')) || 0);
    if (q.has('boosts')) this.forceOffers = q.get('boosts').split(',');
    // ?noevents=1: no random veins or events (tests / calm playtests). ?vein=small|rich|fine: one ~45 m ahead.
    // ?event=fire|jam|surge (fire:engine picks the room): triggered 1.5 s into the run.
    if (q.get('noevents') === '1') { this.veins.enabled = false; this.director.enabled = false; }
    if (q.has('vein') && ORE.TYPES[q.get('vein')]) this.veins.spawn(q.get('vein'), L.DRILL_TIP_Y - 45 * T.PX_PER_METER);
    if (q.has('event')) { const [type, arg] = q.get('event').split(':'); this.time.delayedCall(1500, () => { if (!this.over) this.director.trigger(type, arg); }); }
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

  cashOut() {
    const s = this.state;
    const haul = Math.floor(s.haul);
    const banked = Math.floor(s.haul * (1 + T.CASHOUT_BONUS));
    this.endRun({ reason: 'cashout', haul, bonus: banked - haul, banked, relays: s.relays + 1 });
  }

  endRun({ reason, haul, bonus = 0, recovery = 0, banked, relays }) {
    this.over = true;
    this.hold = null;
    setRunActive(false);
    this.state.throttle = 0; this.state.speed = 0;
    const depth = Math.floor(this.state.depth);
    const prevBest = loadBest();
    const newBest = depth > prevBest;
    if (newBest) saveBest(depth);
    const save = bankRun({ banked, reason, relays, depth, planet: this.planet });
    logRadio(`C${this.contractNo} ${reason === 'cashout' ? 'CASH-OUT' : 'POD'}`, reason === 'cashout' ? CASHOUT_LINE : POD_LINE);
    const st = this.state;
    this.lastRun = { reason, depth, best: Math.max(depth, prevBest), newBest, haul, bonus, recovery, banked, credits: save.credits, relays,
      ore: Math.floor(st.ore), scrap: Math.floor(st.scrap), drill: Math.floor(st.drillPay), veins: st.veinsWorked + st.veinsCollapsed, veinsLost: st.veinsLost, collapses: st.veinsCollapsed };
    this.scene.stop('Relay');
    // With cutscenes: a short in-run beat, then the ascent (bore -> space -> dock), and the
    // summary over the docked rig. ?anim=0: the old summary over the run.
    const next = () => {
      if (!ANIM) { this.scene.launch('GameOver', this.lastRun); return; }
      this.scene.stop('UI');
      this.scene.start('Cutscene', { kind: 'ascent', vehicle: reason === 'cashout' ? 'rig' : 'pod', summary: this.lastRun });
    };
    if (reason === 'cashout') {
      this.cameras.main.fadeOut(ANIM ? 800 : 700, 0, 0, 0);
      this.time.delayedCall(ANIM ? 850 : 750, next);
    } else {
      this.escapePod();
      this.time.delayedCall(ANIM ? 1600 : 1500, next); // the pod clears the screen at ~1.45 s
    }
  }

  escapePod() {
    this.view.set('outside');
    this.ship.sparks.emitting = false; this.ship.chips.emitting = false; this.ship.exhaust.emitting = false;
    this.boom.explode(60, 90, L.DRILL_TIP_Y + 10);
    this.ship.drill.setVisible(false);
    this.cameras.main.shake(500, 0.02);
    this.cameras.main.flash(300, 255, 80, 40);
    // the crew cab is the escape pod: it detaches and rides the bore back (down the screen)
    this.ship.exterior.setTint(0x6a4a4a);
    const pod = this.add.image(90, L.SHIP_TOP + 18, 'pod').setDepth(42).setScale(2);
    const trail = this.add.particles(0, 0, 'px2', {
      speed: { min: 5, max: 20 }, angle: { min: 250, max: 290 }, lifespan: 500, alpha: { start: 0.8, end: 0 },
      tint: [0xffd23f, 0xff6b3d, 0xcfcfdf], frequency: 25,
    }).setDepth(41);
    trail.startFollow(pod, 0, -6);
    // pop clear of the wreck, hang a beat, then ride the bore back down past the HUD
    this.tweens.chain({ targets: pod, tweens: [
      { y: L.SHIP_TOP - 14, duration: 320, delay: 150, ease: 'Back.easeOut' },
      { y: 420, duration: 800, delay: 180, ease: 'Quad.easeIn', onComplete: () => trail.stop() },
    ] });
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
    if (this.director.fires.helm) { if (this.time.now - this.lockedPing > T.LOCK_TOAST_COOLDOWN) this.toast('HELM ON FIRE: PUT IT OUT', 0xff6a3a); this.lockedPing = this.time.now; return false; }
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
    let extracting = false;
    if (canWork) {
      if (this.hold === 'extinguish') this.director.extinguish(room, dt);
      else if (this.hold === 'freebit') this.director.fixJam(dt);
      else if (this.hold === 'extract') extracting = true;
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
    this.director.update(dt);
    if (events.includes('overclockEnd')) this.toast('OVERCLOCK OVER', 0x9aa0b8);
    if (events.includes('restart')) this.toast('ENGINE BACK ONLINE', 0x8affa0);
    const st = this.ship.room(this.crew.station || 'drill');
    this.ship.sparks.setPosition(st.stationX, st.floorY - 9);
    this.ship.sparks.emitting = this.crew.working;
    this.crew.update(dt);

    // --- alerts ---------------------------------------------------------------
    const alerts = this.alerts();
    this.ship.update(dt, s.speed, s.blocked, alerts, this.crew.working && this.hold === 'vent', time);
    this.edgeToast('heat', s.heat >= T.HEAT_ALERT, 'ENGINE RUNNING HOT', 0xff8a5c);
    this.edgeToast('over', s.overheated, 'OVERHEATING! HULL DAMAGE', 0xff4a4a);
    this.edgeToast('wear', s.wear >= T.WEAR_ALERT, 'DRILL BIT WEARING OUT', 0xffc35c);
    this.edgeToast('worn', s.worn, 'BIT DESTROYED! HULL DAMAGE', 0xff4a4a);
    this.edgeToast('hull', s.hull <= T.HULL_ALERT, 'HULL CRITICAL', 0xff4a7a);
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

  /** Hold-actions Holt can use right where he stands (a burning room only offers EXTINGUISH). */
  availableActions(room = this.crew.station) {
    if (!room) return [];
    if (this.director.fires[room]) return ['extinguish'];
    const s = this.state, base = STATION_ACTIONS[room] || [];
    return base.filter((a) => (a !== 'extract' || (this.veins.stopped && !s.jammed && this.veins.stopped.taken < 1)) && (a !== 'freebit' || s.jammed));
  }

  handleVeinEvents(evs, s) {
    for (const e of evs) {
      const v = e.v, n = v.def.name;
      if (e.kind === 'appear') this.toast(`${n} VEIN AHEAD: FULL STOP AT IT`, v.def.tint);
      else if (e.kind === 'window') this.toast(s.speed > ORE.STOP_SPEED ? 'VEIN AT THE DRILL: STOP NOW!' : 'AT THE VEIN', 0x8affa0);
      else if (e.kind === 'stopped') { this.toast('STOPPED AT VEIN: EXTRACT AT DRL', 0x8affa0); this.cameras.main.shake(120, 0.004); }
      else if (e.kind === 'moving') this.toast('MOVING: EXTRACTION NEEDS A FULL STOP', 0xffc35c);
      else if (e.kind === 'tremor') { this.toast('TREMOR! VEIN UNSTABLE', 0xff8a5c); this.cameras.main.shake(160, 0.006); }
      else if (e.kind === 'emptied') this.toast(`VEIN EMPTIED: +${Math.floor(v.credits)} CR ORE`, 0xffd23f);
      else if (e.kind === 'collapse') {
        this.toast(`VEIN COLLAPSED! -${Math.round(e.dmg)} HULL, -${Math.floor(e.loss)} CR`, 0xff4a4a);
        this.cameras.main.shake(350, 0.016);
        this.setHold(null);
      } else if (e.kind === 'left') this.toast(`VEIN WORKED: +${Math.floor(v.credits)} CR ORE`, 0xffd23f);
      else if (e.kind === 'lost') this.toast(`VEIN LOST! SCRAP +${Math.floor(e.scrap)} CR`, 0xff8a5c);
    }
  }

  alerts() {
    const s = this.state, f = this.director.fires, vein = this.veins.current;
    const veinStop = !!this.veins.stopped && this.veins.stopped.taken < 1;
    return {
      engine: s.heat >= T.HEAT_ALERT || !!f.engine,
      helm: (this.obstacles.anyAhead() && s.throttle > s.safeThrottle + 1e-6) || !!f.helm || (!!vein && vein.state !== 'stopped' && this.veins.dist(vein) < 30 && s.throttle > 0),
      pilot: !this.piloted,
      drill: s.wear >= T.WEAR_ALERT || !!f.drill || s.jammed || veinStop,
      tools: s.hull <= T.HULL_ALERT || this.obstacles.anyAhead() || !!f.tools,
      hull: s.hull <= T.HULL_ALERT,
      rock: this.obstacles.anyAhead(),
      hard: s.inHard || this.terrain.hardAhead(),
      ore: !!vein,
      fire: this.director.burning.length > 0,
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
    this.toast(`RAMMED! -${Math.round(dmg)} HULL`, 0xff4a4a);
    const t = this.add.bitmapText(90, L.DRILL_TIP_Y - 10, FONT_KEY, `-${Math.round(dmg)}`, 12).setOrigin(0.5).setTint(0xff4a4a).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  gameOver() {
    const haul = Math.floor(this.state.haul);
    const banked = Math.floor(this.state.haul * T.HULL_LOSS_KEEP);
    this.endRun({ reason: 'lost', haul, recovery: haul - banked, banked, relays: this.state.relays });
  }
}
