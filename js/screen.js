// 螢幕層：桌布 + UI 疊層 + 玻璃投在螢幕上的陰影／焦散 → 一張 render target。
// 玻璃著色器折射時取樣的就是這一張（含 mipmap，霧面用 LOD 模糊）。
import * as THREE from 'three';
import { DISSOLVE_GLSL } from './dust.js';

export const MAX_OBJ = 32;

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */`
#define MAXI ${MAX_OBJ}
uniform sampler2D uWallTex; uniform float uWallMode; uniform vec4 uWallUV; uniform float uTime;
uniform vec2 uWallShift; uniform float uWallZoom;
uniform sampler2D uOverlay; uniform vec2 uScreen;
uniform vec4 uObjA[MAXI]; uniform vec4 uObjB[MAXI]; uniform vec4 uObjC[MAXI]; uniform int uCount;
uniform vec3 uLight; uniform float uIor, uBevel;
uniform float uShadow, uShadowLen, uShadowSoft, uContact, uCaustic, uCausticW, uRainbow, uStar;
varying vec2 vUv;

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
${DISSOLVE_GLSL}
vec3 lin(vec3 c) { return pow(c / 255.0, vec3(2.2)); }
vec3 spectral(float x) { x = clamp(x, 0.0, 1.0) * 0.85; return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }

// 程式桌布：柔和色塊（加權平均）+ 斜向銀白光帶 + 細絲紋，緩慢流動
vec3 procWall(vec2 uv, float t) {
  vec2 p = vec2(uv.x, uv.y * 2.165);
  p += 0.05 * vec2(sin(p.y * 2.3 + t * 0.35), sin(p.x * 2.9 - t * 0.28 + p.y * 1.3));
  vec3 acc = vec3(0.0); float ws = 0.0;
  #define BLOB(cx, cy, rad, c) { vec2 dd = p - vec2(cx, cy); float w = exp(-dot(dd, dd) / (rad * rad)); acc += w * lin(c); ws += w; }
  BLOB(0.02, 2.12, 0.42, vec3(238., 160., 146.))
  BLOB(0.08, 1.60, 0.40, vec3(214., 30., 122.))
  BLOB(0.35, 1.85, 0.30, vec3(200., 40., 130.))
  BLOB(0.47, 1.78, 0.20, vec3(120., 46., 150.))
  BLOB(0.80, 1.85, 0.42, vec3(32., 60., 178.))
  BLOB(1.00, 2.15, 0.36, vec3(22., 40., 140.))
  BLOB(1.00, 1.48, 0.32, vec3(48., 96., 200.))
  BLOB(0.98, 1.12, 0.26, vec3(150., 170., 214.))
  BLOB(0.30, 1.05, 0.24, vec3(226., 52., 70.))
  BLOB(0.18, 1.25, 0.25, vec3(206., 40., 110.))
  BLOB(0.78, 0.52, 0.34, vec3(236., 92., 52.))
  BLOB(0.60, 0.30, 0.24, vec3(232., 70., 50.))
  BLOB(0.06, 0.42, 0.40, vec3(188., 190., 214.))
  BLOB(0.40, 0.06, 0.30, vec3(232., 214., 222.))
  BLOB(1.00, 0.10, 0.30, vec3(170., 120., 170.))
  vec3 col = acc / max(ws, 1e-5);
  vec2 a = vec2(1.15, 1.27), b = vec2(-0.15, 0.36);
  vec2 dir = normalize(a - b), nrm = vec2(-dir.y, dir.x);
  float s = dot(p - b, dir);
  float dl = dot(p - b, nrm) - 0.07 * sin(s * 3.1 + 0.8 + t * 0.2);
  float band = exp(-dl * dl / 0.016);
  col = mix(col, lin(vec3(222., 222., 234.)), band * 0.8);
  col = mix(col, lin(vec3(246., 246., 252.)), exp(-dl * dl / 0.0012) * 0.4);
  col *= 1.0 + 0.015 * sin(dl * 50.0 + sin(s * 4.0 + t * 0.3) * 2.0);
  return col;
}

void main() {
  vec2 p = (vUv - 0.5) * uScreen;
  vec2 wuv = (vUv - 0.5) / uWallZoom + 0.5 - uWallShift;      // 桌布景深視差
  vec3 wall = uWallMode > 0.5 ? texture2D(uWallTex, uWallUV.xy + wuv * uWallUV.zw).rgb : procWall(wuv, uTime);
  vec4 ov = texture2D(uOverlay, vUv);
  // 消散中的圖示：名稱跟著同一道掃描擦掉（uObjC.x = 進度，-1 = 沒有）
  for (int i = 0; i < MAXI; i++) {
    if (i >= uCount) break;
    if (uObjC[i].x < -0.5) continue;
    vec2 q = (p - uObjA[i].xy) / uObjC[i].y;
    if (q.y > -0.45 || q.y < -1.1 || abs(q.x) > 1.2) continue;
    ov.a *= smoothstep(uObjC[i].x - 0.02, uObjC[i].x + 0.04, dissolveThr(q));
  }
  vec3 col = mix(wall, ov.rgb, ov.a);

  vec2 Ld = uLight.xy / max(uLight.z, 0.2);     // 每 1 pt 高度的水平位移（朝光源）
  vec2 away = -Ld / max(length(Ld), 1e-4);
  float shade = 1.0; vec3 caus = vec3(0.0);
  for (int i = 0; i < MAXI; i++) {
    if (i >= uCount) break;
    vec4 A = uObjA[i]; vec4 B = uObjB[i];
    float vis = uObjC[i].z;                                        // 消散時陰影、焦散一起淡出
    if (vis <= 0.0) continue;
    vec2 lp = p - A.xy; vec2 hs = A.zw; float r = B.x, h = B.y, bz = B.z;
    float H = (h + bz) * uShadowLen;
    if (length(lp) > length(hs) + length(Ld) * H + 40.0) continue;
    // 掃掠陰影：從底到頂把輪廓沿光線方向推出去
    float dS = 1e9;
    for (int k = 0; k < 6; k++) {
      vec2 o = -Ld * (bz + h * float(k) / 5.0) * uShadowLen;
      dS = min(dS, sdRR(lp - o, hs, r));
    }
    float soft = uShadowSoft * (1.2 + H * 0.22);
    float sh = 1.0 - smoothstep(-soft, soft, dS);
    // 平坦頂面讓光直接穿過（玻璃內折射後位移較短）
    float bv = min(uBevel, min(hs.x, hs.y) * 0.8);
    float ri = max(r - bv, 1.0);
    vec2 oT = -Ld * (h / uIor + bz) * uShadowLen;
    float dP = sdRR(lp - oT, hs - bv, ri);
    float lit = 1.0 - smoothstep(-soft * 0.7, soft * 0.7, dP);
    shade *= 1.0 - uShadow * sh * (1.0 - 0.85 * lit) * vis;
    // 接觸陰影
    float d0 = sdRR(lp, hs, r);
    shade *= 1.0 - uContact * exp(-max(d0, 0.0) / (1.5 + h * 0.12)) * smoothstep(-1.5, 0.5, d0) * vis;
    // 焦散：倒角把光聚成一條亮線，落在背光那側；色散 → 彩虹
    vec2 e = vec2(0.6, 0.0);
    vec2 g = vec2(sdRR(lp - oT + e.xy, hs - bv, ri) - dP, sdRR(lp - oT + e.yx, hs - bv, ri) - dP);
    g /= max(length(g), 1e-4);
    float facing = clamp(dot(g, away), 0.0, 1.0);
    float x = (dP - uCausticW * 0.7) / uCausticW;
    float band = exp(-x * x * 2.2);
    vec3 cc = mix(vec3(1.0), spectral(x * 0.32 + 0.5) * 1.6, uRainbow);
    float strength = clamp(length(Ld) * 1.4, 0.0, 1.0) * (0.35 + h * 0.05);
    caus += cc * band * facing * facing * uCaustic * strength * vis;
    // 星芒：背光角上的聚焦點
    vec2 cs = sign(away + 1e-5);
    vec2 corner = oT + cs * (hs - bv - ri + ri * 0.7071) + normalize(cs) * uCausticW * 0.7;
    vec2 sp = lp - corner;
    float st = exp(-dot(sp, sp) / 5.0) * 1.4 + (exp(-abs(sp.y) * 1.6) * exp(-abs(sp.x) / 8.0) + exp(-abs(sp.x) * 1.6) * exp(-abs(sp.y) / 8.0)) * 0.7;
    caus += vec3(1.0) * st * uStar * strength * vis;
  }
  col = col * shade + caus * (0.3 + 0.7 * col);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 尺寸跟著螢幕（CSS px = pt）；RT 用 sRGB 8-bit（手機 WebGL2 都能渲染、產生 mipmap）
export function createScreenLayer(renderer) {
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const overlay = new THREE.CanvasTexture(document.createElement('canvas'));
  overlay.colorSpace = THREE.SRGBColorSpace;
  overlay.anisotropy = 4;
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;

  const uniforms = {
    uWallTex: { value: blank }, uWallMode: { value: 0 }, uWallUV: { value: new THREE.Vector4(0, 0, 1, 1) }, uTime: { value: 0 },
    uWallShift: { value: new THREE.Vector2() }, uWallZoom: { value: 1 },
    uOverlay: { value: overlay }, uScreen: { value: new THREE.Vector2(375, 812) },
    uObjA: { value: Array.from({ length: MAX_OBJ }, () => new THREE.Vector4()) },
    uObjB: { value: Array.from({ length: MAX_OBJ }, () => new THREE.Vector4()) },
    uObjC: { value: Array.from({ length: MAX_OBJ }, () => new THREE.Vector4(-1, 60, 1, 0)) },
    uCount: { value: 0 },
    uLight: { value: new THREE.Vector3(0.5, 0.5, 0.7) }, uIor: { value: 1.5 }, uBevel: { value: 6 },
    uShadow: { value: 0.4 }, uShadowLen: { value: 1 }, uShadowSoft: { value: 1 }, uContact: { value: 0.3 },
    uCaustic: { value: 1 }, uCausticW: { value: 3 }, uRainbow: { value: 0.5 }, uStar: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // cover：裁掉桌布多餘的那一邊
  function fit() {
    const tex = uniforms.uWallTex.value;
    if (!uniforms.uWallMode.value) return;
    const iw = tex.image.videoWidth || tex.image.width, ih = tex.image.videoHeight || tex.image.height;
    const ia = ih / iw, sa = uniforms.uScreen.value.y / uniforms.uScreen.value.x;
    if (ia > sa) { const k = sa / ia; uniforms.uWallUV.value.set(0, (1 - k) / 2, 1, k); }
    else { const k = ia / sa; uniforms.uWallUV.value.set((1 - k) / 2, 0, k, 1); }
  }

  return {
    texture: rt.texture,
    uniforms,
    overlay,
    resize(w, h, pixelRatio) {
      uniforms.uScreen.value.set(w, h);
      rt.setSize(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
      fit();
    },
    setOverlay(canvas) {
      const resized = !overlay.image || overlay.image.width !== canvas.width || overlay.image.height !== canvas.height;
      overlay.image = canvas;
      if (resized) overlay.dispose();
      overlay.needsUpdate = true;
    },
    setWallpaper(tex) {
      if (!tex) { uniforms.uWallMode.value = 0; return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      const video = tex.isVideoTexture;
      tex.generateMipmaps = !video;
      tex.minFilter = video ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      tex.anisotropy = 4;
      uniforms.uWallTex.value = tex;
      uniforms.uWallMode.value = 1;
      fit();
    },
    render() {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
    },
  };
}
