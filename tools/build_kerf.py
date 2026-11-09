"""
Build "Kerf": a hairline stencil display face derived from Lexend (SIL OFL 1.1).

Every place where two strokes meet -- a bowl leaving a stem, an arm leaving a
spine, a crossbar meeting a bowl -- gets a narrow cut, so the light strokes read
as separate lines drawn with a pen that was lifted at each junction.

Method (raster round trip, no boolean-geometry library needed):
  1. instance the variable font at a light weight
  2. render each glyph large with FreeType (nonzero fill, overlaps resolved)
  3. skeletonize, find junctions, and pick the "through" stroke at each one
  4. erase a gap across every other branch, flush against the through stroke
  5. trace the result back to outlines and write a new font

Usage: python3 build_kerf.py <Lexend[wght].ttf> <out-dir> [weight]
"""
import sys, os, math
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from skimage.morphology import skeletonize
from scipy import ndimage
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset

SRC, OUT = sys.argv[1], sys.argv[2]
WEIGHT = float(sys.argv[3]) if len(sys.argv) > 3 else 200
S = 2000            # render size in px per em
GAP = 0.85          # gap width, in stroke widths
CHARS_ALL = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    " .,:;!?'\"-–—_/\\|()[]{}<>@#$%&*+=^~`·•→←↑↓°×…¥€£©®™"
)

# glyphs left whole: a cut at their junction reads as damage, not as a pen lift
# (the 3's two arcs meet in a point, so the cut lands across a curve)
NO_CUT = set("3")

CHARS = os.environ.get("KERF_ONLY") or CHARS_ALL

os.makedirs(OUT, exist_ok=True)
static_path = os.path.join(OUT, "_static.ttf")
vf = TTFont(SRC)
inst = instancer.instantiateVariableFont(vf, {"wght": WEIGHT})
inst.save(static_path)

font = TTFont(static_path)
upm = font["head"].unitsPerEm
cmap = font.getBestCmap()
pil = ImageFont.truetype(static_path, S)
asc = int(1.2 * S)
desc = int(0.45 * S)

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def render(ch):
    adv = pil.getlength(ch)
    w = int(adv + S * 0.6)
    h = asc + desc
    img = Image.new("L", (w, h), 0)
    ox = int(S * 0.3)
    ImageDraw.Draw(img).text((ox, asc), ch, font=pil, fill=255, anchor="ls")
    return (np.array(img) > 127), ox


def neighbours(sk, y, x):
    out = []
    for dy, dx in N8:
        yy, xx = y + dy, x + dx
        if 0 <= yy < sk.shape[0] and 0 <= xx < sk.shape[1] and sk[yy, xx]:
            out.append((yy, xx))
    return out


def prune(sk, min_len):
    """Remove skeleton spurs shorter than min_len that end in a free end."""
    sk = sk.copy()
    for _ in range(3):
        deg = ndimage.convolve(sk.astype(int), np.ones((3, 3), int), mode="constant") - 1
        deg[~sk] = 0
        ends = list(zip(*np.where((deg == 1) & sk)))
        changed = False
        for e in ends:
            path = [e]
            seen = {e}
            cur = e
            while True:
                nb = [p for p in neighbours(sk, *cur) if p not in seen]
                if len(nb) != 1:
                    break
                cur = nb[0]
                if deg[cur] >= 3:
                    break
                seen.add(cur)
                path.append(cur)
                if len(path) > min_len:
                    break
            if len(path) <= min_len and deg[cur] >= 3:
                for p in path:
                    sk[p] = False
                changed = True
        if not changed:
            break
    return sk


def trace_branch(sk, junction_set, start, came_from, length):
    """Walk along the skeleton from `start`, away from the junction cluster."""
    path = [start]
    seen = set(junction_set) | {start}
    cur = start
    while len(path) < length:
        nb = [p for p in neighbours(sk, *cur) if p not in seen]
        if not nb:
            break
        # prefer straight continuation
        if len(nb) > 1 and len(path) > 1:
            d0 = np.subtract(cur, path[-2])
            nb.sort(key=lambda p: -np.dot(np.subtract(p, cur), d0))
        cur = nb[0]
        seen.add(cur)
        path.append(cur)
    return path


def stencil(mask):
    dist = ndimage.distance_transform_edt(mask)
    sk = skeletonize(mask)
    if sk.sum() == 0:
        return mask
    stroke = 2 * np.median(dist[sk])          # stroke width in px
    sk = prune(sk, int(stroke * 1.5))
    deg = ndimage.convolve(sk.astype(int), np.ones((3, 3), int), mode="constant") - 1
    deg[~sk] = 0
    jpix = np.argwhere((deg >= 3) & sk)
    out = mask.copy()
    if len(jpix) == 0:
        cut_corners(mask, out, sk, stroke, [])
        return clean(out, stroke)

    # cluster junction pixels that belong to the same junction
    lab_img = np.zeros(mask.shape, bool)
    for y, x in jpix:
        lab_img[y, x] = True
    lab_img = ndimage.binary_dilation(lab_img, iterations=max(2, int(stroke * 0.6)))
    labels, n = ndimage.label(lab_img)

    look = int(stroke * 2.2)

    for k in range(1, n + 1):
        region = labels == k
        members = [tuple(p) for p in jpix if region[p[0], p[1]]]
        if not members:
            continue
        # skeleton pixels inside the cluster region are the "core"
        core = set(map(tuple, np.argwhere(region & sk)))
        cy, cx = np.mean(members, axis=0)
        # exits: skeleton pixels just outside the core touching it
        exits = []
        for p in core:
            for q in neighbours(sk, *p):
                if q not in core:
                    exits.append(q)
        exits = list(dict.fromkeys(exits))
        branches = []
        for e in exits:
            path = trace_branch(sk, core, e, None, look)
            if len(path) < stroke * 0.8:
                continue
            tip = np.array(path[min(len(path) - 1, int(stroke * 1.4))], float)
            d = tip - np.array([cy, cx])
            nrm = np.linalg.norm(d)
            if nrm < 1e-6:
                continue
            branches.append({"dir": d / nrm, "path": path})
        if len(branches) < 3:
            continue

        # the through stroke: the pair of branches closest to a straight line,
        # favouring vertical stems when it is a near tie
        best, best_score = None, 1e9
        for i in range(len(branches)):
            for j in range(i + 1, len(branches)):
                c = float(np.dot(branches[i]["dir"], branches[j]["dir"]))  # -1 = straight
                vert = abs(branches[i]["dir"][0]) + abs(branches[j]["dir"][0])
                score = c - 0.15 * vert
                if score < best_score:
                    best, best_score = (i, j), score
        through = set(best)

        # The through stroke, rebuilt as clean geometry: the skeleton bends
        # toward the branch near a junction, so near the junction it is replaced
        # by the straight segment between points well clear of it.
        k = int(stroke * 1.5)
        ia, ib = best
        pa_path, pb_path = branches[ia]["path"], branches[ib]["path"]
        pa = np.array(pa_path[min(len(pa_path) - 1, k)], float)
        pb = np.array(pb_path[min(len(pb_path) - 1, k)], float)
        lines = np.zeros(mask.shape, np.uint8)
        for path in (pa_path[k:], pb_path[k:]):
            if len(path) > 1:
                cv2.polylines(lines, [np.array([[x, y] for y, x in path], np.int32)], False, 1)
        # extend the segment a little past both ends so the stem stays whole
        seg = pb - pa
        L = np.linalg.norm(seg) or 1.0
        u = seg / L
        e1, e2 = pa - u * stroke, pb + u * stroke
        cv2.line(lines, (int(e1[1]), int(e1[0])), (int(e2[1]), int(e2[0])), 1)
        tdist = ndimage.distance_transform_edt(lines == 0)
        tmask = (tdist <= stroke * 0.5 + 1.0) & mask

        # junction centre: the point of the through line nearest the cluster
        c0 = np.array([cy, cx])
        t = np.clip(np.dot(c0 - pa, u), 0, L)
        centre = pa + u * t

        for i, b in enumerate(branches):
            if i in through:
                continue
            d = b["dir"]
            sin_t = max(0.4, abs(d[0] * u[1] - d[1] * u[0]))
            r2 = (stroke * 0.5) / sin_t + stroke * GAP
            half = stroke * 1.3
            perp = np.array([-d[1], d[0]])
            pts = []
            for a, s in ((-stroke, -half), (-stroke, half), (r2, half), (r2, -half)):
                p = centre + d * a + perp * s
                pts.append([p[1], p[0]])
            er = np.zeros(mask.shape, np.uint8)
            cv2.fillPoly(er, [np.round(np.array(pts)).astype(np.int32)], 1)
            out &= ~(er.astype(bool) & ~tmask)

    cut_corners(mask, out, sk, stroke, jpix)
    return clean(out, stroke)


def clean(out, stroke):
    # drop crumbs the cuts may leave behind
    lab, n = ndimage.label(out)
    if n:
        sizes = ndimage.sum(out, lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < stroke * stroke * 1.2:
                out[lab == i] = False
    return out


def cut_corners(mask, out, sk, stroke, jpix):
    """
    Cut where a bowl meets the end of a stem: a sharp corner of the skeleton
    whose inside is a counter (a hole), with one arm a straight upright stem.
    The bowl arm is separated from the stem; corners of straight strokes (L, E,
    V, M) have no counter inside or no upright stem, and stay whole.
    """
    pts = np.argwhere(sk).astype(float)
    if len(pts) < 10:
        return
    k = stroke * 1.2
    # stay clear of junctions, which have been handled
    far_from_j = np.ones(len(pts), bool)
    if len(jpix):
        jp = np.asarray(jpix, float)
        for i, p in enumerate(pts):
            if np.min(np.hypot(*(jp - p).T)) < stroke * 2.0:
                far_from_j[i] = False

    bg = ~mask
    lab, n = ndimage.label(bg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    holes = np.isin(lab, [i for i in range(1, n + 1) if i not in border])

    def arms(p, r, sector=None):
        d = np.hypot(*(pts - p).T)
        ring = pts[(d > r - 2) & (d < r + 2)]
        if len(ring) < 2:
            return []
        vec = ring - p
        vec /= np.linalg.norm(vec, axis=1)[:, None]
        if sector is not None:
            keep = vec @ sector > 0.6
            ring, vec = ring[keep], vec[keep]
            return [ring.mean(axis=0)] if len(ring) else []
        # two clusters by direction
        a = vec[0]
        g1 = vec @ a > 0.3
        if g1.all() or (~g1).all():
            return []
        return [ring[g1].mean(axis=0), ring[~g1].mean(axis=0)]

    cand = []
    for i, p in enumerate(pts):
        if not far_from_j[i]:
            continue
        a = arms(p, k)
        if len(a) != 2:
            continue
        u, v = a[0] - p, a[1] - p
        cosang = u @ v / (np.linalg.norm(u) * np.linalg.norm(v))
        ang = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
        if ang < 125:
            cand.append((ang, p, a))
    if not cand:
        return
    # one corner per cluster: the sharpest pixel
    cand.sort(key=lambda c: c[0])
    taken = []
    for ang, p, a in cand:
        if any(np.hypot(*(p - q)) < stroke * 2.5 for q in taken):
            continue
        taken.append(p)
        u = (a[0] - p) / np.linalg.norm(a[0] - p)
        v = (a[1] - p) / np.linalg.norm(a[1] - p)
        # inside of the corner must be a counter
        inside = p + (u + v) / (np.linalg.norm(u + v) or 1) * stroke * 1.2
        iy, ix = int(round(inside[0])), int(round(inside[1]))
        if not (0 <= iy < mask.shape[0] and 0 <= ix < mask.shape[1]) or not holes[iy, ix]:
            continue
        # which arm is a straight upright stem?
        arm_info = []
        for near, dvec in ((a[0], u), (a[1], v)):
            far = arms(p, k * 2.4, sector=dvec)
            if not far:
                arm_info.append(None)
                continue
            far = far[0]
            d2 = (far - near) / (np.linalg.norm(far - near) or 1)
            straight = d2 @ dvec > np.cos(np.radians(10))
            upright = abs(dvec[0]) > 0.9
            arm_info.append({"near": near, "far": far, "dir": dvec, "stem": straight and upright})
        if None in arm_info:
            continue
        stems = [i for i, x in enumerate(arm_info) if x["stem"]]
        if len(stems) != 1:
            continue
        S, B = arm_info[stems[0]], arm_info[1 - stems[0]]
        # true corner: where the stem's line meets the bowl arm's line
        sd = (S["near"] - S["far"]) / np.linalg.norm(S["near"] - S["far"])
        bd = B["dir"]
        A = np.array([[sd[0], -bd[0]], [sd[1], -bd[1]]])
        try:
            t = np.linalg.solve(A, B["near"] - S["far"])
            corner = S["far"] + sd * t[0]
        except np.linalg.LinAlgError:
            corner = p
        # protect the stem, its end cap included
        lines = np.zeros(mask.shape, np.uint8)
        e2 = corner + sd * stroke * 0.6
        cv2.line(lines, (int(S["far"][1]), int(S["far"][0])), (int(e2[1]), int(e2[0])), 1)
        tmask = (ndimage.distance_transform_edt(lines == 0) <= stroke * 0.5 + 1.0) & mask
        r2 = stroke * 0.5 + stroke * GAP
        half = stroke * 1.3
        perp = np.array([-bd[1], bd[0]])
        poly = []
        for a_, s_ in ((0, -half), (0, half), (r2, half), (r2, -half)):
            q = corner + bd * a_ + perp * s_
            poly.append([q[1], q[0]])
        er = np.zeros(mask.shape, np.uint8)
        cv2.fillPoly(er, [np.round(np.array(poly)).astype(np.int32)], 1)
        out &= ~(er.astype(bool) & ~tmask)


def contours_to_glyph(mask, ox):
    m = (mask.astype(np.uint8)) * 255
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    m = (m > 127).astype(np.uint8)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    pen = TTGlyphPen(None)
    sc = upm / S
    n = 0
    for c in cs:
        if len(c) < 8:
            continue
        ap = cv2.approxPolyDP(c, 0.9, True).reshape(-1, 2)
        if len(ap) < 3:
            continue
        pts = [((x - ox) * sc, (asc - y) * sc) for x, y in ap]
        # TrueType wants outer contours clockwise (y-up): signed area < 0
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts))) / 2
        is_hole = False
        # determine hole-ness from hierarchy: a contour with a parent is a hole
        idx = [i for i, cc in enumerate(cs) if cc is c][0]
        if hier is not None and hier[0][idx][3] != -1:
            is_hole = True
        want_cw = not is_hole
        if (area < 0) != want_cw:
            pts = pts[::-1]
        pts = [(round(x), round(y)) for x, y in pts]
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
        n += 1
    return pen.glyph(), n


glyf = font["glyf"]
hmtx = font["hmtx"]
done = 0
for ch in CHARS:
    cp = ord(ch)
    if cp not in cmap:
        continue
    name = cmap[cp]
    if ch == " ":
        continue
    mask, ox = render(ch)
    cut = mask if ch in NO_CUT else stencil(mask)
    g, n = contours_to_glyph(cut, ox)
    glyf[name] = g
    g.recalcBounds(glyf)
    adv, _ = hmtx[name]
    hmtx[name] = (adv, g.xMin if n else 0)
    done += 1

# no hinting: these outlines are new
for t in ("fpgm", "prep", "cvt ", "gasp", "hdmx", "LTSH", "VDMX"):
    if t in font:
        del font[t]
for name in font.getGlyphOrder():
    g = glyf[name]
    if hasattr(g, "program"):
        from fontTools.ttLib.tables import ttProgram
        g.program = ttProgram.Program()
        g.program.fromBytecode(b"")

# rename (OFL: derived fonts must not use the Reserved Font Name)
nm = font["name"]
for rec in list(nm.names):
    if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25):
        nm.removeNames(nameID=rec.nameID)
nm.setName("Kerf", 1, 3, 1, 0x409)
nm.setName("Regular", 2, 3, 1, 0x409)
nm.setName("Kerf Regular; derived from Lexend", 3, 3, 1, 0x409)
nm.setName("Kerf", 4, 3, 1, 0x409)
nm.setName("Kerf-Regular", 6, 3, 1, 0x409)
nm.setName("Kerf is a modified version of Lexend (SIL Open Font License 1.1).", 10, 3, 1, 0x409)
font["OS/2"].usWeightClass = 400

tmp = os.path.join(OUT, "_kerf.ttf")
font.save(tmp)

opts = subset.Options()
opts.flavor = "woff"
opts.layout_features = ["kern", "liga", "calt", "tnum", "case"]
opts.hinting = False
opts.name_IDs = ["*"]
f2 = TTFont(tmp)
s = subset.Subsetter(opts)
s.populate(text=CHARS)
s.subset(f2)
f2.flavor = "woff"
f2.save(os.path.join(OUT, "kerf.woff"))
f2.flavor = None
f2.save(os.path.join(OUT, "kerf.ttf"))
os.remove(tmp)
os.remove(static_path)
print("glyphs", done, "->", os.path.getsize(os.path.join(OUT, "kerf.woff")), "bytes")
