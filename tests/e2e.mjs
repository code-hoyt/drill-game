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

await page.goto(BASE + '?anim=0&noevents=1'); // main flow (no random veins/events: those get their own section) skips cutscenes; they get their own section below
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
const TOGGLE = [25, 307], PILOT_BTN = [95, 307];   // bottom bar: 24 base px tall buttons (1.75x)
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
const PARTNAMES = Object.fromEntries((await page.evaluate(async () => (await import(new URL('src/data/parts.js', location.href).href)).PARTS.map((p) => [p.id, p.name]))));
// concourse spots (base coords; the Dock camera is zoom 1). Tap low on the column, over the prop.
const SPOT = { board: [18, 262], ines: [54, 262], airlock: [90, 262], qm: [126, 262], bunk: [162, 262] };
const CONTENT = { y0: 22, y1: 202 };   // panels live in this band; the concourse strip (202..300) stays visible
// every panel object (text, rects, buttons, hotspots) must sit inside the content area: nothing overlaps the concourse/HUD
const panelInBounds = () => D(`(() => { const bad = []; const chk = (x, y, w, h, n) => { if (y < ${CONTENT.y0} - 0.5 || y + h > ${CONTENT.y1} + 0.5 || x < -0.5 || x + w > 180.5) bad.push(n + '@' + [x, y, w, h].map(Math.round).join(',')); };
  for (const o of u.menu) { const b = o.getBounds ? o.getBounds() : null; if (b) chk(b.x, b.y, b.width, b.height, o.text || o.type); }
  for (const b of u.menuBtns) chk(b.x, b.y, b.w, b.h, 'btn:' + b.text.text); return bad; })()`);
// the concourse strip is drawn and its five tap columns are live and not covered by any DockUI object
const concourseLive = () => D(`(() => Object.values(d.spots).every(sp => sp.zone.input && sp.zone.input.enabled && sp.zone.y >= 202 && sp.zone.y + sp.zone.height <= 303)
  && d.holt.visible && !(u.menu || []).some(o => o.input && o.getBounds && o.getBounds().bottom > 202.5))()`);
const startContract = async () => {
  await tap(...SPOT.board);         // Holt walks to the contract board, it opens on arrival
  await page.waitForFunction(() => __drill.scene.getScene('DockUI').menuKind === 'board', null, { timeout: 4000 });
  await tapBtn('u.btns.contract_kessa4');
  // ?anim=0: straight into the run. Animations on: Holt walks to the airlock, rides up, then the descent.
  await page.waitForFunction(() => __drill.scene.isActive('Game') || __drill.scene.isActive('Cutscene'), null, { timeout: 5000 }).catch(() => {});
  await wait(150);
};
await tap(90, 160); await wait(800);
check('tap-to-start docks at the station concourse (home base)', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('DockUI') && !__drill.scene.isActive('Game')));
await startContract();
check('game + UI scenes running after CONTRACT BOARD -> ACCEPT CONTRACT', await page.evaluate(() => __drill.scene.isActive('Game') && __drill.scene.isActive('UI')));
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
check('the whole top-down cutaway (x 51..138, y 236..327) + the drill collar fit on screen in inside view (below HUD, above station panel)', await G(`(() => { const v = g.cameras.main.worldView, z = g.cameras.main.zoom;
  return v.x <= 51 && v.right >= 138 && 230 >= v.y + 24 / z && 327 <= v.y + 232 / z; })()`), await G('JSON.stringify(g.cameras.main.worldView)'));
check('inside at helm shows throttle controls', await G('ui.hGfx.visible && ui.hPlus.visible && ui.hMinus.visible'));
await tap(...H_PLUS); await wait(100);
check('inside helm + raises throttle', near(await thr(), 0.9), 'throttle=' + await thr());
await tap(...H_MINUS); await wait(100);
check('inside helm - lowers throttle', near(await thr(), 0.8), 'throttle=' + await thr());
await tap(...H_TRACK(0.5)); await wait(100);
check('inside helm slider sets throttle', near(await thr(), 0.5), 'throttle=' + await thr());

// ---- CORMORANT top-down interior: corridor-graph pathing ------------------------------
// Holt walks the ring corridor round the hold (doorway -> ring -> doorway); the HELM is out in the cockpit
// pod through the crawl tube (a 'climb' segment). Every segment is axis-aligned and every waypoint is a node.
const ids = ['helm', 'drill', 'engine', 'tools', 'siphon'];
const edges = Object.fromEntries(ids.map((a) => [a, ids.filter((b) => b !== a)]));
const circuit = []; const stack = ['helm'];
while (stack.length) { const v = stack[stack.length - 1]; if (edges[v].length) stack.push(edges[v].shift()); else circuit.push(stack.pop()); }
circuit.reverse();
const planned = await G(`(() => { const C = g.crew.constructor, out = {}, R = g.ship.rooms; const Gr = g.ship.navGraph || (C.plan(g.ship, R[0].standX, R[0].standY, R[1].id), g.ship.navGraph);
  const nodes = Object.values(Gr.pts).map(p => p.x + ',' + p.y);
  for (const a of R) for (const b of R) if (a !== b) {
    const pts = C.plan(g.ship, a.standX, a.standY, b.id); let x = a.standX, y = a.standY, axis = true, walk = 0, climb = 0;
    for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (p.x !== x && p.y !== y) axis = false; p.climb ? climb += d : walk += d; x = p.x; y = p.y; }
    out[a.id + '>' + b.id] = { n: pts.length, axis, onNodes: pts.every(p => nodes.includes(p.x + ',' + p.y)), end: pts.length && pts.at(-1).x === b.standX && pts.at(-1).y === b.standY, walk, climb }; }
  return out; })()`);
const PL = Object.entries(planned);
check('top-down plans: all 20 station pairs reachable, axis-aligned corridor segments, waypoints on the corridor graph, end at the station', PL.length === 20 && PL.every(([, v]) => v.n > 0 && v.axis && v.onNodes && v.end),
  PL.filter(([, v]) => !(v.n > 0 && v.axis && v.onNodes && v.end)).map(([k]) => k).join(' '));
check('crawl tube: only trips to/from the HELM pod use it (climb ~16 px), all others walk the ring', PL.every(([k, v]) => (k.includes('helm') ? Math.abs(v.climb - 16) < 0.5 : v.climb === 0)), PL.map(([k, v]) => k + ':' + v.climb).join(' '));
const tripS = (k) => planned[k].walk / 48 + planned[k].climb / 70;
const KEY = ['helm>drill', 'helm>engine', 'helm>tools', 'helm>siphon', 'drill>engine'];
const avg = KEY.reduce((a, k) => a + tripS(k), 0) / KEY.length;
check('key trips average ~1.4-1.8 s (concept 1.56 s; longer walks are OK)', avg > 1.35 && avg < 1.85, KEY.map((k) => k + '=' + tripS(k).toFixed(2)).join(' ') + ' avg ' + avg.toFixed(2));
console.log('TRIP PLAN  ' + KEY.map((k) => k + '=' + tripS(k).toFixed(2) + 's').join(' ') + '  avg ' + avg.toFixed(2) + 's');

await G('(s.throttle = 0, true)');
const trips = [];
for (let i = 1; i < circuit.length; i++) {
  await tapRoom(circuit[i]);
  if (i === 1) { await wait(250); trips.walkTex = await G('g.crew.sprite.texture.key'); }
  await waitFor(`g.crew.station === "${circuit[i]}"`, 4000);
  const t = await G('({ ...g.crew.lastTrip, ang: g.crew.sprite.angle, face: g.ship.room(g.crew.station).face })');
  trips.push({ ...t, ok: t && t.from === circuit[i - 1] && t.to === circuit[i] });
  await wait(60);
}
const pairs = new Set(trips.map((t) => t.from + '>' + t.to));
check('walked all 20 ordered trips by tapping rooms (every station reachable)', trips.length === 20 && pairs.size === 20 && trips.every((t) => t.ok), [...pairs].join(' '));
const ANG = { up: 0, right: 90, down: 180, left: -90 };
check('top-down Holt: walk frames while moving, faces his console on arrival', /^holt_td_walk/.test(trips.walkTex) && trips.every((t) => { const d = (((t.ang - ANG[t.face]) % 360) + 360) % 360; return d < 1 || d > 359; }),
  trips.walkTex + ' ' + trips.map((t) => t.to + ':' + t.ang).join(' '));
const timeOk = trips.every((t) => { const k = t.from + '>' + t.to, exp = tripS(k) * 1000; return Math.abs(t.walk - planned[k].walk) < 0.6 && Math.abs(t.climb - planned[k].climb) < 0.6 && t.ms > exp - 120 && t.ms < exp + 160; });
check('walked trips match their plans (walk + tube px, time = walk/48 + tube/70)', timeOk, trips.map((t) => t.from + '>' + t.to + '=' + Math.round(t.ms)).join(' '));
const tMin = Math.min(...trips.map((t) => t.ms)), tMax = Math.max(...trips.map((t) => t.ms));
console.log(`TRIP TIMES  ${Math.round(tMin)}-${Math.round(tMax)}ms`);
check('crew back at helm after the circuit', await G('g.crew.station === "helm" && g.piloted'));

// retargeting
const crewState = () => G('({ path: g.crew.path.map(p => [Math.round(p.x), Math.round(p.y)]), len: g.crew.constructor.pathLength(g.crew.sprite.x, g.crew.sprite.y, g.crew.path), target: g.crew.target, x: +g.crew.sprite.x.toFixed(1), y: +g.crew.sprite.y.toFixed(1), climbing: g.crew.climbing })');
// a) in the crawl tube on the way out of the pod, change your mind -> turn round in the tube, back to the helm
await tapRoom('engine');
await page.waitForFunction(() => { const c = __drill.scene.getScene('Game').crew; return c.climbing && c.sprite.x < 120; }, null, { polling: 'raf', timeout: 3000 });
await tapRoom('helm'); await wait(20);
let re = await crewState();
check('mid-tube retarget back to the HELM: turns round in the tube (short way back)', re.target === 'helm' && re.len < 26 && re.path[0][1] === 278 && re.path[0][0] > re.x, JSON.stringify(re));
await waitFor('g.crew.station === "helm"', 3000);
check('...and arrives back at the HELM', await G('g.crew.station === "helm"'));
// b) mid-walk on the ring, retarget -> takes the shorter way from where he is (never walks the long way round)
await tapRoom('siphon'); await wait(900);
const beforeRe = await crewState();
const segEnds = await G('[g.crew.segFrom, g.crew.path[0].node]');
await tapRoom('drill'); await wait(20);
re = await crewState();
// the best he can do from a point on a corridor segment: go to one of its two ends, then the shortest route
const alt = await G(`(() => { const C = g.crew.constructor, c = g.crew; return Math.min(...${JSON.stringify(segEnds)}.map(n => { const P = g.ship.navGraph.pts[n]; return Math.hypot(P.x - c.sprite.x, P.y - c.sprite.y) + C.pathLength(P.x, P.y, C.plan(g.ship, P.x, P.y, 'drill')); })); })()`);
check('mid-walk retarget on the ring: re-plans from where he is, no longer than the best route', re.target === 'drill' && re.len <= alt + 1.5, `len ${re.len.toFixed(1)} best ${alt.toFixed(1)} from ${beforeRe.x},${beforeRe.y}`);
await waitFor('g.crew.station === "drill"', 4000);
check('...and arrives at DRL', await G('g.crew.station === "drill"'));
// get to tools so the next block (which starts with tapRoom('helm')) is unchanged
await tapRoom('tools'); await waitFor('g.crew.station === "tools"', 4000);
await tapRoom('helm'); await wait(700);
await page.screenshot({ path: `${OUT}/03b-inside-walking.png` });   // Holt mid-walk on the ring
await waitFor('g.crew.station === "helm"', 4000);
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
const bub = await G(`g.ship.rooms.filter(r => r.id !== 'siphon').map(r => { const b = g.ship.bubbles[r.id]; return { id: r.id, vis: b.visible, inRoom: b.x > r.x && b.x < r.x + r.w && b.y > r.ceil && b.y < r.floorY }; })`);
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

// ---- drill loss: breakaway, the hopper is lost, keep 1/3 of the hold ---------------------
await G('(s.haul = 300, s.addToHopper(30, 45), true)');
await G('(s.hull = 6, s.heat = 100, s.wear = 100, true)');
await waitFor('!!g.breakState', 8000); await wait(560);
await page.screenshot({ path: `${OUT}/04a-breakaway.png` });
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 8000 }).catch(() => {});
await wait(600);
const go = await page.evaluate(() => ({ active: __drill.scene.isActive('GameOver'), best: localStorage.getItem('drill.bestDepth'), save: JSON.parse(localStorage.getItem('drill.save') || 'null') }));
const finalDepth = Math.floor(await G('s.depth'));
const lostRun = await G('g.lastRun');
check('drill integrity 0 -> end screen (DRILL LOST)', go.active && lostRun.reason === 'lost' && (await page.evaluate(() => __drill.scene.getScene('GameOver').children.list.some(c => c.text === 'DRILL LOST'))), JSON.stringify(lostRun));
check('best depth saved to localStorage', Number(go.best) === finalDepth, `best=${go.best} depth=${finalDepth}`);
check('drill loss banks 1/3 of the HOLD (floor); the write-off is the other 2/3; the hopper is lost', lostRun.haul >= 300 && lostRun.banked === Math.floor(lostRun.haul / 3) && lostRun.writeoff === lostRun.haul - lostRun.banked
  && lostRun.hopperLost >= 30 && go.save && go.save.credits === lostRun.banked && go.save.drillsLost === 1 && go.save.v === 5,
  `hold=${lostRun.haul} hopperLost=${lostRun.hopperLost} banked=${lostRun.banked} save=${JSON.stringify(go.save)}`);
const goRows = await page.evaluate(() => __drill.scene.getScene('GameOver').children.list.filter(c => c.type === 'BitmapText').map(c => c.text));
check('end screen accounting: SHIP HOLD, DRILL WRITE-OFF (2/3), HOPPER LOST, BANKED', goRows.includes('SHIP HOLD') && goRows.includes(`${lostRun.haul} CR`) && goRows.includes('DRILL WRITE-OFF (2/3)') && goRows.includes(`-${lostRun.writeoff} CR`)
  && goRows.includes('HOPPER LOST W/ DRILL') && goRows.includes(`${lostRun.hopperLost} CR`) && goRows.includes('BANKED') && goRows.includes(`${lostRun.banked} CR`), goRows.join('|'));
const brk = await G('({ b: !!g.breakState, done: g.breakState && g.breakState.done, broken: g.ship.broken, shipHidden: !g.ship.exterior.visible && !g.ship.interior.visible, drill: g.ship.drill.visible, sparks: !!g.wreckSparks })');
check('breakaway: the ship left (stand-in flew off), the wrecked drill stays behind sparking; no escape pod', brk.b && brk.done && brk.broken && brk.shipHidden && brk.drill && brk.sparks
  && !(await G('g.children.list.some(c => c.texture && c.texture.key === "pod")')), JSON.stringify(brk));
await page.screenshot({ path: `${OUT}/04-game-over.png` });
await tap(90, 249); await wait(1000);
check('end screen -> TO THE CONCOURSE docks at the station', await page.evaluate(() => __drill.scene.isActive('Dock') && !__drill.scene.isActive('Game') && !__drill.scene.isActive('UI')));
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
check('HUD shows HOLD + HOPPER + pay rate', /^HOLD \d+$/.test(await G('ui.holdText.text')) && /^HOP \d+\/120$/.test(await G('ui.hopperText.text')) && (await G('ui.payText.text')) === 'PAY X1.0', await G('ui.holdText.text + " / " + ui.hopperText.text + " / " + ui.payText.text'));
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
const xfer = await G('({ hop: s.hopper, hopCr: s.hopperCr, hold: s.holdCr, toast: g.toastLog.some(t => t.startsWith("HOPPER UNLOADED")) })');
check('relay crews unload the hopper into the hold for free (hopper 0, toast)', xfer.hop === 0 && xfer.hopCr === 0 && xfer.hold > 400 && xfer.toast, JSON.stringify(xfer));
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
check('full loop: cash out -> end screen -> concourse', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('DockUI') && !__drill.scene.isActive('Game') && !__drill.scene.isActive('GameOver')));
const sv1 = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('vendor stock refreshed after each contract (refresh count = runs)', sv1.vendor.refreshes === sv1.runs && sv1.vendor.rerolls === 0, `refreshes=${sv1.vendor.refreshes} runs=${sv1.runs}`);
const TIER2000 = ['harness', 'lightframe', 'grinder', 'governor', 'overdrive', 'quickcap', 'plating', 'bypass', 'bigtank', 'highflow', 'bighopper'];
check('reaching 2000 m unlocks the 500-2000 m parts (and nothing deeper)', TIER2000.every((id) => sv1.unlocked.includes(id)) && !['linkage', 'widecut', 'heavycharge', 'toolbelt', 'highdraw'].some((id) => sv1.unlocked.includes(id)), JSON.stringify(sv1.unlocked));
await wait(400);
const banner = await D('u.banner ? u.banner.text : (u.lastBanner ? u.lastBanner.text : null)');
check("dock shows 'NEW PARTS AVAILABLE' once, listing the new parts", banner && TIER2000.every((id) => banner.includes(PARTNAMES[id])) && (await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')).newUnlocks.length)) === 0, banner);
check('Ines radio log kept for replay', sv1.radio.some((r) => r.tag.includes('RELAY 1') && r.text.startsWith('RELAY ONE')) && sv1.radio.some((r) => r.tag.includes('CASH-OUT')), JSON.stringify(sv1.radio.map((r) => r.tag)));
// ---- concourse: Holt walks to each spot (<= ~1 s), the right panel opens on arrival -------------
const navTo = async (spot, kind, ms = 4000) => { await tap(...SPOT[spot]); await page.waitForFunction((k) => __drill.scene.getScene('DockUI').menuKind === k, kind, { timeout: ms }).catch(() => {}); return dockMenu(); };
const closeMenu = async () => { await tapBtn('u.btns.close'); };
const lastWalk = () => D('d.walkLog.at(-1) || null');
check('concourse: 5 labelled spots at the bottom, Holt on the floor by the airlock, rig standing drill-up in the bay above',
  (await D('Object.keys(d.spots).join()')) === 'board,ines,airlock,qm,bunk' && (await D('d.at === "airlock" && d.holt.visible && d.holt.y === 294 && d.rig.y < 194 && d.rig.scaleY > 0 && !u.menu')));
check('the directions/legend block is gone; the bottom bar shows where Holt is', await D('!u.hintText && u.statusText.text === "AT THE AIRLOCK (RIG BAY)"'), await D('u.statusText.text'));
await page.screenshot({ path: `${OUT}/08b-concourse-new-parts.png` });
const walks = [];
let prevKind = null;
for (const [spot, kind] of [['board', 'board'], ['ines', 'ines'], ['qm', 'vendor'], ['bunk', 'stats'], ['airlock', 'bay']]) {
  // tap the next spot while the previous panel is still open: it stays up until Holt arrives, then swaps
  await tap(...SPOT[spot]); await wait(60);
  const during = await D('({ kind: u.menuKind, walking: !!d.walk, active: d.activeSpot, status: u.statusText.text })');
  if (prevKind) check(`panel open (${prevKind}) + tap ${spot.toUpperCase()}: old panel stays while Holt walks, sign highlights the target`, during.kind === prevKind && during.walking && during.active === spot && during.status.startsWith('WALKING TO'), JSON.stringify(during));
  const k = await navTo(spot, kind); const w = await lastWalk(); walks.push(w);
  check(`tap ${spot.toUpperCase()} -> Holt walks there -> ${kind} panel opens in the content area (walk ${w && w.ms} ms)`, k === kind && w.to === spot && (await D(`d.at === "${spot}" && d.activeSpot === "${spot}"`)) && w.ms <= 1050, JSON.stringify(w));
  const oob = await panelInBounds();
  check(`${kind} panel fits the content area (nothing over the concourse or HUD)`, oob.length === 0, oob.join(' '));
  check(`${kind} panel open: the concourse is visible and tappable`, await concourseLive());
  prevKind = kind;
  if (spot === 'board') { check('contract board lists the data-driven contracts', await D('!!u.btns.contract_kessa4 && u.menu.some(t => t.text === "KESSA-4")')); await page.screenshot({ path: `${OUT}/19-contract-board.png` }); }
  if (spot === 'ines') { check("Ines's window: latest message + radio replay + story stub", await D('u.menu.some(t => t.text === "LATEST") && u.menu.some(t => t.text && t.text.startsWith("CLEAN UNCLAMP.")) && u.menu.some(t => t.text && t.text.startsWith("RELAY ONE IS LIVE")) && u.menu.some(t => t.text === "(STORY: LATER MILESTONE)")')); await page.screenshot({ path: `${OUT}/20-ines-window.png` }); }
  if (spot === 'bunk') {
    await page.screenshot({ path: `${OUT}/11-stats.png` });
    check("bunk: Holt's log shows runs, relays, credits earned, best", await D(`u.menu.some(t => t.text === "${sv1.totalEarned} CR") && u.menu.some(t => t.text === "2000M") && u.menu.some(t => t.text === "RELAYS REACHED")`));
    await tapBtn('u.btns.codex');
    check('bunk: CODEX SHELF opens the codex stub, BACK returns to the log', (await dockMenu()) === 'codex');
    await page.screenshot({ path: `${OUT}/22-codex.png` });
    await tapBtn('u.btns.back'); check('codex back -> log', (await dockMenu()) === 'stats');
  }
  if (spot === 'airlock') await page.screenshot({ path: `${OUT}/21-rig-bay.png` });
  if (spot === 'qm') await page.screenshot({ path: `${OUT}/09b-quartermaster.png` });
}
// back to the bay view: tap the active spot again, or X
await tap(...SPOT.airlock); await wait(150);
check('tap the active spot again -> panel closes, back to the bay view', (await dockMenu()) === null && (await D('d.at === "airlock" && !d.walk')));
await tap(...SPOT.airlock); await wait(150);
check('...and tapping it once more reopens its panel', (await dockMenu()) === 'bay');
await closeMenu();
check('X closes the panel (bay view)', (await dockMenu()) === null);
// sub-panel: tapping the active spot returns to that spot's main panel
await navTo('bunk', 'stats'); await tapBtn('u.btns.codex');
await tap(...SPOT.bunk); await wait(150);
check('codex open + tap HOLT\'S BUNK -> back to the log (sub-panel -> main panel)', (await dockMenu()) === 'stats');
// the longest walk: bunk (far right) -> contract board (far left) and back, with panels swapping
await navTo('board', 'board');
await navTo('bunk', 'stats'); const longW = await lastWalk(); await closeMenu();
check('longest walk (board -> bunk, 144 px) takes <= ~1 s', longW.from === 'board' && longW.to === 'bunk' && longW.ms <= 1050, JSON.stringify(longW));
console.log('WALKS', JSON.stringify([...walks, longW]));
check('tap the rig in the bay -> Holt walks to the airlock -> rig bay', await (async () => { await tap(90, 150); await page.waitForFunction(() => __drill.scene.getScene('DockUI').menuKind === 'bay', null, { timeout: 3000 }).catch(() => {}); return (await dockMenu()) === 'bay' && (await D('d.at')) === 'airlock'; })());
// [C] the drill is only attached on the job: count the TB-6 images (drill unit / cutterhead) a scene draws, containers included
const drillImgs = (key) => page.evaluate((k) => { const out = []; const walk = (o, ox, oy) => { if (!o.visible) return;
    if (o.list) { o.list.forEach((c) => walk(c, ox + o.x, oy + o.y)); return; }
    const t = o.texture && o.texture.key; if (t === 'drillunit' || (t && t.startsWith('cutter'))) out.push({ t, x: ox + o.x, y: oy + o.y, s: o.scaleX }); };
  __drill.scene.getScene(k).children.list.forEach((o) => walk(o, 0, 0)); return out; }, key);
check('concourse bay: CORMORANT sits docked ALONE (no TB-6 drawn anywhere on the Dock scene)', (await drillImgs('Dock')).length === 0 && (await D('d.rig.list.length === 1')), JSON.stringify(await drillImgs('Dock')));
const bayDrill = await drillImgs('DockUI');
check('rig bay: the ship alone on its clamps; the only TB-6 is the small one on Meridian\'s pad in the yard window (y < 102, half scale)', bayDrill.length === 2 && bayDrill.every((o) => o.y < 102 && o.s === 0.5), JSON.stringify(bayDrill));
// rig bay hotspots: each ship part location opens its slot; the yard window opens the DRILL YARD
const HOTS = await D('Object.fromEntries(Object.entries(u.hot).map(([k, h]) => [k, h]))');
const noOverlap = (HS) => Object.values(HS).every((a) => Object.values(HS).every((b) => a === b || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
check('rig bay: 5 ship hotspots (helm, engine, tools, siphon, kit) + the DRILL YARD window, each at least 32x24 base px (thumb-sized), none overlapping', Object.keys(HOTS).sort().join() === 'engine,helm,kit,siphon,tools,yard'
  && noOverlap(HOTS) && Object.values(HOTS).every((h) => h.w >= 32 && h.h >= 24), JSON.stringify(HOTS));
check('rig bay shows the equipped part names (ship slots + both drill slots on the DRILL YARD callout)', await D('u.menu.some(t => t.text === "SURVEY BIT") && u.menu.some(t => t.text === "K-9 ENGINE") && u.menu.some(t => t.text === "WORK BOOTS") && u.menu.some(t => t.text === "BASIC CONSOLE") && u.menu.some(t => t.text === "DRILL YARD  >")'));
for (const slot of ['helm', 'engine', 'tools', 'kit']) {
  const h = HOTS[slot];
  await tap(h.x + h.w / 2, h.y + h.h / 2); await wait(200);
  check(`rig bay: tap the ${slot} location -> ${slot} swap list`, (await dockMenu()) === 'slot' && (await D('u.menuArg')) === slot);
  await tapBtn('u.btns.back');
}
check('slot list BACK returns to the rig bay', (await dockMenu()) === 'bay');
await tap(HOTS.yard.x + HOTS.yard.w / 2, HOTS.yard.y + HOTS.yard.h / 2); await wait(250);
const YH = await D('Object.fromEntries(Object.entries(u.hot).map(([k, h]) => [k, h]))');
const yardDrill = await drillImgs('DockUI');
check('tap the yard window -> MERIDIAN DRILL YARD: the leased TB-6 alone on its pad at 1x, 2 hotspots (drill head, drill frame), thumb-sized, no overlap', (await dockMenu()) === 'yard' && Object.keys(YH).sort().join() === 'drill,hull'
  && noOverlap(YH) && Object.values(YH).every((h) => h.w >= 32 && h.h >= 22) && yardDrill.length === 2 && yardDrill.every((o) => o.s === 1) && (await panelInBounds()).length === 0, JSON.stringify({ YH, yardDrill }));
for (const slot of ['drill', 'hull']) {
  const h = YH[slot];
  await tap(h.x + h.w / 2, h.y + h.h / 2); await wait(200);
  check(`drill yard: tap the ${slot} location -> ${slot} swap list, BACK returns to the yard`, (await dockMenu()) === 'slot' && (await D('u.menuArg')) === slot && (await (async () => { await tapBtn('u.btns.back'); return (await dockMenu()) === 'yard'; })()));
}
const YT = await D('Object.fromEntries(Object.entries(u.tags).map(([k, t]) => [k, { x: t.x, y: t.y, w: t.w, h: t.h }]))');
check('drill yard: a callout per drill slot (>= 80x22), tappable', Object.keys(YT).sort().join() === 'drill,hull' && Object.values(YT).every((t) => t.w >= 80 && t.h >= 22)
  && (await (async () => { await tap(YT.hull.x + 40, YT.hull.y + 11); await wait(200); const ok = (await dockMenu()) === 'slot' && (await D('u.menuArg')) === 'hull'; await tapBtn('u.btns.back'); return ok; })()), JSON.stringify(YT));
await tapBtn('u.btns.back');
check('drill yard < returns to the rig bay', (await dockMenu()) === 'bay');
const TAGS = await D('Object.fromEntries(Object.entries(u.tags).map(([k, t]) => [k, { x: t.x, y: t.y, w: t.w, h: t.h }]))');
check('rig bay: a callout per ship slot + the DRILL YARD callout beside the ship, each tappable (>= 80x22), all 6 inside the content area', Object.keys(TAGS).sort().join() === 'engine,helm,kit,siphon,tools,yard' && Object.values(TAGS).every((t) => t.w >= 80 && t.h >= 22 && t.x >= 96 && t.y >= 38 && t.y + t.h <= 202)
  && (await D('u.menu.some(t => t.text === "HAND PUMP") && u.menu.some(t => t.text === "SIPHON")')), JSON.stringify(TAGS));
for (const slot of ['engine', 'siphon', 'kit']) { const t = TAGS[slot]; await tap(t.x + t.w / 2, t.y + t.h / 2); await wait(200);
  check(`rig bay: tap the ${slot} callout -> ${slot} swap list`, (await dockMenu()) === 'slot' && (await D('u.menuArg')) === slot); await tapBtn('u.btns.back'); }
await tap(TAGS.yard.x + TAGS.yard.w / 2, TAGS.yard.y + TAGS.yard.h / 2); await wait(200);
check('rig bay: tap the DRILL YARD callout -> the yard', (await dockMenu()) === 'yard');
await tapBtn('u.btns.back');
await closeMenu();
await navTo('qm', 'vendor');
const vend = await D('({ kind: u.menuKind, offers: u.offerIds, page: u.vendorPage, pages: u.vendorPages, shown: Object.keys(u.btns.offers) })');
check('Quartermaster pages its list: 6 per page, 3 pages for 14 offers', vend.pages === 3 && vend.page === 0 && vend.shown.length === 6, JSON.stringify(vend));
await tapBtn('u.btns.next');
const vend2 = await D('({ page: u.vendorPage, shown: Object.keys(u.btns.offers) })');
check('NEXT > shows the other 6 offers (all 12 reachable, no repeats)', vend2.page === 1 && vend2.shown.length === 6 && new Set([...vend.shown, ...vend2.shown]).size === 12, JSON.stringify(vend2));
check('Quartermaster page 2 still fits the content area', (await panelInBounds()).length === 0);
await page.screenshot({ path: `${OUT}/09c-quartermaster-page2.png` });
await tapBtn('u.btns.prev');
check('< PREV returns to page 1', (await D('u.vendorPage')) === 0);
const PARTS = await page.evaluate(async () => (await import(new URL('src/data/parts.js', location.href).href)).PARTS.map((p) => ({ id: p.id, slot: p.slot, stock: !!p.stock, price: p.price, unlock: p.unlock })));
const P_ = Object.fromEntries(PARTS.map((p) => [p.id, p]));
const perSlot = {}; vend.offers.forEach((id) => { perSlot[P_[id].slot] = (perSlot[P_[id].slot] || 0) + 1; });
check('Quartermaster: 14 offers, 2 per slot (7 slots), never stock, owned or locked', vend.kind === 'vendor' && vend.offers.length === 14 && Object.keys(perSlot).length === 7 && Object.values(perSlot).every((n) => n === 2)
  && vend.offers.every((id) => !P_[id].stock && !sv1.owned.includes(id) && (!P_[id].unlock || sv1.unlocked.includes(id))), JSON.stringify(perSlot));
// a fresh stock draw should vary across refreshes (3 candidates per slot, 2 shown)
const draws = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); const Pm = await import(new URL('src/data/parts.js', location.href).href);
  const s = S.loadSave(); const seen = new Set(); let locked = 0;
  for (let i = 0; i < 200; i++) { const st = S.rollStock(s); seen.add(st.join()); locked += st.filter((id) => { const p = Pm.partById(id); return p.unlock && !s.unlocked.includes(id); }).length; } return { distinct: seen.size, locked }; });
check('stock is randomized and never draws a locked part (200 draws)', draws.distinct > 5 && draws.locked === 0, JSON.stringify(draws));
await tapBtn('u.btns.locked');
check('Quartermaster LOCKED list shows what is left and how to unlock it', (await D('u.menuKind')) === 'locked' && (await D('u.lockedRows.slice().sort().join()')) === 'heavycharge,highdraw,linkage,toolbelt,widecut'
  && (await D('u.menu.some(t => t.text === "REACH 3000M") && u.menu.some(t => t.text === "3 RELAYS (TOTAL)")')));
await tapBtn('u.btns.back');   // locked -> stock
const backToStock = (await dockMenu()) === 'vendor';
await closeMenu();             // stock -> bay view
check('LOCKED < back -> stock, Quartermaster X -> bay view', backToStock && (await dockMenu()) === null);

// ---- shortcuts: ?credits=5000 + forced stock, then reroll / buy / equip ------------------
const STOCK = 'widecut,diamond,overdrive,coldloop,plating,ablative,heavycharge,patchfoam,scanner,governor,lightboots,harness';
await page.goto(BASE + '?anim=0&noevents=1&unlock=all&credits=5000&stock=' + STOCK); await wait(1500);
await tap(90, 160); await wait(800);
check('?credits=5000 shortcut', (await D('JSON.parse(localStorage.getItem("drill.save")).credits')) === 5000 && (await D('u.creditText.text')) === '5000 CR');
await navTo('qm', 'vendor');
check('?stock= shortcut sets the offers', (await D('u.offerIds.slice().sort().join()')) === STOCK.split(',').sort().join());
await page.screenshot({ path: `${OUT}/09-vendor.png` });
await tapBtn('u.btns.reroll');
const rr = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('reroll costs 100, next reroll 200, stock changes', rr.credits === 4900 && rr.vendor.rerolls === 1 && rr.vendor.stock.join() !== STOCK && (await D('u.btns.reroll.text.text')) === 'REROLL: 200', `credits=${rr.credits} next=${await D('u.btns.reroll.text.text')}`);
// put the known stock back for deterministic buys
await page.evaluate((st) => { const s = JSON.parse(localStorage.getItem('drill.save')); s.vendor.stock = st.split(','); localStorage.setItem('drill.save', JSON.stringify(s)); }, STOCK);
await closeMenu(); await navTo('qm', 'vendor');
// offers live on pages: flip until the wanted one is shown
const tapOffer = async (id) => { for (let i = 0; i < 3 && !(await D(`!!u.btns.offers.${id}`)); i++) await tapBtn('u.btns.next'); await tapBtn(`u.btns.offers.${id}`); };
// buy + equip LIGHT BOOTS in one tap from its detail card
await tapOffer('lightboots');
check('buy screen fits the content area', (await panelInBounds()).length === 0, (await panelInBounds()).join(' '));
check('buy screen shows the upside AND downside before buying', (await D('u.menuKind')) === 'buy' && (await D('u.menu.some(t => t.text === "UPSIDE") && u.menu.some(t => t.text === "DOWNSIDE") && u.menu.some(t => t.text === "WALK SPEED +25%") && u.menu.some(t => t.text === "CLIMB SPEED -20%")')));
await page.screenshot({ path: `${OUT}/12-buy-detail.png` });
await tapBtn('u.btns.buyEquip');
let sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('BUY + EQUIP: credits spent, part owned + equipped, persisted', sv.credits === 4900 - 350 && sv.owned.includes('lightboots') && sv.loadout.kit === 'lightboots', `credits=${sv.credits} kit=${sv.loadout.kit}`);
check('bought part shows OWNED in the stock list', (await D('u.menuKind')) === 'vendor' && (await D('u.menu.some(t => t.text === "OWNED")')));
// buy-only HEAVY PLATING and WIDE-CUT BIT, equip them from the rig
for (const id of ['plating', 'widecut']) { await tapOffer(id); await tapBtn('u.btns.buy'); }
sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('BUY ONLY: owned but not equipped', sv.owned.includes('plating') && sv.owned.includes('widecut') && sv.loadout.hull === 'stockhull' && sv.loadout.drill === 'stockbit' && sv.credits === 4550 - 800 - 900, JSON.stringify({ c: sv.credits, l: sv.loadout }));
const notStock = await page.evaluate(async () => (await import(new URL('src/systems/Save.js', location.href).href)).buyPart('bypass'));
check('cannot buy a part that is not in stock', !notStock.ok && notStock.reason === 'NOT IN STOCK');
await closeMenu(); // vendor -> bay view
check('X closes the Quartermaster', (await dockMenu()) === null);
// rig bay -> tap the hull plating -> equip HEAVY PLATING
const tapHot = async (slot) => { const h = await D(`u.hot.${slot}`); await tap(h.x + h.w / 2, h.y + h.h / 2); await wait(200); };
await navTo('airlock', 'bay'); await tapHot('yard'); await tapHot('hull');
check('slot swap list fits the content area', (await panelInBounds()).length === 0, (await panelInBounds()).join(' '));
check('part swap screen lists owned hull parts with up/downsides', (await D('u.menuArg')) === 'hull' && (await D('!!(u.btns.parts.stockhull && u.btns.parts.plating) && u.menu.some(t => t.text === "+ +40 MAX DRILL") && u.menu.some(t => t.text === "- ACCEL + BRAKING -35%")')));
await tapBtn('u.btns.parts.plating');
await page.screenshot({ path: `${OUT}/10-part-swap.png` });
check('tap a part card -> equipped', (await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')).loadout.hull)) === 'plating' && (await D('u.menu.some(t => t.text === "EQUIPPED")')));
await tapBtn('u.btns.back');
check('back in the drill yard: the frame tag now reads HEAVY PLATING', (await dockMenu()) === 'yard' && (await D('u.hot.hull.part')) === 'plating' && (await D('u.menu.some(t => t.text === "HEAVY PLATING")')));
await tapHot('drill'); await tapBtn('u.btns.parts.widecut');
check('drill yard: tap the cutterhead -> drill head swapped to WIDE-CUT (drill parts stay fittable)', (await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')).loadout.drill)) === 'widecut');
await tapBtn('u.btns.back');
await page.screenshot({ path: `${OUT}/44-drill-yard.png` });
await tapBtn('u.btns.back');
check('rig bay: the DRILL YARD callout shows the new drill parts', (await dockMenu()) === 'bay' && (await D('u.menu.some(t => t.text === "HEAVY PLATING") && u.menu.some(t => t.text === "WIDE-CUT BIT")')));
await page.screenshot({ path: `${OUT}/21-rig-bay.png` });
await closeMenu(); await wait(1800);
await page.screenshot({ path: `${OUT}/08-concourse.png` });
await page.reload(); await wait(1500); await tap(90, 160); await wait(800);
sv = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('owned parts + loadout persist across reloads', sv.loadout.kit === 'lightboots' && sv.loadout.hull === 'plating' && sv.loadout.drill === 'widecut' && sv.owned.length === 10);

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
// helm -> drill: 51 px of corridor (walk x1.25) + the 16 px crawl tube (climb x0.8)
const bootsExp = (trip.walk / (48 * 1.25) + trip.climb / (70 * 0.8)) * 1000, plainExp = (trip.walk / 48 + trip.climb / 70) * 1000;
check('LIGHT BOOTS: corridor walking 25% faster, the crawl tube 20% slower', trip.to === 'drill' && trip.climb > 15 && Math.abs(trip.ms - bootsExp) < 120 && trip.ms < plainExp - 100, `${Math.round(trip.ms)}ms (expect ${Math.round(bootsExp)}, plain ${Math.round(plainExp)})`);
await tapRoom('engine'); await waitFor('g.crew.station === "engine"', 3000);
const trip2 = await G('g.crew.lastTrip');
check('LIGHT BOOTS: a ring-only walk (DRL -> ENG, no tube) is x1.25 faster', trip2.climb === 0 && Math.abs(trip2.ms - trip2.walk / 60 * 1000) < 120, `${Math.round(trip2.ms)}ms`);
const blocked = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); return { active: S.isRunActive(), r: S.equipPart('stockkit'), kit: S.loadSave().loadout.kit }; });
check('swapping parts is blocked during a run', blocked.active && !blocked.r.ok && blocked.r.reason.includes('RUN ACTIVE') && blocked.kit === 'lightboots', JSON.stringify(blocked));
check('no swap UI exists mid-run (dock scenes stopped)', await page.evaluate(() => !__drill.scene.isActive('Dock') && !__drill.scene.isActive('DockUI')));
await G('(s.damage(9999), true)');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 8000 }).catch(() => {});
await wait(500); await tap(90, 249); await wait(1000);
const unblocked = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); const r = S.equipPart('stockkit'); S.equipPart('lightboots'); return { active: S.isRunActive(), r, dock: __drill.scene.isActive('Dock') }; });
check('swapping works again once docked', !unblocked.active && unblocked.r.ok && unblocked.dock, JSON.stringify(unblocked));

// ---- unlock thresholds + grandfathering -------------------------------------------------------
const th = await page.evaluate(async () => {
  const S = await import(new URL('src/systems/Save.js', location.href).href);
  const mk = (best, relays) => { const s = S.migrate(null); s.best = { kessa4: best }; s.relaysReached = relays; s.unlocked = []; s.newUnlocks = []; return s; };
  const at = (best, relays) => { const s = mk(best, relays); S.checkUnlocks(s); return s.unlocked.slice().sort(); };
  return { b499: at(499, 0), b500: at(500, 0), b999: at(999, 0), b1000: at(1000, 0), b2999: at(2999, 2), b3000: at(3000, 0), r3: at(0, 3) };
});
check('unlocks trigger exactly at the milestones (499 vs 500, 999 vs 1000, 2999 vs 3000)', th.b499.length === 0 && th.b500.join() === 'bigtank,harness,lightframe' && th.b999.join() === 'bigtank,harness,lightframe'
  && th.b1000.includes('grinder') && th.b1000.includes('governor') && !th.b2999.includes('widecut') && th.b3000.includes('widecut') && th.b3000.includes('heavycharge'), JSON.stringify(th));
check('3 lifetime relays unlock the tool belt (without depth)', th.r3.join() === 'toolbelt');
// grandfathering: a v2 save that owns parts which are now milestone-locked keeps them
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('drill.save', JSON.stringify({ v: 2, credits: 50, totalEarned: 9000, runs: 5, cashouts: 3, rigsLost: 2, relaysReached: 1, deepestRelay: 1, best: { kessa4: 600 },
  owned: ['stockbit', 'stockengine', 'stockhull', 'stocktools', 'stockhelm', 'stockkit', 'widecut', 'heavycharge'], loadout: { drill: 'widecut', tools: 'heavycharge' }, vendor: { stock: ['linkage', 'diamond', 'bypass'], rerolls: 0, refreshes: 5 }, radio: [] })); });
await page.goto(BASE + '?anim=0&noevents=1'); await wait(1500);
const gf = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('grandfathering: owned locked parts stay owned + equipped (v2 -> v5; rigsLost -> drillsLost)', gf.v === 5 && gf.drillsLost === 2 && !('rigsLost' in gf) && gf.loadout.siphon === 'stocksiphon' && gf.owned.includes('widecut') && gf.owned.includes('heavycharge') && gf.loadout.drill === 'widecut' && gf.loadout.tools === 'heavycharge' && gf.credits === 50, JSON.stringify({ l: gf.loadout, v: gf.v }));
check('grandfathering: an old stock with now-locked parts is re-drawn from unlocked parts only', gf.vendor.stock.length >= 6 && !gf.vendor.stock.includes('linkage') && !gf.vendor.stock.includes('bypass')
  && gf.vendor.stock.every((id) => !P_[id].unlock || gf.unlocked.includes(id)) && gf.unlocked.includes('harness') && gf.newUnlocks.length === 0, gf.vendor.stock.join());
check('grandfathered parts count as unlocked; 11 parts still locked (incl. the 2 power-split parts)', gf.unlocked.includes('widecut') && gf.unlocked.includes('heavycharge') && PARTS.filter((p) => p.unlock && !gf.unlocked.includes(p.id)).length === 11, gf.unlocked.join());
const gfEquip = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href); const a = S.equipPart('stockbit'); const b = S.equipPart('widecut'); return a.ok && b.ok; });
check('grandfathered part can still be swapped in and out', gfEquip);

// ---- transition cutscenes (animations on) -----------------------------------------------------
const animLog = () => page.evaluate(() => window.__drillAnims || []);
// frames for Cletus: freeze a scene the moment a condition holds, screenshot, resume
const freezeWhen = async (cond, file, key = 'Cutscene') => {
  // pause in the same frame the condition becomes true (a separate evaluate can be ~100 ms late)
  await page.waitForFunction(({ c, k }) => { if ((new Function('return (' + c + ')()'))()) { __drill.scene.pause(k); return true; } return false; },
    { c: cond.toString(), k: key }, { timeout: 16000, polling: 'raf' }).catch(() => page.evaluate((k) => __drill.scene.pause(k), key));
  await wait(120); await page.screenshot({ path: `${OUT}/${file}` });
  await page.evaluate((k) => __drill.scene.resume(k), key);
};
// cutscenes run 4.6 s x ANIM_SCALE (config: 2 -> 9.2 s); tolerance for slow CI
const ANIM_OK = (ms, exp) => ms >= exp * 0.95 && ms <= exp * 1.1 + 300;
await page.goto(BASE + '?wipe=1&noevents=1'); await wait(1500);
const CFG = await page.evaluate(() => window.__drillAnimCfg);
const CONF_SCALE = await page.evaluate(async () => (await import(new URL('src/config.js', location.href).href)).ANIM_SCALE);
check('animation speed is one config multiplier: ANIM_SCALE 2 -> 9.2 s ascent / 11.2 s descent (drill-smash beat), ~0.5 s grace, ~0.78 s lift', CONF_SCALE === 2 && CFG.scale === 2 && CFG.cutsceneMs === 9200 && CFG.descentMs === 11200 && CFG.graceMs >= 450 && CFG.graceMs <= 550 && CFG.liftMs >= 700 && CFG.liftMs <= 850, JSON.stringify(CFG));
await tap(90, 160); await wait(800);
await D('(u.openMenu("locked"), true)'); await wait(200);
check('fresh save: 16 parts locked (both SIPHON + both power-split parts depth-gated), one alternative per other slot open', (await D('u.lockedRows.length')) === 16);
await page.screenshot({ path: `${OUT}/16-locked-parts.png` });
await D('(u.closeMenu(), true)');
const fresh = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('fresh vendor stock: 6 offers, one per slot, all starters', fresh.vendor.stock.length === 6 && fresh.vendor.stock.every((id) => !P_[id].unlock), fresh.vendor.stock.join());
// camera state of the cutscene (rotation in radians; only the main camera turns)
const camState = () => page.evaluate(() => { const c = __drill.scene.getScene('Cutscene'); const m = c.cameras.main;
  return { active: __drill.scene.isActive('Cutscene'), rot: m.rotation, zoom: m.zoom, uiRot: c.uiCam ? c.uiCam.rotation : null, surface: c.surface && c.surface.visible }; });
await startContract();
check('ACCEPT CONTRACT: Holt walks to the airlock and rides the lift up, then the descent plays', await page.evaluate(() => __drill.scene.isActive('Cutscene') && __drill.scene.getScene('Cutscene').kind === 'descent' && !__drill.scene.isActive('Game') && !__drill.scene.isActive('Dock')));
// sample the whole descent every frame: the bite turn, plus [C] the drill travelling + landing on its own
const turnSeen = await page.evaluate(() => new Promise((res) => { let maxR = 0, uiMax = 0, zMax = 0; const c = __drill.scene.getScene('Cutscene');
  const o = { atStart: null, sepMax: 0, bothFalling: 0, shipBeforeImpact: 0, impactFrames: 0, preDockGap: 0, docked: null };
  const tick = () => { if (!__drill.scene.isActive('Cutscene')) return res({ maxR, uiMax, zMax, ...o, beats: c.beats }); const m = c.cameras.main;
    if (o.atStart === null) o.atStart = { shipDocked: !!c.spaceVehicle, drillInCradle: !!c.spaceDrill && Math.abs(c.spaceDrill.x - c.spaceVehicle.x) > 50 };
    if (c.space.visible && c.beats.drillRelease && c.spaceDrill && c.spaceVehicle) { o.sepMax = Math.max(o.sepMax, Math.abs(c.spaceDrill.x - c.spaceVehicle.x)); if (c.spaceDrill.y > 80 && c.spaceVehicle.y > 80) o.bothFalling++; }
    if (c.surface.visible && c.drill) {
      if (!c.impacted && c.ship.visible) o.shipBeforeImpact++;
      if (c.impacted) o.impactFrames++;
      if (c.beats.shipIn && !c.beats.clampsLocked) o.preDockGap = Math.max(o.preDockGap, c.drill.y - c.ship.y);
      if (c.beats.bite && !o.docked) o.docked = { dy: c.ship.y - c.drill.y, dx: c.ship.x - c.drill.x, clamps: c.shipClamps.alpha, light: c.drillLight.fillColor, game: __drill.scene.isActive('Game') };
      maxR = Math.max(maxR, m.rotation); zMax = Math.max(zMax, m.zoom); }
    uiMax = Math.max(uiMax, Math.abs(c.uiCam.rotation)); requestAnimationFrame(tick); }; tick(); }));
await page.waitForFunction(() => __drill.scene.isActive('Game'), null, { timeout: 16000 }).catch(() => {});
let al = (await animLog()).at(-1);
check('boarding beat (board -> airlock walk + lift) took ~1.2 s (<= 1.7 s)', al.boardMs > 800 && al.boardMs <= 1700, `boardMs=${al.boardMs}`);
check('descent ends in the run in ~11.2 s (2x), not skipped', await page.evaluate(() => __drill.scene.isActive('Game') && __drill.scene.isActive('UI') && !__drill.scene.isActive('Cutscene')) && al.kind === 'descent' && !al.skipped && al.expectMs === 11200 && ANIM_OK(al.ms, 11200), JSON.stringify(al));
const B = turnSeen.beats;
check('[C] launch: the ship leaves the station ALONE and Meridian\'s cradle drops the TB-6 separately (both falling, apart)', turnSeen.atStart.shipDocked && turnSeen.atStart.drillInCradle && B.undock > 0 && B.drillRelease > B.undock && turnSeen.sepMax > 20 && turnSeen.bothFalling > 3, JSON.stringify({ at: turnSeen.atStart, sep: turnSeen.sepMax, both: turnSeen.bothFalling, B }));
check('[C] arrival: the drill smashes down FIRST (no ship on the surface until after the impact), then Cormorant flies in', B.impact > B.surface && turnSeen.shipBeforeImpact === 0 && turnSeen.impactFrames > 10 && B.shipIn > B.impact, JSON.stringify(B));
check('[C] dock-on before control: fly in -> back down onto the collar -> clamps lock -> umbilicals live / power up -> bite, all inside the cutscene', B.shipIn < B.backDown && B.backDown < B.clampsLocked && B.clampsLocked < B.powerUp && B.powerUp < B.bite && B.bite < al.ms && turnSeen.preDockGap > 30
  && turnSeen.docked && turnSeen.docked.dy === 0 && turnSeen.docked.dx === 0 && turnSeen.docked.clamps > 0.99 && turnSeen.docked.light === 0x8affa0 && !turnSeen.docked.game, JSON.stringify({ B, gap: turnSeen.preDockGap, docked: turnSeen.docked }));
check('descent: camera turns 180 deg at the surface (drill down -> run drill up) with a gentle zoom; UI camera never turns', turnSeen.maxR > 3.1 && turnSeen.zMax > 1.05 && turnSeen.zMax < 1.3 && turnSeen.uiMax === 0, JSON.stringify(turnSeen));
check('run HUD/camera are not left rotated', await G('g.cameras.main.rotation === 0 && ui.cameras.main.rotation === 0'));
await wait(300);
await G('(g.debugJump(992), g.setThrottle(1), true)');
await page.waitForFunction(() => __drill.scene.isActive('Relay'), null, { timeout: 10000 }).catch(() => {});
await R('r.skipTyping()'); await wait(200); await tap(90, 137); await wait(700);
await tap(132, 277);   // CASH OUT
await page.waitForFunction(() => __drill.scene.isActive('Cutscene'), null, { timeout: 4000 }).catch(() => {});
const startCam = await camState();
check('cash out -> ascent cutscene (clean unclamp), opening on the run\'s drill-up view (camera at 180 deg)', await page.evaluate(() => __drill.scene.getScene('Cutscene').kind === 'ascent' && __drill.scene.getScene('Cutscene').vehicle === 'clean' && !__drill.scene.isActive('Game'))
  && startCam.surface && Math.abs(startCam.rot - Math.PI) < 0.35, JSON.stringify(startCam));
// sample the ascent: the clamps open cleanly, the drill stays put in the bore, only the ship goes to space
const asc = await page.evaluate(() => new Promise((res) => { const c = __drill.scene.getScene('Cutscene'); const y0 = c.drill.y;
  const o = { drillMoved: 0, clampsAtOut: null, shipAtUnclamp: null, spaceDrill: 0, spaceFrames: 0, red: 0, caps: new Set() };
  const isDrill = (x) => x.texture && (x.texture.key === 'drillunit' || x.texture.key.startsWith('cutter'));
  const tick = () => { if (!__drill.scene.isActive('Cutscene')) return res({ ...o, caps: [...o.caps], beats: c.beats, y0 });
    if (c.drill.y !== y0) o.drillMoved++;
    if (c.beats.unclamp && o.shipAtUnclamp === null) o.shipAtUnclamp = c.ship.y;
    if (c.beats.shipOut && o.clampsAtOut === null) o.clampsAtOut = c.shipClamps.alpha;
    if (c.space.visible) { o.spaceFrames++; if (c.space.list.some((x) => x.visible && (isDrill(x) || (x.list && x.list.some(isDrill))))) o.spaceDrill++; }
    c.children.list.filter((t) => t.type === 'BitmapText' && t.text).forEach((t) => o.caps.add(t.text));
    if (c.cameras.main.flashEffect && c.cameras.main.flashEffect.isRunning && c.cameras.main.flashEffect.red > 200 && c.cameras.main.flashEffect.green < 100) o.red++;
    requestAnimationFrame(tick); }; tick(); }));
check('[C] clean exit: the clamps open (no alarms) before the ship moves; the TB-6 stays put in the bore for Meridian', asc.beats.unclamp < asc.beats.shipOut && asc.clampsAtOut < 0.05 && asc.shipAtUnclamp === asc.y0 && asc.drillMoved === 0
  && asc.caps.includes('UNCLAMPED') && asc.caps.includes('TB-6 LEFT FOR MERIDIAN') && !asc.caps.some((t) => /BREAK|ALARM|LOST/.test(t)) && asc.red === 0, JSON.stringify(asc));
check('[C] clean exit: Cormorant flies out and docks at the station ALONE (no drill in any space frame)', asc.spaceFrames > 20 && asc.spaceDrill === 0 && asc.beats.docked > asc.beats.space, JSON.stringify(asc));
// (untimed beat after the cutscene: Holt rides the airlock lift down; grab the frame)
await freezeWhen(() => __drill.scene.isActive('Dock') && __drill.scene.getScene('Dock').lifting && __drill.scene.getScene('Dock').holt.y > 236 && __drill.scene.getScene('Dock').holt.y < 280, '24-holt-steps-out.png', 'Dock');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 16000 }).catch(() => {});
al = (await animLog()).at(-1);
check('[C] docked at the station: the ship alone in the bay (no TB-6 on the Dock scene)', (await drillImgs('Dock')).length === 0);
check('ascent ends on the concourse: Holt rode the lift down, summary in the content area, cutscene ~9.2 s (2x)', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('GameOver') && !__drill.scene.isActive('Cutscene') && __drill.scene.getScene('GameOver').scene.settings.data.reason === 'cashout') && al.kind === 'ascent' && !al.skipped && ANIM_OK(al.ms, 9200)
  && (await D('d.holt.visible && d.holt.y === 294 && !d.lifting && d.at === "airlock"')), JSON.stringify(al));
const sumB = await page.evaluate(() => { const g = __drill.scene.getScene('GameOver'); const bs = g.children.list.filter(o => o.getBounds).map(o => o.getBounds()); return { top: Math.min(...bs.map(b => b.y)), bottom: Math.max(...bs.map(b => b.bottom)), inDock: g.inDock }; });
check('run summary sits in the content area (22..202), the concourse stays visible below', sumB.inDock && sumB.top >= 21.5 && sumB.bottom <= 202.5, JSON.stringify(sumB));
await page.screenshot({ path: `${OUT}/25-summary-over-concourse.png` });
check('dock camera is not rotated', await D('d.cameras.main.rotation === 0 && u.cameras.main.rotation === 0'));
check('no NEW PARTS banner while Holt steps out or the summary is up', (await D('!u.banner && !u.lastBanner')));
const closeSummary = async () => { const b = await page.evaluate(() => { const r = __drill.scene.getScene('GameOver').restartBtn; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }); await tap(b.x, b.y); await wait(400); };
await closeSummary();
check('NEW PARTS banner appears once the summary is closed, inside the bay view; toasts use the bottom bar', await D('!!u.banner && u.banner.text.includes("GRINDER HEAD") && u.banner.top >= 22 && u.banner.bottom <= 202 && u.toastText.y >= 303'));
check('summary -> TO THE CONCOURSE reveals the concourse', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('DockUI') && !__drill.scene.isActive('GameOver')));
// tap to skip: ignored in the 0.4 s grace window, works after it
const nAnims = (await animLog()).length;
await tap(...SPOT.board);
await page.waitForFunction(() => __drill.scene.getScene('DockUI').menuKind === 'board', null, { timeout: 4000 });
await tapBtn('u.btns.contract_kessa4');
await page.waitForFunction(() => __drill.scene.isActive('Cutscene'), null, { timeout: 4000, polling: 'raf' }).catch(() => {});
await tap(90, 160); const earlyAt = await page.evaluate(() => Math.round(performance.now() - __drill.scene.getScene('Cutscene').t0));
await wait(300);
check(`a tap inside the ${CFG.graceMs} ms grace window is ignored`, earlyAt < CFG.graceMs && (await page.evaluate(() => __drill.scene.isActive('Cutscene'))) && (await animLog()).length === nAnims, `tap at ${earlyAt} ms`);
await page.waitForFunction((g) => performance.now() - __drill.scene.getScene('Cutscene').t0 > g + 300, CFG.graceMs, { timeout: 3000 }).catch(() => {});
await tap(90, 160); const skipT0 = Date.now();
await page.waitForFunction(() => __drill.scene.isActive('Game'), null, { timeout: 2000 }).catch(() => {});
al = (await animLog()).at(-1);
check('after the grace window a tap skips the descent straight into the run', await page.evaluate(() => __drill.scene.isActive('Game')) && al.skipped && al.ms >= CFG.graceMs && al.ms < 1600 && Date.now() - skipT0 < 1000, JSON.stringify({ ...al, tapToRun: Date.now() - skipT0 }));
await wait(300);
await G('(s.damage(9999), true)');
await waitFor('g.breakState && !__drill.scene.isActive("UI")', 2000);
check('drill loss -> in-run BREAKAWAY first (HUD off, TAP TO SKIP)', await G('!!g.breakState && !g.breakState.done && g.over'));
await page.waitForFunction((gr) => { const g = __drill.scene.getScene('Game'); return g.breakState && g.time.now - g.breakState.t0 > gr + 150; }, CFG.graceMs, { timeout: 4000 }).catch(() => {});
await tap(90, 160);
await page.waitForFunction(() => __drill.scene.isActive('Cutscene'), null, { timeout: 4000 }).catch(() => {});
const bk = await page.evaluate(() => { const b = __drill.scene.getScene('Game').breakState; return { skipped: b && b.skipped, ms: b && b.ms }; });
check('tap skips the breakaway (after the grace) -> ascent cutscene with the broken-away SHIP (no pod)', bk.skipped && bk.ms >= CFG.graceMs && bk.ms < 2000 && await page.evaluate(() => __drill.scene.getScene('Cutscene').vehicle === 'ship'), JSON.stringify(bk));
await page.waitForFunction((g) => performance.now() - __drill.scene.getScene('Cutscene').t0 > g + 200, CFG.graceMs, { timeout: 3000 }).catch(() => {});
await tap(90, 160);
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 2000 }).catch(() => {});
al = (await animLog()).at(-1);
check('tap skips the ship ascent: docked + DRILL LOST summary', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.getScene('GameOver').scene.settings.data.reason === 'lost') && al.skipped && al.ms >= CFG.graceMs && al.ms < 1600, JSON.stringify(al));
// the summary does not block the concourse: tapping a spot dismisses it and walks Holt there
await tap(...SPOT.board);
await page.waitForFunction(() => __drill.scene.getScene('DockUI').menuKind === 'board', null, { timeout: 4000 }).catch(() => {});
check('summary up + tap CONTRACT BOARD on the concourse -> summary dismissed, Holt walks, board opens', await page.evaluate(() => !__drill.scene.isActive('GameOver') && __drill.scene.getScene('DockUI').menuKind === 'board'));
// frames for Cletus (screenshots stall the renderer, so these runs aren't timed; mid-turn frames are paused)
await D('(u.closeMenu(), true)');
await startContract();
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.space.visible && c.beats.drillRelease && c.spaceDrill.y > 90 && c.spaceVehicle.y > 90; }, '13-launch.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.impacted && performance.now() - c.t0 > c.beats.impact + 120; }, '45-drill-impact.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.beats.shipIn && c.ship.y > 50 && !c.beats.backDown; }, '15-descent.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.beats.backDown && !c.beats.clampsLocked && c.drill.y - c.ship.y < 14; }, '14-docking.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.beats.powerUp && !c.beats.bite; }, '14b-clamped-power-up.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); const r = c.cameras.main.rotation; return c.surface.visible && c.spin && r > 1.3 && r < 1.9; }, '17-descent-rotation.png');
await page.waitForFunction(() => __drill.scene.isActive('Game'), null, { timeout: 16000 }).catch(() => {});
await wait(300);
await G('(s.haul = 400, g.cashOut(), true)');
await page.waitForFunction(() => __drill.scene.isActive('Cutscene'), null, { timeout: 4000 }).catch(() => {});
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.beats.unclamp && c.shipClamps.alpha < 0.5 && !c.beats.shipOut; }, '46-clean-unclamp.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); const r = c.cameras.main.rotation; return c.surface.visible && r > 1.3 && r < 1.9; }, '18-ascent-rotation.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.surface.visible && c.cameras.main.rotation === 0 && c.vehicleSprite.y < 190; }, '46b-clean-exit-surface.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.clampL && c.clampL.x > 78 && c.cameras.main.rotation === 0; }, '47-ship-docks-alone.png');
await freezeWhen(() => { const c = __drill.scene.getScene('Cutscene'); return c.clampedText && c.cameras.main.rotation > 3.13 && c.cameras.main.zoom > 2.2; }, '23-docking-end-frame.png');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 16000 }).catch(() => {});
check('screenshot runs also end docked with the summary', await page.evaluate(() => __drill.scene.isActive('Dock') && __drill.scene.isActive('GameOver')));

// ---- the multiplier works: ?animscale=1 brings back the 4.6 s cutscenes (0.4 s grace, 0.55 s lift) ----
await page.goto(BASE + '?animscale=1&noevents=1'); await wait(1500);
const CFG1 = await page.evaluate(() => window.__drillAnimCfg);
await tap(90, 160); await wait(800);
await startContract();
await page.waitForFunction(() => __drill.scene.isActive('Game'), null, { timeout: 12000 }).catch(() => {});
al = (await animLog()).at(-1);
check('ANIM_SCALE override 1 -> descent ~5.6 s, grace 400 ms, lift 550 ms', CFG1.scale === 1 && CFG1.graceMs === 400 && CFG1.liftMs === 550 && al.expectMs === 5600 && !al.skipped && ANIM_OK(al.ms, 5600), JSON.stringify({ CFG1, al }));

// ---- ore veins ([C]) + decision events ([P]) ----------------------------------------------------
const CONF = await page.evaluate(async () => { const c = await import(new URL('src/config.js', location.href).href); return { ORE: c.ORE, EV: c.EVENTS, CALMC: c.CALM, PWR: c.POWER, LAY: c.LAYOUT }; });
const { ORE, EV, CALMC, PWR, LAY } = CONF;
const touchDown = async (gx, gy) => { const p = P(gx, gy); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); };
const touchUp = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const runFrom = async (q) => { await page.goto(BASE + '?anim=0' + q); await wait(1500); await tap(90, 160); await wait(800); await startContract(); await waitFor('g.crew && g.crew.station === "helm" && !!g.veins', 3000); };
const toastSeen = (prefix) => G(`g.toastLog.some(t => t.startsWith(${JSON.stringify(prefix)}))`);
const goRoom = async (id) => { await tapRoom(id); await waitFor(`g.crew.station === "${id}" && !g.crew.walking`, 3000); await wait(150); };
const V = 'g.veins.current';
await runFrom('&noevents=1&vein=rich');
check('?vein=rich: a RICH vein spawns ahead with an early alert (toast + top-right chip + ore icon)', (await G(`(() => { const v = ${V}; return !!v && v.type === 'rich' && v.state === 'ahead' && g.veins.dist(v) > 20; })()`))
  && (await G('ui.chipText.visible && ui.chipText.text.startsWith("RICH VEIN") && ui.icons.find(i => i.k === "ore").img.visible')) && (await toastSeen('RICH VEIN AHEAD')), await G('ui.chipText.text'));
check('no extraction while the vein is still ahead / the rig is moving', await G('!g.availableActions("drill").includes("extract")'));
await freezeWhen(() => { const g = __drill.scene.getScene('Game'); const v = g.veins.current; return v && g.veins.dist(v) < 22; }, '26-vein-approach.png', 'Game');
check('stop-window brackets + distance label shown as the vein closes in', await G(`ui.chipText.text.match(/RICH VEIN \\d+M/) && g.veins.label.visible && g.veins.zone.commandBuffer.length > 0`), await G('ui.chipText.text + " / " + g.veins.label.text'));
// brake at the helm (outside slider to 0) with the vein just ahead of the drill tip
await page.waitForFunction(() => { const g = __drill.scene.getScene('Game'); const v = g.veins.current; return v && g.veins.dist(v) < 3; }, null, { timeout: 20000, polling: 'raf' });
await tap(...O_TRACK(0));
await waitFor('s.speed === 0', 2000); await wait(200);
const st = await G(`({ state: ${V}.state, d: +g.veins.dist(${V}).toFixed(2), speed: s.speed, chip: ui.chipText.text })`);
check('full stop with the drill face in the stop window -> STOPPED AT VEIN (chip + toast)', st.state === 'stopped' && st.chip === 'STOPPED AT VEIN' && st.d <= ORE.WINDOW_AHEAD && st.d >= -ORE.WINDOW_PAST && (await toastSeen('STOPPED AT VEIN')), JSON.stringify(st));
check('stopped at the vein: EXTRACT is available at the drill station', await G('g.availableActions("drill").includes("extract") && !g.availableActions("helm").includes("extract")'));
await tap(...TOGGLE); await wait(700);
await goRoom('drill');
check('drill panel: STOPPED AT RICH VEIN, EXTRACT + FIX BIT buttons, ORE/RISK bars', await G('ui.stationText.text === "DRILL   STOPPED AT RICH VEIN" && ui.actionBtns.extract.visible && ui.actionBtns.extract.enabled && ui.actionBtns.repair2.visible && ui.barLabels[0].visible'), await G('ui.stationText.text'));
const ex0 = await G(`({ ore: s.ore, haul: s.haul, inst: ${V}.inst })`);
await touchDown(...ACTION_LEFT); await wait(1500);
await page.screenshot({ path: `${OUT}/27-vein-extracting.png` });
const chipX = await G('ui.chipText.text');
await wait(300); await touchUp(); await wait(100);
const ex1 = await G(`({ ore: s.ore, haul: s.haul, inst: ${V}.inst, taken: ${V}.taken, credits: ${V}.credits, value: ${V}.value, hold: g.hold, state: ${V}.state, calm: s.calm && ui.speedText.text === 'ALL STOP' })`);
check('holding EXTRACT pays ore credits into the haul (value x taken)', ex1.ore - ex0.ore > 30 && Math.abs((ex1.haul - ex0.haul) - (ex1.ore - ex0.ore)) < 0.01 && Math.abs(ex1.credits - ex1.taken * ex1.value) < 0.01 && ex1.value === ORE.TYPES.rich.value && ex1.state === 'stopped',
  `+${(ex1.ore - ex0.ore).toFixed(1)} cr, taken ${(ex1.taken * 100).toFixed(0)}%`);
check('stopped at a vein is a calm full stop (ALL STOP), yet extraction risk still rises with greed', ex1.calm && ex1.inst > ex0.inst + 20 && Object.values(ORE.TYPES).every((t) => !('tremor' in t)), JSON.stringify({ calm: ex1.calm, inst: ex1.inst }));
check('extraction raises instability; chip reads EXTRACTING n%; releasing stops it', ex1.inst > ex0.inst + 20 && chipX.startsWith('EXTRACTING') && ex1.hold === null, `inst ${ex1.inst.toFixed(1)} chip=${chipX}`);
await wait(600);
check('instability bleeds off while nobody extracts (push-your-luck breather)', (await G(`${V}.inst`)) < ex1.inst - 5);
// greed: push instability to the edge and keep extracting -> collapse
const c0 = await G(`(${V}.inst = ORE_MAX, { ore: s.ore, hull: s.hull, credits: ${V}.credits })`.replace('ORE_MAX', ORE.COLLAPSE_AT - 1));
await touchDown(...ACTION_LEFT); await wait(500); await touchUp(); await wait(100);
const c1 = await G('({ ore: s.ore, hull: s.hull, collapsed: s.veinsCollapsed, v: g.veins.list.find(v => v.type === "rich"), hold: g.hold })');
check('risk warning toast as instability crosses 70 (no random tremor spikes)', await toastSeen('VEIN UNSTABLE'));
check('instability 100 -> VEIN COLLAPSED: drill integrity chipped, half that vein\'s ore lost (hopper first, then hold), hold released', c1.collapsed === 1 && c1.v.state === 'collapsed' && Math.abs((c0.hull - c1.hull) - ORE.TYPES.rich.dmg) < 0.6 && c1.ore < c0.ore - 20 && Math.abs(c1.v.credits - c0.credits / 2) < 2 && c1.hold === null && (await toastSeen('VEIN COLLAPSED')),
  `hull ${c0.hull.toFixed(1)} -> ${c1.hull.toFixed(1)}, ore ${c0.ore.toFixed(1)} -> ${c1.ore.toFixed(1)}`);
// a small vein, worked to the end (low instability: safe to empty)
await G('(g.veins.spawn("small", 168 - 4), s.heat = 0, true)'); await wait(300);
check('a vein inside the window while stopped is immediately STOPPED AT VEIN', await G(`${V}.type === "small" && ${V}.state === "stopped"`));
const sm0 = await G('s.ore');
await touchDown(...ACTION_LEFT); await wait(ORE.TYPES.small.secs * 1000 + 500); await touchUp(); await wait(100);
const sm1 = await G('({ ore: s.ore, worked: s.veinsWorked, v: g.veins.list.find(v => v.type === "small"), cur: !!g.veins.current })');
check('small vein worked to the end -> VEIN EMPTIED, full value paid, no collapse', sm1.v.state === 'emptied' && Math.abs(sm1.ore - sm0 - ORE.TYPES.small.value) < 0.01 && sm1.worked === 1 && !sm1.cur && (await toastSeen('VEIN EMPTIED')), `+${(sm1.ore - sm0).toFixed(1)}`);
// overshoot: full speed through a vein -> VEIN LOST, scrap only
await goRoom('helm');
await G('(g.veins.spawn("small", 168 - 30 * 4), g.setThrottle(1), true)');
await waitFor(`${V} && ${V}.state === "window"`, 8000);
const winMoving = await G('({ ex: g.availableActions("drill").includes("extract"), speed: s.speed })');
await waitFor('s.veinsLost === 1', 6000);
const lost = await G('({ lost: s.veinsLost, scrap: s.scrap, v: g.veins.list.filter(v => v.type === "small").at(-1) })');
check('drilling through at speed: no extraction in the window, then VEIN LOST + small scrap payout', !winMoving.ex && winMoving.speed > 0.3 && lost.lost === 1 && Math.abs(lost.scrap - ORE.TYPES.small.value * ORE.SCRAP_FRAC) < 0.01 && lost.v.state === 'lost' && (await toastSeen('VEIN LOST')), JSON.stringify({ winMoving, scrap: lost.scrap }));
// relay + end screen: ore shown separately
await G('(g.debugJump(985), s.hull = 100, g.setThrottle(1), true)');
await page.waitForFunction(() => __drill.scene.isActive('Relay'), null, { timeout: 15000 }).catch(() => {});
await R('r.skipTyping()'); await wait(200); await tap(90, 137); await wait(700);
const rOre = await R('({ t: r.oreText && r.oreText.text, ore: Math.floor(s.ore + s.scrap), drill: Math.floor(s.drillPay) })');
check('relay break shows what went in: CUT n ORE n LIQ n', rOre.t === `CUT ${rOre.drill} ORE ${rOre.ore} LIQ 0` && rOre.ore > 50, rOre.t);
await page.screenshot({ path: `${OUT}/31-relay-ore-breakdown.png` });
await tap(132, 277); await wait(1500);
const endOre = await page.evaluate(() => { const go = __drill.scene.getScene('GameOver'); return { active: __drill.scene.isActive('GameOver'), texts: go.children.list.map(c => c.text).filter(Boolean), run: __drill.scene.getScene('Game').lastRun }; });
check('end screen: ORE / LIQUID row (2 veins: emptied + collapsed)', endOre.active && endOre.texts.includes(' ORE 2V / LIQUID 0P') && endOre.texts.includes(`${Math.floor(endOre.run.ore + endOre.run.scrap)} / 0`) && endOre.run.veins === 2 && endOre.run.veinsLost === 1, JSON.stringify({ ore: endOre.run.ore, scrap: endOre.run.scrap, t: endOre.texts }));
await page.screenshot({ path: `${OUT}/32-end-ore-breakdown.png` });

// ---- [C] fires removed entirely --------------------------------------------------------------
await runFrom('&noevents=1&event=fire:engine');
await wait(2000);
const nf = await G(`({ trig: g.director.trigger('fire', 'engine'), fires: 'fires' in g.director, log: g.director.log.length, icon: ui.icons.some(i => i.k === 'fire'), ext: 'extinguish' in ui.actionBtns,
  flame: g.textures.exists('flame0'), acts: ['helm', 'drill', 'engine', 'tools', 'siphon'].flatMap(r => g.availableActions(r)), pool: ${JSON.stringify(EV.POOL)} })`);
check('fires are gone: ?event=fire is a no-op, no EXTINGUISH, no fire icon/flames, no fire in any event pool', !nf.trig && !nf.fires && nf.log === 0 && !nf.icon && !nf.ext && !nf.flame && !nf.acts.includes('extinguish')
  && nf.pool.every((p) => !p.includes('fire')) && !(await toastSeen('FIRE')), JSON.stringify(nf));
await tap(...TOGGLE); await wait(700);

// ---- events: JAM ----------------------------------------------------------------------------
await G('(s.heat = 10, s.hull = 100, g.director.trigger("jam"), true)'); await wait(900);
const jm = await G('({ jammed: s.jammed, speed: s.speed, icon: ui.icons.find(i => i.k === "jam").img.visible, hint: ui.hintText.text })');
check('DRILL JAMMED: the rig stalls, jam icon + helm hint', jm.jammed && jm.speed < 0.05 && jm.icon && jm.hint.startsWith('JAMMED: ROCK') && (await toastSeen('DRILL JAMMED')), JSON.stringify(jm));
await page.screenshot({ path: `${OUT}/29-event-jam.png` });
// (a jam stalls the rig = full stop: heat bleeds off at the calm rate meanwhile, so allow for that)
const j0 = await G('(s.heat = 50, { heat: s.heat, hull: s.hull })'); const jt0 = Date.now();
for (let i = 0; i < EV.JAM_ROCKS; i++) { await tap(...H_TRACK(0)); await wait(150); await tap(...H_TRACK(0.8)); await wait(250); }
const jCool = (CALMC.COOL + T.HEAT_COOL) * ((Date.now() - jt0) / 1000 + 0.3);
const j1 = await G('({ jammed: s.jammed, heat: s.heat, hull: s.hull })');
check(`fast fix at the HELM: rock the throttle 0% -> 60%+ x${EV.JAM_ROCKS} frees the bit, but costs heat + hull`, !j1.jammed && j1.heat >= j0.heat + EV.JAM_ROCKS * EV.JAM_ROCK_HEAT - jCool && Math.abs((j0.hull - j1.hull) - EV.JAM_ROCKS * EV.JAM_ROCK_HULL) < 0.01 && (await toastSeen('BIT ROCKED FREE')), JSON.stringify({ j0, j1 }));
await G('(s.heat = 0, g.director.trigger("jam"), g.setThrottle(0), true)');
await goRoom('drill');
const j2 = await G('({ hull: s.hull, panel: ui.stationText.text, btn: ui.actionBtns.freebit.visible })');
await hold(...ACTION_LEFT, EV.JAM_FIX_S * 1000 + 500);
const j3 = await G('({ jammed: s.jammed, hull: s.hull })');
check('slow free fix at DRL: hold FREE BIT frees it with no hull cost', j2.btn && j2.panel === 'DRILL   BIT JAMMED!' && !j3.jammed && j3.hull === j2.hull && (await toastSeen('BIT FREED AT DRL')), JSON.stringify({ j2, j3 }));

// ---- events: POWER SURGE -----------------------------------------------------------------------
await goRoom('helm'); await G('(g.setThrottle(0.6), s.heat = 10, true)'); await wait(1500);
await G('(g.director.trigger("surge"), true)'); await wait(300);
check('POWER SURGE: decision card with countdown + OVERCLOCK / SHUT DOWN', await G('ui.surgeShown && ui.surgeTitle.text.startsWith("POWER SURGE!") && ui.surgeBtns.every(b => b.visible) && ui.icons.find(i => i.k === "surge").img.visible'), await G('ui.surgeTitle.text'));
await page.screenshot({ path: `${OUT}/30-event-surge.png` });
const sg0 = await G('s.heat');
await tap(48, 90); await wait(200);
const sg1 = await G('({ oc: s.overclockT, heat: s.heat, boost: s.boostMul, card: ui.surgeShown })');
check('OVERCLOCK: x1.4 speed for 10 s, heat spike', sg1.oc > EV.OVERCLOCK_S - 0.5 && sg1.boost === EV.OVERCLOCK_SPEED && sg1.heat >= sg0 + EV.OVERCLOCK_HEAT - 0.5 && !sg1.card, JSON.stringify(sg1));
const oc0 = await G('({ h: s.drillPay, d: s.distance })'); await wait(1000); const oc1 = await G('({ h: s.drillPay, d: s.distance })');
const ocm = (oc1.d - oc0.d) / T.PX_PER_METER;
check('OVERCLOCK pays x1.5 per metre', ocm > 1 && Math.abs((oc1.h - oc0.h) - ocm * EV.OVERCLOCK_PAY) < 0.01, `+${ocm.toFixed(2)}m -> +${(oc1.h - oc0.h).toFixed(2)}`);
await G('(s.overclockT = 0, s.heat = 60, g.director.trigger("surge"), true)'); await wait(200);
await tap(132, 90); await wait(200);
const sd = await G('({ sd: s.shutdownT, heat: s.heat })');
await wait(1500);
check('SHUT DOWN: engine off (rig stops), vents heat', sd.sd > EV.SHUTDOWN_S - 0.5 && sd.heat <= 60 - EV.SHUTDOWN_COOL + 1 && (await G('s.speed')) < 0.05, JSON.stringify(sd));
await waitFor('s.shutdownT === 0', 4000); await wait(600);
check('engine restarts after the shutdown', (await G('s.speed')) > 0.05 && (await toastSeen('ENGINE BACK ONLINE')));
// (keep rolling at a safe grind speed: at a full stop the countdown would pause)
const to0 = await G('(g.setThrottle(0.3), g.obstacles.list.slice().forEach(o => g.obstacles.destroy(o, false)), s.hull = 80, s.heat = 10, g.director.trigger("surge"), { hull: s.hull })');
await wait(EV.SURGE_DECIDE_S * 1000 + 600);
const to1 = await G('({ hull: s.hull, heat: s.heat, card: ui.surgeShown })');
check('ignore the surge -> blowout down the umbilical: drill integrity + heat hit', !to1.card && Math.abs(to0.hull - to1.hull - EV.BLOWOUT_HULL) < 1 && to1.heat >= EV.BLOWOUT_HEAT - 1 && (await toastSeen('SURGE BLOWOUT')), JSON.stringify(to1));

// ---- random veins + the event scheduler by leg -------------------------------------------------
await runFrom('');
await G('(g.setThrottle(1), true)');
check('normal run: veins appear on their own', await waitFor('g.veins.log.length > 0', 12000), JSON.stringify(await G('g.veins.log')));
const legs = await G(`(() => { const d = g.director, out = { leg1: [], leg2first: null };
  g.debugJump(300); s.hull = 999;
  for (let i = 0; i < 40; i++) { d.clearAll(); d.timer = 0; d.update(0.01); const e = d.log.at(-1); if (e) out.leg1.push(e.type); d.log.length = 0; }
  d.clearAll(); g.debugJump(1300); d.timer = 0; d.update(0.01); out.leg2first = d.log.at(-1) && d.log.at(-1).type;
  out.leg2 = []; for (let i = 0; i < 40; i++) { d.clearAll(); d.timer = 0; d.update(0.01); out.leg2.push(d.log.at(-1).type); }
  d.clearAll(); s.hull = 100;
  const gaps = [0, 1].map((r) => { s.relays = r; return Array.from({ length: 50 }, () => d.gap()); });
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length; out.gap1 = +avg(gaps[0]).toFixed(1); out.gap2 = +avg(gaps[1]).toFixed(1); return out; })()`);
check('leg 1 events: jams (no fires since [C], no surge yet)', legs.leg1.length === 40 && legs.leg1.every((t) => t === 'jam'), legs.leg1.join(','));
check('leg 2: the first event is the new POWER SURGE; then jams + surges mix', legs.leg2first === 'surge' && ['jam', 'surge'].every((t) => legs.leg2.includes(t)) && !legs.leg2.includes('fire'), legs.leg2first + ' / ' + [...new Set(legs.leg2)].join(','));
check('events come more often in leg 2 (mean gap, s)', legs.gap2 < legs.gap1 - 5 && EV.GAP_S[1][1] < EV.GAP_S[0][1], JSON.stringify(legs));

// ---- full stop is safe ([C]) -------------------------------------------------------------------
await runFrom('');   // random events on (veins off for a clean chip)
await G('(g.debugJump(300), g.veins.enabled = false, g.veins.clear(), g.setThrottle(0.3), true)');
await wait(800);
const coolMul0 = await G('s.mods.coolMul');
await G('(s.mods.coolMul = 0, s.heat = 100, true)'); await wait(300);   // no cooling: the engine stays pinned at max heat
const movingHull = await G('s.hull');
await wait(500);
const movingHull1 = await G('s.hull');
await G(`(s.mods.coolMul = ${coolMul0}, true)`);
check('moving: an overheated engine damages the drill', movingHull1 < movingHull - 0.1, `${movingHull} -> ${movingHull1}`);
await G('(g.setThrottle(0), true)');
await waitFor('s.calm', 3000); await wait(400);
const spikes0 = await G('g.toastLog.filter(t => t.startsWith("COOLANT")).length');
const cs0 = await G('(g.director.timer = 0.3, s.spikeTimer = 0.2, s.heat = 100, s.wear = 100, s.hull = Math.min(s.hull, 30), s.addToHopper(60, 60), { hull: s.hull, log: g.director.log.length, settle: g.settle.emitting, hop: s.hopper })');
const ia = await G('ui.icons.filter(i => i.img.visible).map(i => +i.img.alpha.toFixed(2))'); await wait(170);
const ib = await G('ui.icons.filter(i => i.img.visible).map(i => +i.img.alpha.toFixed(2))');
await page.screenshot({ path: `${OUT}/33-all-stop.png` });
await wait(2800);
const cs1 = await G(`({ hull: s.hull, log: g.director.log.length, timer: g.director.timer, hop: s.hopper, power: s.power,
  heat: s.heat, spikes: g.toastLog.filter(t => t.startsWith("COOLANT")).length, spd: ui.speedText.text, chip: ui.chipText.text, ck: g.calmK,
  light: g.ship.warnLight.visible, bubble: g.ship.bubbles.tools.alpha })`);
check('full stop: no events spawn over 3 s (event timer paused) and no coolant leak', cs1.log === cs0.log && Math.abs(cs1.timer - 0.3) < 1e-9 && cs1.spikes === spikes0, JSON.stringify({ log: cs1.log, timer: cs1.timer }));
check('full stop: the conveyor gets all the power and drains the hopper', cs1.power.drill === 0 && cs1.power.rate === PWR.REACTOR * PWR.CONVEYOR_RATE && cs1.hop < cs0.hop - 15, JSON.stringify({ hop0: cs0.hop, hop1: cs1.hop, power: cs1.power }));
check('full stop: no drill integrity loss at all (maxed heat + dead bit)', cs1.hull === cs0.hull, `${cs0.hull} -> ${cs1.hull}`);
check(`full stop: heat drops fast (~${CALMC.COOL + T.HEAT_COOL}/s vs ${T.HEAT_COOL}/s passive)`, cs1.heat <= 100 - (CALMC.COOL + T.HEAT_COOL) * 2.8 * 0.85, `100 -> ${cs1.heat.toFixed(1)} in ~2.8 s`);
check('calm cues: ALL STOP in the bottom bar + chip, alarms dimmed and steady, hull light off, bubbles dimmed, dust settling', cs1.spd === 'ALL STOP' && cs1.chip === 'ALL STOP: HOLDING' && cs1.ck === 1 && !cs1.light && cs1.bubble < 0.5
  && ia.length > 0 && new Set(ia.concat(ib)).size === 1 && ia[0] <= 0.5 && cs0.settle, JSON.stringify({ ia, ib, bubble: cs1.bubble, settle: cs0.settle }));
await G('(s.heat = 30, g.setThrottle(0.8), g.director.trigger("jam"), true)'); await wait(1200);
const jc = await G('({ heat: s.heat, calm: s.calm, jammed: s.jammed })');
check('a jam stall is a full stop too: it builds no heat', jc.jammed && jc.calm && jc.heat < 30, JSON.stringify(jc));
await G('(g.director.fixJam(99), g.setThrottle(0), true)'); await wait(300);
const spHull = await G('(g.director.trigger("surge"), s.hull)'); await wait(2000);
const spz = await G('({ t: g.director.surge && g.director.surge.t, sub: ui.surgeSub.text, hull: s.hull })');
check('full stop: a pending POWER SURGE pauses its countdown (card says so)', spz.t === EV.SURGE_DECIDE_S && spz.sub === 'STOPPED: COUNTDOWN PAUSED' && spz.hull === spHull, JSON.stringify(spz));
// throttle up: everything resumes
await G('(g.obstacles.list.slice().forEach(o => g.obstacles.destroy(o, false)), s.wear = 100, g.setThrottle(0.3), true)');
await waitFor('!s.calm', 2000); const rs0 = await G('({ hull: s.hull, t: g.director.surge.t })'); await wait(1500);
const rs1 = await G('({ hull: s.hull, t: g.director.surge && g.director.surge.t, spd: ui.speedText.text, chip: ui.chipText.visible, ck: g.calmK, sub: ui.surgeSub.text })');
check('moving again: surge countdown + dead-bit drill damage resume; calm cues fade out', rs1.t < rs0.t - 1 && rs1.hull < rs0.hull && rs1.spd === 'SPD 30%' && !rs1.chip && rs1.ck === 0 && rs1.sub === 'PICK ONE OR IT BLOWS OUT', JSON.stringify({ rs0, rs1 }));
await G('(s.wear = 0, s.hull = 100, true)');
await G('(g.director.resolveSurge("overclock"), s.overclockT = 0, g.director.clearAll(), g.setThrottle(0), true)');
await waitFor('s.calm', 3000);
await G('(g.director.timer = 0.5, true)'); await wait(1200);
const ev0 = await G('g.director.log.length');
await G('(g.setThrottle(0.3), true)'); await waitFor('!s.calm', 2000); await wait(100);
const grace = await G('g.director.timer');
const resumed = await waitFor(`g.director.log.length > ${ev0}`, 7000);
check(`events resume after moving again (next one at least ${CALMC.RESUME_GRACE_S} s out)`, grace > CALMC.RESUME_GRACE_S - 0.5 && resumed, `timer after restart ${grace.toFixed(2)} s; events ${ev0} -> ${await G('g.director.log.length')}`);

// ---- side pockets + SIPHON seat ([C]) -------------------------------------------------------------
{ // own scope (names like fit/al are used elsewhere)
const SC = await page.evaluate(async () => { const c = await import(new URL('src/config.js', location.href).href); return { S: c.SIPHON, LL: c.LAYOUT }; });
const { S: SIP, LL } = SC;
const PK = 'g.pockets.current';
// drive at the pocket and stop inside the alignment window (throttle cut early enough to coast in)
const alignStop = async () => {
  await G('(g.setThrottle(0.4), true)');
  await page.waitForFunction(() => { const g = __drill.scene.getScene('Game'); const p = g.pockets.current; if (p && g.pockets.dist(p) < 14) { g.setThrottle(0.1); return true; } return false; }, null, { timeout: 20000, polling: 'raf' });
  await page.waitForFunction(() => { const g = __drill.scene.getScene('Game'); const p = g.pockets.current; if (p && g.pockets.dist(p) < 2.5) { g.setThrottle(0); return true; } return false; }, null, { timeout: 20000, polling: 'raf' });
  await waitFor('s.calm', 4000); await wait(250);
};
// a pocket you drive past is missed
await runFrom('&noevents=1&pocket=small&side=right');
check('?pocket=small&side=right: coerced to CORMORANT\'s siphon side: a SMALL pocket glows in the LEFT bore wall ahead, with early warning (toast + chip + icon)',
  (await G(`(() => { const p = ${PK}; return !!p && p.type === 'small' && p.side === 'left' && p.x + 10 < ${LL.SHIP_X} - 2 && p.state === 'ahead' && g.pockets.dist(p) > 30; })()`))
  && (await toastSeen('SMALL POCKET LEFT')) && (await G('ui.chipText.text.startsWith("SMALL POCKET L") && ui.icons.find(i => i.k === "liq").img.visible')), await G('ui.chipText.text'));
check('siphon side is per ship (config SHIPS.cormorant.siphonSide = left) and every spawned pocket is on it', await page.evaluate(async () => (await import(new URL('src/config.js', location.href).href)).SHIP.siphonSide === 'left')
  && await G('g.pockets.log.every(l => l.side === "left")'));
check('no pumping while the pocket is still ahead', await G('!g.availableActions("siphon").includes("pump")'));
await G('(g.setThrottle(0.6), true)');
const missed = await waitFor('s.pocketsMissed === 1', 15000);
check('drive past without stopping: POCKET MISSED (no window left behind)', missed && (await toastSeen('POCKET MISSED')) && (await G('!g.pockets.current && s.tank === 0')));

// the main pocket: RICH, left wall
await runFrom('&noevents=1&pocket=rich&side=left');
check('?pocket=rich&side=left: RICH pocket in the LEFT wall (outside the bore)', await G(`(() => { const p = ${PK}; return p.type === 'rich' && p.side === 'left' && p.x + 10 < ${LL.SHIP_X} - 2; })()`));
await G('(g.setThrottle(0.4), true)');
await page.waitForFunction(() => { const g = __drill.scene.getScene('Game'); const p = g.pockets.current; return p && g.pockets.dist(p) < 30; }, null, { timeout: 20000, polling: 'raf' });
check('approach: alignment bracket drawn at the hose port + chip counts down', await G(`g.pockets.zone.commandBuffer.length > 0 && /RICH POCKET L \\d+M/.test(ui.chipText.text)`), await G('ui.chipText.text'));
await page.waitForFunction(() => { const g = __drill.scene.getScene('Game'); const p = g.pockets.current; return p && p.state === 'window'; }, null, { timeout: 20000, polling: 'raf' });
check('in the window while moving: state window, toast FULL STOP!, pumping still not allowed', (await toastSeen('POCKET AT THE PORT')) && (await G('!g.pockets.canPump && g.pockets.hoseK === 0')));
await G('(g.setThrottle(0), true)');
await waitFor('s.calm', 4000); await wait(300);
const al = await G(`(() => { const p = ${PK}; return { st: p && p.state, d: p && g.pockets.dist(p), hose: g.pockets.hoseK, btn: ui.siphonBtn.gfx.visible, chip: ui.chipText.text, pilotBtn: ui.pilotBtn.gfx.visible }; })()`);
check(`full stop inside the window (${SIP.WINDOW_AHEAD} m ahead .. ${SIP.WINDOW_PAST} m past): STOPPED, hose runs out, GO TO SIPHON + chip`,
  al.st === 'stopped' && al.d <= SIP.WINDOW_AHEAD && al.d >= -SIP.WINDOW_PAST && al.hose === 1 && al.btn && al.chip === 'STOPPED AT POCKET' && (await toastSeen('POCKET ALIGNED')), JSON.stringify(al));
// seat required: holding PUMP anywhere else does nothing
await G('(g.setHold("pump"), true)'); await wait(600);
check('seat required: PUMP does nothing away from the SIPHON seat (Holt at the helm)', await G('s.tank === 0 && !g.availableActions().includes("pump") && g.availableActions("siphon").includes("pump")'));
await G('(g.setHold(null), true)');
const t0 = Date.now();
await tap(...PILOT_BTN);   // GO TO SIPHON (same slot as GO TO HELM)
const reached = await waitFor('g.crew.station === "siphon" && !g.crew.walking', 3000);
const trip = await G('g.crew.lastTrip');
check('GO TO SIPHON: Holt walks round the ring to the seat by the port (helm -> siphon, the long trip, < 2.3 s)', reached && trip.to === 'siphon' && trip.ms < 2300 && !(await G('ui.siphonBtn.gfx.visible')), `${trip.ms} ms from ${trip.from}`);
await tap(...TOGGLE); await waitFor('g.view.inside && g.cameras.main.zoom === 2', 3000); await wait(150);
// visible band = between the HUD (top 24 px) and the station panel (from y 232)
const fit = await G(`(() => { const c = g.cameras.main, v = c.worldView; const r = g.ship.room('siphon'); return { top: v.y + 24 / c.zoom, bot: v.y + 232 / c.zoom, ceil: r.ceil, floor: r.floorY, tip: ${LL.DRILL_UNIT.collarBot} }; })()`);
check('inside view: drill collar .. siphon seat all visible between HUD and panel', fit.top <= fit.tip && fit.bot >= fit.floor && fit.top <= LL.SHIP_TOP, JSON.stringify(fit));
check('siphon panel: TANK + PRESS gauges and HOLD: PUMP', await G('ui.stationText.text.startsWith("SIPHON   TANK 0/100L") && ui.pumpLabels.every(o => o.visible) && ui.actionBtns.pump.gfx.visible && ui.actionBtns.pump.enabled && ui.actionBtns.pump.text.text === "HOLD: PUMP"'), await G('ui.stationText.text'));
await page.screenshot({ path: `${OUT}/34-siphon-seat.png` });
// pump: tank fills, pocket drains, pressure rises; release: pressure falls
const v0 = await G(`${PK}.vol`);
await touchDown(...ACTION_FULL); await wait(1500);
const pm = await G(`({ tank: s.tank, cr: s.tankCr, vol: ${PK}.vol, press: g.pockets.pressure, pumping: g.pockets.pumping, chip: ui.chipText.text, working: g.crew.working })`);
await touchUp(); await wait(150);
const pr0 = await G(`({ press: g.pockets.pressure, tank: s.tank, vol: ${PK}.vol })`); await wait(900);
const pr = await G(`({ press: g.pockets.pressure, tank: s.tank, vol: ${PK}.vol })`);
check(`hold PUMP: tank fills (~${SIP.PUMP_RATE} L/s), the pocket drains by the same amount, line pressure builds`, pm.pumping && pm.working && pm.tank > SIP.PUMP_RATE * 1.0 && pm.tank < SIP.PUMP_RATE * 1.7 && Math.abs((v0 - pm.vol) - pm.tank) < 0.01 && pm.press > 20 && pm.cr > 0 && pm.chip.startsWith('PUMPING'), JSON.stringify(pm));
check(`release: pressure falls (${SIP.PRESS_FALL}/s), nothing more pumped`, pr.press < pr0.press - 20 && pr.tank === pr0.tank && pr.vol === pr0.vol && !(await G('g.pockets.pumping')), JSON.stringify({ pr0, pr }));
check('pocket visibly drains (fewer liquid rows drawn)', await G(`(() => { const p = ${PK}; return p.vol / p.def.vol < 0.8; })()`));
// outside view of the hose while pumping (hold set directly: the PUMP button lives in the inside panel)
await G('(g.view.set("outside"), g.setHold("pump"), true)'); await wait(700);
check('outside: hose from the hull port to the pocket, liquid flowing', await G('g.pockets.pumping && g.pockets.hose.commandBuffer.length > 0 && g.pockets.hoseK === 1'));
await page.screenshot({ path: `${OUT}/35-siphon-pumping.png` });
await G('(g.setHold(null), g.view.set("inside"), true)'); await wait(1500);
// full tank blocks pumping
const tk = await G(`(() => { s.tank = s.tankCap - 3; return s.tank; })()`);
await touchDown(...ACTION_FULL); await wait(800); await touchUp(); await wait(200);
const ft = await G('({ tank: s.tank, cap: s.tankCap, can: g.availableActions().includes("pump"), lbl: ui.actionBtns.pump.text.text, en: ui.actionBtns.pump.enabled, chip: ui.chipText.text, hold: g.hold })');
check('full tank: pumping stops at capacity, TANK FULL toast, PUMP disabled, chip says skip it', ft.tank === ft.cap && !ft.can && ft.lbl === 'TANK FULL' && !ft.en && ft.chip === 'TANK FULL: SKIP IT' && (await toastSeen('TANK FULL')) && ft.hold === null, JSON.stringify(ft));
await G('(g.setHold("pump"), true)'); await wait(400);
check('full tank: holding PUMP does nothing', (await G('s.tank')) === ft.cap && !(await G('g.pockets.pumping')));
await G('(g.setHold(null), true)');
const keepTank = await G('({ tank: s.tank, cr: s.tankCr })');
// burst: a VOLATILE pocket, sustained pumping
await runFrom('&noevents=1&pocket=volatile&side=left');
await alignStop();
check('VOLATILE pocket (siphon side, left) aligned with a full stop', await G(`${PK}.state === 'stopped' && ${PK}.side === 'left'`));
await tap(...TOGGLE); await waitFor('g.view.inside && g.cameras.main.zoom === 2', 3000); await wait(150); await goRoom('siphon');
const bh = await G('s.hull');
await touchDown(...ACTION_FULL);
const burst = await waitFor('s.bursts > 0', 4500);
await wait(90); await page.screenshot({ path: `${OUT}/36-siphon-burst.png` });
await touchUp();
const bs = await G(`(() => { const p = ${PK}; return { lost: p.lost, vol: p.vol, pumped: p.pumped, lock: g.pockets.lockT, press: g.pockets.pressure, hold: g.hold, hull: s.hull, lbl: ui.actionBtns.pump.text.text, en: ui.actionBtns.pump.enabled, chip: ui.chipText.text }; })()`);
check(`sustained pumping on a volatile pocket bursts the line (~${SIP.BURST_AT} pressure)`, burst && (await toastSeen('LINE BURST')), JSON.stringify(bs));
check(`burst: ${SIP.BURST_LOSS * 100}% of what's left is lost, pump locked ${SIP.BURST_LOCKOUT_S} s, hold released, no hull damage`,
  bs.lost > 0 && Math.abs(bs.lost - (bs.lost + bs.vol) * SIP.BURST_LOSS) < 0.01 && Math.abs(bs.pumped + bs.vol + bs.lost - 50) < 0.01 && bs.lock > SIP.BURST_LOCKOUT_S - 0.4 && bs.hold === null && bs.hull === bh && /^LINE BURST: \dS$/.test(bs.lbl) && !bs.en && bs.chip.startsWith('LINE BURST'), JSON.stringify(bs));
await wait(SIP.BURST_LOCKOUT_S * 1000 + 200);
check('after the lockout PUMP works again', await G('g.availableActions().includes("pump") && ui.actionBtns.pump.enabled'));
// keep going until drained
await touchDown(...ACTION_FULL); const drained = await waitFor(`!g.pockets.current || g.pockets.current.state !== 'stopped'`, 3000); await touchUp();
check('pump it dry: POCKET DRAINED', drained && (await toastSeen('POCKET DRAINED')), await G('g.toastLog.slice(-3).join(" / ")'));
// sell at the relay (Holt back at the helm to drive)
await goRoom('helm');
await G(`(s.tank = ${keepTank.tank}, s.tankCr = ${keepTank.cr}, g.debugJump(985), g.setThrottle(1), true)`);
const h0 = await G('s.haul');
await page.waitForFunction(() => __drill.scene.isActive('Relay'), null, { timeout: 15000 }).catch(() => {});
await wait(300);
const sold = await G('({ tank: s.tank, cr: s.tankCr, liquid: s.liquid, haul: s.haul })');
await R('r.skipTyping()'); await wait(200); await tap(90, 137); await wait(700);
const relayTxt = await R('r.oreText && r.oreText.text');
check('relay: the tank is sold into the hold (toast, tank empty, LIQ in the relay breakdown)', sold.tank === 0 && sold.cr === 0 && Math.abs(sold.liquid - keepTank.cr) < 1e-6 && sold.haul >= h0 + keepTank.cr - 0.01
  && (await toastSeen(`SOLD ${Math.round(keepTank.tank)} L LIQUID`)) && relayTxt.endsWith(`LIQ ${Math.floor(keepTank.cr)}`), JSON.stringify({ sold, relayTxt }));
// drill loss: liquid in the SHIP's tank is sold into the hold before the 1/3 is kept
await G('(g.pushOn(), true)'); await wait(300);
const hl = await G('(s.tank = 40, s.tankCr = 90, { haul: s.holdCr, liquid: s.liquid })');
await G('(s.hull = 0, true)');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 5000 }).catch(() => {});
await wait(300);
const lr = await G('g.lastRun');
const goT = await page.evaluate(() => __drill.scene.getScene('GameOver').children.list.map((c) => c.text).filter(Boolean));
check('drill loss: ship-tank liquid joins the hold before the 1/3 is kept; summary shows it on the ORE / LIQUID row', lr.liquid === Math.floor(hl.liquid + 90) && lr.haul >= Math.floor(hl.haul + 90) && lr.banked === Math.floor(lr.haul / 3 + 1e-9)
  && goT.some((t) => t.startsWith(' ORE ') && t.endsWith(' / LIQUID 1P')) && goT.some((t) => t.endsWith(`/ ${lr.liquid}`)), JSON.stringify({ liq: lr.liquid, haul: lr.haul, banked: lr.banked, goT }));
// stops never overlap: pockets vs veins vs boulders
await runFrom('');
const ov = await G(`(() => { g.debugJump(400); g.veins.spawn('rich', ${LL.DRILL_TIP_Y} - 60 * 4); const vAt = s.depth + g.veins.dist(g.veins.current);
  const r = { pBlocked: !g.pockets.spawnFilter(vAt + 10), pFree: g.pockets.spawnFilter(vAt + ${SIP.CLEAR_M} + 5) };
  g.veins.clear(); g.pockets.spawn('small', 'left', ${SIP.PORT_Y} - 60 * 4); const pAt = s.depth + g.pockets.dist(g.pockets.current);
  r.vBlocked = !g.veins.spawnFilter(pAt - 10); r.bBlocked = !g.obstacles.spawnFilter(pAt + 5); r.vFree = g.veins.spawnFilter(pAt + ${SIP.CLEAR_M} + 25);
  r.relay = !g.pockets.spawnFilter(995); return r; })()`);
check(`pockets keep ${SIP.CLEAR_M} m clear of vein stops + boulders (both ways) and of relays`, ov.pBlocked && ov.pFree && ov.vBlocked && ov.bBlocked && ov.vFree && ov.relay, JSON.stringify(ov));
await G('(g.pockets.clear(), g.pockets.nextAt = s.depth, g.setThrottle(0.3), true)'); await wait(600);
const rp = await G('g.pockets.log.slice(-1)[0]');
check('random pockets spawn during a normal run (type + side rolled)', !!rp && ['small', 'rich', 'volatile'].includes(rp.type) && ['left', 'right'].includes(rp.side), JSON.stringify(rp));
// the SIPHON slot parts change the rig
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drill.save')); s.owned.push('bigtank'); s.loadout.siphon = 'bigtank'; localStorage.setItem('drill.save', JSON.stringify(s)); });
await runFrom('&noevents=1');
check('SIPHON part BULK TANK: tank 160 L, slower pump', await G('s.tankCap === 160 && s.mods.pumpMul === 0.7'));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drill.save')); s.loadout.siphon = 'stocksiphon'; localStorage.setItem('drill.save', JSON.stringify(s)); });
}

{ // own scope
// ---- [C] drill + ship: power split, hopper -> conveyor -> hold, spill, HUD ----------------------
await runFrom('&noevents=1');
await G('(g.obstacles.spawnFilter = () => false, g.obstacles.list.slice().forEach(o => g.obstacles.destroy(o, false)), true)');
const ps = await G('[0, 0.4, 0.5, 1].map(v => s.powerSplit(v))');
const inflow = (v) => v * T.MAX_SPEED_PX / T.PX_PER_METER * PWR.ORE_PER_M;   // hopper units/s at an actual speed
check('power split: full stop -> conveyor gets the whole reactor (8 u/s); full speed -> drill draws 95, conveyor 0.4 u/s', ps[0].drill === 0 && ps[0].rate === PWR.REACTOR * PWR.CONVEYOR_RATE && Math.abs(ps[3].drill - PWR.DRILL_DRAW) < 1e-9 && Math.abs(ps[3].rate - 0.4) < 1e-9, JSON.stringify(ps));
check('power split: drill draw scales with speed; medium speed is viable (40% drains, 50% fills slowly, < 1 u/s)', Math.abs(ps[2].drill - PWR.DRILL_DRAW / 2) < 1e-9 && inflow(0.4) - ps[1].rate < 0 && inflow(0.5) - ps[2].rate > 0 && inflow(0.5) - ps[2].rate < 1 && inflow(1) - ps[3].rate > 9,
  JSON.stringify({ net40: +(inflow(0.4) - ps[1].rate).toFixed(2), net50: +(inflow(0.5) - ps[2].rate).toFixed(2), net100: +(inflow(1) - ps[3].rate).toFixed(2) }));
await G('(g.setThrottle(1), true)'); await waitFor('s.speed >= 1', 4000);
const f0 = await G('({ hop: s.hopper, hold: s.holdCr, t: g.time.now, d: s.distance })'); await wait(1000);
const f1 = await G('({ hop: s.hopper, hold: s.holdCr, t: g.time.now, d: s.distance, p: s.power, hud: ui.hopperText.text, holdTxt: ui.holdText.text })');
const fRate = (f1.hop - f0.hop) / ((f1.t - f0.t) / 1000);
check('full speed: cuttings fill the hopper fast (~+9.6 u/s), the starved conveyor barely moves any to the hold', Math.abs(fRate - (inflow(1) - 0.4)) < 1.2 && f1.hold - f0.hold < 1 && f1.hold - f0.hold > 0 && f1.p.drill === PWR.DRILL_DRAW, `${fRate.toFixed(2)} u/s, hold +${(f1.hold - f0.hold).toFixed(2)}`);
const hudN = +(f1.hud.match(/^HOP (\d+)\/120$/) || [])[1];
check('HUD: HOP n/120 and HOLD n match the state; power split bar + CNV/DRL labels beside the throttle', Math.abs(hudN - f1.hop) <= 1.5 && /^HOLD \d+$/.test(f1.holdTxt)
  && (await G('ui.pGfx.visible && ui.pGfx.commandBuffer.length > 0 && ui.pLabels.every(l => l.visible) && ui.pLabels[0].text === "CNV" && ui.pLabels[1].text === "DRL"')), JSON.stringify({ hud: f1.hud, hop: f1.hop, hold: f1.holdTxt }));
check('outside: the drill unit (cutterhead, body, coupling) sits above the box ship; hopper window shows the ore level', await G(`g.ship.drill.texture.key.startsWith('cutter') && g.ship.drill.y === ${LAY.DRILL_TIP_Y} && g.ship.drillBody.visible && g.ship.coupling.visible && g.ship.drillBody.y + g.ship.drillBody.height <= ${LAY.SHIP_TOP} && g.ship.drillFx.commandBuffer.length > 0`));
await page.screenshot({ path: `${OUT}/37-power-full-speed.png` });
// spill: top the hopper up and keep going flat out
await G('(s.addToHopper(s.hopperCap - s.hopper - 2, 30), g.toasts.length = 0, true)'); await wait(1200);
const sp1 = await G('({ hop: s.hopper, cap: s.hopperCap, spilled: s.spilled, spilledCr: s.spilledCr, spilling: s.spilling, hud: ui.hopperText.text, icon: ui.icons.find(i => i.k === "spill").img.visible, fx: g.ship.spillFx.emitting, helm: g.alerts().helm })');
check('full hopper SPILLS new cuttings: lost units counted, HOP SPILL! in the HUD, spill icon + particles, toast', sp1.hop >= sp1.cap - 1 && sp1.spilled > 5 && sp1.spilledCr > 5 && sp1.spilling && sp1.hud === 'HOP SPILL!' && sp1.icon && sp1.fx && sp1.helm && (await toastSeen('HOPPER FULL: SPILLING')), JSON.stringify(sp1));
await page.screenshot({ path: `${OUT}/38-hopper-spill.png` });
// medium speed: the hopper creeps up slowly (net < 1 u/s)
await G('(g.setThrottle(0.5), s.hopper = 40, s.hopperCr = 40, true)'); await waitFor('Math.abs(s.speed - 0.5) < 0.01', 3000); await wait(200);
const m0 = await G('({ hop: s.hopper, t: g.time.now })'); await wait(2000); const m1 = await G('({ hop: s.hopper, t: g.time.now, spill: s.spilling })');
const mRate = (m1.hop - m0.hop) / ((m1.t - m0.t) / 1000);
check('50% speed: the hopper creeps (about +0.8 u/s), no spill', mRate > 0 && mRate < 1.5 && !m1.spill, `${mRate.toFixed(2)} u/s`);
// full stop: the conveyor drains it quickly (not instantly) into the hold
await G('(g.setThrottle(0), s.hopper = 120, s.hopperCr = 240, true)'); await waitFor('s.calm', 3000);
const st0 = await G('({ hop: s.hopper, cr: s.hopperCr, hold: s.holdCr, t: g.time.now })'); await wait(1000);
const st1 = await G('({ hop: s.hopper, cr: s.hopperCr, hold: s.holdCr, t: g.time.now, p: s.power })');
const sRate = (st0.hop - st1.hop) / ((st1.t - st0.t) / 1000);
check('full stop: the conveyor drains ~8 u/s (a full hopper takes ~15 s) and the value lands in the hold', Math.abs(sRate - 8) < 0.8 && Math.abs((st1.hold - st0.hold) - (st0.cr - st1.cr)) < 0.01 && st1.p.drill === 0, `${sRate.toFixed(2)} u/s, hold +${(st1.hold - st0.hold).toFixed(1)}`);
await page.screenshot({ path: `${OUT}/39-power-full-stop.png` });
// inside: DRL console readout + wall monitor, helm power bar, hopper + conveyor in view
await tap(...TOGGLE); await wait(800);
await goRoom('drill');
const dr = await G('({ hint: ui.hintText.text, mon: g.ship.monitorGfx.commandBuffer.length > 0 })');
check('inside DRL (drill console): HOPPER n/cap BELT x/S readout + the wall monitor', /^HOPPER \d+\/120  BELT 8\.0\/S$/.test(dr.hint) && dr.mon, JSON.stringify(dr));
await page.screenshot({ path: `${OUT}/40-inside-drill-console.png` });
await goRoom('helm');
check('inside HELM: power split bar under the slider (DRILL / POWER / CONVEYOR)', await G('ui.pGfx.commandBuffer.length > 0 && ui.hpLabels.every(l => l.visible)'));
await tap(...TOGGLE); await wait(800);
// parts: BIG HOPPER (bigger bin, slower belt), HIGH-DRAW CUTTER (faster, starves the conveyor)
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drill.save')); s.owned.push('bighopper', 'highdraw'); s.loadout.hull = 'bighopper'; s.loadout.drill = 'highdraw'; localStorage.setItem('drill.save', JSON.stringify(s)); });
await runFrom('&noevents=1');
const pp = await G('({ cap: s.hopperCap, conv: s.mods.convMul, draw: s.mods.drawMul, top: s.mods.maxSpeedMul, stop: s.powerSplit(0).rate, full: s.powerSplit(s.mods.maxSpeedMul).rate, half: s.powerSplit(0.5 * s.mods.maxSpeedMul).rate, hud: ui.hopperText.text })');
check('BIG HOPPER: hopper 180, conveyor x0.75 (6 u/s at a stop); HIGH-DRAW CUTTER: +20% speed, the conveyor gets nothing at full speed', pp.cap === 180 && pp.conv === 0.75 && Math.abs(pp.stop - 6) < 1e-9 && pp.draw === 1.5 && pp.top === 1.2 && pp.full === 0 && pp.half < 1 && pp.hud === 'HOP 0/180', JSON.stringify(pp));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drill.save')); s.loadout.hull = 'stockhull'; s.loadout.drill = 'stockbit'; localStorage.setItem('drill.save', JSON.stringify(s)); });
}

// ---- save migration (v1 from M1, plus the pre-M1 best-depth key) ----------------------------
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('drill.save', JSON.stringify({ v: 1, credits: 777, runs: 3, cashouts: 2, rigsLost: 1, relaysReached: 4 })); localStorage.setItem('drill.bestDepth', '1234'); });
await page.goto(BASE + '?anim=0'); await wait(1500);
const mig = await page.evaluate(() => JSON.parse(localStorage.getItem('drill.save')));
check('v1 save migrates to v5 without losing credits, stats or best depth (rigsLost -> drillsLost)', mig.v === 5 && mig.credits === 777 && mig.runs === 3 && mig.cashouts === 2 && mig.drillsLost === 1 && !('rigsLost' in mig) && mig.relaysReached === 4 && mig.best.kessa4 === 1234 && mig.totalEarned === 777,
  JSON.stringify({ v: mig.v, c: mig.credits, runs: mig.runs, best: mig.best }));
const MIG_OPEN = ['harness', 'lightframe', 'grinder', 'governor', 'toolbelt', 'bigtank', 'bighopper']; // best 1234 m + 4 lifetime relays
check('migrated save: stock loadout, milestones already reached are open (silently)', mig.owned.length === 7 && Object.keys(mig.loadout).length === 7 && Object.values(mig.loadout).every((id) => P_[id].stock)
  && MIG_OPEN.every((id) => mig.unlocked.includes(id)) && mig.unlocked.length === MIG_OPEN.length && mig.newUnlocks.length === 0, JSON.stringify(mig.unlocked));
check('migrated vendor stock only offers unlocked parts (11: 2/1/2/1/2/2/1)', mig.vendor.stock.length === 11 && mig.vendor.stock.every((id) => !P_[id].unlock || mig.unlocked.includes(id)), mig.vendor.stock.join());
// v3 -> v4: the SIPHON slot arrives with the stock hand pump; nothing else changes
const m34 = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href);
  const v3 = { v: 3, credits: 4321, totalEarned: 9000, runs: 7, cashouts: 4, rigsLost: 3, relaysReached: 6, deepestRelay: 2, best: { kessa4: 1600 },
    owned: ['stockbit', 'stockengine', 'stockhull', 'stocktools', 'stockhelm', 'stockkit', 'diamond', 'lightboots'], loadout: { drill: 'diamond', engine: 'stockengine', hull: 'stockhull', tools: 'stocktools', helm: 'stockhelm', kit: 'lightboots' },
    vendor: { stock: ['grinder', 'coldloop', 'ablative', 'patchfoam', 'scanner', 'harness'], rerolls: 1, refreshes: 7 }, unlocked: ['harness', 'lightframe', 'grinder', 'governor', 'overdrive', 'quickcap', 'toolbelt'], newUnlocks: [], radio: [] };
  return S.migrate(v3); });
check('v3 save migrates to v5: credits/stats/loadout kept, HAND PUMP owned + fitted, siphon parts reached by depth open, stock gains siphon offers, drillsLost carried', m34.v === 5 && m34.drillsLost === 3 && m34.credits === 4321 && m34.runs === 7 && m34.loadout.drill === 'diamond' && m34.loadout.kit === 'lightboots'
  && m34.loadout.siphon === 'stocksiphon' && m34.owned.includes('stocksiphon') && m34.owned.length === 9 && m34.unlocked.includes('bigtank') && m34.unlocked.includes('highflow') && m34.vendor.stock.slice(0, 6).join() === 'grinder,coldloop,ablative,patchfoam,scanner,harness'
  && m34.vendor.stock.filter((id) => P_[id].slot === 'siphon').length === 2 && m34.vendor.rerolls === 1, JSON.stringify({ v: m34.v, l: m34.loadout, st: m34.vendor.stock, un: m34.unlocked }));
const m45 = await page.evaluate(async () => { const S = await import(new URL('src/systems/Save.js', location.href).href);
  const v4 = { v: 4, credits: 1500, totalEarned: 6000, runs: 9, cashouts: 5, rigsLost: 4, relaysReached: 8, deepestRelay: 3, best: { kessa4: 2600 },
    owned: ['stockbit', 'stockengine', 'stockhull', 'stocktools', 'stockhelm', 'stockkit', 'stocksiphon', 'plating'], loadout: { drill: 'stockbit', engine: 'stockengine', hull: 'plating', tools: 'stocktools', helm: 'stockhelm', kit: 'stockkit', siphon: 'stocksiphon' },
    vendor: { stock: ['grinder', 'coldloop', 'ablative', 'patchfoam', 'scanner', 'harness', 'bigtank'], rerolls: 0, refreshes: 9 }, unlocked: ['harness', 'lightframe', 'grinder', 'governor', 'overdrive', 'quickcap', 'plating', 'bypass', 'toolbelt', 'linkage', 'bigtank', 'highflow'], newUnlocks: [], radio: [] };
  return S.migrate(v4); });
check('v4 save migrates to v5: rigsLost -> drillsLost, loadout + stock kept, power-split parts reached by depth (2600 m) open silently', m45.v === 5 && m45.drillsLost === 4 && !('rigsLost' in m45) && m45.migratedFrom === 4 && m45.credits === 1500 && m45.loadout.hull === 'plating'
  && m45.unlocked.includes('bighopper') && m45.unlocked.includes('highdraw') && m45.newUnlocks.length === 0 && m45.vendor.stock.slice(0, 7).join() === 'grinder,coldloop,ablative,patchfoam,scanner,harness,bigtank', JSON.stringify({ v: m45.v, d: m45.drillsLost, un: m45.unlocked, st: m45.vendor.stock }));
check('title shows migrated credits + best', await page.evaluate(() => { const t = __drill.scene.getScene('Title'); const tx = t.children.list.map((c) => c.text).filter(Boolean); return tx.includes('CREDITS 777 CR') && tx.includes('BEST DEPTH 1234M'); }));
await tap(90, 160); await wait(800);
check('docked HUD shows migrated credits', (await D('u.creditText.text')) === '777 CR' && (await D('u.bestText.text')) === 'BEST 1234M');

// ---- CORMORANT: bottom bar hit boxes, outside framing, the camera transition, both breakaway styles ----
await page.goto(BASE + '?anim=0&noevents=1'); await wait(1500);
await tap(90, 160); await wait(800);
await startContract();
await waitFor('g.crew && g.crew.station === "helm"', 3000);
const cssPerBase = rect.w / 180;
const bar = await G('[ui.toggleBtn, ui.pilotBtn, ui.siphonBtn].map(b => ({ x: b.zone.x, y: b.zone.y, w: b.zone.width, h: b.zone.height, label: b.text.text }))');
check('bottom bar: OUTSIDE/INSIDE, GO TO HELM and GO TO SIPHON hit boxes are >= 44 CSS px tall (and wide) on a 390x844 phone, inside the bar', bar.every((b) => b.h * cssPerBase >= 44 && b.w * cssPerBase >= 44 && b.y >= 294 && b.y + b.h <= 320),
  bar.map((b) => `${b.label}: ${(b.w * cssPerBase).toFixed(0)}x${(b.h * cssPerBase).toFixed(0)} css`).join(' | '));
check('bottom bar: buttons ~1.75x taller than before (14 -> 24 base px), labels readable (6 px font) and nothing overlaps them', bar.every((b) => b.h >= 24) && bar[0].x + bar[0].w <= bar[1].x
  && (await G('ui.toggleBtn.text.fontSize === 6 && ui.plus.y + ui.plus.h <= 294 && ui.minus.y + ui.minus.h <= 294')));
await page.screenshot({ path: `${OUT}/41-bottom-bar.png`, clip: { x: rect.x, y: rect.y + 250 * cssPerBase, width: rect.w, height: 70 * cssPerBase } });
const ow = await G(`(() => { const c = g.cameras.main, E = ${JSON.stringify(LAY)}; return { tip: E.DRILL_TIP_Y - c.worldView.y, glowEnd: E.ENGINE_Y + 3 - c.worldView.y, hull: g.ship.exterior.texture.key, shipW: 62, drillW: E.DRILL_UNIT.w, shipH: E.SHIP_BOTTOM - E.FACE.y, faceOnCollar: E.FACE.y === E.DRILL_UNIT.collarBot }; })()`);
check('outside framing: drill tip ~y160, CORMORANT (70%: smaller than the 90 px drill) seated on the collar, engine glow ends above the bottom bar', ow.hull === 'cormorant' && ow.tip >= 156 && ow.tip <= 170 && ow.glowEnd <= 294 && ow.shipW < ow.drillW && ow.shipH <= 66 && ow.faceOnCollar, JSON.stringify(ow));
// the outside <-> inside transition: the hull 'roof' fades out as the top-down cutaway fades in
await tap(...TOGGLE); await wait(300);   // ~half of VIEW_PAN_MS (650)
const mid = await G('({ roof: g.ship.exterior.alpha, deck: g.ship.deck.alpha, holt: g.crew.sprite.alpha, zoom: g.cameras.main.zoom })');
await page.screenshot({ path: `${OUT}/42-transition-midpoint.png` });
check('transition midpoint: roof half-faded, cutaway half-in, camera mid-zoom', mid.roof > 0.1 && mid.roof < 0.9 && mid.deck > 0.1 && mid.deck < 0.9 && Math.abs(mid.roof + mid.deck - 1) < 0.02 && mid.zoom > 1.05 && mid.zoom < 1.95, JSON.stringify(mid));
await wait(700);
const fin = await G('({ roof: g.ship.exterior.alpha, deck: g.ship.deck.alpha, holt: g.crew.sprite.alpha, clamps: g.ship.coupling.alpha, zones: g.ship.roomZones.every(z => z.input && z.input.enabled), ship: g.ship.shipZone.input.enabled })');
check('inside: roof gone, cutaway + Holt fully in, room zones live, ship zone off', fin.roof === 0 && fin.deck === 1 && fin.holt === 1 && fin.clamps === 0 && fin.zones && !fin.ship, JSON.stringify(fin));
await tap(...TOGGLE); await wait(900);
check('back outside: roof back, cutaway + Holt hidden', await G('g.ship.exterior.alpha === 1 && g.ship.deck.alpha === 0 && g.crew.sprite.alpha === 0 && g.ship.shipZone.input.enabled'));
// breakaway, the ship's own style: CORMORANT flips 180 and burns out on her mains
const shipCfg = await page.evaluate(async () => { const c = await import(new URL('src/config.js', location.href).href); return { b: c.SHIP.breakaway, all: Object.fromEntries(Object.entries(c.SHIPS).map(([k, v]) => [k, v.breakaway])) }; });
check('per-ship breakaway setting: CORMORANT flip, BRAKEMAN + SISTER JUNE reverse, PATIENCE flip', shipCfg.b === 'flip' && shipCfg.all.brakeman === 'reverse' && shipCfg.all.sister_june === 'reverse' && shipCfg.all.patience === 'flip', JSON.stringify(shipCfg));
await G('(s.damage(9999), true)');
await waitFor('!!g.breakState', 3000);
await page.waitForFunction(() => { const b = __drill.scene.getScene('Game').breakState; return b && b.done; }, null, { timeout: 5000, polling: 'raf' }).catch(() => {});
const bf = await G('({ style: g.breakState.style, maxRot: g.breakState.maxRot, plume: g.breakState.plumeOn, retro: g.breakState.retroOn, y: g.breakState.ship.y })');
check("breakaway 'flip' (default): turns 180 deg, burns out on the mains, no retros", bf.style === 'flip' && Math.abs(bf.maxRot - Math.PI) < 0.05 && bf.plume && !bf.retro && bf.y > 330, JSON.stringify(bf));
// ?breakaway=reverse: backs straight out on the retro jets, nose still to the drill (future heavy/wide hulls)
await page.goto(BASE + '?anim=0&noevents=1&breakaway=reverse'); await wait(1500);
await tap(90, 160); await wait(800);
await startContract();
await waitFor('g.crew && g.crew.station === "helm"', 3000);
await G('(s.damage(9999), true)');
await waitFor('!!g.breakState', 3000);
await page.waitForFunction(() => { const b = __drill.scene.getScene('Game').breakState; return b && b.retroOn && b.ship.y > 275; }, null, { timeout: 4000, polling: 'raf' }).catch(() => {});
await page.screenshot({ path: `${OUT}/43-breakaway-reverse.png` });
await page.waitForFunction(() => { const b = __drill.scene.getScene('Game').breakState; return b && b.done; }, null, { timeout: 5000, polling: 'raf' }).catch(() => {});
const br = await G('({ style: g.breakState.style, maxRot: g.breakState.maxRot, plume: g.breakState.plumeOn, retro: g.breakState.retroOn, y: g.breakState.ship.y })');
check("?breakaway=reverse: backs straight out on the retro jets (never rotates), no main-engine burn", br.style === 'reverse' && br.maxRot < 0.01 && br.retro && !br.plume && br.y > 330, JSON.stringify(br));
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 5000 }).catch(() => {});
check('reverse breakaway still ends at DRILL LOST', await page.evaluate(() => __drill.scene.isActive('GameOver')));

check('no console errors', errs.length === 0, errs.join(' | '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
