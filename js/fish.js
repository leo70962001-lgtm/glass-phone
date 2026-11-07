// 鯉魚：主畫面底下是一池水，只有透過玻璃看得到。
// 群體（文獻＋鯉魚池影片分析，見 docs/koi-behavior.md）：2–4 隻的小群居多，最大的帶頭，其他的排在後面約一個身長、
// 方向和速度跟牠一致；每到一個圖示就聚在裡面慢慢打轉幾秒（方向亂、間距約一個身長），再一起移到上一排；
// 偶爾有一隻脫隊。整群從螢幕下緣外面游上來、先在 Dock 的圖示打轉；游出上緣後再從下面游上來。
// 動作一律連續：不會憑空出現、不會瞬間移動，穿過玻璃之間的縫隙也不加速（只是在玻璃外面看不到）。
// 手指剛碰到玻璃：底下的魚嚇一跳急轉；點一下圖示：附近的小群游進那個圖示打轉一陣（觀賞鯉以為要餵食）。
// 游法照鯉魚（鯵型游法）：身體的波從頭傳到尾、越往尾巴擺越大；要快就加快擺尾頻率；擺一陣就滑一陣；
// 轉彎時整個身體彎成弧形。魚可以比圖示大：就像大鯉魚從一扇扇玻璃窗底下游過。
// 畫法：每隻魚是一片會擺尾的四邊形，畫進一張透明的「魚層」（螢幕大小、含 mipmap），玻璃著色器折射時一起取樣。
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
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rbox = (a, x, y) => {
    const qx = Math.abs(x - a.x) - a.hx + a.r, qy = Math.abs(y - a.y) - a.hy + a.r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - a.r;
  };
  const showing = (st) => !!(st && st.live && (!st.mesh || st.mesh.visible) && !st.removed && !st.ds && !st.hidden);
  // 下一個要游去的圖示：上一排（最低的那一排）裡，左右離得近的比較會被選到
  // (x, y) = 帶頭那隻的位置；out 會記下要游向圖示裡的哪一點（ox, oy）
  function nextTarget(x, y, env, out) {
    const s = env.s, up = env.targets.filter((st) => showing(st) && st.live.y > y + 25 * s);
    if (!up.length) return null;
    const low = Math.min(...up.map((st) => st.live.y)), row = up.filter((st) => st.live.y < low + 45 * s);
    const w = row.map((st) => Math.exp(-Math.abs(st.live.x - x) / (85 * s)) * (0.4 + Math.random()));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = row[0];
    for (let i = 0; i < row.length; i++) { r -= w[i]; if (r <= 0) { pick = row[i]; break; } }
    out.ox = rnd(-0.2, 0.2) * pick.live.hx; out.oy = rnd(-0.2, 0.2) * pick.live.hy;
    return pick;
  }

  // 小群：2–4 隻居多，偶爾單獨一隻（野生鯉魚覓食時是頻繁重組的小群）。最大的那隻帶頭
  const groups = [];
  let callSt = null, callT = 0;
  const pickSize = () => { const r = Math.random(); return r < 0.15 ? 1 : r < 0.5 ? 2 : r < 0.85 ? 3 : 4; };
  function newFish(env) {
    const k = rnd(0.85, 1.2);
    return { k, len: env.size * env.s * k, kind: fish.length % rows, phase: rnd(0, 6.28), alpha: 1, side: fish.length % 2 ? 1 : -1, x: 0, y: 0, ang: 0, speed: 0, bend: 0, amp: 0.08, beat: true, beatT: 1, glideT: 0, flee: 0, wob: 0, out: false };
  }
  // 出生：整群從螢幕下緣外面游上來，先進 Dock 的某個圖示打轉，再往上（不會憑空出現）。
  // first = 剛打開時：散在整個畫面上，一開始就在游
  function spawnGroup(g, env, first) {
    const s = env.s;
    g.members.sort((a, b) => b.len - a.len);
    const L = g.members[0];
    const homes = env.docks.filter(showing);
    const home = homes.length ? homes[Math.floor(Math.random() * homes.length)] : null;
    let cx, cy;
    if (first) { cx = rnd(-W / 2 + 40 * s, W / 2 - 40 * s); cy = rnd(-H / 2 + 120 * s, H / 2 - 60 * s); }
    else { cx = home ? home.live.x + rnd(-20, 20) * s : rnd(-W / 3, W / 3); cy = -H / 2 - L.len * 0.9; }
    const a0 = Math.PI / 2 + rnd(-0.4, 0.4);
    g.members.forEach((f, i) => {
      // 跟隨的排在帶頭那隻後面（下面），一起游上來
      f.x = cx + (i ? f.side * 0.45 * L.len : 0) + rnd(-0.1, 0.1) * L.len; f.y = cy - 1.05 * L.len * Math.ceil(i / 2);
      f.ang = a0 + rnd(-0.3, 0.3); f.speed = 0.4 * f.len; f.alpha = 1; f.out = false; f.flee = 0;
      f.beat = true; f.beatT = rnd(0.6, 2); f.side = i % 2 ? 1 : -1;
    });
    g.mode = 'travel'; g.tgt = first ? null : home; g.ox = 0; g.oy = 0; g.called = null;
    g.stay = 0; g.y0 = cy; g.lambda = rnd(260, 420) * s; g.mAmp = rnd(0.3, 0.6); g.mPh = rnd(0, 6.28);
  }
  function makeGroup(env, size, first) {
    const g = { members: [] };
    for (let i = 0; i < size; i++) { const f = newFish(env); f.g = g; fish.push(f); g.members.push(f); }
    groups.push(g);
    spawnGroup(g, env, first);
  }

  return {
    gap,
    get texture() { return rt ? rt.texture : null; },
    get count() { return fish.length; },
    get list() { return fish; },               // 測試用
    get groups() { return groups; },           // 測試用
    // 點了一個圖示：附近的小群游過來
    call(st) { callSt = st; callT = 1.5; for (const g of groups) if (g.called === st) g.called = null; },
    resize(w, h, pr) {
      W = w; H = h;
      const pw = Math.max(1, Math.round(w * pr)), ph = Math.max(1, Math.round(h * pr));
      if (!rt) rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      else rt.setSize(pw, ph);
      common.uHalf.value.set(w / 2, h / 2);
      gap.scale.set(w, h, 1);
      gapU.uTex.value = rt.texture;
    },
    // env: { n, size, speed, s, finger, pressing, pressMs, gapAlpha, dockY, dockHalfW, docks, targets, glass }。回傳是否有魚（要重畫）
    // docks / targets：玻璃的狀態（.live = 目前形狀）；glass：目前所有玻璃的形狀（判斷魚在不在玻璃裡）
    update(dt, env) {
      const { s } = env;
      gapU.uAlpha.value = env.gapAlpha;
      const first = fish.length === 0;
      while (fish.length < Math.min(env.n, MAX)) makeGroup(env, Math.min(pickSize(), Math.min(env.n, MAX) - fish.length), first);
      while (fish.length > env.n) {                    // 減少數量：從最後一群拿掉
        const g = groups[groups.length - 1], f = g.members.pop();
        fish.splice(fish.indexOf(f), 1);
        if (!g.members.length) groups.pop();
      }
      // 手指剛碰到玻璃：底下的魚嚇一跳
      const startle = env.pressing && env.pressMs < 160;
      callT = Math.max(0, callT - dt);
      const n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const A = groups[i], B = groups[j], a = A.members[0], b = B.members[0];
          if (!a || !b || A.members.length + B.members.length > 4 || A.mode === 'curl' || B.mode === 'curl') continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) < 3 * Math.max(a.len, b.len) && Math.abs(a.y) < H / 2 && Math.abs(b.y) < H / 2) {
            const keep = a.len >= b.len ? A : B, gone = keep === A ? B : A;
            for (const f of gone.members) { f.g = keep; keep.members.push(f); }
            keep.members.sort((x, y) => y.len - x.len);       // 最大的帶頭
            keep.members.forEach((f, k) => { f.side = k % 2 ? 1 : -1; });
            groups.splice(groups.indexOf(gone), 1);
            j--;
          }
        }
      }
      if (callSt && callT > 0) {
        for (const g of groups) {
          const lead = g.members[0];
          if (!lead || g.mode === 'curl' || g.called === callSt || !showing(callSt)) continue;
          if (Math.hypot(callSt.live.x - lead.x, callSt.live.y - lead.y) < 320 * s) {
            g.tgt = callSt; g.ox = rnd(-0.15, 0.15) * callSt.live.hx; g.oy = rnd(-0.15, 0.15) * callSt.live.hy;
            g.mode = 'travel'; g.called = callSt;
          }
        }
      }
      for (const g of groups) {
        const lead = g.members[0];
        // 落單的：附近有空位的群，就往牠們的帶頭那隻游過去（吸引區）
        if (g.members.length === 1 && g.mode !== 'curl') {
          let best = null, bd = 160 * s;
          for (const o of groups) {
            if (o === g || o.members.length >= 4 || o.mode === 'curl') continue;
            const d = Math.hypot(o.members[0].x - lead.x, o.members[0].y - lead.y);
            if (d < bd) { bd = d; best = o; }
          }
          g.join = best;
        } else g.join = null;
        for (let i = 0; i < n; i++) {
          const cruise = 0.5 * lead.len * env.speed;
          // ---- 帶頭的：決定整群要去哪裡 ----
          if (g.mode === 'curl') {
            g.curlLeft -= 0.9 * h;
            if (g.curlLeft <= 0 && Math.abs(wrap(lead.ang - Math.PI / 2)) < 0.6) g.mode = 'travel';
          } else if (g.mode === 'travel') {
            if (!showing(g.tgt) || (g.tgt.live.y < lead.y - 10 * s && g.called !== g.tgt && !env.docks.includes(g.tgt))) g.tgt = nextTarget(lead.x, lead.y, env, g);
            if (g.tgt) {
              const a = g.tgt.live;
              if (Math.hypot(a.x + g.ox - lead.x, a.y + g.oy - lead.y) < Math.min(a.hx, a.hy) * 0.5) {
                g.mode = 'mill'; g.stay = g.called === g.tgt ? rnd(4, 6) : rnd(1.5, 4.5);
                g.alt = env.targets.filter((st) => st !== g.tgt && showing(st) && Math.hypot(st.live.x - a.x, st.live.y - a.y) < 110 * s)
                  .sort((p, q) => Math.hypot(p.live.x - a.x, p.live.y - a.y) - Math.hypot(q.live.x - a.x, q.live.y - a.y));
              }
            }
          } else if (g.mode === 'mill') {
            g.stay -= h;
            if (!showing(g.tgt)) g.mode = 'travel';
            else if (g.stay <= 0) {
              g.mode = 'travel'; g.called = null; g.tgt = nextTarget(lead.x, lead.y, env, g);
              // 重組：偶爾最後一隻自己走（變成單獨一群）
              if (g.members.length > 1 && Math.random() < 0.12) {
                const f = g.members.pop(), ng = { members: [f], mode: 'travel', ox: 0, oy: 0, stay: 0, y0: f.y, lambda: g.lambda, mAmp: g.mAmp, mPh: rnd(0, 6.28) };
                ng.tgt = nextTarget(f.x, f.y, env, ng);
                f.g = ng; groups.push(ng);
              }
            }
          }
          for (let k = 0; k < g.members.length; k++) {
            const f = g.members[k], isLead = k === 0;
            const dx = Math.cos(f.ang), dy = Math.sin(f.ang);
            let steer = 0, pace = 1, want = cruise;
            f.wob += (Math.random() - 0.5) * h * 0.8; f.wob *= 1 - h * 0.4;
            const fdx = f.x - env.finger.x, fdy = f.y - env.finger.y, fd = Math.hypot(fdx, fdy);
            const host = g.mode === 'mill' && g.tgt ? (k >= 2 && g.alt && g.alt.length && showing(g.alt[(k - 2) % g.alt.length]) ? g.alt[(k - 2) % g.alt.length] : g.tgt) : null;
            if (host) {
              // 打轉：繞著圖示中心慢慢轉一個小圈，每隻自己的方向；離得遠就先游過去
              const a = host.live, rx = f.x - a.x, ry = f.y - a.y, dist = Math.hypot(rx, ry);
              if (!f.millDir || Math.random() < h * 0.08) f.millDir = Math.random() < 0.5 ? -1 : 1;
              const R = Math.max(6 * s, Math.min(a.hx, a.hy) * 0.45);
              const tangent = Math.atan2(ry, rx) + f.millDir * Math.PI / 2;
              const pull = Math.max(-1, Math.min(1, (dist - R) / (R + 1))) * f.millDir * 0.9;   // 圈外往內收、圈內往外放
              steer = wrap(tangent + pull + f.wob * 0.5 - f.ang) * 1.2;
              want = (dist > R * 2.5 ? 0.8 : 0.3) * f.len * env.speed;
            } else if (isLead && g.join) {
              const o = g.join.members[0];
              steer = wrap(Math.atan2(o.y - f.y, o.x - f.x) - f.ang) * 1.6;
              want = 0.8 * f.len * env.speed;
            } else if (isLead) {
              if (g.mode === 'curl') steer = g.curlDir * 0.9;
              else {
                const meander = g.mAmp * Math.sin(((f.y - g.y0) / g.lambda) * Math.PI * 2 + g.mPh);
                if (g.tgt) {
                  const a = g.tgt.live;
                  steer = wrap(Math.atan2(a.y + g.oy - f.y, a.x + g.ox - f.x) + meander * (g.called === g.tgt ? 0.1 : 0.35) + f.wob - f.ang) * 1.5;
                  if (g.called === g.tgt) want *= 1.4;                 // 被叫的時候游得比較急
                } else {
                  const edge = W / 2 - 40 * s, side = Math.abs(f.x) > edge ? Math.sign(f.x) * Math.min(1, (Math.abs(f.x) - edge) / (30 * s)) * 0.9 : 0;
                  steer = wrap(Math.PI / 2 + meander + side + f.wob - f.ang) * 1.2;
                }
              }
            } else {
              // 跟著帶頭的：排在牠後面一點、左右錯開，方向和速度跟牠一致
              const back = 1.05 * lead.len * Math.ceil(k / 2), sideOff = 0.45 * lead.len * f.side;
              const lx = Math.cos(lead.ang), ly = Math.sin(lead.ang);
              const tx = lead.x - lx * back - ly * sideOff, ty = lead.y - ly * back + lx * sideOff;
              const dd = Math.hypot(tx - f.x, ty - f.y);
              const toSlot = Math.atan2(ty - f.y, tx - f.x);
              const aim = dd < 0.7 * lead.len ? lead.ang : toSlot;     // 到了位置就跟牠同方向
              steer = wrap(aim - f.ang) * 1.6 + f.wob * 0.3;
              want = lead.speed * Math.max(0.6, Math.min(1.4, dd / (0.9 * lead.len)));
            }
            // 太靠近任何一隻就讓開（排斥區約 0.8 個身長，和影片量到的間距相符）
            for (const o of fish) {
              if (o === f) continue;
              const ox = o.x - f.x, oy = o.y - f.y, dd = Math.hypot(ox, oy), zr = 0.8 * f.len;
              if (dd < zr && dd > 0.01) { steer += (dx * oy - dy * ox > 0 ? -1 : 1) * 1.4 * (1 - dd / zr); if (ox * dx + oy * dy > 0) want *= 0.85; }
            }
            if (startle && fd < 55 * s) { f.flee = 0.5; steer += (dx * fdy - dy * fdx > 0 ? 1 : -1) * 4; }
            f.flee = Math.max(0, f.flee - h);
            // 螢幕邊緣（還沒要游出去的時候）
            if (W / 2 - Math.abs(f.x) < f.len * 0.6 && !f.flee) {
              steer += wrap(Math.atan2(-f.y, -f.x) - f.ang) * 3;
            }
            const omega = Math.max(-(f.flee ? 5 : 1.5), Math.min(f.flee ? 5 : 1.5, steer));
            f.ang += omega * h;
            pace = 1;   // 穿過縫隙（看不到的地方）時快快游過
            // 擺尾─滑行
            if (f.flee) { f.beat = true; f.beatT = Math.max(f.beatT, 0.4); }
            const goal = f.flee ? 3 * cruise : want * pace;
            if (f.beat) {
              f.beatT -= h;
              f.speed += (goal * 1.2 - f.speed) * Math.min(1, h * (f.flee ? 5 : 1.4));
              f.amp += (0.09 - f.amp) * Math.min(1, h * 4);
              if (f.beatT <= 0) { f.beat = false; f.glideT = rnd(0.6, 1.8); }
            } else {
              f.glideT -= h;
              f.speed *= Math.exp(-h / 2.2);
              f.amp += (0.02 - f.amp) * Math.min(1, h * 1.5);
              if (f.glideT <= 0 || f.speed < goal * 0.6) { f.beat = true; f.beatT = rnd(0.8, 2.2); }
            }
            const freq = f.beat ? Math.max(0.6, f.speed / (0.65 * f.len)) : 0.25;
            f.phase += h * Math.PI * 2 * freq;
            const bendT = Math.max(-1.4, Math.min(1.4, (omega * f.len) / Math.max(f.speed, 0.3 * f.len)));
            f.bend += (bendT - f.bend) * Math.min(1, h * 6);
            f.x += Math.cos(f.ang) * f.speed * h; f.y += Math.sin(f.ang) * f.speed * h;
            // 在圖示裡打轉時，整隻魚不出這塊玻璃
            f.x = Math.max(-W / 2 - f.len, Math.min(W / 2 + f.len, f.x)); f.y = Math.max(-H / 2 - 4 * f.len, f.y);
          }
        }
        for (const f of g.members) {
          f.len += (env.size * s * f.k - f.len) * Math.min(1, dt * 2);   // 面板調大小時慢慢長大／縮小
          f.alpha = 1;
          f.out = f.y > H / 2 + f.len * 0.7;
        }
        // 整群都游出上緣：一起從 Dock 再出現（小群在這時也重新分配）
        if (g.members.every((f) => f.out)) spawnGroup(g, env, false);
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
