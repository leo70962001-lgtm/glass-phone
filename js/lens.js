// 透鏡模式：薄的液態玻璃。不追蹤光線，只在玻璃平面上算 2D 距離場：
// 邊緣高度用凸面超橢圓（kube.io 的公開做法），由斜率和 Snell 定律得到取樣偏移，大部分彎折集中在最外幾 pt。
// 內容從高斯金字塔取一次就有模糊；融合時形狀和材質都依距離混合，交界沒有接縫。
// 合成在 sRGB 空間做（眼睛看到的比例），最後才轉回線性交給 three.js 輸出。
import * as THREE from 'three';
import { DISSOLVE_GLSL } from './dust.js';
import { MAXN } from './liquid.js';

const vert = /* glsl */`
uniform vec3 uBox;
varying vec2 vP;
void main() {
  vec3 p = vec3(position.xy * 2.0 * uBox.xy, uBox.z);
  vP = p.xy;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

const frag = /* glsl */`
#define MAXN ${MAXN}
uniform vec2 uHalf, uCenter, uScreenSize, uTexel, uLight2;
uniform float uRadius, uPresence, uSolid, uTone, uSizeK, uRot, uDsProg, uGlow, uK, uS, uPx;
uniform vec3 uDsTint, uTouch, uTint, uTintCol;
uniform int uNn;
uniform vec4 uNa[MAXN]; uniform vec4 uNb[MAXN]; uniform vec4 uNc[MAXN]; uniform vec4 uNg[MAXN]; uniform vec4 uNt[MAXN];
uniform sampler2D uScreenTex, uBlurTex, uGlyphTex, uFishTex;
uniform float uFishOn;
uniform float uBlurK, uPickLod, uRefr, uEdge, uMag, uDispL, uLip, uFrostL, uVibL, uBrightL, uBelow, uTintAmt, uRimL, uRimW, uLensK, uIconTint;
uniform vec4 uGlyphCell;
uniform float uHasGlyph, uGlyphHalf, uGlyphScale, uGlyphA, uGlyphOpacity, uLodGlyph, uInk, uFlip;
varying vec2 vP;

const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
const float IOR = 1.5;
${DISSOLVE_GLSL}

vec3 toG(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toL(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
float blendMin(float a, float b, float k) { float e = max(k - abs(a - b), 0.0) / k; return min(a, b) - e * e * k * 0.25; }
// 存在度 < 1 的形狀（分裂中的小泡）把距離場往內侵蝕：從母體長出來、再沉回去，不會跳動
float selfD(vec2 p) { return rbox(p, uHalf, uRadius) + (1.0 - uPresence) * 30.0 * uS; }
float otherD(vec2 p, int i) { return rbox(p - uNa[i].xy, uNa[i].zw, uNb[i].x) + (1.0 - uNb[i].w) * 30.0 * uS; }
float field(vec2 p) {
  float d = selfD(p);
  for (int i = 0; i < uNn; i++) d = blendMin(d, otherD(p, i), uK);
  return d;
}

// 玻璃座標 → 螢幕層 uv（編輯模式抖動時玻璃會轉）
vec2 uvOf(vec2 q) { float c = cos(uRot), s = sin(uRot); return (vec2(c * q.x - s * q.y, s * q.x + c * q.y) + uCenter) / uScreenSize + 0.5; }

vec3 seen(vec2 q, float lod) {
  vec2 uv = uvOf(q);
  vec3 c;
  if (uBlurK >= 1.0) c = textureLod(uBlurTex, uv, log2(uBlurK)).rgb;
  else if (uBlurK <= 0.001) c = textureLod(uScreenTex, uv, lod).rgb;
  else {
    vec2 e = uTexel * min(uBlurK * 3.0, 1.5);              // 比金字塔第 0 級還小的模糊：取四點
    c = 0.25 * (textureLod(uScreenTex, uv + e, lod).rgb + textureLod(uScreenTex, uv - e, lod).rgb
              + textureLod(uScreenTex, uv + vec2(e.x, -e.y), lod).rgb + textureLod(uScreenTex, uv + vec2(-e.x, e.y), lod).rgb);
    if (uBlurK > 0.5) c = mix(c, textureLod(uBlurTex, uv, 0.0).rgb, uBlurK * 2.0 - 1.0);
  }
  return c;
}

// 玻璃上的圖案：不被折射。單色的筆畫會跟著明暗換深淺，彩色的部分保留
void addGlyph(inout vec3 col, vec2 p, vec2 o, float gh, vec4 cell, float ink, float flip, float alpha) {
  if (gh <= 0.0 || alpha <= 0.002) return;
  vec2 g = (p - o) / (2.0 * gh * uGlyphScale) + 0.5;
  if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) return;
  vec4 c = textureLod(uGlyphTex, cell.xy + (0.03125 + g * 0.9375) * cell.zw, uLodGlyph);
  vec3 gc = toG(c.rgb);
  if (flip > 0.5) {
    float sat = max(gc.r, max(gc.g, gc.b)) - min(gc.r, min(gc.g, gc.b));
    gc = mix(mix(vec3(0.09), vec3(1.0), ink), gc, smoothstep(0.1, 0.32, sat));
  }
  col = mix(col, gc, c.a * alpha);
}

float noise(vec2 q) { return fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 p = vP;
  // 距離場與「哪一塊比較近」：融合時每塊只畫自己這一半（先記旗標，discard 放迴圈外，ANGLE/D3D 才不會編錯）
  float me = selfD(p), d = me, near = me;
  float od[MAXN];
  bool mine = true;
  for (int i = 0; i < uNn; i++) {
    float o = otherD(p, i);
    od[i] = o;
    d = blendMin(d, o, uK);
    near = min(near, o);
    if (o < me - 0.15) mine = false;
  }
  float aa = 0.75 / uPx;
  float cov = 1.0 - smoothstep(-aa, aa, d);
  if (cov <= 0.0 || !mine) discard;

  float dsEdge = 0.0;
  if (uDsProg > -0.5) {
    float th = dissolveThr(p / (2.0 * uGlyphHalf));
    if (th < uDsProg) discard;
    dsEdge = 1.0 - smoothstep(0.0, 0.08, th - uDsProg);
  }

  // 材質依距離混合：融合的玻璃之間中心、明暗、顏色都連續
  float spread = 6.0 * uS + uK * 0.5;
  float wSelf = exp(-(me - near) / spread) * max(uPresence, 1e-4), wSum = wSelf;
  vec2 cen = vec2(0.0);
  float tone = uTone * wSelf, solid = uSolid * wSelf, sizeK = uSizeK * wSelf;
  vec3 tint = uTint * wSelf;
  for (int i = 0; i < uNn; i++) {
    float w = exp(-(od[i] - near) / spread) * max(uNb[i].w, 1e-4);
    cen += uNa[i].xy * w; tone += uNb[i].y * w; solid += uNb[i].z * w; sizeK += uNc[i].y * w; tint += uNt[i].rgb * w;
    wSum += w;
  }
  cen /= wSum; tone /= wSum; solid /= wSum; sizeK /= wSum; tint /= wSum;

  // 朝外的方向（距離場梯度）
  const float e = 0.5;
  vec2 g = vec2(field(p + vec2(e, 0.0)) - field(p - vec2(e, 0.0)), field(p + vec2(0.0, e)) - field(p - vec2(0.0, e)));
  g = dot(g, g) > 1e-10 ? normalize(g) : vec2(0.0);

  // 邊緣高度 h(x) = (1 - (1-x)^4)^(1/4) 的斜率；x = 0 在外緣，1 開始變平
  float t = max(-d, 0.0);
  float x = clamp(t / max(uEdge * sizeK, 1.0), 0.0, 1.0), u = 1.0 - x, u4 = u * u * u * u;
  float slope = min(u * u * u * pow(max(1.0 - u4, 1e-4), -0.75), 60.0);
  if (uLip > 0.5) {                                      // 唇邊：凸面混到反相，越過頂點斜率變負，中間會縮小
    float h = pow(max(1.0 - u4, 0.0), 0.25);
    float ss = x * x * x * (x * (x * 6.0 - 15.0) + 10.0), dss = 30.0 * x * x * u * u;
    slope = clamp(slope * (1.0 - 2.0 * ss) + dss * (1.0 - 2.0 * h), -60.0, 60.0);
  }
  float ang = atan(slope);
  float bend = tan(ang - asin(sin(ang) / IOR));          // 垂直向下的光線折射一次後，偏離垂直線的斜率
  vec2 off = -g * bend * uRefr * sizeK * uLensK;
  off += (cen - p) * (1.0 - 1.0 / mix(1.0, uMag, uLensK));

  // 被擠壓的邊緣用較高的 LOD 取樣，才不會閃爍（算在分支之前）
  vec2 look = (p + off) * uPx;
  vec2 dx = dFdx(look), dy = dFdy(look);
  float lod = max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8)));

  vec3 col;
  if (uDispL > 0.001) {
    float k = uDispL * 0.45;
    col = vec3(seen(p + off * (1.0 - k), lod).r, seen(p + off, lod).g, seen(p + off * (1.0 + k), lod).b);
  } else col = seen(p + off, lod);
  col = toG(col);
  // 魚：在玻璃裡、表面底下，邊緣一樣被透鏡擠壓（偏移打一點折，霧面也會讓牠糊一點）。先取樣，等圖案畫好再疊上去
  vec4 fsh = vec4(0.0);
  if (uFishOn > 0.5) fsh = textureLod(uFishTex, uvOf(p + off * 0.6), lod + min(log2(1.0 + uBlurK), 2.0) * 0.6);

  // 表面：鮮豔度 → 霧面（亮玻璃偏白、暗玻璃偏石墨，再帶一點底色）→ 染色 → 亮度
  vec3 under = toG(textureLod(uBlurTex, uvOf(p), uPickLod).rgb);
  vec3 rich = clamp(mix(vec3(dot(under, LUM)), under, 1.6), 0.0, 1.0);
  col = max(mix(vec3(dot(col, LUM)), col, uVibL), 0.0);
  vec3 plainVeil = mix(vec3(1.0), vec3(0.10, 0.105, 0.11), tone);
  vec3 dyedVeil = mix(mix(rich, vec3(1.0), 0.45), rich * 0.45, tone);
  col = mix(col, mix(plainVeil, dyedVeil, uBelow), uFrostL);
  vec3 hue = rich / max(max(rich.r, max(rich.g, rich.b)), 0.05);
  col *= mix(vec3(1.0), mix(vec3(1.0), hue, 0.5), uBelow * 0.25);
  col *= mix(vec3(1.0), tint, uIconTint);                // 每顆圖示自己的玻璃色
  col = mix(col, uTintCol * (0.45 + 0.75 * dot(col, LUM)), uTintAmt);
  col += uBrightL;
  col = mix(col, vec3(0.975), solid);                    // 控制元件的滑塊：靜止是白色實心，按下才變玻璃

  // 光：整圈細亮線，光源那側和正對面最亮；再加一層很淡的反光鋪在彎曲的邊緣上
  float toward = dot(g, uLight2);
  float lobes = 0.12 + pow(max(toward, 0.0), 1.6) + 0.8 * pow(max(-toward, 0.0), 1.6);
  float ring = exp(-t / max(uRimW, 0.3));
  float tiltN = 1.0 - 1.0 / sqrt(1.0 + slope * slope);
  col += uRimL * uLensK * (ring * lobes * 0.95 + tiltN * tiltN * 0.14 * (0.4 + 0.6 * max(toward, 0.0)));

  col += uGlow * 0.08;
  if (uTouch.z > 0.001) {                                // 觸碰：手指底下亮起來
    vec2 q = p - uTouch.xy;
    col += 0.26 * uTouch.z * exp(-dot(q, q) / (2.0 * 46.0 * 46.0 * uS * uS));
  }

  // 玻璃上的圖案（融合中的鄰居也要畫，才不會被切開）
  if (uHasGlyph > 0.5) addGlyph(col, p, vec2(0.0), uGlyphHalf, uGlyphCell, uInk, uFlip, uGlyphOpacity * uGlyphA);
  for (int i = 0; i < uNn; i++) addGlyph(col, p, uNa[i].xy, uNc[i].x, uNg[i], uNc[i].z, uNc[i].w, uGlyphOpacity * uNt[i].a);
  // 魚游在圖案上面；表面的霧和邊緣光再蓋在魚上
  if (fsh.a > 0.002) {
    vec3 fc = toG(fsh.rgb / fsh.a);
    fc = mix(fc, mix(plainVeil, dyedVeil, uBelow), uFrostL * 0.6);
    col = mix(col, fc, fsh.a);
    col += uRimL * uLensK * ring * lobes * 0.95 * fsh.a * 0.6;
  }

  col += toG(uDsTint) * dsEdge * 1.3;
  col += (noise(gl_FragCoord.xy) - 0.5) / 255.0;         // 抖色：模糊後的漸層不會出現色階

  gl_FragColor = vec4(toL(clamp(col, 0.0, 1.0)), cov);
  #include <colorspace_fragment>
}
`;

const PLANE = new THREE.PlaneGeometry(1, 1);
const vecs = () => Array.from({ length: MAXN }, () => new THREE.Vector4());

export function createLens(shared, own = {}) {
  const uniforms = {
    uHalf: { value: new THREE.Vector2(30, 30) }, uBox: { value: new THREE.Vector3(32, 32, 3) },
    uRadius: { value: 14 }, uHeight: { value: 3 }, uCenter: { value: new THREE.Vector2() },
    uPresence: { value: 1 }, uSolid: { value: 0 }, uTone: { value: 0 }, uSizeK: { value: 1 }, uInk: { value: 0 }, uFlip: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uGlyphCell: { value: new THREE.Vector4() }, uHasGlyph: { value: 1 }, uGlyphHalf: { value: 30 }, uGlyphA: { value: 1 }, uGlow: { value: 0 },
    uTouch: { value: new THREE.Vector3() },
    uRot: { value: 0 }, uDsProg: { value: -1 }, uDsTint: { value: new THREE.Color(0xd6b4ff) }, uFishTex: { value: null }, uFishOn: { value: 0 },
    uNn: { value: 0 }, uK: { value: 1 }, uNa: { value: vecs() }, uNb: { value: vecs() }, uNc: { value: vecs() }, uNg: { value: vecs() }, uNt: { value: vecs() },
    ...shared,
    ...own,
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(PLANE, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// 玻璃上的文字：每段文字各自光柵化成一張小貼圖，只用 alpha；深色字略細、淺色字略粗（瀏覽器畫字時也是這樣）
const inkVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;
const inkFrag = /* glsl */`
uniform sampler2D uTex; uniform float uInk, uAlpha;
varying vec2 vUv;
void main() {
  float a = pow(texture2D(uTex, vUv).a, mix(1.2, 0.85, uInk)) * uAlpha;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(mix(vec3(0.008), vec3(1.0), uInk), a);
  #include <colorspace_fragment>
}
`;
export function createInk() {
  const tex = new THREE.CanvasTexture(document.createElement('canvas'));
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  const uniforms = { uTex: { value: tex }, uInk: { value: 0 }, uAlpha: { value: 0 } };
  const mesh = new THREE.Mesh(PLANE, new THREE.ShaderMaterial({ vertexShader: inkVert, fragmentShader: inkFrag, uniforms, transparent: true, depthTest: false, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  let size = 0;
  return {
    mesh, uniforms,
    // canvas 的邏輯尺寸 w×h（pt）
    set(canvas, w, h) {
      const key = canvas.width * 65536 + canvas.height;
      if (key !== size) { size = key; tex.dispose(); }
      tex.image = canvas; tex.needsUpdate = true;
      mesh.scale.set(w, h, 1);
    },
  };
}
