// 厚玻璃：每塊玻璃一個包圍盒，片段著色器在盒內對 SDF 做光線追蹤（z = 0 是螢幕）。
// 形狀 = 圓角方塊＋倒角＋頂面弧度；靠近的玻璃用平滑聯集融成一塊（液態融合），每塊只畫離自己近的那一半。
// 入射面折射 → 玻璃內前進（側壁全反射最多 3 次）→ 貼著螢幕就取樣，或從側壁/底面射出再落到螢幕。
// 途中穿過 glyph 平面就疊上圖案；R/G/B 用不同折射率 = 色散（低畫質只追一次，再把取樣點沿折射方向錯開）。
import * as THREE from 'three';
import { DISSOLVE_GLSL } from './dust.js';
import { MAXN } from './liquid.js';

const vert = /* glsl */`
uniform vec3 uBox;
varying vec3 vLocal; varying vec3 vCamLocal;
void main() {
  vec3 p = vec3(position.xy * 2.0 * uBox.xy, position.z * uBox.z);
  vLocal = p;
  vCamLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

// 畫質（#define）：手機用 LOW — 步數少、反彈少、色散只追一次
const frag = /* glsl */`
#ifndef STEPS_OUT
#define STEPS_OUT 72
#define STEPS_IN 48
#define BOUNCES 4
#define DISPERSION 1
#endif
#define MAXN ${MAXN}
uniform mat4 modelMatrix; uniform mat4 projectionMatrix;
uniform mat3 uEnvRot; uniform float uGlow, uRot, uDsProg; uniform vec3 uDsTint, uTouch;
uniform vec2 uHalf; uniform vec3 uBox; uniform float uRadius, uHeight, uBevel, uDome, uZb;
uniform int uNn; uniform float uK;
uniform vec4 uNa[MAXN]; uniform vec4 uNb[MAXN]; uniform vec4 uNc[MAXN]; uniform vec4 uNg[MAXN];   // 鄰居：相對位置＋半寬／圓角、高、底、倒角／弧度、圖案半寬、圖案 z／圖集格
uniform float uIor, uDisp, uFrost, uAbsorb, uRefl, uRim, uSpec, uEnvI, uInner, uVib;
uniform vec3 uTint, uLightW, uLightL;
uniform sampler2D uScreenTex; uniform vec2 uScreenSize, uCenter;
uniform sampler2D uGlyphTex; uniform vec4 uGlyphCell; uniform float uGlyphZ, uGlyphHalf, uGlyphOpacity, uHasGlyph, uGlyphScale, uGlyphFrost, uHaze;
uniform float uLodScreen, uLodGlyph, uPixAngle;
uniform sampler2D uFishTex; uniform float uFishOn;
varying vec3 vLocal; varying vec3 vCamLocal;

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
${DISSOLVE_GLSL}
float shape(vec3 p, vec2 hs, float r, float h, float zb, float bev, float dome) {
  float d2 = sdRR(p.xy, hs, r);
  float inner = clamp(-d2 / min(hs.x, hs.y), 0.0, 1.0);
  float zt = zb + h + dome * inner * (2.0 - inner);             // 頂面微凸（負值 = 中間凹、邊緣隆起）
  float b = min(bev, min(h, min(hs.x, hs.y)) - 0.01);
  vec2 w = vec2(d2 + b, p.z - zt + b);
  float d = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - b;
  return max(d, zb - p.z);
}
float selfD(vec3 p) { return shape(p, uHalf, uRadius, uHeight, uZb, uBevel, uDome); }
float otherD(vec3 p, int i) { return shape(vec3(p.xy - uNa[i].xy, p.z), uNa[i].zw, uNb[i].x, uNb[i].y, uNb[i].z, uNb[i].w, uNc[i].x); }
float sminQ(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdGlass(vec3 p) {
  float d = selfD(p);
  for (int i = 0; i < uNn; i++) {
    // 鄰居的外框已經比目前距離遠超過 k：平滑聯集不會有影響，省下這次計算（托盤這種大面積玻璃差很多）
    vec2 q = abs(p.xy - uNa[i].xy) - uNa[i].zw;
    if (max(q.x, q.y) < d + uK) d = sminQ(d, otherD(p, i), uK);
  }
  return d;
}

vec3 nrm(vec3 p) {
  const vec2 k = vec2(1.0, -1.0); const float e = 0.03;
  return normalize(k.xyy * sdGlass(p + k.xyy * e) + k.yyx * sdGlass(p + k.yyx * e) + k.yxy * sdGlass(p + k.yxy * e) + k.xxx * sdGlass(p + k.xxx * e));
}

// 白色攝影棚環境（世界座標；uEnvRot = 手機在世界中的轉向）：倒角映出亮白；主光柔光箱與光源同向，對側一條冷色補光
vec3 env(vec3 dl) {
  vec3 d = normalize(uEnvRot * dl);
  vec3 L = uLightW;
  vec3 c = mix(vec3(0.25, 0.25, 0.28), vec3(0.78, 0.78, 0.82), smoothstep(-0.8, 0.85, d.y));
  float k = max(dot(d, L), 0.0);
  c += vec3(1.0, 0.98, 0.95) * (smoothstep(0.72, 0.97, k) * 1.5 + pow(k, 6.0) * 0.4);
  vec3 F = normalize(vec3(-L.x, -L.y * 0.4 + 0.3, L.z));
  c += vec3(0.75, 0.85, 1.0) * smoothstep(0.93, 0.985, max(dot(d, F), 0.0)) * 0.9;
  return c * uEnvI;
}

vec2 screenUV(vec2 xy) {
  float c = cos(uRot), s = sin(uRot);                       // 編輯模式抖動時圖示會轉
  return (vec2(c * xy.x - s * xy.y, s * xy.x + c * xy.y) + uCenter) / uScreenSize + 0.5;
}
vec3 screenAt(vec2 xy, float lod) {
  vec2 uv = screenUV(xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  vec3 col = textureLod(uScreenTex, uv, lod).rgb;
  return max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uVib), vec3(0.0));     // 鮮豔度
}

// 乳白霧感：路徑越長越偏白（壓克力的散射）
vec3 haze(vec3 c, float dist) { return mix(c, vec3(0.86, 0.88, 0.92) * uEnvI, 1.0 - exp(-(uHaze + uFrost * 1.5) * dist * 0.02)); }

// 光線這一段穿過某塊玻璃的圖案平面時疊上圖案
void addGlyph(vec3 p, vec3 q, vec3 d, float gz, float gh, vec4 cell, vec2 off, float dist, vec3 kA, inout vec3 acc, inout float trans) {
  if ((p.z - gz) * (q.z - gz) >= 0.0) return;
  float tg = (gz - p.z) / d.z;
  vec2 g = ((p + d * tg).xy - off) / (2.0 * gh * uGlyphScale) + 0.5;
  if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) return;
  float lod = uLodGlyph + uFrost * 4.0 * (1.0 - gz / max(uBox.z, 1.0)) + uGlyphFrost * 3.0;
  vec4 c = textureLod(uGlyphTex, cell.xy + (0.03125 + g * 0.9375) * cell.zw, lod);
  float a = c.a * uGlyphOpacity;
  acc += trans * exp(-kA * (dist + tg)) * c.rgb * a * 1.08;
  trans *= 1.0 - a;
}

// 魚在玻璃裡的一個水平面上：光線穿過那個平面時疊上魚層（魚層是預乘 alpha）
void addFish(vec3 p, vec3 q, vec3 d, float fz, float dist, vec3 kA, inout vec3 acc, inout float trans) {
  if ((p.z - fz) * (q.z - fz) >= 0.0) return;
  float tf = (fz - p.z) / d.z;
  vec4 c = textureLod(uFishTex, screenUV((p + d * tf).xy), 0.0);
  acc += trans * exp(-kA * (dist + tf)) * c.rgb;
  trans *= 1.0 - c.a;
}

// 記下最後落到螢幕的位置，低畫質色散用
vec2 gExit; float gLod, gWeight;

vec3 traceRay(vec3 p, vec3 d, float ior) {
  vec3 acc = vec3(0.0); float trans = 1.0; float dist = 0.0;
  vec3 kA = ((vec3(1.0) - uTint) * 0.12 + 0.002) * uAbsorb;   // 每 pt 吸收
  gWeight = 0.0;
  for (int b = 0; b < BOUNCES; b++) {
    float t = 0.0; bool contact = false, atWall = false;
    for (int j = 0; j < STEPS_IN; j++) {
      vec3 q = p + d * t;
      if (q.z <= 0.02) { contact = true; break; }
      float s = sdGlass(q);
      if (s > -0.02) { atWall = true; break; }
      t += max(-s * 0.9, 0.04);
    }
    if (contact && d.z < 0.0) t = max(-p.z / d.z, 0.0);
    vec3 q = p + d * t;
    // 魚在圖案上面一層（光線往下先穿過魚）
    if (uFishOn > 0.5) addFish(p, q, d, max(uGlyphZ, uZb + uHeight * 0.4) + (uZb + uHeight - max(uGlyphZ, uZb + uHeight * 0.4)) * 0.5, dist, kA, acc, trans);
    if (uHasGlyph > 0.5) addGlyph(p, q, d, uGlyphZ, uGlyphHalf, uGlyphCell, vec2(0.0), dist, kA, acc, trans);
    for (int i = 0; i < uNn; i++) if (uNc[i].y > 0.0) addGlyph(p, q, d, uNc[i].z, uNc[i].y, uNg[i], uNa[i].xy, dist, kA, acc, trans);
    dist += t;
    vec3 att = exp(-kA * dist);
    float lod = uLodScreen + uFrost * (4.0 + log2(1.0 + dist));
    if (contact || !atWall) {                    // 步數用完還在玻璃裡：別用亂掉的法線，直接看正下方的螢幕
      gExit = q.xy; gLod = lod; gWeight = trans * att.g;
      return haze(acc + trans * att * screenAt(q.xy, lod), dist);
    }
    vec3 n = nrm(q);
    vec3 o = refract(d, -n, ior);
    if (dot(o, o) < 1e-6) {                 // 全反射：留在玻璃內再走一段
      d = reflect(d, n); p = q - n * 0.05;
      trans *= uInner;
      continue;
    }
    vec3 bg;
    if (o.z < -0.02) {
      gExit = q.xy + o.xy * (q.z / -o.z); gLod = lod; gWeight = trans * att.g;
      bg = screenAt(gExit, lod);
    } else {
      // 往上／水平射出：只取環境色會在頸部變成一塊白灰。主要折射旁邊的桌布，環境光當高光疊上去
      vec2 far = q.xy + normalize(o.xy + 1e-4) * (q.z + 10.0);
      gExit = far; gLod = lod; gWeight = trans * att.g * 0.55;
      bg = mix(screenAt(far, lod), env(o), 0.45);
    }
    return haze(acc + trans * att * bg, dist);
  }
  gExit = p.xy; gLod = uLodScreen; gWeight = trans;     // 反彈次數用完：取正下方的螢幕，不會跳出亮點
  return haze(acc + trans * exp(-kA * dist) * screenAt(p.xy, uLodScreen), dist);
}

void main() {
  vec3 rd = normalize(vLocal - vCamLocal);
  vec3 p = vLocal;
  vec3 bmax = uBox + 0.2;
  bool hit = false;
  float bestS = 1e9; vec3 bestP = p; float alpha = 1.0;
  for (int i = 0; i < STEPS_OUT; i++) {
    float s = sdGlass(p);
    if (s < 0.02) { hit = true; break; }
    if (s < bestS) { bestS = s; bestP = p; }
    p += rd * s;
    if (abs(p.x) > bmax.x || abs(p.y) > bmax.y || p.z > bmax.z || p.z < -0.2) break;
  }
  if (!hit) {
    // 輪廓抗鋸齒：差一點沒打中的像素用最接近點著色，alpha 交給 alpha-to-coverage
    float pix = length(bestP - vCamLocal) * uPixAngle;
    alpha = 1.0 - bestS / pix;
    if (alpha <= 0.0) discard;
    p = bestP;
  }
  // 融合時兩塊玻璃算的是同一個表面：只畫離自己近的那一半
  // （先記旗標、迴圈外才 discard：discard 直接放在動態迴圈裡會被 ANGLE/D3D 編譯錯）
  if (uNn > 0) {
    float me = selfD(p);
    bool mine = true;
    for (int i = 0; i < uNn; i++) { if (otherD(p, i) < me - 0.15) mine = false; }   // 留一點重疊，交界才不會有針孔
    if (!mine) discard;
  }
  // 粉塵消散：被掃過的地方挖掉，邊緣微微發光
  float dsEdge = 0.0;
  if (uDsProg > -0.5) {
    float th = dissolveThr(p.xy / (2.0 * uGlyphHalf));
    if (th < uDsProg) discard;
    dsEdge = 1.0 - smoothstep(0.0, 0.08, th - uDsProg);
  }

  vec3 n = nrm(p);
  vec3 v = -rd;
  float cosi = clamp(dot(n, v), 0.0, 1.0);
  float F0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosi, 5.0);
  vec3 pin = p - n * 0.06;
  vec3 col;
#if DISPERSION
  if (uDisp > 0.001) {
    float dI = uDisp * 0.06;
    col.r = traceRay(pin, refract(rd, n, 1.0 / (uIor - dI)), uIor - dI).r;
    col.g = traceRay(pin, refract(rd, n, 1.0 / uIor), uIor).g;
    col.b = traceRay(pin, refract(rd, n, 1.0 / (uIor + dI)), uIor + dI).b;
  } else
#endif
  col = traceRay(pin, refract(rd, n, 1.0 / uIor), uIor);
#if !DISPERSION
  // 手機版色散：光線彎得越多，紅藍取樣點錯開越多，只有邊緣會出現彩虹
  if (uDisp > 0.001 && gWeight > 0.0) {
    vec2 off = (gExit - p.xy) * uDisp * 0.4;
    vec3 c0 = screenAt(gExit, gLod);
    col.r += gWeight * (screenAt(gExit + off, gLod).r - c0.r);
    col.b += gWeight * (screenAt(gExit - off, gLod).b - c0.b);
  }
#endif
  col = col * (1.0 - F * uRefl) + env(reflect(rd, n)) * F * uRefl;
  float rim = pow(1.0 - cosi, 3.0) * uRim;
  col += rim * (0.25 + 0.75 * max(dot(n, uLightL), 0.0)) * 0.55;
  vec3 hv = normalize(uLightL + v);
  col += pow(max(dot(n, hv), 0.0), 48.0) * uSpec * 0.7;
  col += uGlow * vec3(0.16, 0.17, 0.2);                 // 按下時微亮
  // 觸碰反應：手指位置的玻璃亮起來，倒角更明顯
  if (uTouch.z > 0.001) {
    vec2 tp = p.xy - uTouch.xy;
    col += uTouch.z * exp(-dot(tp, tp) / (uGlyphHalf * uGlyphHalf * 1.6 + 1.0)) * (0.2 + 0.6 * (1.0 - cosi)) * vec3(1.0, 0.98, 0.95);
  }
  col += uDsTint * dsEdge * 1.3;

  vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
export const QUALITY = {
  high: { STEPS_OUT: 72, STEPS_IN: 48, BOUNCES: 4, DISPERSION: 1 },
  low: { STEPS_OUT: 40, STEPS_IN: 24, BOUNCES: 2, DISPERSION: 0 },
};

const vecs = () => Array.from({ length: MAXN }, () => new THREE.Vector4());

// shared：所有玻璃共用的 uniform 物件（同一個參考，改一次全部生效）
export function createGlass(shared, own, quality = 'high') {
  const uniforms = {
    uHalf: { value: new THREE.Vector2(30, 30) }, uBox: { value: new THREE.Vector3(32, 32, 20) },
    uRadius: { value: 14 }, uHeight: { value: 12 }, uBevel: { value: 6 }, uDome: { value: 0 }, uZb: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uGlyphCell: { value: new THREE.Vector4() }, uHasGlyph: { value: 1 }, uGlyphZ: { value: 1 }, uGlyphHalf: { value: 30 }, uGlow: { value: 0 },
    uTouch: { value: new THREE.Vector3() },
    uRot: { value: 0 }, uDsProg: { value: -1 }, uDsTint: { value: new THREE.Color(0xd6b4ff) }, uFishTex: { value: null }, uFishOn: { value: 0 },
    uNn: { value: 0 }, uK: { value: 1 }, uNa: { value: vecs() }, uNb: { value: vecs() }, uNc: { value: vecs() }, uNg: { value: vecs() },
    ...shared,
    ...own,
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, alphaToCoverage: true, defines: { ...QUALITY[quality] } });
  const mesh = new THREE.Mesh(BOX, mat);
  mesh.frustumCulled = false;
  return mesh;
}
