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
const DOCK_APPS = ['phone', 'safari', 'messages', 'music'];

// tint = 玻璃本體的顏色（吸收），glyph 在 glyphs.js
const TINT = {
  phone: [0.55, 0.92, 0.6],
  messages: [0.78, 0.86, 0.32],
  music: [1.0, 0.62, 0.78],
  appstore: [0.85, 0.92, 1.0],
  itunes: [0.93, 0.82, 1.0],
};

export const APPS = [
  ...GRID.map(([id, label]) => ({ id, label, dock: false })),
  ...DOCK_APPS.map((id) => ({ id, label: '', dock: true })),
].map((a, i) => ({ ...a, cell: i, tint: TINT[a.id] || [1, 1, 1] }));

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
  return {
    W, H, s, icon,
    grid: (i) => ({ x: colX[i % 4], y: Y(row1 + pitch * Math.floor(i / 4)) }),
    dockSlot: (i, n) => ({ x: (i - (n - 1) / 2) * (icon + gap), y: Y(dockC) }),
    dock: { x: 0, y: Y(dockC), hx: (W - 21 * s) / 2, hy: 49 * s, r: 28 * s },
    dotsY: Y(dots),
  };
}
