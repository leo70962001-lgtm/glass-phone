r"""Gemini 錦鯉圖（綠幕、3×2 排列、頭朝右、俯視）→ 魚的圖集。
  C:\.venv\Scripts\python.exe tools\fish_atlas.py D:\ai\gemini\glass-phone\fish\koi-sheet.png
輸出：assets/fish.webp（512×256 一格、由上往下一列一隻）、assets/fish.json，
以及 D:\ai\gemini\glass-phone\fish\koi-<n>.png（單隻去背）和 fish-check.png（檢查用：棋盤格、深色、淺色底各一份）。
去背：綠幕程度 = G - max(R, B)，換成透明度；半透明的鰭用背景色反推原本的顏色，再壓掉殘留的綠色。"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT_DIR = os.path.dirname(SRC)
NAMES = ['kohaku', 'sanke', 'showa', 'ogon', 'asagi', 'tancho']
CW, CH = 512, 256

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255
H, W, _ = im.shape
border = np.concatenate([im[:6].reshape(-1, 3), im[-6:].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
bg = np.median(border, axis=0)
bgkey = bg[1] - max(bg[0], bg[2])
key = im[..., 1] - np.maximum(im[..., 0], im[..., 2])
alpha = np.clip(1 - (key - 0.06) / (bgkey * 0.8 - 0.06), 0, 1)
# 半透明處：觀察色 = α·原色 + (1-α)·背景 → 反推原色；再把綠色壓到不超過紅藍
a3 = np.maximum(alpha[..., None], 1e-3)
fg = np.clip((im - (1 - alpha[..., None]) * bg) / a3, 0, 1)
fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]) * 1.02 + 0.02)
fg = np.where(alpha[..., None] > 0.995, np.minimum(im, np.concatenate([im[..., :1], np.minimum(im[..., 1:2], np.maximum(im[..., :1], im[..., 2:3]) * 1.02 + 0.02), im[..., 2:3]], -1)), fg)
rgba = np.concatenate([fg, alpha[..., None]], -1)

cells = []
for row in range(2):
    for col in range(3):
        y0, y1, x0, x1 = row * H // 2, (row + 1) * H // 2, col * W // 3, (col + 1) * W // 3
        a = alpha[y0:y1, x0:x1]
        ys, xs = np.where(a > 0.12)
        if not len(xs):
            raise SystemExit(f'no fish in cell {row},{col}')
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        cells.append(rgba[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1])

atlas = Image.new('RGBA', (CW, CH * len(cells)), (0, 0, 0, 0))
check_bgs = [(128, 128, 128), (24, 26, 34), (235, 236, 240)]
check = Image.new('RGB', (CW * 3, CH * len(cells)), (0, 0, 0))
info = []
for i, c in enumerate(cells):
    h, w = c.shape[:2]
    k = min((CW - 16) / w, (CH - 12) / h)          # 身長撐滿格寬（魚的四邊形 = 身長 × 身長/2）
    img = Image.fromarray((c * 255 + 0.5).astype(np.uint8), 'RGBA').resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    cell.paste(img, ((CW - img.width) // 2, (CH - img.height) // 2))
    # 透明處填上附近的顏色：縮小取樣（mipmap）時邊緣才不會冒出黑邊
    arr = np.asarray(cell).astype(np.float32) / 255
    al = arr[..., 3:4]
    pm = Image.fromarray((np.concatenate([arr[..., :3] * al, al], -1) * 255).astype(np.uint8), 'RGBA')
    for r in (2, 6, 16):
        bl = np.asarray(pm.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
        fill = bl[..., :3] / np.maximum(bl[..., 3:4], 1e-4)
        hole = (arr[..., 3:4] < 0.02) & (bl[..., 3:4] > 1e-3)
        arr[..., :3] = np.where(hole & (arr[..., 3:4] < 0.02), fill, arr[..., :3])
        arr[..., 3:4] = np.where(hole, 0, arr[..., 3:4])
    cell = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    atlas.paste(cell, (0, i * CH))
    cell.save(os.path.join(OUT_DIR, f'koi-{i + 1}-{NAMES[i]}.png'))
    for j, col in enumerate(check_bgs):
        bgim = Image.new('RGBA', (CW, CH), col + (255,))
        bgim.alpha_composite(cell)
        check.paste(bgim.convert('RGB'), (j * CW, i * CH))
    info.append({'name': NAMES[i], 'srcSize': [w, h], 'aspect': round(h / w, 3)})

atlas.save(os.path.join(ROOT, 'assets', 'fish.webp'), 'WEBP', quality=90, method=6)
json.dump({'file': 'assets/fish.webp', 'rows': len(cells), 'cell': [CW, CH], 'source': 'Gemini, ' + os.path.basename(SRC), 'fish': info},
          open(os.path.join(ROOT, 'assets', 'fish.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
check.save(os.path.join(OUT_DIR, 'fish-check.png'))
print('bg', np.round(bg * 255).astype(int).tolist(), 'atlas', atlas.size, os.path.getsize(os.path.join(ROOT, 'assets', 'fish.webp')), 'bytes')
for f in info: print(f)
