# Pixel-art helpers for the ships-v2 concepts (game scale: 1 px = 1 game px).
import random, math
from PIL import Image, ImageDraw
from font import FONT

def hx(c, a=255):
    c = c.lstrip('#'); return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)

# dark -> light ramps (used-future palette; orange is accent only)
GUN   = ['#16181e', '#252931', '#353a45', '#4a505d', '#646b79', '#858c98']
CREAM = ['#4e4a3e', '#7a7462', '#a39c84', '#c4bc9f', '#ddd6bb']
OLIVE = ['#262a1c', '#383e2a', '#4d553a', '#646e4c', '#7f8a62']
TEAL  = ['#122826', '#1c3d3b', '#28554f', '#386e67', '#4f8b82']
OX    = ['#240e10', '#3d1719', '#5a2324', '#77312f', '#924540']
RUST  = ['#2a1a12', '#4a2c1c', '#6a4026', '#8a5632']
HAZ   = '#c9a43a'
ORNG  = '#d9822b'
GLASS = ['#0f2028', '#1b3a48', '#2c5c6e', '#6fb0c4', '#c8eef6']
ION   = ['#1d3c78', '#3a7ad9', '#7fd0ff', '#e6f8ff']
WARM  = '#ffd27a'
RED   = '#e0453a'
INK   = '#0c0b10'

class C:
    """An RGBA canvas with pixel-art drawing helpers. ox/oy is the ship origin (front-centre)."""
    def __init__(self, w, h, ox=0, oy=0):
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.img); self.ox, self.oy = ox, oy
    def X(self, x): return int(round(self.ox + x))
    def Y(self, y): return int(round(self.oy + y))
    def p(self, x, y, c, a=255):
        X, Y = self.X(x), self.Y(y)
        if 0 <= X < self.img.width and 0 <= Y < self.img.height:
            if a >= 255: self.img.putpixel((X, Y), hx(c))
            else:
                b = self.img.getpixel((X, Y)); f = hx(c); t = a / 255
                self.img.putpixel((X, Y), tuple(int(b[i] * (1 - t) + f[i] * t) for i in range(3)) + (max(b[3], a),))
    def r(self, x, y, w, h, c, a=255):
        if a >= 255: self.d.rectangle([self.X(x), self.Y(y), self.X(x) + w - 1, self.Y(y) + h - 1], fill=hx(c))
        else:
            for i in range(w):
                for j in range(h): self.p(x + i, y + j, c, a)
    def poly(self, pts, c): self.d.polygon([(self.X(x), self.Y(y)) for x, y in pts], fill=hx(c))
    def ell(self, cx, cy, rx, ry, c): self.d.ellipse([self.X(cx - rx), self.Y(cy - ry), self.X(cx + rx), self.Y(cy + ry)], fill=hx(c))
    def line(self, pts, c, w=1): self.d.line([(self.X(x), self.Y(y)) for x, y in pts], fill=hx(c), width=w)
    def text(self, x, y, s, c, sc=1):
        cx = x
        for ch in s.upper():
            g = FONT.get(ch, FONT[' '])
            for j, row in enumerate(g):
                for i, v in enumerate(row):
                    if v == '#': self.r(cx + i * sc, y + j * sc, sc, sc, c)
            cx += 4 * sc
    def paste(self, im, x, y): self.img.alpha_composite(im, (self.X(x), self.Y(y)))

def text_w(s, sc=1): return len(s) * 4 * sc - sc

def block(c, shape, pal, light=True, mid=2):
    """Draw a solid component: shape(cv) paints on a temp layer; we fill it with pal[mid] and bevel it (light from top-left)."""
    t = C(c.img.width, c.img.height, c.ox, c.oy); shape(t)
    a = t.img.split()[3]; W, H = a.size; px = a.load(); out = c.img.load()
    for y in range(H):
        for x in range(W):
            if px[x, y] < 128: continue
            up = y == 0 or px[x, y - 1] < 128; lf = x == 0 or px[x - 1, y] < 128
            dn = y == H - 1 or px[x, y + 1] < 128; rt = x == W - 1 or px[x + 1, y] < 128
            k = mid
            if light and (up or lf): k = min(len(pal) - 1, mid + 1)
            if light and (dn or rt): k = max(0, mid - 1)
            out[x, y] = hx(pal[k])
    return a

def mask_of(img):
    a = img.split()[3]; return a.point(lambda v: 255 if v > 0 else 0)

def outline(img, col=INK):
    """1 px dark outline around the opaque silhouette (classic pixel-art finish)."""
    a = mask_of(img); W, H = a.size; px = a.load(); o = Image.new('RGBA', img.size, (0, 0, 0, 0)); op = o.load()
    for y in range(H):
        for x in range(W):
            if px[x, y]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy]: op[x, y] = hx(col); break
    o.alpha_composite(img); return o

def grime(c, region_mask, seed, n=60, streak=0.35):
    """Used-future wear: dark speckle, carbon streaks running aft (down), a few bright scratches."""
    r = random.Random(seed); W, H = region_mask.size; m = region_mask.load(); img = c.img.load()
    pts = [(x, y) for y in range(H) for x in range(W) if m[x, y]]
    if not pts: return
    for _ in range(n):
        x, y = r.choice(pts); kind = r.random()
        if kind < streak:   # carbon streak trailing aft
            L = r.randint(2, 6); a = r.uniform(0.18, 0.35)
            for k in range(L):
                if y + k < H and m[x, y + k]:
                    b = img[x, y + k]; f = 1 - a * (1 - k / L); img[x, y + k] = (int(b[0] * f), int(b[1] * f), int(b[2] * f), b[3])
        elif kind < 0.9:    # pit / dirt
            b = img[x, y]; f = r.uniform(0.62, 0.82); img[x, y] = (int(b[0] * f), int(b[1] * f), int(b[2] * f), b[3])
        else:               # bright scratch
            b = img[x, y]; f = 1.25; img[x, y] = tuple(min(255, int(v * f)) for v in b[:3]) + (b[3],)

def rivets(c, x0, y0, x1, y1, col, step=3):
    n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) / step))
    for i in range(n + 1):
        t = i / n; c.p(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, col)

def hazard(c, x, y, w, h, phase=0):
    for i in range(w):
        for j in range(h):
            c.p(x + i, y + j, HAZ if ((i + j + phase) // 2) % 2 == 0 else '#1a1712')

def mount(c, x, y, used=False):
    """Module mount point: a 5x5 bolt-socket plate with 4 bolt holes (empty sockets read as dark, used ones carry a stub)."""
    c.r(x - 2, y - 2, 5, 5, GUN[1]); c.r(x - 1, y - 1, 3, 3, GUN[0] if not used else GUN[3])
    for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2)): c.p(x + dx, y + dy, GUN[4])
    if not used: c.p(x, y, '#000000')

def nozzle(c, x, y, d, glow=0.0, size=2):
    """A small retro/RCS nozzle pointing direction d=(dx,dy); glow draws a short blue jet."""
    dx, dy = d
    c.r(x - 1, y - 1, 3, 3, GUN[1]); c.p(x, y, GUN[0]); c.p(x + dx, y + dy, GUN[4])
    if glow > 0:
        for k in range(1, int(2 + 3 * glow)): c.p(x + dx * (k + 1), y + dy * (k + 1), ION[2] if k < 2 else ION[1], int(220 - 40 * k))

def engine_bell(c, x, y, w, glow, pal=GUN):
    """Main engine bell seen from above, exhaust aft (down)."""
    c.r(x - w // 2, y, w, 4, pal[2]); c.r(x - w // 2, y, w, 1, pal[4]); c.r(x - w // 2 + 1, y + 3, w - 2, 1, pal[0])
    c.r(x - w // 2 + 1, y + 4, w - 2, 2, '#121318')
    if glow > 0:
        for k in range(int(3 + 7 * glow)):
            ww = max(1, w - 2 - k // 2); a = int(255 * max(0, 1 - k / (3 + 7 * glow)))
            c.r(x - ww // 2, y + 5 + k, ww, 1, ION[3] if k < 1 else ION[2] if k < 3 else ION[1], a)

def glass(c, pts, frame=None):
    c.poly(pts, GLASS[1])
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    # highlight streak top-left
    c.line([(min(xs) + 1, min(ys) + 1), (min(xs) + 3, min(ys) + 1)], GLASS[3])

def light(c, x, y, col, on=True, big=False):
    c.p(x, y, col if on else '#3a2020')
    if on and big:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): c.p(x + dx, y + dy, col, 110)

def greebles(c, pal, seed, n=14, mid=3):
    """Small used-future surface detail on flat hull areas of base colour pal[mid]: vents, access panels, hatches, patch plates."""
    r = random.Random(seed); img = c.img; px = img.load(); base = hx(pal[mid]); W, H = img.size
    flat = [(x, y) for y in range(2, H - 8) for x in range(2, W - 8) if px[x, y] == base]
    def clear(x, y, w, h): return all(px[x + i, y + j] == base for i in range(-1, w + 1) for j in range(-1, h + 1) if 0 <= x + i < W and 0 <= y + j < H)
    placed = 0; tries = 0
    while placed < n and tries < 600 and flat:
        tries += 1; x, y = r.choice(flat); kind = r.random()
        if kind < 0.3 and clear(x, y, 4, 2):        # vent
            for i in range(4): px[x + i, y] = hx(pal[0]); px[x + i, y + 1] = hx(pal[min(len(pal) - 1, mid + 1)])
        elif kind < 0.6 and clear(x, y, 6, 5):      # access panel
            for i in range(6): px[x + i, y] = hx(pal[mid - 1]); px[x + i, y + 4] = hx(pal[min(len(pal) - 1, mid + 1)])
            for j in range(5): px[x, y + j] = hx(pal[mid - 1]); px[x + 5, y + j] = hx(pal[min(len(pal) - 1, mid + 1)])
        elif kind < 0.8 and clear(x, y, 3, 3):      # hatch / grab handle
            for i in range(3):
                for j in range(3): px[x + i, y + j] = hx(pal[mid - 1])
            px[x + 1, y + 1] = hx(pal[0])
        elif clear(x, y, 7, 4):                      # patch plate (mismatched)
            pp = r.choice([GUN, CREAM, OLIVE, TEAL]); 
            for i in range(7):
                for j in range(4): px[x + i, y + j] = hx(pp[2] if j else pp[3])
            px[x, y + 3] = hx(pp[0]); px[x + 6, y + 3] = hx(pp[0])
        else: continue
        placed += 1

def shadow(img, dx=2, dy=3, a=120):
    m = mask_of(img); sh = Image.new('RGBA', img.size, (6, 4, 10, a)); out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(sh, (dx, dy), m); return out
