// 自動明暗要知道「玻璃底下有多亮」：把螢幕層縮成一張小圖讀回 CPU，存線性亮度。
// 讀回用非同步（PBO），不會卡住畫面；影片桌布每 0.5 秒更新一次就夠。
import * as THREE from 'three';

const GW = 30, GH = 65;
const LIN = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const frag = /* glsl */`
uniform sampler2D uSrc; varying vec2 vUv;
void main() { gl_FragColor = vec4(textureLod(uSrc, vUv, 4.0).rgb, 1.0); }
`;

export function createTone(renderer) {
  const rt = new THREE.WebGLRenderTarget(GW, GH, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: false });
  const uniforms = { uSrc: { value: null } };
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }));
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bytes = new Uint8Array(GW * GH * 4);
  const grid = new Float32Array(GW * GH).fill(0.3);
  let mean = 0.3, reading = false, ready = false;

  return {
    get mean() { return mean; },
    get ready() { return ready; },
    // 螢幕層畫好之後呼叫：畫進小圖、非同步讀回；onDone 時 grid 已更新
    capture(src, onDone) {
      if (reading) return;
      reading = true;
      uniforms.uSrc.value = src;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      renderer.readRenderTargetPixelsAsync(rt, 0, 0, GW, GH, bytes).then(() => {
        let sum = 0;
        for (let i = 0; i < grid.length; i++) {
          const o = i * 4, v = 0.2126 * LIN[bytes[o]] + 0.7152 * LIN[bytes[o + 1]] + 0.0722 * LIN[bytes[o + 2]];
          grid[i] = v; sum += v;
        }
        mean = sum / grid.length;
        ready = true;
        reading = false;
        onDone?.();
      }).catch(() => { reading = false; });
    },
    // 螢幕座標（pt，原點在中心、y 朝上）矩形內的平均線性亮度
    under(x, y, hx, hy, W, H) {
      const u0 = clampI((x - hx) / W + 0.5, GW), u1 = clampI((x + hx) / W + 0.5, GW);
      const v0 = clampI((y - hy) / H + 0.5, GH), v1 = clampI((y + hy) / H + 0.5, GH);
      let sum = 0, n = 0;
      for (let j = v0; j <= v1; j++) for (let i = u0; i <= u1; i++) { sum += grid[j * GW + i]; n++; }
      return n ? sum / n : mean;
    },
  };
}
function clampI(t, n) { return Math.max(0, Math.min(n - 1, Math.floor(t * n))); }
