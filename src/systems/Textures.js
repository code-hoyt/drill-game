// All placeholder art is generated here at boot: no external assets.
import { LAYOUT as L, ROOM_GEOM, SIPHON } from '../config.js';

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(scene, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  const px = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  draw(ctx, px);
  tex.refresh();
}

// rows: array of strings, palette: char -> css color ('.' = transparent)
function pixelMap(scene, key, rows, palette) {
  canvas(scene, key, rows[0].length, rows.length, (ctx, px) => {
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (palette[c]) px(x, y, palette[c]); }));
  });
}

function noiseTile(scene, key, w, h, colors, seed, extra) {
  const r = rng(seed);
  canvas(scene, key, w, h, (ctx, px) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const band = Math.floor(y / 8) % 3; // faint strata
      const i = Math.min(colors.length - 1, Math.floor(r() * r() * colors.length + (band === 1 ? 0.6 : 0)));
      px(x, y, colors[i]);
    }
    if (extra) extra(px, r, w, h);
  });
}

const CREW_PAL = { h: '#e8e8f0', v: '#4fc3f7', s: '#f2a33a', d: '#9a5a1a', b: '#3b3b4a' };
const HEAD = ['..hhh..', '.hhhhh.', '.hvvvh.', '.hvvvh.'];
const CREW = {
  crew_idle:  [...HEAD, '..sss..', '.sssss.', 's.sss.s', 's.sss.s', '..d.d..', '..d.d..', '.bb.bb.'],
  crew_walk:  [...HEAD, '..sss..', '.sssss.', 's.sss.s', '..sss.s', '.d...d.', '.d...d.', 'bb...bb'],
  crew_work1: [...HEAD, '..sss.s', '.sssss.', 's.sss..', 's.sss..', '..d.d..', '..d.d..', '.bb.bb.'],
  crew_work2: [...HEAD, '..ssss.', '.ssssss', 's.sss..', 's.sss..', '..d.d..', '..d.d..', '.bb.bb.'],
  // seen from behind, on the ladder
  crew_climb1: ['..hhh..', '.hhhhh.', '.hhhhh.', 's.hhh.s', 's.sss.s', '.sssss.', '..sss..', '..sss..', '..d.d..', '..d.d..', '.b...b.'],
  crew_climb2: ['..hhh..', '.hhhhh.', '.hhhhh.', 's.hhh..', 's.sss.s', '.sssss.', '..sss.s', '..sss..', '..d.d..', '.d...d.', '.b...b.'],
};

const ICON_SYMBOLS = {
  heat: ['..#..', '.##..', '.###.', '#####', '.###.'],
  bit:  ['..#..', '.###.', '.###.', '#####', '#.#.#'],
  hull: ['..#..', '..#..', '#####', '..#..', '..#..'],
  rock: ['.###.', '##.##', '#####', '###.#', '.###.'],
  hard: ['#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#'],
  ore:  ['..#..', '.###.', '#####', '.###.', '..#..'],
  jam:  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  liq:  ['..#..', '.###.', '#####', '#####', '.###.'],
  surge: ['..##.', '.##..', '#####', '..##.', '.##..'],
  spill: ['#...#', '#...#', '.###.', '#.#.#', '.#.#.'],   // hopper overflowing
};

export function createTextures(scene) {
  // 1px / 2px particles
  canvas(scene, 'px', 1, 1, (c, px) => px(0, 0, '#ffffff'));
  canvas(scene, 'px2', 2, 2, (c, px) => px(0, 0, '#ffffff', 2, 2));

  // Rock, tunnel, hard-rock tiles
  noiseTile(scene, 'rock', 64, 64, ['#4a3350', '#3b2a3f', '#5a3f5e', '#2f2234'], 7, (px, r) => {
    for (let i = 0; i < 14; i++) { const x = Math.floor(r() * 62), y = Math.floor(r() * 62); px(x, y, '#6b4c70', 2, 2); px(x, y + 2, '#2a1e2e', 2, 1); }
    for (let i = 0; i < 3; i++) { const x = Math.floor(r() * 62), y = Math.floor(r() * 62); px(x, y, '#4fd1c5'); px(x + 1, y + 1, '#2c8f87'); }
  });
  noiseTile(scene, 'tunnel', 64, 64, ['#1c1422', '#22182a', '#150f1a'], 11, (px, r) => {
    for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 56); px(x, y, '#2c2034', 1, 6); }
  });
  noiseTile(scene, 'hardrock', 64, 32, ['#2c3350', '#363e60', '#232840'], 23, (px, r) => {
    for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 62), y = Math.floor(r() * 30); px(x, y, '#9ad0ff'); px(x + 1, y, '#5f86c0'); }
  });

  // Boulders (3 sizes)
  [['boulder_s', 7], ['boulder_m', 10], ['boulder_l', 13]].forEach(([key, rad], k) => {
    const r = rng(100 + k), d = rad * 2 + 2;
    canvas(scene, key, d, d, (ctx, px) => {
      const c = rad + 1;
      for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
        const dx = x - c + 0.5, dy = y - c + 0.5, dist = Math.hypot(dx, dy);
        const edge = rad - (r() < 0.25 ? 1 : 0);
        if (dist > edge) continue;
        let col = '#8a7f8f';
        if (dist > edge - 1.2) col = '#2a2430';
        else if (dx + dy < -rad * 0.6) col = '#b3a9b6';
        else if (dx + dy > rad * 0.6) col = '#5e5363';
        else if (r() < 0.08) col = '#6f6474';
        px(x, y, col);
      }
      px(c - 2, c, '#3a3240', 3, 1); px(c, c + 1, '#3a3240', 1, 2); // crack
    });
  });

  // Ore veins: a seam across the drill path (72x12), one palette per grade
  const VEINS = { small: ['#5a3a2e', '#7a4e36', '#d08a4a', '#f0b070'], rich: ['#4a3a22', '#6a5226', '#ffd23f', '#fff2a8'],
    fine: ['#26304a', '#3a4a6a', '#7ff0ff', '#e8d0ff'] };
  Object.entries(VEINS).forEach(([k, [d1, d2, c1, c2]], n) => {
    const r = rng(300 + n), W = 72, H = 12;
    canvas(scene, 'vein_' + k, W, H, (ctx, px) => {
      for (let x = 0; x < W; x++) {
        const half = 3 + Math.round(2.5 * Math.sin(x * 0.21 + n) + r() * 1.4) - (x < 5 || x > W - 6 ? 2 : 0);
        for (let y = 6 - half; y < 6 + half; y++) px(x, y, (y === 6 - half || y === 5 + half) ? '#1e1424' : (r() < 0.5 ? d1 : d2));
      }
      const crystals = k === 'small' ? 9 : k === 'rich' ? 14 : 18;
      for (let i = 0; i < crystals; i++) {
        const x = 3 + Math.floor(r() * (W - 6)), y = 3 + Math.floor(r() * 5);
        px(x, y, c1, 2, 2); px(x, y, c2); if (k !== 'small' && r() < 0.5) px(x + 2, y + 1, c1);
      }
    });
  });

  // Drill head (3 animation frames), points UP
  for (let f = 0; f < 3; f++) {
    const w = L.DRILL_W, h = 24, cx = w / 2;
    canvas(scene, 'drill' + f, w, h, (ctx, px) => {
      for (let y = 0; y < h; y++) {
        const hw = Math.round(1 + (y / (h - 1)) * (w / 2 - 1));
        for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
          const edge = x === Math.round(cx - hw) || x === Math.round(cx + hw) - 1;
          const stripe = ((x + y * 1 + f * 3) % 9 + 9) % 9 < 4;
          px(x, y, edge ? '#26262f' : stripe ? '#d4d6e2' : '#80839a');
        }
      }
      px(cx - 1, 0, '#ffffff', 2, 2);
    });
  }

  // ---- the DRILL UNIT ([C] separate machine: a simplified TB-6 "Grindstone", leased from Meridian) ----
  // cutterhead (3 frames: the disc cutters walk round the face), points UP; origin (0.5, 0) at DRILL_TIP_Y
  for (let f = 0; f < 3; f++) {
    canvas(scene, 'cutter' + f, 84, 13, (ctx, px) => {
      const W = 84, cx = W / 2;
      for (let x = 0; x < W; x++) {
        const t = (x - cx + 0.5) / cx;                         // -1..1
        const top = Math.round(1 + 7 * t * t);                 // shallow dome face
        for (let y = top; y < 10; y++) {
          const edge = y === top || x === 0 || x === W - 1;
          const band = ((x + f * 4) % 12) < 6;
          px(x, y, edge ? '#1a1c22' : y === top + 1 ? '#c9ced9' : band ? '#8a93a6' : '#6b7386');
        }
      }
      // disc cutters: bright nubs proud of the face, phase-shifted per frame
      for (let i = 0; i < 9; i++) {
        const x = Math.round(((i * 10 + f * 3.4) % 84));
        const t = (x - cx + 0.5) / cx, top = Math.round(1 + 7 * t * t);
        if (x > 1 && x < W - 3) { px(x, top - 1, '#1a1c22', 3, 2); px(x + 1, top - 1, '#f0f2f8'); px(x, top, '#d8dbe8', 3, 1); }
      }
      px(cx - 1, 0, '#ffffff', 2, 2);                          // centre cutter
      // gauge ring + bolts
      px(2, 10, '#14161c', W - 4, 3); px(3, 10, '#3a404d', W - 6, 2);
      for (let x = 6; x < W - 6; x += 8) px(x, 10, '#9aa0b0');
    });
  }
  // body: shield + grippers, thrust rams, rear frame, HOPPER (fill window), dock collar. 90x56 at (45, 180)
  const DU = L.DRILL_UNIT;
  canvas(scene, 'drillunit', DU.w, DU.collarBot - DU.bodyTop, (ctx, px) => {
    const Y = (wy) => wy - DU.bodyTop, X = (wx) => wx - DU.x;
    const OUT = '#14161c', STEEL = '#5d6676', LIT = '#8a93a6', DK = '#3a404d', YEL = '#d8b13a', BLK = '#1d1d22';
    // shield (y 180..202)
    px(5, 0, OUT, 80, 22); px(6, 1, STEEL, 78, 20);
    for (let x = 6; x < 84; x++) px(x, 1, ((x >> 2) % 2) ? YEL : BLK, 1, 3);          // Meridian hazard band
    px(6, 4, LIT, 78, 1);
    for (let x = 14; x < 80; x += 12) px(x, 5, DK, 1, 15);                              // ribs
    for (let x = 9; x < 84; x += 6) px(x, 19, '#a8b0c0');                               // rivets
    // stencil "TB-6" (3x5 glyphs) on the left panel
    const G = { T: ['###', '.#.', '.#.', '.#.', '.#.'], B: ['##.', '#.#', '##.', '#.#', '##.'], '-': ['...', '...', '###', '...', '...'], 6: ['###', '#..', '###', '#.#', '###'] };
    [...'TB-6'].forEach((ch, i) => G[ch].forEach((row, yy) => [...row].forEach((c, xx) => { if (c === '#') px(18 + i * 4 + xx, 9 + yy, '#d8dbe8'); })));
    // lease plate (right panel): a yellow tag
    px(60, 9, OUT, 14, 7); px(61, 10, YEL, 12, 5); px(62, 12, BLK, 10, 1);
    // grippers: arms out to pads braced on the bore walls
    for (const [x, ax] of [[0, 4], [85, 84]]) { px(ax, 9, DK, 2, 6); px(x, 6, OUT, 5, 13); px(x + (x ? 0 : 1), 7, '#7a6a4a', 4, 11); for (let y = 8; y < 18; y += 2) px(x + (x ? 0 : 1), y, '#4a3e2a', 4, 1); }
    // thrust rams (y 202..212): cylinders on the frame, chrome rods into the shield
    for (const x of [14, 30, 56, 72]) { px(x - 1, Y(202), OUT, 6, 4); px(x, Y(202), '#c9ced9', 4, 4); px(x - 2, Y(206), OUT, 8, 6); px(x - 1, Y(206), DK, 6, 6); px(x - 1, Y(206), '#6b7386', 6, 1); }
    // rear frame (y 212..216)
    px(8, Y(212), OUT, 74, 4); px(9, Y(212) + 1, STEEL, 72, 2); px(9, Y(212) + 1, LIT, 72, 1);
    // hopper (y 216..232): a trapezoid bin, fill window cut in the front face
    for (let y = Y(216); y < Y(232); y++) {
      const k = (y - Y(216)) / 16, l = Math.round(12 + 14 * k), r = Math.round(78 - 14 * k);
      px(l, y, OUT, r - l, 1); px(l + 1, y, y % 4 === 0 ? '#6a5a3a' : '#7a6a48', r - l - 2, 1);
    }
    px(12, Y(216), YEL, 66, 1);
    const w = DU.hopperWin;
    px(X(w.x) - 1, Y(w.y) - 1, OUT, w.w + 2, w.h + 2); px(X(w.x), Y(w.y), '#0e0c12', w.w, w.h);
    for (let x = X(w.x) + 4; x < X(w.x) + w.w; x += 5) px(x, Y(w.y), '#2a2430', 1, w.h);   // window bars
    // dock collar (y 232..236) where the conveyor chute leaves
    px(36, Y(232), OUT, 18, 4); px(37, Y(232), DK, 16, 3); px(37, Y(232), YEL, 16, 1);
  });
  // coupling (static): folded clamp arms from the ship's top corners to the rear frame, umbilicals. 90x30 at (45, 212)
  canvas(scene, 'coupling', 90, 30, (ctx, px) => {
    const OUT = '#14161c', ARM = '#b89a48', LIT = '#e0c26a';
    const seg = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c, 2, 2); };
    for (const m of [1, -1]) {
      const bx = m > 0 ? 7 : 81, ex = m > 0 ? 3 : 85, tx = m > 0 ? 11 : 77;   // base on the ship roof, elbow out, claw on the frame
      seg(bx, 28, ex, 15, OUT); seg(ex, 15, tx, 2, OUT); seg(bx, 27, ex, 14, ARM); seg(ex, 14, tx, 1, LIT);
      px(ex - 1, 13, OUT, 4, 4); px(ex, 14, '#ffd23f', 2, 2);                   // elbow joint
      px(tx - 2, 0, OUT, 6, 3); px(tx - 1, 0, ARM, 4, 2);                      // claw on the frame
    }
    // umbilicals: power (left, red) + coolant (right, blue), sagging from the hopper to the ship roof
    const hose = (pts, c, d) => { for (let i = 0; i < pts.length - 1; i++) { seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], d); } for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); for (let j = 0; j <= n; j++) px(Math.round(a[0] + (b[0] - a[0]) * j / n), Math.round(a[1] + (b[1] - a[1]) * j / n), c); } };
    hose([[16, 9], [14, 18], [18, 25], [22, 28]], '#d0503a', '#5a1a14');
    hose([[73, 9], [76, 18], [72, 25], [68, 28]], '#4a9ad8', '#163a5a');
    px(20, 27, OUT, 5, 3); px(65, 27, OUT, 5, 3);                                // roof sockets
    // conveyor chute: collar (x 82..98) down to the ship roof
    px(40, 24, OUT, 10, 6); px(41, 24, '#2a2e38', 8, 6); px(40, 24, '#6b7386', 1, 6); px(49, 24, '#6b7386', 1, 6);
  });

  // Ship exterior plating (covers the interior in the outside view). 2 decks tall.
  canvas(scene, 'ship_ext', L.SHIP_W, L.SHIP_BOTTOM - L.SHIP_TOP, (ctx, px) => {
    const w = L.SHIP_W, h = L.SHIP_BOTTOM - L.SHIP_TOP;
    const rel = (r) => ({ x: r.x - L.SHIP_X, cx: Math.round(r.cx - L.SHIP_X), ceil: r.ceil - L.SHIP_TOP, floor: r.floorY - L.SHIP_TOP });
    const room = (id) => rel(ROOM_GEOM.find((r) => r.id === id));
    const deckSeam = L.DECKS.top.floor - L.SHIP_TOP + 1;
    px(0, 0, '#2b1712', w, h);
    px(1, 1, '#b5532f', w - 2, h - 2);
    for (let x = 1; x < w - 1; x += 14) px(x, 1, '#7a3320', 1, h - 2);
    px(1, deckSeam, '#7a3320', w - 2, 2);                 // deck seam
    px(1, deckSeam + 2, '#d77a4f', w - 2, 1);
    for (let x = 4; x < w - 3; x += 7) { px(x, 3, '#e3936a'); px(x, deckSeam - 2, '#e3936a'); px(x, h - 4, '#e3936a'); }
    px(1, 1, '#d77a4f', w - 2, 1);
    px(1, h - 3, '#5a2416', w - 2, 2);
    // central spine over the hub
    px(L.HUB.x - L.SHIP_X, 1, '#8f3f24', L.HUB.w, h - 4);
    // cockpit porthole over the HELM, small one over the DRILL room
    const helm = room('helm'), drill = room('drill');
    px(helm.cx - 5, helm.ceil + 6, '#2b1712', 10, 10); px(helm.cx - 4, helm.ceil + 7, '#ffd27a', 8, 8); px(helm.cx - 3, helm.ceil + 8, '#fff2c4', 3, 2);
    px(drill.cx - 3, drill.ceil + 8, '#2b1712', 6, 6); px(drill.cx - 2, drill.ceil + 9, '#9ad0ff', 4, 4);
    // engine vents (bottom-left)
    const eng = room('engine');
    for (let i = 0; i < 3; i++) px(eng.x + 4, eng.ceil + 8 + i * 4, '#3d1e15', 14, 2);
    // hatch over TOOLS (bottom-right)
    const tls = room('tools');
    px(tls.x + 12, tls.ceil + 3, '#7a3320', 14, 20); px(tls.x + 13, tls.ceil + 4, '#c96a42', 12, 18); px(tls.x + 22, tls.ceil + 12, '#3d1e15', 2, 2);
    // hose ports on both flanks (bottom-deck level): the siphon hose runs out of these to a wall pocket
    const py = SIPHON.PORT_Y - L.SHIP_TOP;
    for (const x of [0, w - 3]) { px(x, py - 3, '#1b1c25', 3, 7); px(x + (x ? 0 : 1), py - 2, '#8d91a6', 2, 5); px(x + (x ? 0 : 1), py - 1, '#2a9a8a', 2, 3); }
  });
  // keel pod exterior (the SIPHON seat's blister under the hub)
  canvas(scene, 'pod_ext', L.POD.w, 19, (ctx, px) => {
    const w = L.POD.w;
    px(0, 0, '#2b1712', w, 19); px(1, 1, '#b5532f', w - 2, 16); px(1, 1, '#d77a4f', w - 2, 1); px(1, 15, '#5a2416', w - 2, 2);
    for (let x = 5; x < w - 3; x += 9) px(x, 4, '#e3936a');
    px(w / 2 - 6, 6, '#2b1712', 12, 6); px(w / 2 - 5, 7, '#2a9a8a', 10, 4); px(w / 2 - 4, 7, '#7ff0e0', 3, 1);   // tank window
  });
  // SIPHON seat: pump with a pressure gauge and a hose reel (8x11)
  canvas(scene, 'st_siphon', 8, 11, (ctx, px) => {
    px(1, 0, '#2a2a33', 7, 6); px(2, 1, '#d8dbe8', 5, 4); px(4, 2, '#c0202a', 1, 2); px(3, 3, '#2a2a33', 3, 1);   // gauge
    px(2, 6, '#2a9a8a', 6, 5); px(3, 7, '#7ff0e0', 1, 3); px(0, 8, '#555a6e', 2, 1);                              // pump body + hose
  });

  // Stations (12x14)
  canvas(scene, 'st_engine', 12, 14, (ctx, px) => {
    px(0, 2, '#2a2a33', 12, 12); px(1, 3, '#6d7184', 10, 10);
    px(2, 5, '#1b1b22', 8, 6); for (let i = 0; i < 3; i++) px(3, 6 + i * 2, '#ff6b3d', 6, 1);
    px(4, 0, '#8d91a6', 2, 3); px(8, 0, '#8d91a6', 2, 3);
  });
  canvas(scene, 'st_drill', 12, 14, (ctx, px) => {
    px(1, 0, '#2a2a33', 10, 9); px(2, 1, '#3fb6a8', 8, 6); px(3, 2, '#bff5ee', 2, 1); px(3, 4, '#1d6f66', 6, 1);
    px(5, 9, '#555a6e', 2, 3); px(2, 12, '#6d7184', 8, 2);
  });
  canvas(scene, 'st_tools', 12, 14, (ctx, px) => {
    px(0, 6, '#6b4a2b', 12, 2); px(1, 8, '#4a3220', 2, 6); px(9, 8, '#4a3220', 2, 6);
    px(2, 2, '#c0c4d0', 2, 4); px(1, 1, '#c0c4d0', 4, 2); px(7, 3, '#e0c040', 4, 3); px(8, 2, '#a08020', 2, 1);
  });

  canvas(scene, 'st_helm', 12, 14, (ctx, px) => {
    // console with viewscreen + throttle lever, pilot seat in front
    px(0, 0, '#2a2a33', 10, 8); px(1, 1, '#2d4a7a', 8, 5); px(2, 2, '#9ad0ff', 2, 1); px(2, 4, '#4f86c0', 5, 1);
    px(10, 2, '#555a6e', 1, 6); px(9, 1, '#ff6b3d', 3, 2);         // lever
    px(1, 8, '#555a6e', 9, 2);                                      // desk
    px(3, 10, '#7a3320', 5, 2); px(4, 12, '#3b3b4a', 1, 2); px(6, 12, '#3b3b4a', 1, 2); // seat
  });
  pixelMap(scene, 'lock', ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'], { '#': '#ff5a5a' });

  // Crew frames
  Object.entries(CREW).forEach(([k, rows]) => pixelMap(scene, k, rows, CREW_PAL));

  // Alert icons for HUD (11x11) and world bubble
  const iconColors = { heat: '#d9412b', bit: '#d98a2b', hull: '#c42b55', rock: '#8a5ad9', hard: '#3a6ad9', ore: '#b8901a', jam: '#56627e', surge: '#b0369a', liq: '#1f8a7c', spill: '#c07a1a' };
  Object.entries(ICON_SYMBOLS).forEach(([k, sym]) => {
    canvas(scene, 'ic_' + k, 11, 11, (ctx, px) => {
      px(1, 0, '#111', 9, 11); px(0, 1, '#111', 11, 9);
      px(1, 1, iconColors[k], 9, 9);
      sym.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') px(3 + x, 3 + y, '#ffffff'); }));
    });
  });
  pixelMap(scene, 'bubble', [
    '.#####.', '#yyyyy#', '#yyryy#', '#yyryy#', '#yyryy#', '#yyyyy#', '#yyryy#', '#yyyyy#', '.##.##.', '...#...',
  ], { '#': '#1a1a1a', y: '#ffd23f', r: '#c0202a' });
}
