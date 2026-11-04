// 高斯金字塔：把畫面逐級模糊、減半，存進同一張貼圖的 mip。
// 第 i 級的 σ = SIGMA0 × 2^i 個來源像素，所以任何模糊半徑都只要一次 textureLod(log2(σ / SIGMA0))。
// 每級再多模糊一點（總變異數才會剛好翻倍）：σ² = σ前² + (σ加 × 像素邊長)²，算出來約 1.3 個該級像素。
import * as THREE from 'three';

export const SIGMA0 = 3;
const MAX_LEVELS = 7;

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const frag = /* glsl */`
uniform sampler2D uSrc; uniform vec2 uStep; uniform float uSig, uLod;
varying vec2 vUv;
void main() {
  vec3 acc = textureLod(uSrc, vUv, uLod).rgb; float total = 1.0;
  for (int i = 1; i <= 6; i++) {
    float x = float(i) * 0.75, w = exp(-0.5 * x * x / (uSig * uSig));
    acc += (textureLod(uSrc, vUv + uStep * x, uLod).rgb + textureLod(uSrc, vUv - uStep * x, uLod).rgb) * w;
    total += 2.0 * w;
  }
  gl_FragColor = vec4(acc / total, 1.0);
}
`;

function makeChain(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, generateMipmaps: false, depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  // 貼圖要配滿整條 mip 才算完整；只有用得到的幾級會真的畫
  const full = Math.floor(Math.log2(Math.max(w, h))) + 1;
  rt.texture.mipmaps = Array.from({ length: full }, () => ({}));
  return rt;
}

export function createPyramid(renderer) {
  const uniforms = { uSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uSig: { value: 1.5 }, uLod: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let P = null, T = null, bw = 0, bh = 0;

  function pass(target, level, w, h, src, sx, sy, lod, sig) {
    uniforms.uSrc.value = src; uniforms.uStep.value.set(sx, sy); uniforms.uLod.value = lod; uniforms.uSig.value = sig;
    target.viewport.set(0, 0, w, h);
    renderer.setRenderTarget(target, 0, level);
    renderer.render(scene, cam);
  }

  return {
    get texture() { return P ? P.texture : null; },
    // src 要有 mipmap；maxLod = 這次會取樣到的最高級，只建到那裡
    build(src, srcW, srcH, maxLod) {
      const w = Math.max(1, Math.ceil(srcW / 2)), h = Math.max(1, Math.ceil(srcH / 2));
      if (w !== bw || h !== bh) {
        if (P) { P.dispose(); T.dispose(); }
        P = makeChain(w, h); T = makeChain(w, h); bw = w; bh = h;
      }
      const levels = Math.min(MAX_LEVELS, Math.ceil(maxLod) + 1, P.texture.mipmaps.length);
      const prev = renderer.getRenderTarget();
      const prevAuto = renderer.autoClear;
      renderer.autoClear = false;
      for (let i = 0; i < levels; i++) {
        const lw = Math.max(1, w >> i), lh = Math.max(1, h >> i), sig = i ? 1.3 : 1.5;
        pass(T, i, lw, lh, i ? P.texture : src, 1 / lw, 0, i ? i - 1 : 1, sig);
        pass(P, i, lw, lh, T.texture, 0, 1 / lh, i, sig);
      }
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prev);
      return levels;
    },
    dispose() { if (P) { P.dispose(); T.dispose(); P = T = null; bw = bh = 0; } },
  };
}
