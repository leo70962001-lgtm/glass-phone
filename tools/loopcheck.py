r"""檢查並整理 ComfyUI 循環影片（用 ComfyUI 的 Python，裡面有 PyAV）：
  C:\.venv\Scripts\python.exe tools/loopcheck.py assets/silk1-loop.webm <sheet.png> [fix]
- 抽 8 格拼成 contact sheet；印出每格與第 0 格的平均差（看動態幅度）與首尾差（看循環接縫）。
- fix：去掉最後一格（首幀 = 尾幀會在接縫處停一格），重新以 VP9 輸出覆蓋原檔。"""
import sys
import av
import numpy as np
from PIL import Image

src, sheet = sys.argv[1], sys.argv[2]
fix = len(sys.argv) > 3 and sys.argv[3] == 'fix'
frames = [f.to_ndarray(format='rgb24') for f in av.open(src).decode(video=0)]
n = len(frames)
f0 = frames[0].astype(np.float32)
diffs = [float(np.abs(f.astype(np.float32) - f0).mean()) for f in frames]
print('frames', n, 'size', frames[0].shape[1], 'x', frames[0].shape[0])
print('diff vs frame0 (every 8th):', [round(d, 1) for d in diffs[::8]])
print('last vs first', round(diffs[-1], 2), ' second-last vs first', round(diffs[-2], 2))
step = [round(float(np.abs(frames[i + 1].astype(np.float32) - frames[i]).mean()), 2) for i in range(n - 1)]
print('frame-to-frame max', max(step), 'mean', round(sum(step) / len(step), 2))

idx = np.linspace(0, n - 1, 8).round().astype(int)
h, w = frames[0].shape[:2]
s = 0.5
board = Image.new('RGB', (int(w * s) * 8 + 7 * 6, int(h * s)), 'white')
for k, i in enumerate(idx):
    board.paste(Image.fromarray(frames[i]).resize((int(w * s), int(h * s))), (k * (int(w * s) + 6), 0))
board.save(sheet)

if fix:
    out = av.open(src + '.tmp.webm', 'w')
    st = out.add_stream('libvpx-vp9', rate=24)
    st.width, st.height, st.pix_fmt = w, h, 'yuv420p'
    st.options = {'crf': '20', 'b:v': '0', 'row-mt': '1'}
    for a in frames[:-1]:
        for p in st.encode(av.VideoFrame.from_ndarray(a, format='rgb24')):
            out.mux(p)
    for p in st.encode():
        out.mux(p)
    out.close()
    import os
    os.replace(src + '.tmp.webm', src)
    print('rewrote', src, n - 1, 'frames', os.path.getsize(src))
