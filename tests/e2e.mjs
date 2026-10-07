import { chromium } from 'playwright';
const OUT = '/workspace/drill-game/screenshots';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('GL Driver'))) errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const wait = (ms) => page.waitForTimeout(ms);
const G = (fn) => page.evaluate(`(() => { const g = __drill.scene.getScene('Game'); const s = g.state; return (${fn}); })()`);

await page.evaluate(() => localStorage.clear()).catch(() => {});
await page.goto('http://localhost:8765/');
await wait(1500);
const rect = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const sc = rect.w / 180;
const P = (gx, gy) => ({ x: rect.x + gx * sc, y: rect.y + gy * sc }); // UI/base coords -> page coords
const tap = async (gx, gy) => { const p = P(gx, gy); await page.touchscreen.tap(p.x, p.y); };
const hold = async (gx, gy, ms) => {
  const p = P(gx, gy);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await wait(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
// world coords in INSIDE view (camera center 90,276 zoom 2) -> base coords
const insideW = (wx, wy) => [(wx - 90) * 2 + 90, (wy - 276) * 2 + 160];

console.log('canvas', rect, 'scale', sc.toFixed(2));
await tap(90, 160); // title -> game
await wait(800);
check('game scene running after tap-to-start', await page.evaluate(() => __drill.scene.isActive('Game') && __drill.scene.isActive('UI')));

// throttle via + button (3 taps: 0.3 -> 0.6) then slider tap
for (let i = 0; i < 3; i++) { await tap(167, 122); await wait(120); }
check('+ button raises throttle', Math.abs(await G('s.throttle') - 0.6) < 0.01, 'throttle=' + await G('s.throttle'));
await tap(167, 284); await wait(100);
check('- button lowers throttle', Math.abs(await G('s.throttle') - 0.5) < 0.01, 'throttle=' + await G('s.throttle'));
await tap(167, 134 + 138 * 0.2); await wait(100); // slider at 80%
check('slider sets throttle', Math.abs(await G('s.throttle') - 0.8) < 0.01, 'throttle=' + await G('s.throttle'));

// wait for depth / a boulder to come on screen
let t0 = Date.now();
while (Date.now() - t0 < 15000 && !(await G('g.obstacles.list.some(o => o.sprite.y > 120)'))) await wait(250);
const d1 = await G('s.depth');
check('depth increases', d1 > 5, 'depth=' + d1.toFixed(1));
check('boulder obstacle spawned ahead', await G('g.obstacles.list.length > 0'), 'count=' + await G('g.obstacles.list.length'));
check('heat builds at speed', (await G('s.heat')) > 0, 'heat=' + (await G('s.heat')).toFixed(1));
check('bit wear builds with distance', (await G('s.wear')) > 0, 'wear=' + (await G('s.wear')).toFixed(1));
await page.screenshot({ path: `${OUT}/01-outside-view.png` });

// let it ram at speed 0.8 -> hull should drop
const hullBefore = await G('s.hull');
t0 = Date.now();
while (Date.now() - t0 < 12000 && (await G('s.hull')) >= hullBefore) await wait(200);
const hullAfter = await G('s.hull');
check('ramming a boulder at speed drops hull', hullAfter < hullBefore, `hull ${hullBefore.toFixed(1)} -> ${hullAfter.toFixed(1)}`);

// toggle to inside
await tap(27, 308); await wait(900);
const cam = await G('({ mode: g.view.mode, zoom: g.cameras.main.zoom, cy: g.cameras.main.midPoint.y })');
check('view toggle -> inside (camera zoomed on ship)', cam.mode === 'inside' && Math.abs(cam.zoom - 2) < 0.01, JSON.stringify(cam));

// tap the engine room -> crew walks there
const crewX0 = await G('g.crew.sprite.x');
await tap(...insideW(62, 290)); await wait(250);
const walking = await G('g.crew.walking');
check('tapping Engine room starts walk', walking && (await G('g.crew.target')) === 'engine');
await wait(1800);
check('crew arrives at Engine station', (await G('g.crew.station')) === 'engine', `x ${crewX0} -> ${await G('g.crew.sprite.x')}`);

// vent: force heat high, hold the VENT button
await G('(s.heat = 90, s.throttle = 0, true)');
await wait(300);
await page.screenshot({ path: `${OUT}/02-inside-view.png` });
const h0 = await G('s.heat');
await hold(90, 273, 1200);
const h1 = await G('s.heat');
check('holding VENT at Engine lowers heat', h1 < h0 - 25, `heat ${h0.toFixed(1)} -> ${h1.toFixed(1)}`);

// drill: walk to drill room, hold repair
await G('(s.wear = 80, true)');
await tap(...insideW(90, 290)); await wait(1400);
check('crew walks to Drill station', (await G('g.crew.station')) === 'drill');
const w0 = await G('s.wear'); await hold(90, 273, 1000); const w1 = await G('s.wear');
check('holding FIX BIT at Drill lowers wear', w1 < w0 - 20, `wear ${w0.toFixed(1)} -> ${w1.toFixed(1)}`);

// tools: patch hull, blast boulder
await G('(s.hull = 50, true)');
await tap(...insideW(118, 290)); await wait(1400);
check('crew walks to Tools station', (await G('g.crew.station')) === 'tools');
const p0 = await G('s.hull'); await hold(48, 273, 1000); const p1 = await G('s.hull');
check('holding PATCH at Tools restores hull', p1 > p0 + 6, `hull ${p0.toFixed(1)} -> ${p1.toFixed(1)}`);
await G('(g.obstacles.spawn(s.depth), g.obstacles.list[g.obstacles.list.length-1].sprite.y = 120, true)');
await wait(100);
const n0 = await G('g.obstacles.list.length'); await hold(132, 273, 1500); const n1 = await G('g.obstacles.list.length');
check('holding BLAST at Tools clears a boulder', n1 < n0, `boulders ${n0} -> ${n1}`);
check('world alert bubbles exist & work', await G('(s.heat = 95, true)') && (await (async () => { await wait(200); return G('g.ship.bubbles.engine.visible'); })()));

// back outside
await tap(27, 308); await wait(900);
check('view toggle -> outside', (await G('g.view.mode')) === 'outside' && Math.abs(await G('g.cameras.main.zoom') - 1) < 0.01);

// game over: overheat + worn with low hull, at speed
await G('(s.hull = 6, s.heat = 100, s.wear = 100, s.setThrottle(0.5), true)');
t0 = Date.now();
while (Date.now() - t0 < 8000 && !(await page.evaluate(() => __drill.scene.isActive('GameOver')))) await wait(200);
await wait(600);
const go = await page.evaluate(() => ({ active: __drill.scene.isActive('GameOver'), best: localStorage.getItem('drill.bestDepth') }));
const finalDepth = Math.floor(await G('s.depth'));
check('hull 0 -> game over screen', go.active, JSON.stringify(go));
check('best depth saved to localStorage', Number(go.best) === finalDepth, `best=${go.best} depth=${finalDepth}`);
await page.screenshot({ path: `${OUT}/03-game-over.png` });

// restart
await tap(90, 207); await wait(1000);
const after = await G('({ depth: s.depth, hull: s.hull, over: g.over, ui: __drill.scene.isActive("UI"), go: __drill.scene.isActive("GameOver"), mode: g.view.mode })');
check('restart starts a fresh run', !after.over && after.hull === 100 && after.depth < 5 && after.ui && !after.go, JSON.stringify(after));
await wait(1500);
check('UI best label shows saved best', (await page.evaluate(() => __drill.scene.getScene('UI').bestText.text)).includes(go.best));

check('no console errors', errs.length === 0, errs.join(' | '));
console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
