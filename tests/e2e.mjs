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
await tap(90, 160); await wait(800);
check('game + UI scenes running after tap-to-start', await page.evaluate(() => __drill.scene.isActive('Game') && __drill.scene.isActive('UI')));
check('run starts with crew at the HELM (piloted)', await G('g.crew.station === "helm" && g.piloted'));
CAM = await page.evaluate(async () => (await import(new URL('src/config.js', location.href).href)).LAYOUT.INSIDE_CAM);
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

// ---- 2x2 layout: all 12 station-to-station trips are equal ------------------------------
// Euler circuit over every ordered pair of rooms, starting and ending at the helm.
const ids = ['helm', 'drill', 'engine', 'tools'];
const edges = Object.fromEntries(ids.map((a) => [a, ids.filter((b) => b !== a)]));
const circuit = []; const stack = ['helm'];
while (stack.length) { const v = stack[stack.length - 1]; if (edges[v].length) stack.push(edges[v].shift()); else circuit.push(stack.pop()); }
circuit.reverse();
const planned = await G(`(() => { const C = g.crew.constructor, out = {}; for (const a of g.ship.rooms) for (const b of g.ship.rooms) if (a !== b)
  out[a.id + '>' + b.id] = C.pathLength(a.standX, a.floorY, C.plan(g.ship, a.standX, a.floorY, b.id)); return out; })()`);
const lens = Object.values(planned);
check('12 planned trips, all equal path length', lens.length === 12 && lens.every((l) => l === lens[0]), `length=${lens[0]}px  ${JSON.stringify(planned)}`);
await G('(s.throttle = 0, true)');
const trips = [];
for (let i = 1; i < circuit.length; i++) {
  await tapRoom(circuit[i]);
  await waitFor(`g.crew.station === "${circuit[i]}"`, 3000);
  const t = await G('g.crew.lastTrip');
  trips.push({ ...t, ok: t && t.from === circuit[i - 1] && t.to === circuit[i] });
  await wait(60);
}
const pairs = new Set(trips.map((t) => t.from + '>' + t.to));
const ms = trips.map((t) => t.ms), lensWalked = trips.map((t) => t.length);
check('walked all 12 ordered trips by tapping rooms', trips.length === 12 && pairs.size === 12 && trips.every((t) => t.ok), [...pairs].join(' '));
check('every walked trip had the same path length', lensWalked.every((l) => l === lensWalked[0]), 'length=' + lensWalked[0]);
const mn = Math.min(...ms), mx = Math.max(...ms);
check('every trip takes ~0.6-1.0 s and times are roughly equal', mn >= 600 && mx <= 1000 && mx - mn <= 120, `min=${Math.round(mn)}ms max=${Math.round(mx)}ms`);
check('crew back at helm after the circuit', await G('g.crew.station === "helm" && g.piloted'));

// retargeting mid-walk
await tapRoom('engine'); await wait(150);
await tapRoom('tools'); await wait(30);
const re = await G('({ path: g.crew.path.map(p => [Math.round(p.x), Math.round(p.y)]), target: g.crew.target, x: g.crew.sprite.x, y: g.crew.sprite.y })');
const viaJunction = re.path.some(([x, y]) => x === 90 && y === 282);
check('retarget mid-walk re-plans via the hub junction', re.target === 'tools' && viaJunction && re.path.at(-1)[0] === 106, JSON.stringify(re));
await waitFor('g.crew.station === "tools"', 3000);
check('retargeted crew arrives at the new room', await G('g.crew.station === "tools"'));
await tapRoom('engine'); await wait(80);  // leaving tools walkway...
await tapRoom('tools'); await wait(30);   // ...change of mind: walk straight back
check('retarget back to the room just left walks straight back', await G('g.crew.path.length === 1 && g.crew.target === "tools"'));
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
check('holding VENT at Engine lowers heat', h1 < h0 - 25, `heat ${h0.toFixed(1)} -> ${h1.toFixed(1)}`);
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

// ---- game over + restart ------------------------------------------------------------
await G('(s.hull = 6, s.heat = 100, s.wear = 100, true)');
await page.waitForFunction(() => __drill.scene.isActive('GameOver'), null, { timeout: 8000 }).catch(() => {});
await wait(600);
const go = await page.evaluate(() => ({ active: __drill.scene.isActive('GameOver'), best: localStorage.getItem('drill.bestDepth') }));
const finalDepth = Math.floor(await G('s.depth'));
check('hull 0 -> game over screen', go.active, JSON.stringify(go));
check('best depth saved to localStorage', Number(go.best) === finalDepth, `best=${go.best} depth=${finalDepth}`);
await page.screenshot({ path: `${OUT}/04-game-over.png` });
await tap(90, 207); await wait(1000);
const after = await G('({ depth: s.depth, hull: s.hull, over: g.over, ui: __drill.scene.isActive("UI"), go: __drill.scene.isActive("GameOver"), helm: g.crew.station, piloted: g.piloted })');
check('restart: fresh run, crew back at helm', !after.over && after.hull === 100 && after.depth < 5 && after.ui && !after.go && after.helm === 'helm' && after.piloted, JSON.stringify(after));
await tap(...O_PLUS); await wait(120);
check('throttle works after restart', near(await thr(), 0.4), 'throttle=' + await thr());
check('UI best label shows saved best', (await G('ui.bestText.text')).includes(go.best));

check('no console errors', errs.length === 0, errs.join(' | '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
