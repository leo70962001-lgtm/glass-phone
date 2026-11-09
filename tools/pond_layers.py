r"""池塘桌布拆層：荷葉、荷花 → 一張圖集（各自可以動），水面補滿 → 另外跑 H3。
  py tools/pond_layers.py <pond.png> <out-base>      例：py tools/pond_layers.py D:\ai\gemini\glass-phone\wallpaper\pond2.png pond2
輸出 assets/<base>-plants.webp、assets/<base>-plants.json、tools/comfy/<base>-water.png、tools/shots/<base>-layers.png（檢查用）。
荷葉靠「綠比藍多」、花靠「R 接近 G」（水的亮部 R 比 G 低很多）。互相黏住的荷葉用手填的圓（SPLIT）切開。
上下緣被切掉的荷葉用鏡射補一段，飄動時才不會看到切口。"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, base = sys.argv[1], sys.argv[2]
PY = 48          # 上下鏡射補多少（原圖 px）
GUT = 14         # 每張小圖周圍留白（影子模糊要用）
ASPECT = 375 / 812

# 互相黏住的荷葉：圓心、半徑（原圖座標）
SPLIT = [
  (73, 80, 107), (240, 222, 96),
  (40, 1113, 50), (97, 1233, 101), (188, 1345, 72),
  (600, 913, 96), (736, 904, 53), (707, 1100, 60),
]

def push_pull(rgb, known):
    """未知的地方用周圍往內推（金字塔）"""
    levels = [(rgb * known[..., None], known.astype(np.float32))]
    while min(levels[-1][1].shape) > 1:
        c, w = levels[-1]
        h, wd = w.shape
        h2, w2 = h // 2, wd // 2
        cc = c[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 3).mean((1, 3))
        ww = w[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).mean((1, 3))
        levels.append((cc, ww))
    c, w = levels[-1]
    out = c / np.maximum(w[..., None], 1e-5)
    for c, w in reversed(levels[:-1]):
        z = (w.shape[0] / out.shape[0], w.shape[1] / out.shape[1], 1)
        up = ndi.zoom(out, z, order=1)
        a = np.clip(w * 4, 0, 1)[..., None]
        known_c = c / np.maximum(w[..., None], 1e-5)
        out = known_c * a + up * (1 - a)
    res = rgb.copy()
    res[~known] = out[~known]
    return res

im = np.pad(np.asarray(Image.open(src).convert('RGB')).astype(np.float32), ((PY, PY), (0, 0), (0, 0)), mode='symmetric')
Hh, Ww = im.shape[:2]
R, G, B = im[..., 0], im[..., 1], im[..., 2]
cw = min(Ww, round((Hh - 2 * PY) * ASPECT)); ch = round(cw / ASPECT)
x0, y0 = (Ww - cw) // 2, (Hh - 2 * PY - ch) // 2 + PY      # 跟 comfy_loop.py 同一個裁切

def comps(mask, least):
    lab, n = ndi.label(mask)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return lab, [i + 1 for i, s in enumerate(sizes) if s > least]

# 花
fl = ndi.binary_opening((R > 150) & (R > G - 12) & (B > 60), iterations=1)
lab, ids = comps(fl, 400)
fl = ndi.binary_fill_holes(ndi.binary_closing(np.isin(lab, ids), iterations=3))
# 荷葉（含花蓋住的地方）
pad0 = ndi.binary_opening((G - B > 18) & (G > R - 5) & (R > 0.30 * G), iterations=2)
plant = ndi.binary_fill_holes(ndi.binary_closing(pad0 | fl, iterations=3))
lab, ids = comps(plant, 500)
plant = np.isin(lab, ids)
fl &= plant
# 葉子的缺口被花圍住時 fill_holes 會把那塊水也算進來，挖掉
wedge = ndi.binary_opening(plant & ~ndi.binary_dilation(fl, iterations=2) & (G - B < 14) & (G > R + 15), iterations=1)
lab, ids = comps(wedge, 30)
plant &= ~np.isin(lab, ids)
fl_wide = ndi.binary_dilation(fl, iterations=4)       # 花瓣邊的灰影也算花，葉面要補掉

yy, xx = np.mgrid[0:Hh, 0:Ww].astype(np.float32)
padonly = plant & ~fl_wide
lab, ids = comps(padonly, 500)
pads = []
for i in ids:
    m = lab == i
    seeds = [(cx, cy + PY, r) for cx, cy, r in SPLIT if m[min(Hh - 1, cy + PY), min(Ww - 1, cx)]]
    if len(seeds) < 2:
        pads.append((m, None)); continue
    d = np.stack([np.hypot(xx - cx, yy - cy) / r for cx, cy, r in seeds])
    who = d.argmin(0)
    for k in range(len(seeds)):
        pads.append((m & (who == k), m))
pads = [(m, c) for m, c in pads if m.sum() > 500]

def hull_mask(m):
    ys, xs = np.nonzero(m)
    pts = np.stack([xs[::7], ys[::7]], 1)
    h = pts[ConvexHull(pts).vertices]
    img = Image.new('1', (Ww, Hh))
    ImageDraw.Draw(img).polygon([tuple(map(int, p)) for p in h], fill=1)
    return np.asarray(img)

sprites = []
for m, comp in pads:
    hull = hull_mask(m)
    under = fl_wide & hull & plant | (ndi.binary_dilation(fl_wide, iterations=2) & hull & plant)   # 花底下的葉面
    grown = m if comp is None else (ndi.binary_dilation(m, iterations=3) & comp)                   # 切開處互相多蓋一點，飄開才不會有縫
    known = grown & ~fl_wide
    full = grown | under
    rgb = push_pull(im, known) if under.any() else im
    sprites.append({'kind': 'pad', 'mask': full, 'rgb': rgb, 'area': int(m.sum())})
lab, ids = comps(fl, 400)
for i in ids:
    m = ndi.binary_dilation(lab == i, iterations=1)
    sprites.append({'kind': 'flower', 'mask': m, 'rgb': im, 'area': int(m.sum())})

# 水：荷葉、花和它們貼著的暗邊都補掉
hole = ndi.binary_dilation(plant, iterations=16)
water = push_pull(im, ~hole)
soft = ndi.gaussian_filter(hole.astype(np.float32), 4)[..., None]
water = im * (1 - soft) + water * soft
water = water[PY:Hh - PY]
out_water = os.path.join(ROOT, 'tools', 'comfy', base + '-water.png')
Image.fromarray(np.clip(water, 0, 255).astype(np.uint8)).save(out_water)

# 圖集
for s in sprites:
    m = s['mask']
    ys, xs = np.nonzero(m)
    s['x0'], s['x1'], s['y0'], s['y1'] = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    s['cx'], s['cy'] = float(xs.mean()), float(ys.mean())
    # 支點和大小用裁切框裡的座標
order = sorted(range(len(sprites)), key=lambda i: -(sprites[i]['y1'] - sprites[i]['y0']))
def pack(A):
    x, y, row = GUT, GUT, 0
    place = {}
    for i in order:
        s = sprites[i]
        w, h = s['x1'] - s['x0'], s['y1'] - s['y0']
        if x + w + GUT > A:
            x, y, row = GUT, y + row + 2 * GUT, 0
        if y + h + GUT > A: return None
        place[i] = (x, y); x += w + 2 * GUT; row = max(row, h)
    return place
A = 1024
place = pack(A)
while place is None:
    A += 256; place = pack(A)
atlas = np.zeros((A, A, 4), np.uint8)
color = np.zeros((A, A, 3), np.float32); cov = np.zeros((A, A), bool)
meta = []
for i, s in enumerate(sprites):
    px, py = place[i]
    x0s, x1s, y0s, y1s = s['x0'], s['x1'], s['y0'], s['y1']
    w, h = x1s - x0s, y1s - y0s
    m = s['mask'][y0s:y1s, x0s:x1s]
    d = ndi.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]      # 邊緣內縮一點點羽化，不帶水色
    a = np.clip((d - 0.6) / 1.5, 0, 1)
    color[py:py + h, px:px + w] = s['rgb'][y0s:y1s, x0s:x1s]
    cov[py:py + h, px:px + w] |= m
    atlas[py:py + h, px:px + w, 3] = (a * 255).astype(np.uint8)
    meta.append({'k': 0 if s['kind'] == 'pad' else 1, 'parent': -1, 'area': s['area'],
                 'x': round(s['cx'] - x0, 2), 'y': round(s['cy'] - y0, 2),          # 支點（裁切座標，原點左上）
                 'b': [x0s - GUT - x0, y0s - GUT - y0, w + 2 * GUT, h + 2 * GUT],   # 含留白的框
                 'a': [px - GUT, py - GUT, w + 2 * GUT, h + 2 * GUT]})
# 透明的地方顏色往外延伸，模糊／縮小時才不會帶黑邊
idx = ndi.distance_transform_edt(~cov, return_distances=False, return_indices=True)
atlas[..., :3] = np.clip(color[idx[0], idx[1]], 0, 255).astype(np.uint8)
# 花的父葉：壓得最多的那片
for i, s in enumerate(sprites):
    if s['kind'] != 'flower': continue
    best, bo = -1, 150
    for j, p in enumerate(sprites):
        if p['kind'] != 'pad': continue
        o = int((s['mask'] & p['mask']).sum())
        if o > bo: best, bo = j, o
    meta[i]['parent'] = best
Image.fromarray(atlas, 'RGBA').save(os.path.join(ROOT, 'assets', base + '-plants.webp'), quality=88, exact=True, method=6)
json.dump({'atlas': 'assets/' + base + '-plants.webp', 'size': A, 'crop': [cw, ch], 'sprites': meta},
          open(os.path.join(ROOT, 'assets', base + '-plants.json'), 'w', encoding='utf8'), separators=(',', ':'))

# 檢查：貼回去 vs 原圖
rest = np.concatenate([np.zeros((PY, Ww, 3)), water, np.zeros((PY, Ww, 3))], 0).astype(np.float32)
rest[:PY] = im[:PY]; rest[-PY:] = im[-PY:]
for i in [i for i, s in enumerate(sprites) if s['kind'] == 'pad'] + [i for i, s in enumerate(sprites) if s['kind'] == 'flower']:
    s = sprites[i]; px, py = place[i]
    y0s, y1s, x0s, x1s = s['y0'], s['y1'], s['x0'], s['x1']
    a = atlas[py:py + y1s - y0s, px:px + x1s - x0s, 3:].astype(np.float32) / 255
    rest[y0s:y1s, x0s:x1s] = rest[y0s:y1s, x0s:x1s] * (1 - a) + atlas[py:py + y1s - y0s, px:px + x1s - x0s, :3].astype(np.float32) * a
diff = np.abs(rest - im).mean(2)[PY:Hh - PY]
print('sprites', len(sprites), 'pads', sum(s['kind'] == 'pad' for s in sprites), 'flowers', sum(s['kind'] == 'flower' for s in sprites), 'atlas', A,
      'parents', [m['parent'] for m in meta if m['k'] == 1], 'crop', cw, ch, 'x0', x0, 'y0', y0 - PY)
print('rest vs original: mean %.2f, p99 %.1f, max %.1f' % (diff.mean(), np.percentile(diff, 99), diff.max()))
sheet = np.concatenate([im[PY:Hh - PY], np.clip(water, 0, 255), rest[PY:Hh - PY], np.repeat(np.clip(diff * 8, 0, 255)[..., None], 3, 2)], 1).astype(np.uint8)
os.makedirs(os.path.join(ROOT, 'tools', 'shots'), exist_ok=True)
Image.fromarray(sheet).resize((sheet.shape[1] // 2, sheet.shape[0] // 2), Image.LANCZOS).save(os.path.join(ROOT, 'tools', 'shots', base + '-layers.png'))
a8 = Image.fromarray(atlas, 'RGBA'); bg = Image.new('RGBA', a8.size, (255, 0, 255, 255)); bg.alpha_composite(a8)
bg.convert('RGB').resize((768, 768)).save(os.path.join(ROOT, 'tools', 'shots', base + '-atlas.png'))
