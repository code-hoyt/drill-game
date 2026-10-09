# Generates the in-game CORMORANT art (assets/ships/*.png) from the ships-v2 concept drawing, with the
# game-scale fixes: a bigger cockpit pod with a readable canopy, no baked engine glow / nav lights (the game
# animates those), and the clamp arms + umbilicals on their own layer (they open in the breakaway).
# Run from this folder: python3 cormorant.py   (needs Pillow)
# Frame: every PNG is W x H with the ship origin (coupling face, centre line) at (ORX, ORY).
# In the run the origin sits at world (90, 236) = LAYOUT.FACE. Hull + clamps: 100x96, origin (50, 26);
# the interior deck: 100x126, origin (49, 26), full concept scale.
import math, os
from PIL import Image
from lib import *

W, H, ORX, ORY = 100, 126, 49, 26
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'ships')

def clamp_arm(c, root, jaw, elbow, thick=2):
    for w, col in ((thick + 2, INK), (thick, GUN[3])): c.line([root, elbow, jaw], col, w)
    c.line([(root[0], root[1] - 1), (elbow[0], elbow[1] - 1)], GUN[5])
    c.r(elbow[0] - 1, elbow[1] - 1, 3, 3, GUN[1]); c.p(elbow[0], elbow[1], GUN[4])
    c.r(root[0] - 2, root[1] - 2, 5, 4, GUN[2]); c.p(root[0], root[1] - 1, GUN[5])
    jx, jy = jaw; c.r(jx - 1, jy - 2, 3, 5, ORNG); c.r(jx - 1, jy - 2, 3, 1, '#f0a85a'); c.p(jx, jy + 2, '#7a4418')

def umbilicals(c, ship_sockets, drill_sockets=((-29, -12), (29, -12))):
    for (sx, sy), (dx, dy), col in zip(ship_sockets, drill_sockets, ('#c9473c', '#4aa3c8')):
        sd = -1 if sx < 0 else 1; mx, my = (sx + dx) / 2 + sd * 5, (sy + dy) / 2 + 2
        pts = [(dx, dy), (mx, my), (sx, sy)]
        c.line(pts, INK, 3); c.line(pts, col, 1)
        c.r(sx - 1, sy - 1, 3, 3, GUN[1]); c.p(sx, sy, col)

K = 0.7   # [C] ships are smaller than drills: the hull is drawn at ~70% of the concept (a tug pushing a big drill)
SW, SH, SOX, SOY = 100, 96, 50, 26   # hull + clamps frame (origin = coupling face, centre line)

def hull(c):
    """CORMORANT at 70%, simplified so it still reads at 1x: saucer, mandibles + throat, cockpit pod, three engines."""
    def shape(t):
        t.ell(0, 35, 28, 27, '#ffffff')
        t.poly([(-27, 2), (-12, 2), (-10, 17), (-27, 23)], '#ffffff')
    block(c, shape, CREAM, mid=3)
    greebles(c, CREAM, 101, 6)
    block(c, lambda t: t.poly([(12, 2), (27, 2), (27, 10), (12, 10)], '#ffffff'), GUN, mid=4)   # replacement right mandible
    # throat: the recessed coupling bay the TB-6 collar seats in
    block(c, lambda t: t.poly([(-11, 0), (11, 0), (10, 14), (-10, 14)], '#ffffff'), GUN, mid=1)
    c.line([(-8, 1), (-7, 12)], GUN[2]); c.line([(8, 1), (7, 12)], GUN[2])
    hazard(c, -10, 13, 21, 1, 0)
    # panel ring + oxblood rim stripe
    for a in range(0, 360, 8): c.p(math.cos(math.radians(a)) * 16, 35 + math.sin(math.radians(a)) * 16, CREAM[1])
    for a in range(130, 200, 3): c.p(math.cos(math.radians(a)) * 26, 35 + math.sin(math.radians(a)) * 26, OX[3])
    # hold hatch
    c.r(-6, 17, 12, 9, GUN[3]); c.r(-6, 17, 12, 1, GUN[5]); c.r(-5, 20, 10, 1, GUN[2]); c.r(-5, 23, 10, 1, GUN[2]); c.p(0, 21, HAZ)
    # reactor dome (vents animated in game)
    c.ell(-8, 43, 5, 5, GUN[1]); c.ell(-8, 42, 4, 4, GUN[3]); c.ell(-9, 41, 2, 2, GUN[4])
    # patch plate + sensor dish
    c.r(-21, 45, 6, 5, GUN[3]); c.r(-21, 45, 6, 1, GUN[4])
    c.ell(16, 45, 3, 2, CREAM[2]); c.p(16, 45, RED)
    # cockpit pod on a strut (kept big: it has to read at 1x)
    c.r(20, 27, 6, 5, GUN[1]); c.r(20, 28, 6, 3, GUN[3])
    block(c, lambda t: t.ell(29, 29, 5, 6, '#ffffff'), CREAM, mid=2)
    c.poly([(25, 23), (33, 23), (34, 28), (24, 28)], INK)
    c.poly([(26, 24), (32, 24), (33, 27), (25, 27)], GLASS[2])
    c.line([(26, 24), (28, 24)], GLASS[4]); c.p(29, 26, WARM)
    c.r(25, 30, 9, 1, OX[3])
    # engine arc + three bells (glow drawn by the game)
    for a in range(40, 141, 2):
        for rr in (25, 26): c.p(math.cos(math.radians(a)) * rr, 35 + math.sin(math.radians(a)) * rr, GUN[2])
    for x in (-10, 0, 10):
        c.r(x - 3, 58, 7, 4, GUN[1]); c.r(x - 2, 58, 5, 1, GUN[5]); c.r(x - 2, 59, 5, 2, GUN[3]); c.r(x - 2, 61, 5, 1, ION[0])
    # siphon port (left flank) + hose reel
    c.ell(-27, 38, 2, 2, TEAL[1]); c.p(-27, 38, TEAL[4]); c.r(-23, 37, 3, 3, GUN[2]); c.p(-22, 38, TEAL[4])
    # retro jets on the mandible fronts (the 'reverse' breakaway fires these)
    for x in (-24, -14, 14, 24): c.r(x - 1, 2, 2, 2, GUN[1]); c.p(x, 2, GUN[0])
    for k in range(4): c.r(18 + k * 2, 38, 1, 2, INK)
    grime(c, mask_of(c.img), 11, 45)
    hazard(c, -4, 0, 8, 4, 0); c.r(-2, 1, 4, 3, '#0d0c0f')   # conveyor intake

def save(img, name): img.save(os.path.join(OUT, name)); print(name, img.size)

def main():
    c = C(SW, SH, SOX, SOY); hull(c)
    o = outline(c.img); sh = shadow(o, 1, 2); sh.alpha_composite(o); save(sh, 'cormorant.png')
    # the interior deck (top-down cutaway base) is drawn at the FULL concept scale: the inside view is a
    # separate zoomed schematic, so rooms stay readable
    sil = C(W, H, ORX, ORY)
    sil.ell(0, 50, 40, 39, '#ffffff'); sil.poly([(-38, 3), (-17, 3), (-15, 26), (-38, 34)], '#ffffff'); sil.poly([(17, 3), (38, 3), (38, 14), (17, 14)], '#ffffff')
    sil.r(-16, 0, 33, 21, '#ffffff'); sil.r(29, 39, 9, 7, '#ffffff'); sil.ell(41, 42, 6, 8, '#ffffff')
    for x in (-14, 0, 14): sil.r(x - 3, 85, 7, 6, '#ffffff')
    mp = mask_of(sil.img).load(); base = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = base.load()
    for y in range(H):
        for x in range(W):
            if not mp[x, y]: continue
            edge = min((mp[x + dx, y + dy] if 0 <= x + dx < W and 0 <= y + dy < H else 0) for dx in range(-1, 2) for dy in range(-1, 2))
            px[x, y] = hx(CREAM[1]) if not edge else hx('#15161c')
    o2 = outline(base); sh2 = shadow(o2); sh2.alpha_composite(o2); save(sh2, 'cormorant_deck.png')
    # clamp arms + umbilicals: roots on the small hull, jaws on the full-size TB-6 rear frame
    k = C(SW, SH, SOX, SOY)
    umbilicals(k, ((-15, 6), (15, 6)))
    clamp_arm(k, (-22, 4), (-44, -21), (-40, -6)); clamp_arm(k, (22, 4), (44, -21), (40, -6))
    save(k.img, 'cormorant_clamps.png')
    big = Image.new('RGBA', (SW, SH), (27, 21, 33, 255)); big.alpha_composite(sh); big.alpha_composite(k.img)
    big.resize((SW * 3, SH * 3), Image.NEAREST).save(os.path.join(OUT, '..', '..', 'docs', 'ships', 'cormorant-ingame-art-3x.png'))

if __name__ == '__main__': main()
