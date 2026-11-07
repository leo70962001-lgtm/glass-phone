r"""鯉魚池影片逐格分析：找出每隻魚的位置、身長、方向，算群體的間距、速度與一致程度。
  C:\.venv\Scripts\python.exe tools\koi_analysis.py <out_dir> t1=frame1.jpg t2=frame2.jpg ...（同一段影片、時間相差 0.5 秒的成對畫面）
畫面是瀏覽器裡暫停影片的截圖（Top view, Koi pond. — youtube.com/watch?v=8vbths9cdHQ），只裁出影片區域。
偵測：和大範圍中位數（水的顏色）差很多、又比水亮的像素 → 只看池子中央 → 連通區塊。
每個區塊用二階矩求長軸（身長）與方向（只有軸向，正反不分）；兩隻黏在一起的大區塊不算。
成對畫面：先用背景的相位相關算出鏡頭晃動，扣掉後用最近鄰配對同一隻魚，得到速度和真正的游動方向。"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
frames = []
for a in sys.argv[2:]:
    t, p = a.split('=', 1)
    frames.append((float(t), p))
CROP = (0, 48, 790, 489)          # 截圖裡影片的範圍


def load(p):
    im = Image.open(p).convert('RGB').crop(CROP)
    return np.asarray(im).astype(np.float32) / 255


def detect(rgb):
    # 魚比周圍的水亮、顏色也不同：和大範圍中位數（當成水的顏色）差很多的地方就是魚
    bg = np.stack([ndimage.median_filter(rgb[..., c], size=41) for c in range(3)], -1)
    diff = np.sqrt(((rgb - bg) ** 2).sum(-1))
    bright = rgb.max(-1) - bg.max(-1)
    m = (diff > 0.16) & (bright > 0.04)
    roi = np.zeros(m.shape, bool); roi[95:400, 100:705] = True          # 池子中央：排除岸邊石頭、水草、上方倒影
    m &= roi
    m = ndimage.binary_closing(m, structure=np.ones((3, 3)), iterations=2)
    m = ndimage.binary_opening(m, structure=np.ones((2, 2)))
    lab, n = ndimage.label(m)
    fish = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if len(xs) < 60:
            continue
        cx, cy = xs.mean(), ys.mean()
        cov = np.cov(np.vstack([xs - cx, ys - cy]))
        w, v = np.linalg.eigh(cov)
        major = 4 * np.sqrt(max(w[1], 1e-6))
        minor = 4 * np.sqrt(max(w[0], 1e-6))
        if major < 18 or major / max(minor, 1) < 1.8 or major > 140:   # 不夠細長、太小或太大（兩隻黏在一起）都不算
            continue
        ang = np.arctan2(v[1, 1], v[0, 1])
        fish.append({'x': cx, 'y': cy, 'len': major, 'axis': ang, 'area': len(xs)})
    return fish, m


def shift(a, b):
    # 鏡頭晃動：灰階相位相關（魚只佔畫面一小部分，背景主導）
    ga, gb = a.mean(-1), b.mean(-1)
    ga = ga - ga.mean(); gb = gb - gb.mean()
    F = np.fft.fft2(ga) * np.conj(np.fft.fft2(gb))
    c = np.fft.ifft2(F / np.maximum(np.abs(F), 1e-9)).real
    y, x = np.unravel_index(np.argmax(c), c.shape)
    if y > c.shape[0] // 2: y -= c.shape[0]
    if x > c.shape[1] // 2: x -= c.shape[1]
    return -x, -y            # b 相對 a 的位移


def stats(fish):
    pts = np.array([[f['x'], f['y']] for f in fish])
    L = np.median([f['len'] for f in fish])
    d = np.sqrt(((pts[:, None] - pts[None]) ** 2).sum(-1)); np.fill_diagonal(d, np.inf)
    nnd = d.min(1) / L
    # 軸向一致度（正反不分）：|平均(e^{2iθ})|，0 = 亂、1 = 全部平行
    ax = np.array([f['axis'] for f in fish])
    nem = abs(np.exp(2j * ax).mean())
    # 分群：距離 < 2 個身長就算同一群
    adj = d < 2 * L
    lab = -np.ones(len(fish), int); k = 0
    for i in range(len(fish)):
        if lab[i] >= 0: continue
        stack = [i]; lab[i] = k
        while stack:
            j = stack.pop()
            for q in np.where(adj[j] & (lab < 0))[0]:
                lab[q] = k; stack.append(q)
        k += 1
    sizes = sorted(np.bincount(lab).tolist(), reverse=True)
    return L, nnd, nem, sizes, lab


report = {'source': 'https://www.youtube.com/watch?v=8vbths9cdHQ (Top view, Koi pond.)', 'frames': []}
det = []
for t, p in frames:
    rgb = load(p)
    fish, m = detect(rgb)
    det.append((t, rgb, fish))
    L, nnd, nem, sizes, lab = stats(fish)
    report['frames'].append({'t': t, 'fish': len(fish), 'bodyLenPx': round(float(L), 1),
                             'nndBL': {'median': round(float(np.median(nnd)), 2), 'p25': round(float(np.percentile(nnd, 25)), 2), 'p75': round(float(np.percentile(nnd, 75)), 2)},
                             'axisOrder': round(float(nem), 2), 'groupsWithin2BL': sizes})
    # 檢查用：偵測結果畫在畫面上
    im = Image.fromarray((rgb * 255).astype(np.uint8)); dr = ImageDraw.Draw(im)
    cols = [(255, 60, 60), (60, 220, 90), (70, 160, 255), (255, 210, 50), (220, 90, 255), (255, 140, 40)]
    for f, g in zip(fish, lab):
        c = cols[g % len(cols)]
        dx, dy = np.cos(f['axis']) * f['len'] / 2, np.sin(f['axis']) * f['len'] / 2
        dr.line([f['x'] - dx, f['y'] - dy, f['x'] + dx, f['y'] + dy], fill=c, width=3)
        dr.ellipse([f['x'] - 3, f['y'] - 3, f['x'] + 3, f['y'] + 3], outline=(255, 255, 255))
    im.save(os.path.join(OUT, f'det-{t:05.1f}.png'))

# 成對畫面（相差 0.5 秒）：速度、游動方向、極化
pairs = []
for (t0, a, fa), (t1, b, fb) in zip(det, det[1:]):
    dt = t1 - t0
    if not (0.3 < dt < 0.8):
        continue
    sx, sy = shift(a, b)
    L = np.median([f['len'] for f in fa])
    P0 = np.array([[f['x'], f['y']] for f in fa]); P1 = np.array([[f['x'] - sx, f['y'] - sy] for f in fb])
    d = np.sqrt(((P0[:, None] - P1[None]) ** 2).sum(-1))
    used, mv = set(), []
    for i in np.argsort(d.min(1)):
        j = int(np.argmin(d[i]))
        if j in used or d[i, j] > 0.9 * L:
            continue
        used.add(j)
        vx, vy = (P1[j] - P0[i]) / dt
        mv.append((vx, vy, i))
    sp = np.array([np.hypot(vx, vy) / L for vx, vy, _ in mv])
    moving = [(vx, vy) for vx, vy, _ in mv if np.hypot(vx, vy) / L > 0.15]
    pol = abs(np.mean([np.exp(1j * np.arctan2(vy, vx)) for vx, vy in moving])) if moving else 0
    # 和最近鄰居的游動方向夾角
    angs = {i: np.arctan2(vy, vx) for vx, vy, i in mv if np.hypot(vx, vy) / L > 0.15}
    nb = []
    for i, ai in angs.items():
        others = [j for j in angs if j != i]
        if not others: continue
        j = min(others, key=lambda q: np.hypot(*(P0[q] - P0[i])))
        nb.append(abs(np.angle(np.exp(1j * (angs[j] - ai)))) * 180 / np.pi)
    pairs.append({'t': [t0, t1], 'cameraShiftPx': [int(sx), int(sy)], 'matched': len(mv),
                  'speedBLps': {'median': round(float(np.median(sp)), 2), 'p25': round(float(np.percentile(sp, 25)), 2), 'p75': round(float(np.percentile(sp, 75)), 2), 'max': round(float(sp.max()), 2)},
                  'shareMoving': round(len(moving) / max(len(mv), 1), 2), 'polarization': round(float(pol), 2),
                  'neighbourHeadingDiffDeg': {'median': round(float(np.median(nb)), 0) if nb else None}})
report['pairs'] = pairs
json.dump(report, open(os.path.join(OUT, 'koi-analysis.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False, indent=1))
