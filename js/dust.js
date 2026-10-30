// 粉塵消散：圖示被由左往右「掃過」的地方碎成細粉塵，順著風往右上飄、帶一點色調後淡出。
// 同一個門檻函式給三個地方用：玻璃著色器（挖掉）、螢幕層（擦掉名稱、淡出陰影）、粒子（何時剝落）。
import * as THREE from 'three';

export const DISSOLVE_GLSL = /* glsl */`
float dsHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float dsNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dsHash(i), dsHash(i + vec2(1.0, 0.0)), f.x), mix(dsHash(i + vec2(0.0, 1.0)), dsHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// q = 相對圖示中心的位置 / 圖示邊長；由左往右掃，邊緣用兩層雜訊弄碎
float dissolveThr(vec2 q) {
  float n = dsNoise(q * 6.0 + 3.1) * 0.6 + dsNoise(q * 17.0 - 1.7) * 0.4;
  return (q.x + 0.55) * 0.72 - q.y * 0.08 + n * 0.32;
}
`;
export const DS_END = 1.4;            // 門檻最大值：進度到這裡就全部消失

const vert = /* glsl */`
attribute vec3 aPos; attribute vec4 aRand; attribute float aKind;
uniform sampler2D uSnap; uniform mat4 uSnapVP; uniform sampler2D uOverlay; uniform vec2 uScreen;
uniform vec3 uCenter; uniform float uSize, uTime, uRate, uLife, uPx, uScale;
uniform vec2 uWind; uniform float uSpread, uSwirl, uRise;
uniform vec3 uTint; uniform float uTintAmt;
varying vec4 vCol;
${DISSOLVE_GLSL}
void main() {
  vec3 o = uCenter + aPos;
  float age = uTime - dissolveThr(aPos.xy / uSize) / uRate;     // 這一點被掃到之後經過的秒數
  float life = uLife * (0.55 + 0.9 * aRand.x);
  vec3 c;
  bool keep = true;
  if (aKind > 0.5) {                                            // 名稱：只留字的筆畫
    keep = texture2D(uOverlay, o.xy / uScreen + 0.5).a > 0.35;
    c = vec3(1.0);
  } else {                                                      // 玻璃：顏色取刪除當下的畫面
    vec4 cl = uSnapVP * vec4(o, 1.0);
    c = texture2D(uSnap, cl.xy / cl.w * 0.5 + 0.5).rgb;
  }
  if (!keep || age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  float u = age / life;
  float a = aRand.y * 6.2832;
  vec3 p = o;
  p.xy += (uWind * (0.6 + 0.8 * aRand.z) + vec2(cos(a), sin(a)) * uSpread * aRand.w) * age * uScale;
  p.xy += vec2(sin(age * 3.1 + aRand.w * 6.28 + o.y * 0.07), cos(age * 2.4 + aRand.x * 6.28 + o.x * 0.07)) * uSwirl * age * uScale;
  p.y += uRise * age * age * uScale;
  p.z += 14.0 * age * uScale;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = mix(1.7, 0.6, u) * (0.7 + 0.6 * aRand.z) * uPx * uScale;
  vec3 col = mix(c * 1.2 + 0.04, uTint, smoothstep(0.0, 0.65, u) * uTintAmt) + exp(-age * 16.0) * 0.5;
  vCol = vec4(col, (1.0 - u) * (1.0 - u) * (0.7 + 0.3 * aRand.w));
}
`;
const frag = /* glsl */`
varying vec4 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5 || vCol.a <= 0.0) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a * smoothstep(0.5, 0.12, d));
  #include <colorspace_fragment>
}
`;

function rnd() { return Math.random(); }
function inRoundRect(x, y, h, r) {
  const qx = Math.abs(x) - h + r, qy = Math.abs(y) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

export function createDust(scene) {
  const bursts = [];
  return {
    // o: { center: Vector3, size, height, radius, label: {w, dy, h} | null, snap, snapVP, overlay, screen: Vector2, px, scale, density, opts }
    spawn(o) {
      const half = o.size / 2;
      const nGlass = Math.round(o.density * o.size * o.size);
      const nLabel = o.label ? Math.round(o.density * 1.4 * o.label.w * o.label.h) : 0;
      const n = nGlass + nLabel;
      const pos = new Float32Array(n * 3), rand = new Float32Array(n * 4), kind = new Float32Array(n);
      let i = 0;
      while (i < nGlass) {
        const x = (rnd() * 2 - 1) * half, y = (rnd() * 2 - 1) * half;
        if (!inRoundRect(x, y, half, o.radius)) continue;
        pos.set([x, y, o.height * (0.55 + 0.45 * rnd())], i * 3); i++;
      }
      for (; i < n; i++) {
        pos.set([(rnd() - 0.5) * o.label.w, -o.label.dy + (rnd() - 0.5) * o.label.h, 0.5], i * 3);
        kind[i] = 1;
      }
      for (let k = 0; k < n * 4; k++) rand[k] = rnd();
      const g = new THREE.BufferGeometry();
      g.setAttribute('aPos', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
      g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const op = o.opts;
      const m = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
        uniforms: {
          uSnap: { value: o.snap.texture }, uSnapVP: { value: o.snapVP }, uOverlay: { value: o.overlay }, uScreen: { value: o.screen },
          uCenter: { value: o.center }, uSize: { value: o.size }, uTime: { value: 0 }, uRate: { value: DS_END / op.sweep },
          uLife: { value: op.life }, uPx: { value: o.px }, uScale: { value: o.scale },
          uWind: { value: new THREE.Vector2(op.wind, op.wind * 0.45) }, uSpread: { value: 22 }, uSwirl: { value: 9 }, uRise: { value: 10 },
          uTint: { value: new THREE.Color(op.tint) }, uTintAmt: { value: op.tintAmt },
        },
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.renderOrder = 5;
      scene.add(pts);
      bursts.push({ pts, snap: o.snap, t: 0, end: op.sweep + op.life * 1.5 });
    },
    // 回傳是否還有粒子在飛
    update(dt) {
      for (let k = bursts.length - 1; k >= 0; k--) {
        const b = bursts[k];
        b.t += dt;
        b.pts.material.uniforms.uTime.value = b.t;
        if (b.t > b.end) {
          scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); b.snap.dispose();
          bursts.splice(k, 1);
        }
      }
      return bursts.length > 0;
    },
  };
}
