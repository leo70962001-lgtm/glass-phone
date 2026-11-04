import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { APPS, BUBBLES, LABEL_DY, computeLayout } from './layout.js';
import { drawAtlas, drawOverlay, ATLAS_COLS, ATLAS_ROWS, FONT } from './glyphs.js';
import { createScreenLayer } from './screen.js';
import { createGlass } from './glass.js';
import { createDust, DS_END } from './dust.js';
import { mergeLists } from './liquid.js';

const MOBILE = matchMedia('(pointer: coarse)').matches;
const clamp = THREE.MathUtils.clamp;

// ---------- 參數（面板）；長度都是 375 寬的設計 pt，實際乘上 s ----------
const DEFAULTS = {
  thickness: 18, bevel: 12, radius: 17, dome: 1.5,
  ior: 1.5, dispersion: 0.35, frost: 0.03, vibrancy: 1, absorb: 0.6, inner: 0.9, haze: 0.12,
  glyphDepth: 0.55, glyphOpacity: 0.85, glyphScale: 0.8, glyphFrost: 0.2,
  merge: 10, jelly: 1, touch: true,
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
  '液態玻璃': { thickness: 10, bevel: 9, dome: 0.5, ior: 1.45, dispersion: 0.2, frost: 0.1, vibrancy: 1.35, haze: 0.1, glyphDepth: 0.8, shadow: 0.32, caustic: 0.35, star: 0.1, rim: 0.9, trayThickness: 8 },
  '厚透鏡': { thickness: 22, bevel: 18, radius: 20, dome: 5, ior: 1.6, dispersion: 0.35, vibrancy: 1.15, glyphDepth: 0.85, caustic: 1.2, trayThickness: 10 },
  '稜鏡': { thickness: 14, bevel: 14, radius: 18, dome: 1, ior: 1.55, dispersion: 1.4, vibrancy: 1.25, glyphDepth: 0.85, rainbow: 1, caustic: 1.6, star: 0.8, trayThickness: 8 },
  '凹面唇邊': { thickness: 16, bevel: 8, radius: 18, dome: -4, ior: 1.5, dispersion: 0.3, vibrancy: 1.15, glyphDepth: 0.3, trayThickness: 8 },
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
  uIor: U(1.5), uDisp: U(0.3), uFrost: U(0), uVib: U(1), uAbsorb: U(0.6), uInner: U(0.9),
  uRefl: U(1), uRim: U(1), uSpec: U(1), uEnvI: U(1), uEnvRot: U(new THREE.Matrix3()),
  uLightW: U(new THREE.Vector3()), uLightL: U(new THREE.Vector3()),
  uScreenTex: U(screen.texture), uScreenSize: U(new THREE.Vector2(375, 812)),
  uGlyphTex: U(atlas), uGlyphOpacity: U(1), uGlyphScale: U(0.8), uGlyphFrost: U(0.2), uHaze: U(0.12),
  uLodScreen: U(0), uLodGlyph: U(0), uPixAngle: U(0.001),
};

// 存在這支手機上的狀態：刪了哪些、排列、泡泡位置
const REMOVED_KEY = 'glassHome.removed', ORDER_KEY = 'glassHome.order', MENU_KEY = 'glassHome.menu';
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式等：存不了就算了 */ } };

// 每塊玻璃的狀態：按壓、刪除／消散、位置、果凍形變、抖動相位（重建玻璃材質時沿用）
function newState(o) {
  return {
    press: 0, target: 0, removed: false, hidden: false, ds: null, dragging: false, inDock: false, bubble: false,
    cur: new THREE.Vector2(), goal: new THREE.Vector2(), dragTo: new THREE.Vector2(), grab: new THREE.Vector2(), vel: new THREE.Vector2(),
    sx: 1, sy: 1, svx: 0, svy: 0, grow: 1, growT: 1, zb: 0, nn: 0, phase: Math.random() * 6.28, mesh: null, ...o,
  };
}
const savedRemoved = load(REMOVED_KEY, []);
const ST = APPS.map((a) => { const gone = savedRemoved.includes(a.id); return newState({ app: a, inDock: a.dock, removed: gone, hidden: gone }); });
const BUB = BUBBLES.map((b) => newState({ app: b, bubble: true, hidden: b.child, grow: b.child ? 0.35 : 1, growT: b.child ? 0.35 : 1 }));
const MAIN = BUB[0], KIDS = BUB.slice(1);
const ALL = [...ST, ...BUB];

// 主畫面與 Dock 的排列（拖曳換位後存起來）
const defaultOrder = () => [ST.filter((d) => !d.app.dock), ST.filter((d) => d.app.dock)];
let [orderGrid, orderDock] = defaultOrder();
{
  const saved = load(ORDER_KEY, null), byId = (id) => ST.find((d) => d.app.id === id);
  if (saved?.grid && saved?.dock) {
    const g = saved.grid.map(byId).filter(Boolean), k = saved.dock.map(byId).filter(Boolean);
    if (new Set([...g, ...k]).size === ST.length && g.length + k.length === ST.length) { orderGrid = g; orderDock = k; }
  }
  for (const d of orderDock) d.inDock = true;
  for (const d of orderGrid) d.inDock = false;
}
const saveOrder = () => store(ORDER_KEY, { grid: orderGrid.map((d) => d.app.id), dock: orderDock.map((d) => d.app.id) });
const saveRemoved = () => store(REMOVED_KEY, ST.filter((d) => d.removed).map((d) => d.app.id));

let screenDirty = true, needsRender = true, labelsDirty = true, menuOpen = false, editMode = false;
const finger = new THREE.Vector2();
const dust = createDust(scene);
let tray, icons = [], bubbles = [];
const cellOf = (c) => new THREE.Vector4((c % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(c / ATLAS_COLS) + 1) / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS);
function buildGlass() {
  for (const m of [tray, ...icons, ...bubbles]) if (m) { scene.remove(m); m.material.dispose(); }
  tray = createGlass(shared, { uHasGlyph: U(0), uGlyphZ: U(-1), uGlyphHalf: U(40) }, P.quality);
  tray.renderOrder = 1;
  scene.add(tray);
  const make = (d, order) => {
    const m = createGlass(shared, { uTint: U(new THREE.Vector3(...d.app.tint)), uGlyphCell: U(cellOf(d.app.cell)) }, P.quality);
    m.renderOrder = order;
    m.userData = d; d.mesh = m;
    m.visible = !d.hidden;
    scene.add(m);
    return m;
  };
  icons = ST.map((d) => make(d, 2));
  bubbles = BUB.map((d) => make(d, 3));
}
buildGlass();

// ---------- 版面 ----------
let L = computeLayout(375, 812, 47, 34);
const safeProbe = document.getElementById('safe');
function applyLayout() {
  screenPlane.scale.set(L.W, L.H, 1);
  shared.uScreenSize.value.set(L.W, L.H);
  screen.resize(L.W, L.H, pixelRatio);
  slots(true);
  placeMenu();
  labelsDirty = true;
  sync();
}
// 補位：沒被刪的圖示依序排進格位；Dock 置中排
function slots(snap) {
  const grid = orderGrid.filter((d) => !d.removed), dockd = orderDock.filter((d) => !d.removed);
  grid.forEach((d, i) => d.goal.copy(L.grid(i)));
  dockd.forEach((d, i) => d.goal.copy(L.dockSlot(i, dockd.length)));
  for (const d of ST) {
    if (d.dragging) continue;
    if (snap) d.zb = d.inDock ? P.trayThickness * L.s : 0;
    if (snap || (d.removed && !d.ds)) d.cur.copy(d.goal);
  }
}
// 名稱：顯示中（含消散中）的圖示都畫，消散的那顆由螢幕層用同一道掃描擦掉；拖曳中與 Dock 裡不顯示
const measure = document.createElement('canvas').getContext('2d');
function redrawOverlay() {
  const labels = ST.filter((d) => !d.hidden && !d.inDock && !d.dragging).map((d) => ({ label: d.app.label, x: d.cur.x, y: d.cur.y }));
  // 選單名稱：泡泡在下半部時放上面（下面是頁面點和 Dock），在上半部時放下面
  const flip = MAIN.cur.y < 0 ? -1 : 1;
  if (menuOpen) for (const c of KIDS) if (!c.hidden && c.grow > 0.7) labels.push({ label: c.app.label, x: c.cur.x, y: c.cur.y, dy: flip * (c.app.size / 2 + 11) });
  screen.setOverlay(drawOverlay(L, labels, pixelRatio));
  screenDirty = true;
}

// ---------- 參數 → uniform：收集所有玻璃、算融合關係、更新陰影 ----------
function shapeOfIcon(d, s) {
  const h = P.thickness * s * (P.touch ? 1 : 1 - 0.35 * d.press), hx = L.icon / 2 * d.sx, hy = L.icon / 2 * d.sy;
  return {
    d, m: d.mesh, x: d.cur.x, y: d.cur.y, hx, hy, r: Math.min(P.radius * s * Math.min(d.sx, d.sy), hx, hy), h, zb: d.zb,
    bev: Math.min(P.bevel, P.thickness, 29) * s, dome: P.dome * s, gh: L.icon / 2 * (d.sx + d.sy) / 2, gz: d.zb + 0.01 + P.glyphDepth * (h + Math.min(P.dome * s, 0)) * 0.98,
    cell: d.mesh.material.uniforms.uGlyphCell.value, noMerge: !!d.ds, stacked: d.inDock && !d.dragging,
  };
}
function shapeOfBubble(d, s) {
  const base = d.app.size / 2 * s * d.grow, hx = base * d.sx, hy = base * d.sy, h = Math.min(P.thickness, 14) * s * (d === MAIN ? 1 : 0.9);
  return {
    d, m: d.mesh, x: d.cur.x, y: d.cur.y, hx, hy, r: Math.min(hx, hy), h, zb: 0,
    bev: Math.min(P.bevel * 0.8, P.thickness, 14) * s, dome: P.dome * s, gh: base * (d.sx + d.sy) / 2, gz: 0.01 + 0.75 * (h + Math.min(P.dome * s, 0)),
    cell: d.mesh.material.uniforms.uGlyphCell.value, noMerge: false, stacked: false,
  };
}
function updateShapes() {
  const s = L.s, trayH = P.trayThickness * s, k = 2 * P.merge * s;
  const shapes = [{
    m: tray, d: null, tray: true, x: L.dock.x, y: L.dock.y, hx: L.dock.hx, hy: L.dock.hy, r: L.dock.r, h: trayH, zb: 0,
    bev: Math.min(2.5, P.trayThickness * 0.6) * s, dome: 0, gh: 0, gz: -1, cell: null,
  }];
  for (const d of ST) { d.mesh.visible = !d.hidden; if (!d.hidden) shapes.push(shapeOfIcon(d, s)); }
  for (const d of BUB) { d.mesh.visible = !d.hidden; if (!d.hidden) shapes.push(shapeOfBubble(d, s)); }

  const lists = mergeLists(shapes, k);
  const pressed = shapes.findIndex((a) => a.d && a.d.press > 0.01);
  shapes.forEach((a, i) => {
    const u = a.m.material.uniforms, l = lists[i];
    u.uHalf.value.set(a.hx, a.hy); u.uRadius.value = a.r; u.uHeight.value = a.h; u.uZb.value = a.zb; u.uBevel.value = a.bev; u.uDome.value = a.dome;
    if (a.d) { u.uGlyphHalf.value = a.gh; u.uGlyphZ.value = a.gz; u.uDsProg.value = a.d.ds ? a.d.ds.prog : -1; a.d.nn = l.length; }
    u.uNn.value = l.length; u.uK.value = Math.max(k, 1e-3);
    let top = a.zb + a.h + Math.max(a.dome, 0), margin = 1.5 * s;
    l.forEach((j, n) => {
      const b = shapes[j];
      u.uNa.value[n].set(b.x - a.x, b.y - a.y, b.hx, b.hy); u.uNb.value[n].set(b.r, b.h, b.zb, b.bev); u.uNc.value[n].set(b.dome, b.gh, b.gz, 0);
      if (b.cell) u.uNg.value[n].copy(b.cell);
      top = Math.max(top, b.zb + b.h + Math.max(b.dome, 0));
    });
    if (l.length) { margin += k; top += k * 0.3; }
    u.uBox.value.set(a.hx + margin, a.hy + margin, top + 1.5 * s);
    a.m.position.set(a.x, a.y, 0);
    u.uCenter.value.set(a.x, a.y);
    // 觸碰反應：按住的玻璃和融在一起的鄰居都一樣亮（不然交界看得到）
    const lit = pressed >= 0 && (i === pressed || lists[pressed].includes(i));
    const glow = lit ? shapes[pressed].d.press : 0;
    u.uGlow.value = glow * (P.touch ? 0.35 : 1);
    if (lit && P.touch) u.uTouch.value.set(finger.x - a.x, finger.y - a.y, glow * 0.8); else u.uTouch.value.set(0, 0, 0);
  });

  // 陰影用的物件：托盤 + 圖示 + 泡泡（uObjC = 消散進度、圖示邊長、陰影可見度）
  const su = screen.uniforms;
  su.uObjA.value[0].set(L.dock.x, L.dock.y, L.dock.hx, L.dock.hy);
  su.uObjB.value[0].set(L.dock.r, trayH, 0, 0);
  su.uObjC.value[0].set(-1, L.icon, 1, 0);
  const byD = new Map(shapes.map((a) => [a.d, a]));
  ALL.forEach((d, i) => {
    const a = byD.get(d), prog = d.ds ? d.ds.prog : -1;
    if (a) { su.uObjA.value[i + 1].set(a.x, a.y, a.hx, a.hy); su.uObjB.value[i + 1].set(a.r, a.h + Math.max(a.dome, 0), a.zb, 0); }
    su.uObjC.value[i + 1].set(prog, L.icon, !a ? 0 : d.ds ? 1 - clamp(prog / DS_END, 0, 1) : 1, 0);
  });
  su.uCount.value = ALL.length + 1;
  screenDirty = true;
  needsRender = true;
}
function sync() {
  const k = P.depth3d, s = L.s;
  shared.uIor.value = P.ior; shared.uDisp.value = P.dispersion; shared.uFrost.value = P.frost; shared.uVib.value = P.vibrancy;
  shared.uAbsorb.value = P.absorb / s; shared.uInner.value = P.inner; shared.uGlyphOpacity.value = P.glyphOpacity;
  shared.uGlyphScale.value = P.glyphScale; shared.uGlyphFrost.value = P.glyphFrost; shared.uHaze.value = P.haze / s;
  shared.uRefl.value = P.refl; shared.uRim.value = P.rim * k; shared.uSpec.value = P.spec * k; shared.uEnvI.value = P.env;

  const su = screen.uniforms;
  su.uIor.value = P.ior; su.uBevel.value = Math.min(P.bevel, P.thickness, 29) * s;
  su.uShadow.value = Math.min(P.shadow * k, 0.95); su.uShadowLen.value = P.shadowLen * Math.sqrt(k);
  su.uShadowSoft.value = P.shadowSoft * s; su.uContact.value = Math.min(P.contact * k, 0.9);
  su.uCaustic.value = P.caustic * k; su.uRainbow.value = Math.min(P.dispersion * 1.6, 1) * P.rainbow; su.uStar.value = P.star * k;
  su.uCausticW.value = (1.5 + Math.min(P.bevel, P.thickness) * 0.35) * s;
  updateShapes();
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

const fLiquid = gui.addFolder('液態融合');
fLiquid.add(P, 'merge', 0, 30, 0.5).name('融合距離 (pt)').onChange(sync);
fLiquid.add(P, 'jelly', 0, 2, 0.05).name('果凍感');
fLiquid.add(P, 'touch').name('觸碰反應（膨脹、發亮）').onChange(sync);

const fGlass = gui.addFolder('玻璃');
fGlass.add(P, 'thickness', 1, 40, 0.5).name('玻璃厚度 (pt)').onChange(sync);
fGlass.add(P, 'bevel', 0.5, 20, 0.5).name('倒角半徑').onChange(sync);
fGlass.add(P, 'radius', 4, 30, 0.5).name('圓角').onChange(sync);
fGlass.add(P, 'dome', -6, 10, 0.1).name('頂面弧度（負 = 唇邊）').onChange(sync);
fGlass.add(P, 'ior', 1.0, 2.4, 0.01).name('折射率 IOR').onChange(sync);
fGlass.add(P, 'dispersion', 0, 2, 0.01).name('色散').onChange(sync);
fGlass.add(P, 'frost', 0, 1, 0.01).name('霧面').onChange(sync);
fGlass.add(P, 'vibrancy', 0, 2, 0.01).name('鮮豔度').onChange(sync);
fGlass.add(P, 'absorb', 0, 3, 0.01).name('玻璃顏色濃度').onChange(sync);
fGlass.add(P, 'inner', 0, 1, 0.01).name('內部反射').onChange(sync);
fGlass.add(P, 'haze', 0, 2, 0.01).name('乳白霧感').onChange(sync);
fGlass.add(P, 'glyphDepth', 0, 1, 0.01).name('圖案深度').onChange(sync);
fGlass.add(P, 'glyphOpacity', 0, 1, 0.01).name('圖案不透明度').onChange(sync);
fGlass.add(P, 'glyphScale', 0.5, 1.1, 0.01).name('圖案大小').onChange(sync);
fGlass.add(P, 'glyphFrost', 0, 1, 0.01).name('圖案柔化').onChange(sync);
fGlass.add(P, 'trayThickness', 1, 16, 0.5).name('Dock 托盤厚度').onChange(() => { slots(true); sync(); });

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
fDust.add({ 重設排列: () => restoreAll(true) }, '重設排列');
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
function toggleGui() {
  if (gui._hidden) { gui.show(); gui.open(); }
  else if (gui._closed) gui.open();
  else if (MOBILE) gui.hide();
  else gui.close();
}

function applyPreset(name) {
  const keep = { wallpaper: P.wallpaper, parallax: P.parallax, sway: P.sway, animateWall: P.animateWall, quality: P.quality, maxDpr: P.maxDpr, tiltAmt: P.tiltAmt, viewDist: P.viewDist,
    dustDensity: P.dustDensity, dustSweep: P.dustSweep, dustLife: P.dustLife, dustWind: P.dustWind, dustTint: P.dustTint, dustTintAmt: P.dustTintAmt,
    gyroGain: P.gyroGain, gyroRecenter: P.gyroRecenter, wallDepth: P.wallDepth, glintGain: P.glintGain, lightGain: P.lightGain, merge: P.merge, jelly: P.jelly, touch: P.touch };
  Object.assign(P, DEFAULTS, name ? PRESETS[name] : {}, keep);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  slots(true);
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
  tiltTarget.set(clamp((cur.g - gyroBase.g) * k, -lim, lim), clamp((cur.b - gyroBase.b) * k, -lim, lim));
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

// ---------- 液態選單：主泡泡點一下分裂成三顆，再點一下融回去；可拖去跟別的玻璃融合 ----------
function menuHome() {
  const m = L.menu, half = MAIN.app.size / 2 * L.s, saved = load(MENU_KEY, null);
  return saved ? { x: clamp(saved.x * L.W, -L.W / 2 + half, L.W / 2 - half), y: clamp(saved.y * L.H, -L.H / 2 + half, L.H / 2 - half) } : m;
}
function placeMenu() {
  if (!MAIN.dragging) { MAIN.goal.copy(menuHome()); MAIN.cur.copy(MAIN.goal); MAIN.vel.set(0, 0); }
  if (menuOpen) kidGoals(); else for (const c of KIDS) { c.goal.copy(MAIN.cur); c.cur.copy(MAIN.cur); }
  if (menuOpen) for (const c of KIDS) c.cur.copy(c.goal);
}
// 三顆一字排開朝畫面中央，間距留一點點：融合距離夠就會連著頸部（像膠囊分裂成三顆）
function kidGoals() {
  const s = L.s, dir = MAIN.cur.x > 0 ? -1 : 1;
  let x = MAIN.cur.x, r = MAIN.app.size / 2;
  for (const c of KIDS) {
    const rc = c.app.size / 2;
    x += dir * (r + rc + 5) * s;
    c.goal.set(x, MAIN.cur.y);
    r = rc;
  }
}
function openMenu() {
  menuOpen = true;
  for (const c of KIDS) { c.hidden = false; c.cur.copy(MAIN.cur); c.vel.set(0, 0); c.growT = 1; }
  kidGoals();
  buzz(8);
  updateShapes();
}
function closeMenu() {
  menuOpen = false;
  for (const c of KIDS) { c.goal.copy(MAIN.cur); c.growT = 0.35; }
  labelsDirty = true;
}
function menuAction(id) {
  closeMenu();
  if (id === 'edit') { if (editMode) exitEdit(); else enterEdit(); }
  else if (id === 'glass') toggleGui();
  else if (id === 'reset') restoreAll(true);
}

// ---------- 指標：桌機滑過 = 視差；拖曳泡泡／圖示 = 融合；長按 = 編輯模式；手機在空白處拖曳 = 視差（沒有陀螺儀時）----------
let drag = null, holdTimer = 0;
const HOLD_MS = 400;
function toScreen(e, out) {
  const r = canvas.getBoundingClientRect();
  return out.set(e.clientX - r.left - L.W / 2, L.H / 2 - (e.clientY - r.top));
}
const tmp = new THREE.Vector2();
function shapeAt(e) {
  const p = toScreen(e, tmp);
  for (const d of [...KIDS, MAIN]) {
    if (!d.hidden && (d !== MAIN ? menuOpen : true) && d.cur.distanceTo(p) < d.app.size / 2 * L.s * 1.08) return d;
  }
  for (const d of ST) {
    if (d.removed || d.hidden) continue;
    if (Math.abs(p.x - d.cur.x) < L.icon / 2 && Math.abs(p.y - d.cur.y) < L.icon / 2) return d;
  }
  return null;
}
function startDrag(d) {
  drag.dragging = true;
  d.dragging = true;
  d.target = 1;
  toScreen({ clientX: drag.x, clientY: drag.y }, tmp);          // 抓取點從按下的位置算：起手很快也不會跟丟手指
  d.grab.copy(d.cur).sub(tmp);
  d.dragTo.copy(d.cur);
  if (d === MAIN && menuOpen) closeMenu();
  labelsDirty = true;
  buzz(10);
  updateChrome();
}
function moveDrag(d, e) {
  toScreen(e, tmp).add(d.grab);
  const hx = (d.bubble ? d.app.size / 2 * L.s : L.icon / 2), lim = (v, half) => clamp(v, -half + hx, half - hx);
  d.dragTo.set(lim(tmp.x, L.W / 2), lim(tmp.y, L.H / 2));
  if (!d.bubble) reorder(d);
}
function endDrag(d) {
  d.dragging = false;
  d.target = 0;
  if (d === MAIN) { d.goal.copy(d.dragTo); store(MENU_KEY, { x: d.goal.x / L.W, y: d.goal.y / L.H }); }
  else { slots(false); saveOrder(); }
  labelsDirty = true;
  updateChrome();
}
// 拖曳換位：手指真的壓到別的格位才換（靠近時先融合，不會一碰就跳開）；拖進 Dock 最多四顆
function reorder(d) {
  const { x, y } = d.dragTo;
  const live = (list) => list.filter((q) => !q.removed && q !== d);
  const grid = live(orderGrid), dockd = live(orderDock);
  const overDock = y < L.dock.y + L.dock.hy + L.icon * 0.15;
  const toDock = (overDock && dockd.length < 4) || grid.length >= 20;
  const list = toDock ? dockd : grid, n = list.length + 1;
  let best = 0, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const p = toDock ? L.dockSlot(i, n) : L.grid(i), dist = Math.hypot(x - p.x, y - p.y);
    if (dist < bd) { bd = dist; best = i; }
  }
  const same = d.inDock === toDock;
  if (same && (bd > L.icon * 0.8 || (toDock ? orderDock : orderGrid).filter((q) => !q.removed).indexOf(d) === best)) return;
  list.splice(best, 0, d);
  const rem = (arr) => arr.filter((q) => q.removed && q !== d);
  orderGrid = [...grid, ...rem(orderGrid)];
  orderDock = [...dockd, ...rem(orderDock)];
  d.inDock = toDock;
  slots(false);
  labelsDirty = true;
  buzz(6);
}
canvas.addEventListener('pointerdown', (e) => {
  const d = shapeAt(e);
  toScreen(e, finger);
  drag = { x: e.clientX, y: e.clientY, d, moved: false, dragging: false, held: false };
  if (d) d.target = 1;
  if (!editMode && (!d || !d.bubble)) {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!drag || drag.moved) return;
      drag.held = true;
      enterEdit();
      if (d) startDrag(d);
    }, HOLD_MS);
  }
  playWall();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, d = drag.d;
    toScreen(e, finger);
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      clearTimeout(holdTimer);
      if (d && !drag.dragging) {
        if (d === MAIN || (!d.bubble && editMode)) startDrag(d);
        else d.target = 0;
      }
    }
    if (drag.dragging) moveDrag(d, e);
    else if (drag.moved && !d && MOBILE && !gyroOn) {
      const lim = THREE.MathUtils.degToRad(P.tiltAmt);
      tiltTarget.set(clamp(dx / r.width * 2, -1, 1) * lim, clamp(-dy / r.height * 2, -1, 1) * lim);
    }
  } else if (!MOBILE) {
    const lim = THREE.MathUtils.degToRad(P.tiltAmt);
    tiltTarget.set(clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5) * lim,
      clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5) * lim);
  }
});
const release = () => {
  clearTimeout(holdTimer);
  if (!drag) return;
  const d = drag.d;
  if (d) d.target = 0;
  if (drag.dragging) endDrag(d);
  else if (!drag.moved && !drag.held) {                          // 點一下
    if (d === MAIN) { if (menuOpen) closeMenu(); else openMenu(); }
    else if (d && d.bubble) menuAction(d.app.id);
    else if (menuOpen) closeMenu();
    else if (!d) {
      if (editMode) exitEdit();                                  // 編輯模式點空白 = 完成
      else if (MOBILE && !gui._hidden) gui.hide();
    }
  }
  if (MOBILE && !gyroOn) tiltTarget.set(0, 0);
  drag = null;
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!MOBILE && !drag) tiltTarget.set(0, 0); });

// ---------- 編輯模式：抖動、刪除鈕、完成／還原 ----------
// 震動回饋（Android；使用者還沒真的觸碰過頁面時瀏覽器會擋，先檢查）
function buzz(p) { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(p); }
const badgeBox = document.getElementById('badges');
const doneBtn = document.getElementById('done'), restoreBtn = document.getElementById('restore'), resetBtn = document.getElementById('reset');
const badges = ST.map((d) => {
  const b = document.createElement('button');
  b.className = 'del'; b.textContent = '−'; b.setAttribute('aria-label', '刪除 ' + (d.app.label || d.app.id));
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); deleteIcon(d.mesh); });
  badgeBox.appendChild(b);
  return b;
});
function updateChrome() {
  document.body.classList.toggle('editing', editMode);
  restoreBtn.hidden = !(editMode && ST.some((d) => d.removed));
  ST.forEach((d, i) => { badges[i].hidden = !editMode || d.removed || d.dragging; });
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
resetBtn.addEventListener('click', () => { restoreAll(true); exitEdit(); });

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
    center: new THREE.Vector3(d.cur.x, d.cur.y, d.zb), size: L.icon, height: m.material.uniforms.uHeight.value,
    radius: P.radius * s,
    label: d.app.label && !d.inDock ? { w: measure.measureText(d.app.label).width + 6 * s, dy: LABEL_DY * s, h: 16 * s } : null,
    snap, snapVP: snapVP.clone(), overlay: screen.overlay, screen: shared.uScreenSize.value.clone(), px: pixelRatio, scale: s,
    density: P.dustDensity * (MOBILE ? 0.6 : 1),
    opts: { sweep: P.dustSweep, life: P.dustLife, wind: P.dustWind, tint: P.dustTint, tintAmt: P.dustTintAmt },
  });
  buzz([8, 40, 8]);
  saveRemoved();
  updateChrome();
  updateShapes();
}
// 還原被刪的圖示（反著掃回來）；resetOrder = 連排列和泡泡位置都回預設
function restoreAll(resetOrder = false) {
  for (const d of ST) {
    if (!d.removed) continue;
    d.removed = false; d.hidden = false;
    d.ds = { t: 0, dir: -1, prog: DS_END };
    d.mesh.material.uniforms.uDsTint.value.set(P.dustTint).multiplyScalar(P.dustTintAmt);
  }
  if (resetOrder) {
    [orderGrid, orderDock] = defaultOrder();
    for (const d of ST) d.inDock = d.app.dock;
    store(MENU_KEY, null);
    MAIN.goal.copy(L.menu);
  }
  slots(false);
  for (const d of ST) if (d.ds && d.ds.dir < 0) d.cur.copy(d.goal);
  saveRemoved(); saveOrder();
  labelsDirty = true;
  updateChrome();
  updateShapes();
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
    const ax = clamp(tilt.x * gain, -1.1, 1.1), ay = clamp(tilt.y * gain, -1.1, 1.1);
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

// ---------- 每塊玻璃的動畫：位置（拖曳緊跟、放開彈回）、果凍形變（速度拉長＋彈性）、按壓、長大、高度 ----------
function animate(d, dt) {
  if (dt <= 0) return false;
  let active = false;
  const p0 = d.press;
  d.press += (d.target - d.press) * (1 - Math.exp(-dt * (d.target ? 22 : 12)));
  if (Math.abs(d.press - d.target) < 1e-3) d.press = d.target;
  if (d.press !== p0) active = true;

  const px = d.cur.x, py = d.cur.y, n = Math.ceil(dt / 0.016), h = dt / n;
  if (d.dragging) d.cur.lerp(d.dragTo, 1 - Math.exp(-dt * 32));
  else if (d.bubble) {
    for (let i = 0; i < n; i++) {
      d.vel.x += ((d.goal.x - d.cur.x) * 190 - d.vel.x * 17) * h; d.vel.y += ((d.goal.y - d.cur.y) * 190 - d.vel.y * 17) * h;
      d.cur.x += d.vel.x * h; d.cur.y += d.vel.y * h;
    }
    if (d.cur.distanceToSquared(d.goal) < 0.01 && d.vel.lengthSq() < 1) { d.cur.copy(d.goal); d.vel.set(0, 0); }
  } else if (!d.cur.equals(d.goal)) {
    if (d.cur.distanceToSquared(d.goal) < 0.01) d.cur.copy(d.goal); else d.cur.lerp(d.goal, 1 - Math.exp(-dt * 11));
  }
  const vx = (d.cur.x - px) / dt, vy = (d.cur.y - py) / dt;
  d.moved = !!(vx || vy);
  if (d.moved) active = true;
  if (d.dragging) d.vel.set(vx, vy);

  // 果凍：沿運動方向拉長、另一邊收窄；彈簧帶一點過衝
  const kv = 0.0007 * P.jelly / L.s, ax = Math.abs(vx) * kv, ay = Math.abs(vy) * kv;
  const sw = 1 + (d.dragging ? 0.1 : 0) + (P.touch ? 0.07 * d.press : 0);
  const tx = sw * (1 + clamp(ax - ay * 0.5, -0.22, 0.3)), ty = sw * (1 + clamp(ay - ax * 0.5, -0.22, 0.3));
  const damp = P.jelly > 0 ? 15 : 26;
  for (let i = 0; i < n; i++) {
    d.svx += ((tx - d.sx) * 170 - d.svx * damp) * h; d.svy += ((ty - d.sy) * 170 - d.svy * damp) * h;
    d.sx += d.svx * h; d.sy += d.svy * h;
  }
  if (Math.abs(tx - d.sx) + Math.abs(ty - d.sy) < 0.001 && Math.abs(d.svx) + Math.abs(d.svy) < 0.01) { d.sx = tx; d.sy = ty; d.svx = d.svy = 0; } else active = true;

  if (d.grow !== d.growT) {
    d.grow += (d.growT - d.grow) * (1 - Math.exp(-dt * 13));
    if (Math.abs(d.grow - d.growT) < 1e-3) d.grow = d.growT;
    active = true;
  }
  if (!d.bubble) {
    const zt = d.inDock && !d.dragging ? P.trayThickness * L.s : 0;
    if (d.zb !== zt) {
      d.zb += (zt - d.zb) * (1 - Math.exp(-dt * 14));
      if (Math.abs(d.zb - zt) < 0.01) d.zb = zt;
      active = true;
    }
  }
  return active;
}

// ---------- 迴圈：有變化才重畫；手機太慢就自動降解析度 ----------
let last = performance.now(), lastOverlay = 0, slow = 0, fpsAcc = 0, fpsN = 0, prevRendered = false;
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

  // 消散進度（正向 = 刪除，反向 = 還原）
  let active = false;
  for (const d of ST) {
    if (!d.ds) continue;
    active = true;
    d.ds.t += dt;
    const rate = DS_END / (d.ds.dir > 0 ? P.dustSweep : 0.6);
    d.ds.prog = d.ds.dir > 0 ? d.ds.t * rate : DS_END - d.ds.t * rate;
    if (d.ds.dir > 0 && d.ds.prog >= DS_END) { d.ds = null; d.hidden = true; slots(false); labelsDirty = true; updateChrome(); }
    else if (d.ds.dir < 0 && d.ds.prog <= 0) d.ds = null;
  }
  // 選單關著時，子泡泡待在主泡泡裡面；縮回去就隱藏
  for (const c of KIDS) {
    if (c.hidden) continue;
    if (!menuOpen) {
      c.goal.copy(MAIN.cur);
      if (c.grow < 0.42 && c.cur.distanceTo(c.goal) < 2) { c.hidden = true; active = true; }
    }
  }
  if (!menuOpen) for (const c of KIDS) if (c.hidden) c.cur.copy(MAIN.cur);
  for (const d of ALL) {
    if (d.hidden || !animate(d, dt)) continue;
    active = true;
    if (d.moved && (d.bubble ? (menuOpen && d !== MAIN) : (!d.inDock && !d.dragging))) labelsDirty = true;   // 有名稱的玻璃移動了才重畫文字
  }
  // 編輯模式抖動（每顆相位不同；正在融合或拖曳的不抖，交界才算得準）
  if (editMode) {
    for (const m of icons) {
      const d = m.userData;
      const r = d.removed || d.dragging || d.nn > 0 ? 0 : Math.sin(t * 15 + d.phase) * 0.03;
      m.rotation.z = r; m.material.uniforms.uRot.value = r;
    }
    needsRender = true;
  }
  // 文字層重畫要上傳整張貼圖：動畫中最多每秒 30 次，最後一格一定會補上
  if (labelsDirty && now - lastOverlay >= 30) { redrawOverlay(); labelsDirty = false; lastOverlay = now; }
  if (active) updateShapes();
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
    corner.set(m.position.x + c * -h - s * h, m.position.y + s * -h + c * h, m.userData.zb + m.material.uniforms.uHeight.value).project(camera);
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
window.__app = { camera, shared, screen, renderer, step, setWallpaper, tilt, tiltTarget, get icons() { return icons; }, ST, BUB, MAIN, KIDS, deleteIcon, restoreAll, enterEdit, exitEdit, openMenu, closeMenu, get L() { return L; }, get orderGrid() { return orderGrid; }, get orderDock() { return orderDock; } };
updateChrome();
