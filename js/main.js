import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { APPS, BUBBLES, MENU_ROWS, SEGMENTS, LABEL_DY, computeLayout } from './layout.js';
import { drawAtlas, drawOverlay, paintInk, ATLAS_COLS, ATLAS_ROWS, FONT } from './glyphs.js';
import { createScreenLayer, MAX_OBJ } from './screen.js';
import { createGlass } from './glass.js';
import { createLens, createInk } from './lens.js';
import { createPyramid, SIGMA0 } from './pyramid.js';
import { createTone } from './tone.js';
import { createFish } from './fish.js';
import { createDust, DS_END } from './dust.js';
import { mergeLists } from './liquid.js';

const MOBILE = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = THREE.MathUtils.clamp;
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---------- 參數（面板）；長度都是 375 寬的設計 pt，實際乘上 s ----------
const DEFAULTS = {
  mode: 'lens',                                  // lens = 透鏡（薄的液態玻璃）；ray = 3D 光線追蹤（厚玻璃）
  // 透鏡模式
  lRefr: 18, lEdge: 20, lMag: 1, lDisp: 0.04, lLip: false, lSize: true, lLift: 3,
  lBlur: 6, lFrost: 0.1, lVib: 1.35, lBright: 0.02, lDim: 0, lAppear: 'auto',
  lBelow: 0.35, lTint: 0, lTintC: '#e8593c', lIconTint: 0.5,
  lRim: 0.7, lRimW: 1.4, lAngle: 135, lShadow: 0.3,
  // 3D 模式
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
  wallpaper: 'flow', animateWall: !reduced.matches,
  fishOn: true, fishCount: 12, fishSize: 48, fishSpeed: 1, fishGap: 0,
  quality: MOBILE ? 'low' : 'high', maxDpr: Math.min(devicePixelRatio, 2),
  dustDensity: 2.6, dustSweep: 0.9, dustLife: 1.3, dustWind: 55, dustTint: '#d6b4ff', dustTintAmt: 0.55,
};
const LENS = (o) => ({ mode: 'lens', glyphOpacity: 1, glyphScale: 0.72, ...o });
const PRESETS = {
  '液態玻璃': LENS({}),
  '清透': LENS({ lEdge: 16, lDisp: 0.05, lBlur: 0.5, lFrost: 0.02, lVib: 1.1, lBright: 0, lDim: 0.35, lAppear: 'light', lBelow: 0.1, lRim: 0.65, lShadow: 0.18 }),
  '厚透鏡': LENS({ lRefr: 46, lEdge: 44, lMag: 1.28, lDisp: 0.12, lSize: false, lBlur: 0, lFrost: 0, lVib: 1.05, lAppear: 'light', lBelow: 0, lRim: 0.8, lRimW: 2.2, lShadow: 0.45, merge: 24 }),
  '霧面': LENS({ lRefr: 8, lEdge: 12, lDisp: 0, lBlur: 22, lFrost: 0.3, lVib: 1.4, lBright: 0.04, lBelow: 0.6, lRim: 0.35, lRimW: 1, lShadow: 0.25, merge: 14 }),
  '素透鏡': LENS({ lRefr: 26, lEdge: 22, lMag: 1.06, lDisp: 0, lSize: false, lBlur: 0, lFrost: 0, lVib: 1, lBright: 0, lAppear: 'light', lBelow: 0, lRim: 0.5, lRimW: 1, lShadow: 0.15, merge: 14 }),
  '稜鏡': LENS({ lRefr: 30, lEdge: 30, lMag: 1.1, lDisp: 0.85, lSize: false, lBlur: 0, lFrost: 0, lVib: 1.2, lAppear: 'light', lBelow: 0, lRim: 0.9, lRimW: 1.6, lShadow: 0.25, merge: 20 }),
  '3D 厚玻璃': { mode: 'ray' },
  '3D 厚透鏡': { mode: 'ray', thickness: 22, bevel: 18, radius: 20, dome: 5, ior: 1.6, dispersion: 0.35, vibrancy: 1.15, glyphDepth: 0.85, caustic: 1.2, trayThickness: 10 },
  '3D 稜鏡': { mode: 'ray', thickness: 14, bevel: 14, radius: 18, dome: 1, ior: 1.55, dispersion: 1.4, vibrancy: 1.25, glyphDepth: 0.85, rainbow: 1, caustic: 1.6, star: 0.8, trayThickness: 8 },
  '3D 凹面唇邊': { mode: 'ray', thickness: 16, bevel: 8, radius: 18, dome: -4, ior: 1.5, dispersion: 0.3, vibrancy: 1.15, glyphDepth: 0.3, trayThickness: 8 },
  '3D 厚果凍': { mode: 'ray', thickness: 24, bevel: 11, radius: 18, dome: 4, ior: 1.45, dispersion: 0.6, absorb: 1.0, glyphDepth: 0.35, shadowLen: 1.2, caustic: 1.5, star: 0.8, depth3d: 1.25 },
  '3D 薄玻璃': { mode: 'ray', thickness: 4, bevel: 2, radius: 14, dome: 0, dispersion: 0.2, absorb: 0.3, glyphDepth: 0, shadow: 0.3, caustic: 0.6, star: 0.3 },
  '3D 霧面': { mode: 'ray', thickness: 10, bevel: 5, frost: 0.55, dispersion: 0.15, glyphDepth: 0.5, caustic: 0.5, star: 0.2, rim: 1.3 },
  '3D 水晶塊': { mode: 'ray', thickness: 30, bevel: 4, radius: 12, dome: 0, ior: 1.75, dispersion: 0.9, absorb: 0.4, glyphDepth: 0.1, inner: 1.0, caustic: 1.8, star: 1.0, depth3d: 1.4 },
};
const SEG_PRESETS = ['液態玻璃', '清透', '3D 厚玻璃'];   // 第二頁分段控制對應的預設

// 存在這支手機上的狀態：預設、刪了哪些、排列、浮動玻璃的位置
const PRESET_KEY = 'glassHome.preset', REMOVED_KEY = 'glassHome.removed', ORDER_KEY = 'glassHome.order', MENU_KEY = 'glassHome.menu', NEW_KEY = 'glassHome.new';
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式等：存不了就算了 */ } };

const P = { ...DEFAULTS };
let curPreset = load(PRESET_KEY, '液態玻璃');
if (!PRESETS[curPreset]) curPreset = '液態玻璃';
Object.assign(P, PRESETS[curPreset]);

// 分享連結：#p= 後面是 base64url JSON。只收認得的鍵、型別要對，數字要是有限值
const LINK_KEYS = Object.keys(DEFAULTS).filter((k) => /^l[A-Z]/.test(k)).concat('mode', 'merge', 'radius', 'jelly', 'thickness', 'bevel', 'dome', 'ior', 'dispersion', 'frost', 'vibrancy');
function readLink() {
  const m = /[#&]p=([\w-]+)/.exec(location.hash);
  if (!m) return false;
  try {
    const o = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
    for (const k of LINK_KEYS) {
      const v = o[k];
      if (typeof v !== typeof DEFAULTS[k]) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (k === 'mode' && v !== 'lens' && v !== 'ray') continue;
      if (k === 'lAppear' && !['auto', 'light', 'dark'].includes(v)) continue;
      if (k === 'lTintC' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
      P[k] = v;
    }
    curPreset = '';
    return true;
  } catch { return false; }
}
readLink();
function linkURL() {
  const o = {};
  for (const k of LINK_KEYS) if (P[k] !== DEFAULTS[k]) o[k] = P[k];
  const b = btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#p=${b}`;
}

// ---------- 彈簧：所有會動的值都是阻尼彈簧，固定 120 Hz 步進（k = 勁度，c = 阻尼）----------
const S = (x = 0) => ({ x, v: 0, t: x });
const stepS = (sp, k, c, h) => { sp.v += (-k * (sp.x - sp.t) - c * sp.v) * h; sp.x += sp.v * h; };
const atRest = (sp) => Math.abs(sp.x - sp.t) < 1e-3 && Math.abs(sp.v) < 1e-3;
const snapS = (sp, x = sp.t) => { sp.x = sp.t = x; sp.v = 0; };
const TUNE = {
  move: [320, 24],      // 一次柔和的過衝
  follow: [1400, 75],   // 緊跟手指
  press: [420, 17],     // 按下彈一下
  stretch: [380, 22],
  tone: [120, 22],      // 玻璃換明暗：慢
  ink: [700, 53],       // 文字換深淺：快，對比才不會掉
  morph: [230, 25],     // 型變：位置和尺寸共用，釘住的角才不會動
  peel: [110, 17],      // 分裂：故意慢一點，才看得到融合
  fade: [260, 32],
  fadeIn: [160, 25],
  fadeOut: [600, 49],
  page: [240, 30],
  lens: [140, 19],      // 換材質時透鏡重新形成
  drift: [380, 22],
};
const tune = (n) => { const [k, c] = TUNE[n]; return reduced.matches ? [k, 2 * Math.sqrt(k)] : [k, c]; };

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
const pyramid = createPyramid(renderer), basePyramid = createPyramid(renderer);
const tone = createTone(renderer);
const fish = createFish(renderer);
scene.add(fish.gap);
let baseRT = null;                     // 面板蓋到圖示時，下層先畫進這一張，面板才模糊得到圖示

const atlas = new THREE.CanvasTexture(drawAtlas());
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.anisotropy = 8;

const U = (value) => ({ value });
const shared = {
  // 3D
  uIor: U(1.5), uDisp: U(0.3), uFrost: U(0), uVib: U(1), uAbsorb: U(0.6), uInner: U(0.9),
  uRefl: U(1), uRim: U(1), uSpec: U(1), uEnvI: U(1), uEnvRot: U(new THREE.Matrix3()),
  uLightW: U(new THREE.Vector3()), uLightL: U(new THREE.Vector3()),
  uGlyphFrost: U(0.2), uHaze: U(0.12), uLodScreen: U(0), uPixAngle: U(0.001),
  // 共用
  uScreenTex: U(screen.texture), uScreenSize: U(new THREE.Vector2(375, 812)),
  uGlyphTex: U(atlas), uGlyphOpacity: U(1), uGlyphScale: U(0.8), uLodGlyph: U(0),
  // 透鏡
  uBlurTex: U(null), uTexel: U(new THREE.Vector2()), uPx: U(2), uS: U(1), uLight2: U(new THREE.Vector2(-0.7, 0.7)),
  uBlurK: U(0), uPickLod: U(0), uRefr: U(18), uEdge: U(20), uMag: U(1), uDispL: U(0), uLip: U(0),
  uFrostL: U(0.1), uVibL: U(1.3), uBrightL: U(0), uBelow: U(0.3), uTintAmt: U(0), uTintCol: U(new THREE.Vector3(1, 0.4, 0.2)),
  uRimL: U(0.7), uRimW: U(1.4), uLensK: U(1), uIconTint: U(0.5),
  uFishTex: U(null), uFishOn: U(0),
};

// 每塊玻璃的狀態：按壓、刪除／消散、位置、果凍形變、明暗、抖動相位（重建玻璃材質時沿用）
function newState(o) {
  return {
    removed: false, hidden: false, ds: null, dragging: false, inDock: false, bubble: false, hold: false, moved: false,
    cur: new THREE.Vector2(), goal: new THREE.Vector2(), dragTo: new THREE.Vector2(), grab: new THREE.Vector2(), vel: new THREE.Vector2(),
    press: S(0), sx: S(0), sy: S(0), tone: S(0), ink: S(0), solid: S(0), pres: S(1), gA: S(1), w: S(0), h: S(0), r: S(0),
    zb: 0, nn: 0, phase: Math.random() * 6.28, mesh: null, live: null, ...o,
  };
}
const savedRemoved = load(REMOVED_KEY, []);
const ST = APPS.map((a) => { const gone = savedRemoved.includes(a.id); return newState({ app: a, inDock: a.dock, removed: gone, hidden: gone }); });
const BUB = BUBBLES.map((b) => newState({ app: b, bubble: true }));
const byId = Object.fromEntries(BUB.map((d) => [d.app.id, d]));
const MAIN = byId.menu, NEW = byId.new, WALL = byId.wall, REC = byId.rec, PANEL = byId.panel, LENS_W = byId.lens;
const KNOBS = [byId.sw1, byId.sw2, byId.sl, byId.seg];
const KIDS = [WALL, REC];
for (const k of KIDS) { k.hidden = true; k.pres = S(0); }
const ALL = [...ST, ...BUB];
const TRAY = newState({});

// 全域的動畫值：頁面、透鏡形成、開關底色、文字淡入淡出、高光飄移
const FX = {
  page: S(0), lensK: S(1), drift: S(0), rowsA: S(0), pillA: S(1),
  on1: S(P.animateWall ? 1 : 0), on2: S(P.parallax ? 1 : 0),
  seg: [S(1), S(1), S(1)],
};

// 主畫面與 Dock 的排列（拖曳換位後存起來）
const defaultOrder = () => [ST.filter((d) => !d.app.dock), ST.filter((d) => d.app.dock)];
let [orderGrid, orderDock] = defaultOrder();
{
  const saved = load(ORDER_KEY, null), find = (id) => ST.find((d) => d.app.id === id);
  if (saved?.grid && saved?.dock) {
    const g = saved.grid.map(find).filter(Boolean), k = saved.dock.map(find).filter(Boolean);
    if (new Set([...g, ...k]).size === ST.length && g.length + k.length === ST.length) { orderGrid = g; orderDock = k; }
  }
  for (const d of orderDock) d.inDock = true;
  for (const d of orderGrid) d.inDock = false;
}
const saveOrder = () => store(ORDER_KEY, { grid: orderGrid.map((d) => d.app.id), dock: orderDock.map((d) => d.app.id) });
const saveRemoved = () => store(REMOVED_KEY, ST.filter((d) => d.removed).map((d) => d.app.id));

let screenDirty = true, needsRender = true, labelsDirty = true, menuOpen = false, split = false, editMode = false, layered = false, toneDirty = true, baseStamp = 0;
const finger = new THREE.Vector2();
const dust = createDust(scene);
let tray, icons = [], bubbles = [], lastShapes = [];
const cellOf = (c) => new THREE.Vector4((c % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(c / ATLAS_COLS) + 1) / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS);
const isLens = () => P.mode === 'lens';
function buildGlass() {
  for (const m of [tray, ...icons, ...bubbles]) if (m) { scene.remove(m); m.material.dispose(); }
  const lens = isLens();
  const make = (own) => (lens ? createLens(shared, own) : createGlass(shared, own, P.quality));
  tray = make(lens ? { uHasGlyph: U(0), uGlyphHalf: U(0) } : { uHasGlyph: U(0), uGlyphZ: U(-1), uGlyphHalf: U(40) });
  tray.renderOrder = 1;
  scene.add(tray);
  icons = ST.map((d) => {
    const m = make({ uTint: U(new THREE.Vector3(...d.app.tint)), uGlyphCell: U(cellOf(d.app.cell)), uFlip: U(d.app.flip ? 1 : 0) });
    m.renderOrder = 2; m.userData = d; d.mesh = m; m.visible = !d.hidden;
    scene.add(m);
    return m;
  });
  bubbles = BUB.map((d) => {
    const own = { uTint: U(new THREE.Vector3(1, 1, 1)), uGlyphCell: U(cellOf(d.app.cell)), uFlip: U(d.app.flip ? 1 : 0), uHasGlyph: U(d.app.glyph ? 1 : 0) };
    if (lens) {
      own.uScreenTex = U(screen.texture); own.uBlurTex = U(null);       // 上層玻璃：可能改取樣下層畫好的那一張
      if (d.app.kind === 'knob') Object.assign(own, { uRefr: U(24), uBlurK: U(0), uFrostL: U(0.04), uLip: U(d.app.id === 'seg' ? 0 : 1) });   // 滑塊是比較清的透鏡
      if (d === LENS_W) own.uMag = U(1.15);
    } else own.uGlyphOpacity = U(1);
    const m = make(own);
    m.renderOrder = 3; m.userData = d; d.mesh = m; m.visible = !d.hidden;
    scene.add(m);
    return m;
  });
}
buildGlass();

// 玻璃上的文字
const INK = { rows: createInk(), pill: createInk(), clock: createInk(), seg: SEGMENTS.map(() => createInk()) };
for (const ink of [INK.rows, INK.pill, INK.clock, ...INK.seg]) scene.add(ink.mesh);

// ---------- 版面 ----------
let L = computeLayout(375, 812, 47, 34);
const safeProbe = document.getElementById('safe');
function applyLayout() {
  screenPlane.scale.set(L.W, L.H, 1);
  shared.uScreenSize.value.set(L.W, L.H);
  screen.resize(L.W, L.H, pixelRatio);
  fish.resize(L.W, L.H, pixelRatio);
  slots(true);
  placeMenu(true); placeNew(true); placeWidgets(true); placeKnobs(true);
  paintInks();
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
    if (snap || (d.removed && !d.ds)) { d.cur.copy(d.goal); d.vel.set(0, 0); }
  }
}
// 名稱與第二頁的文字都畫在螢幕層（玻璃會折射到）；拖曳中與 Dock 裡的圖示不顯示名稱
const measure = document.createElement('canvas').getContext('2d');
// 名稱底下有多亮：亮到白字看不見就換深色字（遲滯，影片桌布才不會一直閃）
function labelDark(key, x, y) {
  if (!isLens() || !tone.ready) return false;
  const lum = tone.under(x, y, 32 * L.s, 9 * L.s, L.W, L.H);
  const was = labelDarkState.get(key) || false;
  const now = was ? lum > 0.32 : lum > 0.42;
  labelDarkState.set(key, now);
  return now;
}
const labelDarkState = new Map();
function redrawOverlay() {
  const page = FX.page.x, off = -L.W * page;
  const labels = page < 0.995 ? ST.filter((d) => !d.hidden && !d.inDock && !d.dragging).map((d) => ({ label: d.app.label, x: d.cur.x + off, y: d.cur.y, dark: labelDark(d, d.cur.x + off, d.cur.y - LABEL_DY * L.s) })) : [];
  // 分裂出來的按鈕：在下半部時名稱放上面（下面是頁面點和 Dock），在上半部時放下面
  if (split) {
    const flip = NEW.cur.y < 0 ? -1 : 1;
    for (const c of [WALL, NEW, REC]) if (!c.hidden && c.pres.x > 0.7) labels.push({ label: c.app.label, x: c.cur.x, y: c.cur.y, dy: flip * 37, dark: labelDark(c, c.cur.x, c.cur.y - flip * 37 * L.s) });
  }
  if (page > 0.005) {
    const c = L.ctl, o = L.W * (1 - page);
    const row = (key, label, y) => labels.push({ label, x: c.left + o, y, dy: 0, left: true, size: 15, dark: labelDark(key, c.left + 30 * L.s, y) });
    row('sw1', c.sw1.label, c.sw1.y);
    row('sw2', c.sw2.label, c.sw2.y);
    row('sl', isLens() ? '折射' : '厚度', c.sl.y);
  }
  screen.setOverlay(drawOverlay(L, labels, pixelRatio, clamp(page, 0, 1)));
  screenDirty = true;
}
const inkFont = (size, weight = 500) => `${weight} ${size * L.s}px ${FONT}`;
function paintInks() {
  const s = L.s, pr = pixelRatio;
  // ⋯ 型變成的面板：四列文字
  const pw = panelSize().w, ph = panelSize().h, rh = 44 * s, pad = 8 * s;
  INK.rows.set(paintInk(pw, ph, pr, (c) => {
    c.font = inkFont(16);
    MENU_ROWS.forEach((t, i) => {
      c.globalAlpha = 1;
      c.fillText(t, 20 * s, pad + rh * (i + 0.5));
      if (i < MENU_ROWS.length - 1) { c.globalAlpha = 0.16; c.fillRect(16 * s, pad + rh * (i + 1) - 0.25, pw - 32 * s, 0.5); }
    });
  }), pw, ph);
  // ＋ 新增
  const nw = 116 * s, nh = 48 * s;
  INK.pill.set(paintInk(nw, nh, pr, (c) => {
    c.textAlign = 'center';
    c.lineWidth = 2 * s; c.lineCap = 'round';
    const cx = nw / 2 - 22 * s, cy = nh / 2;
    c.beginPath(); c.moveTo(cx - 7 * s, cy); c.lineTo(cx + 7 * s, cy); c.moveTo(cx, cy - 7 * s); c.lineTo(cx, cy + 7 * s); c.stroke();
    c.font = inkFont(16); c.fillText('新增', nw / 2 + 12 * s, cy + 0.5);
  }), nw, nh);
  // 分段控制的標題
  const c0 = L.ctl, sw = c0.seg.w / SEGMENTS.length;
  INK.seg.forEach((ink, i) => ink.set(paintInk(sw, c0.seg.h, pr, (c) => {
    c.textAlign = 'center'; c.font = inkFont(15, 600); c.fillText(SEGMENTS[i], sw / 2, c0.seg.h / 2 + 0.5);
  }), sw, c0.seg.h));
  paintClock();
}
// 第二頁的玻璃卡片：時間和日期
let clockKey = '';
function paintClock() {
  const now = new Date(), key = `${now.getHours()}:${now.getMinutes()}|${L.W}|${pixelRatio}`;
  if (key === clockKey) return;
  clockKey = key;
  const c0 = L.ctl.panel, s = L.s;
  const time = now.toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-Hant', { month: 'long', day: 'numeric', weekday: 'long' });
  INK.clock.set(paintInk(c0.w, c0.h, pixelRatio, (c) => {
    c.font = inkFont(42, 300); c.fillText(time, 22 * s, c0.h * 0.40);
    c.font = inkFont(14); c.globalAlpha = 0.8; c.fillText(date, 24 * s, c0.h * 0.74);
  }), c0.w, c0.h);
}

// ---------- 參數 → uniform：收集所有玻璃、算融合關係、更新陰影 ----------
const stretchOf = (d, lo, hi) => [clamp(1 + d.sx.x - 0.5 * d.sy.x, lo, hi), clamp(1 + d.sy.x - 0.5 * d.sx.x, lo, hi)];
const sizeKOf = (w, h) => (P.lSize ? clamp(Math.sqrt(Math.min(w, h) / (62 * L.s)), 0.75, 1.7) : 1);
function shapeOfIcon(d, s, pageOff) {
  const press = clamp(d.press.x, -0.2, 1.3), lens = isLens();
  const swell = 1 + (d.dragging ? 0.1 : 0) + (P.touch ? 0.07 * press : 0);
  const [sx, sy] = stretchOf(d, 0.78, 1.3);
  const hx = L.icon / 2 * swell * sx, hy = L.icon / 2 * swell * sy;
  const h = lens ? P.lLift * s : P.thickness * s * (P.touch ? 1 : 1 - 0.35 * press);
  return {
    d, st: d, m: d.mesh, x: d.cur.x + (d.inDock || d.dragging ? 0 : pageOff), y: d.cur.y, hx, hy, r: Math.min(P.radius * s * swell * Math.min(sx, sy), hx, hy), h, zb: d.zb,
    bev: Math.min(P.bevel, P.thickness, 29) * s, dome: P.dome * s, gh: L.icon / 2 * swell * (sx + sy) / 2, gz: d.zb + 0.01 + P.glyphDepth * (h + Math.min(P.dome * s, 0)) * 0.98,
    cell: d.mesh.material.uniforms.uGlyphCell.value, tint: d.app.tint, flip: d.app.flip ? 1 : 0, sizeK: sizeKOf(L.icon, L.icon),
    noMerge: !!d.ds, stacked: d.inDock && !d.dragging, mk: d.dragging ? 2 * P.merge * s : 0,
  };
}
function shapeOfBubble(d, s, pageOff) {
  const a = d.app, knob = a.kind === 'knob', press = clamp(d.press.x, -0.2, 1.3), lens = isLens();
  const swell = 1 + (knob ? 0.4 : (P.touch ? 0.08 : 0)) * press + (d.dragging && !knob ? 0.04 : 0);
  const [sx, sy] = stretchOf(d, knob ? 0.7 : 0.8, knob ? 1.5 : 1.25);
  const hx = Math.max(d.w.x, 1) / 2 * swell * sx, hy = Math.max(d.h.x, 1) / 2 * swell * sy;
  const r = Math.min(d.r.x * swell * Math.min(sx, sy), hx, hy);
  const h = lens ? P.lLift * s * 1.3 : Math.min(P.thickness, 14) * s;
  return {
    d, st: d, m: d.mesh, x: d.cur.x + (a.page ? pageOff + L.W : 0), y: d.cur.y, hx, hy, r, h, zb: 0,
    bev: Math.min(P.bevel * 0.8, P.thickness, 14) * s, dome: P.dome * s, gh: a.glyph ? a.gh * s * swell : 0, gz: 0.01 + 0.75 * (h + Math.min(P.dome * s, 0)),
    cell: d.mesh.material.uniforms.uGlyphCell.value, tint: a.tint, flip: a.flip ? 1 : 0, sizeK: sizeKOf(Math.max(d.w.t, 1), Math.max(d.h.t, 1)),
    noMerge: knob || (d === MAIN && (menuOpen || d.w.x > 90 * s)), stacked: false,
    mk: Math.max((d === NEW || a.kind === 'kid') && (split || d.pres.x < 0.999 || WALL.pres.x > 0.001) ? 30 * s : 0, d.dragging ? 2 * P.merge * s : 0),
  };
}
function fillRay(a, l, shapes, s) {
  const u = a.m.material.uniforms;
  u.uHeight.value = a.h; u.uZb.value = a.zb; u.uBevel.value = a.bev; u.uDome.value = a.dome;
  if (a.d) { u.uGlyphHalf.value = a.gh; u.uGlyphZ.value = a.gz; }
  if (a.d && a.d.bubble) u.uGlyphOpacity.value = P.glyphOpacity * clamp(a.d.gA.x, 0, 1);
  let top = a.zb + a.h + Math.max(a.dome, 0);
  l.forEach((j, n) => {
    const b = shapes[j];
    u.uNa.value[n].set(b.x - a.x, b.y - a.y, b.hx, b.hy); u.uNb.value[n].set(b.r, b.h, b.zb, b.bev); u.uNc.value[n].set(b.dome, b.gh, b.gz, 0);
    if (b.cell) u.uNg.value[n].copy(b.cell);
    top = Math.max(top, b.zb + b.h + Math.max(b.dome, 0));
  });
  return l.length ? top + u.uK.value * 0.3 + 1.5 * s : top + 1.5 * s;
}
function fillLens(a, l, shapes) {
  const u = a.m.material.uniforms, st = a.st;
  u.uHeight.value = a.zb + a.h;
  u.uTone.value = clamp(st.tone.x, 0, 1); u.uSolid.value = clamp(st.solid.x, 0, 1); u.uPresence.value = clamp(st.pres.x, 0, 1);
  u.uSizeK.value = a.sizeK; u.uInk.value = clamp(st.ink.x, 0, 1); u.uGlyphA.value = clamp(st.gA.x, 0, 1);
  if (a.d) u.uGlyphHalf.value = a.gh;
  l.forEach((j, n) => {
    const b = shapes[j], bs = b.st;
    u.uNa.value[n].set(b.x - a.x, b.y - a.y, b.hx, b.hy);
    u.uNb.value[n].set(b.r, clamp(bs.tone.x, 0, 1), clamp(bs.solid.x, 0, 1), clamp(bs.pres.x, 0, 1));
    u.uNc.value[n].set(b.gh, b.sizeK, clamp(bs.ink.x, 0, 1), b.flip);
    if (b.cell) u.uNg.value[n].copy(b.cell);
    u.uNt.value[n].set(b.tint[0], b.tint[1], b.tint[2], clamp(bs.gA.x, 0, 1));
  });
  return a.zb + a.h;
}
function updateShapes() {
  // 融合半徑：靜止的玻璃用小的，輪廓才不會被隔壁拉鼓；拖曳中的那一塊才加大（3D 模式維持原本的兩倍）
  const s = L.s, lens = isLens(), k = (lens ? 1 : 2) * P.merge * s, page = FX.page.x, pageOff = -L.W * page;
  const shapes = [{
    m: tray, d: null, st: TRAY, tray: true, x: L.dock.x, y: L.dock.y, hx: L.dock.hx, hy: L.dock.hy, r: L.dock.r, h: lens ? 1.5 * s : P.trayThickness * s, zb: 0,
    bev: Math.min(2.5, P.trayThickness * 0.6) * s, dome: 0, gh: 0, gz: -1, cell: null, tint: [1, 1, 1], flip: 0, sizeK: sizeKOf(L.dock.hx * 2, L.dock.hy * 2),
  }];
  for (const d of ST) {
    const vis = !d.hidden && (page < 0.995 || d.inDock || d.dragging);
    d.mesh.visible = vis;
    d.mesh.renderOrder = d.dragging ? 2.5 : 2;
    if (vis) shapes.push(shapeOfIcon(d, s, pageOff));
  }
  for (const d of BUB) {
    const vis = !d.hidden && (!d.app.page || page > 0.005);
    d.mesh.visible = vis;
    if (vis) shapes.push(shapeOfBubble(d, s, pageOff));
    d.mesh.renderOrder = d === MAIN && d.w.x > 80 * s ? 3.5 : 3;
  }

  lastShapes = shapes;
  const lists = mergeLists(shapes, k);
  const pressed = shapes.findIndex((a) => a.d && a.d.press.x > 0.01 && a.d.app.kind !== 'knob');
  const kFor = (a, l) => { let m = Math.max(k, a.mk || 0); for (const j of l) m = Math.max(m, shapes[j].mk || 0); return Math.max(m, 1e-3); };
  shapes.forEach((a, i) => {
    const u = a.m.material.uniforms, l = lists[i];
    u.uHalf.value.set(a.hx, a.hy); u.uRadius.value = a.r;
    if (a.d) { u.uDsProg.value = a.d.ds ? a.d.ds.prog : -1; a.d.nn = l.length; }
    u.uNn.value = l.length; u.uK.value = kFor(a, l);
    a.st.live = a; a.nb = l.map((j) => shapes[j]); a.k = u.uK.value;
    const top = lens ? fillLens(a, l, shapes) : fillRay(a, l, shapes, s);
    const margin = 1.5 * s + (l.length ? u.uK.value : 0);
    u.uBox.value.set(a.hx + margin, a.hy + margin, top);
    a.m.position.set(a.x, a.y, 0);
    u.uCenter.value.set(a.x, a.y);
    // 觸碰反應：按住的玻璃和融在一起的鄰居都一樣亮（不然交界看得到）
    const lit = pressed >= 0 && (i === pressed || lists[pressed].includes(i));
    const glow = lit ? clamp(shapes[pressed].d.press.x, 0, 1.2) : 0;
    u.uGlow.value = glow * (P.touch ? 0.35 : 1);
    if (lit && P.touch) u.uTouch.value.set(finger.x - a.x, finger.y - a.y, lens ? glow : glow * 0.8); else u.uTouch.value.set(0, 0, 0);
  });

  // 面板沒有參與融合、又蓋到下層玻璃：要多畫一層，才模糊得到底下的圖示
  layered = false;
  if (lens) {
    const top = shapes.find((a) => a.d === MAIN);
    if (top && top.noMerge) layered = shapes.some((b) => b !== top && !b.d?.bubble && Math.abs(b.x - top.x) < b.hx + top.hx && Math.abs(b.y - top.y) < b.hy + top.hy);
  }

  // 陰影用的物件（uObjC = 消散進度、圖示邊長、陰影可見度）。knob 貼著軌道，不需要陰影
  const su = screen.uniforms;
  let n = 0;
  for (const a of shapes) {
    if (a.d && a.d.app.kind === 'knob') continue;
    if (lens && a.stacked) continue;                 // 放在托盤上的圖示不投影到桌布（托盤會把陰影折射成色塊）
    if (n >= MAX_OBJ) break;
    const prog = a.d && a.d.ds ? a.d.ds.prog : -1;
    su.uObjA.value[n].set(a.x, a.y, a.hx, a.hy);
    su.uObjB.value[n].set(a.r, a.h + Math.max(a.dome, 0), a.zb, 0);
    su.uObjC.value[n].set(prog, L.icon, prog >= 0 ? 1 - clamp(prog / DS_END, 0, 1) : clamp(a.st.pres.x, 0, 1), 0);
    n++;
  }
  su.uCount.value = n;
  screenDirty = true;
  needsRender = true;
  placeInks(shapes);
}
function placeInk(ink, x, y, z, alpha, inkV) {
  const vis = alpha > 0.004;
  ink.mesh.visible = vis;
  if (!vis) return;
  ink.mesh.position.set(x, y, z);
  ink.uniforms.uAlpha.value = Math.min(alpha, 1);
  ink.uniforms.uInk.value = clamp(inkV, 0, 1);
}
function placeInks(shapes) {
  const z = isLens() ? P.lLift * L.s * 1.3 + 0.5 : Math.min(P.thickness, 14) * L.s + 2;
  const c = panelCenter();
  placeInk(INK.rows, c.x, c.y, z, FX.rowsA.x, MAIN.ink.x);
  const nl = NEW.live;
  placeInk(INK.pill, nl ? nl.x : NEW.cur.x, nl ? nl.y : NEW.cur.y, z, NEW.hidden ? 0 : FX.pillA.x, NEW.ink.x);
  INK.pill.mesh.renderOrder = 3.2;                             // 面板打開時蓋在「新增」上面
  const page = FX.page.x, off = L.W * (1 - page);
  if (page > 0.005) {
    const pl = PANEL.live, c0 = L.ctl;
    placeInk(INK.clock, pl ? pl.x : off, pl ? pl.y : c0.panel.y, z, 1, PANEL.ink.x);
    const sw = c0.seg.w / SEGMENTS.length;
    INK.seg.forEach((ink, i) => placeInk(ink, c0.seg.x - c0.seg.w / 2 + sw * (i + 0.5) + off, c0.seg.y, z, 1, FX.seg[i].x));
  } else { INK.clock.mesh.visible = false; for (const ink of INK.seg) ink.mesh.visible = false; }
}
const hexGamma = (hex, out) => { const v = parseInt(hex.slice(1), 16); return out.set((v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255); };
function sync() {
  const k = P.depth3d, s = L.s, su = screen.uniforms, lens = isLens();
  shared.uGlyphOpacity.value = P.glyphOpacity; shared.uGlyphScale.value = P.glyphScale;
  su.uLens.value = lens ? 1 : 0; su.uS.value = s;
  if (lens) {
    const pr = pixelRatio;
    shared.uRefr.value = P.lRefr * s; shared.uEdge.value = P.lEdge * s; shared.uMag.value = P.lMag; shared.uDispL.value = P.lDisp; shared.uLip.value = P.lLip ? 1 : 0;
    shared.uFrostL.value = P.lFrost; shared.uVibL.value = P.lVib; shared.uBrightL.value = P.lBright; shared.uBelow.value = P.lBelow;
    shared.uTintAmt.value = P.lTint; hexGamma(P.lTintC, shared.uTintCol.value); shared.uIconTint.value = P.lIconTint;
    shared.uRimL.value = P.lRim; shared.uRimW.value = P.lRimW * s; shared.uS.value = s; shared.uPx.value = pr;
    shared.uTexel.value.set(1 / screen.width, 1 / screen.height);
    shared.uBlurK.value = P.lBlur * pr / SIGMA0;
    shared.uPickLod.value = Math.max(0, Math.log2(12 * s * pr / SIGMA0));
    su.uShadow.value = P.lShadow; su.uContact.value = 0;
    su.uDim.value = P.lDim * smooth01((tone.mean - 0.12) / 0.25);
    for (const d of KNOBS) {
      const u = d.mesh.material.uniforms;
      u.uRefr.value = Math.max(P.lRefr, 24) * s; u.uBlurK.value = Math.min(P.lBlur, 1) * pr / SIGMA0; u.uFrostL.value = Math.min(P.lFrost, 0.04);
    }
    LENS_W.mesh.material.uniforms.uMag.value = Math.max(P.lMag, 1.15);
  } else {
    shared.uIor.value = P.ior; shared.uDisp.value = P.dispersion; shared.uFrost.value = P.frost; shared.uVib.value = P.vibrancy;
    shared.uAbsorb.value = P.absorb / s; shared.uInner.value = P.inner;
    shared.uGlyphFrost.value = P.glyphFrost; shared.uHaze.value = P.haze / s;
    shared.uRefl.value = P.refl; shared.uRim.value = P.rim * k; shared.uSpec.value = P.spec * k; shared.uEnvI.value = P.env;
    su.uIor.value = P.ior; su.uBevel.value = Math.min(P.bevel, P.thickness, 29) * s;
    su.uShadow.value = Math.min(P.shadow * k, 0.95); su.uShadowLen.value = P.shadowLen * Math.sqrt(k);
    su.uShadowSoft.value = P.shadowSoft * s; su.uContact.value = Math.min(P.contact * k, 0.9);
    su.uCaustic.value = P.caustic * k; su.uRainbow.value = Math.min(P.dispersion * 1.6, 1) * P.rainbow; su.uStar.value = P.star * k;
    su.uCausticW.value = (1.5 + Math.min(P.bevel, P.thickness) * 0.35) * s;
  }
  updateShapes();
  measureTones();
}

// ---------- 自動明暗：量每塊玻璃底下的亮度；小玻璃才翻面（Apple 的方向），大塊的固定亮色 ----------
function measureTones(snap = false) {
  if (!isLens() || !tone.ready) return;
  const dimK = screen.uniforms.uDim.value;
  const judge = (st, x, y, hx, hy, panelLike) => {
    const lum = tone.under(x, y, hx, hy, L.W, L.H);
    let t;
    if (P.lAppear === 'light') t = 0;
    else if (P.lAppear === 'dark') t = 1;
    else if (Math.min(hx, hy) * 2 > 96 * L.s) t = 0;
    else t = st.tone.t > 0.5 ? (lum < 0.22 ? 1 : 0) : (lum < 0.14 ? 1 : 0);      // 遲滯：不會在門檻附近閃
    st.tone.t = t;
    // 文字深淺看「實際透出來的亮度」：霧面越重越接近霧的顏色
    const f = Math.min(1, P.lFrost * (panelLike ? 1 : 2.5) + P.lTint * 0.5);
    const shown = (t > 0.5 ? lum * (1 - f) + 0.01 * f : lum * (1 - f) + f) * (1 - dimK * 0.8);
    const light = st.ink.t > 0.5 ? shown < 0.24 : shown < 0.16;
    st.ink.t = light ? 1 : 0;
    if (snap) { snapS(st.tone); snapS(st.ink); }
  };
  judge(TRAY, L.dock.x, L.dock.y, L.dock.hx, L.dock.hy, true);
  for (const d of ALL) {
    if (d.hidden || d.app.kind === 'knob' || !d.live) continue;
    judge(d, d.live.x, d.live.y, d.live.hx, d.live.hy, d === MAIN && menuOpen);
  }
  needsRender = true;
}

// ---------- 桌布 ----------
const wallOptions = { '流光（程式）': 'flow' };
const texLoader = new THREE.TextureLoader();
let wallVideo = null, videoT = -1, videoCbAt = 0;
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
// 影片桌布（ComfyUI 算的循環）：每個新影格才重算螢幕層
function loadVideo(url) {
  const v = document.createElement('video');
  Object.assign(v, { src: url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
  v.setAttribute('playsinline', '');
  v.addEventListener('loadeddata', () => {
    if (wallVideo !== v) return;
    screen.setWallpaper(new THREE.VideoTexture(v));
    screenDirty = true; toneDirty = true;
    if (P.animateWall) v.play().catch(() => {});
  }, { once: true });
  const onFrame = () => { if (wallVideo !== v) return; screenDirty = true; videoCbAt = performance.now(); v.requestVideoFrameCallback(onFrame); };
  if (hasRVFC) v.requestVideoFrameCallback(onFrame);
  v.load();
  return v;
}
function stopVideo() { if (wallVideo) { wallVideo.pause(); wallVideo.removeAttribute('src'); wallVideo.load(); wallVideo = null; } }
const wallFlow = new Set();             // wallpapers.json 裡標 flow 的桌布：水面加一層緩慢的流動
function setWallpaper(key) {
  screen.uniforms.uFlow.value = wallFlow.has(key) ? 1 : 0;
  if (key === 'upload') { document.getElementById('file').click(); return; }
  stopVideo();
  if (key === 'flow') { screen.setWallpaper(null); screenDirty = true; toneDirty = true; return; }
  if (/\.(webm|mp4)$/i.test(key)) { wallVideo = loadVideo(key); return; }
  texLoader.load(key, (t) => { screen.setWallpaper(t); screenDirty = true; toneDirty = true; reform(); });
}
function playWall() {
  if (wallVideo) { if (P.animateWall) wallVideo.play().catch(() => {}); else wallVideo.pause(); }
}
function useFile(f) {
  if (!f || !/^(image|video)\//.test(f.type)) return false;
  const url = URL.createObjectURL(f);
  stopVideo();
  if (f.type.startsWith('video/')) { wallVideo = loadVideo(url); reform(); return true; }
  texLoader.load(url, (t) => { screen.setWallpaper(t); screenDirty = true; toneDirty = true; reform(); });
  return true;
}
document.getElementById('file').addEventListener('change', (e) => { useFile(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); useFile(e.dataTransfer?.files?.[0]); });
addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (useFile(f)) e.preventDefault(); });
// 換材質或桌布時，透鏡從平的慢慢形成
function reform() { if (isLens() && !reduced.matches) { FX.lensK.x = 0; FX.lensK.v = 0; FX.lensK.t = 1; } }

// ---------- 面板 ----------
const gui = new GUI({ title: '玻璃主畫面' });
const fPreset = gui.addFolder('預設');
for (const name of Object.keys(PRESETS)) fPreset.add({ [name]: () => applyPreset(name) }, name);

const fLiquid = gui.addFolder('融合與觸碰');
fLiquid.add(P, 'merge', 0, 30, 0.5).name('融合距離 (pt)').onChange(sync);
fLiquid.add(P, 'jelly', 0, 2, 0.05).name('果凍感');
fLiquid.add(P, 'touch').name('觸碰反應（膨脹、發亮）').onChange(sync);

const fLens = gui.addFolder('透鏡');
fLens.add(P, 'lRefr', 0, 80, 0.5).name('折射 (pt)').onChange(() => { sync(); placeKnobs(); });
fLens.add(P, 'lEdge', 2, 80, 0.5).name('邊緣寬度 (pt)').onChange(sync);
fLens.add(P, 'lMag', 1, 1.8, 0.01).name('放大').onChange(sync);
fLens.add(P, 'lDisp', 0, 1, 0.01).name('色散').onChange(sync);
fLens.add(P, 'lLip').name('唇邊（中間縮小）').onChange(sync);
fLens.add(P, 'lSize').name('大玻璃折射更強').onChange(sync);
fLens.add(P, 'radius', 4, 30, 0.5).name('圖示圓角').onChange(sync);
fLens.add(P, 'lLift', 0, 16, 0.5).name('浮起高度（視差）').onChange(sync);
const fSurf = gui.addFolder('表面');
fSurf.add(P, 'lBlur', 0, 40, 0.5).name('模糊 (pt)').onChange(sync);
fSurf.add(P, 'lFrost', 0, 1, 0.01).name('霧面').onChange(sync);
fSurf.add(P, 'lVib', 0, 2, 0.01).name('鮮豔度').onChange(sync);
fSurf.add(P, 'lBright', -0.3, 0.3, 0.01).name('亮度').onChange(sync);
fSurf.add(P, 'lDim', 0, 0.6, 0.01).name('壓暗亮圖').onChange(sync);
fSurf.add(P, 'lAppear', { 自動: 'auto', 亮: 'light', 暗: 'dark' }).name('外觀').onChange(sync);
const fTint = gui.addFolder('色調');
fTint.add(P, 'lBelow', 0, 1, 0.01).name('透出底色').onChange(sync);
fTint.add(P, 'lTint', 0, 1, 0.01).name('染色').onChange(sync);
fTint.addColor(P, 'lTintC').name('染色顏色').onChange(sync);
fTint.add(P, 'lIconTint', 0, 1, 0.01).name('圖示玻璃色').onChange(sync);
const fLight = gui.addFolder('光線');
fLight.add(P, 'lRim', 0, 1.5, 0.01).name('邊緣光').onChange(sync);
fLight.add(P, 'lRimW', 0.3, 12, 0.1).name('邊緣光寬 (pt)').onChange(sync);
fLight.add(P, 'lAngle', -180, 180, 1).name('光源角度（135° = 左上）').onChange(() => (needsRender = true));
fLight.add(P, 'lShadow', 0, 1, 0.01).name('陰影').onChange(sync);

const fGlass = gui.addFolder('3D 玻璃');
fGlass.add(P, 'thickness', 1, 40, 0.5).name('玻璃厚度 (pt)').onChange(() => { sync(); placeKnobs(); });
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

const f3d = gui.addFolder('3D 立體強化');
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
function showFolders() {
  const lens = isLens();
  for (const f of [fLens, fSurf, fTint, fLight]) f.show(lens);
  for (const f of [fGlass, f3d]) f.show(!lens);
}
showFolders();
for (const f of [fPreset]) f.open();
for (const f of [fLiquid, fLens, fSurf, fTint, fLight, fGlass, f3d]) f.close();

const fView = gui.addFolder('體感視差');
fView.add(P, 'parallax').name(MOBILE ? '陀螺儀／拖曳視差' : '滑鼠視差').onChange(() => { placeKnobs(); FX.on2.t = P.parallax ? 1 : 0; });
fView.add(P, 'tiltAmt', 0, 30, 0.5).name('視差角度°');
fView.add(P, 'viewDist', 1.2, 8, 0.1).name('觀看距離（越小越立體）').onChange(() => (needsRender = true));
fView.add(P, 'gyroGain', 0.3, 3, 0.05).name('陀螺儀靈敏度');
fView.add(P, 'gyroRecenter', 0, 2, 0.05).name('回正速度（0 = 不回正）');
fView.add(P, 'wallDepth', 0, 1, 0.01).name('桌布景深視差').onChange(() => (needsRender = true));
fView.add(P, 'glintGain', 0, 4, 0.05).name('反光跟著傾斜').onChange(() => (needsRender = true));
fView.add(P, 'lightGain', 0, 4, 0.05).name('光影跟著傾斜').onChange(() => (needsRender = true));
fView.add(P, 'sway').name('自動擺動');
fView.add({ 重新校正: () => (gyroBase = null) }, '重新校正');
const gyroCtl = fView.add({ s: '未偵測到' }, 's').name('陀螺儀狀態').disable();
if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) fView.add({ 啟用陀螺儀: () => askGyro() }, '啟用陀螺儀');
fView.close();

const fWall = gui.addFolder('桌布');
const wallCtl = fWall.add(P, 'wallpaper', { ...wallOptions, '上傳圖片／影片…': 'upload' }).name('桌布').onChange(setWallpaper);
fWall.add(P, 'animateWall').name('桌布動畫').onChange(() => { playWall(); placeKnobs(); FX.on1.t = P.animateWall ? 1 : 0; });
fWall.close();

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
fDust.close();

const fFish = gui.addFolder('鯉魚');
fFish.add(P, 'fishOn').name('玻璃裡養魚');
fFish.add(P, 'fishCount', 0, 24, 1).name('數量');
fFish.add(P, 'fishSize', 10, 80, 0.5).name('大小 (pt)');
fFish.add(P, 'fishSpeed', 0.2, 2.5, 0.05).name('游速');
fFish.add(P, 'fishGap', 0, 1, 0.01).name('玻璃之間看得到（淡）');
fFish.close();

const fTools = gui.addFolder('工具');
fTools.add({ 存成圖片: () => savePng() }, '存成圖片');
const recCtl = fTools.add({ 錄影: () => toggleRec() }, '錄影').name('錄影／停止');
fTools.add({ 複製連結: () => copyLink() }, '複製連結').name('複製這組參數的連結');
fTools.close();

const fPerf = gui.addFolder('效能');
fPerf.add(P, 'quality', { 高: 'high', 低: 'low' }).name('3D 玻璃畫質').onChange(() => { buildGlass(); applyLayout(); });
fPerf.add(P, 'maxDpr', 1, Math.max(1, Math.min(devicePixelRatio, 3)), 0.25).name('最高解析度倍率').onChange(() => { setPixelRatio(P.maxDpr); });
const fpsCtl = fPerf.add({ fps: '—' }, 'fps').name('FPS／倍率').disable();
fPerf.close();
gui.add({ 全部重設: () => applyPreset('液態玻璃') }, '全部重設');
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
    gyroGain: P.gyroGain, gyroRecenter: P.gyroRecenter, wallDepth: P.wallDepth, glintGain: P.glintGain, lightGain: P.lightGain, jelly: P.jelly, touch: P.touch,
    fishOn: P.fishOn, fishCount: P.fishCount, fishSize: P.fishSize, fishSpeed: P.fishSpeed, fishGap: P.fishGap };
  const was = P.mode;
  Object.assign(P, DEFAULTS, PRESETS[name], keep);
  curPreset = name;
  store(PRESET_KEY, name);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  showFolders();
  if (P.mode !== was) { buildGlass(); applyLayout(); screenDirty = true; toneDirty = true; }
  else { slots(true); placeKnobs(); sync(); }
  reform();
  needsRender = true;
  labelsDirty = true;
}

// 有 assets/wallpapers.json 就加進選單，第一個當預設（ComfyUI 動畫）
fetch('assets/wallpapers.json').then((r) => (r.ok ? r.json() : [])).then((list) => {
  if (!list.length) return;
  const opts = {};
  for (const w of list) { opts[w.name] = w.file; if (w.flow) wallFlow.add(w.file); }
  wallCtl.options({ ...opts, ...wallOptions, '上傳圖片／影片…': 'upload' }).name('桌布').onChange(setWallpaper);
  P.wallpaper = list[0].file; wallCtl.updateDisplay();
  setWallpaper(P.wallpaper);
}).catch(() => {});

// ---------- 視差：陀螺儀／滑鼠／拖曳 → 眼睛相對螢幕的位置 ----------
const tiltTarget = new THREE.Vector2(), tilt = new THREE.Vector2();
let gyroBase = null, gyroOn = false, gyroT = 0, gyroShown = 0, gyroTurn = 0;
addEventListener('deviceorientation', (e) => {
  if (!MOBILE || e.beta == null || e.gamma == null) return;
  gyroOn = true;
  const now = performance.now(), dt = gyroT ? Math.min((now - gyroT) / 1000, 0.2) : 0;
  gyroT = now;
  // 橫拿手機時，左右和前後會對調：依螢幕方向轉回來
  const turn = window.screen.orientation?.angle ?? window.orientation ?? 0;
  if (turn !== gyroTurn) { gyroTurn = turn; gyroBase = null; }
  let bx = e.gamma, by = e.beta;
  if (turn === 90) [bx, by] = [by, -bx];
  else if (turn === -90 || turn === 270) [bx, by] = [-by, bx];
  else if (turn === 180) [bx, by] = [-bx, -by];
  const cur = { b: by, g: bx };
  if (!gyroBase) gyroBase = { ...cur };
  // 基準慢慢跟上目前握姿：只對「動作」有反應，拿著不動會在幾秒內回正（回正速度 = 每秒比例）
  const f = 1 - Math.exp(-dt * P.gyroRecenter);
  gyroBase.b += (cur.b - gyroBase.b) * f;
  gyroBase.g += (cur.g - gyroBase.g) * f;
  const lim = THREE.MathUtils.degToRad(P.tiltAmt);
  const k = THREE.MathUtils.degToRad(P.gyroGain);
  if (reduced.matches) tiltTarget.set(0, 0);
  else tiltTarget.set(clamp((cur.g - gyroBase.g) * k, -lim, lim), clamp((cur.b - gyroBase.b) * k, -lim, lim));
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

// ---------- ⋯：型變成面板。尺寸和位置共用同一組彈簧，釘住的角才不會動 ----------
function setBox(d, w, h, r, snap) {
  d.w.t = w; d.h.t = h; d.r.t = r;
  if (snap) { snapS(d.w); snapS(d.h); snapS(d.r); }
}
function homeOf(key, fallback, halfW, halfH) {
  const saved = load(key, null);
  return saved ? { x: clamp(saved.x * L.W, -L.W / 2 + halfW, L.W / 2 - halfW), y: clamp(saved.y * L.H, -L.H / 2 + halfH, L.H / 2 - halfH) } : fallback;
}
const capsule = () => ({ w: 64 * L.s, h: 44 * L.s });
const panelSize = () => ({ w: Math.min(220 * L.s, L.W - 40 * L.s), h: (16 + 44 * MENU_ROWS.length) * L.s, r: 26 * L.s });
const menuHome = () => homeOf(MENU_KEY, L.menu, capsule().w / 2, capsule().h / 2);
function panelCenter() {
  const home = menuHome(), cap = capsule(), pan = panelSize();
  const sx = home.x > 0 ? 1 : -1, sy = home.y > 0 ? 1 : -1;      // 釘住靠外側的那個角
  const cx = home.x + sx * (cap.w - pan.w) / 2, cy = home.y + sy * (cap.h - pan.h) / 2;
  return { x: clamp(cx, -L.W / 2 + pan.w / 2 + 8 * L.s, L.W / 2 - pan.w / 2 - 8 * L.s), y: clamp(cy, -L.H / 2 + pan.h / 2 + 8 * L.s, L.H / 2 - pan.h / 2 - 8 * L.s) };
}
function placeMenu(snap) {
  const cap = capsule(), pan = panelSize();
  if (!MAIN.dragging) MAIN.goal.copy(menuOpen ? panelCenter() : menuHome());
  if (menuOpen) setBox(MAIN, pan.w, pan.h, pan.r, snap); else setBox(MAIN, cap.w, cap.h, cap.h / 2, snap);
  MAIN.gA.t = menuOpen ? 0 : 1;
  if (snap) { MAIN.cur.copy(MAIN.goal); MAIN.vel.set(0, 0); snapS(MAIN.gA); snapS(FX.rowsA); }
}
function openMenu() { menuOpen = true; FX.rowsA.t = 1; placeMenu(); buzz(8); }
function closeMenu() { menuOpen = false; FX.rowsA.t = 0; placeMenu(); labelsDirty = true; }
function rowAt(p) {
  const c = panelCenter(), pan = panelSize(), s = L.s;
  const top = c.y + pan.h / 2 - 8 * s;
  const i = Math.floor((top - p.y) / (44 * s));
  return i >= 0 && i < MENU_ROWS.length && Math.abs(p.x - c.x) < pan.w / 2 ? i : -1;
}
function menuAction(i) {
  const id = MENU_ROWS[i];
  if (id === '編輯') { if (editMode) exitEdit(); else enterEdit(); }
  else if (id === '玻璃') toggleGui();
  else if (id === '控制頁') goPage(FX.page.t > 0.5 ? 0 : 1);
  else if (id === '重設') restoreAll(true);
}

// ---------- ＋ 新增：膠囊分裂成三顆圓，再融回去。旁邊兩顆平常藏在裡面（存在度 0、很小）----------
const newHome = () => homeOf(NEW_KEY, L.newPill, 58 * L.s, 24 * L.s);
function placeNew(snap) {
  const s = L.s, home = newHome(), d = 48 * s, gap = 66 * s;
  const cx = split ? clamp(home.x, -L.W / 2 + gap + d / 2 + 6 * s, L.W / 2 - gap - d / 2 - 6 * s) : home.x;
  if (!NEW.dragging) NEW.goal.set(cx, home.y);
  if (split) setBox(NEW, d, d, d / 2, snap); else setBox(NEW, 116 * s, d, d / 2, snap);
  NEW.gA.t = split ? 1 : 0;
  FX.pillA.t = split ? 0 : 1;
  KIDS.forEach((k, i) => {
    const dir = i ? 1 : -1;
    if (split) { k.goal.set(cx + dir * gap, home.y); setBox(k, d, d, d / 2, snap); k.pres.t = 1; k.gA.t = 1; }
    else { k.goal.set(home.x + dir * gap * 0.15, home.y); setBox(k, 8 * s, 8 * s, 4 * s, snap); k.pres.t = 0; k.gA.t = 0; }
    if (snap) { k.cur.copy(k.goal); k.vel.set(0, 0); snapS(k.pres); snapS(k.gA); k.hidden = !split; }
  });
  if (snap) { NEW.cur.copy(NEW.goal); NEW.vel.set(0, 0); snapS(NEW.gA); snapS(FX.pillA); }
}
function openSplit() {
  split = true;
  for (const k of KIDS) { k.hidden = false; k.cur.set(NEW.cur.x, NEW.cur.y); k.vel.set(0, 0); }
  placeNew(); buzz(8); labelsDirty = true;
}
function closeSplit() { split = false; placeNew(); labelsDirty = true; }
function closeFloats() { if (menuOpen) closeMenu(); if (split) closeSplit(); }

// ---------- 第二頁：玻璃卡片、透鏡、控制元件 ----------
function placeWidgets(snap) {
  const c = L.ctl;
  setBox(PANEL, c.panel.w, c.panel.h, 28 * L.s, true);
  setBox(LENS_W, c.lens.d, c.lens.d, c.lens.d / 2, true);
  if (snap) {
    PANEL.goal.set(c.panel.x, c.panel.y); PANEL.cur.copy(PANEL.goal);
    LENS_W.goal.set(c.lens.x, c.lens.y); LENS_W.cur.copy(LENS_W.goal);
  }
}
const SEG_NOW = () => { const i = SEG_PRESETS.indexOf(curPreset); return i >= 0 ? i : (isLens() ? 0 : 2); };
const sliderValue = () => (isLens() ? clamp(P.lRefr / 60, 0, 1) : clamp((P.thickness - 1) / 39, 0, 1));
function setSlider(v) {
  if (isLens()) P.lRefr = Math.round(v * 120) / 2; else P.thickness = Math.round(1 + v * 78) / 2;
  gui.controllersRecursive().forEach((ctl) => { if (ctl.property === 'lRefr' || ctl.property === 'thickness') ctl.updateDisplay(); });
  sync();
}
function placeKnobs(snap) {
  const c = L.ctl, [sw1, sw2, sl, seg] = KNOBS, S1 = c.S;
  const offX = c.sw1.w / 2 - 2 * S1 - c.kw / 2, sp = c.sl.w - c.kw, sgw = c.seg.w / SEGMENTS.length, sh = c.seg.h - 4 * S1;
  const go = (d, x, y, w, h) => {
    if (!d.hold) {
      if (!snap && Math.abs(d.goal.x - x) > 1) d.press.t = 1;     // 要移動的滑塊先變成透鏡，到了才變回實心
      d.goal.set(x, y);
    }
    setBox(d, w, h, h / 2, true);
    if (snap) { d.cur.copy(d.goal); d.vel.set(0, 0); d.press.t = 0; snapS(d.press); d.solid.t = d.app.id === 'seg' ? 0.55 : 0.92; snapS(d.solid); }
  };
  go(sw1, c.sw1.x + (P.animateWall ? offX : -offX), c.sw1.y, c.kw, c.kh);
  go(sw2, c.sw2.x + (P.parallax ? offX : -offX), c.sw2.y, c.kw, c.kh);
  go(sl, c.sl.x - sp / 2 + sliderValue() * sp, c.sl.y, c.kw, c.kh);
  go(seg, c.seg.x - c.seg.w / 2 + sgw * (SEG_NOW() + 0.5), c.seg.y, sgw - 4 * S1, sh);
  FX.seg.forEach((sp2, i) => { sp2.t = i === SEG_NOW() ? 0 : 1; if (snap) snapS(sp2); });
  FX.on1.t = P.animateWall ? 1 : 0; FX.on2.t = P.parallax ? 1 : 0;
  if (snap) { snapS(FX.on1); snapS(FX.on2); }
}
// 軌道（平的圓角矩形，畫在螢幕層）。顏色是線性值
const lin3 = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const UL = { off: lin3(0.47, 0.47, 0.5), on: lin3(0.204, 0.78, 0.349), fill: lin3(0.957, 0.945, 0.914), seg: lin3(0.11, 0.12, 0.12) };
let underKey = NaN;
function updateUnderlay() {
  const su = screen.uniforms, page = FX.page.x;
  if (page < 0.002) { if (su.uUn.value) { su.uUn.value = 0; screenDirty = true; } underKey = NaN; return; }
  const c = L.ctl, off = L.W * (1 - page);
  const [, , sl] = KNOBS;
  let n = 0;
  const put = (x, y, hx, hy, col, a) => { su.uUnA.value[n].set(x + off, y, hx, hy); su.uUnC.value[n].set(col.r, col.g, col.b, a); n++; };
  for (const [tr, on] of [[c.sw1, FX.on1.x], [c.sw2, FX.on2.x]]) {
    const t = clamp(on, 0, 1);
    put(tr.x, tr.y, tr.w / 2, tr.h / 2, { r: UL.off.r + (UL.on.r - UL.off.r) * t, g: UL.off.g + (UL.on.g - UL.off.g) * t, b: UL.off.b + (UL.on.b - UL.off.b) * t }, 0.5 + 0.5 * t);
  }
  put(c.sl.x, c.sl.y, c.sl.w / 2, c.sl.h / 2, UL.off, 0.5);
  const lx = c.sl.x - c.sl.w / 2, fx = clamp(sl.cur.x, lx, c.sl.x + c.sl.w / 2);
  put((lx + fx) / 2, c.sl.y, (fx - lx) / 2, c.sl.h / 2, UL.fill, 0.95);
  put(c.seg.x, c.seg.y, c.seg.w / 2, c.seg.h / 2, UL.seg, 0.72);
  su.uUn.value = n;
  const key = off + FX.on1.x * 3 + FX.on2.x * 7 + fx * 11;
  if (key !== underKey) { underKey = key; screenDirty = true; }
}
function ctlAt(p) {
  const c = L.ctl, off = L.W * (1 - FX.page.x), x = p.x - off, y = p.y;
  const inside = (b, pad) => Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(y - b.y) <= b.h / 2 + pad;
  if (inside(c.sw1, 10 * L.s)) return { type: 'sw', key: 'animateWall', k: KNOBS[0], b: c.sw1, x0: x, moved: false };
  if (inside(c.sw2, 10 * L.s)) return { type: 'sw', key: 'parallax', k: KNOBS[1], b: c.sw2, x0: x, moved: false };
  if (inside({ ...c.sl, h: 40 * L.s }, 6 * L.s)) return { type: 'sl', k: KNOBS[2], b: c.sl, x0: x, moved: false };
  if (inside(c.seg, 4 * L.s)) return { type: 'seg', k: KNOBS[3], b: c.seg, x0: x, moved: false };
  return null;
}
function ctlBegin(c, p) {
  c.k.hold = true; c.k.press.t = 1; c.k.solid.t = 0;
  buzz(6);
  if (c.type === 'sl') ctlMove(c, p);
}
function ctlMove(c, p) {
  const off = L.W * (1 - FX.page.x), x = p.x - off, g = L.ctl, b = c.b;
  if (Math.abs(x - c.x0) > 6 * L.s) c.moved = true;
  if (c.type === 'sw') {
    const lim = b.w / 2 - 2 * g.S - g.kw / 2;
    if (c.moved) c.k.goal.x = clamp(x, b.x - lim, b.x + lim);
  } else if (c.type === 'sl') {
    const sp = b.w - g.kw, lx = b.x - sp / 2;
    const v = clamp((x - lx) / sp, 0, 1);
    c.k.goal.x = lx + v * sp;
    setSlider(v);
  } else if (c.moved) {
    const sgw = b.w / SEGMENTS.length;
    c.k.goal.x = clamp(x, b.x - b.w / 2 + sgw / 2, b.x + b.w / 2 - sgw / 2);
  }
}
function ctlEnd(c, p) {
  const off = L.W * (1 - FX.page.x), x = p.x - off, b = c.b;
  c.k.hold = false;
  if (c.type === 'sw') {
    P[c.key] = c.moved ? x > b.x : !P[c.key];
    if (c.key === 'animateWall') playWall();
    gui.controllersRecursive().forEach((ctl) => { if (ctl.property === c.key) ctl.updateDisplay(); });
    placeKnobs();
  } else if (c.type === 'seg') {
    const i = clamp(Math.floor((x - (b.x - b.w / 2)) / (b.w / SEGMENTS.length)), 0, SEGMENTS.length - 1);
    if (SEG_PRESETS[i] !== curPreset) applyPreset(SEG_PRESETS[i]);
    placeKnobs();
  } else placeKnobs();
  buzz(6);
}
function goPage(i) { FX.page.t = i; labelsDirty = true; }

// ---------- 指標：桌機滑過 = 視差；拖曳玻璃 = 融合；左右滑 = 換頁；長按 = 編輯模式 ----------
let drag = null, holdTimer = 0;
const HOLD_MS = 400;
function toScreen(e, out) {
  const r = canvas.getBoundingClientRect();
  return out.set(e.clientX - r.left - L.W / 2, L.H / 2 - (e.clientY - r.top));
}
const tmp = new THREE.Vector2();
const onShape = (d, p, pad) => {
  const a = d.live;
  if (!a) return false;
  const qx = Math.abs(p.x - a.x) - a.hx + a.r, qy = Math.abs(p.y - a.y) - a.hy + a.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - a.r < pad;
};
function shapeAt(p) {
  const pad = 3 * L.s;
  for (const d of [...KIDS, NEW, MAIN]) if (!d.hidden && onShape(d, p, pad)) return d;
  if (FX.page.x > 0.5) for (const d of [LENS_W, PANEL]) if (onShape(d, p, pad)) return d;
  if (FX.page.x > 0.5) { for (const d of orderDock) if (!d.removed && !d.hidden && onShape(d, p, 0)) return d; return null; }
  for (const d of ST) {
    if (d.removed || d.hidden) continue;
    if (onShape(d, p, 0)) return d;
  }
  return null;
}
function startDrag(d) {
  drag.dragging = true;
  d.dragging = true;
  d.press.t = 1;
  toScreen({ clientX: drag.x, clientY: drag.y }, tmp);          // 抓取點從按下的位置算：起手很快也不會跟丟手指
  d.grab.copy(d.cur).sub(tmp);
  d.dragTo.copy(d.cur);
  labelsDirty = true;
  buzz(10);
  updateChrome();
}
function moveDrag(d, e) {
  toScreen(e, tmp).add(d.grab);
  const hw = d.bubble ? d.w.x / 2 : L.icon / 2, hh = d.bubble ? d.h.x / 2 : L.icon / 2;
  d.dragTo.set(clamp(tmp.x, -L.W / 2 + hw, L.W / 2 - hw), clamp(tmp.y, -L.H / 2 + hh, L.H / 2 - hh));
  if (!d.bubble) reorder(d);
}
function endDrag(d) {
  d.dragging = false;
  d.press.t = 0;
  d.goal.copy(d.dragTo);
  if (d === MAIN) store(MENU_KEY, { x: d.goal.x / L.W, y: d.goal.y / L.H });
  else if (d === NEW) store(NEW_KEY, { x: d.goal.x / L.W, y: d.goal.y / L.H });
  else if (!d.bubble) { slots(false); saveOrder(); }
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
  toScreen(e, finger);
  const ctl = FX.page.x > 0.5 && !menuOpen ? ctlAt(finger) : null;
  if (ctl) {
    drag = { x: e.clientX, y: e.clientY, ctl, moved: false };
    ctlBegin(ctl, finger);
    playWall();
    return;
  }
  const d = shapeAt(finger);
  drag = { x: e.clientX, y: e.clientY, d, moved: false, dragging: false, held: false, page: false, lastX: e.clientX, lastT: performance.now(), vx: 0, from: FX.page.x, t0: performance.now() };
  if (d) d.press.t = 1;
  if (!editMode && (!d || !d.bubble) && FX.page.x < 0.5) {
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
    if (drag.ctl) { ctlMove(drag.ctl, finger); return; }
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      clearTimeout(holdTimer);
      const free = d && ((d === MAIN && !menuOpen) || (d === NEW && !split) || d.app.kind === 'widget' || (!d.bubble && editMode));
      if (free) startDrag(d);
      else {
        if (d) d.press.t = 0;
        if (Math.abs(dx) > Math.abs(dy) && (!d || !d.bubble)) { drag.page = true; closeFloats(); }
      }
    }
    if (drag.page) {
      const now = performance.now(), dtm = Math.max(now - drag.lastT, 1);
      drag.vx = drag.vx * 0.6 + (e.clientX - drag.lastX) / dtm * 1000 * 0.4;
      drag.lastX = e.clientX; drag.lastT = now;
      snapS(FX.page, clamp(drag.from - dx / L.W, -0.06, 1.06));
      labelsDirty = true; needsRender = true;
    } else if (drag.dragging) moveDrag(d, e);
    else if (drag.moved && !d && MOBILE && !gyroOn && !reduced.matches) {
      const lim = THREE.MathUtils.degToRad(P.tiltAmt);
      tiltTarget.set(clamp(dx / r.width * 2, -1, 1) * lim, clamp(-dy / r.height * 2, -1, 1) * lim);
    }
  } else if (!MOBILE) {
    const lim = THREE.MathUtils.degToRad(P.tiltAmt);
    tiltTarget.set(clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5) * lim,
      clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5) * lim);
  }
});
function tap(d) {
  if (d === MAIN) {
    if (menuOpen) { const i = rowAt(finger); closeMenu(); if (i >= 0) menuAction(i); }
    else { if (split) closeSplit(); openMenu(); }
  } else if (d === NEW) {
    if (split) { closeSplit(); setTimeout(savePng, 420); }      // 等玻璃收回去再截圖
    else { if (menuOpen) closeMenu(); openSplit(); }
  } else if (d && d.app.kind === 'kid') {
    closeSplit();
    if (d === WALL) document.getElementById('file').click(); else setTimeout(toggleRec, 420);
  } else if (menuOpen || split) closeFloats();
  else if (d && !d.bubble && !editMode) fish.call(d);               // 點圖示：附近的鯉魚游過來（以為要餵食）
  else if (!d) {
    if (editMode) exitEdit();                                    // 編輯模式點空白 = 完成
    else if (MOBILE && !gui._hidden) gui.hide();
  }
}
const release = () => {
  clearTimeout(holdTimer);
  if (!drag) return;
  if (drag.ctl) { ctlEnd(drag.ctl, finger); drag = null; return; }
  const d = drag.d;
  if (d) d.press.t = 0;
  if (drag.page) {
    const vx = drag.vx, cur = FX.page.x;
    goPage(vx < -300 ? 1 : vx > 300 ? 0 : (cur > 0.5 ? 1 : 0));
    FX.page.v = -vx / L.W * 0.5;
  } else if (drag.dragging) endDrag(d);
  else if (!drag.moved && !drag.held) tap(d);
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
  ST.forEach((d, i) => { badges[i].hidden = !editMode || d.removed || d.dragging || (!d.inDock && FX.page.x > 0.5); });
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
// 還原被刪的圖示（反著掃回來）；resetOrder = 連排列和浮動玻璃的位置都回預設
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
    store(MENU_KEY, null); store(NEW_KEY, null);
    placeMenu(); placeNew();
  }
  slots(false);
  for (const d of ST) if (d.ds && d.ds.dir < 0) d.cur.copy(d.goal);
  saveRemoved(); saveOrder();
  labelsDirty = true;
  updateChrome();
  updateShapes();
}

// ---------- 工具：存圖、錄影、連結 ----------
const recBar = document.getElementById('recbar');
let toastTimer = 0;
function toast(msg, ms = 2600) {
  if (rec) return;
  clearTimeout(toastTimer);
  recBar.textContent = msg; recBar.hidden = false;
  toastTimer = setTimeout(() => { if (!rec) recBar.hidden = true; }, ms);
}
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
async function deliver(blob, name) {
  // 手機用系統分享（可以直接存進相簿）；桌機下載
  if (MOBILE && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function savePng() {
  needsRender = true;
  renderFrame(performance.now());
  canvas.toBlob((b) => { if (b) { deliver(b, `glass-home-${stamp()}.png`); toast('已存成圖片'); } }, 'image/png');   // 同一個工作內讀，畫面還在
}
const REC_TYPES = [['video/mp4;codecs=avc1.640033', 'mp4'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4'], ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm']];
let rec = null, recT0 = 0, recChunks = [], recExt = 'mp4', recTick = 0;
function toggleRec() {
  if (rec) { rec.stop(); return; }
  if (typeof MediaRecorder !== 'function' || !canvas.captureStream) { toast('這個瀏覽器不能錄影'); return; }
  const type = REC_TYPES.find(([t]) => MediaRecorder.isTypeSupported(t));
  if (!type) { toast('這個瀏覽器不能錄影'); return; }
  // H.264 要偶數尺寸：解析度倍率先取整數
  if (pixelRatio % 1) setPixelRatio(Math.max(1, Math.round(pixelRatio)));
  recExt = type[1]; recChunks = [];
  const stream = canvas.captureStream(60);
  const mr = new MediaRecorder(stream, { mimeType: type[0], videoBitsPerSecond: 14e6 });
  mr.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(recTick);
    rec = null;
    recBar.hidden = true;
    deliver(new Blob(recChunks, { type: type[0].split(';')[0] }), `glass-home-${stamp()}.${recExt}`);
    toast('錄影完成');
  };
  mr.start();
  rec = mr; recT0 = performance.now();
  const show = () => {
    const sec = (performance.now() - recT0) / 1000;
    recBar.textContent = `● ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}　點這裡停止`;
    if (sec > 60 && rec) rec.stop();
  };
  show();
  recTick = setInterval(show, 250);
  clearTimeout(toastTimer);
  recBar.hidden = false;
}
recBar.addEventListener('click', () => { if (rec) rec.stop(); });
addEventListener('keydown', (e) => { if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && e.target === document.body) toggleRec(); });
async function copyLink() {
  const url = linkURL();
  try { await navigator.clipboard.writeText(url); toast('已複製連結'); }
  catch { history.replaceState(null, '', url); toast('網址列已換成這組參數，可以直接複製'); }
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
// 只換解析度（自動升降用）：版面和動畫都不動
function setPixelRatio(v) {
  pixelRatio = v;
  renderer.setPixelRatio(v);
  renderer.setSize(L.W, L.H, false);
  screen.resize(L.W, L.H, v);
  fish.resize(L.W, L.H, v);
  paintInks();
  labelsDirty = true; screenDirty = true; needsRender = true;
  sync();
}
addEventListener('resize', resize);
reduced.addEventListener?.('change', () => { if (reduced.matches) tiltTarget.set(0, 0); });
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
  if (lightLocal.distanceToSquared(lastLight) > 1e-7) { su.uLight.value.copy(lightLocal); lastLight.copy(lightLocal); if (!isLens()) screenDirty = true; }
  // 透鏡模式：手機傾斜和拖曳的速度讓高光繞著玻璃走
  const dx = THREE.MathUtils.radToDeg(tilt.x), dy = THREE.MathUtils.radToDeg(tilt.y);
  const ang = THREE.MathUtils.degToRad(P.lAngle + clamp(dx * 2 - dy, -80, 80) * P.lightGain + FX.drift.x);
  shared.uLight2.value.set(Math.cos(ang), Math.sin(ang));
}

// ---------- 每塊玻璃的動畫：位置、果凍形變、按壓、尺寸、明暗 ----------
function animate(d, dt) {
  if (dt <= 0) return false;
  const a = d.app, knob = a.kind === 'knob', n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
  const role = d.dragging || d.hold ? 'follow' : a.kind === 'kid' ? 'peel' : d.bubble ? 'morph' : 'move';
  const [mk, mc] = tune(role), [pk, pc] = tune('press'), [sk, sc] = tune('stretch'), [tk, tc] = tune('tone'), [ik, ic] = tune('ink'), [fk, fc] = tune('fade'), [zk, zc] = tune('morph'), [ek, ec] = tune('peel');
  const goal = d.dragging ? d.dragTo : d.goal, jelly = reduced.matches ? 0 : P.jelly;
  const V = (knob ? 1300 : 1500) * L.s, lim = knob ? 0.42 : 0.22;
  const px = d.cur.x, py = d.cur.y;
  for (let i = 0; i < n; i++) {
    d.vel.x += (-mk * (d.cur.x - goal.x) - mc * d.vel.x) * h; d.vel.y += (-mk * (d.cur.y - goal.y) - mc * d.vel.y) * h;
    d.cur.x += d.vel.x * h; d.cur.y += d.vel.y * h;
    d.sx.t = clamp(Math.abs(d.vel.x) / V * jelly, 0, lim); d.sy.t = clamp(Math.abs(d.vel.y) / V * jelly, 0, lim);
    stepS(d.sx, sk, sc, h); stepS(d.sy, sk, sc, h);
    stepS(d.press, pk, pc, h);
    stepS(d.tone, tk, tc, h); stepS(d.ink, ik, ic, h);
    stepS(d.solid, fk, fc, h); stepS(d.gA, fk, fc, h);
    if (d.bubble) {
      stepS(d.w, zk, zc, h); stepS(d.h, zk, zc, h); stepS(d.r, zk, zc, h);
      stepS(d.pres, ek, ec, h);
    }
  }
  if (d.cur.distanceToSquared(goal) < 0.01 && d.vel.lengthSq() < 1) { d.cur.copy(goal); d.vel.set(0, 0); }
  d.moved = d.cur.x !== px || d.cur.y !== py;
  let active = d.moved;
  const sps = d.bubble ? [d.sx, d.sy, d.press, d.tone, d.ink, d.solid, d.gA, d.w, d.h, d.r, d.pres] : [d.sx, d.sy, d.press, d.tone, d.ink, d.solid, d.gA];
  for (const sp of sps) { if (atRest(sp)) snapS(sp); else active = true; }
  if (knob) {                                // 被移動的滑塊到了就變回實心；還在動或按著都是透鏡
    if (!d.hold && d.press.t > 0 && Math.abs(d.cur.x - d.goal.x) < 1.5 && Math.abs(d.vel.x) < 40) d.press.t = 0;
    d.solid.t = d.hold || d.press.t > 0 ? 0 : a.id === 'seg' ? 0.55 : 0.92;
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
function stepFX(dt) {
  const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
  const [pk, pc] = tune('page'), [lk, lc] = tune('lens'), [fk, fc] = tune('fade'), [dk, dc] = tune('drift');
  const [ik, ic] = tune('fadeIn'), [ok, oc] = tune('fadeOut'), [nk, nc] = tune('ink');
  const pageDragged = drag && drag.page;
  const fv = MAIN.dragging ? MAIN.vel.x : NEW.dragging ? NEW.vel.x : LENS_W.dragging ? LENS_W.vel.x : PANEL.dragging ? PANEL.vel.x : ST.find((d) => d.dragging)?.vel.x || 0;
  FX.drift.t = reduced.matches ? 0 : clamp(fv / 60, -18, 18);
  for (let i = 0; i < n; i++) {
    if (!pageDragged) stepS(FX.page, pk, pc, h);
    stepS(FX.lensK, lk, lc, h);
    stepS(FX.on1, fk, fc, h); stepS(FX.on2, fk, fc, h);
    stepS(FX.drift, dk, dc, h);
    const [rk, rc] = FX.rowsA.t > FX.rowsA.x ? [ik, ic] : [ok, oc];
    stepS(FX.rowsA, rk, rc, h);
    const [mk, mc] = FX.pillA.t > FX.pillA.x ? [ik, ic] : [ok, oc];
    stepS(FX.pillA, mk, mc, h);
    for (const sp of FX.seg) stepS(sp, nk, nc, h);
  }
  let active = false;
  for (const sp of [FX.page, FX.lensK, FX.on1, FX.on2, FX.drift, FX.rowsA, FX.pillA, ...FX.seg]) { if (atRest(sp)) snapS(sp); else active = true; }
  return active;
}

// ---------- 自動解析度：先量出螢幕真正的更新率，才判斷慢不慢 ----------
// 閒置幀（rAF 有跳但沒有重畫）才代表螢幕節奏；iPhone 低電量模式 30 Hz 不會被當成 GPU 太慢。慢了降、順了升，升完又掉就拉長等待
const idleDts = [];
let refresh = 1 / 60, slowT = 0, fastT = 0, upWait = 1, raisedAt = -1e9, bootAt = performance.now();
function noteIdle(dt) {
  if (dt < 0.004 || dt > 0.1) return;
  idleDts.push(dt);
  if (idleDts.length > 9) idleDts.shift();
  refresh = [...idleDts].sort((a, b) => a - b)[idleDts.length >> 1];
}
function adapt(dt, now) {
  if (dt > 0.1 || rec) return;
  if (idleDts.length < 5 && now - bootAt < 8000) return;           // 還不知道螢幕節奏：先別判斷
  if (dt > Math.max(0.02, refresh * 1.75)) { slowT += dt; fastT = 0; }
  else { slowT = Math.max(0, slowT - dt * 0.5); fastT = dt < refresh * 1.5 ? fastT + dt : 0; }
  if (slowT > 0.4 && pixelRatio > 1) {
    if (now - raisedAt < 2000) upWait = Math.min(8, upWait * 2);
    slowT = fastT = 0;
    setPixelRatio(Math.max(1, pixelRatio - 0.25));
  } else if (fastT > upWait && pixelRatio < P.maxDpr) {
    fastT = 0; raisedAt = now;
    setPixelRatio(Math.min(P.maxDpr, pixelRatio + 0.25));
  }
}

// ---------- 迴圈：有變化才重畫 ----------
let last = performance.now(), lastOverlay = 0, fpsAcc = 0, fpsN = 0, prevRendered = false, toneAt = 0, lumAt = 0, firstTone = true, clockAt = 0, fishWas = false;
document.addEventListener('visibilitychange', () => { prevRendered = false; last = performance.now(); });
function step(now) {
  const raw = (now - last) / 1000, dt = Math.min(raw, 0.1);
  last = now;
  const t = now / 1000;
  if (!P.parallax || reduced.matches) tiltTarget.set(0, 0);
  const sway = P.sway && !reduced.matches;
  const tx = sway ? Math.sin(t * 0.9) * THREE.MathUtils.degToRad(P.tiltAmt) * 0.7 : tiltTarget.x;
  const ty = sway ? Math.sin(t * 0.63 + 1) * THREE.MathUtils.degToRad(P.tiltAmt) * 0.5 : tiltTarget.y;
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
  // 分裂的小泡：收回去、存在度掉到 0 就不畫了
  for (const k of KIDS) {
    if (k.hidden) continue;
    if (!split && k.pres.x < 0.01) { k.hidden = true; active = true; }
  }
  const page0 = FX.page.x;
  if (stepFX(dt)) { active = true; needsRender = true; }
  if (FX.page.x !== page0) { labelsDirty = true; if (editMode) updateChrome(); }
  shared.uLensK.value = clamp(FX.lensK.x, 0, 1.2);
  for (const d of ALL) {
    if (d.hidden || (d.app.page && FX.page.x < 0.005 && !d.dragging) || !animate(d, dt)) continue;
    active = true;
    if (d.moved && (d.bubble ? (split && !d.app.page) : (!d.inDock && !d.dragging))) labelsDirty = true;   // 有名稱的玻璃移動了才重畫文字
  }
  if (TRAY.tone.t !== TRAY.tone.x || TRAY.ink.t !== TRAY.ink.x) {
    const [tk, tc] = tune('tone'), [ik, ic] = tune('ink'), n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let i = 0; i < n; i++) { stepS(TRAY.tone, tk, tc, h); stepS(TRAY.ink, ik, ic, h); }
    if (atRest(TRAY.tone)) snapS(TRAY.tone);
    if (atRest(TRAY.ink)) snapS(TRAY.ink);
    active = true;
  }
  // 編輯模式抖動（每顆相位不同；正在融合或拖曳的不抖，交界才算得準）
  if (editMode && !reduced.matches) {
    for (const m of icons) {
      const d = m.userData;
      const r = d.removed || d.dragging || d.nn > 0 ? 0 : Math.sin(t * 15 + d.phase) * 0.03;
      m.rotation.z = r; m.material.uniforms.uRot.value = r;
    }
    needsRender = true;
  }
  updateUnderlay();
  // 鯉魚：從 Dock 的圖示出現，一排一排往上游過圖示（只在玻璃裡看得到）
  const fishDocks = ST.filter((d) => d.inDock && !d.removed && !d.hidden);
  const fishTargets = [...ST.filter((d) => !d.inDock && !d.removed && !d.hidden), MAIN, NEW, PANEL, LENS_W];
  const fishGlass = lastShapes.filter((a) => !(a.d && a.d.app.kind === 'knob'));
  const fishLive = fish.update(dt, { docks: fishDocks, targets: fishTargets, glass: fishGlass, dockY: L.dock.y, dockHalfW: L.dock.hx, n: P.fishOn ? P.fishCount : 0, size: P.fishSize, speed: reduced.matches ? 0.4 * P.fishSpeed : P.fishSpeed, s: L.s, finger, pressing: !!drag && !drag.page && !drag.ctl, pressMs: drag && drag.t0 ? performance.now() - drag.t0 : 0, gapAlpha: P.fishOn ? P.fishGap : 0 });
  shared.uFishOn.value = fishLive ? 1 : 0;
  if (fishLive || fishWas) needsRender = true;
  fishWas = fishLive;
  // WebKit 有時會讓影格回呼停掉：播放中超過 250 ms 沒回呼，就改看 currentTime
  if (wallVideo && wallVideo.readyState >= 2 && (!hasRVFC || (!wallVideo.paused && performance.now() - videoCbAt > 250)) && wallVideo.currentTime !== videoT) { videoT = wallVideo.currentTime; screenDirty = true; }
  // 文字層重畫要上傳整張貼圖：動畫中最多每秒 30 次，最後一格一定會補上
  if (labelsDirty && now - lastOverlay >= 33) { redrawOverlay(); labelsDirty = false; lastOverlay = now; }
  if (active) {
    updateShapes();
    if (now - toneAt > 120) { toneAt = now; measureTones(); }   // 玻璃移動時，明暗跟著更新
  }
  if (dust.update(dt)) needsRender = true;
  if (FX.page.x > 0.005 && now - clockAt > 1000) { clockAt = now; paintClock(); }

  if (P.animateWall && screen.uniforms.uWallMode.value < 0.5) { screen.uniforms.uTime.value = t; screenDirty = true; }
  else if (P.animateWall && screen.uniforms.uFlow.value > 0) screen.uniforms.uTime.value = t;   // 水流跟著影片的影格更新，不多重畫
  if (screenDirty) needsRender = true;
  if (rec) needsRender = true;                                  // 錄影時每一幀都畫，影片才是均勻的
  if (!needsRender) {
    noteIdle(raw);                                              // 重畫後的第一個閒置幀也算（24 fps 影片時兩個閒置幀很少連著）
    prevRendered = false;
    return false;
  }
  renderFrame(now);

  // 連續重畫時才知道一幀多久
  if (prevRendered) {
    fpsAcc += dt; fpsN++;
    adapt(raw, now);
    if (fpsN >= 30) { fpsCtl.setValue(`${Math.round(fpsN / fpsAcc)} / ${pixelRatio}x（螢幕 ${Math.round(1 / refresh)} Hz）`); fpsAcc = 0; fpsN = 0; }
  }
  prevRendered = true;
  return true;
}
function renderFrame(now) {
  const lens = isLens();
  updateCamera();
  if (screenDirty) {
    screen.render();
    if (lens) {
      const maxLod = Math.max(Math.log2(Math.max(shared.uBlurK.value, 1)), shared.uPickLod.value);
      pyramid.build(screen.texture, screen.width, screen.height, maxLod);
      shared.uBlurTex.value = pyramid.texture;
      if (toneDirty || now - lumAt > 500) {
        lumAt = now; toneDirty = false;
        tone.capture(screen.texture, () => {
          screen.uniforms.uDim.value = P.lDim * smooth01((tone.mean - 0.12) / 0.25);
          measureTones(firstTone);
          firstTone = false;
          screenDirty = true;
          labelsDirty = true;
        });
      }
    }
    screenDirty = false;
  }
  shared.uLodScreen.value = 0;
  shared.uLodGlyph.value = Math.max(0, Math.log2(240 / (L.icon * pixelRatio)));
  fish.render();
  shared.uFishTex.value = fish.texture;
  if (lens) {
    let sTex = screen.texture, bTex = pyramid.texture;
    if (layered) {
      // 面板底下的圖示要被模糊到：先畫沒有上層玻璃的畫面，再從那一張建金字塔
      const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (!baseRT || baseRT.width !== buf.x || baseRT.height !== buf.y) {
        baseRT?.dispose();
        baseRT = new THREE.WebGLRenderTarget(buf.x, buf.y, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      }
      const top = [...bubbles, INK.rows.mesh, INK.pill.mesh, INK.clock.mesh, ...INK.seg.map((i) => i.mesh)];
      const was = top.map((m) => m.visible);
      for (const m of top) m.visible = false;
      renderer.setRenderTarget(baseRT);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      top.forEach((m, i) => { m.visible = was[i]; });
      basePyramid.build(baseRT.texture, baseRT.width, baseRT.height, Math.max(Math.log2(Math.max(shared.uBlurK.value, 1)), shared.uPickLod.value));
      sTex = baseRT.texture; bTex = basePyramid.texture;
      baseStamp++;
    }
    for (const m of bubbles) { const u = m.material.uniforms; u.uScreenTex.value = sTex; u.uBlurTex.value = bTex; }
  }
  renderer.render(scene, camera);
  needsRender = false;
  if (editMode) placeBadges();
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
window.__app = {
  camera, shared, screen, renderer, step, setWallpaper, tilt, tiltTarget, get icons() { return icons; }, ST, BUB, MAIN, NEW, KIDS, KNOBS, PANEL, LENS_W, TRAY, FX, tone, deleteIcon, restoreAll, enterEdit, exitEdit,
  fish, openMenu, closeMenu, openSplit, closeSplit, goPage, applyPreset, measureTones, placeKnobs, savePng, toggleRec, linkURL, useFile, setPixelRatio, adapt, noteIdle, ctlAt, ctlBegin, ctlMove, ctlEnd, rowAt, shapeAt,
  get L() { return L; }, get orderGrid() { return orderGrid; }, get orderDock() { return orderDock; }, get refresh() { return refresh; }, get pixelRatio() { return pixelRatio; }, get layered() { return layered; }, get menuOpen() { return menuOpen; }, get split() { return split; }, get curPreset() { return curPreset; }, get rec() { return rec; }, get baseStamp() { return baseStamp; },
};
updateChrome();
