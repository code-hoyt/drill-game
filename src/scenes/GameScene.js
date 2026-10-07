// The world: terrain, boulders, the ship and its crew. Owns the simulation.
import { TUNING as T, LAYOUT as L, loadBest, saveBest } from '../config.js';
import { ShipSystems } from '../systems/ShipSystems.js';
import { Terrain } from '../systems/Terrain.js';
import { Obstacles } from '../systems/Obstacles.js';
import { Ship } from '../systems/Ship.js';
import { Crew } from '../systems/Crew.js';
import { ViewController } from '../systems/ViewController.js';
import { FONT_KEY } from '../systems/PixelFont.js';

// Hold-actions per station. The HELM has none: its action area is the throttle itself.
export const STATION_ACTIONS = { engine: ['vent'], helm: [], drill: ['repair'], tools: ['patch', 'blast'] };

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.cameras.main.setBackgroundColor('#140e19');
    this.state = new ShipSystems();
    this.terrain = new Terrain(this);
    this.ship = new Ship(this, (id) => this.onRoomTap(id), () => this.view.set('inside'));
    this.crew = new Crew(this, this.ship, T.START_ROOM);
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

    this.scene.launch('UI');
    this.setupKeyboard();
  }

  // ---- commands (called by the UI scene) ----------------------------------
  /** True while the crew member is standing at the helm (not walking). */
  get piloted() { return !T.PILOT_REQUIRED || (this.crew && this.crew.station === 'helm'); }
  /** Crew is on the way to the helm. */
  get pilotEnRoute() { return !this.piloted && this.crew.walking && this.crew.target === 'helm'; }

  // Throttle commands are ignored (with feedback) unless someone is at the helm.
  setThrottle(v) { if (!this.piloted) return this.lockedFeedback(); this.state.setThrottle(v); return true; }
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
  toast(text, color = 0xffffff) { this.toasts.push({ text, color }); }

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
    kb.on('keydown-E', () => { const a = STATION_ACTIONS[this.crew.station]; if (a) this.setHold(a[0]); });
    kb.on('keydown-Q', () => { if (this.crew.station === 'tools') this.setHold('blast'); });
    kb.on('keyup-E', () => this.setHold(null));
    kb.on('keyup-Q', () => this.setHold(null));
  }

  update(time, delta) {
    if (this.over) return;
    const dt = Math.min(delta, 50) / 1000;
    const s = this.state;
    s.lastDamage = 0;

    // --- terrain features ---------------------------------------------------
    s.inHard = this.terrain.tipInHard();
    if (s.depth >= this.nextHardCheck) {
      if (Math.random() < T.HARD_CHANCE) this.terrain.spawnHardBand();
      this.nextHardCheck += T.HARD_CHECK_GAP;
    }

    // --- simulation ---------------------------------------------------------
    const { advancePx, events } = s.update(dt);
    this.terrain.scroll(advancePx, s.depth);
    const hadAhead = this.obstacles.anyAhead();
    const { blocked, rammed } = this.obstacles.update(dt, advancePx, time);
    s.blocked = blocked;
    if (events.includes('spike')) this.toast('COOLANT LEAK! HEAT UP', 0xff8a5c);
    if (rammed) this.onRam(rammed);
    if (!hadAhead && this.obstacles.anyAhead()) this.toast('BOULDER AHEAD', 0xc9a7ff);

    // --- crew work ----------------------------------------------------------
    const actions = STATION_ACTIONS[this.crew.station] || [];
    const canWork = this.hold && !this.crew.walking && actions.includes(this.hold);
    this.crew.working = !!canWork;
    if (canWork) {
      if (this.hold === 'blast') {
        if (this.obstacles.target()) {
          this.blastCharge += dt;
          if (this.blastCharge >= T.BLAST_TIME) { this.obstacles.blast(); this.blastCharge = 0; this.toast('ROCK CLEARED', 0x8affa0); }
        } else { this.blastCharge = 0; this.crew.working = false; }
      } else {
        s.work(this.hold, dt);
      }
    }
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
    if (piloted !== this.wasPiloted) {
      this.toast(piloted ? 'PILOT AT HELM: THROTTLE ON' : `NO PILOT: SPEED LOCKED ${Math.round(s.throttle * 100)}%`, piloted ? 0x8affa0 : 0xffc35c);
      this.wasPiloted = piloted;
    }

    if (s.dead) this.gameOver();
  }

  alerts() {
    const s = this.state;
    return {
      engine: s.heat >= T.HEAT_ALERT,
      helm: this.obstacles.anyAhead() && s.throttle > T.RAM_SAFE_SPEED, // boulder ahead, going too fast
      pilot: !this.piloted,
      drill: s.wear >= T.WEAR_ALERT,
      tools: s.hull <= T.HULL_ALERT || this.obstacles.anyAhead(),
      hull: s.hull <= T.HULL_ALERT,
      rock: this.obstacles.anyAhead(),
      hard: s.inHard || this.terrain.hardAhead(),
    };
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
    this.over = true;
    this.hold = null;
    const depth = Math.floor(this.state.depth);
    const prevBest = loadBest();
    const newBest = depth > prevBest;
    if (newBest) saveBest(depth);
    this.ship.sparks.emitting = false; this.ship.chips.emitting = false; this.ship.exhaust.emitting = false;
    this.boom.explode(60, 90, L.SHIP_TOP + 20);
    this.cameras.main.shake(500, 0.02);
    this.cameras.main.flash(300, 255, 80, 40);
    this.time.delayedCall(900, () => this.scene.launch('GameOver', { depth, best: Math.max(depth, prevBest), newBest }));
  }
}
