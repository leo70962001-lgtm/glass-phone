import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { APPS, LABEL_DY, computeLayout } from './layout.js';
import { drawAtlas, drawOverlay, ATLAS_COLS, ATLAS_ROWS, FONT } from './glyphs.js';
import { createScreenLayer } from './screen.js';
import { createGlass } from './glass.js';
import { createDust, DS_END } from './dust.js';

const MOBILE = matchMedia('(pointer: coarse)').matches;

// ---------- 參數（面板）；長度都是 375 寬的設計 pt，實際乘上 s ----------
const DEFAULTS = {
  thickness: 18, bevel: 12, radius: 17, dome: 1.5,
  ior: 1.5, dispersion: 0.35, frost: 0.03, absorb: 0.6, inner: 0.9, haze: 0.12,
  glyphDepth: 0.55, glyphOpacity: 0.85, glyphScale: 0.8, glyphFrost: 0.2,
  depth3d: 1.0,
  lightAz: 45, lightEl: 50, lightWorld: true,
  shadow: 0.58, shadowLen: 1.0, shadowSoft: 1.0, contact: 0.3,
  caustic: 1.0, rainbow: 0.6, star: 0.5,
  refl: 1.0, rim: 1.0, spec: 1.0, env: 1.0,
  trayThickness: 4,
  parallax: true, tiltAmt: 18, viewDist: 4.5, sway: false,
  gyroGain: 1.4, gyroRecenter: 0.25, wallDepth: 0.3, glintGain: 2.2, lightGain: 1.15,
  wallpaper: 'flow', animateWall: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality: MOBILE ? 'low' : 'high', maxDpr: Math.min(devicePixelRatio, 2),
  dustDensity: 2.6, dustSweep: 0.9, dustLife: 1.3, dustWind: 55, dustTint: '#d6b4ff', dustTintAmt: 0.55,
};
const P = { ...DEFAULTS };
const PRESETS = {
  '參考圖': {},
  '厚果凍': { thickness: 24, bevel: 11, radius: 18, dome: 4, ior: 1.45, dispersion: 0.6, absorb: 1.0, glyphDepth: 0.35, shadowLen: 1.2, caustic: 1.5, star: 0.8, depth3d: 1.25 },
  '薄玻璃': { thickness: 4, bevel: 2, radius: 14, dome: 0, dispersion: 0.2, absorb: 0.3, glyphDepth: 0, shadow: 0.3, caustic: 0.6, star: 0.3 },
  '霧面玻璃': { thickness: 10, bevel: 5, frost: 0.55, dispersion: 0.15, glyphDepth: 0.5, caustic: 0.5, star: 0.2, rim: 1.3 },
  '水晶塊': { thickness: 30, bevel: 4, radius: 12, dome: 0, ior: 1.75, dispersion: 0.9, absorb: 0.4, glyphDepth: 0.1, inner: 1.0, caustic: 1.8, star: 1.0, depth3d: 1.4 },
};

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
let pixelRatio = P.maxDpr;

// ---------- 螢幕層 + 玻璃 ----------
const screen = createScreenLayer(renderer);
const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }));
scene.add(screenPlane);

const atlas = new THREE.CanvasTexture(drawAtlas());
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.anisotropy = 8;

const U = (value) => ({ value });
const shared = {
  uIor: U(1.5), uDisp: U(0.3), uFrost: U(0), uAbsorb: U(0.6), uInner: U(0.9),
  uRefl: U(1), uRim: U(1), uSpec: U(1), uEnvI: U(1), uEnvRot: U(new THREE.Matrix3()),
  uLightW: U(new THREE.Vector3()), uLightL: U(new THREE.Vector3()),
  uScreenTex: U(screen.texture), uScreenSize: U(new THREE.Vector2(375, 812)),
  uGlyphTex: U(atlas), uGlyphOpacity: U(1), uGlyphScale: U(0.8), uGlyphFrost: U(0.2), uHaze: U(0.12),
  uLodScreen: U(0), uLodGlyph: U(0), uPixAngle: U(0.001), uMargin: U(1.5),
  uRadius: U(17), uBevel: U(12), uDome: U(1.5),
};

// 每顆圖示的狀態：按壓、刪除／消散、目前位置與補位目標、抖動相位（重建玻璃材質時沿用）
const REMOVED_KEY = 'glassHome.removed';
let savedRemoved = [];
try { savedRemoved = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'); } catch { /* 無痕模式等 */ }
const ST = APPS.map((a) => {
  const gone = savedRemoved.includes(a.id);
  return { app: a, press: 0, target: 0, removed: gone, hidden: gone, ds: null, cur: new THREE.Vector2(), goal: new THREE.Vector2(), phase: Math.random() * 6.28 };
});
const dust = createDust(scene);
let tray, icons = [];
function buildGlass() {
  for (const m of [tray, ...icons]) if (m) { scene.remove(m); m.material.dispose(); }
  tray = createGlass(shared, {
    uHalf: U(new THREE.Vector2()), uRadius: U(28), uHeight: U(4), uBevel: U(2.5), uDome: U(0),
    uCenter: U(new THREE.Vector2()), uHasGlyph: U(0), uGlyphZ: U(-1),
  }, P.quality);
  tray.renderOrder = 1;
  scene.add(tray);
  icons = APPS.map((a) => {
    const m = createGlass(shared, {
      uHalf: U(new THREE.Vector2(30, 30)), uHeight: U(18), uGlyphZ: U(1), uCenter: U(new THREE.Vector2()), uBaseZ: U(0),
      uTint: U(new THREE.Vector3(...a.tint)),
      uGlyphCell: U(new THREE.Vector4((a.cell % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(a.cell / ATLAS_COLS) + 1) / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS)),
    }, P.quality);
    m.renderOrder = 2;
    m.userData = ST[a.cell];
    m.visible = !ST[a.cell].hidden;
    scene.add(m);
    return m;
  });
}
buildGlass();

// ---------- 版面 ----------
let L = computeLayout(375, 812, 47, 34);
const safeProbe = document.getElementById('safe');
function applyLayout() {
  const W = L.W, H = L.H;
  screenPlane.scale.set(W, H, 1);
  shared.uScreenSize.value.set(W, H);
  tray.position.set(L.dock.x, L.dock.y, 0);
  tray.material.uniforms.uHalf.value.set(L.dock.hx, L.dock.hy);
  tray.material.uniforms.uRadius.value = L.dock.r;
  tray.material.uniforms.uCenter.value.set(L.dock.x, L.dock.y);
  for (const m of icons) m.material.uniforms.uHalf.value.set(L.icon / 2, L.icon / 2);
  screen.resize(W, H, pixelRatio);
  slots(true);
  sync();
}
// 補位：沒被刪的圖示依序排進格位；Dock 置中排
function slots(snap) {
  const grid = ST.filter((d) => !d.app.dock && !d.removed), dockd = ST.filter((d) => d.app.dock && !d.removed);
  grid.forEach((d, i) => d.goal.copy(L.grid(i)));
  dockd.forEach((d, i) => d.goal.copy(L.dockSlot(i, dockd.length)));
  for (const d of ST) if (snap || (d.removed && !d.ds)) d.cur.copy(d.goal);
  placeIcons();
}
function placeIcons() {
  for (const m of icons) {
    const d = m.userData;
    m.position.x = d.cur.x; m.position.y = d.cur.y;
    m.material.uniforms.uCenter.value.copy(d.cur);
  }
  redrawOverlay();
}
// 名稱：顯示中（含消散中）的圖示都畫，消散的那顆由螢幕層用同一道掃描擦掉
const measure = document.createElement('canvas').getContext('2d');
function redrawOverlay() {
  const labels = ST.filter((d) => !d.hidden).map((d) => ({ label: d.app.label, x: d.cur.x, y: d.cur.y }));
  screen.setOverlay(drawOverlay(L, labels, pixelRatio));
  screenDirty = true;
}
function saveRemoved() {
  try { localStorage.setItem(REMOVED_KEY, JSON.stringify(ST.filter((d) => d.removed).map((d) => d.app.id))); } catch { /* 存不了就算了 */ }
}

// ---------- 參數 → uniform ----------
let screenDirty = true, needsRender = true;
function heights() {
  const s = L.s, trayH = P.trayThickness * s;
  for (const m of icons) {
    const u = m.material.uniforms, d = m.userData;
    m.visible = !d.hidden;
    const h = P.thickness * s * (1 - 0.35 * d.press);
    u.uHeight.value = h;
    u.uGlyphZ.value = 0.01 + P.glyphDepth * h * 0.98;
    u.uBaseZ.value = d.app.dock ? trayH : 0;
    u.uGlow.value = d.press;
    m.position.z = d.app.dock ? trayH : 0;
  }
  // 陰影用的物件：托盤 + 圖示（uObjC = 消散進度、圖示邊長、陰影可見度）
  const su = screen.uniforms;
  su.uObjA.value[0].set(L.dock.x, L.dock.y, L.dock.hx, L.dock.hy);
  su.uObjB.value[0].set(L.dock.r, trayH, 0, 0);
  su.uObjC.value[0].set(-1, L.icon, 1, 0);
  icons.forEach((m, i) => {
    const d = m.userData, prog = d.ds ? d.ds.prog : -1;
    su.uObjA.value[i + 1].set(d.cur.x, d.cur.y, L.icon / 2, L.icon / 2);
    su.uObjB.value[i + 1].set(P.radius * s, m.material.uniforms.uHeight.value + P.dome * s, d.app.dock ? trayH : 0, 0);
    su.uObjC.value[i + 1].set(prog, L.icon, d.hidden ? 0 : d.ds ? 1 - THREE.MathUtils.clamp(prog / DS_END, 0, 1) : 1, 0);
    m.material.uniforms.uDsProg.value = prog;
  });
  su.uCount.value = icons.length + 1;
  screenDirty = true;
}
function sync() {
  const k = P.depth3d, s = L.s;
  shared.uBevel.value = Math.min(P.bevel, P.thickness, 29) * s;
  shared.uRadius.value = P.radius * s;
  shared.uDome.value = P.dome * s;
  tray.material.uniforms.uHeight.value = P.trayThickness * s;
  tray.material.uniforms.uBevel.value = Math.min(2.5, P.trayThickness * 0.6) * s;
  shared.uIor.value = P.ior; shared.uDisp.value = P.dispersion; shared.uFrost.value = P.frost;
  shared.uAbsorb.value = P.absorb / s; shared.uInner.value = P.inner; shared.uGlyphOpacity.value = P.glyphOpacity;
  shared.uGlyphScale.value = P.glyphScale; shared.uGlyphFrost.value = P.glyphFrost; shared.uHaze.value = P.haze / s;
  shared.uRefl.value = P.refl; shared.uRim.value = P.rim * k; shared.uSpec.value = P.spec * k; shared.uEnvI.value = P.env;

  const su = screen.uniforms;
  su.uIor.value = P.ior; su.uBevel.value = shared.uBevel.value;
  su.uShadow.value = Math.min(P.shadow * k, 0.95); su.uShadowLen.value = P.shadowLen * Math.sqrt(k);
  su.uShadowSoft.value = P.shadowSoft * s; su.uContact.value = Math.min(P.contact * k, 0.9);
  su.uCaustic.value = P.caustic * k; su.uRainbow.value = Math.min(P.dispersion * 1.6, 1) * P.rainbow; su.uStar.value = P.star * k;
  su.uCausticW.value = (1.5 + Math.min(P.bevel, P.thickness) * 0.35) * s;
  heights();
  needsRender = true;
}

// ---------- 桌布 ----------
const wallOptions = { '流光（程式）': 'flow' };
const texLoader = new THREE.TextureLoader();
let wallVideo = null;
// 影片桌布（ComfyUI 算的循環）：每個新影格才重算螢幕層
function loadVideo(url) {
  const v = document.createElement('video');
  Object.assign(v, { src: url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
  v.setAttribute('playsinline', '');
  v.addEventListener('loadeddata', () => {
    if (wallVideo !== v) return;
    screen.setWallpaper(new THREE.VideoTexture(v));
    screenDirty = true;
    if (P.animateWall) v.play().catch(() => {});
  }, { once: true });
  const onFrame = () => { if (wallVideo !== v) return; screenDirty = true; v.requestVideoFrameCallback(onFrame); };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);
  else v.addEventListener('timeupdate', () => { screenDirty = true; });
  v.load();
  return v;
}
function setWallpaper(key) {
  if (key === 'upload') { document.getElementById('file').click(); return; }
  if (wallVideo) { wallVideo.pause(); wallVideo.removeAttribute('src'); wallVideo.load(); wallVideo = null; }
  if (key === 'flow') { screen.setWallpaper(null); screenDirty = true; return; }
  if (/\.(webm|mp4)$/i.test(key)) { wallVideo = loadVideo(key); return; }
  texLoader.load(key, (t) => { screen.setWallpaper(t); screenDirty = true; });
}
function playWall() {
  if (wallVideo) { if (P.animateWall) wallVideo.play().catch(() => {}); else wallVideo.pause(); }
}
document.getElementById('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  if (wallVideo) { wallVideo.pause(); wallVideo = null; }
  if (f.type.startsWith('video/')) { wallVideo = loadVideo(url); return; }
  texLoader.load(url, (t) => { screen.setWallpaper(t); screenDirty = true; });
});

// ---------- 面板 ----------
const gui = new GUI({ title: '玻璃主畫面' });
const fPreset = gui.addFolder('預設');
for (const name of Object.keys(PRESETS)) fPreset.add({ [name]: () => applyPreset(name) }, name);

const fGlass = gui.addFolder('玻璃');
fGlass.add(P, 'thickness', 1, 40, 0.5).name('玻璃厚度 (pt)').onChange(sync);
fGlass.add(P, 'bevel', 0.5, 20, 0.5).name('倒角半徑').onChange(sync);
fGlass.add(P, 'radius', 4, 30, 0.5).name('圓角').onChange(sync);
fGlass.add(P, 'dome', 0, 10, 0.1).name('頂面弧度').onChange(sync);
fGlass.add(P, 'ior', 1.0, 2.4, 0.01).name('折射率 IOR').onChange(sync);
fGlass.add(P, 'dispersion', 0, 1, 0.01).name('色散').onChange(sync);
fGlass.add(P, 'frost', 0, 1, 0.01).name('霧面').onChange(sync);
fGlass.add(P, 'absorb', 0, 3, 0.01).name('玻璃顏色濃度').onChange(sync);
fGlass.add(P, 'inner', 0, 1, 0.01).name('內部反射').onChange(sync);
fGlass.add(P, 'haze', 0, 2, 0.01).name('乳白霧感').onChange(sync);
fGlass.add(P, 'glyphDepth', 0, 1, 0.01).name('圖案深度').onChange(sync);
fGlass.add(P, 'glyphOpacity', 0, 1, 0.01).name('圖案不透明度').onChange(sync);
fGlass.add(P, 'glyphScale', 0.5, 1.1, 0.01).name('圖案大小').onChange(sync);
fGlass.add(P, 'glyphFrost', 0, 1, 0.01).name('圖案柔化').onChange(sync);
fGlass.add(P, 'trayThickness', 1, 16, 0.5).name('Dock 托盤厚度').onChange(sync);

const f3d = gui.addFolder('立體強化');
f3d.add(P, 'depth3d', 0, 2, 0.01).name('立體強度（總）').onChange(sync);
f3d.add(P, 'lightAz', 0, 360, 1).name('光源方位°').onChange(sync);
f3d.add(P, 'lightEl', 10, 85, 1).name('光源仰角°').onChange(sync);
f3d.add(P, 'lightWorld').name('光源固定在世界').onChange(sync);
f3d.add(P, 'shadow', 0, 1, 0.01).name('陰影濃度').onChange(sync);
f3d.add(P, 'shadowLen', 0, 3, 0.01).name('陰影長度').onChange(sync);
f3d.add(P, 'shadowSoft', 0.2, 4, 0.01).name('陰影柔和').onChange(sync);
f3d.add(P, 'contact', 0, 1, 0.01).name('接觸陰影').onChange(sync);
f3d.add(P, 'caustic', 0, 3, 0.01).name('焦散亮線').onChange(sync);
f3d.add(P, 'rainbow', 0, 1, 0.01).name('焦散彩虹').onChange(sync);
f3d.add(P, 'star', 0, 2, 0.01).name('星芒').onChange(sync);
f3d.add(P, 'refl', 0, 2, 0.01).name('表面反射').onChange(sync);
f3d.add(P, 'rim', 0, 3, 0.01).name('邊緣高光').onChange(sync);
f3d.add(P, 'spec', 0, 3, 0.01).name('鏡面高光').onChange(sync);
f3d.add(P, 'env', 0, 3, 0.01).name('環境亮度').onChange(sync);

const fView = gui.addFolder('體感視差');
fView.add(P, 'parallax').name(MOBILE ? '陀螺儀／拖曳視差' : '滑鼠視差');
fView.add(P, 'tiltAmt', 0, 30, 0.5).name('視差角度°');
fView.add(P, 'viewDist', 1.2, 8, 0.1).name('觀看距離（越小越立體）').onChange(() => (needsRender = true));
fView.add(P, 'gyroGain', 0.3, 3, 0.05).name('陀螺儀靈敏度');
fView.add(P, 'gyroRecenter', 0, 2, 0.05).name('回正速度（0 = 不回正）');
fView.add(P, 'wallDepth', 0, 1, 0.01).name('桌布景深視差').onChange(() => (needsRender = true));
fView.add(P, 'glintGain', 0, 4, 0.05).name('反光跟著傾斜').onChange(() => (needsRender = true));
fView.add(P, 'lightGain', 0, 4, 0.05).name('陰影焦散跟著傾斜').onChange(() => (needsRender = true));
fView.add(P, 'sway').name('自動擺動');
fView.add({ 重新校正: () => (gyroBase = null) }, '重新校正');
const gyroCtl = fView.add({ s: '未偵測到' }, 's').name('陀螺儀狀態').disable();
if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) fView.add({ 啟用陀螺儀: () => askGyro() }, '啟用陀螺儀');

const fWall = gui.addFolder('桌布');
const wallCtl = fWall.add(P, 'wallpaper', { ...wallOptions, '上傳圖片／影片…': 'upload' }).name('桌布').onChange(setWallpaper);
fWall.add(P, 'animateWall').name('桌布動畫').onChange(playWall);

const fDust = gui.addFolder('刪除圖示（粉塵消散）');
fDust.add({ 編輯模式: () => (editMode ? exitEdit() : enterEdit()) }, '編輯模式');
fDust.add({ 還原所有圖示: () => restoreAll() }, '還原所有圖示');
fDust.add(P, 'dustDensity', 0.5, 5, 0.1).name('粉塵密度');
fDust.add(P, 'dustSweep', 0.3, 2.5, 0.05).name('消散時間 (秒)');
fDust.add(P, 'dustLife', 0.4, 3, 0.05).name('粉塵飄散時間 (秒)');
fDust.add(P, 'dustWind', 0, 150, 1).name('風力');
fDust.addColor(P, 'dustTint').name('粉塵色調');
fDust.add(P, 'dustTintAmt', 0, 1, 0.01).name('色調混合');

const fPerf = gui.addFolder('效能');
fPerf.add(P, 'quality', { 高: 'high', 低: 'low' }).name('玻璃畫質').onChange(() => { buildGlass(); applyLayout(); });
fPerf.add(P, 'maxDpr', 1, Math.max(1, Math.min(devicePixelRatio, 3)), 0.25).name('最高解析度倍率').onChange(() => { pixelRatio = P.maxDpr; resize(); });
const fpsCtl = fPerf.add({ fps: '—' }, 'fps').name('FPS／倍率').disable();
gui.add({ 全部重設: () => applyPreset(null) }, '全部重設');
if (MOBILE) gui.hide();
else if (innerWidth < 700) gui.close();
document.getElementById('gear').addEventListener('click', () => (gui._hidden ? gui.show() : gui.hide()));

function applyPreset(name) {
  const keep = { wallpaper: P.wallpaper, parallax: P.parallax, sway: P.sway, animateWall: P.animateWall, quality: P.quality, maxDpr: P.maxDpr, tiltAmt: P.tiltAmt, viewDist: P.viewDist,
    dustDensity: P.dustDensity, dustSweep: P.dustSweep, dustLife: P.dustLife, dustWind: P.dustWind, dustTint: P.dustTint, dustTintAmt: P.dustTintAmt,
    gyroGain: P.gyroGain, gyroRecenter: P.gyroRecenter, wallDepth: P.wallDepth, glintGain: P.glintGain, lightGain: P.lightGain };
  Object.assign(P, DEFAULTS, name ? PRESETS[name] : {}, keep);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  sync();
}

// 有 assets/wallpapers.json 就加進選單，第一個當預設（ComfyUI 動畫）
fetch('assets/wallpapers.json').then((r) => (r.ok ? r.json() : [])).then((list) => {
  if (!list.length) return;
  const opts = {};
  for (const w of list) opts[w.name] = w.file;
  wallCtl.options({ ...opts, ...wallOptions, '上傳圖片／影片…': 'upload' }).name('桌布').onChange(setWallpaper);
  P.wallpaper = list[0].file; wallCtl.updateDisplay();
  setWallpaper(P.wallpaper);
}).catch(() => {});

// ---------- 視差：陀螺儀／滑鼠／拖曳 → 眼睛相對螢幕的位置 ----------
const tiltTarget = new THREE.Vector2(), tilt = new THREE.Vector2();
let gyroBase = null, gyroOn = false, gyroT = 0, gyroShown = 0;
addEventListener('deviceorientation', (e) => {
  if (!MOBILE || e.beta == null) return;
  gyroOn = true;
  const now = performance.now(), dt = gyroT ? Math.min((now - gyroT) / 1000, 0.2) : 0;
  gyroT = now;
  const cur = { b: e.beta, g: e.gamma };
  if (!gyroBase) gyroBase = { ...cur };
  // 基準慢慢跟上目前握姿：只對「動作」有反應，拿著不動會在幾秒內回正（回正速度 = 每秒比例）
  const f = 1 - Math.exp(-dt * P.gyroRecenter);
  gyroBase.b += (cur.b - gyroBase.b) * f;
  gyroBase.g += (cur.g - gyroBase.g) * f;
  const lim = THREE.MathUtils.degToRad(P.tiltAmt);
  const k = THREE.MathUtils.degToRad(P.gyroGain);
  tiltTarget.set(THREE.MathUtils.clamp((cur.g - gyroBase.g) * k, -lim, lim), THREE.MathUtils.clamp((cur.b - gyroBase.b) * k, -lim, lim));
  if (now - gyroShown > 250) { gyroShown = now; gyroCtl.setValue(`運作中 β${cur.b.toFixed(0)}° γ${cur.g.toFixed(0)}°`); }
});
// iOS：要在觸碰事件裡請求「動作與方向」權限（第一次觸碰自動問；面板也有按鈕）
function askGyro() {
  if (typeof DeviceOrientationEvent === 'undefined' || !DeviceOrientationEvent.requestPermission) return;
  gyroCtl.setValue('等待授權…');
  DeviceOrientationEvent.requestPermission()
    .then((r) => gyroCtl.setValue(r === 'granted' ? '已授權，傾斜手機看看' : '被拒絕：到 Safari 設定 → 動作與方向存取'))
    .catch(() => gyroCtl.setValue('請點一下畫面再按'));
}
addEventListener('touchend', function ask() {
  removeEventListener('touchend', ask);
  askGyro();
  playWall();                                      // 也順便讓被省電模式擋下的影片開始播
});
setTimeout(() => { if (MOBILE && !gyroOn) gyroCtl.setValue(isSecureContext ? '還沒收到感測資料' : '需要 HTTPS 才能用'); }, 2500);

// 指標：桌機滑過 = 視差；按住圖示 = 下沉，長按 = 編輯模式；手機在空白處拖曳 = 視差（沒有陀螺儀時）
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let drag = null, holdTimer = 0;
function iconAt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const m of icons) {
    if (m.userData.removed) continue;
    plane.constant = -(m.position.z + m.material.uniforms.uHeight.value);
    if (!ray.ray.intersectPlane(plane, hitP)) continue;
    if (Math.abs(hitP.x - m.position.x) < L.icon / 2 && Math.abs(hitP.y - m.position.y) < L.icon / 2) return m;
  }
  return null;
}
canvas.addEventListener('pointerdown', (e) => {
  const m = iconAt(e);
  drag = { x: e.clientX, y: e.clientY, m, moved: false };
  if (!editMode) {
    if (m) m.userData.target = 1;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (drag && !drag.moved) { if (m) m.userData.target = 0; drag.held = true; enterEdit(); } }, 550);
  }
  playWall();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 10) { drag.moved = true; clearTimeout(holdTimer); if (drag.m) drag.m.userData.target = 0; }
    if (drag.moved && MOBILE && !gyroOn) {
      const lim = THREE.MathUtils.degToRad(P.tiltAmt);
      tiltTarget.set(THREE.MathUtils.clamp(dx / r.width * 2, -1, 1) * lim, THREE.MathUtils.clamp(-dy / r.height * 2, -1, 1) * lim);
    }
  } else if (!MOBILE) {
    const lim = THREE.MathUtils.degToRad(P.tiltAmt);
    tiltTarget.set(THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5) * lim,
      THREE.MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5) * lim);
  }
});
const release = () => {
  clearTimeout(holdTimer);
  if (!drag) return;
  if (drag.m) drag.m.userData.target = 0;
  if (editMode && !drag.held && !drag.moved && !drag.m) exitEdit();     // 編輯模式點空白 = 完成
  if (MOBILE && !gyroOn) tiltTarget.set(0, 0);
  drag = null;
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!MOBILE && !drag) tiltTarget.set(0, 0); });

// ---------- 編輯模式：抖動、刪除鈕、完成／還原 ----------
// 震動回饋（Android；使用者還沒真的觸碰過頁面時瀏覽器會擋，先檢查）
const buzz = (p) => navigator.userActivation?.hasBeenActive && navigator.vibrate?.(p);
let editMode = false;
const badgeBox = document.getElementById('badges');
const doneBtn = document.getElementById('done'), restoreBtn = document.getElementById('restore'), resetBtn = document.getElementById('reset');
const badges = ST.map((d) => {
  const b = document.createElement('button');
  b.className = 'del'; b.textContent = '−'; b.setAttribute('aria-label', '刪除 ' + (d.app.label || d.app.id));
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); deleteIcon(icons[d.app.cell]); });
  badgeBox.appendChild(b);
  return b;
});
function updateChrome() {
  document.body.classList.toggle('editing', editMode);
  restoreBtn.hidden = !(editMode && ST.some((d) => d.removed));
  ST.forEach((d, i) => { badges[i].hidden = !editMode || d.removed; });
  // 全部刪光：畫面中央給一個「重設主畫面」，不然沒有圖示可以長按
  resetBtn.hidden = !ST.every((d) => d.hidden);
  if (!resetBtn.hidden) {
    const r = canvas.getBoundingClientRect();
    Object.assign(resetBtn.style, { left: r.left + r.width / 2 + 'px', top: r.top + r.height * 0.42 + 'px' });
  }
}
function enterEdit() {
  if (editMode) return;
  editMode = true;
  buzz(12);
  updateChrome();
}
function exitEdit() {
  editMode = false;
  for (const m of icons) { m.rotation.z = 0; m.material.uniforms.uRot.value = 0; }
  updateChrome();
  needsRender = true;
}
doneBtn.addEventListener('click', exitEdit);
restoreBtn.addEventListener('click', () => restoreAll());
resetBtn.addEventListener('click', () => { restoreAll(); exitEdit(); });

// 刪除：先把當下畫面拍下來（粉塵的顏色），再由左往右掃成粉塵；消散完其他圖示補位
const snapVP = new THREE.Matrix4();
function deleteIcon(m) {
  const d = m.userData;
  if (d.removed) return;
  d.removed = true;
  d.ds = { t: 0, dir: 1, prog: 0 };
  m.rotation.z = 0; m.material.uniforms.uRot.value = 0;
  m.material.uniforms.uDsTint.value.set(P.dustTint).multiplyScalar(P.dustTintAmt);
  updateCamera();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const snap = new THREE.WebGLRenderTarget(buf.x, buf.y, { colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(snap); renderer.render(scene, camera); renderer.setRenderTarget(null);
  snapVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const s = L.s;
  measure.font = `400 ${12 * s}px ${FONT}`;
  dust.spawn({
    center: new THREE.Vector3(d.cur.x, d.cur.y, m.position.z), size: L.icon, height: m.material.uniforms.uHeight.value,
    radius: P.radius * s,
    label: d.app.label ? { w: measure.measureText(d.app.label).width + 6 * s, dy: LABEL_DY * s, h: 16 * s } : null,
    snap, snapVP: snapVP.clone(), overlay: screen.overlay, screen: shared.uScreenSize.value.clone(), px: pixelRatio, scale: s,
    density: P.dustDensity * (MOBILE ? 0.6 : 1),
    opts: { sweep: P.dustSweep, life: P.dustLife, wind: P.dustWind, tint: P.dustTint, tintAmt: P.dustTintAmt },
  });
  buzz([8, 40, 8]);
  saveRemoved();
  updateChrome();
  heights();
}
function restoreAll() {
  for (const m of icons) {
    const d = m.userData;
    if (!d.removed) continue;
    d.removed = false; d.hidden = false;
    d.ds = { t: 0, dir: -1, prog: DS_END };          // 反著掃回來
    m.material.uniforms.uDsTint.value.set(P.dustTint).multiplyScalar(P.dustTintAmt);
  }
  slots(false);
  for (const d of ST) if (d.ds && d.ds.dir < 0) d.cur.copy(d.goal);
  placeIcons();
  saveRemoved();
  updateChrome();
  heights();
}

// ---------- 尺寸：手機全螢幕；桌機用直式欄預覽 ----------
const GUI_W = 300;
function resize() {
  const vw = innerWidth, vh = innerHeight;
  let W = vw, H = vh, left = 0, safeTop, safeBottom;
  if (MOBILE || vw / vh < 0.75) {
    const cs = getComputedStyle(safeProbe);
    safeTop = parseFloat(cs.paddingTop) || 0; safeBottom = parseFloat(cs.paddingBottom) || 0;
  } else {
    W = Math.round(vh * 375 / 812); left = Math.max(0, Math.round((vw - (vw > 900 ? GUI_W : 0) - W) / 2));
    safeTop = 47 * W / 375; safeBottom = 34 * W / 375;           // 桌機預覽假裝有瀏海與 Home 條
  }
  Object.assign(canvas.style, { width: W + 'px', height: H + 'px', left: left + 'px' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(W, H, false);
  L = computeLayout(W, H, safeTop, safeBottom);
  applyLayout();
  updateChrome();
}
addEventListener('resize', resize);
resize();

// ---------- 相機：離軸投影，螢幕平面永遠剛好填滿畫面，眼睛跟著傾斜移動 ----------
const eyeDir = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
const qPhone = new THREE.Quaternion(), qInv = new THREE.Quaternion(), m4 = new THREE.Matrix4();
const lightBase = new THREE.Vector3(), lightLocal = new THREE.Vector3(), lastLight = new THREE.Vector3();
function updateCamera() {
  const W = L.W, H = L.H, D = P.viewDist * W;
  const ex = Math.tan(tilt.x) * D, ey = Math.tan(tilt.y) * D;
  camera.position.set(ex, ey, D);
  camera.quaternion.identity();
  camera.updateMatrixWorld();
  const near = D * 0.2, k = near / D;
  camera.projectionMatrix.makePerspective((-W / 2 - ex) * k, (W / 2 - ex) * k, (H / 2 - ey) * k, (-H / 2 - ey) * k, near, D * 4);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  shared.uPixAngle.value = H / (D * renderer.domElement.height);
  // 手機在世界中的轉向（傾斜角乘上倍率）：反光看 glintGain，陰影／焦散看 lightGain
  const turn = (gain, q) => {
    const ax = THREE.MathUtils.clamp(tilt.x * gain, -1.1, 1.1), ay = THREE.MathUtils.clamp(tilt.y * gain, -1.1, 1.1);
    return q.setFromUnitVectors(eyeDir.set(Math.tan(ax), Math.tan(ay), 1).normalize(), Z);
  };
  shared.uEnvRot.value.setFromMatrix4(m4.makeRotationFromQuaternion(turn(P.glintGain, qPhone)));
  turn(P.lightGain, qPhone);
  const az = THREE.MathUtils.degToRad(P.lightAz), el = THREE.MathUtils.degToRad(P.lightEl);
  lightBase.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
  if (P.lightWorld) {
    shared.uLightW.value.copy(lightBase);
    lightLocal.copy(lightBase).applyQuaternion(qInv.copy(qPhone).invert());
  } else {
    lightLocal.copy(lightBase);
    shared.uLightW.value.copy(lightBase).applyQuaternion(qPhone);
  }
  // 桌布景深視差：桌布在螢幕後 Dw 的地方，投影到螢幕上往眼睛那側偏；放大量依最大傾斜固定（不會呼吸）
  const Dw = P.wallDepth * W, kw = Dw / (D + Dw);
  const lim = Math.tan(THREE.MathUtils.degToRad(P.tiltAmt)) * D * kw;
  const su = screen.uniforms;
  const zoom = 1 + 2.1 * lim / Math.min(W, H);
  const sx = ex * kw / W / zoom, sy = ey * kw / H / zoom;
  if (Math.abs(sx - su.uWallShift.value.x) + Math.abs(sy - su.uWallShift.value.y) > 1e-5 || su.uWallZoom.value !== zoom) {
    su.uWallShift.value.set(sx, sy); su.uWallZoom.value = zoom; screenDirty = true;
  }
  shared.uLightL.value.copy(lightLocal);
  if (lightLocal.distanceToSquared(lastLight) > 1e-7) { screen.uniforms.uLight.value.copy(lightLocal); lastLight.copy(lightLocal); screenDirty = true; }
}

// ---------- 迴圈：有變化才重畫；手機太慢就自動降解析度 ----------
let last = performance.now(), slow = 0, fpsAcc = 0, fpsN = 0, prevRendered = false;
function step(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = now / 1000;
  if (!P.parallax) tiltTarget.set(0, 0);
  const tx = P.sway ? Math.sin(t * 0.9) * THREE.MathUtils.degToRad(P.tiltAmt) * 0.7 : tiltTarget.x;
  const ty = P.sway ? Math.sin(t * 0.63 + 1) * THREE.MathUtils.degToRad(P.tiltAmt) * 0.5 : tiltTarget.y;
  const a = 1 - Math.exp(-dt * 10);
  const before = tilt.x + tilt.y * 7;
  tilt.x += (tx - tilt.x) * a; tilt.y += (ty - tilt.y) * a;
  if (Math.abs(tilt.x + tilt.y * 7 - before) > 1e-5) needsRender = true;

  let pressing = false;
  for (const m of icons) {
    const d = m.userData, p0 = d.press;
    d.press += (d.target - d.press) * (1 - Math.exp(-dt * (d.target ? 22 : 12)));
    if (Math.abs(d.press - p0) > 1e-4) pressing = true;
  }
  // 消散進度（正向 = 刪除，反向 = 還原）
  let dsBusy = false;
  for (const d of ST) {
    if (!d.ds) continue;
    dsBusy = true;
    d.ds.t += dt;
    const rate = DS_END / (d.ds.dir > 0 ? P.dustSweep : 0.6);
    d.ds.prog = d.ds.dir > 0 ? d.ds.t * rate : DS_END - d.ds.t * rate;
    if (d.ds.dir > 0 && d.ds.prog >= DS_END) { d.ds = null; d.hidden = true; slots(false); updateChrome(); }
    else if (d.ds.dir < 0 && d.ds.prog <= 0) d.ds = null;
  }
  // 補位：目前位置滑向目標
  let moving = false;
  const k = 1 - Math.exp(-dt * 11);
  for (const d of ST) {
    if (d.hidden || d.cur.equals(d.goal)) continue;
    if (d.cur.distanceToSquared(d.goal) < 0.01) d.cur.copy(d.goal); else d.cur.lerp(d.goal, k);
    moving = true;
  }
  if (moving) placeIcons();
  // 編輯模式抖動（每顆相位不同）
  if (editMode) {
    for (const m of icons) {
      const d = m.userData;
      const r = d.removed ? 0 : Math.sin(t * 15 + d.phase) * 0.03;
      m.rotation.z = r; m.material.uniforms.uRot.value = r;
    }
    needsRender = true;
  }
  if (pressing || dsBusy || moving) heights();
  if (dust.update(dt)) needsRender = true;

  if (P.animateWall && screen.uniforms.uWallMode.value < 0.5) { screen.uniforms.uTime.value = t; screenDirty = true; }
  if (screenDirty) needsRender = true;
  if (!needsRender) { prevRendered = false; return false; }

  updateCamera();
  if (screenDirty) { screen.render(); screenDirty = false; }
  shared.uLodScreen.value = 0;
  shared.uLodGlyph.value = Math.max(0, Math.log2(240 / (L.icon * pixelRatio)));
  renderer.render(scene, camera);
  needsRender = false;
  if (editMode) placeBadges();

  // 連續重畫時量 FPS；長時間低於 40 就把解析度倍率降 0.25（最低 1）
  if (prevRendered) {
    fpsAcc += dt; fpsN++;
    slow = dt > 1 / 40 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 45 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); slow = 0; resize(); }
    if (fpsN >= 30) { fpsCtl.setValue(`${Math.round(fpsN / fpsAcc)} / ${pixelRatio}x`); fpsAcc = 0; fpsN = 0; }
  }
  prevRendered = true;
  return true;
}
// 刪除鈕：貼在每顆圖示左上角（跟著抖動、視差）
const corner = new THREE.Vector3();
function placeBadges() {
  const r = canvas.getBoundingClientRect();
  icons.forEach((m, i) => {
    if (badges[i].hidden) return;
    const h = L.icon / 2 - 4 * L.s, c = Math.cos(m.rotation.z), s = Math.sin(m.rotation.z);
    corner.set(m.position.x + c * -h - s * h, m.position.y + s * -h + c * h, m.position.z + m.material.uniforms.uHeight.value).project(camera);
    badges[i].style.transform = `translate(${r.left + (corner.x + 1) / 2 * r.width}px, ${r.top + (1 - corner.y) / 2 * r.height}px) translate(-50%, -50%) rotate(${-m.rotation.z}rad)`;
  });
}
let manual = false;               // 測試用：固定步長時鐘接手時，rAF 不推進
function frame(now) { if (!manual) step(now); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// 開發用：截圖存到 tools/shots/<name>.png（面板在背景時 rAF 會停，所以這裡自己跑幾步）
window.__shot = (name = 'shot', steps = 40) => {
  for (let i = 0; i < steps; i++) { needsRender = true; step(manual ? last : performance.now()); }
  return fetch('/__shot?name=' + name, { method: 'POST', body: canvas.toDataURL('image/png') }).then((r) => r.text());
};
// 開發用：以固定 60 fps 步長推進 ms 毫秒（不受面板節流影響）；off() 交還給 rAF
window.__advance = (ms) => { manual = true; for (let t = 0; t < ms; t += 1000 / 60) { needsRender = true; step(last + 1000 / 60); } };
window.__advance.off = () => { manual = false; last = performance.now(); };
window.__P = P; window.__sync = sync;
window.__app = { camera, shared, screen, renderer, step, setWallpaper, tilt, tiltTarget, get icons() { return icons; }, ST, deleteIcon, restoreAll, enterEdit, exitEdit, get L() { return L; } };
updateChrome();
