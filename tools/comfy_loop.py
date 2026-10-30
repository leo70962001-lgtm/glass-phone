r"""桌布動畫：本機 ComfyUI（http://127.0.0.1:8000）MiniMax H3，首幀 = 尾幀 → 無縫循環。只用官方 text encoder。
  py tools/comfy_loop.py <wallpaper.png> <out-name> <prompt.txt> [seconds=5] [seed=1] [W=448] [H=960]
先把桌布中央裁成螢幕比例（375:812）再縮到 W×H（32 的倍數），輸出 assets/<out-name>.webm。"""
import json, os, sys, time, uuid, urllib.parse, urllib.request
from PIL import Image
URL = 'http://127.0.0.1:8000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, name, prompt = sys.argv[1], sys.argv[2], open(sys.argv[3], encoding='utf8').read().strip()
sec = float(sys.argv[4]) if len(sys.argv) > 4 else 5
seed = int(sys.argv[5]) if len(sys.argv) > 5 else 1
W = int(sys.argv[6]) if len(sys.argv) > 6 else 448
H = int(sys.argv[7]) if len(sys.argv) > 7 else 960
n = max(5, round(sec * 24)); length = n + (5 - n % 17) % 17
work = os.path.join(ROOT, 'tools', 'comfy'); os.makedirs(work, exist_ok=True)

def post(path, data, ctype):
    return json.loads(urllib.request.urlopen(urllib.request.Request(URL + path, data=data, headers={'Content-Type': ctype})).read())

im = Image.open(src).convert('RGB')
aspect = 375 / 812
cw = min(im.width, round(im.height * aspect)); ch = round(cw / aspect)
x0, y0 = (im.width - cw) // 2, (im.height - ch) // 2
first = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS)
fp = os.path.join(work, name + '-first.png'); first.save(fp)
b = uuid.uuid4().hex
body = (('--%s\r\nContent-Disposition: form-data; name="image"; filename="%s"\r\nContent-Type: image/png\r\n\r\n' % (b, os.path.basename(fp))).encode()
        + open(fp, 'rb').read() + ('\r\n--%s\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--%s--\r\n' % (b, b)).encode())
up = post('/upload/image', body, 'multipart/form-data; boundary=' + b)['name']

g = {
  'img': {'class_type': 'LoadImage', 'inputs': {'image': up}},
  'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'weight_dtype': 'default'}},
  'lora': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['unet', 0], 'lora_name': 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'strength_model': 1.0}},
  'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'type': 'minimax', 'device': 'default'}},
  'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'minimax_h3_video_vae_int8_convrot.safetensors'}},
  'i2v': {'class_type': 'MiniMaxH3ImageToVideo', 'inputs': {'clip': ['clip', 0], 'vae': ['vae', 0], 'prompt': prompt, 'width': W, 'height': H,
                                                           'length': length, 'first_frame': ['img', 0], 'last_frame': ['img', 0]}},
  'noise': {'class_type': 'RandomNoise', 'inputs': {'noise_seed': seed}},
  'guider': {'class_type': 'BasicGuider', 'inputs': {'model': ['lora', 0], 'conditioning': ['i2v', 0]}},
  'sampler': {'class_type': 'KSamplerSelect', 'inputs': {'sampler_name': 'res_multistep'}},
  'sigmas': {'class_type': 'BasicScheduler', 'inputs': {'model': ['lora', 0], 'scheduler': 'simple', 'steps': 8, 'denoise': 1.0}},
  'sample': {'class_type': 'SamplerCustomAdvanced', 'inputs': {'noise': ['noise', 0], 'guider': ['guider', 0], 'sampler': ['sampler', 0], 'sigmas': ['sigmas', 0], 'latent_image': ['i2v', 1]}},
  'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['sample', 0], 'vae': ['vae', 0]}},
  'save': {'class_type': 'SaveWEBM', 'inputs': {'images': ['decode', 0], 'filename_prefix': 'glass-phone/' + name, 'codec': 'vp9', 'fps': 24.0, 'crf': 18.0}},
}
pid = post('/prompt', json.dumps({'prompt': g, 'client_id': 'glass-phone'}).encode(), 'application/json')['prompt_id']
print('queued', pid, '%dx%d' % (W, H), length, 'frames', flush=True)
t0 = time.time()
while True:
    time.sleep(10)
    h = json.loads(urllib.request.urlopen(URL + '/history/' + pid).read())
    if pid not in h:
        continue
    st = h[pid].get('status', {})
    if st.get('status_str') == 'error':
        print('ERROR', json.dumps(st.get('messages', []))[-2000:]); sys.exit(1)
    for out in h[pid].get('outputs', {}).values():
        for f in out.get('images', []) + out.get('gifs', []) + out.get('videos', []):
            q = urllib.parse.urlencode({'filename': f['filename'], 'subfolder': f.get('subfolder', ''), 'type': f.get('type', 'output')})
            dst = os.path.join(ROOT, 'assets', name + os.path.splitext(f['filename'])[1])
            open(dst, 'wb').write(urllib.request.urlopen(URL + '/view?' + q).read())
            print('saved', dst, os.path.getsize(dst), 'after %ds' % (time.time() - t0))
    sys.exit(0)
