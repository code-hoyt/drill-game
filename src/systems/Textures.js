// All placeholder art is generated here at boot: no external assets.
import { LAYOUT as L } from '../config.js';

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
};

const ICON_SYMBOLS = {
  heat: ['..#..', '.##..', '.###.', '#####', '.###.'],
  bit:  ['..#..', '.###.', '.###.', '#####', '#.#.#'],
  hull: ['..#..', '..#..', '#####', '..#..', '..#..'],
  rock: ['.###.', '##.##', '#####', '###.#', '.###.'],
  hard: ['#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#'],
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

  // Ship exterior plating (covers the interior in the outside view)
  canvas(scene, 'ship_ext', L.SHIP_W, L.SHIP_BOTTOM - L.SHIP_TOP, (ctx, px) => {
    const w = L.SHIP_W, h = L.SHIP_BOTTOM - L.SHIP_TOP;
    px(0, 0, '#2b1712', w, h);
    px(1, 1, '#b5532f', w - 2, h - 2);
    for (let x = 1; x < w - 1; x += 14) px(x, 1, '#7a3320', 1, h - 2);
    for (let y = 1; y < h - 1; y += 13) px(1, y, '#7a3320', w - 2, 1);
    for (let x = 4; x < w - 3; x += 7) { px(x, 3, '#e3936a'); px(x, h - 4, '#e3936a'); }
    px(1, 1, '#d77a4f', w - 2, 1);
    px(1, h - 3, '#5a2416', w - 2, 2);
    // porthole over the helm (cockpit) room
    const helm = L.ROOMS.find((r) => r.id === 'helm') || { x: L.SHIP_X + w / 2 - 12, w: 24 };
    const pc = Math.round(helm.x - L.SHIP_X + helm.w / 2);
    px(pc - 5, 18, '#2b1712', 10, 10); px(pc - 4, 19, '#ffd27a', 8, 8); px(pc - 3, 20, '#fff2c4', 3, 2);
    // vents
    for (let i = 0; i < 3; i++) px(8, 22 + i * 4, '#3d1e15', 12, 2);
    // hatch
    px(w - 22, 20, '#7a3320', 14, 22); px(w - 21, 21, '#c96a42', 12, 20); px(w - 12, 31, '#3d1e15', 2, 2);
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
  const iconColors = { heat: '#d9412b', bit: '#d98a2b', hull: '#c42b55', rock: '#8a5ad9', hard: '#3a6ad9' };
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
