// 厚玻璃圖示：每個圖示是一個包圍盒，片段著色器在盒內對圓角方塊 SDF 做光線追蹤。
// 入射面折射 → 玻璃內前進（側壁全反射最多 3 次）→ 從底面碰到螢幕，或從側壁/頂面射出再落到螢幕。
// 途中穿過 glyph 平面就疊上圖示圖案；R/G/B 用不同折射率 = 色散。
import * as THREE from 'three';
import { DISSOLVE_GLSL } from './dust.js';

const vert = /* glsl */`
uniform vec2 uHalf; uniform float uHeight, uDome, uMargin;
varying vec3 vLocal; varying vec3 vCamLocal;
void main() {
  vec3 p = vec3(position.xy * 2.0 * (uHalf + uMargin), position.z * (uHeight + uDome + uMargin));
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
uniform mat4 modelMatrix; uniform mat4 projectionMatrix;
uniform mat3 uEnvRot; uniform float uGlow, uRot, uDsProg; uniform vec3 uDsTint;
uniform vec2 uHalf; uniform float uRadius, uHeight, uBevel, uDome, uMargin;
uniform float uIor, uDisp, uFrost, uAbsorb, uRefl, uRim, uSpec, uEnvI, uInner;
uniform vec3 uTint, uLightW, uLightL;
uniform sampler2D uScreenTex; uniform vec2 uScreenSize, uCenter; uniform float uBaseZ;
uniform sampler2D uGlyphTex; uniform vec4 uGlyphCell; uniform float uGlyphZ, uGlyphOpacity, uHasGlyph, uGlyphScale, uGlyphFrost, uHaze;
uniform float uLodScreen, uLodGlyph, uPixAngle;
varying vec3 vLocal; varying vec3 vCamLocal;

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
${DISSOLVE_GLSL}
float sdGlass(vec3 p) {
  float d2 = sdRR(p.xy, uHalf, uRadius);
  float inner = clamp(-d2 / min(uHalf.x, uHalf.y), 0.0, 1.0);
  float zt = uHeight + uDome * inner * (2.0 - inner);           // 頂面微凸
  float b = min(uBevel, min(uHeight, min(uHalf.x, uHalf.y)) - 0.01);
  vec2 w = vec2(d2 + b, p.z - zt + b);
  float d = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - b;
  return max(d, -p.z);
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

vec3 screenAt(vec2 xy, float lod) {
  float c = cos(uRot), s = sin(uRot);                       // 編輯模式抖動時圖示會轉
  vec2 uv = (vec2(c * xy.x - s * xy.y, s * xy.x + c * xy.y) + uCenter) / uScreenSize + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return textureLod(uScreenTex, uv, lod).rgb;
}

vec4 glyphAt(vec2 xy, float lod) {
  vec2 g = xy / (2.0 * uHalf * uGlyphScale) + 0.5;
  if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) return vec4(0.0);
  vec4 c = textureLod(uGlyphTex, uGlyphCell.xy + (0.03125 + g * 0.9375) * uGlyphCell.zw, lod);
  return c;
}

// 乳白霧感：路徑越長越偏白（壓克力的散射）
vec3 haze(vec3 c, float dist) { return mix(c, vec3(0.86, 0.88, 0.92) * uEnvI, 1.0 - exp(-(uHaze + uFrost * 1.5) * dist * 0.02)); }

vec3 traceRay(vec3 p, vec3 d, float ior) {
  vec3 acc = vec3(0.0); float trans = 1.0; float dist = 0.0;
  vec3 kA = ((vec3(1.0) - uTint) * 0.12 + 0.002) * uAbsorb;   // 每 pt 吸收
  for (int b = 0; b < BOUNCES; b++) {
    float t = 0.0; bool base = false;
    for (int j = 0; j < STEPS_IN; j++) {
      vec3 q = p + d * t;
      if (q.z <= 0.02) { base = true; break; }
      float s = sdGlass(q);
      if (s > -0.02) break;
      t += max(-s * 0.9, 0.04);
    }
    if (base && d.z < 0.0) t = max(-p.z / d.z, 0.0);
    vec3 q = p + d * t;
    if (uHasGlyph > 0.5 && (p.z - uGlyphZ) * (q.z - uGlyphZ) < 0.0) {
      float tg = (uGlyphZ - p.z) / d.z;
      vec4 g = glyphAt((p + d * tg).xy, uLodGlyph + uFrost * 4.0 * (1.0 - uGlyphZ / max(uHeight + uDome, 1.0)) + uGlyphFrost * 3.0);
      float a = g.a * uGlyphOpacity;
      acc += trans * exp(-kA * (dist + tg)) * g.rgb * a * 1.08;
      trans *= 1.0 - a;
    }
    dist += t;
    vec3 att = exp(-kA * dist);
    float lod = uLodScreen + uFrost * (4.0 + log2(1.0 + dist));
    if (base) {
      vec2 xy = q.xy;
      if (uBaseZ > 0.01) {
        vec3 o = refract(d, vec3(0.0, 0.0, 1.0), ior);
        if (dot(o, o) < 1e-6) { d = reflect(d, vec3(0.0, 0.0, 1.0)); p = q + vec3(0.0, 0.0, 0.04); continue; }
        xy += o.xy / max(-o.z, 0.05) * uBaseZ;
      }
      return haze(acc + trans * att * screenAt(xy, lod), dist);
    }
    vec3 n = nrm(q);
    vec3 o = refract(d, -n, ior);
    if (dot(o, o) < 1e-6) {                 // 全反射：留在玻璃內再走一段
      d = reflect(d, n); p = q - n * 0.05;
      trans *= uInner;
      continue;
    }
    vec3 bg = o.z < -0.02 ? screenAt(q.xy + o.xy * ((q.z + uBaseZ) / -o.z), lod) : env(o);
    return haze(acc + trans * att * bg, dist);
  }
  return haze(acc + trans * exp(-kA * dist) * env(d) * 0.6, dist);
}

void main() {
  vec3 rd = normalize(vLocal - vCamLocal);
  vec3 p = vLocal;
  vec3 bmax = vec3(uHalf + uMargin + 0.2, uHeight + uDome + uMargin + 0.2);
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
  // 粉塵消散：被掃過的地方挖掉，邊緣微微發光
  float dsEdge = 0.0;
  if (uDsProg > -0.5) {
    float th = dissolveThr(p.xy / (2.0 * uHalf.x));
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
  col = col * (1.0 - F * uRefl) + env(reflect(rd, n)) * F * uRefl;
  float rim = pow(1.0 - cosi, 3.0) * uRim;
  col += rim * (0.25 + 0.75 * max(dot(n, uLightL), 0.0)) * 0.55;
  vec3 hv = normalize(uLightL + v);
  col += pow(max(dot(n, hv), 0.0), 48.0) * uSpec * 0.7;
  col += uGlow * vec3(0.16, 0.17, 0.2);                 // 按下時微亮
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

// shared：所有圖示共用的 uniform 物件（同一個參考，改一次全部生效）
export function createGlass(shared, own, quality = 'high') {
  const uniforms = {
    uHalf: { value: new THREE.Vector2(30, 30) }, uRadius: { value: 14 }, uHeight: { value: 12 }, uBevel: { value: 6 },
    uCenter: { value: new THREE.Vector2() }, uBaseZ: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uGlyphCell: { value: new THREE.Vector4() }, uHasGlyph: { value: 1 }, uGlyphZ: { value: 1 }, uGlow: { value: 0 },
    uRot: { value: 0 }, uDsProg: { value: -1 }, uDsTint: { value: new THREE.Color(0xd6b4ff) },
    ...shared,
    ...own,
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, alphaToCoverage: true, defines: { ...QUALITY[quality] } });
  const mesh = new THREE.Mesh(BOX, mat);
  mesh.frustumCulled = false;
  return mesh;
}
