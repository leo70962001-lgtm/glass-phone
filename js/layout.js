// 版面：單位 = CSS px（= pt），原點在螢幕中心，y 朝上。
// 以 iPhone X（375×812）參考圖量到的版面為基準，依螢幕寬縮放 s，列距依可用高度收縮，避開瀏海／Home 條（safe area）。
export const ICON = 60;               // 設計尺寸（375 寬時）
export const LABEL_DY = 45;           // 圖示中心 → 名稱中心

const GRID = [
  ['mail', 'Mail'], ['calendar', 'Calendar'], ['photos', 'Photos'], ['camera', 'Camera'],
  ['maps', 'Maps'], ['clock', 'Clock'], ['weather', 'Weather'], ['news', 'News'],
  ['home', 'Home'], ['notes', 'Notes'], ['stocks', 'Stocks'], ['reminders', 'Reminders'],
  ['tv', 'TV'], ['appstore', 'App Store'], ['itunes', 'iTunes Store'], ['ibooks', 'iBooks'],
  ['health', 'Health'], ['wallet', 'Wallet'], ['settings', 'Settings'],
];
const DOCK_APPS = [['phone', 'Phone'], ['safari', 'Safari'], ['messages', 'Messages'], ['music', 'Music']];

// tint = 玻璃本體的顏色（吸收），glyph 在 glyphs.js
const TINT = {
  phone: [0.55, 0.92, 0.6],
  messages: [0.78, 0.86, 0.32],
  music: [1.0, 0.62, 0.78],
  appstore: [0.85, 0.92, 1.0],
  itunes: [0.93, 0.82, 1.0],
};
// 透鏡模式：單色筆畫的圖案會依底下明暗換深淺；其他圖案本身就有顏色，維持原樣
const FLIP = new Set(['mail', 'calendar', 'camera', 'stocks', 'reminders', 'appstore', 'settings', 'phone', 'messages', 'menu', 'new', 'wall', 'rec']);

export const APPS = [
  ...GRID.map(([id, label]) => ({ id, label, dock: false })),
  ...DOCK_APPS.map(([id, label]) => ({ id, label, dock: true })),
].map((a, i) => ({ ...a, cell: i, tint: TINT[a.id] || [1, 1, 1], flip: FLIP.has(a.id) }));

// 浮在主畫面上的玻璃。kind：menu = ⋯ 型變成面板；new = ＋ 新增，分裂成三顆；kid = 分裂出來的按鈕；
// widget = 第二頁可拖曳的玻璃；knob = 第二頁控制元件的滑塊。glyph = 圖集裡要畫的圖案，draw = 畫哪一個
export const BUBBLES = [
  { id: 'menu', kind: 'menu', glyph: true, gh: 21 },
  { id: 'new', kind: 'new', glyph: true, draw: 'shot', gh: 21, label: '截圖' },
  { id: 'wall', kind: 'kid', glyph: true, gh: 21, label: '桌布' },
  { id: 'rec', kind: 'kid', glyph: true, gh: 21, label: '錄影' },
  { id: 'panel', kind: 'widget', page: 1 },
  { id: 'lens', kind: 'widget', page: 1 },
  { id: 'sw1', kind: 'knob', page: 1 },
  { id: 'sw2', kind: 'knob', page: 1 },
  { id: 'sl', kind: 'knob', page: 1 },
  { id: 'seg', kind: 'knob', page: 1 },
].map((b, i) => ({ ...b, cell: APPS.length + i, tint: [1, 1, 1], flip: FLIP.has(b.id) }));

export const MENU_ROWS = ['編輯', '玻璃', '控制頁', '重設'];
export const SEGMENTS = ['液態', '清透', '3D'];

// W×H 螢幕、上下安全區 → 格位。grid(i) = 第 i 個主畫面格位；dockSlot(i, n) = Dock 裡 n 顆時第 i 顆（置中排）
export function computeLayout(W, H, safeTop, safeBottom) {
  const s = Math.min(W / 375, 1.3);
  const icon = ICON * s;
  const gap = (W - 4 * icon) / 5;
  const colX = [0, 1, 2, 3].map((i) => -W / 2 + gap * (i + 1) + icon * (i + 0.5));
  // 由上往下的座標（td），最後換成 y 朝上
  const row1 = Math.max(safeTop, 20 * s) + 62 * s;
  const dockC = H - (49 * s + Math.max(safeBottom * 0.32, 10 * s));
  const dockTop = dockC - 49 * s;
  const dots = dockTop - 16 * s;
  const pitch = Math.min(104.7 * s, (dots - 64 * s - row1) / 4);
  const Y = (td) => H / 2 - td;

  // 第二頁：玻璃卡片、開關、滑桿、分段；iOS 26 的比例（開關 64×28、滑塊 38×24）放大一點，透鏡才看得到
  const S = 1.1 * s, fit = Math.min(1, (dots - 30 * s - row1) / (500 * s));
  const yy = (td) => Y(row1 + td * s * fit);
  const left = -W / 2 + 28 * s, right = W / 2 - 28 * s;
  const ctl = {
    S, kw: 38 * S, kh: 24 * S, left, right,
    panel: { x: 0, y: yy(46), w: W - 40 * s, h: 116 * s },
    sw1: { x: right - 32 * S, y: yy(158), w: 64 * S, h: 28 * S, label: '桌布動畫' },
    sw2: { x: right - 32 * S, y: yy(214), w: 64 * S, h: 28 * S, label: '體感視差' },
    sl: { x: (left + 62 * s + right) / 2, y: yy(272), w: right - left - 62 * s, h: 6 * S },
    seg: { x: 0, y: yy(336), w: right - left, h: 38 * S },
    lens: { x: 0, y: yy(438), d: 112 * s },
  };

  return {
    W, H, s, icon,
    grid: (i) => ({ x: colX[i % 4], y: Y(row1 + pitch * Math.floor(i / 4)) }),
    dockSlot: (i, n) => ({ x: (i - (n - 1) / 2) * (icon + gap), y: Y(dockC) }),
    dock: { x: 0, y: Y(dockC), hx: (W - 21 * s) / 2, hy: 49 * s, r: 38 * s },
    menu: { x: colX[3], y: Y(dockTop - 50 * s) },          // 離托盤 28 pt：預設融合距離下不相連，拖近一點就融合
    newPill: { x: (colX[0] + colX[1]) / 2, y: Y(dockTop - 50 * s) },
    dotsY: Y(dots),
    ctl,
  };
}
