// 圖示 glyph 圖集（印在玻璃內部的那一層）與螢幕 UI 疊層（狀態列、名稱、瀏海）。
// glyph 格：256 px = 60 pt 的方塊；內容畫在中間 240 px（四周留 8 px 防 mipmap 滲色）。
import { APPS, LABEL_DY } from './layout.js';
export { FONT };

export const CELL = 256;
export const ATLAS_COLS = 6;
export const ATLAS_ROWS = 4;
const FROST = 'rgba(255,255,255,0.86)';
const FROST_FILL = 'rgba(255,255,255,0.26)';
const FONT = '"SF Pro Text", "-apple-system", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}
function line(c, pts) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
}
function frostStroke(c, w = 7) {
  c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = FROST;
}

const G = {
  mail(c) {
    rr(c, 46, 70, 164, 116, 12); c.fillStyle = FROST_FILL; c.fill(); frostStroke(c); c.stroke();
    line(c, [50, 76, 128, 140, 206, 76]); c.stroke();
    line(c, [50, 182, 106, 126]); c.stroke();
    line(c, [206, 182, 150, 126]); c.stroke();
  },
  calendar(c) {
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(255,236,242,0.95)'; c.font = `600 38px ${FONT}`; c.fillText('Tuesday', 128, 62);
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.font = `200 136px ${FONT}`; c.fillText('12', 128, 200);
  },
  photos(c) {
    const cols = ['#f6a23a', '#f7d43c', '#a9d548', '#5cc47c', '#45b5cc', '#6b7fdc', '#a96bd0', '#ec6491'];
    c.save(); c.translate(128, 128);
    for (let k = 0; k < 8; k++) {
      c.save(); c.rotate(k * Math.PI / 4);
      c.beginPath(); c.ellipse(0, -46, 26, 46, 0, 0, Math.PI * 2);
      c.fillStyle = cols[k]; c.globalAlpha = 0.8; c.fill(); c.restore();
    }
    c.restore(); c.globalAlpha = 1;
  },
  camera(c) {
    frostStroke(c);
    rr(c, 70, 62, 52, 28, 8); c.fillStyle = FROST_FILL; c.fill(); c.stroke();
    rr(c, 42, 84, 172, 112, 20); c.fill(); c.stroke();
    circle(c, 128, 140, 36); c.stroke();
    c.lineWidth = 4; circle(c, 128, 140, 22); c.stroke();
    circle(c, 186, 108, 7); c.fillStyle = FROST; c.fill();
  },
  maps(c) {
    c.save(); rr(c, 0, 0, 256, 256, 58); c.clip();
    c.fillStyle = '#cde7ad'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#8fd0f2'; line(c, [140, 0, 256, 0, 256, 120, 200, 90, 170, 40]); c.closePath(); c.fill();
    c.fillStyle = '#98d27a'; line(c, [0, 0, 90, 0, 60, 70, 0, 96]); c.closePath(); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 16; line(c, [150, -10, 120, 120, 96, 270]); c.stroke();
    c.strokeStyle = '#f5cf55'; c.lineWidth = 22; c.beginPath(); c.moveTo(-10, 196); c.bezierCurveTo(80, 150, 170, 150, 270, 70); c.stroke();
    c.restore();
    c.save(); c.translate(70, 150); c.rotate(-0.35);
    line(c, [0, -30, 22, 26, 0, 14, -22, 26]); c.closePath();
    c.fillStyle = '#2f7cf6'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#fff'; c.stroke(); c.restore();
    rr(c, 150, 182, 68, 42, 12); c.fillStyle = '#2a68d4'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff'; c.font = `700 26px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('280', 184, 204);
  },
  clock(c) {
    circle(c, 128, 128, 102); c.fillStyle = 'rgba(255,214,228,0.5)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
    c.save(); c.translate(128, 128);
    for (let k = 0; k < 60; k++) {
      const a = k * Math.PI / 30, big = k % 5 === 0;
      c.beginPath(); c.moveTo(Math.sin(a) * (big ? 84 : 90), -Math.cos(a) * (big ? 84 : 90)); c.lineTo(Math.sin(a) * 96, -Math.cos(a) * 96);
      c.lineWidth = big ? 4 : 2; c.strokeStyle = 'rgba(120,50,80,0.6)'; c.stroke();
    }
    c.fillStyle = 'rgba(110,40,70,0.75)'; c.font = `500 22px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 1; k <= 12; k++) { const a = k * Math.PI / 6; c.fillText(String(k), Math.sin(a) * 68, -Math.cos(a) * 68); }
    const hand = (a, len, w, col) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(a) * len, -Math.cos(a) * len); c.lineWidth = w; c.lineCap = 'round'; c.strokeStyle = col; c.stroke(); };
    hand((10 + 10 / 60) * Math.PI / 6, 50, 9, '#3c1f2c');
    hand(2 * Math.PI / 12 * 0 + 10 * Math.PI / 30, 76, 6, '#3c1f2c');
    hand(36 * Math.PI / 30, 86, 3, '#ee3a55');
    circle(c, 0, 0, 7); c.fillStyle = '#ee3a55'; c.fill();
    c.restore();
  },
  weather(c) {
    circle(c, 98, 100, 46); c.fillStyle = '#ffc93a'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.93)';
    circle(c, 118, 150, 38); c.fill(); circle(c, 162, 132, 44); c.fill(); circle(c, 200, 160, 30); c.fill();
    rr(c, 84, 150, 146, 44, 22); c.fill();
  },
  news(c) {
    rr(c, 46, 46, 164, 164, 18); c.fillStyle = 'rgba(255,255,255,0.34)'; c.fill();
    c.fillStyle = '#f2617d'; line(c, [70, 196, 70, 64, 104, 64, 104, 196]); c.closePath(); c.fill();
    c.fillStyle = '#ff8aa1'; line(c, [152, 196, 152, 64, 186, 64, 186, 196]); c.closePath(); c.fill();
    c.fillStyle = '#e4405e'; line(c, [104, 64, 186, 196, 152, 196, 70, 64]); c.closePath(); c.fill();
  },
  home(c) {
    c.fillStyle = '#f58f2f'; rr(c, 68, 118, 120, 92, 8); c.fill();
    c.fillStyle = '#f9a843'; line(c, [128, 50, 222, 132, 196, 132, 128, 74, 60, 132, 34, 132]); c.closePath(); c.fill();
    c.lineJoin = 'round'; c.lineWidth = 10; c.strokeStyle = '#f9a843'; c.stroke();
    rr(c, 110, 150, 36, 60, 6); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
  },
  notes(c) {
    c.save(); rr(c, 0, 0, 256, 256, 58); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#f7c948'; c.fillRect(0, 0, 256, 84);
    c.strokeStyle = 'rgba(190,190,200,0.75)'; c.lineWidth = 3;
    for (const y of [124, 158, 192, 226]) { line(c, [26, y, 230, y]); c.stroke(); }
    c.restore();
  },
  stocks(c) {
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    for (const x of [52, 100, 148, 196]) { line(c, [x, 40, x, 216]); c.stroke(); }
    c.strokeStyle = 'rgba(80,170,255,0.9)'; c.lineWidth = 3; line(c, [178, 40, 178, 216]); c.stroke();
    frostStroke(c, 6);
    line(c, [24, 170, 48, 150, 68, 162, 92, 120, 116, 136, 138, 104, 158, 120, 178, 82, 196, 98, 214, 62, 232, 74]); c.stroke();
    circle(c, 178, 82, 9); c.fillStyle = '#4aa8ff'; c.fill();
  },
  reminders(c) {
    const cols = ['#ff9500', '#2f7cf6', '#34c759'];
    [72, 128, 184].forEach((y, i) => {
      circle(c, 60, y, 17); c.fillStyle = cols[i]; c.fill();
      frostStroke(c, 6); line(c, [94, y, 220, y]); c.stroke();
    });
  },
  tv(c) {
    const g = c.createLinearGradient(40, 60, 216, 178);
    g.addColorStop(0, '#39d08b'); g.addColorStop(0.5, '#3aa6f2'); g.addColorStop(1, '#a35ff0');
    rr(c, 38, 58, 180, 120, 14); c.fillStyle = g; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
    frostStroke(c, 6); c.stroke();
    line(c, [96, 204, 160, 204]); c.lineWidth = 10; c.stroke();
  },
  appstore(c) {
    c.strokeStyle = 'rgba(255,214,226,0.95)'; c.lineWidth = 15; c.lineCap = 'round';
    line(c, [110, 66, 178, 192]); c.stroke();
    line(c, [146, 66, 78, 192]); c.stroke();
    line(c, [60, 160, 196, 160]); c.stroke();
  },
  itunes(c) {
    c.save(); c.translate(128, 134);
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? 36 : 82; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.shadowColor = 'rgba(200,140,255,0.9)'; c.shadowBlur = 24;
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = '#c98ef5'; c.stroke(); c.restore();
  },
  ibooks(c) {
    c.fillStyle = 'rgba(228,240,255,0.88)'; c.strokeStyle = '#8fb8e8'; c.lineWidth = 5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(128, 84); c.quadraticCurveTo(84, 62, 40, 72); c.lineTo(40, 184); c.quadraticCurveTo(84, 176, 128, 196); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(128, 84); c.quadraticCurveTo(172, 62, 216, 72); c.lineTo(216, 184); c.quadraticCurveTo(172, 176, 128, 196); c.closePath(); c.fill(); c.stroke();
  },
  health(c) {
    c.beginPath(); c.moveTo(128, 206);
    c.bezierCurveTo(60, 160, 34, 122, 50, 88); c.bezierCurveTo(66, 56, 112, 54, 128, 92);
    c.bezierCurveTo(144, 54, 190, 56, 206, 88); c.bezierCurveTo(222, 122, 196, 160, 128, 206);
    c.fillStyle = '#ff3b5c'; c.fill();
  },
  wallet(c) {
    rr(c, 40, 62, 176, 140, 20); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill(); frostStroke(c, 5); c.stroke();
    [['#34c759', 76], ['#ffcc00', 96], ['#ff9500', 116]].forEach(([col, y]) => { rr(c, 54, y, 148, 30, 8); c.fillStyle = col; c.fill(); });
    c.beginPath(); c.moveTo(40, 140); c.lineTo(100, 140); c.quadraticCurveTo(128, 170, 156, 140); c.lineTo(216, 140); c.lineTo(216, 182); c.quadraticCurveTo(216, 202, 196, 202); c.lineTo(60, 202); c.quadraticCurveTo(40, 202, 40, 182); c.closePath();
    c.fillStyle = 'rgba(225,225,232,0.92)'; c.fill();
  },
  settings(c) {
    c.save(); c.translate(128, 128);
    c.beginPath();
    for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2, tooth = Math.cos(a * 24) > 0.15; c.lineTo(Math.cos(a) * (tooth ? 100 : 86), Math.sin(a) * (tooth ? 100 : 86)); }
    c.closePath(); c.fillStyle = 'rgba(150,152,160,0.9)'; c.fill();
    c.globalCompositeOperation = 'destination-out'; circle(c, 0, 0, 66); c.fill(); c.globalCompositeOperation = 'source-over';
    c.lineWidth = 8; c.strokeStyle = 'rgba(150,152,160,0.9)'; circle(c, 0, 0, 52); c.stroke();
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 - Math.PI / 2; line(c, [0, 0, Math.cos(a) * 52, Math.sin(a) * 52]); c.stroke(); }
    circle(c, 0, 0, 14); c.fillStyle = 'rgba(150,152,160,0.95)'; c.fill();
    c.restore();
  },
  phone(c) {
    c.save(); c.translate(26, 26); c.scale(8.6, 8.6);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill(new Path2D('M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z'));
    c.restore();
  },
  safari(c) {
    const g = c.createLinearGradient(128, 30, 128, 226); g.addColorStop(0, '#3fc0ff'); g.addColorStop(1, '#1868e6');
    circle(c, 128, 128, 98); c.fillStyle = g; c.fill();
    c.save(); c.translate(128, 128);
    for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36, big = k % 9 === 0; c.beginPath(); c.moveTo(Math.cos(a) * (big ? 74 : 80), Math.sin(a) * (big ? 74 : 80)); c.lineTo(Math.cos(a) * 88, Math.sin(a) * 88); c.lineWidth = big ? 3 : 2; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); }
    c.rotate(Math.PI / 4);
    c.fillStyle = '#ff3b30'; line(c, [0, -78, 14, 0, -14, 0]); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; line(c, [0, 78, 14, 0, -14, 0]); c.closePath(); c.fill();
    c.restore();
  },
  messages(c) {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.ellipse(128, 118, 94, 74, 0, 0, Math.PI * 2); c.fill();
    line(c, [74, 168, 56, 214, 112, 184]); c.closePath(); c.fill();
  },
  music(c) {
    const g = c.createLinearGradient(128, 50, 128, 210); g.addColorStop(0, '#ff3f68'); g.addColorStop(1, '#5a6af2');
    c.fillStyle = g; c.strokeStyle = g;
    c.beginPath(); c.ellipse(84, 186, 28, 21, -0.35, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(176, 166, 28, 21, -0.35, 0, Math.PI * 2); c.fill();
    c.lineWidth = 12; line(c, [106, 182, 106, 72]); c.stroke(); line(c, [198, 162, 198, 52]); c.stroke();
    line(c, [100, 70, 204, 48, 204, 82, 100, 104]); c.closePath(); c.fill();
  },
};

export function drawAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL * ATLAS_COLS; cv.height = CELL * ATLAS_ROWS;
  const c = cv.getContext('2d');
  for (const a of APPS) {
    const draw = G[a.id];
    if (!draw) continue;
    c.save();
    c.translate((a.cell % ATLAS_COLS) * CELL + 8, Math.floor(a.cell / ATLAS_COLS) * CELL + 8);
    c.scale(240 / 256, 240 / 256);
    draw(c);
    c.restore();
  }
  return cv;
}

// 螢幕 UI 疊層：名稱與頁面點（狀態列、瀏海由手機本身提供），解析度 = 螢幕 × pixelRatio
// labels = [{ label, x, y }]（目前顯示中的圖示位置）
export function drawOverlay(L, labels, pixelRatio) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(L.W * pixelRatio); cv.height = Math.round(L.H * pixelRatio);
  const c = cv.getContext('2d');
  c.scale(pixelRatio, pixelRatio);
  const X = (x) => x + L.W / 2, Y = (y) => L.H / 2 - y;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `400 ${12 * L.s}px ${FONT}`;
  c.fillStyle = '#fff';
  // 淺色桌布上也要看得清楚：先一層寬而淡的暗暈，再一層貼字的陰影
  for (const [col, blur] of [['rgba(0,0,0,0.35)', 6], ['rgba(0,0,0,0.55)', 2]]) {
    c.shadowColor = col; c.shadowBlur = blur * L.s; c.shadowOffsetY = 0.5 * L.s;
    for (const a of labels) if (a.label) c.fillText(a.label, X(a.x), Y(a.y - LABEL_DY * L.s));
  }
  c.shadowBlur = 2 * L.s;
  for (let i = 0; i < 5; i++) {
    circle(c, X((-32 + i * 16) * L.s), Y(L.dotsY), 3.4 * L.s);
    c.fillStyle = i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'; c.fill();
  }
  return cv;
}
