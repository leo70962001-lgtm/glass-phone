r"""把 ComfyUI H3 的首尾同幀影片整理成無縫循環，輸出手機用的 MP4（H.264）＋ WebM（VP9）。
  C:\.venv\Scripts\python.exe tools/loop_trim.py <src.webm> <out-base> [sheet.png] [head=auto] [xfade=0]
H3 常在開頭和結尾各停住一小段（幾乎不動），循環時會「頓一下」：
1. 算每一格和下一格的差，找出開頭、結尾連續低於門檻（中位數的 35%）的靜止段，裁掉。
2. 在剩下的尾端附近找一格，和保留下來的第一格最像的那一格當終點（不含），接回第一格就是無縫。
3. 印出裁切前後的接縫差和平均每格差，方便確認接縫和一般的一格一樣小。
有時 H3 的最後一格並沒有回到第一格（池塘那支差了 4 倍），而且第一格是原圖、後面才是影片的質感：
head = 丟掉開頭幾格（auto = 和第一格的差到達平穩值的 90% 為止）；xfade = 頭尾用幾格交叉淡化接起來，接縫看不出來。"""
import os, sys
import av
import numpy as np
from PIL import Image

src, out_base = sys.argv[1], sys.argv[2]
sheet = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else None
head_arg = sys.argv[4] if len(sys.argv) > 4 else '0'
xfade = int(sys.argv[5]) if len(sys.argv) > 5 else 0
frames = [f.to_ndarray(format='rgb24') for f in av.open(src).decode(video=0)]
F = [f.astype(np.float32) for f in frames]
n = len(F)
step = np.array([np.abs(F[i + 1] - F[i]).mean() for i in range(n - 1)])
med = float(np.median(step))
still = step < med * 0.35
a = 0
while a < n // 4 and still[a]:
    a += 1
if head_arg == 'auto':
    d0 = np.array([np.abs(f - F[0]).mean() for f in F])
    plateau = float(np.median(d0[n // 3:]))
    a = max(a, int(np.argmax(d0 > plateau * 0.9)))
elif int(head_arg) > a:
    a = int(head_arg)
b = n - 1
while b > n * 3 // 4 and still[b - 1]:
    b -= 1
# 終點：在 b 附近（往前 12 格內）找和第 a 格最像的一格；循環播放 a..end-1，再回到 a
cands = range(max(a + n // 2, b - 12), b + 1)
end = min(cands, key=lambda j: np.abs(F[j] - F[a]).mean())
seam = float(np.abs(F[end] - F[a]).mean())
print(f'frames {n}, step median {med:.2f} max {step.max():.2f}')
print(f'still head {a} frames, tail {n - 1 - b} frames')
print(f'keep {a}..{end - 1} ({end - a} frames, {(end - a) / 24:.2f} s); seam diff {seam:.2f} vs typical step {med:.2f}')
keep = frames[a:end]
if xfade > 0:
    # 交叉淡化：輸出長度 M = 原長 − K；前 K 格把「之後的那 K 格」淡出、自己淡入，最後一格接回第一格時是相鄰的兩格
    K = xfade; S = [f.astype(np.float32) for f in keep]; M = len(S) - K
    keep = [((S[M + j] * (1 - j / K) + S[j] * (j / K)) if j < K else S[j]).round().astype(np.uint8) for j in range(M)]
    seam2 = float(np.abs(keep[-1].astype(np.float32) - keep[0].astype(np.float32)).mean())
    print(f'crossfade {K} frames -> {M} frames ({M / 24:.2f} s); new seam diff {seam2:.2f}')
h, w = keep[0].shape[:2]

def write(path, codec, opts):
    out = av.open(path, 'w')
    st = out.add_stream(codec, rate=24)
    st.width, st.height, st.pix_fmt = w, h, 'yuv420p'
    st.options = opts
    from fractions import Fraction
    st.time_base = Fraction(1, 24)
    for i, fr in enumerate(keep):
        vf = av.VideoFrame.from_ndarray(fr, format='rgb24'); vf.pts = i; vf.time_base = Fraction(1, 24)   # 時間戳要給，不然 B 幀會亂序
        for p in st.encode(vf):
            out.mux(p)
    for p in st.encode():
        out.mux(p)
    out.close()
    print('wrote', path, os.path.getsize(path))

# H.264：I 幀和 P 幀用一樣的品質、只有一個關鍵幀 → 接回第一格時不會突然變清楚（接縫差落在一般格差的範圍內）
write(out_base + '.mp4', 'libx264', {'crf': '16', 'preset': 'slow', 'profile': 'high', 'movflags': '+faststart', 'x264-params': 'ipratio=1.0:pbratio=1.0:keyint=999:scenecut=0'})
write(out_base + '.webm', 'libvpx-vp9', {'crf': '30', 'b:v': '0', 'row-mt': '1'})
if sheet:
    idx = np.linspace(0, len(keep) - 1, 6).round().astype(int)
    s = 0.4
    board = Image.new('RGB', (int(w * s) * 6 + 5 * 6, int(h * s)), 'white')
    for k, i in enumerate(idx):
        board.paste(Image.fromarray(keep[i]).resize((int(w * s), int(h * s))), (k * (int(w * s) + 6), 0))
    board.save(sheet)
    print('sheet', sheet)
