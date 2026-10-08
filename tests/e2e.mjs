// End-to-end test at a phone viewport (390x844, touch). Requires:
//   npm i playwright && npx playwright install chromium
//   python3 -m http.server 8765   (from the repo root)
// Usage: node e2e.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || new URL('../screenshots', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('GL Driver'))) errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const wait = (ms) => page.waitForTimeout(ms);
const G = (fn) => page.evaluate(`(() => { const g = __drill.scene.getScene('Game'); const s = g.state; const ui = __drill.scene.getScene('UI'); return (${fn}); })()`);
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await G(fn)) return true; await wait(100); } return false; };

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(1500);
const rect = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const sc = rect.w / 180;
const P = (gx, gy) => ({ x: rect.x + gx * sc, y: rect.y + gy * sc }); // base (180x320) coords -> page px
const tap = async (gx, gy) => { const p = P(gx, gy); await page.touchscreen.tap(p.x, p.y); };
const hold = async (gx, gy, ms) => {
  const p = P(gx, gy);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await wait(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
// world coords in the INSIDE view -> base coords (uses the game's own camera config)
let CAM = null, ROOMS = null;
const insideW = (wx, wy) => [(wx - CAM.x) * CAM.zoom + 90, (wy - CAM.y) * CAM.zoom + 160];
const tapRoom = (id) => { const r = ROOMS[id]; return tap(...insideW(r.cx, (r.ceil + r.floorY) / 2)); };
const TOGGLE = [24, 312], PILOT_BTN = [91, 312];
const O_PLUS = [167, 122], O_MINUS = [167, 284], O_TRACK = (v) => [167, 134 + 138 * (1 - v)];
const H_MINUS = [18, 268], H_PLUS = [162, 268], H_TRACK = (v) => [34 + 112 * v, 266];
const ACTION_FULL = [90, 268], ACTION_LEFT = [48, 268], ACTION_RIGHT = [132, 268];
const thr = () => G('s.throttle');
const near = (a, b) => Math.abs(a - b) < 0.011;

console.log('target', BASE, 'canvas', rect, 'scale', sc.toFixed(2));
check('build has HELM room', await page.evaluate(() => !!__drill.scene.getScene('Boot').textures.exists('st_helm')));
CAM = await page.evaluate(async () => (await import(new URL('src/config.js', location.href).href)).LAYOUT.INSIDE_CAM);
// ---- M2: title -> docked rig -> HELM contract board -> run ------------------------------
const D = (fn) => page.evaluate(`(() => { const d = __drill.scene.getScene('Dock'); const u = __drill.scene.getScene('DockUI'); return (${fn}); })()`);
const tapBtn = async (expr) => { const b = await D(`(() => { const b = ${expr}; return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })()`); if (!b) throw new Error('no button ' + expr); await tap(b.x, b.y); await wait(150); };
const dockMenu = () => D('u.menuKind');
const startContract = async () => {
  await tap(...insideW(66, 255)); // HELM room
  await page.waitForFunction(() => __drill.scene.getScene('DockUI').menuKind === 'helm', null, { timeout: 4000 });
  await tapBtn('u.btns.contract_kessa4'); await wait(700);
};
await tap(90, 160); await wait(800);
check('tap-to-start boards the docked rig (home base)', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('DockUI') && !__drill.scene.isActive('Game')));
await startContract();
check('game + UI scenes running after HELM -> ACCEPT CONTRACT', await page.evaluate(() => __drill.scene.isActive('Game') && __drill.scene.isActive('UI')));
check('run starts with crew at the HELM (piloted)', await G('g.crew.station === "helm" && g.piloted'));
ROOMS = await G('Object.fromEntries(g.ship.rooms.map(r => [r.id, { cx: r.cx, ceil: r.ceil, floorY: r.floorY }]))');

// ---- outside throttle while piloted --------------------------------------------
for (let i = 0; i < 3; i++) { await tap(...O_PLUS); await wait(120); }
check('outside + raises throttle when piloted', near(await thr(), 0.6), 'throttle=' + await thr());
await tap(...O_MINUS); await wait(100);
check('outside - lowers throttle when piloted', near(await thr(), 0.5), 'throttle=' + await thr());
await tap(...O_TRACK(0.8)); await wait(100);
check('outside slider sets throttle when piloted', near(await thr(), 0.8), 'throttle=' + await thr());
check('no lock shown while piloted', await G('!ui.vLock.visible && !ui.pilotBtn.visible && ui.pilotText.text === "PILOT AT HELM"'));

await waitFor('g.obstacles.list.some(o => o.sprite.y > 110)', 15000);
check('depth increases', (await G('s.depth')) > 5, 'depth=' + (await G('s.depth')).toFixed(1));
check('boulder obstacle spawned ahead', await G('g.obstacles.list.length > 0'));
check('heat & bit wear build while drilling', await G('s.heat > 0 && s.wear > 0'), await G('`heat=${s.heat.toFixed(1)} wear=${s.wear.toFixed(1)}`'));
await page.screenshot({ path: `${OUT}/01-outside-piloted.png` });

const hullBefore = await G('s.hull');
await waitFor(`s.hull < ${hullBefore}`, 12000);
check('ramming a boulder at speed drops hull', (await G('s.hull')) < hullBefore, `hull ${hullBefore.toFixed(1)} -> ${(await G('s.hull')).toFixed(1)}`);

// ---- inside view: helm action area -------------------------------------------------
await tap(...TOGGLE); await wait(900);
const cam = await G('({ mode: g.view.mode, zoom: g.cameras.main.zoom })');
check('view toggle -> inside (integer 2x zoom on ship)', cam.mode === 'inside' && cam.zoom === 2 && CAM.zoom === 2, JSON.stringify(cam));
check('whole ship fits on screen in inside view (below HUD, above station panel)', await G(`(() => { const v = g.cameras.main.worldView, z = g.cameras.main.zoom;
  return v.x <= 47 && v.right >= 133 && 218 >= v.y + 24 / z && 302 <= v.y + 232 / z; })()`), await G('JSON.stringify(g.cameras.main.worldView)'));
check('inside at helm shows throttle controls', await G('ui.hGfx.visible && ui.hPlus.visible && ui.hMinus.visible'));
await tap(...H_PLUS); await wait(100);
check('inside helm + raises throttle', near(await thr(), 0.9), 'throttle=' + await thr());
await tap(...H_MINUS); await wait(100);
check('inside helm - lowers throttle', near(await thr(), 0.8), 'throttle=' + await thr());
await tap(...H_TRACK(0.5)); await wait(100);
check('inside helm slider sets throttle', near(await thr(), 0.5), 'throttle=' + await thr());

// ---- 2x2 layout: per-route pathing ---------------------------------------------------
// Same-deck trips walk straight across (no climbing); cross-deck trips use one direct climb.
// Euler circuit over every ordered pair of rooms, starting and ending at the helm.
const ids = ['helm', 'drill', 'engine', 'tools'];
const edges = Object.fromEntries(ids.map((a) => [a, ids.filter((b) => b !== a)]));
const circuit = []; const stack = ['helm'];
while (stack.length) { const v = stack[stack.length - 1]; if (edges[v].length) stack.push(edges[v].shift()); else circuit.push(stack.pop()); }
circuit.reverse();
const DECK = { helm: 'top', drill: 'top', engine: 'bottom', tools: 'bottom' };
const FLOORS = await G('Object.values(g.ship.rooms.reduce((m, r) => (m[r.deck] = r.floorY, m), {}))');
const planned = await G(`(() => { const C = g.crew.constructor, out = {}; for (const a of g.ship.rooms) for (const b of g.ship.rooms) if (a !== b) {
  const pts = C.plan(g.ship, a.standX, a.floorY, b.id); let x = a.standX, y = a.floorY; const segs = [];
  for (const p of pts) { segs.push({ dx: p.x - x, dy: p.y - y }); x = p.x; y = p.y; }
  out[a.id + '>' + b.id] = { pts: pts.map(p => [p.x, p.y]), segs, len: C.pathLength(a.standX, a.floorY, pts) }; } return out; })()`);
const planOk = Object.entries(planned).map(([k, v]) => {
  const [a, b] = k.split('>');
  const climbs = v.segs.filter((sg) => sg.dy !== 0);
  const allOnFloors = v.pts.every(([, y]) => FLOORS.includes(y)); // no waypoint mid-ladder
  const ok = DECK[a] === DECK[b]
    ? climbs.length === 0 && v.pts.length === 1 && v.len === 32
    : climbs.length === 1 && Math.abs(climbs[0].dy) === Math.abs(FLOORS[0] - FLOORS[1]) && climbs[0].dx === 0 && allOnFloors && v.len === 60;
  return { k, ok, len: v.len };
});
check('same-deck plans: one straight walk, no climbing (32px)', planOk.filter((p) => DECK[p.k.split('>')[0]] === DECK[p.k.split('>')[1]]).every((p) => p.ok),
  planOk.filter((p) => DECK[p.k.split('>')[0]] === DECK[p.k.split('>')[1]]).map((p) => p.k + '=' + p.len).join(' '));
check('cross-deck plans: exactly one direct floor-to-floor climb, no mid stop (60px)', planOk.filter((p) => DECK[p.k.split('>')[0]] !== DECK[p.k.split('>')[1]]).every((p) => p.ok),
  planOk.filter((p) => DECK[p.k.split('>')[0]] !== DECK[p.k.split('>')[1]]).map((p) => p.k + '=' + p.len).join(' '));

await G('(s.throttle = 0, true)');
const trips = [];
for (let i = 1; i < circuit.length; i++) {
  await tapRoom(circuit[i]);
  await waitFor(`g.crew.station === "${circuit[i]}"`, 3000);
  const t = await G('g.crew.lastTrip');
  trips.push({ ...t, ok: t && t.from === circuit[i - 1] && t.to === circuit[i], same: DECK[circuit[i - 1]] === DECK[circuit[i]] });
  await wait(60);
}
const pairs = new Set(trips.map((t) => t.from + '>' + t.to));
check('walked all 12 ordered trips by tapping rooms', trips.length === 12 && pairs.size === 12 && trips.every((t) => t.ok), [...pairs].join(' '));
const same = trips.filter((t) => t.same), cross = trips.filter((t) => !t.same);
check('walked same-deck trips: no climbing at all', same.length === 4 && same.every((t) => t.climb === 0 && Math.abs(t.walk - 32) < 0.1), JSON.stringify(same.map((t) => [t.from + '>' + t.to, t.walk, t.climb])));
check('walked cross-deck trips: one 28px climb + 32px walk', cross.length === 8 && cross.every((t) => Math.abs(t.climb - 28) < 0.1 && Math.abs(t.walk - 32) < 0.1), JSON.stringify(cross.map((t) => [t.from + '>' + t.to, t.walk, t.climb])));
const rng = (a) => [Math.round(Math.min(...a.map((t) => t.ms))), Math.round(Math.max(...a.map((t) => t.ms)))];
const [sMin, sMax] = rng(same), [cMin, cMax] = rng(cross);
check('same-deck trip time ~0.6-0.8 s', sMin >= 600 && sMax <= 800, `${sMin}-${sMax}ms`);
check('cross-deck trip time <= ~1.1 s', cMax <= 1120 && cMin > sMax, `${cMin}-${cMax}ms`);
console.log(`TRIP TIMES  same-deck ${sMin}-${sMax}ms  cross-deck ${cMin}-${cMax}ms`);
check('crew back at helm after the circuit', await G('g.crew.station === "helm" && g.piloted'));

// retargeting
const waitClimbing = () => page.waitForFunction(() => { const c = __drill.scene.getScene('Game').crew; return c.climbing && c.sprite.y > 270 && c.sprite.y < 294; }, null, { polling: 'raf', timeout: 3000 });
const crewState = () => G('({ path: g.crew.path.map(p => [Math.round(p.x), Math.round(p.y)]), target: g.crew.target, x: +g.crew.sprite.x.toFixed(1), y: +g.crew.sprite.y.toFixed(1) })');
// a) mid-climb down, retarget to a top-deck room -> reverse straight up, then walk out
await tapRoom('tools'); await waitClimbing();
await tapRoom('drill'); await wait(20);
let re = await crewState();
check('mid-climb retarget to the deck he left: reverses straight up', re.target === 'drill' && JSON.stringify(re.path.slice(-2)) === '[[90,268],[106,268]]' && re.path.length <= 2, JSON.stringify(re));
await waitFor('g.crew.station === "drill"', 3000);
check('...and arrives at DRL', await G('g.crew.station === "drill"'));
// b) mid-climb down, retarget to the other bottom room -> continue down, walk out
await tapRoom('tools'); await waitClimbing();
await tapRoom('engine'); await wait(20);
re = await crewState();
check('mid-climb retarget to the deck ahead: finishes the climb, walks out', re.target === 'engine' && JSON.stringify(re.path.slice(-2)) === '[[90,296],[74,296]]' && re.path.length <= 2, JSON.stringify(re));
await waitFor('g.crew.station === "engine"', 3000);
check('...and arrives at ENG', await G('g.crew.station === "engine"'));
// c) mid-walk across the bottom deck, retarget to a top room -> back/over to the ladder, one climb
await tapRoom('tools'); await wait(150);
await tapRoom('helm'); await wait(20);
re = await crewState();
check('mid-walk retarget to other deck: ladder then one direct climb', re.target === 'helm' && JSON.stringify(re.path) === '[[90,296],[90,268],[74,268]]', JSON.stringify(re));
await waitFor('g.crew.station === "helm"', 3000);
// d) same-deck change of mind walks straight back
await tapRoom('drill'); await wait(120);
await tapRoom('helm'); await wait(20);
check('mid-walk retarget back on the same deck walks straight back', await G('g.crew.path.length === 1 && g.crew.target === "helm" && g.crew.path[0].y === 268'));
await waitFor('g.crew.station === "helm"', 2000);
// get to tools so the next block (which starts with tapRoom('helm')) is unchanged
await tapRoom('tools'); await waitFor('g.crew.station === "tools"', 3000);
await waitFor('g.crew.station === "tools"', 2000);
await tapRoom('helm'); await waitFor('g.crew.station === "helm"', 3000);
await G('(g.setThrottle(0.5), true)');
await page.screenshot({ path: `${OUT}/03-inside-helm.png` });

// ---- leave the helm: speed holds, throttle locks -------------------------------------
await tapRoom('engine'); await wait(200);
check('leaving helm -> unpiloted immediately', await G('!g.piloted && g.crew.walking && g.crew.target === "engine"'));
await waitFor('g.crew.station === "engine"', 3000);
check('crew arrives at Engine station', await G('g.crew.station === "engine"'));
check('helm controls hidden away from helm', await G('!ui.hGfx.visible'));
check('NO PILOT button shown inside', await G('ui.pilotBtn.visible'));
check('speed held at last setting after leaving helm', near(await thr(), 0.5), 'throttle=' + await thr());

// stations still work
await G('(s.heat = 90, true)');
let h0 = await G('s.heat'); await hold(...ACTION_FULL, 1200); let h1 = await G('s.heat');
check('holding VENT at Engine lowers heat', h1 < h0 - 15, `heat ${h0.toFixed(1)} -> ${h1.toFixed(1)}`);
await G('(s.wear = 80, true)');
await tapRoom('drill'); await waitFor('g.crew.station === "drill"', 3000);
check('crew walks to Drill station', await G('g.crew.station === "drill"'));
const w0 = await G('s.wear'); await hold(...ACTION_FULL, 1000); const w1 = await G('s.wear');
check('holding FIX BIT at Drill lowers wear', w1 < w0 - 20, `wear ${w0.toFixed(1)} -> ${w1.toFixed(1)}`);
await G('(s.hull = 50, true)');
await tapRoom('tools'); await waitFor('g.crew.station === "tools"', 3000);
check('crew walks to Tools station', await G('g.crew.station === "tools"'));
const p0 = await G('s.hull'); await hold(...ACTION_LEFT, 1000); const p1 = await G('s.hull');
check('holding PATCH at Tools restores hull', p1 > p0 + 6, `hull ${p0.toFixed(1)} -> ${p1.toFixed(1)}`);
// park every boulder far ahead except a marked test boulder, which is the closest -> BLAST target
await G('(g.obstacles.list.forEach(o => o.sprite.y = Math.min(o.sprite.y, 40)), g.obstacles.spawn(s.depth), window.__testRock = g.obstacles.list[g.obstacles.list.length-1], __testRock.sprite.y = 120, true)');
await wait(100);
const n0 = await G('g.obstacles.list.length'); await hold(...ACTION_RIGHT, 1600);
const gone = await G('!g.obstacles.list.includes(window.__testRock)');
check('holding BLAST at Tools clears the nearest boulder', gone, `boulders ${n0} -> ${await G('g.obstacles.list.length')}`);
await G('(s.heat = 95, s.wear = 95, s.hull = 20, g.obstacles.spawn(s.depth), g.obstacles.list.at(-1).sprite.y = 60, true)'); await wait(200);
const bub = await G(`g.ship.rooms.map(r => { const b = g.ship.bubbles[r.id]; return { id: r.id, vis: b.visible, inRoom: b.x > r.x && b.x < r.x + r.w && b.y > r.ceil && b.y < r.floorY }; })`);
check("'!' bubbles show over the correct room for all 4 stations", bub.every((b) => b.vis && b.inRoom), JSON.stringify(bub));
await G('(s.hull = 60, true)');
await G('(s.heat = 0, s.wear = 0, true)');

// ---- outside with no pilot: locked throttle ------------------------------------------
await tap(...TOGGLE); await wait(900);
check('view toggle -> outside', await G('g.view.mode === "outside" && Math.abs(g.cameras.main.zoom - 1) < 0.01'));
check('outside shows lock / NO PILOT while unpiloted', await G('ui.vLock.visible && ui.vLockText2.visible && ui.pilotBtn.visible && ui.speedLock.visible'));
await G('(g.toasts.length = 0, true)');
await tap(...O_PLUS); await wait(150);
check('outside + ignored when no pilot', near(await thr(), 0.5), 'throttle=' + await thr());
await tap(...O_MINUS); await wait(150);
check('outside - ignored when no pilot', near(await thr(), 0.5), 'throttle=' + await thr());
await tap(...O_TRACK(0.9)); await wait(150);
check('outside slider ignored when no pilot', near(await thr(), 0.5), 'throttle=' + await thr());
check('locked tap gives feedback (toast + flash)', await G('ui.toastText.visible && ui.toastText.text.includes("PILOT") && (g.time.now - g.lockedPing) < 1500'), await G('ui.toastText.text'));
await wait(1200);
check('actual speed holds at locked setting', near(await G('s.speed'), 0.5), 'speed=' + (await G('s.speed')).toFixed(2));
await page.screenshot({ path: `${OUT}/02-outside-no-pilot.png` });

// one-tap shortcut
await tap(...PILOT_BTN); await wait(200);
check('GO TO HELM shortcut sends crew to helm', await G('g.crew.target === "helm" && g.pilotEnRoute && ui.pilotText.text.includes("EN ROUTE")'));
await waitFor('g.piloted', 4000);
check('crew reaches helm -> piloted again', await G('g.piloted && g.crew.station === "helm"'));
await tap(...O_PLUS); await wait(120);
check('outside throttle works again once piloted', near(await thr(), 0.6), 'throttle=' + await thr());

// ---- hull loss: escape pod, keep 1/3 ---------------------------------------------------
await G('(s.haul = 300, true)');
await G('(s.hull = 6, s.heat = 100, s.wear = 100, true)');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 8000 }).catch(() => {});
await wait(600);
const go = await page.evaluate(() => ({ active: __drill.scene.isActive('GameOver'), best: localStorage.getItem('drill.bestDepth'), save: JSON.parse(localStorage.getItem('drill.save') || 'null') }));
const finalDepth = Math.floor(await G('s.depth'));
const lostRun = await G('g.lastRun');
check('hull 0 -> end screen (RIG LOST)', go.active && lostRun.reason === 'lost', JSON.stringify(lostRun));
check('best depth saved to localStorage', Number(go.best) === finalDepth, `best=${go.best} depth=${finalDepth}`);
check('hull loss banks 1/3 of the haul (floor)', lostRun.banked === Math.floor(lostRun.haul / 3) && go.save && go.save.credits === lostRun.banked && go.save.rigsLost === 1,
  `haul=${lostRun.haul} banked=${lostRun.banked} save=${JSON.stringify(go.save)}`);
check('escape pod launched (drill gone, pod sprite)', await G('!g.ship.drill.visible && g.children.list.some(c => c.texture && c.texture.key === "pod")'));
await page.screenshot({ path: `${OUT}/04-game-over.png` });
await tap(90, 249); await wait(1000);
check('end screen -> BACK TO THE RIG docks at the station', await page.evaluate(() => __drill.scene.isActive('Dock') && !__drill.scene.isActive('Game') && !__drill.scene.isActive('UI')));
await startContract();
const after = await G('({ depth: s.depth, hull: s.hull, haul: s.haul, over: g.over, ui: __drill.scene.isActive("UI"), go: __drill.scene.isActive("GameOver"), helm: g.crew.station, piloted: g.piloted })');
check('next contract: fresh run, crew back at helm, haul reset', !after.over && after.hull === 100 && after.haul < 5 && Math.abs(after.haul - after.depth) < 0.01 && after.depth < 5 && after.ui && !after.go && after.helm === 'helm' && after.piloted, JSON.stringify(after));
await tap(...O_PLUS); await wait(120);
check('throttle works after restart', near(await thr(), 0.4), 'throttle=' + await thr());
check('UI best label shows saved best', (await G('ui.bestText.text')).includes(go.best));

// ---- M1: relay breaks ------------------------------------------------------------------
const T = await page.evaluate(async () => (await import(new URL('src/config.js', location.href).href)).TUNING);
const relayActive = () => page.evaluate(() => __drill.scene.isActive('Relay'));
const R = (fn) => page.evaluate(`(() => { const r = __drill.scene.getScene('Relay'); const g = __drill.scene.getScene('Game'); const s = g.state; return (${fn}); })()`);
// earn some haul at x1.0 on the way
const pay0 = await G('(() => { const h = s.haul, d = s.distance; return { h, d }; })()');
await wait(800);
const pay1 = await G('({ h: s.haul, d: s.distance })');
const m0 = (pay1.d - pay0.d) / T.PX_PER_METER;
check('haul accrues at metres x 1.0 in segment 1', m0 > 0.5 && Math.abs((pay1.h - pay0.h) - m0 * T.PAY_PER_METER) < 0.01, `+${m0.toFixed(2)}m -> +${(pay1.h - pay0.h).toFixed(2)}cr`);
check('HUD shows haul + pay rate', (await G('ui.haulText.text')).endsWith(' CR') && (await G('ui.payText.text')) === 'PAY X1.0', await G('ui.haulText.text + " / " + ui.payText.text'));
await G('(g.debugJump(930), g.forceOffers = ["plate", "coolant", "charge"], g.obstacles.spawnLog.length = 0, s.haul = 400, s.heat = 20, s.wear = 40, s.hull = 55, g.setThrottle(0.9), g.toasts.length = 0, true)');
check('debug jump to 930 m', Math.abs((await G('s.depth')) - 930) < 2 && (await G('s.nextRelayAt')) === T.RELAY_INTERVAL);
await waitFor('g.relayWarned', 6000);
check('Ines relay warning ~50 m before the relay', await G('g.relayWarned && s.depth >= s.nextRelayAt - T.RELAY_WARN - 1'.replace('T.RELAY_WARN', T.RELAY_WARN)), 'depth=' + (await G('s.depth')).toFixed(1));
const warnSeen = await G('ui.toastText.text.includes("RELAY") || g.toasts.some(t => t.text.includes("RELAY"))');
check('warning shown as a toast', warnSeen, await G('ui.toastText.text'));
const heatBefore = await G('s.heat');
const preRelayThrottle = await thr();
await page.waitForFunction(() => __drill.scene.isActive('Relay'), null, { timeout: 20000 }).catch(() => {});
const arr = await G('({ depth: s.depth, anchored: s.anchored, heat: s.heat, wear: s.wear, speed: s.speed, throttle: s.throttle, log: g.obstacles.spawnLog.slice(), ahead: g.obstacles.list.filter(o => o.sprite.y > 100).length, bands: g.terrain.bands.length })');
check('arrives exactly at relay 1 (1000 m) and clamps in', arr.depth === 1000 && arr.anchored && arr.speed === 0 && arr.throttle === 0, JSON.stringify(arr));
check('free service: heat and bit wear reset to 0', arr.heat === 0 && arr.wear === 0, `heat was ${heatBefore.toFixed(1)}`);
check('approach was boulder-free (no spawns arriving 950-1030 m, none at the tip)', arr.log.every((d) => d < 1000 - T.RELAY_WARN || d >= 1000 + T.RELAY_CLEAR_AFTER) && arr.ahead === 0, 'spawnLog=' + JSON.stringify(arr.log));
const d0 = await G('s.depth'); await wait(600);
check('sim paused while anchored (no drift, no heat)', (await G('s.depth')) === d0 && (await G('s.heat')) === 0);
check('relay scene: header + 3 random supply offers', (await R('r.n === 1 && r.cards.length === 3 && new Set(g.offers.map(o => o.id)).size === 3')), await R('g.offers.map(o => o.id).join(",")'));
await wait(2600);
const typed = await R('({ done: r.typingDone, text: r.lineTexts.map(t => t.text).join(" ") })');
check('Ines dispatch types out in full', typed.done && typed.text.startsWith('RELAY ONE IS LIVE'), typed.text);
await page.screenshot({ path: `${OUT}/05-relay-boost-choice.png` });
// tap the PLATE KIT card (first card: y 120..154)
const hull0 = await G('s.hull');
await tap(90, 137); await wait(700);
const bo = await G('({ boosts: s.boosts, max: s.maxHull, hull: s.hull, bonus: s.mods.maxHullBonus })');
check('picking a supply applies it (PLATE KIT: +15 max hull, +15 hull)', bo.boosts.join() === 'plate' && bo.max === 115 && Math.abs(bo.hull - (hull0 + 15)) < 0.01, JSON.stringify(bo));
check('only one supply per relay', (await G('g.chooseBoost("coolant")')) === false && (await G('s.boosts.length')) === 1);
check('break screen phase shown after pick', (await R('r.phase')) === 'main');
check('HUD hull bar uses boosted max', (await G('s.maxHull')) === 115);
// repair: +10 at 4 cr/pt
const rp0 = await G('({ haul: s.haul, hull: s.hull, per: s.repairCostPerPoint })');
await tap(48, 166); await wait(250);
const rp1 = await G('({ haul: s.haul, hull: s.hull })');
check('relay 1 hull costs 4 cr/pt; +10 hull costs 40 from the haul', rp0.per === 4 && Math.abs(rp1.hull - rp0.hull - 10) < 0.01 && Math.abs(rp0.haul - rp1.haul - 40) < 0.01, `${JSON.stringify(rp0)} -> ${JSON.stringify(rp1)}`);
await page.screenshot({ path: `${OUT}/06-relay-break.png` });
// PUSH ON (with Holt away from the helm: the restored setting doesn't depend on where he stands)
await G('(g.onRoomTap("engine"), true)');
await waitFor('g.crew.station === "engine"', 3000);
check('Holt walked to ENG while clamped in (unpiloted)', await G('g.crew.station === "engine" && !g.piloted'));
await tap(48, 277); await wait(400);
const po = await G('({ relays: s.relays, mult: s.payMult, anchored: s.anchored, next: s.nextRelayAt, relay: __drill.scene.isActive("Relay"), throttle: s.throttle, speed: s.speed })');
check('PUSH ON: break closes, pay rises to x1.5, next relay 2000 m', po.relays === 1 && po.mult === 1.5 && !po.anchored && po.next === 2000 && !po.relay, JSON.stringify(po));
check('PUSH ON restores the pre-relay throttle setting', near(po.throttle, preRelayThrottle), `pre=${preRelayThrottle} now=${po.throttle}`);
const sp = [];
for (let i = 0; i < 4; i++) { sp.push(await G('s.speed')); await wait(250); }
check('speed ramps up from the stop (no jump)', po.speed < 0.35 && sp.every((v, i) => i === 0 || v > sp[i - 1]) && sp[0] < po.throttle - 0.1,
  `at push ${po.speed.toFixed(3)}; then ${sp.map((v) => v.toFixed(3)).join(' > ')}`);
check('HUD pay rate updated', (await G('ui.payText.text')) === 'PAY X1.5');
await tap(...PILOT_BTN); await waitFor('g.piloted', 4000);
await tap(...O_MINUS); await tap(...O_MINUS); await wait(200);
check('helm throttle works again after push on', near(await thr(), preRelayThrottle - 0.2), 'throttle=' + await thr());
await wait(800);
const q0 = await G('({ h: s.haul, d: s.distance })'); await wait(1000); const q1 = await G('({ h: s.haul, d: s.distance })');
const m1 = (q1.d - q0.d) / T.PX_PER_METER;
check('run continues; haul accrues at metres x 1.5', m1 > 1 && Math.abs((q1.h - q0.h) - m1 * 1.5) < 0.01, `+${m1.toFixed(2)}m -> +${(q1.h - q0.h).toFixed(2)}cr`);
check('approach clear after relay: no spawns arriving 1000-1030 m', (await G('g.obstacles.spawnLog')).every((d) => d < 950 || d >= 1030), JSON.stringify(await G('g.obstacles.spawnLog')));
// relay 2: repair price rises, then CASH OUT
await G('(g.debugJump(1985), g.forceOffers = null, g.setThrottle(1), s.hull = 50, true)');
await page.waitForFunction(() => __drill.scene.isActive('Relay'), null, { timeout: 15000 }).catch(() => {});
check('arrives at relay 2 (2000 m)', (await G('s.depth')) === 2000 && (await G('s.anchored')) && (await R('r.n')) === 2);
check('relay 2 hull costs 6 cr/pt (x1.5 per relay)', (await G('s.repairCostPerPoint')) === 6);
await R('r.skipTyping()'); await wait(200);
const offerIds = await G('g.offers.map(o => o.id)');
await tap(90, 177); await wait(700);  // second card
check('relay 2 offers are a random 3 and the pick stacks', offerIds.length === 3 && (await G('s.boosts.length')) === 2 && (await G('s.boosts[1]')) === offerIds[1], offerIds.join(','));
const before = await G('({ haul: s.haul, credits: JSON.parse(localStorage.getItem("drill.save")).credits })');
await tap(132, 277); await wait(1500);
const co = await page.evaluate(() => ({ go: __drill.scene.isActive('GameOver'), relay: __drill.scene.isActive('Relay'), run: __drill.scene.getScene('Game').lastRun, save: JSON.parse(localStorage.getItem('drill.save')), best: localStorage.getItem('drill.bestDepth') }));
check('CASH OUT: end screen shows CASHED OUT', co.go && !co.relay && co.run.reason === 'cashout', JSON.stringify(co.run));
check('cash out banks the full haul + 10% (floor)', co.run.banked === Math.floor(before.haul * 1.1) && co.run.haul === Math.floor(before.haul) && co.run.bonus === co.run.banked - co.run.haul,
  `haul=${before.haul.toFixed(2)} banked=${co.run.banked}`);
check('credits persisted in localStorage (drill.save)', co.save.credits === before.credits + co.run.banked && co.save.cashouts === 1 && co.save.runs === 2, JSON.stringify(co.save));
check('best depth 2000 saved on cash out', co.best === '2000' && co.run.newBest);
await page.screenshot({ path: `${OUT}/07-cash-out.png` });
// ---- M2: back to the docked rig -----------------------------------------------------------
const stockBefore = co.save.vendor.stock.join();
await tap(90, 249); await wait(1000);
check('full loop: cash out -> end screen -> docked rig', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('DockUI') && !__drill.scene.isActive('Game') && !__drill.scene.isActive('GameOver')));
const sv1 = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('vendor stock refreshed after each contract (refresh count = runs)', sv1.vendor.refreshes === sv1.runs && sv1.vendor.rerolls === 0, `refreshes=${sv1.vendor.refreshes} runs=${sv1.runs}`);
check('Ines radio log kept for HELM replay', sv1.radio.some((r) => r.tag.includes('RELAY 1') && r.text.startsWith('RELAY ONE')) && sv1.radio.some((r) => r.tag.includes('CASH-OUT')), JSON.stringify(sv1.radio.map((r) => r.tag)));
// navigation: Holt walks to each room/prop, the right menu opens on arrival
const navTo = async (pt, kind, ms = 4000) => { await tap(...pt); await page.waitForFunction((k) => __drill.scene.getScene('DockUI').menuKind === k, kind, { timeout: ms }).catch(() => {}); return dockMenu(); };
const closeMenu = async () => { await tapBtn('u.btns.close'); };
check('tap ENG -> Holt walks there -> engine slot', (await navTo(insideW(56, 280), 'slot')) === 'slot' && (await D('u.menuArg')) === 'engine' && (await D('d.crew.station')) === 'engine');
await closeMenu();
check('tap the cot -> stats (Holt\'s log)', (await navTo(insideW(74.5, 291), 'stats')) === 'stats');
await page.screenshot({ path: `${OUT}/11-stats.png` });
check('stats show runs, relays, credits earned, best', await D(`u.menu.some(t => t.text === "${sv1.totalEarned} CR") && u.menu.some(t => t.text === "2000M") && u.menu.some(t => t.text === "RELAYS REACHED")`));
await closeMenu();
check('tap the DRL shelf -> codex stub', (await navTo(insideW(105, 253), 'codex')) === 'codex' && (await D('d.crew.station')) === 'codex');
await closeMenu();
check('tap TLS -> tools bench (Tools / Hull / Kit slots)', (await navTo(insideW(116, 280), 'tools')) === 'tools' && (await D('!!(u.btns.slot_tools && u.btns.slot_hull && u.btns.slot_kit)')));
await closeMenu();
check('tap HELM -> contract board + radio replay + helm slot', (await navTo(insideW(66, 255), 'helm')) === 'helm' && (await D('!!(u.btns.contract_kessa4 && u.btns.slot_helm) && u.menu.some(t => t.text && t.text.startsWith("RELAY ONE IS LIVE"))')));
await closeMenu();
check('tap the ladder hatch -> station concourse', (await navTo(insideW(90, 291), 'station')) === 'station' && (await D('d.crew.station')) === 'hatch');
await tapBtn('u.btns.vendor');
const vend = await D('({ kind: u.menuKind, offers: Object.keys(u.btns.offers) })');
const PARTS = await page.evaluate(async () => (await import(new URL('src/data/parts.js', location.href).href)).PARTS.map((p) => ({ id: p.id, slot: p.slot, stock: !!p.stock, price: p.price })));
const P_ = Object.fromEntries(PARTS.map((p) => [p.id, p]));
const perSlot = {}; vend.offers.forEach((id) => { perSlot[P_[id].slot] = (perSlot[P_[id].slot] || 0) + 1; });
check('Quartermaster: 12 offers, 2 per slot, never stock, never owned', vend.kind === 'vendor' && vend.offers.length === 12 && Object.keys(perSlot).length === 6 && Object.values(perSlot).every((n) => n === 2)
  && vend.offers.every((id) => !P_[id].stock && !sv1.owned.includes(id)), JSON.stringify(perSlot));
// a fresh stock draw should vary across refreshes (3 candidates per slot, 2 shown)
const draws = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); const s = S.loadSave(); const seen = new Set(); for (let i = 0; i < 30; i++) seen.add(S.rollStock(s).join()); return seen.size; });
check('stock is randomized (many distinct draws from the unlocked pool)', draws > 5, `distinct=${draws}/30`);

// ---- shortcuts: ?credits=5000 + forced stock, then reroll / buy / equip ------------------
const STOCK = 'widecut,diamond,overdrive,coldloop,plating,ablative,heavycharge,patchfoam,scanner,governor,lightboots,harness';
await page.goto(BASE + '?credits=5000&stock=' + STOCK); await wait(1500);
await tap(90, 160); await wait(800);
check('?credits=5000 shortcut', (await D('JSON.parse(localStorage.getItem("drill.save")).credits')) === 5000 && (await D('u.creditText.text')) === '5000 CR');
await navTo(insideW(90, 291), 'station'); await tapBtn('u.btns.vendor');
check('?stock= shortcut sets the offers', (await D('Object.keys(u.btns.offers).sort().join()')) === STOCK.split(',').sort().join());
await page.screenshot({ path: `${OUT}/09-vendor.png` });
await tapBtn('u.btns.reroll');
const rr = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('reroll costs 100, next reroll 200, stock changes', rr.credits === 4900 && rr.vendor.rerolls === 1 && rr.vendor.stock.join() !== STOCK && (await D('u.btns.reroll.text.text')) === 'REROLL: 200 CR', `credits=${rr.credits} next=${await D('u.btns.reroll.text.text')}`);
// put the known stock back for deterministic buys
await page.evaluate((st) => { const s = JSON.parse(localStorage.getItem('drill.save')); s.vendor.stock = st.split(','); localStorage.setItem('drill.save', JSON.stringify(s)); }, STOCK);
await tapBtn('u.btns.back'); await tapBtn('u.btns.vendor');
// buy + equip LIGHT BOOTS in one tap from its detail card
await tapBtn('u.btns.offers.lightboots');
check('buy screen shows the upside AND downside before buying', (await D('u.menuKind')) === 'buy' && (await D('u.menu.some(t => t.text === "UPSIDE") && u.menu.some(t => t.text === "DOWNSIDE") && u.menu.some(t => t.text === "WALK SPEED +25%") && u.menu.some(t => t.text === "CLIMB SPEED -20%")')));
await page.screenshot({ path: `${OUT}/12-buy-detail.png` });
await tapBtn('u.btns.buyEquip');
let sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('BUY + EQUIP: credits spent, part owned + equipped, persisted', sv.credits === 4900 - 350 && sv.owned.includes('lightboots') && sv.loadout.kit === 'lightboots', `credits=${sv.credits} kit=${sv.loadout.kit}`);
check('bought part shows OWNED in the stock list', (await D('u.menuKind')) === 'vendor' && (await D('u.menu.some(t => t.text === "OWNED")')));
// buy-only HEAVY PLATING and WIDE-CUT BIT, equip them from the rig
for (const id of ['plating', 'widecut']) { await tapBtn(`u.btns.offers.${id}`); await tapBtn('u.btns.buy'); }
sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('BUY ONLY: owned but not equipped', sv.owned.includes('plating') && sv.owned.includes('widecut') && sv.loadout.hull === 'stockhull' && sv.loadout.drill === 'stockbit' && sv.credits === 4550 - 800 - 900, JSON.stringify({ c: sv.credits, l: sv.loadout }));
const notStock = await page.evaluate(async () => (await import(new URL('src/systems/Save.js', location.href).href)).buyPart('bypass'));
check('cannot buy a part that is not in stock', !notStock.ok && notStock.reason === 'NOT IN STOCK');
await tapBtn('u.btns.back'); await tapBtn('u.btns.back'); // vendor -> station -> rig
check('back to the rig closes the concourse', (await dockMenu()) === null);
// TLS bench -> HULL slot -> equip HEAVY PLATING
await navTo(insideW(116, 280), 'tools'); await tapBtn('u.btns.slot_hull');
check('part swap screen lists owned hull parts with up/downsides', (await D('u.menuArg')) === 'hull' && (await D('!!(u.btns.parts.stockhull && u.btns.parts.plating) && u.menu.some(t => t.text === "+ +40 MAX HULL") && u.menu.some(t => t.text === "- ACCEL + BRAKING -35%")')));
await tapBtn('u.btns.parts.plating');
await page.screenshot({ path: `${OUT}/10-part-swap.png` });
check('tap a part card -> equipped', (await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')).loadout.hull)) === 'plating' && (await D('u.menu.some(t => t.text === "EQUIPPED")')));
await closeMenu();
await navTo(insideW(116, 255), 'slot'); await tapBtn('u.btns.parts.widecut');
check('DRL -> drill head swapped to WIDE-CUT', (await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')).loadout.drill)) === 'widecut');
await closeMenu();
await page.screenshot({ path: `${OUT}/08-docked-base.png` });
await page.reload(); await wait(1500); await tap(90, 160); await wait(800);
sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('owned parts + loadout persist across reloads', sv.loadout.kit === 'lightboots' && sv.loadout.hull === 'plating' && sv.loadout.drill === 'widecut' && sv.owned.length === 9);

// ---- the parts change the run, measurably ---------------------------------------------
await startContract();
const pm = await G('({ max: s.maxHull, hull: s.hull, accel: s.mods.accelMul, decel: s.mods.decelMul, speedMul: s.mods.maxSpeedMul, heat: s.mods.heatMul, safe: s.safeThrottle, walk: g.crew.walkMul, climb: g.crew.climbMul })');
check('HEAVY PLATING in the run: 140 max hull, accel/brake x0.65', pm.max === 140 && pm.hull === 140 && near(pm.accel, 0.65) && near(pm.decel, 0.65), JSON.stringify(pm));
check('WIDE-CUT in the run: top speed x1.25, heat x1.35, safe ram zone 28%', near(pm.speedMul, 1.25) && near(pm.heat, 1.35) && Math.abs(pm.safe - 0.28) < 0.001, JSON.stringify(pm));
check('HUD hull bar uses 140', (await G('s.maxHull')) === 140);
await G('(g.obstacles.spawnFilter = () => false, g.obstacles.list.slice().forEach(o => g.obstacles.destroy(o, false)), s.throttle = 1, s.speed = 1, s.heat = 0, true)');
const a0 = await G('s.distance'); await wait(1000); const a1 = await G('s.distance');
check('full speed covers ~50 px/s (40 x 1.25)', (a1 - a0) > 44 && (a1 - a0) < 56, `${(a1 - a0).toFixed(1)} px/s`);
await G('(s.throttle = 0, s.speed = 0, true)');
await tap(...TOGGLE); await wait(900);
await tapRoom('drill'); await waitFor('g.crew.station === "drill"', 3000);
const trip = await G('g.crew.lastTrip');
check('LIGHT BOOTS: same-deck walk ~0.55 s (683 / 1.25)', trip.to === 'drill' && trip.ms > 480 && trip.ms < 600, `${Math.round(trip.ms)}ms`);
await tapRoom('engine'); await waitFor('g.crew.station === "engine"', 3000);
const trip2 = await G('g.crew.lastTrip');
check('LIGHT BOOTS: climb is slower (cross-deck ~1.1 s)', trip2.ms > 1000 && trip2.ms < 1250, `${Math.round(trip2.ms)}ms`);
const blocked = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); return { active: S.isRunActive(), r: S.equipPart('stockkit'), kit: S.loadSave().loadout.kit }; });
check('swapping parts is blocked during a run', blocked.active && !blocked.r.ok && blocked.r.reason.includes('RUN ACTIVE') && blocked.kit === 'lightboots', JSON.stringify(blocked));
check('no swap UI exists mid-run (dock scenes stopped)', await page.evaluate(() => !__drill.scene.isActive('Dock') && !__drill.scene.isActive('DockUI')));
await G('(s.damage(9999), true)');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 8000 }).catch(() => {});
await wait(500); await tap(90, 249); await wait(1000);
const unblocked = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); const r = S.equipPart('stockkit'); S.equipPart('lightboots'); return { active: S.isRunActive(), r, dock: __drill.scene.isActive('Dock') }; });
check('swapping works again once docked', !unblocked.active && unblocked.r.ok && unblocked.dock, JSON.stringify(unblocked));

// ---- save migration (v1 from M1, plus the pre-M1 best-depth key) ----------------------------
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('drill.save', JSON.stringify({ v: 1, credits: 777, runs: 3, cashouts: 2, rigsLost: 1, relaysReached: 4 })); localStorage.setItem('drill.bestDepth', '1234'); });
await page.goto(BASE); await wait(1500);
const mig = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('v1 save migrates to v2 without losing credits, stats or best depth', mig.v === 2 && mig.credits === 777 && mig.runs === 3 && mig.cashouts === 2 && mig.rigsLost === 1 && mig.relaysReached === 4 && mig.best.kessa4 === 1234 && mig.totalEarned === 777,
  JSON.stringify({ v: mig.v, c: mig.credits, runs: mig.runs, best: mig.best }));
check('migrated save gets the stock loadout, 6 stock parts and a 12-part vendor stock', mig.owned.length === 6 && Object.values(mig.loadout).every((id) => P_[id].stock) && mig.vendor.stock.length === 12);
check('title shows migrated credits + best', await page.evaluate(() => { const t = __drill.scene.getScene('Title'); const tx = t.children.list.map((c) => c.text).filter(Boolean); return tx.includes('CREDITS 777 CR') && tx.includes('BEST DEPTH 1234M'); }));
await tap(90, 160); await wait(800);
check('docked HUD shows migrated credits', (await D('u.creditText.text')) === '777 CR' && (await D('u.bestText.text')) === 'BEST 1234M');

check('no console errors', errs.length === 0, errs.join(' | '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
