# 把網頁截圖縮到參考圖同一比例（1.432 px/pt），與參考圖並排；可選裁切區域放大
import sys
from PIL import Image
shot, out = sys.argv[1], sys.argv[2]
crop = list(map(int, sys.argv[3].split(','))) if len(sys.argv) > 3 else None   # 參考圖座標 x0,y0,x1,y1
zoom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
ref = Image.open('refs/reference.webp').convert('RGB')
im = Image.open(shot).convert('RGB')
W, H = im.size
ppt = H / (865 * 1.1)                      # 截圖 px/pt
cx, cy = (W / 2 - 150) if W > 900 else W / 2, H / 2
s = 1.432 / ppt
im = im.resize((round(W * s), round(H * s)), Image.LANCZOS)
cx, cy = cx * s, cy * s
# 參考圖的螢幕中心 = (75 + 187.5*1.432, 75 + 406*1.404)
rcx, rcy = 75 + 187.5 * 1.432, 75 + 406 * 1.404
ox, oy = round(cx - rcx), round(cy - rcy)
mine = im.crop((ox, oy, ox + ref.width, oy + ref.height))
if crop:
    ref = ref.crop(crop); mine = mine.crop(crop)
    ref = ref.resize((round(ref.width * zoom), round(ref.height * zoom)), Image.LANCZOS)
    mine = mine.resize(ref.size, Image.LANCZOS)
board = Image.new('RGB', (ref.width * 2 + 10, ref.height), (255, 255, 255))
board.paste(ref, (0, 0)); board.paste(mine, (ref.width + 10, 0))
board.save(out)
print(board.size)
