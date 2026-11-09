// 池塘桌布的荷葉和荷花：每片一張小圖（tools/pond_layers.py 拆出來的），各自漂移、旋轉。
// 畫到一張透明的 RT（premultiplied），螢幕層用和桌布同一組 UV 疊在水面影片上，所以裁切、視差都不用另外算。
import * as THREE from 'three';

const RT_W = 720, RT_H = 1560;
const rng = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

const vert = /* glsl */`
attribute vec2 aOff, aPivot, aHome, aUv0, aPad2;
attribute vec4 aPad, aOwn;
attribute float aShadow;
uniform float uTime; uniform vec2 uCrop;
varying vec2 vUv0; varying float vShadow;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void main() {
  float t = uTime;
  // 一道很慢的湧浪走過整個池塘：相鄰的葉子動得相近，再加上各自的相位
  float w = t * 0.55 - dot(aHome, vec2(0.0034, 0.0058));
  vec2 off = aPad.w * vec2(sin(w + aPad.x) + 0.4 * sin(w * 1.73 + aPad.y * 2.0), sin(w * 0.83 + aPad.y) + 0.4 * sin(w * 1.41 + aPad.x * 2.0));
  float ang = aPad2.x * (sin(t * aPad2.y + aPad.z) + 0.3 * sin(t * aPad2.y * 2.1 + aPad.x));
  vec2 P = aHome + off + rot(ang) * (aPivot - aHome);      // 花跟著牠底下的葉子走
  float A = ang, S = 1.0;
  if (aOwn.z > 0.0) {                                      // 花自己再多晃一點，花瓣微微開合
    P += aOwn.z * vec2(sin(t * 0.9 + aOwn.x), cos(t * 0.71 + aOwn.x * 1.7));
    A += aOwn.w * sin(t * 0.8 + aOwn.y);
    S = 1.0 + 0.03 * sin(t * 1.15 + aOwn.y * 2.0);
  }
  vec2 q = P + rot(A) * (aOff * S) + aShadow * vec2(3.0, 6.0);
  vUv0 = aUv0; vShadow = aShadow;
  gl_Position = vec4(q.x / uCrop.x * 2.0 - 1.0, 1.0 - q.y / uCrop.y * 2.0, 0.0, 1.0);
}
`;
const frag = /* glsl */`
uniform sampler2D uAtlas; uniform float uFade;
varying vec2 vUv0; varying float vShadow;
void main() {
  if (vShadow > 0.5) {
    float a = texture2D(uAtlas, vUv0, 3.0).a * 0.34 * uFade;   // 影子：取模糊的 alpha，跟著葉子走
    gl_FragColor = vec4(vec3(0.0, 0.03, 0.04) * a, a);
  } else {
    vec4 c = texture2D(uAtlas, vUv0);
    c.a *= uFade;
    gl_FragColor = vec4(c.rgb * c.a, c.a);
  }
}
`;

export function createPlants(renderer) {
  let rt = null, mesh = null, want = null, fade = 0;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = { uTime: { value: 0 }, uCrop: { value: new THREE.Vector2(635, 1375) }, uAtlas: { value: null }, uFade: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });

  function build(data, atlas) {
    const S = data.sprites, A = data.size;
    const area = (s) => Math.min(1, Math.sqrt(s.area) / 210);    // 大葉 ≈ 1：動得小而慢，小葉動得多
    const quad = (i, shadow, out) => {
      const s = S[i], par = s.parent >= 0 ? S[s.parent] : s, pi = s.parent >= 0 ? s.parent : i, big = area(par);
      const pad = [rng(pi, 1) * 6.283, rng(pi, 2) * 6.283, rng(pi, 3) * 6.283, 6 + 4 * (1 - big)];
      const pad2 = [0.05 + 0.06 * (1 - big), 0.5 + 0.3 * rng(pi, 4)];
      const own = s.k === 1 ? [rng(i, 5) * 6.283, rng(i, 6) * 6.283, 2.5, 0.11] : [0, 0, 0, 0];
      const [bx, by, bw, bh] = s.b, [ax, ay, aw, ah] = s.a;
      for (const [cx, cy] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        out.off.push(bx + bw * cx - s.x, by + bh * cy - s.y);
        out.pivot.push(s.x, s.y); out.home.push(par.x, par.y);
        out.uv.push((ax + aw * cx) / A, 1 - (ay + ah * cy) / A);
        out.pad.push(...pad); out.pad2.push(...pad2); out.own.push(...own);
        out.shadow.push(shadow);
      }
    };
    const out = { off: [], pivot: [], home: [], uv: [], pad: [], pad2: [], own: [], shadow: [] };
    const byKind = (k) => S.map((s, i) => i).filter((i) => S[i].k === k).sort((a, b) => S[b].area - S[a].area);
    for (const k of [0, 1]) {                                    // 葉影 → 葉 → 花影 → 花
      const list = byKind(k);
      for (const i of list) quad(i, 1, out);
      for (const i of list) quad(i, 0, out);
    }
    const geo = new THREE.BufferGeometry();
    const num = (n, a) => new THREE.Float32BufferAttribute(a, n);
    geo.setAttribute('position', num(2, out.off));
    geo.setAttribute('aOff', num(2, out.off)); geo.setAttribute('aPivot', num(2, out.pivot)); geo.setAttribute('aHome', num(2, out.home));
    geo.setAttribute('aUv0', num(2, out.uv)); geo.setAttribute('aPad', num(4, out.pad)); geo.setAttribute('aPad2', num(2, out.pad2));
    geo.setAttribute('aOwn', num(4, out.own)); geo.setAttribute('aShadow', num(1, out.shadow));
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); uniforms.uAtlas.value?.dispose(); }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);   // position 只有兩維，three 自己算會得到 NaN
    mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    scene.add(mesh);
    uniforms.uAtlas.value = atlas;
    uniforms.uCrop.value.set(data.crop[0], data.crop[1]);
    fade = 0;
    if (!rt) rt = new THREE.WebGLRenderTarget(RT_W, RT_H, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  const clear = new THREE.Color();
  return {
    get active() { return !!want && !!mesh; },
    get texture() { return rt ? rt.texture : null; },
    get fading() { return fade < 1; },
    set(url) {
      if (url === want) return;
      want = url;
      if (!url) return;
      fetch(url).then((r) => r.json()).then((data) => new Promise((ok, no) => {
        new THREE.TextureLoader().load(data.atlas, (t) => ok([data, t]), undefined, no);
      })).then(([data, t]) => {
        if (want !== url) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
        build(data, t);
      }).catch(() => { /* 沒有圖層就只有水面 */ });
    },
    // wallReady：水面（靜態墊底或影片）有畫面了才淡入，免得葉子疊在上一張桌布上
    render(t, dt, wallReady) {
      if (!this.active) return;
      if (wallReady) fade = Math.min(1, fade + dt / 0.7);
      uniforms.uTime.value = t; uniforms.uFade.value = fade;
      const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(clear, alpha);
    },
  };
}
