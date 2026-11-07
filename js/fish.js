// 鯉魚：主畫面底下是一池水，只有透過玻璃看得到。魚從 Dock 的圖示裡出現、先繞一小圈，
// 再一排一排往上：每次挑上一排、左右不遠的一個圖示游過去（路線是彎的），在玻璃裡游得慢、穿過縫隙時加快，
// 所以大部分時間都在玻璃圖示裡。游出上緣後再從 Dock 出現。手指按住，附近的魚會急轉逃開。
// 游法照鯉魚（鯵型游法）：身體的波從頭傳到尾、越往尾巴擺越大；要快就加快擺尾頻率而不是加大擺幅；
// 擺一陣就滑一陣（擺尾─滑行）；轉彎時整個身體彎成弧形，彎得越多轉得越急。
// 畫法：每隻魚是一片會擺尾的四邊形，畫進一張透明的「魚層」（螢幕大小、含 mipmap）。
// 玻璃著色器折射時一起取樣（邊緣會被透鏡擠壓）；玻璃之間的縫隙另外淡淡地畫一層，像隔著水看到。
import * as THREE from 'three';

const vert = /* glsl */`
attribute vec4 iA;   // x, y, 方向角, 身長（pt）
attribute vec4 iB;   // 擺尾相位, 圖集第幾列（由下數）, 不透明度, 尾端擺幅（身長的比例）
attribute float iC;  // 轉彎時身體的彎曲（曲率 × 身長）
uniform vec2 uHalf; uniform vec2 uOff; uniform float uRows;
varying vec2 vUv; varying float vAlpha;
void main() {
  vec2 q = position.xy;                         // x：-0.5 尾巴 → 0.5 頭
  float t = clamp(0.5 - q.x, 0.0, 1.0);         // 0 = 頭，1 = 尾
  // 行進波：從頭傳到尾（約一個身長一個波），振幅集中在後半身，頭只輕輕偏擺
  q.y += sin(iB.x - t * 6.0) * iB.w * (0.12 + 0.88 * t * t);
  // 轉彎：身體沿著轉彎的圓弧彎（中段在弦上，頭尾往圓心那側偏）
  q.y += iC * q.x * q.x * 0.5;
  vec2 v = q * iA.w;
  float c = cos(iA.z), s = sin(iA.z);
  vec2 w = vec2(c * v.x - s * v.y, s * v.x + c * v.y) + iA.xy + uOff;
  gl_Position = vec4(w / uHalf, 0.0, 1.0);
  vUv = vec2(uv.x, (uv.y + iB.y) / uRows);
  vAlpha = iB.z;
}
`;
const frag = /* glsl */`
uniform sampler2D uAtlas; uniform float uShadow;
varying vec2 vUv; varying float vAlpha;
void main() {
  if (uShadow > 0.5) {                          // 影子：同一個形狀，糊一點、淡一點、往下偏
    float a = texture2D(uAtlas, vUv, 2.5).a * vAlpha * 0.3;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  } else {
    vec4 c = texture2D(uAtlas, vUv);
    gl_FragColor = vec4(c.rgb, c.a * vAlpha);
  }
}
`;

// 圖集還沒載入（或載入失敗）時的備用魚：程式畫的俯視錦鯉，頭朝右
const KINDS = [
  { body: '#f6f3ee', spots: '#ff4a1c' },        // 紅白
  { body: '#f6f3ee', spots: '#ff4a1c', ink: '#1a1a22' },
  { body: '#1c1c24', spots: '#ff4a1c' },
  { body: '#f2c22a', spots: null },             // 黃金
  { body: '#7d97ad', spots: '#f08a3a' },        // 淺黃
  { body: '#f6f3ee', spots: null, crown: '#ff3a1c' },   // 丹頂
];
function drawFallback() {
  const CW = 256, CH = 128, cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH * KINDS.length;
  const c = cv.getContext('2d');
  KINDS.forEach((k, i) => {
    c.save(); c.translate(0, i * CH);
    const cy = CH / 2;
    c.fillStyle = 'rgba(240,240,236,0.55)';
    c.beginPath(); c.moveTo(78, cy); c.quadraticCurveTo(30, cy - 44, 8, cy - 34); c.quadraticCurveTo(30, cy, 8, cy + 34); c.quadraticCurveTo(30, cy + 44, 78, cy); c.fill();
    c.beginPath(); c.ellipse(160, cy - 30, 24, 9, -0.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(160, cy + 30, 24, 9, 0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = k.body;
    c.beginPath(); c.moveTo(236, cy); c.bezierCurveTo(226, cy - 34, 150, cy - 34, 72, cy - 6); c.lineTo(72, cy + 6); c.bezierCurveTo(150, cy + 34, 226, cy + 34, 236, cy); c.fill();
    c.save(); c.clip();
    if (k.spots) { c.fillStyle = k.spots; for (const [x, r] of [[110, 14], [160, 18], [205, 12]]) { c.beginPath(); c.arc(x, cy + (x % 3) - 1, r, 0, Math.PI * 2); c.fill(); } }
    if (k.ink) { c.fillStyle = k.ink; for (const x of [130, 175, 190]) { c.beginPath(); c.arc(x, cy - 8, 3, 0, Math.PI * 2); c.fill(); } }
    if (k.crown) { c.fillStyle = k.crown; c.beginPath(); c.arc(210, cy, 13, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.restore();
  });
  return { canvas: cv, rows: KINDS.length };
}

export function createFish(renderer) {
  const fish = [];
  const MAX = 24;
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 0.5, 10, 1));
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC);
  geo.instanceCount = 0;
  const fb = drawFallback();
  const atlas = new THREE.CanvasTexture(fb.canvas);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.anisotropy = 4;
  let rows = fb.rows;
  const common = { uAtlas: { value: atlas }, uHalf: { value: new THREE.Vector2(187.5, 406) }, uRows: { value: rows } };
  const mk = (shadow, order) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { ...common, uShadow: { value: shadow ? 1 : 0 }, uOff: { value: new THREE.Vector2() } },
    }));
    m.frustumCulled = false; m.renderOrder = order;
    return m;
  };
  const shadowMesh = mk(true, 0), fishMesh = mk(false, 1);
  const scene = new THREE.Scene();
  scene.add(shadowMesh, fishMesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rt = null, drawn = 0, W = 375, H = 812;
  const clear = new THREE.Color();

  // 縫隙：玻璃之間也淡淡看得到魚（糊一點、暗一點，像在水底）。主場景裡畫在桌布上、玻璃底下
  const gapU = { uTex: { value: null }, uAlpha: { value: 0.35 } };
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uAlpha; varying vec2 vUv;
      void main() {
        vec4 c = textureLod(uTex, vUv, 1.3);
        if (c.a < 0.003) discard;
        gl_FragColor = vec4(c.rgb / c.a * 0.82, c.a * uAlpha);
        #include <colorspace_fragment>
      }`,
    uniforms: gapU, transparent: true, depthTest: false, depthWrite: false,
  }));
  gap.frustumCulled = false; gap.renderOrder = 0.5; gap.position.z = 0.05; gap.visible = false;

  // Gemini 生成的錦鯉圖集（assets/fish.json 指向 fish.webp，tools/fish_atlas.py 產生）：有就換上
  fetch('assets/fish.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return;
    new THREE.TextureLoader().load(j.file || 'assets/fish.webp', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
      common.uAtlas.value = t; rows = j.rows; common.uRows.value = rows;
      for (const f of fish) f.kind %= rows;
    });
  }).catch(() => {});

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const rbox = (a, x, y) => {
    const qx = Math.abs(x - a.x) - a.hx + a.r, qy = Math.abs(y - a.y) - a.hy + a.r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - a.r;
  };
  const showing = (st) => !!(st && st.live && (!st.mesh || st.mesh.visible) && !st.removed && !st.ds && !st.hidden);
  // 下一個要游去的圖示：上一排（最低的那一排）裡，左右離得近的比較會被選到
  function nextTarget(f, env) {
    const s = env.s, up = env.targets.filter((st) => showing(st) && st.live.y > f.y + 25 * s);
    if (!up.length) return null;
    const low = Math.min(...up.map((st) => st.live.y)), row = up.filter((st) => st.live.y < low + 45 * s);
    const w = row.map((st) => Math.exp(-Math.abs(st.live.x - f.x) / (85 * s)) * (0.4 + Math.random()));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = row[0];
    for (let i = 0; i < row.length; i++) { r -= w[i]; if (r <= 0) { pick = row[i]; break; } }
    f.ox = rnd(-0.25, 0.25) * pick.live.hx; f.oy = rnd(-0.25, 0.25) * pick.live.hy;
    return pick;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // 出生：在 Dock 那一帶，朝隨機方向，先繞一小圈（curl）再往上游；first = 一開始就散在整個畫面上
  function spawn(f, env, first) {
    const s = env.s;
    if (first) { f.x = rnd(-W / 2 + 30 * s, W / 2 - 30 * s); f.y = rnd(-H / 2 + 80 * s, H / 2 - 40 * s); f.ang = Math.PI / 2 + rnd(-0.6, 0.6); f.mode = 'swim'; }
    else {
      const homes = env.docks.filter(showing);
      if (homes.length) { const a = homes[Math.floor(Math.random() * homes.length)].live; f.x = a.x + rnd(-0.2, 0.2) * a.hx; f.y = a.y + rnd(-0.2, 0.2) * a.hy; }
      else { f.x = rnd(-env.dockHalfW * 0.85, env.dockHalfW * 0.85); f.y = env.dockY + rnd(-20, 20) * s; }
      f.ang = rnd(0, Math.PI * 2); f.mode = 'curl'; f.curlDir = Math.random() < 0.5 ? -1 : 1; f.curlLeft = rnd(1.4, 3.2);
    }
    f.speed = 0.3 * f.len; f.alpha = 0; f.bend = 0; f.tgt = null;
    f.beat = true; f.beatT = rnd(0.8, 2); f.amp = 0.08;
    f.y0 = f.y; f.lambda = rnd(260, 420) * s; f.mAmp = rnd(0.35, 0.7); f.mPh = rnd(0, Math.PI * 2);
    f.wob = 0; f.flee = 0;
  }

  return {
    gap,
    get texture() { return rt ? rt.texture : null; },
    get count() { return fish.length; },
    get list() { return fish; },               // 測試用
    resize(w, h, pr) {
      W = w; H = h;
      const pw = Math.max(1, Math.round(w * pr)), ph = Math.max(1, Math.round(h * pr));
      if (!rt) rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      else rt.setSize(pw, ph);
      common.uHalf.value.set(w / 2, h / 2);
      gap.scale.set(w, h, 1);
      gapU.uTex.value = rt.texture;
    },
    // env: { n, size, speed, s, finger, pressing, gapAlpha, dockY, dockHalfW, docks, targets, glass }。回傳是否有魚（要重畫）
    // docks / targets：玻璃的狀態（.live = 目前形狀）；glass：目前所有玻璃的形狀（判斷魚在不在玻璃裡）
    update(dt, env) {
      const { s } = env;
      gapU.uAlpha.value = env.gapAlpha;
      const first = fish.length === 0;
      while (fish.length < Math.min(env.n, MAX)) {
        const f = { len: env.size * s * rnd(0.85, 1.2), kind: fish.length % rows, phase: rnd(0, 6.28) };
        spawn(f, env, first && fish.length % 3 !== 2);   // 一開始三分之二散在畫面上，其餘從 Dock 出現
        fish.push(f);
      }
      if (fish.length > env.n) fish.length = Math.max(0, env.n);
      const n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
      for (const f of fish) {
        for (let i = 0; i < n; i++) {
          const cruise = 0.55 * f.len * env.speed;          // 巡游：每秒約半個身長
          let steer;
          if (f.mode === 'curl') {                            // 剛出現：繞一小圈，轉到大致朝上就開始往上游
            steer = f.curlDir * 0.9;
            f.curlLeft -= Math.abs(steer) * h;
            if (f.curlLeft <= 0 && Math.abs(wrap(f.ang - Math.PI / 2)) < 0.6) f.mode = 'swim';
          } else {
            // 一排一排往上：朝上一排的某個圖示游；到了就挑再上一排的。路線再加一點蛇行，不會是直線
            const meander = f.mAmp * Math.sin(((f.y - f.y0) / f.lambda) * Math.PI * 2 + f.mPh);
            f.wob += (Math.random() - 0.5) * h * 0.8; f.wob *= 1 - h * 0.4;
            if (!showing(f.tgt)) f.tgt = nextTarget(f, env);
            if (f.tgt) {
              const a = f.tgt.live, tx = a.x + f.ox, ty = a.y + f.oy;
              if (Math.hypot(tx - f.x, ty - f.y) < Math.min(a.hx, a.hy) * 0.45 || ty < f.y - 10 * s) f.tgt = nextTarget(f, env);
              steer = wrap(Math.atan2(ty - f.y, tx - f.x) + meander * 0.35 + f.wob - f.ang) * 1.5;
            } else {
              // 最上面一排之後：直接往上游出去
              const edge = W / 2 - 40 * s, side = Math.abs(f.x) > edge ? Math.sign(f.x) * Math.min(1, (Math.abs(f.x) - edge) / (30 * s)) * 0.9 : 0;   // 往上（90°）時角度變小 = 往右：左邊緣要減、右邊緣要加
              steer = wrap(Math.PI / 2 + meander + side + f.wob - f.ang) * 1.2;
            }
          }
          // 別撞到其他魚：往旁邊讓
          const dx = Math.cos(f.ang), dy = Math.sin(f.ang);
          for (const o of fish) {
            if (o === f) continue;
            const ox = o.x - f.x, oy = o.y - f.y, dd = Math.hypot(ox, oy);
            if (dd < f.len * 0.85 && dd > 0.01) steer += (dx * oy - dy * ox > 0 ? -1 : 1) * 1.2 * (1 - dd / (f.len * 0.85));
          }
          // 手指按住：附近的魚急轉、加速逃開（一次大彎的 C 形起動）
          if (env.pressing) {
            const fx = f.x - env.finger.x, fy = f.y - env.finger.y, fd = Math.hypot(fx, fy);
            if (fd < 60 * s) { f.flee = 0.6; steer += (dx * fy - dy * fx > 0 ? 1 : -1) * 4 * (1 - fd / (60 * s)); }
          }
          f.flee = Math.max(0, f.flee - h);
          const omega = Math.max(-(f.flee ? 5 : 1.5), Math.min(f.flee ? 5 : 1.5, steer));
          let inGlass = false;
          for (const a of env.glass) if (rbox(a, f.x, f.y) < 0) { inGlass = true; break; }
          const pace = inGlass ? 0.85 : 2.2;                 // 穿過縫隙（看不到的地方）時快快游過
          f.ang += omega * h;
          // 擺尾─滑行：擺尾時加速、擺幅大；滑行時尾巴幾乎不動，速度慢慢掉
          if (f.flee) { f.beat = true; f.beatT = Math.max(f.beatT, 0.5); }
          if (f.beat) {
            f.beatT -= h;
            f.speed += ((f.flee ? 3 : 1.25 * pace) * cruise - f.speed) * Math.min(1, h * (f.flee ? 5 : 1.2 * pace));
            f.amp += (0.09 - f.amp) * Math.min(1, h * 4);
            if (f.beatT <= 0) { f.beat = false; f.glideT = rnd(0.8, 2.2); }
          } else {
            f.glideT -= h;
            f.speed *= Math.exp(-h / 2.5);
            f.amp += (0.02 - f.amp) * Math.min(1, h * 1.5);
            if (f.glideT <= 0 || f.speed < cruise * 0.55 * pace) { f.beat = true; f.beatT = rnd(1, 2.5); }
          }
          // 擺尾頻率跟著速度（每擺一次前進約 0.65 個身長）；滑行時只剩很慢的餘擺
          const freq = f.beat ? Math.max(0.6, f.speed / (0.65 * f.len)) : 0.25;
          f.phase += h * Math.PI * 2 * freq;
          // 身體彎曲 = 曲率 × 身長 = 角速度 ÷ 速度 × 身長
          const bendT = Math.max(-1.4, Math.min(1.4, (omega * f.len) / Math.max(f.speed, 0.3 * f.len)));
          f.bend += (bendT - f.bend) * Math.min(1, h * 6);
          f.x += Math.cos(f.ang) * f.speed * h; f.y += Math.sin(f.ang) * f.speed * h;
        }
        f.alpha = Math.min(1, f.alpha + dt * 0.8);           // 從水底慢慢浮現
        if (f.y > H / 2 + f.len * 0.7 || Math.abs(f.x) > W / 2 + f.len) spawn(f, env, false);   // 游出畫面：從 Dock 再出現
      }
      gap.visible = env.gapAlpha > 0.001 && fish.length > 0;
      return fish.length > 0;
    },
    // 魚層：清成透明 → 影子 → 魚
    render() {
      if (!rt) return;
      let k = 0;
      for (const f of fish) {
        if (f.alpha < 0.01 || k >= MAX) continue;
        iA.array.set([f.x, f.y, f.ang, f.len], k * 4);
        iB.array.set([f.phase, rows - 1 - f.kind, f.alpha, f.amp], k * 4);
        iC.array[k] = f.bend;
        k++;
      }
      iA.needsUpdate = true; iB.needsUpdate = true; iC.needsUpdate = true;
      geo.instanceCount = k;
      if (!k && !drawn) return;                       // 上一張已經是空的，就不用再清
      drawn = k;
      shadowMesh.material.uniforms.uOff.value.set(1.5, -2.5);
      const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      if (k) renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(clear, alpha);
    },
  };
}
