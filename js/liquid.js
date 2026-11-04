// 液態融合：找出靠得夠近的玻璃，讓它們在著色器裡用同一個平滑聯集（smooth union）。
// 每塊玻璃只畫離自己最近的那一半（交界線兩邊算出來的表面相同，所以看不到接縫）。
export const MAXN = 6;

// shapes：{ x, y, hx, hy, noMerge, stacked, mk }；k = 平滑聯集的半徑（mk = 這塊要用更大的半徑，分裂中的小泡用）。
// 回傳每塊玻璃的鄰居索引（近的優先）
export function mergeLists(shapes, k) {
  const lists = shapes.map(() => []);
  for (let i = 0; i < shapes.length; i++) {
    const a = shapes[i];
    if (a.noMerge) continue;
    for (let j = i + 1; j < shapes.length; j++) {
      const b = shapes[j];
      if (b.noMerge || (a.stacked && b.tray) || (b.stacked && a.tray)) continue;   // 放在托盤上的圖示不算融合
      const gap = Math.hypot(Math.max(Math.abs(a.x - b.x) - a.hx - b.hx, 0), Math.max(Math.abs(a.y - b.y) - a.hy - b.hy, 0));
      if (gap >= Math.max(k, a.mk || 0, b.mk || 0)) continue;
      lists[i].push({ j, gap });
      lists[j].push({ j: i, gap });
    }
  }
  return lists.map((l) => l.sort((p, q) => p.gap - q.gap).slice(0, MAXN).map((n) => n.j));
}
